import { backendEndpoints, decodeEasyRunEvent, type EasyRunEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { parseServerSentEvents } from "./backend-event-stream";

export interface EasyRunEventStream {
  done: Promise<void>;
  stop: () => Promise<void>;
}

interface EasyRunEventStreamOptions {
  authToken: string;
  baseURL: string;
  fetchImpl?: BackendFetch;
  reconnectDelayMs?: number;
  sendEvent: (event: EasyRunEvent) => void;
}

interface EasyRunEventCursor {
  sequence: number;
  streamId: string;
}

const defaultReconnectDelayMs = 500;

export function startEasyRunEventStream(options: EasyRunEventStreamOptions): EasyRunEventStream {
  const abort = new AbortController();
  const done = runEasyRunEventStreamLoop({
    authToken: options.authToken,
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

async function runEasyRunEventStreamLoop(options: {
  authToken: string;
  baseURL: string;
  fetchImpl: BackendFetch;
  reconnectDelayMs: number;
  sendEvent: (event: EasyRunEvent) => void;
  signal: AbortSignal;
}) {
  let cursor = emptyEasyRunEventCursor();
  while (!options.signal.aborted) {
    try {
      cursor = await streamEasyRunEventsOnce({ ...options, cursor });
    } catch (error) {
      if (options.signal.aborted) {
        return;
      }
      if (error instanceof EasyRunEventPayloadDecodeError) {
        cursor = error.cursor;
      }
      console.warn("Easy-run event stream disconnected", error);
    }
    await sleepWithAbort(options.reconnectDelayMs, options.signal);
  }
}

async function streamEasyRunEventsOnce(options: {
  authToken: string;
  baseURL: string;
  cursor: EasyRunEventCursor;
  fetchImpl: BackendFetch;
  sendEvent: (event: EasyRunEvent) => void;
  signal: AbortSignal;
}): Promise<EasyRunEventCursor> {
  const headers: Record<string, string> = { Authorization: `Bearer ${options.authToken}` };
  if (options.cursor.streamId !== "") {
    headers["Last-Event-ID"] = encodeEasyRunEventCursor(options.cursor);
  }
  const response = await options.fetchImpl(
    new URL(backendEndpoints.EasyRunEventStream.path, options.baseURL),
    {
      headers,
      method: backendEndpoints.EasyRunEventStream.method,
      signal: options.signal,
    },
  );
  if (!response.ok) {
    throw new Error(`easy-run event stream returned HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("easy-run event stream returned no response body");
  }
  let cursor = options.cursor;
  for await (const message of parseServerSentEvents(response.body)) {
    if (options.signal.aborted) {
      return cursor;
    }
    const nextCursor = easyRunEventCursorFromServerSentEvent(message);
    const event = decodeEasyRunStreamEvent(message, nextCursor);
    if (isDuplicateEasyRunEvent(nextCursor, cursor)) {
      cursor = nextCursor;
      continue;
    }
    assertEasyRunEventStream(nextCursor, cursor, event);
    cursor = nextCursor;
    options.sendEvent(event);
  }
  return cursor;
}

class EasyRunEventPayloadDecodeError extends Error {
  constructor(
    message: string,
    readonly cursor: EasyRunEventCursor,
  ) {
    super(message);
  }
}

function decodeEasyRunStreamEvent(
  message: { data: string },
  cursor: EasyRunEventCursor,
): EasyRunEvent {
  try {
    return decodeEasyRunEvent(JSON.parse(message.data));
  } catch (error) {
    throw new EasyRunEventPayloadDecodeError(
      error instanceof Error ? error.message : "easy-run event stream payload decode failed",
      cursor,
    );
  }
}

function emptyEasyRunEventCursor(): EasyRunEventCursor {
  return { sequence: 0, streamId: "" };
}

function encodeEasyRunEventCursor(cursor: EasyRunEventCursor): string {
  return `${cursor.streamId}:${cursor.sequence}`;
}

function easyRunEventCursorFromServerSentEvent(message: { id: string }): EasyRunEventCursor {
  const separator = message.id.lastIndexOf(":");
  if (separator <= 0 || separator === message.id.length - 1) {
    throw new Error("easy-run event stream id is invalid: " + message.id);
  }
  const sequence = Number.parseInt(message.id.slice(separator + 1), 10);
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error("easy-run event stream id sequence is invalid: " + message.id);
  }
  return { sequence, streamId: message.id.slice(0, separator) };
}

function isDuplicateEasyRunEvent(
  nextCursor: EasyRunEventCursor,
  cursor: EasyRunEventCursor,
): boolean {
  return nextCursor.streamId === cursor.streamId && nextCursor.sequence <= cursor.sequence;
}

function assertEasyRunEventStream(
  nextCursor: EasyRunEventCursor,
  cursor: EasyRunEventCursor,
  event: EasyRunEvent,
) {
  if (
    cursor.streamId === "" ||
    nextCursor.streamId === cursor.streamId ||
    event.type === "easyrun.resync_required"
  ) {
    return;
  }
  throw new Error(
    `easy-run event stream changed stream id: ${cursor.streamId} -> ${nextCursor.streamId}`,
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
