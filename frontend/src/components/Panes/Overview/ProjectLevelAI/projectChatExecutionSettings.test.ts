import {
  buildChatSlashCommands,
  buildCustomPromptSlashCommandDefinitions,
} from "components/Chat/chatComposerControls";
import { shouldShowPlanModeBadge } from "components/Chat/planModeBadgeUtils";
import {
  createAgentRun,
  createAssistantChatMessage,
  createMessageTextContent,
  createToolCall,
  createToolCallFunction,
  createToolChatMessage,
  createUserChatMessage,
  EngineTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildProjectChatHydrationCacheKey,
  buildProjectChatSubmittedMessageHistory,
  clearProjectChatHydrationCacheEntriesForChat,
  getDefaultProjectChatPermissionMode,
  getProjectChatBlockedReasonMessage,
  PROJECT_CHAT_HYDRATION_MAX_ATTEMPTS,
  resolveProjectChatComposerNativeSlashCommandTokens,
  resolveProjectChatComposerSlashCommandSets,
  resolveProjectChatContextTelemetry,
  resolveProjectChatHydrationRetryDecision,
  resolveProjectChatHydrationRetryDelayMs,
  resolveProjectChatProviderDictationTranscribeEnabled,
  resolveProjectChatRuntimeActivityDetails,
  resolveWorkspaceRootPollDelayMs,
  shouldSkipProjectChatHydration,
  trimProjectChatHydrationCache,
} from "./ProjectChatCore";
import {
  resolveProjectChatHydrationAuthority,
  resolveProjectChatRunTypeForEngine,
} from "./projectChatHydrationAuthority";
import {
  buildReservedSlashCommandTokens,
  collectAgentNativeSlashCommandTokensFromEntries,
  reconcileCustomSlashCommands,
  resolveAgentNativeSlashCommandsByEngineId,
} from "./projectChatSkillsMcpViewerUtils";

describe("getDefaultProjectChatPermissionMode", () => {
  it("defaults external engines to config_toml_custom", () => {
    // External engines should preserve the configured approval policy by default.
    expect(
      getDefaultProjectChatPermissionMode(EngineTypeEnum.external_agent),
    ).toBe("config_toml_custom");
  });

  it("defaults managed engines to minimal", () => {
    // Managed LLM engines should keep the standard minimal execution default.
    expect(getDefaultProjectChatPermissionMode(EngineTypeEnum.setta_llm)).toBe(
      "minimal",
    );
    expect(getDefaultProjectChatPermissionMode(null)).toBe("minimal");
  });
});

