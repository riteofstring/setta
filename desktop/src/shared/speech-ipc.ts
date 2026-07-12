import type {
  MasterVoiceSelection,
  SpeechAudio,
  SpeechCapabilities,
  SpeechSynthesisRequest,
  SpeechTranscriptionSession,
  VoiceSelectionRequest,
} from "@generated/backend";

export const speechIpcChannels = {
  speechCancelSynthesis: "speech:cancel-synthesis",
  speechCreateTranscriptionSession: "speech:create-transcription-session",
  speechReadCapabilities: "speech:read-capabilities",
  speechReadMasterVoiceSelection: "speech:read-master-voice-selection",
  speechSynthesize: "speech:synthesize",
  speechUpdateMasterVoiceSelection: "speech:update-master-voice-selection",
} as const;

export interface SpeechSynthesisIpcRequest {
  operationId: string;
  request: SpeechSynthesisRequest;
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
    args: [];
    result: SpeechTranscriptionSession;
  };
  speechReadCapabilities: {
    args: [];
    result: SpeechCapabilities;
  };
  speechReadMasterVoiceSelection: {
    args: [];
    result: MasterVoiceSelection;
  };
  speechSynthesize: {
    args: [operation: SpeechSynthesisIpcRequest];
    result: SpeechAudio;
  };
  speechUpdateMasterVoiceSelection: {
    args: [request: VoiceSelectionRequest];
    result: MasterVoiceSelection;
  };
}
