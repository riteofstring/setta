import { describe, expect, it } from "vitest";
import {
  buildLLMConfigGroups,
  resolveSelectableLLMConfigId,
} from "./llmConfigUtils";

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
  it("treats missing api key maps as empty", () => {
    const groups = buildLLMConfigGroups(ALL_LLM_CONFIGS, undefined);

    const ids = groups.flatMap((group) => group.items.map((item) => item.id));
    expect(ids).toEqual(["openai-keyless"]);
  });

  it("filters missing API key configs by default", () => {
    const groups = buildLLMConfigGroups(ALL_LLM_CONFIGS, {});

    const ids = groups.flatMap((group) => group.items.map((item) => item.id));
    expect(ids).toEqual(["openai-keyless"]);
  });

  it("includes missing API key configs when requested", () => {
    const groups = buildLLMConfigGroups(
      ALL_LLM_CONFIGS,
      {},
      {
        includeConfigsWithoutApiKey: true,
      },
    );

    const ids = groups.flatMap((group) => group.items.map((item) => item.id));
    expect(ids).toEqual(["openai-keyless", "openai-keyed"]);
  });
});

describe("resolveSelectableLLMConfigId", () => {
  it("keeps a selected config id when it is still present in the combobox groups", () => {
    const groups = buildLLMConfigGroups(
      {
        configs: {
          claude: {
            model: "claude-sonnet-4-5",
            provider: "anthropic",
          },
        },
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: "claude",
      },
      {},
    );

    expect(resolveSelectableLLMConfigId(groups, "claude")).toBe("claude");
  });

  it("returns null when the selected config id no longer exists in the available groups", () => {
    const groups = buildLLMConfigGroups(
      {
        configs: {
          openai: {
            model: "gpt-5",
            provider: "openai",
          },
        },
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: "openai",
      },
      {},
    );

    expect(resolveSelectableLLMConfigId(groups, "missing")).toBeNull();
  });
});
