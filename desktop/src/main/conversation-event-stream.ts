import {
  backendEndpoints,
  decodeConversationEvent,
  type ConversationEvent,
  type ConversationEventCursor,
} from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";

import { parseServerSentEvents } from "./backend-event-stream";

export interface ConversationEventStream {
  done: Promise<void>;
  stop: () => Promise<void>;
}

interface ConversationEventStreamOptions {
  baseURL: string;
  conversationId: string;
  cursor: ConversationEventCursor;
  fetchImpl: BackendFetch;
  reconnectDelayMs?: number;
  sendEvent: (event: ConversationEvent) => void;
  workspaceId: string;
}

const defaultReconnectDelayMs = 500;

export function startConversationEventStream(
  options: ConversationEventStreamOptions,
): ConversationEventStream {
  const abort = new AbortController();
  const done = runConversationEventStreamLoop({
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

async function runConversationEventStreamLoop(
  options: ConversationEventStreamOptions & {
    reconnectDelayMs: number;
    signal: AbortSignal;
  },
): Promise<void> {
  let cursor = options.cursor;
  while (!options.signal.aborted) {
    try {
      cursor = await streamConversationEventsOnce({
        ...options,
        cursor,
        updateCursor: (next) => {
          cursor = next;
        },
      });
    } catch (error) {
      if (options.signal.aborted) {
        return;
      }
      console.warn("Conversation event stream disconnected", error);
    }
    await sleepWithAbort(options.reconnectDelayMs, options.signal);
  }
}

async function streamConversationEventsOnce(
  options: ConversationEventStreamOptions & {
    cursor: ConversationEventCursor;
    signal: AbortSignal;
    updateCursor: (cursor: ConversationEventCursor) => void;
  },
): Promise<ConversationEventCursor> {
  const url = new URL(backendEndpoints.ConversationEventStream.path, options.baseURL);
  url.searchParams.set("workspaceId", options.workspaceId);
  url.searchParams.set("conversationId", options.conversationId);
  const response = await options.fetchImpl(url, {
    headers: { "Last-Event-ID": encodeConversationEventCursor(options.cursor) },
    method: backendEndpoints.ConversationEventStream.method,
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`conversation event stream returned HTTP ${response.status}`);
  }
  if (!response.body) {
    throw new Error("conversation event stream returned no response body");
  }
  let cursor = options.cursor;
  for await (const message of parseServerSentEvents(response.body)) {
    cursor = applyConversationStreamMessage(message.id, message.data, cursor, options);
  }
  return cursor;
}

function applyConversationStreamMessage(
  messageId: string,
  data: string,
  cursor: ConversationEventCursor,
  options: ConversationEventStreamOptions & {
    signal: AbortSignal;
    updateCursor: (cursor: ConversationEventCursor) => void;
  },
): ConversationEventCursor {
  if (options.signal.aborted) {
    return cursor;
  }
  const event = decodeConversationEvent(JSON.parse(data));
  assertConversationEventTarget(event, options);
  if (event.payload.type === "conversation.resync_required") {
    const resynced = {
      sequence: event.payload.currentSequence,
      streamId: event.payload.currentStreamId,
    };
    publishConversationStreamEvent(resynced, event, options);
    return resynced;
  }
  const next = conversationEventCursorFromMessage(messageId);
  if (next.streamId === cursor.streamId && next.sequence <= cursor.sequence) {
    return cursor;
  }
  if (next.streamId !== cursor.streamId || next.sequence !== cursor.sequence + 1) {
    throw new Error(
      `conversation event cursor changed from ${encodeConversationEventCursor(cursor)} to ${encodeConversationEventCursor(next)}`,
    );
  }
  publishConversationStreamEvent(next, event, options);
  return next;
}

function publishConversationStreamEvent(
  cursor: ConversationEventCursor,
  event: ConversationEvent,
  options: Pick<ConversationEventStreamOptions, "sendEvent"> & {
    updateCursor: (cursor: ConversationEventCursor) => void;
  },
): void {
  options.updateCursor(cursor);
  options.sendEvent(event);
}

function assertConversationEventTarget(
  event: ConversationEvent,
  target: Pick<ConversationEventStreamOptions, "conversationId" | "workspaceId">,
): void {
  if (event.conversationId !== target.conversationId || event.workspaceId !== target.workspaceId) {
    throw new Error(
      `conversation event target ${event.workspaceId}/${event.conversationId} does not match ${target.workspaceId}/${target.conversationId}`,
    );
  }
}

function conversationEventCursorFromMessage(id: string): ConversationEventCursor {
  const separator = id.lastIndexOf(":");
  if (separator <= 0 || separator === id.length - 1) {
    throw new Error(`conversation event id is invalid: ${id}`);
  }
  const sequence = Number.parseInt(id.slice(separator + 1), 10);
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new Error(`conversation event sequence is invalid: ${id}`);
  }
  return { sequence, streamId: id.slice(0, separator) };
}

function encodeConversationEventCursor(cursor: ConversationEventCursor): string {
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
