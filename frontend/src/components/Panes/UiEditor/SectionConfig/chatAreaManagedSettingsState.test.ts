import {
  createAllLLMConfigs,
  createEngineConfig,
  EngineTypeEnum,
  type AgentProfile,
  type TranscriptionProfile,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  CHAT_AREA_MODE_ITEMS,
  resolveChatAreaManagedSettingsViewModel,
} from "./chatAreaManagedSettingsState";

describe("chatAreaManagedSettingsState", () => {
  it("uses the selected agent profile engine when the section has no direct engine override", () => {
    const viewModel = resolveChatAreaManagedSettingsViewModel({
      apiKeys: {},
      allLLMConfigs: createAllLLMConfigs({
        configs: {
          "llm-primary": {
            id: "llm-primary",
            name: "Primary",
            provider: "anthropic",
            model: "claude-3-7-sonnet-latest",
          },
        },
        default_config_id: "llm-primary",
      }),
      agentProfiles: [
        {
          id: "agent-1",
          name: "Planner",
          description: "",
          systemPrompt: "",
          enableBackgroundSummaryFill: false,
          enableLlmChatTitles: false,
          engineConfigId: "engine-from-profile",
          toolAllowlist: [],
          memoryScope: null,
        } satisfies AgentProfile,
      ],
      agentProfileId: "agent-1",
      canEditLayout: true,
      canEditParams: true,
      engineConfigId: null,
      engineConfigs: [
        createEngineConfig({
          id: "engine-from-profile",
          name: "Planner Engine",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "llm-primary",
        }),
      ],
      isDeploymentMode: false,
      isFrozen: false,
      transcriptionProfiles: [],
    });

    expect(viewModel.selectedEngineId).toBe("engine-from-profile");
    expect(viewModel.engineType).toBe(EngineTypeEnum.setta_llm);
    expect(viewModel.selectedLLMConfigId).toBe("llm-primary");
    expect(viewModel.showAgentProfileOverrideHint).toBe(true);
  });

  it("marks settings and chat mode as disabled when share mode is read-only", () => {
    const viewModel = resolveChatAreaManagedSettingsViewModel({
      apiKeys: {},
      allLLMConfigs: createAllLLMConfigs({ configs: {} }),
      agentProfiles: [],
      agentProfileId: null,
      canEditLayout: false,
      canEditParams: false,
      engineConfigId: null,
      engineConfigs: [],
      isDeploymentMode: true,
      isFrozen: false,
      transcriptionProfiles: [],
    });

    expect(viewModel.isDisabled).toBe(true);
    expect(viewModel.isChatModeControlDisabled).toBe(true);
    expect(viewModel.configPlaceholder).toBe("Add an LLM config or API key");
  });

  it("keeps both section and project chat mode entries in the shared mode list", () => {
    expect(CHAT_AREA_MODE_ITEMS[0]?.items.map((entry) => entry.id)).toEqual([
      "section_mode",
      "project_ai_mode",
    ]);
  });

  it("builds engine and transcription groups for the managed settings panel", () => {
    const viewModel = resolveChatAreaManagedSettingsViewModel({
      apiKeys: {},
      allLLMConfigs: createAllLLMConfigs({ configs: {} }),
      agentProfiles: [],
      agentProfileId: null,
      canEditLayout: true,
      canEditParams: true,
      engineConfigId: "engine-1",
      engineConfigs: [
        createEngineConfig({
          id: "engine-1",
          name: "External",
          engineType: EngineTypeEnum.external_agent,
        }),
      ],
      isDeploymentMode: false,
      isFrozen: false,
      transcriptionProfiles: [
        {
          id: "transcription-1",
          name: "Provider",
          transcriptionLlmConfigId: "llm-primary",
          transportMode: "auto",
          chunkMs: 1200,
          supportsRealtimeTranscription: false,
          language: null,
        } satisfies TranscriptionProfile,
      ],
    });

    expect(viewModel.engineGroups[0]?.items[0]?.id).toBe("engine-1");
    expect(viewModel.transcriptionProfileGroups[0]?.items[0]?.id).toBe(
      "transcription-1",
    );
  });
});
