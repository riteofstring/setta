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
  cursorChanged?: (cursor: StreamCursor) => void;
  cursorForEvent: StreamCursorForEvent<T>;
  decode: StreamDecode<T>;
  endpoint: { method: string; path: string };
  fetchImpl: BackendFetch;
  initialCursor?: StreamCursor;
  isCursorResetEvent?: (event: T) => boolean;
  lifecycle?: (status: BackendEventStreamStatus) => void;
  sendEvent: (event: T) => void;
  streamName: string;
}

interface RunningWebEventStreamOptions<T> extends WebEventStreamOptions<T> {
  authToken: string;
  signal: AbortSignal;
}

export function startWebBackendEventStream<T>(
  options: WebEventStreamOptions<T> & { authToken: string },
): () => void {
  const abort = new AbortController();
  void runWebEventStreamLoop({ ...options, signal: abort.signal });
  return () => abort.abort();
}

async function runWebEventStreamLoop<T>(options: RunningWebEventStreamOptions<T>) {
  let attempt = 0;
  let cursor = options.initialCursor ?? emptyStreamCursor();
  while (!options.signal.aborted) {
    emitLifecycle(options, {
      attempt,
      message: "connecting to backend event stream",
      status: "connecting",
    });
    try {
      cursor = await streamWebEventsOnce({ ...options, cursor });
      emitReconnectLifecycle(options, attempt, cursor, "backend event stream disconnected");
    } catch (error) {
      emitReconnectLifecycle(options, attempt, cursor, errorMessage(error));
    }
    attempt += 1;
    await sleepWithAbort(reconnectDelayMs, options.signal);
  }
  emitLifecycle(options, { message: "backend event stream stopped", status: "stopped" });
}

function emitReconnectLifecycle<T>(
  options: RunningWebEventStreamOptions<T>,
  attempt: number,
  cursor: StreamCursor,
  message: string,
) {
  if (options.signal.aborted) {
    return;
  }
  emitLifecycle(options, {
    attempt,
    lastSequence: cursor.sequence,
    lastStreamId: cursor.streamId,
    message,
    status: "reconnecting",
  });
}

function emitLifecycle<T>(
  options: Pick<RunningWebEventStreamOptions<T>, "lifecycle">,
  status: BackendEventStreamStatus,
) {
  if (options.lifecycle) {
    options.lifecycle(status);
  }
}

async function streamWebEventsOnce<T>(
  options: RunningWebEventStreamOptions<T> & { cursor: StreamCursor },
): Promise<StreamCursor> {
  const headers: Record<string, string> = { Authorization: `Bearer ${options.authToken}` };
  if (options.cursor.streamId !== "") {
    headers["Last-Event-ID"] = `${options.cursor.streamId}:${options.cursor.sequence}`;
  }
  const response = await options.fetchImpl(new URL(options.endpoint.path, options.baseURL), {
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
  emitLifecycle(options, {
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
    const resetsCursor = options.isCursorResetEvent?.(event) ?? false;
    if (streamEventIsDuplicate(cursor, nextCursor, resetsCursor)) {
      continue;
    }
    cursor = nextCursor;
    publishCursor(options.cursorChanged, cursor);
    options.sendEvent(event);
  }
  return cursor;
}

function publishCursor(
  cursorChanged: WebEventStreamOptions<unknown>["cursorChanged"],
  cursor: StreamCursor,
): void {
  if (cursorChanged) {
    cursorChanged(cursor);
  }
}

function streamEventIsDuplicate(
  current: StreamCursor,
  next: StreamCursor,
  resetsCursor: boolean,
): boolean {
  return !resetsCursor && next.streamId === current.streamId && next.sequence <= current.sequence;
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