describe("resolveProjectChatComposerNativeSlashCommandTokens", () => {
  it("fail-closes startup command reconciliation with persisted native tokens", () => {
    expect(
      resolveProjectChatComposerNativeSlashCommandTokens({
        runtimeNativeSlashCommandTokens: ["/status"],
        persistedNativeSlashCommandTokens: ["/deploy", "/status"],
        agentRunsAuthorityState: "loading",
      }),
    ).toEqual(["/deploy", "/status"]);
  });

  it("uses authoritative runtime native tokens after runs finish loading", () => {
    expect(
      resolveProjectChatComposerNativeSlashCommandTokens({
        runtimeNativeSlashCommandTokens: ["/status"],
        persistedNativeSlashCommandTokens: ["/deploy", "/status"],
        agentRunsAuthorityState: "ready",
      }),
    ).toEqual(["/status"]);
  });

  it("keeps persisted native tokens fail-closed after terminal load failure", () => {
    expect(
      resolveProjectChatComposerNativeSlashCommandTokens({
        runtimeNativeSlashCommandTokens: [],
        persistedNativeSlashCommandTokens: ["/deploy", "/status"],
        agentRunsAuthorityState: "terminal_error",
      }),
    ).toEqual(["/deploy", "/status"]);
  });

  it("ignores runtime-only native tokens until agent-run authority is ready", () => {
    expect(
      resolveProjectChatComposerNativeSlashCommandTokens({
        runtimeNativeSlashCommandTokens: ["/deploy"],
        persistedNativeSlashCommandTokens: ["/status"],
        agentRunsAuthorityState: "loading",
      }),
    ).toEqual(["/status"]);
  });

  it("keeps conflicting custom commands non-executable during startup hydration", () => {
    const startupNativeTokens =
      resolveProjectChatComposerNativeSlashCommandTokens({
        runtimeNativeSlashCommandTokens: [],
        persistedNativeSlashCommandTokens: ["/deploy"],
        agentRunsAuthorityState: "loading",
      });
    const customCommands = buildCustomPromptSlashCommandDefinitions([
      { command: "/deploy", prompt: "Deploy app." },
      { command: "/project-status", prompt: "Summarize project status." },
    ]);
    const reservedTokens = buildReservedSlashCommandTokens({
      managedCommands: buildChatSlashCommands({
        model: true,
        permissions: true,
        search: true,
        appGenerationModes: true,
      }),
      engineCommandGroups: [],
      discoveredNativeSlashCommands: startupNativeTokens,
    });
    const reconciled = reconcileCustomSlashCommands({
      customCommands,
      reservedTokens,
    });

    expect(Array.from(reconciled.conflictingCommandTokens)).toContain(
      "/deploy",
    );
    expect(reconciled.executableCommands.map((entry) => entry.command)).toEqual(
      ["/project-status"],
    );
  });

  it("stops reserving stale commands from removed engines once runtime authority is ready", () => {
    const runtimeNativeSlashCommandTokens =
      collectAgentNativeSlashCommandTokensFromEntries(
        resolveAgentNativeSlashCommandsByEngineId({
          runs: [
            createAgentRun({
              id: "run-live",
              inputs: {
                projectConfigId: "project-a",
              },
              outputs: {
                metadata: {
                  engineConfigId: "engine-live",
                  agentNativeSlashCommands: ["/status"],
                },
              },
            }),
            createAgentRun({
              id: "run-removed",
              inputs: {
                projectConfigId: "project-a",
              },
              outputs: {
                metadata: {
                  engineConfigId: "engine-removed",
                  agentNativeSlashCommands: ["/deploy"],
                },
              },
            }),
          ],
          projectConfigId: "project-a",
          engineConfigIds: ["engine-live"],
        }),
      );
    const discoveredAgentNativeSlashCommands =
      resolveProjectChatComposerNativeSlashCommandTokens({
        runtimeNativeSlashCommandTokens,
        persistedNativeSlashCommandTokens: ["/deploy"],
        agentRunsAuthorityState: "ready",
      });
    const resolved = resolveProjectChatComposerSlashCommandSets({
      customProjectChatSlashCommands: [
        {
          command: "/deploy",
          prompt: "Ship the current build.",
        },
      ],
      discoveredAgentNativeSlashCommands,
      showPermissionExecutionControl: true,
      showSearchExecutionControl: true,
    });

    expect(
      resolved.slashCommands.some((entry) => entry.command === "/deploy"),
    ).toBe(true);
    expect(
      resolved.recognizedSlashCommands.some(
        (entry) => entry.command === "/deploy",
      ),
    ).toBe(true);
  });
});

describe("resolveProjectChatComposerSlashCommandSets", () => {
  it("keeps managed commands recognizable when execution controls are unavailable", () => {
    const resolved = resolveProjectChatComposerSlashCommandSets({
      customProjectChatSlashCommands: [],
      discoveredAgentNativeSlashCommands: [],
      showPermissionExecutionControl: false,
      showSearchExecutionControl: false,
    });

    expect(
      resolved.slashCommands.some((entry) => entry.command === "/permissions"),
    ).toBe(false);
    expect(
      resolved.recognizedSlashCommands.some(
        (entry) => entry.command === "/permissions",
      ),
    ).toBe(true);
  });

  it("keeps colliding custom commands recognizable while excluding them from execution", () => {
    const resolved = resolveProjectChatComposerSlashCommandSets({
      customProjectChatSlashCommands: [
        {
          command: "/deploy",
          prompt: "Ship the current build.",
        },
      ],
      discoveredAgentNativeSlashCommands: ["/deploy"],
      showPermissionExecutionControl: true,
      showSearchExecutionControl: true,
    });

    expect(
      resolved.slashCommands.some((entry) => entry.command === "/deploy"),
    ).toBe(false);
    expect(
      resolved.recognizedSlashCommands.some(
        (entry) => entry.command === "/deploy",
      ),
    ).toBe(true);
  });
});

