import {
  backendEndpoints,
  decodeCodexAccountChangeEvent,
  type CodexAccountChangeEvent,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { parseServerSentEvents } from "@shared/server-sent-events";

export interface CodexAccountEventStream {
  done: Promise<void>;
  stop: () => Promise<void>;
}

interface CodexAccountEventStreamOptions {
  baseURL: string;
  fetchImpl: BackendFetch;
  reconnectDelayMs?: number;
  sendEvent: (event: CodexAccountChangeEvent) => void;
}

interface EventCursor {
  sequence: number;
  streamId: string;
}

const defaultReconnectDelayMs = 500;

export function startCodexAccountEventStream(
  options: CodexAccountEventStreamOptions,
): CodexAccountEventStream {
  const abort = new AbortController();
  const done = runCodexAccountEventStreamLoop({
    ...options,
    reconnectDelayMs: options.reconnectDelayMs ?? defaultReconnectDelayMs,
    signal: abort.signal,
  });
  return {
    done,
    stop: async () => {
      abort.abort();
      await done;
    },
  };
}

async function runCodexAccountEventStreamLoop(
  options: CodexAccountEventStreamOptions & {
    reconnectDelayMs: number;
    signal: AbortSignal;
  },
): Promise<void> {
  let cursor: EventCursor = { sequence: 0, streamId: "" };
  while (!options.signal.aborted) {
    try {
      cursor = await streamCodexAccountEventsOnce({ ...options, cursor });
    } catch (error) {
      if (options.signal.aborted) {
        return;
      }
      console.warn("Codex account event stream disconnected", error);
    }
    await sleepWithAbort(options.reconnectDelayMs, options.signal);
  }
}

async function streamCodexAccountEventsOnce(
  options: CodexAccountEventStreamOptions & {
    cursor: EventCursor;
    signal: AbortSignal;
  },
): Promise<EventCursor> {
  const headers: Record<string, string> = {};
  if (options.cursor.streamId !== "") {
    headers["Last-Event-ID"] = encodeCursor(options.cursor);
  }
  const response = await options.fetchImpl(
    new URL(backendEndpoints.CodexAccountEventStream.path, options.baseURL),
    {
      headers,
      method: backendEndpoints.CodexAccountEventStream.method,
      signal: options.signal,
    },
  );
  if (!response.ok) {
    throw new Error(`Codex account event stream returned HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("Codex account event stream returned no response body");
  }
  let cursor = options.cursor;
  for await (const message of parseServerSentEvents(response.body)) {
    if (options.signal.aborted) {
      return cursor;
    }
    const event = decodeCodexAccountChangeEvent(JSON.parse(message.data));
    if (event.reason !== "snapshot_required" && eventIsDuplicate(cursor, event)) {
      continue;
    }
    cursor = { sequence: event.sequence, streamId: event.streamId };
    options.sendEvent(event);
  }
  return cursor;
}

function eventIsDuplicate(cursor: EventCursor, event: CodexAccountChangeEvent): boolean {
  return event.streamId === cursor.streamId && event.sequence <= cursor.sequence;
}

function encodeCursor(cursor: EventCursor): string {
  return `${cursor.streamId}:${cursor.sequence}`;
}

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}
