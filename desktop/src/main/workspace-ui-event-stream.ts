import {
  backendEndpoints,
  decodeWorkspaceUIEvent,
  type WorkspaceUIEvent,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { parseServerSentEvents } from "./backend-event-stream";

export interface WorkspaceUIEventStream {
  done: Promise<void>;
  stop: () => Promise<void>;
}

interface WorkspaceUIEventStreamOptions {
  authToken: string;
  baseURL: string;
  fetchImpl?: BackendFetch;
  reconnectDelayMs?: number;
  sendEvent: (event: WorkspaceUIEvent) => void;
  workspaceId: string;
}

interface WorkspaceUIEventCursor {
  sequence: number;
  streamId: string;
}

const defaultReconnectDelayMs = 500;

export function startWorkspaceUIEventStream(
  options: WorkspaceUIEventStreamOptions,
): WorkspaceUIEventStream {
  const workspaceId = requireWorkspaceID(options.workspaceId);
  const abort = new AbortController();
  const done = runWorkspaceUIEventStreamLoop({
    authToken: options.authToken,
    baseURL: options.baseURL,
    fetchImpl: options.fetchImpl ?? fetch,
    reconnectDelayMs: options.reconnectDelayMs ?? defaultReconnectDelayMs,
    sendEvent: options.sendEvent,
    signal: abort.signal,
    workspaceId,
  });
  return {
    done,
    stop: async () => {
      abort.abort();
      await done;
    },
  };
}

async function runWorkspaceUIEventStreamLoop(options: {
  baseURL: string;
  authToken: string;
  fetchImpl: BackendFetch;
  reconnectDelayMs: number;
  sendEvent: (event: WorkspaceUIEvent) => void;
  signal: AbortSignal;
  workspaceId: string;
}) {
  let cursor = emptyWorkspaceUIEventCursor();
  while (!options.signal.aborted) {
    try {
      cursor = await streamWorkspaceUIEventsOnce({ ...options, cursor });
    } catch (error) {
      if (options.signal.aborted) {
        return;
      }
      if (error instanceof WorkspaceUIEventPayloadDecodeError) {
        cursor = error.cursor;
      }
      console.warn("Workspace UI event stream disconnected", error);
    }
    await sleepWithAbort(options.reconnectDelayMs, options.signal);
  }
}

async function streamWorkspaceUIEventsOnce(options: {
  baseURL: string;
  cursor: WorkspaceUIEventCursor;
  fetchImpl: BackendFetch;
  authToken: string;
  sendEvent: (event: WorkspaceUIEvent) => void;
  signal: AbortSignal;
  workspaceId: string;
}): Promise<WorkspaceUIEventCursor> {
  const headers: Record<string, string> = { Authorization: `Bearer ${options.authToken}` };
  if (options.cursor.streamId !== "") {
    headers["Last-Event-ID"] = encodeWorkspaceUIEventCursor(options.cursor);
  }
  const url = new URL(backendEndpoints.WorkspaceUIEventStream.path, options.baseURL);
  url.searchParams.set("workspaceId", options.workspaceId);
  const response = await options.fetchImpl(url, {
    headers,
    method: backendEndpoints.WorkspaceUIEventStream.method,
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`workspace UI event stream returned HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("workspace UI event stream returned no response body");
  }
  let cursor = options.cursor;
  for await (const message of parseServerSentEvents(response.body)) {
    if (options.signal.aborted) {
      return cursor;
    }
    const nextCursor = workspaceUIEventCursorFromServerSentEvent(message);
    const event = decodeWorkspaceUIStreamEvent(message, nextCursor);
    if (isDuplicateWorkspaceUIEvent(nextCursor, cursor)) {
      cursor = nextCursor;
      continue;
    }
    assertWorkspaceUIEventStream(nextCursor, cursor, event);
    cursor = nextCursor;
    options.sendEvent(event);
  }
  return cursor;
}

class WorkspaceUIEventPayloadDecodeError extends Error {
  constructor(
    message: string,
    readonly cursor: WorkspaceUIEventCursor,
  ) {
    super(message);
  }
}

function decodeWorkspaceUIStreamEvent(
  message: { data: string },
  cursor: WorkspaceUIEventCursor,
): WorkspaceUIEvent {
  try {
    return decodeWorkspaceUIEvent(JSON.parse(message.data));
  } catch (error) {
    throw new WorkspaceUIEventPayloadDecodeError(
      error instanceof Error ? error.message : "workspace UI event stream payload decode failed",
      cursor,
    );
  }
}

function emptyWorkspaceUIEventCursor(): WorkspaceUIEventCursor {
  return { sequence: 0, streamId: "" };
}

function encodeWorkspaceUIEventCursor(cursor: WorkspaceUIEventCursor): string {
  return `${cursor.streamId}:${cursor.sequence}`;
}

function workspaceUIEventCursorFromServerSentEvent(message: {
  id: string;
}): WorkspaceUIEventCursor {
  const separator = message.id.lastIndexOf(":");
  if (separator <= 0 || separator === message.id.length - 1) {
    throw new Error("workspace UI event stream id is invalid: " + message.id);
  }
  const sequence = Number.parseInt(message.id.slice(separator + 1), 10);
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error("workspace UI event stream id sequence is invalid: " + message.id);
  }
  return { sequence, streamId: message.id.slice(0, separator) };
}

function isDuplicateWorkspaceUIEvent(
  nextCursor: WorkspaceUIEventCursor,
  cursor: WorkspaceUIEventCursor,
): boolean {
  return nextCursor.streamId === cursor.streamId && nextCursor.sequence <= cursor.sequence;
}

function assertWorkspaceUIEventStream(
  nextCursor: WorkspaceUIEventCursor,
  cursor: WorkspaceUIEventCursor,
  event: WorkspaceUIEvent,
) {
  if (
    cursor.streamId === "" ||
    nextCursor.streamId === cursor.streamId ||
    event.type === "workspace_ui.resync_required"
  ) {
    return;
  }
  throw new Error(
    `workspace UI event stream changed stream id: ${cursor.streamId} -> ${nextCursor.streamId}`,
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

function requireWorkspaceID(workspaceId: string): string {
  if (workspaceId === "") {
    throw new Error("workspace UI event stream workspaceId is required");
  }
  return workspaceId;
}