describe("getProjectChatBlockedReasonMessage", () => {
  it("returns deterministic blocked copy for each hydration error code", () => {
    expect(getProjectChatBlockedReasonMessage("chat_not_found")).toContain(
      "not found during hydration",
    );
    expect(
      getProjectChatBlockedReasonMessage("chat_provenance_missing"),
    ).toContain("missing provenance metadata");
    expect(
      getProjectChatBlockedReasonMessage("engine_config_missing"),
    ).toContain("saved engine config is no longer available");
    expect(
      getProjectChatBlockedReasonMessage("engine_type_mismatch"),
    ).toContain("saved engine type no longer matches");
    expect(getProjectChatBlockedReasonMessage("llm_config_missing")).toContain(
      "saved LLM config is unavailable",
    );
    expect(
      getProjectChatBlockedReasonMessage("terminal_hydration_failure"),
    ).toContain("terminal hydration error");
  });
});

describe("resolveWorkspaceRootPollDelayMs", () => {
  it("keeps fast polling before stability threshold", () => {
    expect(resolveWorkspaceRootPollDelayMs(0)).toBe(5000);
    expect(resolveWorkspaceRootPollDelayMs(1)).toBe(5000);
  });

  it("backs off polling once the root is stable", () => {
    expect(resolveWorkspaceRootPollDelayMs(2)).toBe(30000);
    expect(resolveWorkspaceRootPollDelayMs(5)).toBe(30000);
  });
});

describe("resolveProjectChatProviderDictationTranscribeEnabled", () => {
  it("returns true when provider support is available", () => {
    expect(
      resolveProjectChatProviderDictationTranscribeEnabled({
        providerDictationAvailable: true,
      }),
    ).toBe(true);
  });

  it("returns false when provider support is unavailable", () => {
    expect(
      resolveProjectChatProviderDictationTranscribeEnabled({
        providerDictationAvailable: false,
      }),
    ).toBe(false);
  });
});

