import type { BrowserWindow } from "electron";
import { createWriteStream, mkdirSync, writeFileSync, type WriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import type { ConversationEvent, ResolvedInvocation, TrajectoryEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import {
  ipcChannels,
  type IpcObservedFailure,
  type IpcObservedFinish,
  type IpcObservedStart,
  type IpcObserver,
} from "@shared/ipc";
import type { RendererRecordedEvent } from "@shared/recording";

interface SessionRecorderMetadata {
  appDataDir: string;
  desktopRoot: string;
  repoRoot: string;
}

interface SessionRecorderOptions extends SessionRecorderMetadata {
  dir: string;
  includePayloads: boolean;
  screenshotIntervalMs: number;
}

interface RecordingManifest extends SessionRecorderMetadata {
  chrome: string;
  electron: string;
  includePayloads: boolean;
  node: string;
  pid: number;
  recordingDir: string;
  screenshotIntervalMs: number;
  startedAt: string;
}

interface JsonLineRecord {
  at: string;
  payload: unknown;
  seq: number;
  type: string;
}

const defaultScreenshotIntervalMs = 10_000;
const maxStringLength = 4_000;
const maxArrayLength = 60;
const maxObjectKeys = 80;
const sensitiveRecordingKeys = new Set([
  "Authorization",
  "answers",
  "apiKey",
  "api_key",
  "audioBase64",
  "audio_base64",
  "authorization",
  "authUrl",
  "auth_url",
  "bootstrapToken",
  "bootstrap_token",
  "clientSecret",
  "client_secret",
  "deviceToken",
  "device_token",
  "iconDataUrl",
  "icon_data_url",
  "imageDataUrl",
  "image_data_url",
  "loginId",
  "login_id",
  "pairingToken",
  "pairing_token",
  "userCode",
  "user_code",
  "verificationUrl",
  "verification_url",
]);
const sensitiveIpcStartTypes = new Map<string, string>([
  [ipcChannels.appOpenExternalUrl, "external_url"],
  [ipcChannels.codexAccountStartLogin, "codex_account_login_request"],
  [ipcChannels.conversationSubmitApproval, "conversation_approval_submission"],
  [ipcChannels.runtimeAddByPairingUrl, "runtime_pairing_url"],
]);
const sensitiveRecordingEventTypes = new Map<string, string>([
  ["external_url_open_blocked", "external_url"],
]);

export class SessionRecorder {
  readonly dir: string;

  private readonly backendHTTPStream: WriteStream;
  private readonly backendLogStream: WriteStream;
  private readonly eventsStream: WriteStream;
  private readonly includePayloads: boolean;
  private readonly ipcStream: WriteStream;
  private readonly rendererConsoleStream: WriteStream;
  private readonly rendererEventsStream: WriteStream;
  private readonly screenshotDir: string;
  private readonly screenshotIntervalMs: number;

  private closed = false;
  private readonly conversationEventIDs = new Set<string>();
  private eventSeq = 1;
  private screenshotSeq = 1;

  constructor(options: SessionRecorderOptions) {
    this.dir = options.dir;
    this.includePayloads = options.includePayloads;
    this.screenshotIntervalMs = options.screenshotIntervalMs;
    this.screenshotDir = join(this.dir, "screenshots");
    mkdirSync(this.screenshotDir, { recursive: true });
    this.eventsStream = createWriteStream(join(this.dir, "events.jsonl"), { flags: "a" });
    this.backendLogStream = createWriteStream(join(this.dir, "backend.log"), { flags: "a" });
    this.backendHTTPStream = createWriteStream(join(this.dir, "backend-http.jsonl"), {
      flags: "a",
    });
    this.ipcStream = createWriteStream(join(this.dir, "ipc.jsonl"), { flags: "a" });
    this.rendererConsoleStream = createWriteStream(join(this.dir, "renderer-console.jsonl"), {
      flags: "a",
    });
    this.rendererEventsStream = createWriteStream(join(this.dir, "renderer-events.jsonl"), {
      flags: "a",
    });

    writeFileSync(join(this.dir, "manifest.json"), JSON.stringify(manifest(options), null, 2));
    this.recordEvent("recording_started", {
      appDataDir: options.appDataDir,
      includePayloads: this.includePayloads,
      repoRoot: options.repoRoot,
      screenshotIntervalMs: this.screenshotIntervalMs,
    });
  }

  attachWindow(window: BrowserWindow) {
    this.recordEvent("window_created", { bounds: window.getBounds() });

    window.once("ready-to-show", () => {
      this.recordEvent("window_ready_to_show", { bounds: window.getBounds() });
      void this.captureScreenshot(window, "window-ready");
    });
    window.on("closed", () => {
      this.recordEvent("window_closed", {});
    });

    window.webContents.on("did-finish-load", () => {
      this.recordEvent("renderer_did_finish_load", { url: window.webContents.getURL() });
      void this.captureScreenshot(window, "renderer-loaded");
    });
    window.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        this.recordEvent("renderer_did_fail_load", {
          errorCode,
          errorDescription,
          isMainFrame,
          validatedURL,
        });
        void this.captureScreenshot(window, "renderer-load-failed");
      },
    );
    window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      this.recordRendererConsole({ level, line, message, sourceId });
      if (level >= 2) {
        void this.captureScreenshot(window, "renderer-console-error");
      }
    });
    window.webContents.on("render-process-gone", (_event, details) => {
      this.recordEvent("renderer_process_gone", details);
      void this.captureScreenshot(window, "renderer-process-gone");
    });
    window.webContents.on("unresponsive", () => {
      this.recordEvent("renderer_unresponsive", {});
      void this.captureScreenshot(window, "renderer-unresponsive");
    });
    window.webContents.on("responsive", () => {
      this.recordEvent("renderer_responsive", {});
    });

    if (this.screenshotIntervalMs > 0) {
      const interval = setInterval(() => {
        void this.captureScreenshot(window, "periodic");
      }, this.screenshotIntervalMs);
      interval.unref();
      window.once("closed", () => {
        clearInterval(interval);
      });
    }
  }

  createBackendFetch(fetchImpl: BackendFetch): BackendFetch {
    return async (input, init) => {
      const id = this.nextID();
      const startedAt = Date.now();
      this.writeJSONLine(this.backendHTTPStream, {
        at: timestamp(),
        id,
        method: init.method ?? "GET",
        requestBody: summarizeRecordingValue(init.body),
        type: "backend_http_request",
        url: input.toString(),
      });
      try {
        const response = await fetchImpl(input, init);
        this.writeJSONLine(this.backendHTTPStream, {
          at: timestamp(),
          durationMs: Date.now() - startedAt,
          id,
          ok: response.ok,
          status: response.status,
          type: "backend_http_response",
          url: input.toString(),
        });
        return response;
      } catch (error) {
        this.writeJSONLine(this.backendHTTPStream, {
          at: timestamp(),
          durationMs: Date.now() - startedAt,
          error: errorPayload(error),
          id,
          type: "backend_http_error",
          url: input.toString(),
        });
        throw error;
      }
    };
  }

  createIpcObserver(): IpcObserver {
    return {
      failed: (event) => {
        this.recordIpcFailure(event);
      },
      finished: (event) => {
        this.recordIpcFinish(event);
      },
      started: (event) => {
        this.recordIpcStart(event);
      },
    };
  }

  recordBackendExit(exit: unknown) {
    this.recordEvent("backend_exit", exit);
  }

  recordBackendLog(line: string) {
    this.backendLogStream.write(line + "\n");
    this.recordEvent("backend_log", { line });
  }

  recordBackendStartupError(error: string) {
    this.recordEvent("backend_startup_error", { error });
  }

  recordAppEvent(type: string, payload: unknown) {
    this.recordEvent(type, payload);
  }

  recordConversationEvent(event: ConversationEvent): void {
    const key = `${event.conversationId}:${event.eventId}`;
    if (this.conversationEventIDs.has(key)) {
      return;
    }
    for (const projected of conversationRecordingEvents(event)) {
      this.recordEvent(projected.type, projected.payload);
    }
    this.conversationEventIDs.add(key);
  }

  recordRendererEvent(event: RendererRecordedEvent) {
    this.writeJSONLine(this.rendererEventsStream, {
      ...event,
      at: event.at,
    });
    this.recordEvent("renderer_event", event);
  }

  async captureScreenshot(window: BrowserWindow | null, reason: string): Promise<void> {
    if (this.closed || window === null || window.isDestroyed()) {
      return;
    }
    try {
      const seq = String(this.screenshotSeq).padStart(4, "0");
      this.screenshotSeq += 1;
      const filename = `${seq}-${slug(reason)}.png`;
      const path = join(this.screenshotDir, filename);
      const image = await window.webContents.capturePage();
      await writeFile(path, image.toPNG());
      this.recordEvent("screenshot", {
        file: relative(this.dir, path),
        reason,
      });
    } catch (error) {
      this.recordEvent("screenshot_failed", {
        error: errorPayload(error),
        reason,
      });
    }
  }

  close() {
    if (this.closed) {
      return;
    }
    this.recordEvent("recording_stopped", {});
    this.closed = true;
    this.backendHTTPStream.end();
    this.backendLogStream.end();
    this.eventsStream.end();
    this.ipcStream.end();
    this.rendererConsoleStream.end();
    this.rendererEventsStream.end();
  }

  private recordRendererConsole(event: {
    level: number;
    line: number;
    message: string;
    sourceId: string;
  }) {
    const payload = {
      at: timestamp(),
      level: event.level,
      line: event.line,
      message: truncate(event.message),
      sourceId: truncate(event.sourceId),
      type: "renderer_console",
    };
    this.writeJSONLine(this.rendererConsoleStream, payload);
    this.recordEvent("renderer_console", payload);
  }

  private recordIpcStart(event: IpcObservedStart) {
    this.writeJSONLine(this.ipcStream, {
      args: ipcRecordingValue(event.channel, "start", event.args, this.includePayloads),
      at: timestamp(),
      channel: event.channel,
      id: event.id,
      type: "ipc_start",
    });
  }

  private recordIpcFinish(event: IpcObservedFinish) {
    this.writeJSONLine(this.ipcStream, {
      at: timestamp(),
      channel: event.channel,
      durationMs: event.durationMs,
      id: event.id,
      result: ipcRecordingValue(event.channel, "finish", event.result, this.includePayloads),
      type: "ipc_finish",
    });
  }

  private recordIpcFailure(event: IpcObservedFailure) {
    const error = ipcRecordingFailure(event.channel, event.error);
    this.writeJSONLine(this.ipcStream, {
      at: timestamp(),
      channel: event.channel,
      durationMs: event.durationMs,
      error,
      id: event.id,
      type: "ipc_failure",
    });
    this.recordEvent("ipc_failure", {
      channel: event.channel,
      durationMs: event.durationMs,
      error,
      id: event.id,
    });
  }

  private recordEvent(type: string, payload: unknown) {
    const record: JsonLineRecord = {
      at: timestamp(),
      payload: recordingEventValue(type, payload),
      seq: this.nextID(),
      type,
    };
    this.writeJSONLine(this.eventsStream, record);
  }

  private nextID(): number {
    const id = this.eventSeq;
    this.eventSeq += 1;
    return id;
  }

  private writeJSONLine(stream: WriteStream, value: unknown) {
    if (this.closed) {
      return;
    }
    stream.write(JSON.stringify(sanitizeRecordingValue(value)) + "\n");
  }
}

