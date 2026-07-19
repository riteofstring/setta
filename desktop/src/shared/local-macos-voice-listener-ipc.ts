type LocalMacOSVoiceListenerStatus = (typeof localMacOSVoiceListenerStatuses)[number];

type LocalMacOSVoiceListenerState =
  | {
      status: "disabled";
    }
  | {
      status: "arming";
    }
  | {
      status: "armed";
    }
  | {
      score: number;
      status: "wake_detected";
      wakeDetectedAtMs: number;
    }
  | {
      score: number;
      status: "waiting_for_message_speech";
      wakeDetectedAtMs: number;
    }
  | {
      captureStartedAtMs: number;
      score: number;
      status: "capturing";
      wakeDetectedAtMs: number;
    }
  | {
      candidateEndAtMs: number;
      captureStartedAtMs: number;
      score: number;
      status: "candidate_end";
      wakeDetectedAtMs: number;
    }
  | {
      captureStartedAtMs: number;
      score: number;
      status: "finalizing";
      wakeDetectedAtMs: number;
    }
  | {
      status: "submitting";
      transcript: string;
    }
  | {
      operationId: string;
      resumeState: { status: "arming" } | { status: "armed" };
      status: "paused_for_playback";
    }
  | {
      captureSessionId: string;
      playbackOperationId: string | null;
      resumeState: { status: "arming" } | { status: "armed" };
      status: "paused_for_manual_capture";
    }
  | {
      message: string;
      status: "microphone_denied";
    }
  | {
      message: string;
      status: "local_voice_not_ready";
    }
  | {
      message: string;
      status: "engine_failed";
    };

type LocalMacOSVoiceListenerSetupAction = "download_local_macos_voice_model";

export type LocalMacOSVoiceListenerAvailability =
  | {
      status: "ready";
    }
  | {
      message: string;
      setupAction: LocalMacOSVoiceListenerSetupAction | null;
      status: "unavailable";
    };

export interface LocalMacOSVoiceListenerSettings {
  availability: LocalMacOSVoiceListenerAvailability;
  enabled: boolean;
  state: LocalMacOSVoiceListenerState;
}

export interface LocalMacOSVoiceListenerSettingsUpdateRequest {
  enabled: boolean;
}

export interface LocalMacOSVoiceListenerSubmissionRequest {
  captureSessionId: string;
}

export type LocalMacOSVoiceListenerEvent =
  | {
      settings: LocalMacOSVoiceListenerSettings;
      type: "state_changed";
    }
  | {
      captureSessionId: string;
      settings: LocalMacOSVoiceListenerSettings;
      transcript: string;
      type: "wake_transcript";
    };

const localMacOSVoiceListenerStatuses = [
  "disabled",
  "arming",
  "armed",
  "wake_detected",
  "waiting_for_message_speech",
  "capturing",
  "candidate_end",
  "finalizing",
  "submitting",
  "paused_for_playback",
  "paused_for_manual_capture",
  "microphone_denied",
  "local_voice_not_ready",
  "engine_failed",
] as const;

const listenerStateDecoders = {
  armed: (record) => decodeStatusOnlyState(record, "armed"),
  arming: (record) => decodeStatusOnlyState(record, "arming"),
  candidate_end: (record) => decodeCandidateEndState(record),
  capturing: (record) => decodeActiveCaptureState(record, "capturing"),
  disabled: (record) => decodeStatusOnlyState(record, "disabled"),
  engine_failed: (record) => decodeMessageState(record, "engine_failed"),
  finalizing: (record) => decodeActiveCaptureState(record, "finalizing"),
  local_voice_not_ready: (record) => decodeMessageState(record, "local_voice_not_ready"),
  microphone_denied: (record) => decodeMessageState(record, "microphone_denied"),
  paused_for_manual_capture: (record) => decodePausedForManualCaptureState(record),
  paused_for_playback: (record) => decodePausedForPlaybackState(record),
  submitting: (record) => decodeSubmittingState(record),
  waiting_for_message_speech: (record) => decodeWakeState(record, "waiting_for_message_speech"),
  wake_detected: (record) => decodeWakeState(record, "wake_detected"),
} satisfies Record<
  LocalMacOSVoiceListenerStatus,
  (record: Record<string, unknown>) => LocalMacOSVoiceListenerState
