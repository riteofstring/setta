import type { AllItemsType } from "components/Utils/Combobox/ComboboxStateReducer";
import type { HttpapiLlmapiKeysSnapshot } from "openapi/http";
import {
  ProjectChatUIConfig,
  type AllConfigs,
  type ChatDictationMode,
  type TranscriptionProfile,
} from "utils/generatedTypes";

type APIKeys = HttpapiLlmapiKeysSnapshot["apiKeys"];
const INVALID_TRANSCRIPTION_CONFIG_REASON =
  "Selected transcription profile has an invalid transcription config.";

export const DICTATION_MODE_ITEMS: AllItemsType<ChatDictationMode> = [
  {
    group: "Dictation Modes",
    items: ProjectChatUIConfig.sectionDictationModeOptions.map((option) => ({
      id: option.value,
      name: option.label,
    })),
  },
];

function unavailableProviderDictation(reason: string): {
  providerDictationAvailable: boolean;
  providerDictationUnavailableReason: string;
} {
  return {
    providerDictationAvailable: false,
    providerDictationUnavailableReason: reason,
  };
}

function resolveTranscriptionConfigId(
  selectedTranscriptionProfile: TranscriptionProfile,
): string {
  return selectedTranscriptionProfile.transcriptionLlmConfigId?.trim() ?? "";
}

function resolveTranscriptionConfig(args: {
  allLLMConfigs: AllConfigs | null;
  selectedTranscriptionProfile: TranscriptionProfile;
}) {
  const transcriptionConfigId = resolveTranscriptionConfigId(
    args.selectedTranscriptionProfile,
  );
  if (!transcriptionConfigId) {
    return null;
  }
  return args.allLLMConfigs?.configs?.[transcriptionConfigId] ?? null;
}

function hasMissingRequiredApiKey(
  apiKeys: APIKeys,
  requiredApiKeyEnv: string,
): boolean {
  if (!requiredApiKeyEnv) {
    return false;
  }
  return (apiKeys[requiredApiKeyEnv] ?? "").trim() === "";
}

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
  // This intentionally mirrors a narrow subset of backend transcription
  // validation so the chat UI can gate provider dictation immediately from the
  // already-hydrated profile/config/api-key snapshot. Go remains authoritative
  // and revalidates the same constraints when profiles are saved or sessions
  // start.
  if (!apiKeysAuthoritative) {
    return unavailableProviderDictation(
      "Provider dictation requires an authoritative API key snapshot.",
    );
  }
  if (!selectedTranscriptionProfile) {
    return unavailableProviderDictation(
      "Provider dictation requires a transcription profile.",
    );
  }
  const llmConfig = resolveTranscriptionConfig({
    allLLMConfigs,
    selectedTranscriptionProfile,
  });
  if (!llmConfig) {
    return unavailableProviderDictation(INVALID_TRANSCRIPTION_CONFIG_REASON);
  }
  const requiredApiKeyEnv = llmConfig.api_key_env?.trim() ?? "";
  if (hasMissingRequiredApiKey(apiKeys, requiredApiKeyEnv)) {
    return unavailableProviderDictation(
      `Selected transcription profile is missing required API key '${requiredApiKeyEnv}'.`,
    );
  }
  if (
    selectedTranscriptionProfile.transportMode === "realtime" &&
    !selectedTranscriptionProfile.supportsRealtimeTranscription
  ) {
    return unavailableProviderDictation(
      "Realtime transcription is unavailable for this provider/model.",
    );
  }
  return {
    providerDictationAvailable: true,
    providerDictationUnavailableReason: "Provider dictation is not available.",
  };
}
