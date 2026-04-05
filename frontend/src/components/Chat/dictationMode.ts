import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import type {
  AllConfigs,
  LLMAPIKeysSnapshot,
  TranscriptionProfile,
} from "utils/generatedTypes";

type APIKeys = LLMAPIKeysSnapshot["apiKeys"];

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

export function resolveProviderDictationAvailability({
  selectedTranscriptionProfile,
  allLLMConfigs,
  apiKeys,
  apiKeysAuthoritative,
}: {
  selectedTranscriptionProfile: TranscriptionProfile | null;
  allLLMConfigs: AllConfigs | null;
  apiKeys: APIKeys;
  apiKeysAuthoritative: boolean;
}): {
  providerDictationAvailable: boolean;
  providerDictationUnavailableReason: string;
} {
  if (!apiKeysAuthoritative) {
    return {
      providerDictationAvailable: false,
      providerDictationUnavailableReason:
        "Provider dictation requires an authoritative API key snapshot.",
    };
  }
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
    !selectedTranscriptionProfile.supportsRealtimeTranscription
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
