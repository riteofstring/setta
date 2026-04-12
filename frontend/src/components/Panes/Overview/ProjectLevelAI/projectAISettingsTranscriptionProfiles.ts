import { type TranscriptionProfile } from "utils/generatedTypes";

// The generated frontend surface exposes this as a type-only contract today, but
// the UI needs runtime values for select options and default draft state.
export const TranscriptionTransportModeEnum = {
  auto: "auto",
  file: "file",
  realtime: "realtime",
} as const satisfies Record<
  TranscriptionProfile["transportMode"],
  TranscriptionProfile["transportMode"]
>;

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

const TRANSCRIPTION_CHUNK_MS_DEFAULT = 1200;

export function createTranscriptionProfileDraft(
  transcriptionLlmConfigId: string,
): TranscriptionProfileDraft {
  return {
    name: "",
    transcriptionLlmConfigId,
    transportMode: TranscriptionTransportModeEnum.auto,
    chunkMs: String(TRANSCRIPTION_CHUNK_MS_DEFAULT),
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
    name: draft.name.trim() || "Untitled",
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
  if (transportMode === TranscriptionTransportModeEnum.file) {
    return TRANSCRIPTION_CHUNK_MS_DEFAULT;
  }
  const parsedChunkMs = Number.parseInt(chunkMsInput, 10);
  if (
    !Number.isInteger(parsedChunkMs) ||
    parsedChunkMs < 200 ||
    parsedChunkMs > 10000
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