describe("resolveProjectChatHydrationAuthority", () => {
  const engineConfigById = new Map([
    [
      "engine-external",
      {
        id: "engine-external",
        name: "External Engine",
        engineType: EngineTypeEnum.external_agent,
        externalAgentConfigId: "external-config",
        settaLlmConfigId: null,
      },
    ],
    [
      "engine-llm",
      {
        id: "engine-llm",
        name: "LLM Engine",
        engineType: EngineTypeEnum.setta_llm,
        externalAgentConfigId: null,
        settaLlmConfigId: "llm-config",
      },
    ],
  ]);

  it("returns ready authority with selected run type when provenance is compatible", () => {
    expect(
      resolveProjectChatHydrationAuthority({
        chatId: "chat-1",
        selectedScopedChatProvenance: {
          status: "ready",
          provenance: {
            runType: "external_agent",
            engineConfigId: "engine-external",
          },
        },
        chatProvenanceAuthoritative: true,
        engineConfigById,
        engineConfigsAuthoritative: true,
        engineType: EngineTypeEnum.setta_llm,
      }),
    ).toEqual({
      status: "ready",
      hydrationRunType: "external_agent",
      blockedErrorCode: null,
    });
  });

  it("returns unknown while selected thread provenance is non-authoritative", () => {
    expect(
      resolveProjectChatHydrationAuthority({
        chatId: "chat-1",
        selectedScopedChatProvenance: {
          status: "missing",
        },
        chatProvenanceAuthoritative: false,
        engineConfigById,
        engineConfigsAuthoritative: true,
        engineType: EngineTypeEnum.setta_llm,
      }),
    ).toEqual({
      status: "unknown",
      hydrationRunType: null,
      blockedErrorCode: null,
    });
  });

  it("returns ready authority with warning when selected thread has authoritative missing provenance", () => {
    expect(
      resolveProjectChatHydrationAuthority({
        chatId: "chat-1",
        selectedScopedChatProvenance: {
          status: "missing",
        },
        chatProvenanceAuthoritative: true,
        engineConfigById,
        engineConfigsAuthoritative: true,
        engineType: EngineTypeEnum.setta_llm,
      }),
    ).toEqual({
      status: "ready",
      hydrationRunType: "llm_chat",
      blockedErrorCode: "chat_provenance_missing",
    });
  });

  it("returns unknown while selected thread engine configs are non-authoritative", () => {
    expect(
      resolveProjectChatHydrationAuthority({
        chatId: "chat-1",
        selectedScopedChatProvenance: {
          status: "ready",
          provenance: {
            runType: "llm_chat",
            engineConfigId: "engine-missing",
          },
        },
        chatProvenanceAuthoritative: true,
        engineConfigById,
        engineConfigsAuthoritative: false,
        engineType: EngineTypeEnum.setta_llm,
      }),
    ).toEqual({
      status: "unknown",
      hydrationRunType: null,
      blockedErrorCode: null,
    });
  });

  it("returns ready authority with warning when selected thread engine configs are authoritative and missing", () => {
    expect(
      resolveProjectChatHydrationAuthority({
        chatId: "chat-1",
        selectedScopedChatProvenance: {
          status: "ready",
          provenance: {
            runType: "llm_chat",
            engineConfigId: "engine-missing",
          },
        },
        chatProvenanceAuthoritative: true,
        engineConfigById,
        engineConfigsAuthoritative: true,
        engineType: EngineTypeEnum.setta_llm,
      }),
    ).toEqual({
      status: "ready",
      hydrationRunType: "llm_chat",
      blockedErrorCode: "engine_config_missing",
    });
  });

  it("returns ready authority for draft chats using current engine type", () => {
    expect(
      resolveProjectChatHydrationAuthority({
        chatId: null,
        selectedScopedChatProvenance: {
          status: "missing",
        },
        chatProvenanceAuthoritative: true,
        engineConfigById,
        engineConfigsAuthoritative: true,
        engineType: EngineTypeEnum.setta_llm,
      }),
    ).toEqual({
      status: "ready",
      hydrationRunType: "llm_chat",
      blockedErrorCode: null,
    });

    expect(
      resolveProjectChatHydrationAuthority({
        chatId: undefined,
        selectedScopedChatProvenance: {
          status: "missing",
        },
        chatProvenanceAuthoritative: true,
        engineConfigById,
        engineConfigsAuthoritative: true,
        engineType: null,
      }),
    ).toEqual({
      status: "ready",
      hydrationRunType: null,
      blockedErrorCode: null,
    });
  });
});

describe("resolveProjectChatRunTypeForEngine", () => {
  it("maps engine type to authoritative chat run type", () => {
    expect(
      resolveProjectChatRunTypeForEngine(EngineTypeEnum.external_agent),
    ).toBe("external_agent");
    expect(resolveProjectChatRunTypeForEngine(EngineTypeEnum.setta_llm)).toBe(
      "llm_chat",
    );
    expect(resolveProjectChatRunTypeForEngine(null)).toBeNull();
  });
});

describe("buildProjectChatHydrationCacheKey", () => {
  it("includes chat id, run provenance, and metadata revision", () => {
    expect(
      buildProjectChatHydrationCacheKey({
        chatId: "chat-1",
        hydrationRunType: "external_agent",
        hydrationMetadataRevision: "rev-1",
      }),
    ).toBe("chat-1:external_agent:rev-1");
    expect(
      buildProjectChatHydrationCacheKey({
        chatId: "chat-1",
        hydrationRunType: "llm_chat",
        hydrationMetadataRevision: "rev-2",
      }),
    ).toBe("chat-1:llm_chat:rev-2");
  });

  it("returns null for missing cache dimensions", () => {
    expect(
      buildProjectChatHydrationCacheKey({
        chatId: null,
        hydrationRunType: "llm_chat",
        hydrationMetadataRevision: "rev-1",
      }),
    ).toBeNull();
    expect(
      buildProjectChatHydrationCacheKey({
        chatId: "chat-1",
        hydrationRunType: null,
        hydrationMetadataRevision: "rev-1",
      }),
    ).toBeNull();
    expect(
      buildProjectChatHydrationCacheKey({
        chatId: "chat-1",
        hydrationRunType: "llm_chat",
        hydrationMetadataRevision: "",
      }),
    ).toBeNull();
  });
});

