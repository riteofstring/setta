import {
  createAllLLMConfigs,
  createEngineConfig,
  createLLMConfig,
  EngineTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  findPreferredProjectChatEngineId,
  resolveEffectiveProjectChatEngineId,
} from "./projectChatEngineSelection";

describe("projectChatEngineSelection", () => {
  it("prefers a usable Setta LLM engine over external engines", () => {
    const settaEngine = createEngineConfig({
      id: "engine-setta",
      name: "Setta",
      engineType: EngineTypeEnum.setta_llm,
      settaLlmConfigId: "claude-sonnet",
    });
    const externalEngine = createEngineConfig({
      id: "engine-external",
      name: "External",
      engineType: EngineTypeEnum.external_agent,
      externalAgentConfigId: "ext-1",
    });
    const allLLMConfigs = createAllLLMConfigs({
      configs: {
        "claude-sonnet": createLLMConfig({
          id: "claude-sonnet",
          model: "claude-sonnet-4-5-20250929",
          provider: "anthropic",
          api_key_env: "ANTHROPIC_API_KEY",
        }),
      },
      default_config_id: "claude-sonnet",
      mcpServers: {},
    });

    const preferred = findPreferredProjectChatEngineId(
      [externalEngine, settaEngine],
      {
        allLLMConfigs,
        availableConfigIds: new Set(["claude-sonnet"]),
        externalAgentHealth: [],
        externalAgentHealthInitialLoadComplete: false,
      },
    );

    expect(preferred).toBe("engine-setta");
  });

  it("falls back to an external engine when Setta LLM is not usable", () => {
    const settaEngine = createEngineConfig({
      id: "engine-setta",
      name: "Setta",
      engineType: EngineTypeEnum.setta_llm,
      settaLlmConfigId: "claude-sonnet",
    });
    const externalEngine = createEngineConfig({
      id: "engine-external",
      name: "External",
      engineType: EngineTypeEnum.external_agent,
      externalAgentConfigId: "ext-1",
    });
    const allLLMConfigs = createAllLLMConfigs({
      configs: {
        "claude-sonnet": createLLMConfig({
          id: "claude-sonnet",
          model: "claude-sonnet-4-5-20250929",
          provider: "anthropic",
          api_key_env: "ANTHROPIC_API_KEY",
        }),
      },
      default_config_id: "claude-sonnet",
      mcpServers: {},
    });

    const preferred = findPreferredProjectChatEngineId(
      [settaEngine, externalEngine],
      {
        allLLMConfigs,
        availableConfigIds: new Set(),
        externalAgentHealth: [],
        externalAgentHealthInitialLoadComplete: false,
      },
    );

    expect(preferred).toBe("engine-external");
  });

  it("keeps a valid manual engine selection over the preferred engine", () => {
    const settaEngine = createEngineConfig({
      id: "engine-setta",
      name: "Setta",
      engineType: EngineTypeEnum.setta_llm,
    });
    const externalEngine = createEngineConfig({
      id: "engine-external",
      name: "External",
      engineType: EngineTypeEnum.external_agent,
      externalAgentConfigId: "ext-1",
    });

    const effective = resolveEffectiveProjectChatEngineId(
      [settaEngine, externalEngine],
      "engine-setta",
      "engine-external",
    );

    expect(effective).toBe("engine-external");
  });

  it("drops stale manual selection and returns the preferred engine", () => {
    const settaEngine = createEngineConfig({
      id: "engine-setta",
      name: "Setta",
      engineType: EngineTypeEnum.setta_llm,
    });
    const externalEngine = createEngineConfig({
      id: "engine-external",
      name: "External",
      engineType: EngineTypeEnum.external_agent,
      externalAgentConfigId: "ext-1",
    });

    const effective = resolveEffectiveProjectChatEngineId(
      [settaEngine, externalEngine],
      "engine-setta",
      "missing-engine",
    );

    expect(effective).toBe("engine-setta");
  });
});
