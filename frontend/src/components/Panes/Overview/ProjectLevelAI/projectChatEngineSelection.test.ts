import { describe, expect, it } from "vitest";

import {
  EngineTypeEnum,
  createAllLLMConfigs,
  createEngineConfig,
  createExternalAgentPreflightStatus,
} from "utils/generatedTypes";
import {
  findPreferredProjectChatEngineId,
  resolveProjectChatSelectedLLMUnavailableReason,
} from "./projectChatEngineSelection";

describe("findPreferredProjectChatEngineId", () => {
  it("prefers a usable Setta engine even when external engines appear first", () => {
    // Project chat should keep defaulting to the first usable Setta engine when one is available.
    const preferredEngineId = findPreferredProjectChatEngineId({
      engineConfigs: [
        createEngineConfig({
          id: "external",
          name: "External",
          engineType: EngineTypeEnum.external_agent,
          externalAgentConfigId: "external-config",
        }),
        createEngineConfig({
          id: "setta",
          name: "Setta",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "claude-sonnet",
        }),
      ],
      allLLMConfigs: createAllLLMConfigs({
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
      }),
      availableConfigIds: new Set(["claude-sonnet"]),
      externalAgentHealth: [
        createExternalAgentPreflightStatus({
          configId: "external-config",
          name: "External",
          toolType: "codex",
          runMode: "app_server",
          available: true,
          supported: true,
        }),
      ],
      externalAgentHealthInitialLoadComplete: true,
    });

    expect(preferredEngineId).toBe("setta");
  });

  it("falls back to a supported external engine when no usable Setta engine remains", () => {
    // External agents should become the preferred default once Setta engines are unavailable.
    const preferredEngineId = findPreferredProjectChatEngineId({
      engineConfigs: [
        createEngineConfig({
          id: "setta-missing-key",
          name: "Setta Missing Key",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "claude-sonnet",
        }),
        createEngineConfig({
          id: "external",
          name: "External",
          engineType: EngineTypeEnum.external_agent,
          externalAgentConfigId: "external-config",
        }),
      ],
      allLLMConfigs: createAllLLMConfigs({
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
      }),
      availableConfigIds: new Set(),
      externalAgentHealth: [
        createExternalAgentPreflightStatus({
          configId: "external-config",
          name: "External",
          toolType: "codex",
          runMode: "app_server",
          available: true,
          supported: true,
        }),
      ],
      externalAgentHealthInitialLoadComplete: true,
    });

    expect(preferredEngineId).toBe("external");
  });

  it("falls back to the first configured engine when no engine is currently usable", () => {
    // The selector still needs a deterministic fallback when every engine is blocked.
    const preferredEngineId = findPreferredProjectChatEngineId({
      engineConfigs: [
        createEngineConfig({
          id: "setta-missing-key",
          name: "Setta Missing Key",
          engineType: EngineTypeEnum.setta_llm,
          settaLlmConfigId: "claude-sonnet",
        }),
        createEngineConfig({
          id: "external-down",
          name: "External Down",
          engineType: EngineTypeEnum.external_agent,
          externalAgentConfigId: "external-config",
        }),
      ],
      allLLMConfigs: createAllLLMConfigs({
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
      }),
      availableConfigIds: new Set(),
      externalAgentHealth: [
        createExternalAgentPreflightStatus({
          configId: "external-config",
          name: "External",
          toolType: "codex",
          runMode: "app_server",
          available: false,
          supported: false,
        }),
      ],
      externalAgentHealthInitialLoadComplete: true,
    });

    expect(preferredEngineId).toBe("setta-missing-key");
  });
});

describe("resolveProjectChatSelectedLLMUnavailableReason", () => {
  it("keeps the missing-key guidance stable after moving the helper", () => {
    // The extracted helper should continue surfacing the same provider-key guidance for the settings UI.
    const unavailableReason = resolveProjectChatSelectedLLMUnavailableReason({
      engineType: EngineTypeEnum.setta_llm,
      selectedLLMConfigId: "claude-sonnet",
      allLLMConfigs: createAllLLMConfigs({
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
      }),
      availableConfigIds: new Set(),
    });

    expect(unavailableReason).toContain("Missing API key: ANTHROPIC_API_KEY");
  });
});