interface ConversationRecordingEvent {
  type: string;
  payload: unknown;
}

export function conversationRecordingEvents(
  event: ConversationEvent,
): ConversationRecordingEvent[] {
  const envelope = {
    conversationId: event.conversationId,
    eventId: event.eventId,
    sequence: event.sequence,
    workspaceId: event.workspaceId,
  };
  switch (event.payload.type) {
    case "conversation.turn.updated":
      return recordedAgentInvocation(event.payload.turn, envelope);
    case "conversation.narration.created":
      return recordedNarratorOutput(event.payload.event, envelope);
    case "conversation.thread_binding.updated":
      return recordedThreadBinding(event.payload.binding, envelope);
    case "conversation.trajectory.appended":
      return recordedAgentTrajectory(event.payload.event, envelope);
    default:
      return [
        {
          type: "conversation_event_forwarded",
          payload: { ...envelope, type: event.payload.type },
        },
      ];
  }
}

type ConversationRecordingEnvelope = Pick<
  ConversationEvent,
  "conversationId" | "eventId" | "sequence" | "workspaceId"
>;

function recordedAgentInvocation(
  turn: Extract<ConversationEvent["payload"], { type: "conversation.turn.updated" }>["turn"],
  envelope: ConversationRecordingEnvelope,
): ConversationRecordingEvent[] {
  return [
    {
      type: "agent_invocation_observed",
      payload: {
        ...envelope,
        acceptedAt: turn.acceptedAt,
        delivery: turn.delivery,
        endedAt: turn.endedAt,
        error: summarizeRecordedFailure(turn.error),
        providerTurnId: turn.providerTurnId,
        requestedRoleProfile: turn.requestedRoleProfile,
        resolvedInvocation: summarizeResolvedInvocation(turn.resolvedInvocation),
        startedAt: turn.startedAt,
        status: turn.status,
        turnId: turn.id,
      },
    },
  ];
}