>;

export function decodeLocalMacOSVoiceListenerSettingsUpdateRequest(
  value: unknown,
): LocalMacOSVoiceListenerSettingsUpdateRequest {
  const record = assertRecord(value, "LocalMacOSVoiceListenerSettingsUpdateRequest");
  assertKnownFields(record, "LocalMacOSVoiceListenerSettingsUpdateRequest", ["enabled"]);
  return {
    enabled: booleanField(record, "enabled", "LocalMacOSVoiceListenerSettingsUpdateRequest"),
  };
}

export function decodeLocalMacOSVoiceListenerSubmissionRequest(
  value: unknown,
): LocalMacOSVoiceListenerSubmissionRequest {
  const record = assertRecord(value, "LocalMacOSVoiceListenerSubmissionRequest");
  assertKnownFields(record, "LocalMacOSVoiceListenerSubmissionRequest", ["captureSessionId"]);
  return {
    captureSessionId: normalizedIdentifierField(
      record,
      "captureSessionId",
      "LocalMacOSVoiceListenerSubmissionRequest",
    ),
  };
}

export function decodeLocalMacOSVoiceListenerEvent(value: unknown): LocalMacOSVoiceListenerEvent {
  const record = assertRecord(value, "LocalMacOSVoiceListenerEvent");
  const type = stringField(record, "type", "LocalMacOSVoiceListenerEvent");
  switch (type) {
    case "state_changed":
      assertKnownFields(record, "LocalMacOSVoiceListenerEvent.state_changed", ["settings", "type"]);
      return {
        settings: decodeLocalMacOSVoiceListenerSettings(
          record.settings,
          "LocalMacOSVoiceListenerEvent.state_changed.settings",
        ),
        type,
      };
    case "wake_transcript":
      assertKnownFields(record, "LocalMacOSVoiceListenerEvent.wake_transcript", [
        "captureSessionId",
        "settings",
        "transcript",
        "type",
      ]);
      return {
        captureSessionId: normalizedIdentifierField(
          record,
          "captureSessionId",
          "LocalMacOSVoiceListenerEvent.wake_transcript",
        ),
        settings: decodeLocalMacOSVoiceListenerSettings(
          record.settings,
          "LocalMacOSVoiceListenerEvent.wake_transcript.settings",
        ),
        transcript: stringField(
          record,
          "transcript",
          "LocalMacOSVoiceListenerEvent.wake_transcript",
        ),
        type,
      };
    default:
      throw new Error("LocalMacOSVoiceListenerEvent.type is unsupported: " + type);
  }
}

export function decodeLocalMacOSVoiceListenerSettings(
  value: unknown,
  label = "LocalMacOSVoiceListenerSettings",
): LocalMacOSVoiceListenerSettings {
  const record = assertRecord(value, label);
  assertKnownFields(record, label, ["availability", "enabled", "state"]);
  return {
    availability: decodeLocalMacOSVoiceListenerAvailability(record.availability),
    enabled: booleanField(record, "enabled", label),
    state: decodeLocalMacOSVoiceListenerState(record.state),
  };
}

function decodeLocalMacOSVoiceListenerAvailability(
  value: unknown,
): LocalMacOSVoiceListenerAvailability {
  const record = assertRecord(value, "LocalMacOSVoiceListenerAvailability");
  const status = stringField(record, "status", "LocalMacOSVoiceListenerAvailability");
  switch (status) {
    case "ready":
      assertKnownFields(record, "LocalMacOSVoiceListenerAvailability.ready", ["status"]);
      return { status };
    case "unavailable":
      assertKnownFields(record, "LocalMacOSVoiceListenerAvailability.unavailable", [
        "message",
        "setupAction",
        "status",
      ]);
      return {
        message: stringField(record, "message", "LocalMacOSVoiceListenerAvailability.unavailable"),
        setupAction: decodeLocalMacOSVoiceListenerSetupAction(record.setupAction),
        status,
      };
    default:
      throw new Error("LocalMacOSVoiceListenerAvailability.status is unsupported: " + status);
  }
}