describe("hydration cache lifecycle helpers", () => {
  it("clears stale entries for the selected chat while preserving the active key", () => {
    const cache = {
      "chat-a:llm_chat:rev-1": {
        status: "terminal_failure",
        timerId: null,
        attempt: 1,
        lastTouchedAt: 1,
      },
      "chat-a:llm_chat:rev-2": {
        status: "in_flight",
        timerId: null,
        attempt: 2,
        lastTouchedAt: 2,
      },
      "chat-b:llm_chat:rev-1": {
        status: "succeeded",
        timerId: null,
        attempt: 0,
        lastTouchedAt: 3,
      },
    };
    expect(
      clearProjectChatHydrationCacheEntriesForChat({
        cache,
        chatId: "chat-a",
        keepCacheKey: "chat-a:llm_chat:rev-2",
      }),
    ).toEqual(["chat-a:llm_chat:rev-1"]);
  });

  it("trims least-recently-touched entries when cache size exceeds a bound", () => {
    const cache = {
      "chat-a:llm_chat:rev-1": {
        status: "succeeded",
        timerId: null,
        attempt: 0,
        lastTouchedAt: 10,
      },
      "chat-b:llm_chat:rev-1": {
        status: "failed",
        timerId: null,
        attempt: 1,
        lastTouchedAt: 20,
      },
      "chat-c:llm_chat:rev-1": {
        status: "terminal_failure",
        timerId: null,
        attempt: 1,
        lastTouchedAt: 30,
      },
    };
    expect(
      trimProjectChatHydrationCache({
        cache,
        maxEntries: 2,
      }),
    ).toEqual(["chat-a:llm_chat:rev-1"]);
  });
});

describe("shouldSkipProjectChatHydration", () => {
  it("skips when hydration is in flight or succeeded", () => {
    expect(
      shouldSkipProjectChatHydration({
        status: "in_flight",
        hasLiveRetryTimer: false,
      }),
    ).toBe(true);
    expect(
      shouldSkipProjectChatHydration({
        status: "succeeded",
        hasLiveRetryTimer: false,
      }),
    ).toBe(true);
  });

  it("only skips retry_scheduled when a live retry timer exists", () => {
    expect(
      shouldSkipProjectChatHydration({
        status: "retry_scheduled",
        hasLiveRetryTimer: true,
      }),
    ).toBe(true);
    expect(
      shouldSkipProjectChatHydration({
        status: "retry_scheduled",
        hasLiveRetryTimer: false,
      }),
    ).toBe(false);
  });

  it("allows hydration when there is no prior status or previous failure", () => {
    expect(shouldSkipProjectChatHydration(null)).toBe(false);
    expect(
      shouldSkipProjectChatHydration({
        status: "failed",
        hasLiveRetryTimer: false,
      }),
    ).toBe(false);
  });

  it("skips hydration permanently after terminal failures", () => {
    expect(
      shouldSkipProjectChatHydration({
        status: "terminal_failure",
        hasLiveRetryTimer: false,
      }),
    ).toBe(true);
  });
});

describe("resolveProjectChatHydrationRetryDelayMs", () => {
  it("uses exponential backoff from the base delay", () => {
    expect(resolveProjectChatHydrationRetryDelayMs(1)).toBe(1000);
    expect(resolveProjectChatHydrationRetryDelayMs(2)).toBe(2000);
    expect(resolveProjectChatHydrationRetryDelayMs(3)).toBe(4000);
  });

  it("caps delay at the configured max", () => {
    expect(resolveProjectChatHydrationRetryDelayMs(6)).toBe(30000);
    expect(resolveProjectChatHydrationRetryDelayMs(10)).toBe(30000);
  });
});

