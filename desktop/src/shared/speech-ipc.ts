import type {
  CreateSpeechTranscriptionSessionRequest,
  SpeechAudio,
  SpeechCapabilities,
  SpeechTranscriptionSession,
  SynthesizeEasyRunHighlightRequest,
  SynthesizeEasyRunSummaryRequest,
} from "@generated/backend";

export const speechIpcChannels = {
  speechCancelSynthesis: "speech:cancel-synthesis",
  speechCreateTranscriptionSession: "speech:create-transcription-session",
  speechReadCapabilities: "speech:read-capabilities",
  speechSynthesizeEasyRunHighlight: "speech:synthesize-easy-run-highlight",
  speechSynthesizeEasyRunSummary: "speech:synthesize-easy-run-summary",
} as const;

export interface SpeechSynthesisIpcRequest<TRequest> {
  operationId: string;
  request: TRequest;
}

export function validateSpeechSynthesisOperationId(operationId: string): void {
  if (!operationId || operationId.trim() !== operationId || operationId.length > 128) {
    throw new Error("Speech synthesis operation ID is invalid.");
  }
}

export interface SpeechIpcContract {
  speechCancelSynthesis: {
    args: [operationId: string];
    result: void;
  };
  speechCreateTranscriptionSession: {
    args: [request: CreateSpeechTranscriptionSessionRequest];
    result: SpeechTranscriptionSession;
  };
  speechReadCapabilities: {
    args: [];
    result: SpeechCapabilities;
  };
  speechSynthesizeEasyRunHighlight: {
    args: [request: SpeechSynthesisIpcRequest<SynthesizeEasyRunHighlightRequest>];
    result: SpeechAudio;
  };
  speechSynthesizeEasyRunSummary: {
    args: [request: SpeechSynthesisIpcRequest<SynthesizeEasyRunSummaryRequest>];
    result: SpeechAudio;
  };
}