function recordedNarratorOutput(
  narration: Extract<
    ConversationEvent["payload"],
    { type: "conversation.narration.created" }
  >["event"],
  envelope: ConversationRecordingEnvelope,
): ConversationRecordingEvent[] {
  return [
    {
      type: "narrator_output_observed",
      payload: {
        ...envelope,
        createdAt: narration.createdAt,
        kind: narration.kind,
        narrationId: narration.id,
        resolvedInvocation: summarizeResolvedInvocation(narration.resolvedInvocation),
        sourceSequenceEnd: narration.sourceSequenceEnd,
        sourceSequenceStart: narration.sourceSequenceStart,
        streamSequence: narration.streamSequence,
        trigger: narration.trigger,
        turnId: narration.turnId,
      },
    },
  ];
}

function recordedThreadBinding(
  binding: Extract<
    ConversationEvent["payload"],
    { type: "conversation.thread_binding.updated" }
  >["binding"],
  envelope: ConversationRecordingEnvelope,
): ConversationRecordingEvent[] {
  return [
    {
      type: "agent_thread_binding_observed",
      payload: {
        ...envelope,
        bindingStatus: binding.status,
        createdAt: binding.createdAt,
        lastResumedAt: binding.lastResumedAt,
        lastTurnId: binding.lastTurnId,
        metadataKeys: Object.keys(binding.providerMetadata).sort(),
        provider: binding.provider,
        providerThreadId: binding.threadId,
      },
    },
  ];
}

