import type { BrowserWindow } from "electron";
import { createWriteStream, mkdirSync, writeFileSync, type WriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

import type { BackendFetch } from "@shared/backend-runtime";
import type {
  IpcObservedFailure,
  IpcObservedFinish,
  IpcObservedStart,
  IpcObserver,
} from "@shared/ipc";
import type {
  RendererGraphRecordedEvent,
  RendererGraphTruncation,
  RendererRecordedEvent,
} from "@shared/recording";

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
        requestBody: this.payload(init.body),
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

  recordRendererEvent(event: RendererRecordedEvent) {
    const recordedEvent = compactRendererRecordedEvent(event);
    this.writeJSONLine(this.rendererEventsStream, {
      ...recordedEvent,
      at: recordedEvent.at,
    });
    this.recordEvent("renderer_event", recordedEvent);
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
      args: this.payload(event.args),
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
      result: this.payload(event.result),
      type: "ipc_finish",
    });
  }

  private recordIpcFailure(event: IpcObservedFailure) {
    this.writeJSONLine(this.ipcStream, {
      at: timestamp(),
      channel: event.channel,
      durationMs: event.durationMs,
      error: errorPayload(event.error),
      id: event.id,
      type: "ipc_failure",
    });
    this.recordEvent("ipc_failure", {
      channel: event.channel,
      durationMs: event.durationMs,
      error: errorPayload(event.error),
      id: event.id,
    });
  }

  private recordEvent(type: string, payload: unknown) {
    const record: JsonLineRecord = {
      at: timestamp(),
      payload: sanitizeValue(payload),
      seq: this.nextID(),
      type,
    };
    this.writeJSONLine(this.eventsStream, record);
  }

  private payload(value: unknown): unknown {
    if (this.includePayloads) {
      return sanitizeValue(value);
    }
    return summarizeValue(value);
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
    stream.write(JSON.stringify(sanitizeValue(value)) + "\n");
  }
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

export function compactRendererRecordedEvent(event: RendererRecordedEvent): RendererRecordedEvent {
  if (!isRendererGraphRecordedEvent(event)) {
    return event;
  }
  const truncation = [...event.graph.truncation];
  return {
    ...event,
    ...(event.type === "graph_interaction"
      ? {
          interaction: {
            ...event.interaction,
            movedNodes: limitGraphArray(
              event.interaction.movedNodes,
              "interaction.movedNodes",
              24,
              truncation,
            ),
          },
        }
      : {}),
    graph: {
      ...event.graph,
      nodes: {
        moved: limitGraphArray(event.graph.nodes.moved, "graph.nodes.moved", 24, truncation),
        selected: limitGraphArray(
          event.graph.nodes.selected,
          "graph.nodes.selected",
          24,
          truncation,
        ),
        touched: limitGraphArray(event.graph.nodes.touched, "graph.nodes.touched", 24, truncation),
        visible: limitGraphArray(event.graph.nodes.visible, "graph.nodes.visible", 24, truncation),
      } satisfies RendererGraphRecordedEvent["graph"]["nodes"],
      selected: {
        edgeIds: limitGraphArray(
          event.graph.selected.edgeIds,
          "graph.selected.edgeIds",
          48,
          truncation,
        ),
        nodeIds: limitGraphArray(
          event.graph.selected.nodeIds,
          "graph.selected.nodeIds",
          48,
          truncation,
        ),
      },
      timing:
        event.graph.timing === null
          ? null
          : {
              ...event.graph.timing,
              recentFrameMs: limitGraphArray(
                event.graph.timing.recentFrameMs,
                "graph.timing.recentFrameMs",
                12,
                truncation,
              ),
              timingBuckets: limitGraphRecord(
                event.graph.timing.timingBuckets,
                "graph.timing.timingBuckets",
                40,
                truncation,
              ),
              timingSamples: limitGraphArray(
                event.graph.timing.timingSamples,
                "graph.timing.timingSamples",
                12,
                truncation,
              ),
            },
      trajectory: {
        ...event.graph.trajectory,
        anchorSummaries: limitGraphArray(
          event.graph.trajectory.anchorSummaries,
          "graph.trajectory.anchorSummaries",
          24,
          truncation,
        ),
      },
      truncation,
    },
  };
}

function isRendererGraphRecordedEvent(
  event: RendererRecordedEvent,
): event is RendererGraphRecordedEvent {
  return (
    event.type === "graph_snapshot" ||
    event.type === "graph_interaction" ||
    event.type === "graph_layout_save" ||
    event.type === "graph_replacement"
  );
}

function limitGraphArray<T>(
  values: readonly T[],
  path: string,
  limit: number,
  truncation: RendererGraphTruncation[],
): T[] {
  if (values.length <= limit) {
    return [...values];
  }
  appendGraphTruncation(truncation, {
    limit,
    omitted: values.length - limit,
    path,
    total: values.length,
  });
  return values.slice(0, limit);
}

function limitGraphRecord(
  value: Record<string, unknown>,
  path: string,
  limit: number,
  truncation: RendererGraphTruncation[],
): Record<string, unknown> {
  const entries = Object.entries(value);
  if (entries.length <= limit) {
    return value;
  }
  appendGraphTruncation(truncation, {
    limit,
    omitted: entries.length - limit,
    path,
    total: entries.length,
  });
  return Object.fromEntries(entries.slice(0, limit));
}

function appendGraphTruncation(
  truncation: RendererGraphTruncation[],
  next: RendererGraphTruncation,
): void {
  if (
    truncation.some(
      (current) =>
        current.path === next.path && current.limit === next.limit && current.total === next.total,
    )
  ) {
    return;
  }
  truncation.push(next);
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

function sanitizeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
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
  if (Array.isArray(value)) {
    return value.slice(0, maxArrayLength).map((item) => sanitizeValue(item, depth + 1, seen));
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
    record[key] = sanitizeValue(entryValue, depth + 1, seen);
  }
  return record;
}

function summarizeValue(value: unknown): unknown {
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
