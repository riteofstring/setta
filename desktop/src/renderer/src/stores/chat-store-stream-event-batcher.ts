import type { ChatEvent } from "@generated/backend";

import type { ChatStore } from "./chat-store-types";

export type BufferedStreamChatEvent = Extract<
  ChatEvent,
  {
    type: "chat.assistant_text_delta" | "chat.transcript_text.delta" | "chat.run_item_output.delta";
  }
>;

const streamFlushIntervalMs = 32;

export function createChatStreamEventBatcher(
  flushEvents: (events: BufferedStreamChatEvent[]) => void,
) {
  let queuedEvents: BufferedStreamChatEvent[] = [];
  let queuedFrame: number | null = null;
  let queuedTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  let queuedCursor: { sequence: number; streamId: string } | null = null;
  let lastFlushAt = 0;

  function clearScheduledFlush() {
    if (queuedFrame !== null && typeof globalThis.cancelAnimationFrame === "function") {
      globalThis.cancelAnimationFrame(queuedFrame);
    }
    queuedFrame = null;
    if (queuedTimer !== null) {
      globalThis.clearTimeout(queuedTimer);
    }
    queuedTimer = null;
  }

  function clear() {
    queuedEvents = [];
    queuedCursor = null;
    clearScheduledFlush();
  }

  function flush() {
    const events = queuedEvents;
    if (events.length === 0) {
      return;
    }
    queuedEvents = [];
    queuedCursor = null;
    clearScheduledFlush();
    lastFlushAt = nowMs();
    flushEvents(events);
  }

  function scheduleFlush() {
    if (queuedFrame !== null || queuedTimer !== null) {
      return;
    }
    if (!shouldBatchChatStreamEvents()) {
      flush();
      return;
    }
    const delayMs = Math.max(0, streamFlushIntervalMs - (nowMs() - lastFlushAt));
    queuedTimer = globalThis.setTimeout(() => {
      queuedTimer = null;
      queuedFrame = globalThis.requestAnimationFrame(() => {
        queuedFrame = null;
        flush();
      });
    }, delayMs);
  }

  return {
    clear,
    flush,
    queue(event: BufferedStreamChatEvent) {
      queuedEvents.push(event);
      queuedCursor = { sequence: event.sequence, streamId: event.streamId };
      scheduleFlush();
    },
    stateWithCursor(state: ChatStore): ChatStore {
      if (!queuedCursor) {
        return state;
      }
      return {
        ...state,
        lastEventSequence: queuedCursor.sequence,
        lastEventStreamId: queuedCursor.streamId,
      };
    },
  };
}

export function isBufferedStreamEvent(event: ChatEvent): event is BufferedStreamChatEvent {
  return (
    event.type === "chat.assistant_text_delta" ||
    event.type === "chat.transcript_text.delta" ||
    event.type === "chat.run_item_output.delta"
  );
}

function shouldBatchChatStreamEvents() {
  return import.meta.env.MODE !== "test" && typeof globalThis.requestAnimationFrame === "function";
}

function nowMs() {
  return globalThis.performance?.now() ?? Date.now();
}
