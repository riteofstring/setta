import type { SpeechVoiceID } from "@generated/backend";

import {
  decodeListenerEngineEvent,
  type HelperListenerEventEnvelope,
} from "./local-macos-voice-helper-listener";
import type {
  LocalMacOSVoiceCaptureStarted,
  LocalMacOSVoiceCatalogResult,
  LocalMacOSVoiceHelperHealthResult,
  LocalMacOSVoiceSynthesisCanceled,
  LocalMacOSVoiceSynthesisResult,
  LocalMacOSVoiceTranscriptionResult,
} from "./local-macos-voice-helper";
import { isCanonicalWAVBase64 } from "./speech-audio-validation";

export interface HelperResponseEnvelope {
  error?: {
    code: string;
    message: string;
  };
  id: string;
  ok: boolean;
  result?: unknown;
  type: "response";
}

export function decodeHelperOutputEnvelope(
  value: unknown,
): HelperResponseEnvelope | HelperListenerEventEnvelope {
  const record = assertRecord(value, "LocalMacOSVoiceHelperOutput");
  const type = stringField(record, "type", "LocalMacOSVoiceHelperOutput");
  switch (type) {
    case "response":
      return decodeHelperResponseRecord(record);
    case "listener_event":
      return decodeHelperListenerEventRecord(record);
    default:
      throw new Error("LocalMacOSVoiceHelperOutput.type is unsupported");
  }
}

export function decodeHealthResult(value: unknown): LocalMacOSVoiceHelperHealthResult {
  const record = assertRecord(value, "LocalMacOSVoiceHelperHealthResult");
  const status = stringField(record, "status", "LocalMacOSVoiceHelperHealthResult");
  switch (status) {
    case "ready":
      assertKnownFields(record, "LocalMacOSVoiceHelperHealthResult", ["status"]);
      return { status };
    case "helper_unavailable":
    case "microphone_denied":
    case "missing_model":
    case "synthesis_unavailable":
      assertKnownFields(record, "LocalMacOSVoiceHelperHealthResult", ["message", "status"]);
      return {
        message: stringField(record, "message", "LocalMacOSVoiceHelperHealthResult"),
        status,
      };
    case "model_hash_mismatch":
      assertKnownFields(record, "LocalMacOSVoiceHelperHealthResult", [
        "actualSHA256",
        "expectedSHA256",
        "message",
        "status",
      ]);
      return {
        actualSHA256: stringField(record, "actualSHA256", "LocalMacOSVoiceHelperHealthResult"),
        expectedSHA256: stringField(record, "expectedSHA256", "LocalMacOSVoiceHelperHealthResult"),
        message: stringField(record, "message", "LocalMacOSVoiceHelperHealthResult"),
        status,
      };
    default:
      throw new Error("LocalMacOSVoiceHelperHealthResult.status is unsupported");
  }
}

export function decodeSessionResult(value: unknown, label: string): LocalMacOSVoiceCaptureStarted {
  const record = assertRecord(value, `LocalMacOSVoiceHelper.${label}`);
  assertKnownFields(record, `LocalMacOSVoiceHelper.${label}`, ["sessionId"]);
  return { sessionId: stringField(record, "sessionId", `LocalMacOSVoiceHelper.${label}`) };
}

export function decodeTranscriptionResult(value: unknown): LocalMacOSVoiceTranscriptionResult {
  const record = assertRecord(value, "LocalMacOSVoiceHelper.finish_capture");
  assertKnownFields(record, "LocalMacOSVoiceHelper.finish_capture", ["sessionId", "transcript"]);
  return {
    sessionId: stringField(record, "sessionId", "LocalMacOSVoiceHelper.finish_capture"),
    transcript: stringField(record, "transcript", "LocalMacOSVoiceHelper.finish_capture"),
  };
}

export function decodeVoiceCatalogResult(value: unknown): LocalMacOSVoiceCatalogResult {
  const record = assertRecord(value, "LocalMacOSVoiceHelper.list_voices");
  assertKnownFields(record, "LocalMacOSVoiceHelper.list_voices", ["version", "voiceIds"]);
  const version = stringField(record, "version", "LocalMacOSVoiceHelper.list_voices");
  const voiceIds = arrayField(record, "voiceIds", "LocalMacOSVoiceHelper.list_voices", (item) =>
    requiredTrimmedString(item, "LocalMacOSVoiceHelper.list_voices.voiceIds item"),
  );
  if (voiceIds.length === 0) {
    throw new Error("LocalMacOSVoiceHelper.list_voices.voiceIds must contain at least one voice");
  }
  const seen = new Set<string>();
  for (const voiceId of voiceIds) {
    if (seen.has(voiceId)) {
      throw new Error(`LocalMacOSVoiceHelper.list_voices repeats voice ${JSON.stringify(voiceId)}`);
    }
    seen.add(voiceId);
  }
  return {
    version: requiredTrimmedString(version, "LocalMacOSVoiceHelper.list_voices.version"),
    voiceIds,
  };
}