function decodeLocalMacOSVoiceListenerState(value: unknown): LocalMacOSVoiceListenerState {
  const record = assertRecord(value, "LocalMacOSVoiceListenerState");
  const status = decodeLocalMacOSVoiceListenerStatus(
    stringField(record, "status", "LocalMacOSVoiceListenerState"),
  );
  return listenerStateDecoders[status](record);
}

function decodeStatusOnlyState<Status extends "disabled" | "arming" | "armed">(
  record: Record<string, unknown>,
  status: Status,
): { status: Status } {
  assertKnownFields(record, `LocalMacOSVoiceListenerState.${status}`, ["status"]);
  return { status };
}

function decodeWakeState<Status extends "wake_detected" | "waiting_for_message_speech">(
  record: Record<string, unknown>,
  status: Status,
): Extract<LocalMacOSVoiceListenerState, { status: Status }> {
  const label = `LocalMacOSVoiceListenerState.${status}`;
  assertKnownFields(record, label, ["score", "status", "wakeDetectedAtMs"]);
  return {
    score: finiteNumberField(record, "score", label),
    status,
    wakeDetectedAtMs: nonNegativeIntegerField(record, "wakeDetectedAtMs", label),
  } as Extract<LocalMacOSVoiceListenerState, { status: Status }>;
}

function decodeActiveCaptureState<Status extends "capturing" | "finalizing">(
  record: Record<string, unknown>,
  status: Status,
): Extract<LocalMacOSVoiceListenerState, { status: Status }> {
  const label = `LocalMacOSVoiceListenerState.${status}`;
  assertKnownFields(record, label, ["captureStartedAtMs", "score", "status", "wakeDetectedAtMs"]);
  return {
    captureStartedAtMs: nonNegativeIntegerField(record, "captureStartedAtMs", label),
    score: finiteNumberField(record, "score", label),
    status,
    wakeDetectedAtMs: nonNegativeIntegerField(record, "wakeDetectedAtMs", label),
  } as Extract<LocalMacOSVoiceListenerState, { status: Status }>;
}

function decodeCandidateEndState(
  record: Record<string, unknown>,
): Extract<LocalMacOSVoiceListenerState, { status: "candidate_end" }> {
  const label = "LocalMacOSVoiceListenerState.candidate_end";
  assertKnownFields(record, label, [
    "candidateEndAtMs",
    "captureStartedAtMs",
    "score",
    "status",
    "wakeDetectedAtMs",
  ]);
  return {
    candidateEndAtMs: nonNegativeIntegerField(record, "candidateEndAtMs", label),
    captureStartedAtMs: nonNegativeIntegerField(record, "captureStartedAtMs", label),
    score: finiteNumberField(record, "score", label),
    status: "candidate_end",
    wakeDetectedAtMs: nonNegativeIntegerField(record, "wakeDetectedAtMs", label),
  };
}

function decodeSubmittingState(
  record: Record<string, unknown>,
): Extract<LocalMacOSVoiceListenerState, { status: "submitting" }> {
  const label = "LocalMacOSVoiceListenerState.submitting";
  assertKnownFields(record, label, ["status", "transcript"]);
  return {
    status: "submitting",
    transcript: stringField(record, "transcript", label),
  };
}

function decodePausedForPlaybackState(
  record: Record<string, unknown>,
): Extract<LocalMacOSVoiceListenerState, { status: "paused_for_playback" }> {
  const label = "LocalMacOSVoiceListenerState.paused_for_playback";
  assertKnownFields(record, label, ["operationId", "resumeState", "status"]);
  return {
    operationId: normalizedIdentifierField(record, "operationId", label),
    resumeState: decodePausableLocalMacOSVoiceListenerState(record.resumeState),
    status: "paused_for_playback",
  };
}

