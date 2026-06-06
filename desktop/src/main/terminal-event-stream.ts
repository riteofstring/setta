import { backendEndpoints, decodeTerminalEvent, type TerminalEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { parseServerSentEvents } from "./backend-event-stream";

export interface TerminalEventStream {
  done: Promise<void>;
  stop: () => Promise<void>;
}

interface TerminalEventStreamOptions {
  baseURL: string;
  fetchImpl?: BackendFetch;
  reconnectDelayMs?: number;
  sendEvent: (event: TerminalEvent) => void;
}

interface TerminalEventCursor {
  sequence: number;
  streamId: string;
}

const defaultReconnectDelayMs = 500;

export function startTerminalEventStream(options: TerminalEventStreamOptions): TerminalEventStream {
  const abort = new AbortController();
  const done = runTerminalEventStreamLoop({
    baseURL: options.baseURL,
    fetchImpl: options.fetchImpl ?? fetch,
    reconnectDelayMs: options.reconnectDelayMs ?? defaultReconnectDelayMs,
    sendEvent: options.sendEvent,
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

async function runTerminalEventStreamLoop(options: {
  baseURL: string;
  fetchImpl: BackendFetch;
  reconnectDelayMs: number;
  sendEvent: (event: TerminalEvent) => void;
  signal: AbortSignal;
}) {
  let cursor = emptyTerminalEventCursor();
  while (!options.signal.aborted) {
    try {
      cursor = await streamTerminalEventsOnce({ ...options, cursor });
    } catch (error) {
      if (options.signal.aborted) {
        return;
      }
      if (error instanceof TerminalEventPayloadDecodeError) {
        cursor = error.cursor;
      }
      if (error instanceof TerminalEventCursorResetError) {
        cursor = emptyTerminalEventCursor();
      }
      console.warn("Terminal event stream disconnected", error);
    }
    await sleepWithAbort(options.reconnectDelayMs, options.signal);
  }
}

async function streamTerminalEventsOnce(options: {
  baseURL: string;
  cursor: TerminalEventCursor;
  fetchImpl: BackendFetch;
  sendEvent: (event: TerminalEvent) => void;
  signal: AbortSignal;
}): Promise<TerminalEventCursor> {
  const headers: Record<string, string> = {};
  if (options.cursor.streamId !== "") {
    headers["Last-Event-ID"] = encodeTerminalEventCursor(options.cursor);
  }
  const response = await options.fetchImpl(
    new URL(backendEndpoints.TerminalEventStream.path, options.baseURL),
    {
      headers,
      method: backendEndpoints.TerminalEventStream.method,
      signal: options.signal,
    },
  );
  if (!response.ok) {
    if (response.status === 400 && options.cursor.streamId !== "") {
      throw new TerminalEventCursorResetError(
        `terminal event stream cursor is no longer valid: ${encodeTerminalEventCursor(
          options.cursor,
        )}`,
      );
    }
    throw new Error(`terminal event stream returned HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("terminal event stream returned no response body");
  }
  let cursor = options.cursor;
  for await (const message of parseServerSentEvents(response.body)) {
    if (options.signal.aborted) {
      return cursor;
    }
    const nextCursor = terminalEventCursorFromServerSentEvent(message);
    const event = decodeTerminalStreamEvent(message, nextCursor);
    if (isDuplicateTerminalEvent(nextCursor, cursor)) {
      cursor = nextCursor;
      continue;
    }
    assertTerminalEventStream(nextCursor, cursor);
    cursor = nextCursor;
    options.sendEvent(event);
  }
  return cursor;
}

class TerminalEventPayloadDecodeError extends Error {
  constructor(
    message: string,
    readonly cursor: TerminalEventCursor,
  ) {
    super(message);
  }
}

class TerminalEventCursorResetError extends Error {}

function decodeTerminalStreamEvent(
  message: { data: string },
  cursor: TerminalEventCursor,
): TerminalEvent {
  try {
    return decodeTerminalEvent(JSON.parse(message.data));
  } catch (error) {
    throw new TerminalEventPayloadDecodeError(
      error instanceof Error ? error.message : "terminal event stream payload decode failed",
      cursor,
    );
  }
}

function emptyTerminalEventCursor(): TerminalEventCursor {
  return { sequence: 0, streamId: "" };
}

function encodeTerminalEventCursor(cursor: TerminalEventCursor): string {
  return `${cursor.streamId}:${cursor.sequence}`;
}

function terminalEventCursorFromServerSentEvent(message: { id: string }): TerminalEventCursor {
  const separator = message.id.lastIndexOf(":");
  if (separator <= 0 || separator === message.id.length - 1) {
    throw new Error("terminal event stream id is invalid: " + message.id);
  }
  const sequence = Number.parseInt(message.id.slice(separator + 1), 10);
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error("terminal event stream id sequence is invalid: " + message.id);
  }
  return { sequence, streamId: message.id.slice(0, separator) };
}

function isDuplicateTerminalEvent(
  nextCursor: TerminalEventCursor,
  cursor: TerminalEventCursor,
): boolean {
  return nextCursor.streamId === cursor.streamId && nextCursor.sequence <= cursor.sequence;
}

function assertTerminalEventStream(nextCursor: TerminalEventCursor, cursor: TerminalEventCursor) {
  if (cursor.streamId === "" || nextCursor.streamId === cursor.streamId) {
    return;
  }
  throw new TerminalEventCursorResetError(
    `terminal event stream changed stream id: ${cursor.streamId} -> ${nextCursor.streamId}`,
  );
}

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) {
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
