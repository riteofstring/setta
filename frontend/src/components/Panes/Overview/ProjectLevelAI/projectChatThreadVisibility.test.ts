import type { BaseChatMessageUnion } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  resolveProjectChatAppGenerationDetailsForSurface,
  resolveProjectChatConversationDataSource,
  resolveProjectChatEngineConfigIdForSelectedChat,
  resolveProjectChatEngineSwitchContinuationAfterContextChange,
  resolveProjectChatEngineSwitchContinuationOnEngineChange,
  resolveProjectChatMessagesForSurface,
  resolveProjectChatSelectedEngineIdAfterEngineConfigsLoad,
  resolveProjectChatSelectedLLMUnavailableReason,
  resolveProjectChatThreadVisibilityFromResize,
  resolveProjectChatWaitingForResponseForSurface,
  shouldProjectChatSkipEngineSyncForContinuation,
} from "./ProjectChat";
import { resolveProjectChatHydrationAuthority } from "./projectChatHydrationAuthority";

describe("resolveProjectChatThreadVisibilityFromResize", () => {
  it("defaults to chat-only on initial narrow layouts", () => {
    // If persisted state still has threads open, narrow layouts should start in chat-only mode.
    expect(
      resolveProjectChatThreadVisibilityFromResize({
        isInitialRun: true,
        wasLargeEnoughForInlineThreads: false,
        isLargeEnoughForInlineThreads: false,
        viewThreads: true,
        explicitlyClosedAtLargeWidth: false,
      }),
    ).toBe(false);
  });

  it("auto-shows threads on initial wide layouts unless manually closed", () => {
    // Wide layouts can restore inline threads by default.
    expect(
      resolveProjectChatThreadVisibilityFromResize({
        isInitialRun: true,
        wasLargeEnoughForInlineThreads: true,
        isLargeEnoughForInlineThreads: true,
        viewThreads: false,
        explicitlyClosedAtLargeWidth: false,
      }),
    ).toBe(true);

    // Manual large-width close preference should block auto-show.
    expect(
      resolveProjectChatThreadVisibilityFromResize({
        isInitialRun: true,
        wasLargeEnoughForInlineThreads: true,
        isLargeEnoughForInlineThreads: true,
        viewThreads: false,
        explicitlyClosedAtLargeWidth: true,
      }),
    ).toBeNull();
  });

  it("hides threads when crossing from large to narrow", () => {
    expect(
      resolveProjectChatThreadVisibilityFromResize({
        isInitialRun: false,
        wasLargeEnoughForInlineThreads: true,
        isLargeEnoughForInlineThreads: false,
        viewThreads: true,
        explicitlyClosedAtLargeWidth: false,
      }),
    ).toBe(false);
  });

  it("shows threads when crossing from narrow to large unless manually closed", () => {
    expect(
      resolveProjectChatThreadVisibilityFromResize({
        isInitialRun: false,
        wasLargeEnoughForInlineThreads: false,
        isLargeEnoughForInlineThreads: true,
        viewThreads: false,
        explicitlyClosedAtLargeWidth: false,
      }),
    ).toBe(true);

    expect(
      resolveProjectChatThreadVisibilityFromResize({
        isInitialRun: false,
        wasLargeEnoughForInlineThreads: false,
        isLargeEnoughForInlineThreads: true,
        viewThreads: false,
        explicitlyClosedAtLargeWidth: true,
      }),
    ).toBeNull();
  });

  it("does nothing when no resize breakpoint transition occurred", () => {
    expect(
      resolveProjectChatThreadVisibilityFromResize({
        isInitialRun: false,
        wasLargeEnoughForInlineThreads: true,
        isLargeEnoughForInlineThreads: true,
        viewThreads: false,
        explicitlyClosedAtLargeWidth: false,
      }),
    ).toBeNull();
  });
});

describe("resolveProjectChatConversationDataSource", () => {
  it("prefers pending state for explicit null chat ids", () => {
    expect(
      resolveProjectChatConversationDataSource({
        chatId: null,
        hasPendingDetails: false,
      }),
    ).toEqual({ kind: "pending" });
  });

  it("uses active state for string chat ids even when pending details exist", () => {
    expect(
      resolveProjectChatConversationDataSource({
        chatId: "chat-1",
        hasPendingDetails: true,
      }),
    ).toEqual({ kind: "active", chatId: "chat-1" });
  });

  it("falls back to pending state when only surface-scoped pending details exist", () => {
    expect(
      resolveProjectChatConversationDataSource({
        chatId: undefined,
        hasPendingDetails: true,
      }),
    ).toEqual({ kind: "pending" });
  });

  it("returns empty when neither a chat id nor pending details exist", () => {
    expect(
      resolveProjectChatConversationDataSource({
        chatId: undefined,
        hasPendingDetails: false,
      }),
    ).toEqual({ kind: "empty" });
  });
});

