import type {
  LocalMacOSVoiceListenerEngineEvent,
  LocalMacOSVoiceListenerPauseReason,
  LocalMacOSVoiceListenerStartCommand,
} from "./local-macos-voice-listener";

export type LocalMacOSVoiceStartListenerRequest = Omit<LocalMacOSVoiceListenerStartCommand, "type">;

export interface LocalMacOSVoiceHelperStartListenerRequest extends LocalMacOSVoiceStartListenerRequest {
  transcriptionModelPath: string;
}

export interface LocalMacOSVoiceStopListenerRequest {
  reason: "setting_disabled" | "shutdown";
}

export interface LocalMacOSVoicePauseListenerRequest {
  reason: LocalMacOSVoiceListenerPauseReason;
}

export interface LocalMacOSVoiceResumeListenerRequest {
  reason: LocalMacOSVoiceListenerPauseReason;
}

export interface LocalMacOSVoiceListenerStarted {
  status: "started";
}

export interface LocalMacOSVoiceListenerStopped {
  status: "stopped";
}

export interface LocalMacOSVoiceListenerPaused {
  status: "paused";
}

export interface LocalMacOSVoiceListenerResumed {
  status: "resumed";
}

export type LocalMacOSVoiceListenerEventHandler = (
  event: LocalMacOSVoiceListenerEngineEvent,
) => void;

export interface HelperListenerEventEnvelope {
  event: LocalMacOSVoiceListenerEngineEvent;
  type: "listener_event";
}

type LocalMacOSVoiceListenerLifecycleStatus = "paused" | "resumed" | "started" | "stopped";

export function decodeListenerLifecycleResult<
  Status extends LocalMacOSVoiceListenerLifecycleStatus,
>(value: unknown, label: string, expectedStatus: Status): { status: Status } {
  const record = assertRecord(value, `LocalMacOSVoiceHelper.${label}`);
  assertKnownFields(record, `LocalMacOSVoiceHelper.${label}`, ["status"]);
  const status = stringField(record, "status", `LocalMacOSVoiceHelper.${label}`);
  if (status !== expectedStatus) {
    throw new Error(`LocalMacOSVoiceHelper.${label}.status is unsupported`);
  }
  return { status: expectedStatus };
}

export function decodeListenerEngineEvent(value: unknown): LocalMacOSVoiceListenerEngineEvent {
  const record = assertRecord(value, "LocalMacOSVoiceHelper.listener_event.event");
  const type = stringField(record, "type", "LocalMacOSVoiceHelper.listener_event.event");
  switch (type) {
    case "listener_armed":
      assertKnownFields(record, "LocalMacOSVoiceHelper.listener_event.listener_armed", ["type"]);
      return { type };
    case "wake_detected":
      assertKnownFields(record, "LocalMacOSVoiceHelper.listener_event.wake_detected", [
        "score",
        "timeMs",
        "type",
      ]);
      return {
        score: numberField(record, "score", "LocalMacOSVoiceHelper.listener_event.wake_detected"),
        timeMs: numberField(record, "timeMs", "LocalMacOSVoiceHelper.listener_event.wake_detected"),
        type,
      };
    case "message_speech_started":
    case "candidate_endpoint_detected":
      assertKnownFields(record, `LocalMacOSVoiceHelper.listener_event.${type}`, ["timeMs", "type"]);
      return {
        timeMs: numberField(record, "timeMs", `LocalMacOSVoiceHelper.listener_event.${type}`),
        type,
      };
    case "utterance_finalized":
      assertKnownFields(record, "LocalMacOSVoiceHelper.listener_event.utterance_finalized", [
        "transcript",
        "type",
      ]);
      return {
        transcript: stringField(
          record,
          "transcript",
          "LocalMacOSVoiceHelper.listener_event.utterance_finalized",
        ),
        type,
      };
    case "microphone_denied":
    case "local_voice_not_ready":
    case "engine_failed":
      assertKnownFields(record, `LocalMacOSVoiceHelper.listener_event.${type}`, [
        "message",
        "type",
      ]);
      return {
        message: stringField(record, "message", `LocalMacOSVoiceHelper.listener_event.${type}`),
        type,
      };
    default:
      throw new Error("LocalMacOSVoiceHelper.listener_event.event.type is unsupported");
  }
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

function numberField(record: Record<string, unknown>, field: string, label: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}.${field} must be a finite number`);
  }
  return value;
}