function recordedAgentTrajectory(
  trajectory: TrajectoryEvent,
  envelope: ConversationRecordingEnvelope,
): ConversationRecordingEvent[] {
  return [
    {
      type: "agent_trajectory_observed",
      payload: { ...envelope, ...summarizeAgentTrajectoryEvent(trajectory) },
    },
  ];
}

function summarizeResolvedInvocation(invocation: ResolvedInvocation | null) {
  if (invocation === null) {
    return null;
  }
  return {
    endedAt: invocation.endedAt,
    failure: summarizeRecordedFailure(invocation.failure),
    id: invocation.id,
    modelReroutes: invocation.modelReroutes.map((reroute) => ({
      fromModelId: reroute.fromModelId,
      toModelId: reroute.toModelId,
    })),
    outcome: invocation.outcome,
    provider: invocation.provider,
    providerReferences: invocation.providerReferences,
    requested: invocation.requested,
    resolved: invocation.resolved,
    role: invocation.role,
    startedAt: invocation.startedAt,
  };
}

function summarizeAgentTrajectoryEvent(event: TrajectoryEvent) {
  return {
    actor: event.actor,
    agentLiveness: summarizeAgentLiveness(event),
    emittedAt: event.emittedAt,
    eventKind: event.kind,
    failure: summarizeTrajectoryFailure(event),
    modelReroute: summarizeTrajectoryModelReroute(event),
    providerEventId: event.providerEventId,
    providerLifecycle: summarizeProviderLifecycle(event),
    providerThreadId: event.providerThreadId,
    providerTurnId: event.providerTurnId,
    trajectoryEventId: event.id,
    trajectorySequence: event.sequence,
    turnId: event.turnId,
    turnInterruptionReason: summarizeTurnInterruptionReason(event),
    turnInvocation: summarizeTurnInvocation(event),
  };
}

