import {
  backendEndpoints,
  decodeWorkspaceActivityEvent,
  type WorkspaceActivityEvent,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { parseServerSentEvents } from "./backend-event-stream";

export interface WorkspaceActivityEventStream {
  done: Promise<void>;
  stop: () => Promise<void>;
}

interface WorkspaceActivityEventStreamOptions {
  baseURL: string;
  fetchImpl?: BackendFetch;
  reconnectDelayMs?: number;
  sendEvent: (event: WorkspaceActivityEvent) => void;
}

interface WorkspaceActivityEventCursor {
  sequence: number;
  streamId: string;
}

const defaultReconnectDelayMs = 500;

export function startWorkspaceActivityEventStream(
  options: WorkspaceActivityEventStreamOptions,
): WorkspaceActivityEventStream {
  const abort = new AbortController();
  const done = runWorkspaceActivityEventStreamLoop({
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

async function runWorkspaceActivityEventStreamLoop(options: {
  baseURL: string;
  fetchImpl: BackendFetch;
  reconnectDelayMs: number;
  sendEvent: (event: WorkspaceActivityEvent) => void;
  signal: AbortSignal;
}) {
  let cursor = emptyWorkspaceActivityEventCursor();
  while (!options.signal.aborted) {
    try {
      cursor = await streamWorkspaceActivityEventsOnce({ ...options, cursor });
    } catch (error) {
      if (options.signal.aborted) {
        return;
      }
      if (error instanceof WorkspaceActivityEventPayloadDecodeError) {
        cursor = error.cursor;
      }
      console.warn("Workspace activity event stream disconnected", error);
    }
    await sleepWithAbort(options.reconnectDelayMs, options.signal);
  }
}

async function streamWorkspaceActivityEventsOnce(options: {
  baseURL: string;
  cursor: WorkspaceActivityEventCursor;
  fetchImpl: BackendFetch;
  sendEvent: (event: WorkspaceActivityEvent) => void;
  signal: AbortSignal;
}): Promise<WorkspaceActivityEventCursor> {
  const headers: Record<string, string> = {};
  if (options.cursor.streamId !== "") {
    headers["Last-Event-ID"] = encodeWorkspaceActivityEventCursor(options.cursor);
  }
  const response = await options.fetchImpl(
    new URL(backendEndpoints.WorkspaceActivityEventStream.path, options.baseURL),
    {
      headers,
      method: backendEndpoints.WorkspaceActivityEventStream.method,
      signal: options.signal,
    },
  );
  if (!response.ok) {
    throw new Error(`workspace activity event stream returned HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("workspace activity event stream returned no response body");
  }
  let cursor = options.cursor;
  for await (const message of parseServerSentEvents(response.body)) {
    if (options.signal.aborted) {
      return cursor;
    }
    const nextCursor = workspaceActivityEventCursorFromServerSentEvent(message);
    const event = decodeWorkspaceActivityStreamEvent(message, nextCursor);
    if (isDuplicateWorkspaceActivityEvent(nextCursor, cursor)) {
      cursor = nextCursor;
      continue;
    }
    assertWorkspaceActivityEventStream(nextCursor, cursor, event);
    cursor = nextCursor;
    options.sendEvent(event);
  }
  return cursor;
}

class WorkspaceActivityEventPayloadDecodeError extends Error {
  constructor(
    message: string,
    readonly cursor: WorkspaceActivityEventCursor,
  ) {
    super(message);
  }
}

function decodeWorkspaceActivityStreamEvent(
  message: { data: string },
  cursor: WorkspaceActivityEventCursor,
): WorkspaceActivityEvent {
  try {
    return decodeWorkspaceActivityEvent(JSON.parse(message.data));
  } catch (error) {
    throw new WorkspaceActivityEventPayloadDecodeError(
      error instanceof Error
        ? error.message
        : "workspace activity event stream payload decode failed",
      cursor,
    );
  }
}

function emptyWorkspaceActivityEventCursor(): WorkspaceActivityEventCursor {
  return { sequence: 0, streamId: "" };
}

function encodeWorkspaceActivityEventCursor(cursor: WorkspaceActivityEventCursor): string {
  return `${cursor.streamId}:${cursor.sequence}`;
}

function workspaceActivityEventCursorFromServerSentEvent(message: {
  id: string;
}): WorkspaceActivityEventCursor {
  const separator = message.id.lastIndexOf(":");
  if (separator <= 0 || separator === message.id.length - 1) {
    throw new Error("workspace activity event stream id is invalid: " + message.id);
  }
  const sequence = Number.parseInt(message.id.slice(separator + 1), 10);
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error("workspace activity event stream id sequence is invalid: " + message.id);
  }
  return { sequence, streamId: message.id.slice(0, separator) };
}

function isDuplicateWorkspaceActivityEvent(
  nextCursor: WorkspaceActivityEventCursor,
  cursor: WorkspaceActivityEventCursor,
): boolean {
  return nextCursor.streamId === cursor.streamId && nextCursor.sequence <= cursor.sequence;
}

function assertWorkspaceActivityEventStream(
  nextCursor: WorkspaceActivityEventCursor,
  cursor: WorkspaceActivityEventCursor,
  event: WorkspaceActivityEvent,
) {
  if (
    cursor.streamId === "" ||
    nextCursor.streamId === cursor.streamId ||
    event.type === "workspace_activity.resync_required"
  ) {
    return;
  }
  throw new Error(
    `workspace activity event stream changed stream id: ${cursor.streamId} -> ${nextCursor.streamId}`,
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
