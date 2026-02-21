import { describe, expect, it } from "vitest";
import { LLMConfig } from "utils/generatedTypes";
import {
  isLikelyProviderDictationModel,
  isProviderDictationLikelySupported,
  isProviderDictationUnsupportedError,
  resolveProviderDictationModel,
} from "./providerDictationSupport";

function buildLLMConfig(overrides: Partial<LLMConfig> = {}): LLMConfig {
  return {
    id: "cfg",
    model: "gpt-4.1-mini",
    provider: null,
    base_url: null,
    api_key_env: null,
    other_params: null,
    mcpServerIds: null,
    temporary: false,
    ...overrides,
  };
}

describe("providerDictationSupport", () => {
  it("prefers explicit transcription model overrides", () => {
    const config = buildLLMConfig({
      model: "gpt-4.1-mini",
      other_params: {
        transcriptionModel: "gpt-4o-transcribe",
      },
    });

    expect(resolveProviderDictationModel(config)).toBe("gpt-4o-transcribe");
  });

  it("falls back to the chat model when no override exists", () => {
    const config = buildLLMConfig({
      model: "whisper-1",
      other_params: null,
    });

    expect(resolveProviderDictationModel(config)).toBe("whisper-1");
  });

  it("identifies likely transcription-capable model names", () => {
    expect(isLikelyProviderDictationModel("gpt-4o-transcribe")).toBe(true);
    expect(isLikelyProviderDictationModel("whisper-1")).toBe(true);
    expect(isLikelyProviderDictationModel("speech-to-text-v2")).toBe(true);
    expect(isLikelyProviderDictationModel("gpt-4.1-mini")).toBe(false);
  });

  it("derives provider dictation support from the resolved model", () => {
    const unsupportedConfig = buildLLMConfig({
      model: "claude-sonnet-4-5",
      other_params: null,
    });
    const supportedConfig = buildLLMConfig({
      model: "claude-sonnet-4-5",
      other_params: {
        speech_to_text_model: "whisper-1",
      },
    });

    expect(isProviderDictationLikelySupported(unsupportedConfig)).toBe(false);
    expect(isProviderDictationLikelySupported(supportedConfig)).toBe(true);
  });

  it("flags unsupported transcription provider errors", () => {
    expect(
      isProviderDictationUnsupportedError(
        new Error("Model does not support audio transcription."),
      ),
    ).toBe(true);
    expect(
      isProviderDictationUnsupportedError(
        "Unsupported transcription model for this provider.",
      ),
    ).toBe(true);
    expect(
      isProviderDictationUnsupportedError(
        "Provider transcription failed due to timeout.",
      ),
    ).toBe(false);
  });
});