describe("resolveProjectChatHydrationRetryDecision", () => {
  it("returns terminal failure for terminal outcomes", () => {
    expect(
      resolveProjectChatHydrationRetryDecision({
        outcomeType: "terminal_failure",
        attempt: 0,
      }),
    ).toEqual({
      type: "terminal_failure",
    });
  });

  it("schedules transient retries with incremented attempt metadata", () => {
    expect(
      resolveProjectChatHydrationRetryDecision({
        outcomeType: "transient_failure",
        attempt: 0,
      }),
    ).toEqual({
      type: "transient_retry",
      nextAttempt: 1,
      delayMs: 1000,
    });
  });

  it("stops retrying after the max-attempt guard", () => {
    expect(
      resolveProjectChatHydrationRetryDecision({
        outcomeType: "transient_failure",
        attempt: PROJECT_CHAT_HYDRATION_MAX_ATTEMPTS,
      }),
    ).toEqual({
      type: "transient_exhausted",
      nextAttempt: PROJECT_CHAT_HYDRATION_MAX_ATTEMPTS + 1,
    });
  });

  it("returns success without retry metadata when hydration succeeds", () => {
    expect(
      resolveProjectChatHydrationRetryDecision({
        outcomeType: "success",
        attempt: 2,
      }),
    ).toEqual({
      type: "success",
    });
  });
});

describe("resolveProjectChatContextTelemetry", () => {
  it("returns backend context values directly", () => {
    const telemetry = resolveProjectChatContextTelemetry({
      contextWindowTokens: 200,
      contextUsedTokens: 150,
      estimated: true,
    });

    expect(telemetry).toEqual({
      contextWindowTokens: 200,
      contextUsedTokens: 150,
      contextUsageIsEstimated: true,
      contextUsageUnavailable: false,
    });
  });

  it("marks context usage unavailable without frontend estimates", () => {
    const telemetry = resolveProjectChatContextTelemetry(null);

    expect(telemetry).toEqual({
      contextWindowTokens: null,
      contextUsedTokens: null,
      contextUsageIsEstimated: false,
      contextUsageUnavailable: true,
    });
  });

  it("marks context usage unavailable when backend omits either field", () => {
    const telemetry = resolveProjectChatContextTelemetry({
      contextWindowTokens: 4000,
      contextUsedTokens: null,
      estimated: false,
    });

    expect(telemetry).toEqual({
      contextWindowTokens: 4000,
      contextUsedTokens: null,
      contextUsageIsEstimated: false,
      contextUsageUnavailable: true,
    });
  });
});

describe("project chat plan badge runtime policy", () => {
  it("shows plan badge when the effective permission mode keeps config policy", () => {
    const permissionMode = getDefaultProjectChatPermissionMode(
      EngineTypeEnum.external_agent,
    );
    expect(
      shouldShowPlanModeBadge({
        engineType: EngineTypeEnum.external_agent,
        externalAgentToolType: "claude_code",
        approvalPolicy: "plan",
        permissionMode,
      }),
    ).toBe(true);
  });

  it("hides plan badge when permission mode overrides plan policy", () => {
    expect(
      shouldShowPlanModeBadge({
        engineType: EngineTypeEnum.external_agent,
        externalAgentToolType: "claude_code",
        approvalPolicy: "plan",
        permissionMode: "minimal",
      }),
    ).toBe(false);
  });
});

