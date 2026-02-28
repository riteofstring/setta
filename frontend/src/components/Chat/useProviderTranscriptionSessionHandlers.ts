import type { TranscriptionSessionDeltaResponse } from "utils/generatedTypes";

export function requireTranscriptionSessionDelta(
  response: TranscriptionSessionDeltaResponse | null,
): TranscriptionSessionDeltaResponse {
  if (!response) {
    throw new Error("Provider transcription failed.");
  }
  return response;
}
