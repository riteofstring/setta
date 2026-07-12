import type {
  MasterVoiceSelection,
  SpeechCapabilities,
  SpeechTranscriptionSession,
  VoiceSelectionRequest,
} from "@generated/backend";

export const speechIpcChannels = {
  speechCreateTranscriptionSession: "speech:create-transcription-session",
  speechReadCapabilities: "speech:read-capabilities",
  speechReadMasterVoiceSelection: "speech:read-master-voice-selection",
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
  speechUpdateMasterVoiceSelection: {
    args: [request: VoiceSelectionRequest];
    result: MasterVoiceSelection;
  };
}
