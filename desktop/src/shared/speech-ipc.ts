import type {
  MasterVoiceSelection,
  NarratorVoiceDefault,
  SpeechProvider,
  SpeechAudio,
  SpeechCapabilities,
  SpeechSynthesisRequest,
  SpeechTranscriptionSession,
  VoiceSelectionRequest,
} from "@generated/backend";

export const speechIpcChannels = {
  speechCancelSynthesis: "speech:cancel-synthesis",
  speechCreateTranscriptionSession: "speech:create-transcription-session",
  speechReadCredentialSettings: "speech:read-credential-settings",
  speechReadCapabilities: "speech:read-capabilities",
  speechReadMasterVoiceSelection: "speech:read-master-voice-selection",
  speechReadNarratorVoiceDefault: "speech:read-narrator-voice-default",
  speechRemoveCredential: "speech:remove-credential",
  speechSaveCredential: "speech:save-credential",
  speechSynthesize: "speech:synthesize",
  speechUpdateMasterVoiceSelection: "speech:update-master-voice-selection",
  speechUpdateNarratorVoiceDefault: "speech:update-narrator-voice-default",
} as const;

type SpeechCredentialCorruptionReason =
  | "unreadable"
  | "invalid_json"
  | "unsupported_schema"
  | "invalid_base64"
  | "decrypt_failed";

export type SpeechCredentialOperation = "read" | "save" | "remove" | "restore";

export type SpeechCredentialSettings =
  | { status: "loading" }
  | { status: "not_configured"; provider: SpeechProvider }
  | { status: "configured"; provider: SpeechProvider }
  | { status: "secure_storage_unavailable"; message: string }
  | { status: "corrupt"; reason: SpeechCredentialCorruptionReason; message: string }
  | { status: "failed"; operation: SpeechCredentialOperation; message: string };

export interface SpeechCredentialSaveRequest {
  apiKey: string;
}

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
  speechReadCredentialSettings: {
    args: [];
    result: SpeechCredentialSettings;
  };
  speechReadMasterVoiceSelection: {
    args: [];
    result: MasterVoiceSelection;
  };
  speechReadNarratorVoiceDefault: {
    args: [];
    result: NarratorVoiceDefault;
  };
  speechRemoveCredential: {
    args: [];
    result: SpeechCredentialSettings;
  };
  speechSaveCredential: {
    args: [request: SpeechCredentialSaveRequest];
    result: SpeechCredentialSettings;
  };
  speechSynthesize: {
    args: [operation: SpeechSynthesisIpcRequest];
    result: SpeechAudio;
  };
  speechUpdateMasterVoiceSelection: {
    args: [request: VoiceSelectionRequest];
    result: MasterVoiceSelection;
  };
  speechUpdateNarratorVoiceDefault: {
    args: [request: VoiceSelectionRequest];
    result: NarratorVoiceDefault;
  };
}

export function decodeSpeechCredentialSettings(value: unknown): SpeechCredentialSettings {
  const record = assertRecord(value, "SpeechCredentialSettings");
  const status = stringField(record, "status", "SpeechCredentialSettings");
  switch (status) {
    case "loading":
      return { status };
    case "not_configured":
    case "configured":
      return {
        provider: decodeSpeechProvider(stringField(record, "provider", "SpeechCredentialSettings")),
        status,
      };
    case "secure_storage_unavailable":
      return {
        message: stringField(record, "message", "SpeechCredentialSettings"),
        status,
      };
    case "corrupt":
      return {
        message: stringField(record, "message", "SpeechCredentialSettings"),
        reason: decodeSpeechCredentialCorruptionReason(
          stringField(record, "reason", "SpeechCredentialSettings"),
        ),
        status,
      };
    case "failed":
      return {
        message: stringField(record, "message", "SpeechCredentialSettings"),
        operation: decodeSpeechCredentialOperation(
          stringField(record, "operation", "SpeechCredentialSettings"),
        ),
        status,
      };
    default:
      throw new Error("SpeechCredentialSettings.status is unsupported: " + status);
  }
}

function decodeSpeechProvider(value: string): SpeechProvider {
  switch (value) {
    case "openai":
      return value;
    default:
      throw new Error("SpeechCredentialSettings.provider is unsupported: " + value);
  }
}

function decodeSpeechCredentialCorruptionReason(value: string): SpeechCredentialCorruptionReason {
  switch (value) {
    case "decrypt_failed":
    case "invalid_base64":
    case "invalid_json":
    case "unreadable":
    case "unsupported_schema":
      return value;
    default:
      throw new Error("SpeechCredentialSettings.reason is unsupported: " + value);
  }
}

function decodeSpeechCredentialOperation(value: string): SpeechCredentialOperation {
  switch (value) {
    case "read":
    case "remove":
    case "restore":
    case "save":
      return value;
    default:
      throw new Error("SpeechCredentialSettings.operation is unsupported: " + value);
  }
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
  return value as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(label + "." + field + " must be a string");
  }
  return value;
}