describe("resolveProjectChatRuntimeActivityDetails count derivation", () => {
  it("counts unresolved streaming terminal and subagent calls from details", () => {
    const details = resolveProjectChatRuntimeActivityDetails({
      waitingForResponse: true,
      messages: [
        createUserChatMessage({
          content: [createMessageTextContent({ text: "Do work" })],
        }),
        createAssistantChatMessage({
          id: "assistant-streaming",
          tool_calls: [
            createToolCall({
              id: "tool-command",
              function: createToolCallFunction({
                name: "command_execution",
                arguments: {},
              }),
            }),
            createToolCall({
              id: "tool-subagent",
              function: createToolCallFunction({
                name: "mcp__setta__run_agent_profile",
                arguments: {},
              }),
            }),
            createToolCall({
              id: "tool-other",
              function: createToolCallFunction({
                name: "mcp__workspace__read_file",
                arguments: {},
              }),
            }),
          ],
        }),
      ],
    });

    expect(details.activeBackgroundTerminals).toHaveLength(1);
    expect(details.activeSubagents).toHaveLength(1);
  });

  it("ignores completed tool calls and idle runs", () => {
    const messages = [
      createAssistantChatMessage({
        id: "assistant-streaming",
        tool_calls: [
          createToolCall({
            id: "tool-command",
            function: createToolCallFunction({
              name: "command_execution",
              arguments: {},
            }),
          }),
          createToolCall({
            id: "tool-subagent",
            function: createToolCallFunction({
              name: "mcp__setta__run_agent_profile",
              arguments: {},
            }),
          }),
        ],
      }),
      createToolChatMessage({
        tool_call_id: "tool-command",
      }),
      createToolChatMessage({
        tool_call_id: "tool-subagent",
      }),
    ];

    const waitingDetails = resolveProjectChatRuntimeActivityDetails({
      waitingForResponse: true,
      messages,
    });
    expect(waitingDetails.activeBackgroundTerminals).toHaveLength(0);
    expect(waitingDetails.activeSubagents).toHaveLength(0);
    const idleDetails = resolveProjectChatRuntimeActivityDetails({
      waitingForResponse: false,
      messages,
    });
    expect(idleDetails.activeBackgroundTerminals).toHaveLength(0);
    expect(idleDetails.activeSubagents).toHaveLength(0);
  });

  it("does not infer activity from unknown tool-name suffixes", () => {
    const details = resolveProjectChatRuntimeActivityDetails({
      waitingForResponse: true,
      messages: [
        createAssistantChatMessage({
          id: "assistant-streaming",
          tool_calls: [
            createToolCall({
              id: "tool-custom-command",
              function: createToolCallFunction({
                name: "custom_namespace__command_execution",
                arguments: {},
              }),
            }),
            createToolCall({
              id: "tool-custom-subagent",
              function: createToolCallFunction({
                name: "custom_namespace__run_sub_agent",
                arguments: {},
              }),
            }),
          ],
        }),
      ],
    });

    expect(details.activeBackgroundTerminals).toHaveLength(0);
    expect(details.activeSubagents).toHaveLength(0);
  });
});

describe("resolveProjectChatRuntimeActivityDetails", () => {
  it("returns list entries for unresolved terminal and subagent tool calls", () => {
    const details = resolveProjectChatRuntimeActivityDetails({
      waitingForResponse: true,
      messages: [
        createAssistantChatMessage({
          id: "assistant-streaming",
          tool_calls: [
            createToolCall({
              id: "tool-command",
              function: createToolCallFunction({
                name: "command_execution",
                arguments: { command: "pnpm test" },
              }),
            }),
            createToolCall({
              id: "tool-subagent",
              function: createToolCallFunction({
                name: "mcp__setta__run_agent_profile",
                arguments: { profileId: "research_profile" },
              }),
            }),
          ],
        }),
      ],
    });

    expect(details).toEqual({
      activeBackgroundTerminals: [
        {
          id: "tool-command",
          label: "pnpm test",
          toolName: "command_execution",
        },
      ],
      activeSubagents: [
        {
          id: "tool-subagent",
          label: "research_profile",
          toolName: "setta__run_agent_profile",
        },
      ],
    });
  });

  it("falls back to tool name and id labels when command/profile metadata is missing", () => {
    const details = resolveProjectChatRuntimeActivityDetails({
      waitingForResponse: true,
      messages: [
        createAssistantChatMessage({
          id: "assistant-streaming",
          tool_calls: [
            createToolCall({
              id: "tool-command",
              function: createToolCallFunction({
                name: "command_execution",
                arguments: {},
              }),
            }),
            createToolCall({
              id: "tool-subagent",
              function: createToolCallFunction({
                name: "run_sub_agent",
                arguments: {},
              }),
            }),
          ],
        }),
      ],
    });

    expect(details).toEqual({
      activeBackgroundTerminals: [
        {
          id: "tool-command",
          label: "command_execution (tool-command)",
          toolName: "command_execution",
        },
      ],
      activeSubagents: [
        {
          id: "tool-subagent",
          label: "run_sub_agent (tool-subagent)",
          toolName: "run_sub_agent",
        },
      ],
    });
  });
});

