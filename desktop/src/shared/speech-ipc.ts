import type { SpeechCapabilities, SpeechTranscriptionSession } from "@generated/backend";

export const speechIpcChannels = {
  speechCreateTranscriptionSession: "speech:create-transcription-session",
  speechReadCapabilities: "speech:read-capabilities",
} as const;

export interface SpeechIpcContract {
  speechCreateTranscriptionSession: {
    args: [];
    result: SpeechTranscriptionSession;
  };
  speechReadCapabilities: {
    args: [];
    result: SpeechCapabilities;
  };
}
