import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import type {
  APIKeys,
  AllLLMConfigs,
  LLMConfig,
  TranscriptionProfile,
} from "utils/generatedTypes";

export const DICTATION_MODE_ITEMS: AllItemsType<string> = [
  {
    group: "Dictation Modes",
    items: [
      { id: "auto", name: "Auto" },
      { id: "browser", name: "Browser" },
      { id: "provider", name: "Provider" },
    ],
  },
];

export function supportsProviderRealtimeTranscription(
  llmConfig: LLMConfig,
): boolean {
  const provider = (llmConfig.provider ?? "").trim().toLowerCase();
  if (provider === "openai") {
    return true;
  }
  if (provider) {
    return false;
  }
  return llmConfig.base_url === null;
}

export function resolveProviderDictationAvailability({
  selectedTranscriptionProfile,
  allLLMConfigs,
  apiKeys,
}: {
  selectedTranscriptionProfile: TranscriptionProfile | null;
  allLLMConfigs: AllLLMConfigs | null;
  apiKeys: APIKeys;
}): { providerDictationAvailable: boolean; providerDictationUnavailableReason: string } {
  if (!selectedTranscriptionProfile) {
    return {
      providerDictationAvailable: false,
      providerDictationUnavailableReason:
        "Provider dictation requires a transcription profile.",
    };
  }
  const transcriptionConfigId =
    selectedTranscriptionProfile.transcriptionLlmConfigId?.trim() ?? "";
  if (!transcriptionConfigId) {
    return {
      providerDictationAvailable: false,
      providerDictationUnavailableReason:
        "Selected transcription profile has an invalid transcription config.",
    };
  }
  const llmConfig = allLLMConfigs?.configs?.[transcriptionConfigId];
  if (!llmConfig) {
    return {
      providerDictationAvailable: false,
      providerDictationUnavailableReason:
        "Selected transcription profile has an invalid transcription config.",
    };
  }
  const requiredApiKeyEnv = llmConfig.api_key_env?.trim() ?? "";
  const apiKeyValue = requiredApiKeyEnv
    ? (apiKeys[requiredApiKeyEnv] ?? "").trim()
    : "";
  if (requiredApiKeyEnv && !apiKeyValue) {
    return {
      providerDictationAvailable: false,
      providerDictationUnavailableReason: `Selected transcription profile is missing required API key '${requiredApiKeyEnv}'.`,
    };
  }
  if (
    selectedTranscriptionProfile.transportMode === "realtime" &&
    !supportsProviderRealtimeTranscription(llmConfig)
  ) {
    return {
      providerDictationAvailable: false,
      providerDictationUnavailableReason:
        "Realtime transcription is unavailable for this provider/model.",
    };
  }
  return {
    providerDictationAvailable: true,
    providerDictationUnavailableReason: "Provider dictation is not available.",
  };
}
