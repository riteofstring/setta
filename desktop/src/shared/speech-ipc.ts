import type {
  CreateSpeechTranscriptionSessionRequest,
  SpeechAudio,
  SpeechCapabilities,
  SpeechTranscriptionSession,
  SynthesizeEasyRunHighlightRequest,
  SynthesizeEasyRunSummaryRequest,
} from "@generated/backend";

export const speechIpcChannels = {
  speechCreateTranscriptionSession: "speech:create-transcription-session",
  speechReadCapabilities: "speech:read-capabilities",
  speechSynthesizeEasyRunHighlight: "speech:synthesize-easy-run-highlight",
  speechSynthesizeEasyRunSummary: "speech:synthesize-easy-run-summary",
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
  speechSynthesizeEasyRunHighlight: {
    args: [request: SynthesizeEasyRunHighlightRequest];
    result: SpeechAudio;
  };
  speechSynthesizeEasyRunSummary: {
    args: [request: SynthesizeEasyRunSummaryRequest];
    result: SpeechAudio;
  };
}
