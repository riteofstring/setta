import type {
  MasterVoiceSelection,
  SpeechAudio,
  SpeechCapabilities,
  SpeechSynthesisRequest,
  SpeechTranscriptionSession,
  VoiceSelectionRequest,
} from "@generated/backend";

export const speechIpcChannels = {
  speechCreateTranscriptionSession: "speech:create-transcription-session",
  speechReadCapabilities: "speech:read-capabilities",
  speechReadMasterVoiceSelection: "speech:read-master-voice-selection",
  speechSynthesize: "speech:synthesize",
  speechUpdateMasterVoiceSelection: "speech:update-master-voice-selection",
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
  speechReadMasterVoiceSelection: {
    args: [];
    result: MasterVoiceSelection;
  };
  speechSynthesize: {
    args: [request: SpeechSynthesisRequest];
    result: SpeechAudio;
  };
  speechUpdateMasterVoiceSelection: {
    args: [request: VoiceSelectionRequest];
    result: MasterVoiceSelection;
  };
}