export function decodeSynthesisResult(value: unknown): LocalMacOSVoiceSynthesisResult {
  const record = assertRecord(value, "LocalMacOSVoiceHelper.synthesize_speech");
  assertKnownFields(record, "LocalMacOSVoiceHelper.synthesize_speech", [
    "audioBase64",
    "format",
    "mediaType",
    "operationId",
  ]);
  const audioBase64 = stringField(record, "audioBase64", "LocalMacOSVoiceHelper.synthesize_speech");
  const format = stringField(record, "format", "LocalMacOSVoiceHelper.synthesize_speech");
  const mediaType = stringField(record, "mediaType", "LocalMacOSVoiceHelper.synthesize_speech");
  const operationId = requiredTrimmedString(
    stringField(record, "operationId", "LocalMacOSVoiceHelper.synthesize_speech"),
    "LocalMacOSVoiceHelper.synthesize_speech.operationId",
  );
  if (format !== "wav" || mediaType !== "audio/wav" || !isCanonicalWAVBase64(audioBase64)) {
    throw new Error("LocalMacOSVoiceHelper.synthesize_speech audio is invalid");
  }
  return {
    audioBase64,
    format,
    mediaType,
    operationId,
  };
}

export function decodeSynthesisCancelResult(
  value: unknown,
  label: string,
): LocalMacOSVoiceSynthesisCanceled {
  const record = assertRecord(value, `LocalMacOSVoiceHelper.${label}`);
  assertKnownFields(record, `LocalMacOSVoiceHelper.${label}`, ["operationId"]);
  return { operationId: stringField(record, "operationId", `LocalMacOSVoiceHelper.${label}`) };
}

function decodeHelperResponseRecord(record: Record<string, unknown>): HelperResponseEnvelope {
  assertKnownFields(record, "LocalMacOSVoiceHelperResponse", [
    "error",
    "id",
    "ok",
    "result",
    "type",
  ]);
  const type = stringField(record, "type", "LocalMacOSVoiceHelperResponse");
  if (type !== "response") {
    throw new Error("LocalMacOSVoiceHelperResponse.type is unsupported");
  }
  const ok = booleanField(record, "ok", "LocalMacOSVoiceHelperResponse");
  const response: HelperResponseEnvelope = {
    id: stringField(record, "id", "LocalMacOSVoiceHelperResponse"),
    ok,
    type,
  };
  if ("result" in record) {
    response.result = record.result;
  }
  if ("error" in record) {
    response.error = decodeHelperError(record.error);
  }
  return response;
}

function decodeHelperListenerEventRecord(
  record: Record<string, unknown>,
): HelperListenerEventEnvelope {
  assertKnownFields(record, "LocalMacOSVoiceHelperListenerEvent", ["event", "type"]);
  return {
    event: decodeListenerEngineEvent(record.event),
    type: "listener_event",
  };
}

function decodeHelperError(value: unknown): HelperResponseEnvelope["error"] {
  const record = assertRecord(value, "LocalMacOSVoiceHelperError");
  assertKnownFields(record, "LocalMacOSVoiceHelperError", ["code", "message"]);
  return {
    code: stringField(record, "code", "LocalMacOSVoiceHelperError"),
    message: stringField(record, "message", "LocalMacOSVoiceHelperError"),
  };
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertKnownFields(
  record: Record<string, unknown>,
  label: string,
  fields: readonly string[],
): void {
  const known = new Set(fields);
  for (const field of Object.keys(record)) {
    if (!known.has(field)) {
      throw new Error(`${label} contains unknown field ${field}`);
    }
  }
}

function stringField(record: Record<string, unknown>, field: string, label: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new Error(`${label}.${field} must be a string`);
  }
  return value;
}

function arrayField<T>(
  record: Record<string, unknown>,
  field: string,
  label: string,
  decode: (item: unknown) => T,
): T[] {
  const value = record[field];
  if (!Array.isArray(value)) {
    throw new Error(`${label}.${field} must be an array`);
  }
  return value.map(decode);
}

function booleanField(record: Record<string, unknown>, field: string, label: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new Error(`${label}.${field} must be a boolean`);
  }
  return value;
}

function requiredTrimmedString(value: unknown, label: string): SpeechVoiceID {
  if (typeof value !== "string" || value.trim() === "" || value.trim() !== value) {
    throw new Error(`${label} must be a trimmed string`);
  }
  return value;
}
