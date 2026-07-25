import {
  backendEndpoints,
  decodeDirectorEvent,
  type DirectorEvent,
  type DirectorEventCursor,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { parseServerSentEvents } from "@shared/server-sent-events";

export interface DirectorEventStream {
  done: Promise<void>;
  stop: () => Promise<void>;
}

interface DirectorEventStreamOptions {
  baseURL: string;
  cursor: DirectorEventCursor;
  fetchImpl: BackendFetch;
  reconnectDelayMs?: number;
  sendEvent: (event: DirectorEvent) => void;
}

const defaultReconnectDelayMs = 500;

/**
 * The app-scoped Director subscription.
 *
 * One stream carries every change in the app from the cursor the shell's
 * snapshot named. A dropped connection reconnects from the position it reached,
 * so nothing is replayed twice and nothing polls. A resync ends the stream
 * instead of reconnecting: the cursor cannot continue, so the shell has to take
 * a fresh snapshot and subscribe from its cursor, and retrying the stale cursor
 * would just ask to resync again.
 */
export function startDirectorEventStream(options: DirectorEventStreamOptions): DirectorEventStream {
  const abort = new AbortController();
  const done = runDirectorEventStreamLoop({
    ...options,
    reconnectDelayMs: options.reconnectDelayMs ?? defaultReconnectDelayMs,
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

async function runDirectorEventStreamLoop(
  options: DirectorEventStreamOptions & {
    reconnectDelayMs: number;
    signal: AbortSignal;
  },
): Promise<void> {
  let cursor = options.cursor;
  while (!options.signal.aborted) {
    try {
      const resynced = await streamDirectorEventsOnce({
        ...options,
        cursor,
        updateCursor: (next) => {
          cursor = next;
        },
      });
      if (resynced) {
        return;
      }
    } catch (error) {
      if (options.signal.aborted) {
        return;
      }
      console.warn("Director event stream disconnected", error);
    }
    await sleepWithAbort(options.reconnectDelayMs, options.signal);
  }
}

async function streamDirectorEventsOnce(
  options: DirectorEventStreamOptions & {
    cursor: DirectorEventCursor;
    signal: AbortSignal;
    updateCursor: (cursor: DirectorEventCursor) => void;
  },
): Promise<boolean> {
  const response = await options.fetchImpl(
    new URL(backendEndpoints.DirectorEventStream.path, options.baseURL),
    {
      headers: { "Last-Event-ID": encodeDirectorEventCursor(options.cursor) },
      method: backendEndpoints.DirectorEventStream.method,
      signal: options.signal,
    },
  );
  if (!response.ok) {
    throw new Error(`director event stream returned HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("director event stream returned no response body");
  }
  let cursor = options.cursor;
  for await (const message of parseServerSentEvents(response.body)) {
    if (options.signal.aborted) {
      return false;
    }
    const event = decodeDirectorEvent(JSON.parse(message.data));
    if (event.kind === "director.resync_required") {
      options.sendEvent(event);
      return true;
    }
    cursor = advanceDirectorCursor(cursor, event);
    options.updateCursor(cursor);
    options.sendEvent(event);
  }
  return false;
}

/**
 * The app-scoped stream is lossless for semantic events, so a gap is a defect
 * rather than something to paper over: the graph would claim a state no fact
 * produced. Reconnecting from the last good position is the only recovery, and
 * the backend answers a cursor it cannot serve with a typed resync.
 */
function advanceDirectorCursor(
  cursor: DirectorEventCursor,
  event: DirectorEvent,
): DirectorEventCursor {
  if (event.streamId !== cursor.streamId || event.sequence !== cursor.sequence + 1) {
    throw new Error(
      `director event cursor changed from ${encodeDirectorEventCursor(cursor)} to ${event.streamId}:${event.sequence}`,
    );
  }
  return { sequence: event.sequence, streamId: event.streamId };
}

function encodeDirectorEventCursor(cursor: DirectorEventCursor): string {
  return `${cursor.streamId}:${cursor.sequence}`;
}

function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
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
