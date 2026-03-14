import {
  createAllLLMConfigs,
  createAssistantChatMessage,
  createEngineConfig,
  createExternalAgentPreflightStatus,
  createLLMConfig,
  createToolCall,
  createToolCallFunction,
  EngineTypeEnum,
  ExternalAgentRunModeEnum,
  ExternalAgentSettingsModeEnum,
  ExternalAgentToolTypeEnum,
  TranscriptionTransportModeEnum,
  type AgentProfile,
  type ExternalAgentConfig,
  type TranscriptionProfile,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { resolveManagedChatDerivedState } from "./chatAreaManagedState";

function createAgentProfile(
  overrides: Partial<AgentProfile> = {},
): AgentProfile {
  return {
    id: "agent-1",
    name: "Agent One",
    description: "",
    systemPrompt: "",
    enableBackgroundSummaryFill: false,
    enableLlmChatTitles: false,
    engineConfigId: null,
    toolAllowlist: [],
    memoryScope: null,
    ...overrides,
  };
}

function createTranscriptionProfile(
  overrides: Partial<TranscriptionProfile> = {},
): TranscriptionProfile {
  return {
    id: "transcription-1",
    name: "Transcription One",
    transcriptionLlmConfigId: "llm-1",
    transportMode: TranscriptionTransportModeEnum.auto,
    chunkMs: 1000,
    supportsRealtimeTranscription: false,
    language: null,
    ...overrides,
  };
}

function createExternalAgentConfig(
  overrides: Partial<ExternalAgentConfig> = {},
): ExternalAgentConfig {
  return {
    id: "external-config-1",
    name: "Claude Engine",
    description: "",
    toolType: ExternalAgentToolTypeEnum.claude_code,
    pluginAdapterId: null,
    runMode: ExternalAgentRunModeEnum.sdk,
    commandPath: null,
    baseUrl: null,
    defaultModel: null,
    sandboxPolicy: null,
    approvalPolicy: null,
    settingsMode: ExternalAgentSettingsModeEnum.managed_local,
    settingsSources: null,
    settingsFilePath: null,
    settingsAllowSettaEdits: true,
    settingsManagedBlock: null,
    envVarWhitelist: [],
    workingDirStrategy: "project_root",
    workingDir: null,
    codexSkipGitRepoCheck: null,
    ...overrides,
  };
}

describe("resolveManagedChatDerivedState", () => {
  it("derives llm-backed managed chat state from agent profile ownership", () => {
    const result = resolveManagedChatDerivedState({
      allLLMConfigs: createAllLLMConfigs({
        configs: {
          "llm-1": createLLMConfig({
            id: "llm-1",
            model: "gpt-4o-mini",
            provider: "OpenAI",
            api_key_env: "OPENAI_API_KEY",
          }),
        },
        default_config_id: "llm-1",
      }),
      apiKeys: {
        OPENAI_API_KEY: "secret",
      },
      apiKeysAuthoritative: true,
      agentProfiles: [
        createAgentProfile({
          engineConfigId: "engine-1",
        }),
      ],
      engineConfigs: [
        createEngineConfig({
          id: "engine-1",
          name: "LLM Engine",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "llm-1",
        }),
      ],
      transcriptionProfiles: [
        createTranscriptionProfile({
          transcriptionLlmConfigId: "llm-1",
        }),
      ],
      externalAgentHealth: [],
      externalAgentHealthInitialLoadComplete: true,
      externalAgentConfigs: [],
      engineConfigId: null,
      transcriptionProfileId: "transcription-1",
      agentProfileId: "agent-1",
      permissionMode: "minimal",
      contextUsage: {
        contextWindowTokens: 4096,
        contextUsedTokens: 256,
        estimated: false,
      },
      canUseManagedChat: true,
      messages: [],
      waitingForResponse: false,
    });

    expect(result.effectiveEngineConfigId).toBe("engine-1");
    expect(result.historyCompatibility).toEqual({
      runType: "llm_chat",
      engineConfigId: "engine-1",
    });
    expect(result.isExternalEngine).toBe(false);
    expect(result.providerDictationAvailable).toBe(true);
    expect(result.providerDictationLikelySupported).toBe(true);
    expect(result.hasEngineConfig).toBe(true);
    expect(result.hasLLMConfig).toBe(true);
    expect(result.externalEngineAvailable).toBe(true);
    expect(result.placeholderText).toBe("Type a message...");
    expect(result.editDisabledReason).toBeNull();
    expect(result.showPlanModeBadge).toBe(false);
    expect(result.slashCommands.map((command) => command.action)).toContain(
      "new",
    );
    expect(result.slashCommands.map((command) => command.action)).toContain(
      "resume",
    );
  });

  it("derives external-engine availability, issue messaging, and plan badge state", () => {
    const result = resolveManagedChatDerivedState({
      allLLMConfigs: createAllLLMConfigs(),
      apiKeys: {},
      apiKeysAuthoritative: false,
      agentProfiles: [],
      engineConfigs: [
        createEngineConfig({
          id: "engine-external",
          name: "Claude Engine",
          engineType: EngineTypeEnum.external_agent,
          externalAgentConfigId: "external-config-1",
        }),
      ],
      transcriptionProfiles: [],
      externalAgentHealth: [
        createExternalAgentPreflightStatus({
          configId: "external-config-1",
          name: "Claude Engine",
          toolType: ExternalAgentToolTypeEnum.claude_code,
          runMode: ExternalAgentRunModeEnum.sdk,
          supported: true,
          available: false,
          issues: ["CLI missing"],
        }),
      ],
      externalAgentHealthInitialLoadComplete: true,
      externalAgentConfigs: [
        createExternalAgentConfig({
          id: "external-config-1",
          approvalPolicy: "plan",
        }),
      ],
      engineConfigId: "engine-external",
      transcriptionProfileId: null,
      agentProfileId: null,
      permissionMode: "config_toml_custom",
      contextUsage: null,
      canUseManagedChat: true,
      messages: [],
      waitingForResponse: false,
    });

    expect(result.historyCompatibility).toEqual({
      runType: "external_agent",
      engineConfigId: "engine-external",
    });
    expect(result.isExternalEngine).toBe(true);
    expect(result.externalEngineAvailable).toBe(false);
    expect(result.showPlanModeBadge).toBe(true);
    expect(result.placeholderText).toBe("Type a message...");
    expect(result.externalEngineIssueMessage).toBe(
      'External engine "Claude Engine" unavailable: CLI missing',
    );
    expect(result.isDisabled).toBe(true);
    expect(result.editDisabledReason).toBe("External agent is unavailable.");
  });

  it("filters managed-only slash commands and reports share-policy edit disablement", () => {
    const result = resolveManagedChatDerivedState({
      allLLMConfigs: createAllLLMConfigs(),
      apiKeys: {},
      apiKeysAuthoritative: false,
      agentProfiles: [],
      engineConfigs: [],
      transcriptionProfiles: [],
      externalAgentHealth: [],
      externalAgentHealthInitialLoadComplete: false,
      externalAgentConfigs: [],
      engineConfigId: null,
      transcriptionProfileId: null,
      agentProfileId: null,
      permissionMode: "minimal",
      contextUsage: null,
      canUseManagedChat: false,
      messages: [],
      waitingForResponse: false,
    });

    expect(result.isDisabled).toBe(true);
    expect(result.placeholderText).toBe("Select an engine");
    expect(result.editDisabledReason).toBe("Editing disabled by share policy.");
    expect(result.slashCommands.map((command) => command.action)).not.toContain(
      "new",
    );
    expect(result.slashCommands.map((command) => command.action)).not.toContain(
      "resume",
    );
  });

  it("marks submit disabled when an approval interaction is still pending", () => {
    const pendingApprovalMessage = createAssistantChatMessage({
      tool_calls: [
        createToolCall({
          id: "tool-1",
          function: createToolCallFunction({
            name: "setta.approval",
            arguments: {},
          }),
        }),
      ],
    });

    const result = resolveManagedChatDerivedState({
      allLLMConfigs: createAllLLMConfigs(),
      apiKeys: {},
      apiKeysAuthoritative: false,
      agentProfiles: [],
      engineConfigs: [],
      transcriptionProfiles: [],
      externalAgentHealth: [],
      externalAgentHealthInitialLoadComplete: false,
      externalAgentConfigs: [],
      engineConfigId: null,
      transcriptionProfileId: null,
      agentProfileId: null,
      permissionMode: "minimal",
      contextUsage: null,
      canUseManagedChat: true,
      messages: [pendingApprovalMessage],
      waitingForResponse: false,
    });

    expect(result.submitDisabled).toBe(true);
  });
});