describe("surface-scoped conversation helpers", () => {
  it("reads pending details for surface-scoped conversations", () => {
    const source = { kind: "pending" } as const;
    expect(
      resolveProjectChatMessagesForSurface({
        source,
        pendingDetails: { messages: [] },
        chatDetails: {},
      }),
    ).toEqual([]);
    expect(
      resolveProjectChatWaitingForResponseForSurface({
        source,
        pendingDetails: { waitingForResponse: true },
        chatDetails: {},
      }),
    ).toBe(true);
  });

  it("reads active details for selected chats", () => {
    const source = { kind: "active", chatId: "chat-1" } as const;
    const messages = [{ id: "message-1" }] as Array<BaseChatMessageUnion>;
    expect(
      resolveProjectChatMessagesForSurface({
        source,
        pendingDetails: null,
        chatDetails: {
          "chat-1": { messages },
        },
      }),
    ).toBe(messages);
    expect(
      resolveProjectChatWaitingForResponseForSurface({
        source,
        pendingDetails: null,
        chatDetails: {
          "chat-1": { waitingForResponse: true },
        },
      }),
    ).toBe(true);
  });

  it("keeps app-generation details aligned with the selected source", () => {
    const pendingSource = { kind: "pending" } as const;
    const activeSource = { kind: "active", chatId: "chat-1" } as const;
    const pendingDetails = {
      activeAppGeneration: null,
      appGenerationByMessageId: { "message-1": { mode: "json_render" } },
    };
    const activeDetails = {
      activeAppGeneration: null,
      appGenerationByMessageId: { "message-2": { mode: "prompt_builder" } },
    };
    expect(
      resolveProjectChatAppGenerationDetailsForSurface({
        source: pendingSource,
        pendingAppGenerationDetails: pendingDetails,
        chatAppGenerationDetailsByChatId: {
          "chat-1": activeDetails,
        },
      }),
    ).toEqual(pendingDetails);
    expect(
      resolveProjectChatAppGenerationDetailsForSurface({
        source: activeSource,
        pendingAppGenerationDetails: pendingDetails,
        chatAppGenerationDetailsByChatId: {
          "chat-1": activeDetails,
        },
      }),
    ).toEqual(activeDetails);
  });
});

describe("resolveProjectChatEngineConfigIdForSelectedChat", () => {
  it("returns null when no chat is selected", () => {
    const resolved = resolveProjectChatEngineConfigIdForSelectedChat({
      chatId: null,
      selectedEngineId: "engine-a",
      availableEngineConfigIds: new Set(["engine-a", "engine-b"]),
      chatEngineConfigByChatId: new Map([["chat-1", "engine-b"]]),
    });
    expect(resolved).toBeNull();
  });

  it("returns null when selected chat has no persisted engine config", () => {
    const resolved = resolveProjectChatEngineConfigIdForSelectedChat({
      chatId: "chat-1",
      selectedEngineId: "engine-a",
      availableEngineConfigIds: new Set(["engine-a", "engine-b"]),
      chatEngineConfigByChatId: new Map([["chat-1", null]]),
    });
    expect(resolved).toBeNull();
  });

  it("returns null when persisted engine config is missing from available configs", () => {
    const resolved = resolveProjectChatEngineConfigIdForSelectedChat({
      chatId: "chat-1",
      selectedEngineId: "engine-a",
      availableEngineConfigIds: new Set(["engine-a"]),
      chatEngineConfigByChatId: new Map([["chat-1", "engine-b"]]),
    });
    expect(resolved).toBeNull();
  });

  it("returns null when the selected engine already matches the chat engine", () => {
    const resolved = resolveProjectChatEngineConfigIdForSelectedChat({
      chatId: "chat-1",
      selectedEngineId: "engine-a",
      availableEngineConfigIds: new Set(["engine-a", "engine-b"]),
      chatEngineConfigByChatId: new Map([["chat-1", "engine-a"]]),
    });
    expect(resolved).toBeNull();
  });

  it("returns the chat's persisted engine when it differs from the selected engine", () => {
    const resolved = resolveProjectChatEngineConfigIdForSelectedChat({
      chatId: "chat-1",
      selectedEngineId: "engine-a",
      availableEngineConfigIds: new Set(["engine-a", "engine-b"]),
      chatEngineConfigByChatId: new Map([["chat-1", "engine-b"]]),
    });
    expect(resolved).toBe("engine-b");
  });
});

