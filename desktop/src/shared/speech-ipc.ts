import type {
  CreateSpeechTranscriptionSessionRequest,
  SpeechCapabilities,
  SpeechTranscriptionSession,
} from "@generated/backend";

export const speechIpcChannels = {
  speechCreateTranscriptionSession: "speech:create-transcription-session",
  speechReadCapabilities: "speech:read-capabilities",
} as const;

export interface SpeechIpcContract {
  speechCreateTranscriptionSession: {
    args: [request: CreateSpeechTranscriptionSessionRequest];
    result: SpeechTranscriptionSession;
  };
  speechReadCapabilities: {
    args: [];
    result: SpeechCapabilities;
  };
}
