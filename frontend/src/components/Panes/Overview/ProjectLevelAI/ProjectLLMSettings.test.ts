import { type AllLLMConfigs } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildApiKeyEntries,
  normalizeApiKeyMutationValue,
} from "./ProjectLLMSettings";

function buildConfig({
  id,
  provider,
  apiKeyEnv,
}: {
  id: string;
  provider: string;
  apiKeyEnv: string | null;
}): AllLLMConfigs["configs"][string] {
  return {
    id,
    model: `${provider}-model`,
    provider,
    base_url: null,
    api_key_env: apiKeyEnv,
    other_params: null,
    mcpServerIds: null,
    temporary: false,
  };
}

describe("buildApiKeyEntries", () => {
  it("includes config-referenced keys and manually added keys", () => {
    const allLLMConfigs: AllLLMConfigs = {
      configs: {
        "anthropic-main": buildConfig({
          id: "anthropic-main",
          provider: "anthropic",
          apiKeyEnv: "ANTHROPIC_API_KEY",
        }),
      },
      mcpServers: {},
      defaultMcpServerIds: [],
      default_config_id: null,
    };

    // Manual keys should be listed even when no LLM config references them.
    const entries = buildApiKeyEntries(allLLMConfigs, {
      OPENAI_API_KEY: "openai-secret",
      ANTHROPIC_API_KEY: "anthropic-secret",
    });

    expect(entries.map((entry) => entry.envKey)).toEqual([
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
    ]);
    expect(entries[0]?.configLabels).toEqual(["anthropic-main (anthropic)"]);
    expect(entries[1]?.configLabels).toEqual([]);
  });

  it("returns manual keys when no llm config is present", () => {
    const entries = buildApiKeyEntries(null, {
      GEMINI_API_KEY: "gemini-secret",
    });

    expect(entries).toEqual([
      {
        envKey: "GEMINI_API_KEY",
        configLabels: [],
      },
    ]);
  });
});

describe("normalizeApiKeyMutationValue", () => {
  it("trims values before persistence", () => {
    expect(normalizeApiKeyMutationValue("  secret-value  ")).toBe(
      "secret-value",
    );
  });

  it("returns empty string for whitespace-only values", () => {
    expect(normalizeApiKeyMutationValue("   \n\t  ")).toBe("");
  });
});
