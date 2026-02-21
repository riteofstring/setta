import { describe, expect, it } from "vitest";
import { buildLLMConfigGroups } from "./llmConfigUtils";

const ALL_LLM_CONFIGS = {
  configs: {
    "openai-keyless": {
      id: "openai-keyless",
      model: "gpt-4o-mini",
      provider: "openai",
      base_url: null,
      api_key_env: null,
      other_params: null,
      mcpServerIds: [],
      temporary: false,
    },
    "openai-keyed": {
      id: "openai-keyed",
      model: "gpt-4o-transcribe",
      provider: "openai",
      base_url: null,
      api_key_env: "OPENAI_API_KEY",
      other_params: null,
      mcpServerIds: [],
      temporary: false,
    },
  },
  mcpServers: {},
  defaultMcpServerIds: [],
  default_config_id: null,
};

describe("buildLLMConfigGroups", () => {
  it("filters missing API key configs by default", () => {
    const groups = buildLLMConfigGroups(ALL_LLM_CONFIGS, {});

    const ids = groups.flatMap((group) => group.items.map((item) => item.id));
    expect(ids).toEqual(["openai-keyless"]);
  });

  it("includes missing API key configs when requested", () => {
    const groups = buildLLMConfigGroups(ALL_LLM_CONFIGS, {}, {
      includeConfigsWithoutApiKey: true,
    });

    const ids = groups.flatMap((group) => group.items.map((item) => item.id));
    expect(ids).toEqual(["openai-keyless", "openai-keyed"]);
  });
});
