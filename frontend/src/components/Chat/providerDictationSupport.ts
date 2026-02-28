import { LLMConfig } from "utils/generatedTypes";

const TRANSCRIPTION_MODEL_KEYS = [
  "transcriptionModel",
  "transcription_model",
  "speechToTextModel",
  "speech_to_text_model",
] as const;

const PROVIDER_DICTATION_MODEL_PATTERNS = [
  /\bwhisper\b/u,
  /\btranscrib(e|ing|er)?\b/u,
  /\bspeech[-_ ]?to[-_ ]?text\b/u,
  /\bstt\b/u,
];

function readConfiguredTranscriptionModel(llmConfig: LLMConfig): string | null {
  const otherParams = llmConfig.other_params;
  if (
    !otherParams ||
    typeof otherParams !== "object" ||
    Array.isArray(otherParams)
  ) {
    return null;
  }
  for (const key of TRANSCRIPTION_MODEL_KEYS) {
    const value = otherParams[key];
    if (typeof value !== "string") {
      continue;
    }
    const normalized = value.trim();
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return null;
}

export function resolveProviderDictationModel(
  llmConfig: LLMConfig | null,
): string | null {
  if (!llmConfig) {
    return null;
  }
  const configuredModel = readConfiguredTranscriptionModel(llmConfig);
  if (configuredModel) {
    return configuredModel;
  }
  const fallbackModel = llmConfig.model.trim();
  if (fallbackModel.length > 0) {
    return fallbackModel;
  }
  return null;
}

export function isLikelyProviderDictationModel(
  modelName: string | null,
): boolean {
  if (!modelName) {
    return false;
  }
  const normalized = modelName.trim().toLowerCase();
  if (normalized.length === 0) {
    return false;
  }
  return PROVIDER_DICTATION_MODEL_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

export function isProviderDictationLikelySupported(
  llmConfig: LLMConfig | null,
): boolean {
  const modelName = resolveProviderDictationModel(llmConfig);
  return isLikelyProviderDictationModel(modelName);
}
