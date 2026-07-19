import {
  decodeSpeechProvider,
  type MasterVoiceSelection,
  type NarratorVoiceDefault,
  type CreateSpeechTranscriptionSessionRequest,
  type SpeechProvider,
  type SpeechAudio,
  type SpeechCapabilities,
  type SpeechSynthesisRequest,
  type SpeechTranscriptionSession,
  type SpeechVoiceCatalog,
  type VoiceSelectionRequest,
} from "@generated/backend";

export const speechIpcChannels = {
  speechCancelSynthesis: "speech:cancel-synthesis",
  speechCancelLocalMacOSVoiceCapture: "speech:cancel-local-macos-voice-capture",
  speechCreateTranscriptionSession: "speech:create-transcription-session",
  speechFinishLocalMacOSVoiceCapture: "speech:finish-local-macos-voice-capture",
  speechListLocalMacOSVoices: "speech:list-local-macos-voices",
  speechReadLocalMacOSVoiceModelDownload: "speech:read-local-macos-voice-model-download",
  speechReadLocalMacOSVoiceHealth: "speech:read-local-macos-voice-health",
  speechReadCredentialSettings: "speech:read-credential-settings",
  speechReadCapabilities: "speech:read-capabilities",
  speechReadMasterVoiceSelection: "speech:read-master-voice-selection",
  speechReadNarratorVoiceDefault: "speech:read-narrator-voice-default",
  speechReadProviderSelection: "speech:read-provider-selection",
  speechRemoveCredential: "speech:remove-credential",
  speechSaveCredential: "speech:save-credential",
  speechStartLocalMacOSVoiceModelDownload: "speech:start-local-macos-voice-model-download",
  speechStartLocalMacOSVoiceCapture: "speech:start-local-macos-voice-capture",
  speechSynthesize: "speech:synthesize",
  speechUpdateMasterVoiceSelection: "speech:update-master-voice-selection",
  speechUpdateNarratorVoiceDefault: "speech:update-narrator-voice-default",
  speechUpdateProviderSelection: "speech:update-provider-selection",
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

export interface SpeechCredentialProviderRequest {
  provider: SpeechProvider;
}

export interface SpeechCredentialSaveRequest extends SpeechCredentialProviderRequest {
  apiKey: string;
}

export interface SpeechSynthesisIpcRequest {
  operationId: string;
  request: SpeechSynthesisRequest;
}

export interface SpeechProviderSelectionSettings {
  defaultProvider: SpeechProvider;
  provider: SpeechProvider;
  supportedProviders: SpeechProvider[];
}

export interface SpeechProviderSelectionUpdateRequest {
  provider: SpeechProvider;
}

type LocalMacOSVoiceCaptureFailureCode =
  | "duration_limit"
  | "invalid_session"
  | "malformed_event"
  | "microphone_permission_denied"
  | "no_speech"
  | "not_configured"
  | "provider_unavailable"
  | "session_failed"
  | "transcript_too_large"
  | "transcription_failed";

export interface LocalMacOSVoiceCaptureFailure {
  code: LocalMacOSVoiceCaptureFailureCode;
  message: string;
}

export interface LocalMacOSVoiceStartCaptureRequest {
  captureSessionId: string;
  maximumRecordingSeconds: number;
  maximumTranscriptCharacters: number;
}

export interface LocalMacOSVoiceSessionRequest {
  captureSessionId: string;
}

export type LocalMacOSVoiceStartCaptureResult =
  | {
      captureSessionId: string;
      status: "started";
    }
  | {
      failure: LocalMacOSVoiceCaptureFailure;
      status: "failed";
    };

export type LocalMacOSVoiceFinishCaptureResult =
  | {
      captureSessionId: string;
      status: "completed";
      transcript: string;
    }
  | {
      failure: LocalMacOSVoiceCaptureFailure;
      status: "failed";
    };

export type LocalMacOSVoiceCancelCaptureResult =
  | {
      captureSessionId: string;
      status: "canceled";
    }
  | {
      failure: LocalMacOSVoiceCaptureFailure;
      status: "failed";
    };

interface LocalMacOSVoiceHealthBase {
  provider: SpeechProvider;
}

export type LocalMacOSVoiceHealth =
  | (LocalMacOSVoiceHealthBase & {
      helperPath: string;
      modelPath: string;
      modelSHA256: string | null;
      status: "ready";
    })
  | (LocalMacOSVoiceHealthBase & {
      message: string;
      modelPath: string | null;
      status: "missing_model";
    })
  | (LocalMacOSVoiceHealthBase & {
      actualSHA256: string;
      expectedSHA256: string;
      message: string;
      modelPath: string;
      status: "model_hash_mismatch";
    })
  | (LocalMacOSVoiceHealthBase & {
      helperPath: string | null;
      message: string;
      status: "helper_unavailable";
    })
  | (LocalMacOSVoiceHealthBase & {
      message: string;
      status: "microphone_denied";
    })
  | (LocalMacOSVoiceHealthBase & {
      message: string;
      status: "synthesis_unavailable";
    });

interface LocalMacOSVoiceModelDownloadBase {
  bytesTotal: number;
  modelName: string;
  modelPath: string;
  modelSHA256: string;
  provider: SpeechProvider;
}

export type LocalMacOSVoiceModelDownloadStatus =
  | (LocalMacOSVoiceModelDownloadBase & {
      status: "idle";
    })
  | (LocalMacOSVoiceModelDownloadBase & {
      bytesDownloaded: number;
      status: "downloading";
    })
  | (LocalMacOSVoiceModelDownloadBase & {
      status: "ready";
    })
  | (LocalMacOSVoiceModelDownloadBase & {
      bytesDownloaded: number;
      message: string;
      status: "failed";
    })
  | {
      message: string;
      provider: SpeechProvider;
      status: "unavailable";
    };

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
  speechCancelLocalMacOSVoiceCapture: {
    args: [request: LocalMacOSVoiceSessionRequest];
    result: LocalMacOSVoiceCancelCaptureResult;
  };
  speechCreateTranscriptionSession: {
    args: [request: CreateSpeechTranscriptionSessionRequest];
    result: SpeechTranscriptionSession;
  };
  speechFinishLocalMacOSVoiceCapture: {
    args: [request: LocalMacOSVoiceSessionRequest];
    result: LocalMacOSVoiceFinishCaptureResult;
  };
  speechListLocalMacOSVoices: {
    args: [];
    result: SpeechVoiceCatalog;
  };
  speechReadLocalMacOSVoiceModelDownload: {
    args: [];
    result: LocalMacOSVoiceModelDownloadStatus;
  };
  speechReadLocalMacOSVoiceHealth: {
    args: [];
    result: LocalMacOSVoiceHealth;
  };
  speechReadCapabilities: {
    args: [];
    result: SpeechCapabilities;
  };
  speechReadCredentialSettings: {
    args: [request: SpeechCredentialProviderRequest];
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
  speechReadProviderSelection: {
    args: [];
    result: SpeechProviderSelectionSettings;
  };
  speechRemoveCredential: {
    args: [request: SpeechCredentialProviderRequest];
    result: SpeechCredentialSettings;
  };
  speechSaveCredential: {
    args: [request: SpeechCredentialSaveRequest];
    result: SpeechCredentialSettings;
  };
  speechStartLocalMacOSVoiceModelDownload: {
    args: [];
    result: LocalMacOSVoiceModelDownloadStatus;
  };
  speechStartLocalMacOSVoiceCapture: {
    args: [request: LocalMacOSVoiceStartCaptureRequest];
    result: LocalMacOSVoiceStartCaptureResult;
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
  speechUpdateProviderSelection: {
    args: [request: SpeechProviderSelectionUpdateRequest];
    result: SpeechProviderSelectionSettings;
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

export function decodeSpeechCredentialSaveRequest(value: unknown): SpeechCredentialSaveRequest {
  const record = assertRecord(value, "SpeechCredentialSaveRequest");
  assertKnownFields(record, "SpeechCredentialSaveRequest", ["provider", "apiKey"]);
  return {
    provider: decodeSpeechProvider(
      stringField(record, "provider", "SpeechCredentialSaveRequest"),
      "SpeechCredentialSaveRequest.provider",
    ),
    apiKey: stringField(record, "apiKey", "SpeechCredentialSaveRequest"),
  };
}

export function decodeSpeechCredentialProviderRequest(
  value: unknown,
): SpeechCredentialProviderRequest {
  const record = assertRecord(value, "SpeechCredentialProviderRequest");
  assertKnownFields(record, "SpeechCredentialProviderRequest", ["provider"]);
  return {
    provider: decodeSpeechProvider(
      stringField(record, "provider", "SpeechCredentialProviderRequest"),
      "SpeechCredentialProviderRequest.provider",
    ),
  };
}

export function decodeSpeechProviderSelectionSettings(
  value: unknown,
): SpeechProviderSelectionSettings {
  const record = assertRecord(value, "SpeechProviderSelectionSettings");
  assertKnownFields(record, "SpeechProviderSelectionSettings", [
    "defaultProvider",
    "provider",
    "supportedProviders",
  ]);
  const supportedProviders = arrayField(
    record,
    "supportedProviders",
    "SpeechProviderSelectionSettings",
  ).map((item) => decodeSpeechProvider(item, "SpeechProviderSelectionSettings.supportedProviders"));
  return {
    defaultProvider: decodeSpeechProvider(
      stringField(record, "defaultProvider", "SpeechProviderSelectionSettings"),
      "SpeechProviderSelectionSettings.defaultProvider",
    ),
    provider: decodeSpeechProvider(
      stringField(record, "provider", "SpeechProviderSelectionSettings"),
      "SpeechProviderSelectionSettings.provider",
    ),
    supportedProviders,
  };
}

export function decodeSpeechProviderSelectionUpdateRequest(
  value: unknown,
): SpeechProviderSelectionUpdateRequest {
  const record = assertRecord(value, "SpeechProviderSelectionUpdateRequest");
  assertKnownFields(record, "SpeechProviderSelectionUpdateRequest", ["provider"]);
  return {
    provider: decodeSpeechProvider(
      stringField(record, "provider", "SpeechProviderSelectionUpdateRequest"),
      "SpeechProviderSelectionUpdateRequest.provider",
    ),
  };
}

export function decodeLocalMacOSVoiceModelDownloadStatus(
  value: unknown,
): LocalMacOSVoiceModelDownloadStatus {
  const record = assertRecord(value, "LocalMacOSVoiceModelDownloadStatus");
  const status = stringField(record, "status", "LocalMacOSVoiceModelDownloadStatus");
  switch (status) {
    case "idle":
      assertKnownFields(record, "LocalMacOSVoiceModelDownloadStatus", [
        "bytesTotal",
        "modelName",
        "modelPath",
        "modelSHA256",
        "provider",
        "status",
      ]);
      return { ...decodeModelDownloadBase(record), status };
    case "downloading":
      assertKnownFields(record, "LocalMacOSVoiceModelDownloadStatus", [
        "bytesDownloaded",
        "bytesTotal",
        "modelName",
        "modelPath",
        "modelSHA256",
        "provider",
        "status",
      ]);
      return {
        ...decodeModelDownloadBase(record),
        bytesDownloaded: nonNegativeIntegerField(
          record,
          "bytesDownloaded",
          "LocalMacOSVoiceModelDownloadStatus",
        ),
        status,
      };
    case "ready":
      assertKnownFields(record, "LocalMacOSVoiceModelDownloadStatus", [
        "bytesTotal",
        "modelName",
        "modelPath",
        "modelSHA256",
        "provider",
        "status",
      ]);
      return { ...decodeModelDownloadBase(record), status };
    case "failed":
      assertKnownFields(record, "LocalMacOSVoiceModelDownloadStatus", [
        "bytesDownloaded",
        "bytesTotal",
        "message",
        "modelName",
        "modelPath",
        "modelSHA256",
        "provider",
        "status",
      ]);
      return {
        ...decodeModelDownloadBase(record),
        bytesDownloaded: nonNegativeIntegerField(
          record,
          "bytesDownloaded",
          "LocalMacOSVoiceModelDownloadStatus",
        ),
        message: stringField(record, "message", "LocalMacOSVoiceModelDownloadStatus"),
        status,
      };
    case "unavailable":
      assertKnownFields(record, "LocalMacOSVoiceModelDownloadStatus", [
        "message",
        "provider",
        "status",
      ]);
      return {
        message: stringField(record, "message", "LocalMacOSVoiceModelDownloadStatus"),
        provider: decodeSpeechProvider(
          stringField(record, "provider", "LocalMacOSVoiceModelDownloadStatus"),
          "LocalMacOSVoiceModelDownloadStatus.provider",
        ),
        status,
      };
    default:
      throw new Error("LocalMacOSVoiceModelDownloadStatus.status is unsupported: " + status);
  }
}

function decodeModelDownloadBase(
  record: Record<string, unknown>,
): LocalMacOSVoiceModelDownloadBase {
  return {
    bytesTotal: positiveIntegerField(record, "bytesTotal", "LocalMacOSVoiceModelDownloadStatus"),
    modelName: normalizedIdentifierField(record, "modelName", "LocalMacOSVoiceModelDownloadStatus"),
    modelPath: normalizedIdentifierField(record, "modelPath", "LocalMacOSVoiceModelDownloadStatus"),
    modelSHA256: decodeSHA256Field(record, "modelSHA256", "LocalMacOSVoiceModelDownloadStatus"),
    provider: decodeSpeechProvider(
      stringField(record, "provider", "LocalMacOSVoiceModelDownloadStatus"),
      "LocalMacOSVoiceModelDownloadStatus.provider",
    ),
  };
}

export function decodeLocalMacOSVoiceStartCaptureRequest(
  value: unknown,
): LocalMacOSVoiceStartCaptureRequest {
  const record = assertRecord(value, "LocalMacOSVoiceStartCaptureRequest");
  assertKnownFields(record, "LocalMacOSVoiceStartCaptureRequest", [
    "captureSessionId",
    "maximumRecordingSeconds",
    "maximumTranscriptCharacters",
  ]);
  return {
    captureSessionId: normalizedIdentifierField(
      record,
      "captureSessionId",
      "LocalMacOSVoiceStartCaptureRequest",
    ),
    maximumRecordingSeconds: positiveIntegerField(
      record,
      "maximumRecordingSeconds",
      "LocalMacOSVoiceStartCaptureRequest",
    ),
    maximumTranscriptCharacters: positiveIntegerField(
      record,
      "maximumTranscriptCharacters",
      "LocalMacOSVoiceStartCaptureRequest",
    ),
  };
}

export function decodeLocalMacOSVoiceSessionRequest(value: unknown): LocalMacOSVoiceSessionRequest {
  const record = assertRecord(value, "LocalMacOSVoiceSessionRequest");
  assertKnownFields(record, "LocalMacOSVoiceSessionRequest", ["captureSessionId"]);
  return {
    captureSessionId: normalizedIdentifierField(
      record,
      "captureSessionId",
      "LocalMacOSVoiceSessionRequest",
    ),
  };
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

function normalizedIdentifierField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): string {
  const value = stringField(record, field, label);
  if (value.trim() === "" || value.trim() !== value) {
    throw new Error(label + "." + field + " must be non-empty and normalized");
  }
  return value;
}

function positiveIntegerField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(label + "." + field + " must be a positive integer");
  }
  return value;
}

function nonNegativeIntegerField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(label + "." + field + " must be a non-negative integer");
  }
  return value;
}

function decodeSHA256Field(record: Record<string, unknown>, field: string, label: string): string {
  const value = normalizedIdentifierField(record, field, label);
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(label + "." + field + " must be a SHA-256 hex digest");
  }
  return value;
}

function arrayField(record: Record<string, unknown>, field: string, label: string): unknown[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new Error(label + "." + field + " must be an array");
  }
  return value;
}

function assertKnownFields(
  record: Record<string, unknown>,
  label: string,
  fields: readonly string[],
): void {
  const known = new Set(fields);
  for (const field of Object.keys(record)) {
    if (!known.has(field)) {
      throw new Error(label + " contains unknown field " + field);
    }
  }
}
