import { backendEndpoints, decodeChatEvent, type ChatEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import type { BackendEventStreamStatus } from "@shared/types";

export interface BackendEventStream {
  done: Promise<void>;
  stop: () => Promise<void>;
}

interface BackendEventStreamOptions {
  authToken?: string;
  baseURL: string;
  fetchImpl?: BackendFetch;
  observer?: BackendEventStreamObserver;
  reconnect?: BackendEventStreamReconnectOptions;
  sendEvent: (event: ChatEvent) => void;
}

interface BackendEventStreamObserver {
  forwarded: (event: ChatEvent) => void;
  lifecycle: (event: BackendEventStreamStatus) => void;
}

interface BackendEventStreamReconnectOptions {
  initialDelayMs: number;
  maxDelayMs: number;
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

interface ServerSentEvent {
  data: string;
  event: string;
  id: string;
}

interface ServerSentEventState {
  data: string[];
  event: string;
  id: string;
}

interface EventCursor {
  sequence: number;
  streamId: string;
}

interface StreamOnceOptions {
  attempt: number;
  authToken: string;
  baseURL: string;
  cursor: EventCursor;
  fetchImpl: BackendFetch;
  observer: BackendEventStreamObserver | undefined;
  sendEvent: (event: ChatEvent) => void;
  signal: AbortSignal;
  updateCursor: (cursor: EventCursor) => void;
}

class EventPayloadDecodeError extends Error {
  constructor(
    message: string,
    readonly cursor: EventCursor,
  ) {
    super(message);
  }
}

const defaultReconnect: BackendEventStreamReconnectOptions = {
  initialDelayMs: 250,
  maxDelayMs: 5_000,
};

export function startBackendEventStream(options: BackendEventStreamOptions): BackendEventStream {
  const abort = new AbortController();
  const fetchImpl = options.fetchImpl ?? fetch;
  const reconnect = { ...defaultReconnect, ...options.reconnect };
  const sleep = reconnect.sleep ?? sleepWithAbort;
  const done = runEventStreamLoop({
    authToken: options.authToken ?? "",
    baseURL: options.baseURL,
    fetchImpl,
    observer: options.observer,
    reconnect,
    sendEvent: options.sendEvent,
    signal: abort.signal,
    sleep,
  });

  return {
    done,
    stop: async () => {
      abort.abort();
      await done;
    },
  };
}

async function runEventStreamLoop(options: {
  authToken: string;
  baseURL: string;
  fetchImpl: BackendFetch;
  observer: BackendEventStreamObserver | undefined;
  reconnect: BackendEventStreamReconnectOptions;
  sendEvent: (event: ChatEvent) => void;
  signal: AbortSignal;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
}) {
  let attempt = 0;
  let cursor = emptyEventCursor();
  while (!options.signal.aborted) {
    cursor = await runStreamAttempt({ ...options, attempt, cursor });
    if (!options.signal.aborted) {
      await options.sleep(backoffMs(attempt, options.reconnect), options.signal);
      attempt += 1;
    }
  }
  options.observer?.lifecycle({
    message: "backend event stream stopped",
    status: "stopped",
  });
}

async function runStreamAttempt(options: {
  attempt: number;
  authToken: string;
  baseURL: string;
  cursor: EventCursor;
  fetchImpl: BackendFetch;
  observer: BackendEventStreamObserver | undefined;
  sendEvent: (event: ChatEvent) => void;
  signal: AbortSignal;
}): Promise<EventCursor> {
  options.observer?.lifecycle({
    attempt: options.attempt,
    message: "connecting to backend event stream",
    status: "connecting",
  });
  let cursor = options.cursor;
  try {
    cursor = await streamOnce({
      ...options,
      updateCursor: (nextCursor) => {
        cursor = nextCursor;
      },
    });
    recordDisconnected(options.observer, options.attempt, cursor, options.signal);
    return cursor;
  } catch (error) {
    recordStreamError(options.observer, options.attempt, cursor, error, options.signal);
    return cursor;
  }
}

function recordDisconnected(
  observer: BackendEventStreamObserver | undefined,
  attempt: number,
  cursor: EventCursor,
  signal: AbortSignal,
) {
  if (signal.aborted) {
    return;
  }
  observer?.lifecycle({
    attempt,
    ...cursorLifecycleFields(cursor),
    message: "backend event stream disconnected",
    status: "reconnecting",
  });
}

function recordStreamError(
  observer: BackendEventStreamObserver | undefined,
  attempt: number,
  cursor: EventCursor,
  error: unknown,
  signal: AbortSignal,
) {
  if (signal.aborted) {
    return;
  }
  if (error instanceof EventPayloadDecodeError) {
    observer?.lifecycle({
      ...cursorLifecycleFields(error.cursor),
      message: error.message,
      status: "resyncing",
    });
    return;
  }
  observer?.lifecycle({
    attempt,
    ...cursorLifecycleFields(cursor),
    message: error instanceof Error ? error.message : "backend event stream failed",
    status: "reconnecting",
  });
}

async function streamOnce(options: StreamOnceOptions): Promise<EventCursor> {
  const headers: Record<string, string> = {};
  if (options.authToken !== "") {
    headers.Authorization = `Bearer ${options.authToken}`;
  }
  if (options.cursor.streamId !== "") {
    headers["Last-Event-ID"] = encodeEventCursor(options.cursor);
  }
  const response = await options.fetchImpl(
    new URL(backendEndpoints.EventStream.path, options.baseURL),
    {
      headers,
      method: backendEndpoints.EventStream.method,
      signal: options.signal,
    },
  );
  if (!response.ok) {
    throw new Error(`backend event stream returned HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("backend event stream returned no response body");
  }
  options.observer?.lifecycle({
    ...cursorLifecycleFields(options.cursor),
    message: "connected to backend event stream",
    status: "connected",
  });

  let cursor = options.cursor;
  for await (const message of parseServerSentEvents(response.body)) {
    if (options.signal.aborted) {
      break;
    }
    cursor = handleStreamMessage(options, message, cursor);
  }
  return cursor;
}

function handleStreamMessage(
  options: StreamOnceOptions,
  message: ServerSentEvent,
  cursor: EventCursor,
): EventCursor {
  const event = decodeStreamEvent(message, options.updateCursor);
  if (event.type === "chat.resync_required") {
    return handleResyncRequiredEvent(options, event);
  }
  if (isDuplicateEvent(event, cursor)) {
    return cursor;
  }
  assertEventStream(event, cursor);
  const nextCursor = eventCursor(event);
  options.updateCursor(nextCursor);
  forwardEvent(options, event);
  return nextCursor;
}

function decodeStreamEvent(
  message: ServerSentEvent,
  updateCursor: (cursor: EventCursor) => void,
): ChatEvent {
  try {
    return decodeChatEvent(JSON.parse(message.data));
  } catch (error) {
    const nextCursor = eventCursorFromServerSentEvent(message);
    updateCursor(nextCursor);
    throw new EventPayloadDecodeError(
      error instanceof Error ? error.message : "backend event stream payload decode failed",
      nextCursor,
    );
  }
}

function handleResyncRequiredEvent(
  options: StreamOnceOptions,
  event: Extract<ChatEvent, { type: "chat.resync_required" }>,
): EventCursor {
  const cursor = resyncEventCursor(event);
  options.updateCursor(cursor);
  options.observer?.lifecycle({
    ...cursorLifecycleFields(cursor),
    message: event.payload.reason,
    status: "resyncing",
  });
  forwardEvent(options, event);
  return cursor;
}

function emptyEventCursor(): EventCursor {
  return { sequence: 0, streamId: "" };
}

function cursorLifecycleFields(cursor: EventCursor) {
  return {
    lastSequence: cursor.sequence,
    lastStreamId: cursor.streamId,
  };
}

function encodeEventCursor(cursor: EventCursor): string {
  return `${cursor.streamId}:${cursor.sequence}`;
}

function eventCursor(event: ChatEvent): EventCursor {
  return { sequence: event.sequence, streamId: event.streamId };
}

function eventCursorFromServerSentEvent(message: ServerSentEvent): EventCursor {
  const separator = message.id.lastIndexOf(":");
  if (separator <= 0 || separator === message.id.length - 1) {
    throw new Error("backend event stream payload failed and event id is invalid: " + message.id);
  }
  const sequence = Number.parseInt(message.id.slice(separator + 1), 10);
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error(
      "backend event stream payload failed and event id sequence is invalid: " + message.id,
    );
  }
  return { sequence, streamId: message.id.slice(0, separator) };
}

function resyncEventCursor(
  event: Extract<ChatEvent, { type: "chat.resync_required" }>,
): EventCursor {
  return {
    sequence: event.payload.currentSequence,
    streamId: event.payload.currentStreamId,
  };
}

function isDuplicateEvent(event: ChatEvent, cursor: EventCursor): boolean {
  return event.streamId === cursor.streamId && event.sequence <= cursor.sequence;
}

function assertEventStream(event: ChatEvent, cursor: EventCursor) {
  if (cursor.streamId === "" || event.streamId === cursor.streamId) {
    return;
  }
  throw new Error(
    `backend event stream changed stream id without resync: ${cursor.streamId} -> ${event.streamId}`,
  );
}

function forwardEvent(
  options: {
    observer: BackendEventStreamObserver | undefined;
    sendEvent: (event: ChatEvent) => void;
  },
  event: ChatEvent,
) {
  options.sendEvent(event);
  options.observer?.forwarded(event);
}

export async function* parseServerSentEvents(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<ServerSentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let state = emptyEventState();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffered += decoder.decode();
      break;
    }
    buffered += decoder.decode(value, { stream: true });

    let line = nextLine(buffered);
    while (line) {
      buffered = line.remaining;
      const event = applyServerSentEventLine(state, line.value);
      if (event) {
        yield event;
        state = emptyEventState();
      }
      line = nextLine(buffered);
    }
  }

  if (buffered !== "") {
    const event = applyServerSentEventLine(state, trimLineEnding(buffered));
    if (event) {
      yield event;
      state = emptyEventState();
    }
  }
  const finalEvent = dispatchServerSentEvent(state);
  if (finalEvent) {
    yield finalEvent;
  }
}

function applyServerSentEventLine(
  state: ServerSentEventState,
  line: string,
): ServerSentEvent | null {
  if (line === "") {
    return dispatchServerSentEvent(state);
  }
  if (line.startsWith(":")) {
    return null;
  }
  const field = parseServerSentEventField(line);
  applyServerSentEventField(state, field.name, field.value);
  return null;
}

function parseServerSentEventField(line: string): { name: string; value: string } {
  const separator = line.indexOf(":");
  const name = separator === -1 ? line : line.slice(0, separator);
  let value = separator === -1 ? "" : line.slice(separator + 1);
  if (value.startsWith(" ")) {
    value = value.slice(1);
  }
  return { name, value };
}

function applyServerSentEventField(state: ServerSentEventState, field: string, value: string) {
  switch (field) {
    case "data":
      state.data.push(value);
      return;
    case "event":
      state.event = value;
      return;
    case "id":
      state.id = value;
      return;
    case "retry":
      return;
    default:
      return;
  }
}

function dispatchServerSentEvent(state: ServerSentEventState): ServerSentEvent | null {
  if (state.data.length === 0) {
    state.event = "";
    state.id = "";
    return null;
  }
  const event = {
    data: state.data.join("\n"),
    event: state.event,
    id: state.id,
  };
  state.data = [];
  state.event = "";
  state.id = "";
  return event;
}

function emptyEventState(): ServerSentEventState {
  return { data: [], event: "", id: "" };
}

function nextLine(value: string): { remaining: string; value: string } | null {
  const index = value.indexOf("\n");
  if (index === -1) {
    return null;
  }
  return {
    remaining: value.slice(index + 1),
    value: trimLineEnding(value.slice(0, index)),
  };
}

function trimLineEnding(value: string): string {
  return value.endsWith("\r") ? value.slice(0, -1) : value;
}

function backoffMs(attempt: number, reconnect: BackendEventStreamReconnectOptions): number {
  const delay = reconnect.initialDelayMs * 2 ** attempt;
  return Math.min(delay, reconnect.maxDelayMs);
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