describe("buildProjectChatSubmittedMessageHistory", () => {
  it("collects user prompts in recency order across project conversations", () => {
    // The newest active composer conversation should be searched first, then
    // latest runs per chat sorted by last update time.
    const prompts = buildProjectChatSubmittedMessageHistory({
      projectConfigId: "project-a",
      activeMessages: [
        createUserChatMessage({
          id: "active-older",
          content: [createMessageTextContent({ text: "Older current prompt" })],
        }),
        createUserChatMessage({
          id: "active-newest",
          content: [
            createMessageTextContent({ text: "Draft in current chat" }),
          ],
        }),
      ],
      runs: [
        createAgentRun({
          id: "run-chat-1-old",
          startedAt: "2025-01-01T00:00:00Z",
          inputs: {
            runType: "llm_chat",
            chatId: "chat-1",
            projectConfigId: "project-a",
            sectionId: null,
          },
          outputs: {
            messages: [
              createUserChatMessage({
                content: [createMessageTextContent({ text: "Stale prompt" })],
              }),
            ],
          },
        }),
        createAgentRun({
          id: "run-chat-1-new",
          startedAt: "2025-01-03T00:00:00Z",
          inputs: {
            runType: "llm_chat",
            chatId: "chat-1",
            projectConfigId: "project-a",
            sectionId: null,
          },
          outputs: {
            messages: [
              createUserChatMessage({
                content: [createMessageTextContent({ text: "Prompt A" })],
              }),
              createUserChatMessage({
                content: [createMessageTextContent({ text: "Prompt B" })],
              }),
            ],
          },
        }),
        createAgentRun({
          id: "run-chat-2",
          startedAt: "2025-01-02T00:00:00Z",
          inputs: {
            runType: "external_agent",
            chatId: "chat-2",
            projectConfigId: "project-a",
            sectionId: null,
          },
          outputs: {
            messages: [
              createUserChatMessage({
                content: [createMessageTextContent({ text: "Prompt C" })],
              }),
            ],
          },
        }),
        createAgentRun({
          id: "run-chat-section",
          startedAt: "2025-01-04T00:00:00Z",
          inputs: {
            runType: "llm_chat",
            chatId: "chat-section",
            projectConfigId: "project-a",
            sectionId: "section-1",
          },
          outputs: {
            messages: [
              createUserChatMessage({
                content: [createMessageTextContent({ text: "Scoped prompt" })],
              }),
            ],
          },
        }),
      ],
    });

    expect(prompts).toEqual([
      "Draft in current chat",
      "Older current prompt",
      "Prompt B",
      "Prompt A",
      "Prompt C",
    ]);
  });

  it("does not include unscoped runs when scoped project runs are absent", () => {
    // Project-level history is strictly scoped to the active project id.
    const prompts = buildProjectChatSubmittedMessageHistory({
      projectConfigId: "project-missing",
      activeMessages: [],
      runs: [
        createAgentRun({
          id: "run-fallback",
          startedAt: "2025-01-01T00:00:00Z",
          inputs: {
            runType: "llm_chat",
            chatId: "chat-fallback",
            projectConfigId: null,
            sectionId: null,
          },
          outputs: {
            messages: [
              createUserChatMessage({
                content: [
                  createMessageTextContent({ text: "Fallback prompt" }),
                ],
              }),
            ],
          },
        }),
      ],
    });

    expect(prompts).toEqual([]);
  });

  it("deduplicates prompts while preserving first-seen ordering", () => {
    // Duplicate prompts from active and run history should only appear once.
    const prompts = buildProjectChatSubmittedMessageHistory({
      projectConfigId: "project-a",
      activeMessages: [
        createUserChatMessage({
          content: [createMessageTextContent({ text: "Repeated prompt" })],
        }),
      ],
      runs: [
        createAgentRun({
          id: "run-duplicate",
          startedAt: "2025-01-01T00:00:00Z",
          inputs: {
            runType: "llm_chat",
            chatId: "chat-1",
            projectConfigId: "project-a",
            sectionId: null,
          },
          outputs: {
            messages: [
              createUserChatMessage({
                content: [
                  createMessageTextContent({ text: "Repeated prompt" }),
                ],
              }),
              createUserChatMessage({
                content: [createMessageTextContent({ text: "Unique prompt" })],
              }),
            ],
          },
        }),
      ],
    });

    expect(prompts).toEqual(["Repeated prompt", "Unique prompt"]);
  });
});
