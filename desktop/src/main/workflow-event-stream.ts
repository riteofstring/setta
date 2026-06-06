import { backendEndpoints, decodeWorkflowEvent, type WorkflowEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { parseServerSentEvents } from "./backend-event-stream";

export interface WorkflowEventStream {
  done: Promise<void>;
  stop: () => Promise<void>;
}

interface WorkflowEventStreamOptions {
  baseURL: string;
  fetchImpl?: BackendFetch;
  reconnectDelayMs?: number;
  sendEvent: (event: WorkflowEvent) => void;
}

interface WorkflowEventCursor {
  sequence: number;
  streamId: string;
}

const defaultReconnectDelayMs = 500;

export function startWorkflowEventStream(options: WorkflowEventStreamOptions): WorkflowEventStream {
  const abort = new AbortController();
  const done = runWorkflowEventStreamLoop({
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

async function runWorkflowEventStreamLoop(options: {
  baseURL: string;
  fetchImpl: BackendFetch;
  reconnectDelayMs: number;
  sendEvent: (event: WorkflowEvent) => void;
  signal: AbortSignal;
}) {
  let cursor = emptyWorkflowEventCursor();
  while (!options.signal.aborted) {
    try {
      cursor = await streamWorkflowEventsOnce({ ...options, cursor });
    } catch (error) {
      if (options.signal.aborted) {
        return;
      }
      if (error instanceof WorkflowEventPayloadDecodeError) {
        cursor = error.cursor;
      }
      console.warn("Workflow event stream disconnected", error);
    }
    await sleepWithAbort(options.reconnectDelayMs, options.signal);
  }
}

async function streamWorkflowEventsOnce(options: {
  baseURL: string;
  cursor: WorkflowEventCursor;
  fetchImpl: BackendFetch;
  sendEvent: (event: WorkflowEvent) => void;
  signal: AbortSignal;
}): Promise<WorkflowEventCursor> {
  const headers: Record<string, string> = {};
  if (options.cursor.streamId !== "") {
    headers["Last-Event-ID"] = encodeWorkflowEventCursor(options.cursor);
  }
  const response = await options.fetchImpl(
    new URL(backendEndpoints.WorkflowEventStream.path, options.baseURL),
    {
      headers,
      method: backendEndpoints.WorkflowEventStream.method,
      signal: options.signal,
    },
  );
  if (!response.ok) {
    throw new Error(`workflow event stream returned HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("workflow event stream returned no response body");
  }
  let cursor = options.cursor;
  for await (const message of parseServerSentEvents(response.body)) {
    if (options.signal.aborted) {
      return cursor;
    }
    const nextCursor = workflowEventCursorFromServerSentEvent(message);
    const event = decodeWorkflowStreamEvent(message, nextCursor);
    if (isDuplicateWorkflowEvent(nextCursor, cursor)) {
      cursor = nextCursor;
      continue;
    }
    assertWorkflowEventStream(nextCursor, cursor);
    cursor = nextCursor;
    options.sendEvent(event);
  }
  return cursor;
}

class WorkflowEventPayloadDecodeError extends Error {
  constructor(
    message: string,
    readonly cursor: WorkflowEventCursor,
  ) {
    super(message);
  }
}

function decodeWorkflowStreamEvent(
  message: { data: string },
  cursor: WorkflowEventCursor,
): WorkflowEvent {
  try {
    return decodeWorkflowEvent(JSON.parse(message.data));
  } catch (error) {
    throw new WorkflowEventPayloadDecodeError(
      error instanceof Error ? error.message : "workflow event stream payload decode failed",
      cursor,
    );
  }
}

function emptyWorkflowEventCursor(): WorkflowEventCursor {
  return { sequence: 0, streamId: "" };
}

function encodeWorkflowEventCursor(cursor: WorkflowEventCursor): string {
  return `${cursor.streamId}:${cursor.sequence}`;
}

function workflowEventCursorFromServerSentEvent(message: { id: string }): WorkflowEventCursor {
  const separator = message.id.lastIndexOf(":");
  if (separator <= 0 || separator === message.id.length - 1) {
    throw new Error("workflow event stream id is invalid: " + message.id);
  }
  const sequence = Number.parseInt(message.id.slice(separator + 1), 10);
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error("workflow event stream id sequence is invalid: " + message.id);
  }
  return { sequence, streamId: message.id.slice(0, separator) };
}

function isDuplicateWorkflowEvent(
  nextCursor: WorkflowEventCursor,
  cursor: WorkflowEventCursor,
): boolean {
  return nextCursor.streamId === cursor.streamId && nextCursor.sequence <= cursor.sequence;
}

function assertWorkflowEventStream(nextCursor: WorkflowEventCursor, cursor: WorkflowEventCursor) {
  if (cursor.streamId === "" || nextCursor.streamId === cursor.streamId) {
    return;
  }
  throw new Error(
    `workflow event stream changed stream id: ${cursor.streamId} -> ${nextCursor.streamId}`,
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
