import { backendEndpoints, decodeChatEvent, type ChatEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";

export interface BackendEventStream {
  done: Promise<void>;
  stop: () => Promise<void>;
}

interface BackendEventStreamOptions {
  baseURL: string;
  fetchImpl?: BackendFetch;
  observer?: BackendEventStreamObserver;
  reconnect?: BackendEventStreamReconnectOptions;
  sendEvent: (event: ChatEvent) => void;
}

interface BackendEventStreamObserver {
  forwarded: (event: ChatEvent) => void;
  lifecycle: (event: BackendEventStreamLifecycleEvent) => void;
}

interface BackendEventStreamLifecycleEvent {
  attempt: number;
  lastSequence: number;
  message: string;
  type: "connecting" | "connected" | "disconnected" | "error" | "stopped";
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
  baseURL: string;
  fetchImpl: BackendFetch;
  observer: BackendEventStreamObserver | undefined;
  reconnect: BackendEventStreamReconnectOptions;
  sendEvent: (event: ChatEvent) => void;
  signal: AbortSignal;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
}) {
  let attempt = 0;
  let lastSequence = 0;
  while (!options.signal.aborted) {
    lastSequence = await runStreamAttempt({ ...options, attempt, lastSequence });
    if (!options.signal.aborted) {
      await options.sleep(backoffMs(attempt, options.reconnect), options.signal);
      attempt += 1;
    }
  }
  options.observer?.lifecycle({
    attempt,
    lastSequence,
    message: "backend event stream stopped",
    type: "stopped",
  });
}

async function runStreamAttempt(options: {
  attempt: number;
  baseURL: string;
  fetchImpl: BackendFetch;
  lastSequence: number;
  observer: BackendEventStreamObserver | undefined;
  sendEvent: (event: ChatEvent) => void;
  signal: AbortSignal;
}): Promise<number> {
  options.observer?.lifecycle({
    attempt: options.attempt,
    lastSequence: options.lastSequence,
    message: "connecting to backend event stream",
    type: "connecting",
  });
  try {
    const lastSequence = await streamOnce(options);
    recordDisconnected(options.observer, options.attempt, lastSequence, options.signal);
    return lastSequence;
  } catch (error) {
    recordStreamError(
      options.observer,
      options.attempt,
      options.lastSequence,
      error,
      options.signal,
    );
    return options.lastSequence;
  }
}

function recordDisconnected(
  observer: BackendEventStreamObserver | undefined,
  attempt: number,
  lastSequence: number,
  signal: AbortSignal,
) {
  if (signal.aborted) {
    return;
  }
  observer?.lifecycle({
    attempt,
    lastSequence,
    message: "backend event stream disconnected",
    type: "disconnected",
  });
}

function recordStreamError(
  observer: BackendEventStreamObserver | undefined,
  attempt: number,
  lastSequence: number,
  error: unknown,
  signal: AbortSignal,
) {
  if (signal.aborted) {
    return;
  }
  observer?.lifecycle({
    attempt,
    lastSequence,
    message: error instanceof Error ? error.message : "backend event stream failed",
    type: "error",
  });
}

async function streamOnce(options: {
  attempt: number;
  baseURL: string;
  fetchImpl: BackendFetch;
  lastSequence: number;
  observer: BackendEventStreamObserver | undefined;
  sendEvent: (event: ChatEvent) => void;
  signal: AbortSignal;
}): Promise<number> {
  const headers: Record<string, string> = {};
  if (options.lastSequence > 0) {
    headers["Last-Event-ID"] = String(options.lastSequence);
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
    attempt: options.attempt,
    lastSequence: options.lastSequence,
    message: "connected to backend event stream",
    type: "connected",
  });

  let lastSequence = options.lastSequence;
  for await (const message of parseServerSentEvents(response.body)) {
    if (options.signal.aborted) {
      break;
    }
    const event = decodeChatEvent(JSON.parse(message.data));
    if (event.sequence <= lastSequence) {
      continue;
    }
    lastSequence = event.sequence;
    options.sendEvent(event);
    options.observer?.forwarded(event);
  }
  return lastSequence;
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