function summarizeAgentLiveness(event: TrajectoryEvent) {
  const changed = event.agentLivenessChanged;
  if (changed === null) {
    return null;
  }
  return {
    cancellable: changed.liveness.cancellable,
    lastProviderEventAt: changed.liveness.lastProviderEventAt,
    lastReconciledAt: changed.liveness.lastReconciledAt,
    reason: changed.liveness.reason,
    retryable: changed.liveness.retryable,
    status: changed.liveness.status,
    steerable: changed.liveness.steerable,
  };
}

function summarizeTrajectoryFailure(event: TrajectoryEvent) {
  if (event.turnFailed !== null) {
    return summarizeRecordedFailure(event.turnFailed.failure);
  }
  if (event.activityFailed !== null) {
    return summarizeRecordedFailure(event.activityFailed.failure);
  }
  return null;
}

function summarizeTrajectoryModelReroute(event: TrajectoryEvent) {
  if (event.modelRerouted === null) {
    return null;
  }
  return {
    fromModelId: event.modelRerouted.reroute.fromModelId,
    toModelId: event.modelRerouted.reroute.toModelId,
  };
}

function summarizeProviderLifecycle(event: TrajectoryEvent) {
  if (event.providerLifecycleChanged === null) {
    return null;
  }
  return {
    provider: event.providerLifecycleChanged.lifecycle.provider,
    status: event.providerLifecycleChanged.lifecycle.status,
  };
}

function summarizeTurnInterruptionReason(event: TrajectoryEvent) {
  if (event.turnInterrupted === null) {
    return null;
  }
  return event.turnInterrupted.reason;
}

function summarizeTurnInvocation(event: TrajectoryEvent) {
  if (event.turnStarted === null) {
    return null;
  }
  return summarizeResolvedInvocation(event.turnStarted.invocation);
}

function summarizeRecordedFailure(
  failure: {
    code: string;
    diagnosticReference: string;
    message: string;
    retryable: boolean;
  } | null,
) {
  if (failure === null) {
    return null;
  }
  return {
    code: failure.code,
    diagnosticReference: failure.diagnosticReference,
    retryable: failure.retryable,
  };
}

export function createSessionRecorder(
  env: NodeJS.ProcessEnv,
  metadata: SessionRecorderMetadata,
): SessionRecorder | null {
  if (env.SETTA_RECORDING !== "1" && env.SETTA_RECORDING_DIR === undefined) {
    return null;
  }
  const dir = env.SETTA_RECORDING_DIR ?? join(metadata.repoRoot, ".recordings", pathTimestamp());
  mkdirSync(dir, { recursive: true });
  return new SessionRecorder({
    ...metadata,
    dir,
    includePayloads: env.SETTA_RECORD_INCLUDE_PAYLOADS !== "0",
    screenshotIntervalMs: nonNegativeIntegerEnv(
      env.SETTA_RECORD_SCREENSHOT_INTERVAL_MS,
      defaultScreenshotIntervalMs,
    ),
  });
}

function manifest(options: SessionRecorderOptions): RecordingManifest {
  return {
    appDataDir: options.appDataDir,
    chrome: process.versions.chrome,
    desktopRoot: options.desktopRoot,
    electron: process.versions.electron,
    includePayloads: options.includePayloads,
    node: process.versions.node,
    pid: process.pid,
    recordingDir: options.dir,
    repoRoot: options.repoRoot,
    screenshotIntervalMs: options.screenshotIntervalMs,
    startedAt: timestamp(),
  };
}

