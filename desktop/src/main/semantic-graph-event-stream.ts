import {
  backendEndpoints,
  decodeSemanticGraphChangeEvent,
  type SemanticGraphChangeEvent,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { parseServerSentEvents } from "./backend-event-stream";

export interface SemanticGraphEventStream {
  done: Promise<void>;
  stop: () => Promise<void>;
}

interface SemanticGraphEventStreamOptions {
  baseURL: string;
  fetchImpl?: BackendFetch;
  reconnectDelayMs?: number;
  sendEvent: (event: SemanticGraphChangeEvent) => void;
}

interface SemanticGraphEventCursor {
  sequence: number;
  streamId: string;
}

const defaultReconnectDelayMs = 500;

export function startSemanticGraphEventStream(
  options: SemanticGraphEventStreamOptions,
): SemanticGraphEventStream {
  const abort = new AbortController();
  const done = runSemanticGraphEventStreamLoop({
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

async function runSemanticGraphEventStreamLoop(options: {
  baseURL: string;
  fetchImpl: BackendFetch;
  reconnectDelayMs: number;
  sendEvent: (event: SemanticGraphChangeEvent) => void;
  signal: AbortSignal;
}) {
  let cursor = emptySemanticGraphEventCursor();
  while (!options.signal.aborted) {
    try {
      cursor = await streamSemanticGraphEventsOnce({ ...options, cursor });
    } catch (error) {
      if (options.signal.aborted) {
        return;
      }
      if (error instanceof SemanticGraphEventPayloadDecodeError) {
        cursor = error.cursor;
      }
      if (error instanceof SemanticGraphEventCursorResetError) {
        cursor = emptySemanticGraphEventCursor();
      }
      console.warn("Semantic graph event stream disconnected", error);
    }
    await sleepWithAbort(options.reconnectDelayMs, options.signal);
  }
}

async function streamSemanticGraphEventsOnce(options: {
  baseURL: string;
  cursor: SemanticGraphEventCursor;
  fetchImpl: BackendFetch;
  sendEvent: (event: SemanticGraphChangeEvent) => void;
  signal: AbortSignal;
}): Promise<SemanticGraphEventCursor> {
  const headers: Record<string, string> = {};
  if (options.cursor.streamId !== "") {
    headers["Last-Event-ID"] = encodeSemanticGraphEventCursor(options.cursor);
  }
  const response = await options.fetchImpl(
    new URL(backendEndpoints.SemanticGraphChangeEventStream.path, options.baseURL),
    {
      headers,
      method: backendEndpoints.SemanticGraphChangeEventStream.method,
      signal: options.signal,
    },
  );
  if (!response.ok) {
    if (response.status === 400 && options.cursor.streamId !== "") {
      throw new SemanticGraphEventCursorResetError(
        `semantic graph event stream cursor is no longer valid: ${encodeSemanticGraphEventCursor(
          options.cursor,
        )}`,
      );
    }
    throw new Error(`semantic graph event stream returned HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("semantic graph event stream returned no response body");
  }
  let cursor = options.cursor;
  for await (const message of parseServerSentEvents(response.body)) {
    if (options.signal.aborted) {
      return cursor;
    }
    const nextCursor = semanticGraphEventCursorFromServerSentEvent(message);
    const event = decodeSemanticGraphStreamEvent(message, nextCursor);
    if (isDuplicateSemanticGraphEvent(nextCursor, cursor)) {
      cursor = nextCursor;
      continue;
    }
    cursor = nextCursor;
    options.sendEvent(event);
  }
  return cursor;
}

class SemanticGraphEventPayloadDecodeError extends Error {
  constructor(
    message: string,
    readonly cursor: SemanticGraphEventCursor,
  ) {
    super(message);
  }
}

class SemanticGraphEventCursorResetError extends Error {}

function decodeSemanticGraphStreamEvent(
  message: { data: string },
  cursor: SemanticGraphEventCursor,
): SemanticGraphChangeEvent {
  try {
    return decodeSemanticGraphChangeEvent(JSON.parse(message.data));
  } catch (error) {
    throw new SemanticGraphEventPayloadDecodeError(
      error instanceof Error ? error.message : "semantic graph event stream payload decode failed",
      cursor,
    );
  }
}

function emptySemanticGraphEventCursor(): SemanticGraphEventCursor {
  return { sequence: 0, streamId: "" };
}

function encodeSemanticGraphEventCursor(cursor: SemanticGraphEventCursor): string {
  return `${cursor.streamId}:${cursor.sequence}`;
}

function semanticGraphEventCursorFromServerSentEvent(message: {
  id: string;
}): SemanticGraphEventCursor {
  const separator = message.id.lastIndexOf(":");
  if (separator <= 0 || separator === message.id.length - 1) {
    throw new Error("semantic graph event stream id is invalid: " + message.id);
  }
  const sequence = Number.parseInt(message.id.slice(separator + 1), 10);
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error("semantic graph event stream id sequence is invalid: " + message.id);
  }
  return { sequence, streamId: message.id.slice(0, separator) };
}

function isDuplicateSemanticGraphEvent(
  nextCursor: SemanticGraphEventCursor,
  cursor: SemanticGraphEventCursor,
): boolean {
  return nextCursor.streamId === cursor.streamId && nextCursor.sequence <= cursor.sequence;
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