describe("resolveProjectChatSelectedEngineIdAfterEngineConfigsLoad", () => {
  it("keeps the selected engine when it still exists", () => {
    const resolved = resolveProjectChatSelectedEngineIdAfterEngineConfigsLoad({
      engineConfigsInitialLoadComplete: true,
      engineConfigs: [
        {
          id: "engine-setta",
          name: "Setta",
          engineType: "setta_llm",
          settaLlmConfigId: "claude",
          externalAgentConfigId: null,
        },
        {
          id: "engine-codex",
          name: "Codex",
          engineType: "external_agent",
          settaLlmConfigId: null,
          externalAgentConfigId: "external-codex",
        },
      ],
      selectedEngineId: "engine-setta",
      preferredEngineId: "engine-codex",
    });
    expect(resolved).toBe("engine-setta");
  });

  it("falls back to preferred engine when the selected engine is missing", () => {
    const resolved = resolveProjectChatSelectedEngineIdAfterEngineConfigsLoad({
      engineConfigsInitialLoadComplete: true,
      engineConfigs: [
        {
          id: "engine-setta",
          name: "Setta",
          engineType: "setta_llm",
          settaLlmConfigId: "claude",
          externalAgentConfigId: null,
        },
      ],
      selectedEngineId: "engine-missing",
      preferredEngineId: "engine-setta",
    });
    expect(resolved).toBe("engine-setta");
  });

  it("returns null when no engine configs are available", () => {
    const resolved = resolveProjectChatSelectedEngineIdAfterEngineConfigsLoad({
      engineConfigsInitialLoadComplete: true,
      engineConfigs: [],
      selectedEngineId: "engine-setta",
      preferredEngineId: null,
    });
    expect(resolved).toBeNull();
  });
});

describe("resolveProjectChatEngineSwitchContinuationOnEngineChange", () => {
  it("returns null when no thread is selected", () => {
    const continuation =
      resolveProjectChatEngineSwitchContinuationOnEngineChange({
        chatId: null,
        nextEngineId: "engine-b",
        chatEngineConfigByChatId: new Map([["chat-1", "engine-a"]]),
      });
    expect(continuation).toBeNull();
  });

  it("returns null when selected thread does not have authoritative engine metadata", () => {
    const continuation =
      resolveProjectChatEngineSwitchContinuationOnEngineChange({
        chatId: "chat-1",
        nextEngineId: "engine-b",
        chatEngineConfigByChatId: new Map([["chat-1", null]]),
      });
    expect(continuation).toBeNull();
  });

  it("returns null when selected thread engine is unchanged", () => {
    const continuation =
      resolveProjectChatEngineSwitchContinuationOnEngineChange({
        chatId: "chat-1",
        nextEngineId: "engine-a",
        chatEngineConfigByChatId: new Map([["chat-1", "engine-a"]]),
      });
    expect(continuation).toBeNull();
  });

  it("returns continuation metadata when switching to a different engine on an existing thread", () => {
    const continuation =
      resolveProjectChatEngineSwitchContinuationOnEngineChange({
        chatId: "chat-1",
        nextEngineId: "engine-b",
        chatEngineConfigByChatId: new Map([["chat-1", "engine-a"]]),
      });
    expect(continuation).toEqual({
      sourceChatId: "chat-1",
      sourceEngineConfigId: "engine-a",
      targetEngineConfigId: "engine-b",
    });
  });
});

describe("resolveProjectChatEngineSwitchContinuationAfterContextChange", () => {
  it("clears continuation when the active thread changes", () => {
    const resolved =
      resolveProjectChatEngineSwitchContinuationAfterContextChange({
        continuation: {
          sourceChatId: "chat-1",
          sourceEngineConfigId: "engine-a",
          targetEngineConfigId: "engine-b",
        },
        chatId: "chat-2",
        selectedEngineId: "engine-b",
      });
    expect(resolved).toBeNull();
  });

  it("clears continuation when the user switches back to the source engine", () => {
    const resolved =
      resolveProjectChatEngineSwitchContinuationAfterContextChange({
        continuation: {
          sourceChatId: "chat-1",
          sourceEngineConfigId: "engine-a",
          targetEngineConfigId: "engine-b",
        },
        chatId: "chat-1",
        selectedEngineId: "engine-a",
      });
    expect(resolved).toBeNull();
  });

  it("preserves continuation while staying on the same thread and target engine", () => {
    const continuation = {
      sourceChatId: "chat-1",
      sourceEngineConfigId: "engine-a",
      targetEngineConfigId: "engine-b",
    } as const;
    const resolved =
      resolveProjectChatEngineSwitchContinuationAfterContextChange({
        continuation,
        chatId: "chat-1",
        selectedEngineId: "engine-b",
      });
    expect(resolved).toEqual(continuation);
  });
});

