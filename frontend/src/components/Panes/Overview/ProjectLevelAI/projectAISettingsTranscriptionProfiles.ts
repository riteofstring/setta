import {
  TranscriptionProfileUIConfig,
  type TranscriptionProfile,
} from "utils/generatedTypes";

type TranscriptionTransportModeValue = TranscriptionProfile["transportMode"];

export type TranscriptionProfileDraft = {
  name: string;
  transcriptionLlmConfigId: string;
  transportMode: TranscriptionTransportModeValue;
  chunkMs: string;
  language: string;
};

type TranscriptionProfileSaveInput = {
  name: string;
  transcriptionLlmConfigId: string;
  transportMode: TranscriptionTransportModeValue;
  chunkMs: number;
  language: string | null;
};

export function createTranscriptionProfileDraft(
  transcriptionLlmConfigId: string,
): TranscriptionProfileDraft {
  return {
    name: "",
    transcriptionLlmConfigId,
    transportMode: TranscriptionProfileUIConfig.defaultTransportMode,
    chunkMs: String(TranscriptionProfileUIConfig.defaultChunkMs),
    language: "",
  };
}

export function buildTranscriptionProfileDraft(
  profile: TranscriptionProfile,
): TranscriptionProfileDraft {
  return {
    name: profile.name ?? "",
    transcriptionLlmConfigId: profile.transcriptionLlmConfigId ?? "",
    transportMode: profile.transportMode,
    chunkMs: String(profile.chunkMs),
    language: profile.language ?? "",
  };
}

export function buildTranscriptionProfileSaveInput(
  draft: TranscriptionProfileDraft,
): TranscriptionProfileSaveInput | null {
  const chunkMs = resolveTranscriptionChunkMsForSave({
    transportMode: draft.transportMode,
    chunkMsInput: draft.chunkMs,
  });
  if (!draft.transcriptionLlmConfigId || chunkMs === null) {
    return null;
  }
  return {
    name: draft.name.trim(),
    transcriptionLlmConfigId: draft.transcriptionLlmConfigId,
    transportMode: draft.transportMode,
    chunkMs,
    language: normalizeOptionalText(draft.language),
  };
}

export function resolveTranscriptionChunkMsForSave({
  transportMode,
  chunkMsInput,
}: {
  transportMode: TranscriptionTransportModeValue;
  chunkMsInput: string;
}): number | null {
  if (transportMode === TranscriptionProfileUIConfig.transportModes.file) {
    return TranscriptionProfileUIConfig.defaultChunkMs;
  }
  const parsedChunkMs = Number.parseInt(chunkMsInput, 10);
  if (
    !Number.isInteger(parsedChunkMs) ||
    parsedChunkMs < TranscriptionProfileUIConfig.minChunkMs ||
    parsedChunkMs > TranscriptionProfileUIConfig.maxChunkMs
  ) {
    return null;
  }
  return parsedChunkMs;
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}
