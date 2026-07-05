import type { BackendFetch } from "@shared/backend-runtime";
import { parseServerSentEvents, type ServerSentEvent } from "@shared/server-sent-events";
import type { BackendEventStreamStatus } from "@shared/types";
import { errorMessage, sleepWithAbort } from "./setta-web-api-utils";

const reconnectDelayMs = 500;

export interface StreamCursor {
  sequence: number;
  streamId: string;
}

type StreamDecode<T> = (value: unknown, message: ServerSentEvent) => T;
type StreamCursorForEvent<T> = (event: T, message: ServerSentEvent) => StreamCursor;

export interface WebEventStreamOptions<T> {
  baseURL: string;
  cursorForEvent: StreamCursorForEvent<T>;
  decode: StreamDecode<T>;
  endpoint: { method: string; path: string };
  fetchImpl: BackendFetch;
  lifecycle?: (status: BackendEventStreamStatus) => void;
  query?: Record<string, string>;
  sendEvent: (event: T) => void;
  streamName: string;
}

export function startWebBackendEventStream<T>(
  options: WebEventStreamOptions<T> & { authToken: string },
): () => void {
  const abort = new AbortController();
  void runWebEventStreamLoop({
    ...options,
    signal: abort.signal,
  });
  return () => {
    abort.abort();
  };
}

async function runWebEventStreamLoop<T>(
  options: WebEventStreamOptions<T> & {
    authToken: string;
    signal: AbortSignal;
  },
) {
  let attempt = 0;
  let cursor = emptyStreamCursor();
  while (!options.signal.aborted) {
    options.lifecycle?.({
      attempt,
      message: "connecting to backend event stream",
      status: "connecting",
    });
    try {
      cursor = await streamWebEventsOnce({ ...options, cursor });
      if (!options.signal.aborted) {
        options.lifecycle?.({
          attempt,
          lastSequence: cursor.sequence,
          lastStreamId: cursor.streamId,
          message: "backend event stream disconnected",
          status: "reconnecting",
        });
      }
    } catch (error) {
      if (!options.signal.aborted) {
        options.lifecycle?.({
          attempt,
          lastSequence: cursor.sequence,
          lastStreamId: cursor.streamId,
          message: errorMessage(error),
          status: "reconnecting",
        });
      }
    }
    attempt += 1;
    await sleepWithAbort(reconnectDelayMs, options.signal);
  }
  options.lifecycle?.({
    message: "backend event stream stopped",
    status: "stopped",
  });
}

async function streamWebEventsOnce<T>(
  options: WebEventStreamOptions<T> & {
    authToken: string;
    cursor: StreamCursor;
    signal: AbortSignal;
  },
): Promise<StreamCursor> {
  const headers: Record<string, string> = { Authorization: `Bearer ${options.authToken}` };
  if (options.cursor.streamId !== "") {
    headers["Last-Event-ID"] = `${options.cursor.streamId}:${options.cursor.sequence}`;
  }
  const response = await options.fetchImpl(eventStreamURL(options), {
    headers,
    method: options.endpoint.method,
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`${options.streamName} returned HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error(`${options.streamName} returned no response body`);
  }
  options.lifecycle?.({
    lastSequence: options.cursor.sequence,
    lastStreamId: options.cursor.streamId,
    message: "connected to backend event stream",
    status: "connected",
  });
  let cursor = options.cursor;
  for await (const message of parseServerSentEvents(response.body)) {
    if (options.signal.aborted) {
      return cursor;
    }
    const event = decodeStreamMessage(message, options.decode, options.streamName);
    const nextCursor = options.cursorForEvent(event, message);
    if (nextCursor.streamId === cursor.streamId && nextCursor.sequence <= cursor.sequence) {
      continue;
    }
    cursor = nextCursor;
    options.sendEvent(event);
  }
  return cursor;
}

function eventStreamURL(options: {
  baseURL: string;
  endpoint: { path: string };
  query?: Record<string, string>;
}): URL {
  const url = new URL(options.endpoint.path, options.baseURL);
  for (const [name, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(name, value);
  }
  return url;
}

function decodeStreamMessage<T>(
  message: ServerSentEvent,
  decode: StreamDecode<T>,
  streamName: string,
): T {
  try {
    return decode(JSON.parse(message.data), message);
  } catch (error) {
    throw new Error(`${streamName} payload decode failed: ${errorMessage(error)}`, {
      cause: error,
    });
  }
}

function emptyStreamCursor(): StreamCursor {
  return { sequence: 0, streamId: "" };
}

export function cursorFromStreamedEvent(event: StreamCursor): StreamCursor {
  return { sequence: event.sequence, streamId: event.streamId };
}

export function cursorFromServerSentEvent(
  message: ServerSentEvent,
  streamName: string,
): StreamCursor {
  const separator = message.id.lastIndexOf(":");
  if (separator <= 0 || separator === message.id.length - 1) {
    throw new Error(`${streamName} id is invalid: ${message.id}`);
  }
  const sequence = Number.parseInt(message.id.slice(separator + 1), 10);
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error(`${streamName} id sequence is invalid: ${message.id}`);
  }
  return { sequence, streamId: message.id.slice(0, separator) };
}