describe("shouldProjectChatSkipEngineSyncForContinuation", () => {
  it("returns true when continuation owns the currently selected thread", () => {
    const shouldSkip = shouldProjectChatSkipEngineSyncForContinuation({
      continuation: {
        sourceChatId: "chat-1",
        sourceEngineConfigId: "engine-a",
        targetEngineConfigId: "engine-b",
      },
      chatId: "chat-1",
    });
    expect(shouldSkip).toBe(true);
  });

  it("returns false when continuation does not match the selected thread", () => {
    const shouldSkip = shouldProjectChatSkipEngineSyncForContinuation({
      continuation: {
        sourceChatId: "chat-1",
        sourceEngineConfigId: "engine-a",
        targetEngineConfigId: "engine-b",
      },
      chatId: "chat-2",
    });
    expect(shouldSkip).toBe(false);
  });
});

describe("resolveProjectChatSelectedLLMUnavailableReason", () => {
  it("returns missing key guidance when selected LLM requires an absent API key", () => {
    const resolved = resolveProjectChatSelectedLLMUnavailableReason({
      engineType: "setta_llm",
      selectedLLMConfigId: "claude-sonnet",
      allLLMConfigs: {
        configs: {
          "claude-sonnet": {
            id: "claude-sonnet",
            model: "claude-sonnet-4-5-20250929",
            provider: "anthropic",
            api_key_env: "ANTHROPIC_API_KEY",
            base_url: null,
            other_params: null,
            mcpServerIds: [],
            temporary: false,
          },
        },
        default_config_id: "claude-sonnet",
        mcpServers: {},
        defaultMcpServerIds: [],
        codexMcpImportedAt: null,
      },
      availableConfigIds: new Set(),
    });
    expect(resolved).toContain("Missing API key: ANTHROPIC_API_KEY");
  });

  it("returns null when selected LLM config is available", () => {
    const resolved = resolveProjectChatSelectedLLMUnavailableReason({
      engineType: "setta_llm",
      selectedLLMConfigId: "claude-sonnet",
      allLLMConfigs: {
        configs: {
          "claude-sonnet": {
            id: "claude-sonnet",
            model: "claude-sonnet-4-5-20250929",
            provider: "anthropic",
            api_key_env: "ANTHROPIC_API_KEY",
            base_url: null,
            other_params: null,
            mcpServerIds: [],
            temporary: false,
          },
        },
        default_config_id: "claude-sonnet",
        mcpServers: {},
        defaultMcpServerIds: [],
        codexMcpImportedAt: null,
      },
      availableConfigIds: new Set(["claude-sonnet"]),
    });
    expect(resolved).toBeNull();
  });
});