function timestamp(): string {
  return new Date().toISOString();
}

function pathTimestamp(): string {
  return timestamp().replaceAll(":", "").replaceAll(".", "-");
}

function nonNegativeIntegerEnv(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`expected non-negative integer environment value, got ${value}`);
  }
  return parsed;
}

export function sanitizeRecordingValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (depth > 8) {
    return "[MaxDepth]";
  }
  const scalar = sanitizeScalar(value);
  if (scalar.handled) {
    return scalar.value;
  }
  if (value instanceof Error) {
    return errorPayload(value);
  }
  return sanitizeRecordingComposite(value, depth, seen);
}

function sanitizeRecordingComposite(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value instanceof ArrayBuffer) {
    return { byteLength: value.byteLength, type: "binary" };
  }
  if (ArrayBuffer.isView(value)) {
    return { byteLength: value.byteLength, type: "binary" };
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, maxArrayLength)
      .map((item) => sanitizeRecordingValue(item, depth + 1, seen));
  }
  if (value !== null && typeof value === "object") {
    return sanitizeObject(value, depth, seen);
  }
  return String(value);
}

function sanitizeScalar(value: unknown): { handled: true; value: unknown } | { handled: false } {
  if (value === null || value === undefined) {
    return { handled: true, value };
  }
  if (typeof value === "bigint") {
    return { handled: true, value: value.toString() };
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return { handled: true, value };
  }
  if (typeof value === "string") {
    return { handled: true, value: truncate(value) };
  }
  return { handled: false };
}

function sanitizeObject(value: object, depth: number, seen: WeakSet<object>): unknown {
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);
  const record: Record<string, unknown> = {};
  const entries = Object.entries(value).slice(0, maxObjectKeys);
  for (const [key, entryValue] of entries) {
    record[key] = sensitiveRecordingKeys.has(key)
      ? redactedRecordingValue("sensitive_value")
      : sanitizeRecordingValue(entryValue, depth + 1, seen);
  }
  return record;
}

export function summarizeRecordingValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return { length: value.length, type: "array" };
  }
  if (typeof value === "string") {
    return { length: value.length, type: "string" };
  }
  if (typeof value === "object") {
    return {
      fields: Object.keys(value).sort(),
      type: "object",
    };
  }
  return {
    type: typeof value,
    value,
  };
}

export function ipcRecordingValue(
  channel: string,
  phase: "finish" | "start",
  value: unknown,
  includePayloads: boolean,
): unknown {
  const sensitiveType = phase === "start" ? sensitiveIpcStartTypes.get(channel) : undefined;
  if (sensitiveType !== undefined) {
    return redactedRecordingValue(sensitiveType);
  }
  return includePayloads ? sanitizeRecordingValue(value) : summarizeRecordingValue(value);
}

export function ipcRecordingFailure(channel: string, error: unknown): unknown {
  const sensitiveType = sensitiveIpcStartTypes.get(channel);
  if (sensitiveType !== undefined) {
    return redactedRecordingValue(`${sensitiveType}_failure`);
  }
  return sanitizeRecordingValue(errorPayload(error));
}

export function recordingEventValue(type: string, payload: unknown): unknown {
  const sensitiveType = sensitiveRecordingEventTypes.get(type);
  return sensitiveType === undefined
    ? sanitizeRecordingValue(payload)
    : redactedRecordingValue(sensitiveType);
}

function redactedRecordingValue(type: string): { redacted: true; type: string } {
  return { redacted: true, type };
}

function errorPayload(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: truncate(error.stack ?? ""),
    };
  }
  return {
    message: String(error),
    name: "NonError",
    stack: "",
  };
}

function truncate(value: string): string {
  const codePoints = Array.from(value);
  if (codePoints.length <= maxStringLength) {
    return value;
  }
  return (
    codePoints
      .slice(0, maxStringLength - 3)
      .join("")
      .trimEnd() + "..."
  );
}

function slug(value: string): string {
  const slugged = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slugged || "screenshot";
}
