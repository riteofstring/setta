import { describe, expect, it } from "vitest";
import { resolveProviderDictationAvailability } from "./dictationMode";

describe("resolveProviderDictationAvailability", () => {
  it("requires a selected transcription profile", () => {
    const result = resolveProviderDictationAvailability({
      selectedTranscriptionProfile: null,
      allLLMConfigs: null,
      apiKeys: {},
    });

    expect(result.providerDictationAvailable).toBe(false);
    expect(result.providerDictationUnavailableReason).toBe(
      "Provider dictation requires a transcription profile.",
    );
  });

  it("rejects invalid transcription config references", () => {
    const result = resolveProviderDictationAvailability({
      selectedTranscriptionProfile: {
        id: "profile-1",
        name: "Profile",
        transcriptionLlmConfigId: "missing-config",
        transportMode: "file",
        chunkMs: 1200,
        language: null,
      },
      allLLMConfigs: {
        configs: {},
        mcpServers: {},
        defaultMcpServerIds: [],
        default_config_id: null,
      },
      apiKeys: {},
    });

    expect(result.providerDictationAvailable).toBe(false);
    expect(result.providerDictationUnavailableReason).toBe(
      "Selected transcription profile has an invalid transcription config.",
    );
  });

  it("requires API keys declared by the transcription config", () => {
    const result = resolveProviderDictationAvailability({
      selectedTranscriptionProfile: {
        id: "profile-1",
        name: "Profile",
        transcriptionLlmConfigId: "openai-transcribe",
        transportMode: "file",
        chunkMs: 1200,
        language: null,
      },
      allLLMConfigs: {
        configs: {
          "openai-transcribe": {
            id: "openai-transcribe",
            model: "gpt-4o-mini-transcribe",
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
      },
      apiKeys: {},
    });

    expect(result.providerDictationAvailable).toBe(false);
    expect(result.providerDictationUnavailableReason).toBe(
      "Selected transcription profile is missing required API key 'OPENAI_API_KEY'.",
    );
  });

  it("marks provider dictation available when config and key are present", () => {
    const result = resolveProviderDictationAvailability({
      selectedTranscriptionProfile: {
        id: "profile-1",
        name: "Profile",
        transcriptionLlmConfigId: "openai-transcribe",
        transportMode: "file",
        chunkMs: 1200,
        language: null,
      },
      allLLMConfigs: {
        configs: {
          "openai-transcribe": {
            id: "openai-transcribe",
            model: "gpt-4o-mini-transcribe",
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
      },
      apiKeys: { OPENAI_API_KEY: "test-key" },
    });

    expect(result.providerDictationAvailable).toBe(true);
    expect(result.providerDictationUnavailableReason).toBe(
      "Provider dictation is not available.",
    );
  });
});