function decodePausedForManualCaptureState(
  record: Record<string, unknown>,
): Extract<LocalMacOSVoiceListenerState, { status: "paused_for_manual_capture" }> {
  const label = "LocalMacOSVoiceListenerState.paused_for_manual_capture";
  assertKnownFields(record, label, [
    "captureSessionId",
    "playbackOperationId",
    "resumeState",
    "status",
  ]);
  return {
    captureSessionId: normalizedIdentifierField(record, "captureSessionId", label),
    playbackOperationId: nullableIdentifierField(record, "playbackOperationId", label),
    resumeState: decodePausableLocalMacOSVoiceListenerState(record.resumeState),
    status: "paused_for_manual_capture",
  };
}

function decodeMessageState<
  Status extends "engine_failed" | "local_voice_not_ready" | "microphone_denied",
>(
  record: Record<string, unknown>,
  status: Status,
): Extract<LocalMacOSVoiceListenerState, { status: Status }> {
  const label = `LocalMacOSVoiceListenerState.${status}`;
  assertKnownFields(record, label, ["message", "status"]);
  return {
    message: stringField(record, "message", label),
    status,
  } as Extract<LocalMacOSVoiceListenerState, { status: Status }>;
}

function decodeLocalMacOSVoiceListenerStatus(value: string): LocalMacOSVoiceListenerStatus {
  if (localMacOSVoiceListenerStatuses.includes(value as LocalMacOSVoiceListenerStatus)) {
    return value as LocalMacOSVoiceListenerStatus;
  }
  throw new Error("LocalMacOSVoiceListenerState.status is unsupported: " + value);
}

function decodePausableLocalMacOSVoiceListenerState(
  value: unknown,
): { status: "arming" } | { status: "armed" } {
  const record = assertRecord(value, "LocalMacOSVoiceListenerPausableState");
  const status = stringField(record, "status", "LocalMacOSVoiceListenerPausableState");
  if (status === "arming" || status === "armed") {
    assertKnownFields(record, `LocalMacOSVoiceListenerPausableState.${status}`, ["status"]);
    return { status };
  }
  throw new Error("LocalMacOSVoiceListenerPausableState.status is unsupported: " + status);
}

function decodeLocalMacOSVoiceListenerSetupAction(
  value: unknown,
): LocalMacOSVoiceListenerSetupAction | null {
  if (value === null || value === "download_local_macos_voice_model") {
    return value;
  }
  throw new Error("LocalMacOSVoiceListenerAvailability.setupAction is unsupported");
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(label + " must be an object");
  }
  return value as Record<string, unknown>;
}

function assertKnownFields(record: Record<string, unknown>, label: string, fields: string[]): void {
  const known = new Set(fields);
  for (const field of Object.keys(record)) {
    if (!known.has(field)) {
      throw new Error(label + " contains unknown field " + field);
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

function booleanField(record: Record<string, unknown>, field: string, label: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new Error(`${label}.${field} must be a boolean`);
  }
  return value;
}

function nullableIdentifierField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): string | null {
  if (record[field] === null) {
    return null;
  }
  return normalizedIdentifierField(record, field, label);
}

function normalizedIdentifierField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): string {
  const value = stringField(record, field, label);
  if (value.trim() !== value || value === "") {
    throw new Error(`${label}.${field} must be a normalized identifier`);
  }
  return value;
}

function finiteNumberField(record: Record<string, unknown>, field: string, label: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label}.${field} must be a finite number`);
  }
  return value;
}

function nonNegativeIntegerField(
  record: Record<string, unknown>,
  field: string,
  label: string,
): number {
  const value = finiteNumberField(record, field, label);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label}.${field} must be a non-negative integer`);
  }
  return value;
}
