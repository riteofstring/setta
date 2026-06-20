import {
  backendEndpoints,
  decodeWorkspaceTrajectoryRuntimeEvent,
  type WorkspaceTrajectoryRuntimeEvent,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { parseServerSentEvents } from "./backend-event-stream";

export interface WorkspaceTrajectoryRuntimeEventStream {
  done: Promise<void>;
  stop: () => Promise<void>;
}

interface WorkspaceTrajectoryRuntimeEventStreamOptions {
  baseURL: string;
  fetchImpl?: BackendFetch;
  reconnectDelayMs?: number;
  sendEvent: (event: WorkspaceTrajectoryRuntimeEvent) => void;
}

interface WorkspaceTrajectoryRuntimeEventCursor {
  sequence: number;
  streamId: string;
}

const defaultReconnectDelayMs = 500;

export function startWorkspaceTrajectoryRuntimeEventStream(
  options: WorkspaceTrajectoryRuntimeEventStreamOptions,
): WorkspaceTrajectoryRuntimeEventStream {
  const abort = new AbortController();
  const done = runWorkspaceTrajectoryRuntimeEventStreamLoop({
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

async function runWorkspaceTrajectoryRuntimeEventStreamLoop(options: {
  baseURL: string;
  fetchImpl: BackendFetch;
  reconnectDelayMs: number;
  sendEvent: (event: WorkspaceTrajectoryRuntimeEvent) => void;
  signal: AbortSignal;
}) {
  let cursor = emptyWorkspaceTrajectoryRuntimeEventCursor();
  while (!options.signal.aborted) {
    try {
      cursor = await streamWorkspaceTrajectoryRuntimeEventsOnce({ ...options, cursor });
    } catch (error) {
      if (options.signal.aborted) {
        return;
      }
      if (error instanceof WorkspaceTrajectoryRuntimeEventPayloadDecodeError) {
        cursor = error.cursor;
      }
      if (error instanceof WorkspaceTrajectoryRuntimeEventCursorResetError) {
        cursor = emptyWorkspaceTrajectoryRuntimeEventCursor();
      }
      console.warn("Workspace trajectory runtime event stream disconnected", error);
    }
    await sleepWithAbort(options.reconnectDelayMs, options.signal);
  }
}

async function streamWorkspaceTrajectoryRuntimeEventsOnce(options: {
  baseURL: string;
  cursor: WorkspaceTrajectoryRuntimeEventCursor;
  fetchImpl: BackendFetch;
  sendEvent: (event: WorkspaceTrajectoryRuntimeEvent) => void;
  signal: AbortSignal;
}): Promise<WorkspaceTrajectoryRuntimeEventCursor> {
  const headers: Record<string, string> = {};
  if (options.cursor.streamId !== "") {
    headers["Last-Event-ID"] = encodeWorkspaceTrajectoryRuntimeEventCursor(options.cursor);
  }
  const response = await options.fetchImpl(
    new URL(backendEndpoints.WorkspaceTrajectoryRuntimeEventStream.path, options.baseURL),
    {
      headers,
      method: backendEndpoints.WorkspaceTrajectoryRuntimeEventStream.method,
      signal: options.signal,
    },
  );
  if (!response.ok) {
    if (response.status === 400 && options.cursor.streamId !== "") {
      throw new WorkspaceTrajectoryRuntimeEventCursorResetError(
        `workspace trajectory runtime event stream cursor is no longer valid: ${encodeWorkspaceTrajectoryRuntimeEventCursor(
          options.cursor,
        )}`,
      );
    }
    throw new Error(`workspace trajectory runtime event stream returned HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("workspace trajectory runtime event stream returned no response body");
  }
  let cursor = options.cursor;
  for await (const message of parseServerSentEvents(response.body)) {
    if (options.signal.aborted) {
      return cursor;
    }
    const nextCursor = workspaceTrajectoryRuntimeEventCursorFromServerSentEvent(message);
    const event = decodeWorkspaceTrajectoryRuntimeStreamEvent(message, nextCursor);
    if (isDuplicateWorkspaceTrajectoryRuntimeEvent(nextCursor, cursor)) {
      cursor = nextCursor;
      continue;
    }
    cursor = nextCursor;
    options.sendEvent(event);
  }
  return cursor;
}

class WorkspaceTrajectoryRuntimeEventPayloadDecodeError extends Error {
  constructor(
    message: string,
    readonly cursor: WorkspaceTrajectoryRuntimeEventCursor,
  ) {
    super(message);
  }
}

class WorkspaceTrajectoryRuntimeEventCursorResetError extends Error {}

function decodeWorkspaceTrajectoryRuntimeStreamEvent(
  message: { data: string },
  cursor: WorkspaceTrajectoryRuntimeEventCursor,
): WorkspaceTrajectoryRuntimeEvent {
  try {
    return decodeWorkspaceTrajectoryRuntimeEvent(JSON.parse(message.data));
  } catch (error) {
    throw new WorkspaceTrajectoryRuntimeEventPayloadDecodeError(
      error instanceof Error
        ? error.message
        : "workspace trajectory runtime event stream payload decode failed",
      cursor,
    );
  }
}

function emptyWorkspaceTrajectoryRuntimeEventCursor(): WorkspaceTrajectoryRuntimeEventCursor {
  return { sequence: 0, streamId: "" };
}

function encodeWorkspaceTrajectoryRuntimeEventCursor(
  cursor: WorkspaceTrajectoryRuntimeEventCursor,
): string {
  return `${cursor.streamId}:${cursor.sequence}`;
}

function workspaceTrajectoryRuntimeEventCursorFromServerSentEvent(message: {
  id: string;
}): WorkspaceTrajectoryRuntimeEventCursor {
  const separator = message.id.lastIndexOf(":");
  if (separator <= 0 || separator === message.id.length - 1) {
    throw new Error("workspace trajectory runtime event stream id is invalid: " + message.id);
  }
  const sequence = Number.parseInt(message.id.slice(separator + 1), 10);
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error(
      "workspace trajectory runtime event stream id sequence is invalid: " + message.id,
    );
  }
  return { sequence, streamId: message.id.slice(0, separator) };
}

function isDuplicateWorkspaceTrajectoryRuntimeEvent(
  nextCursor: WorkspaceTrajectoryRuntimeEventCursor,
  cursor: WorkspaceTrajectoryRuntimeEventCursor,
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