describe("resolveProjectChatHydrationAuthority", () => {
  it("derives the current run type when no chat is selected", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: null,
      selectedScopedChatProvenance: { status: "missing" },
      chatProvenanceAuthoritative: true,
      engineConfigById: new Map(),
      engineConfigsAuthoritative: true,
      engineType: "setta_llm",
    });

    expect(authority).toEqual({
      status: "ready",
      hydrationRunType: "llm_chat",
      blockedErrorCode: null,
    });
  });

  it("surfaces missing selected-chat provenance once authoritative metadata is ready", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-1",
      selectedScopedChatProvenance: { status: "missing" },
      chatProvenanceAuthoritative: true,
      engineConfigById: new Map(),
      engineConfigsAuthoritative: true,
      engineType: "setta_llm",
    });

    expect(authority).toEqual({
      status: "ready",
      hydrationRunType: null,
      blockedErrorCode: "chat_provenance_missing",
    });
  });

  it("keeps the selected run type when provenance exists but lacks engine metadata", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-1",
      selectedScopedChatProvenance: {
        status: "ready",
        provenance: {
          runType: "llm_chat",
          engineConfigId: null,
        },
      },
      chatProvenanceAuthoritative: true,
      engineConfigById: new Map(),
      engineConfigsAuthoritative: true,
      engineType: "setta_llm",
    });

    expect(authority).toEqual({
      status: "ready",
      hydrationRunType: "llm_chat",
      blockedErrorCode: "chat_provenance_missing",
    });
  });

  it("keeps hydration authority unknown when selected provenance is missing and run metadata is non-authoritative", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-1",
      selectedScopedChatProvenance: { status: "missing" },
      chatProvenanceAuthoritative: false,
      engineConfigById: new Map(),
      engineConfigsAuthoritative: true,
      engineType: "setta_llm",
    });

    expect(authority).toEqual({
      status: "unknown",
      hydrationRunType: null,
      blockedErrorCode: null,
    });
  });

  it("keeps hydration authority unknown for ambiguous non-authoritative provenance", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-1",
      selectedScopedChatProvenance: { status: "ambiguous" },
      chatProvenanceAuthoritative: false,
      engineConfigById: new Map(),
      engineConfigsAuthoritative: true,
      engineType: "setta_llm",
    });

    expect(authority).toEqual({
      status: "unknown",
      hydrationRunType: null,
      blockedErrorCode: null,
    });
  });

  it("surfaces ambiguous provenance after authoritative metadata arrives", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-1",
      selectedScopedChatProvenance: { status: "ambiguous" },
      chatProvenanceAuthoritative: true,
      engineConfigById: new Map(),
      engineConfigsAuthoritative: true,
      engineType: "setta_llm",
    });

    expect(authority).toEqual({
      status: "ready",
      hydrationRunType: null,
      blockedErrorCode: "chat_provenance_missing",
    });
  });

  it("stays unknown while engine configs are still non-authoritative", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-1",
      selectedScopedChatProvenance: {
        status: "ready",
        provenance: {
          runType: "llm_chat",
          engineConfigId: "engine-llm",
        },
      },
      chatProvenanceAuthoritative: true,
      engineConfigById: new Map(),
      engineConfigsAuthoritative: false,
      engineType: "setta_llm",
    });

    expect(authority).toEqual({
      status: "unknown",
      hydrationRunType: null,
      blockedErrorCode: null,
    });
  });

  it("surfaces missing persisted engines after authoritative engine config load", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-1",
      selectedScopedChatProvenance: {
        status: "ready",
        provenance: {
          runType: "llm_chat",
          engineConfigId: "engine-llm",
        },
      },
      chatProvenanceAuthoritative: true,
      engineConfigById: new Map(),
      engineConfigsAuthoritative: true,
      engineType: "setta_llm",
    });

    expect(authority).toEqual({
      status: "ready",
      hydrationRunType: "llm_chat",
      blockedErrorCode: "engine_config_missing",
    });
  });

  it("surfaces engine type mismatches while preserving the selected run type", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-1",
      selectedScopedChatProvenance: {
        status: "ready",
        provenance: {
          runType: "llm_chat",
          engineConfigId: "engine-external",
        },
      },
      chatProvenanceAuthoritative: true,
      engineConfigById: new Map([
        [
          "engine-external",
          {
            id: "engine-external",
            name: "External Engine",
            engineType: "external_agent",
            externalAgentConfigId: "ext-config",
            settaLlmConfigId: null,
          },
        ],
      ]),
      engineConfigsAuthoritative: true,
      engineType: "setta_llm",
    });

    expect(authority).toEqual({
      status: "ready",
      hydrationRunType: "llm_chat",
      blockedErrorCode: "engine_type_mismatch",
    });
  });

  it("returns a ready, unblocked authority when selected chat provenance is compatible", () => {
    const authority = resolveProjectChatHydrationAuthority({
      chatId: "chat-1",
      selectedScopedChatProvenance: {
        status: "ready",
        provenance: {
          runType: "llm_chat",
          engineConfigId: "engine-llm",
        },
      },
      chatProvenanceAuthoritative: true,
      engineConfigById: new Map([
        [
          "engine-llm",
          {
            id: "engine-llm",
            name: "LLM Engine",
            engineType: "setta_llm",
            settaLlmConfigId: "primary",
            externalAgentConfigId: null,
          },
        ],
      ]),
      engineConfigsAuthoritative: true,
      engineType: "setta_llm",
    });

    expect(authority).toEqual({
      status: "ready",
      hydrationRunType: "llm_chat",
      blockedErrorCode: null,
    });
  });
});
