import type { ConversationEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { describe, expect, test, vi } from "vitest";

import { startConversationEventStream } from "./conversation-event-stream";

describe("conversation event stream", () => {
  test("resumes one conversation and forwards an authoritative cursor rollback", async () => {
    const event = resyncEvent(3);
    const forwarded: ConversationEvent[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (input, init) => {
      expect(input.toString()).toBe(
        "http://127.0.0.1:41000/conversations/events?workspaceId=workspace_api&conversationId=conversation_api",
      );
      expect(init.method).toBe("GET");
      expect((init.headers as Record<string, string>)["Last-Event-ID"]).toBe(
        "conversation:conversation_api:7",
      );
      return new Response(textStreamUntilAbort(sseFrame(event), init.signal), { status: 200 });
    });

    const stream = startConversationEventStream({
      baseURL: "http://127.0.0.1:41000",
      conversationId: "conversation_api",
      cursor: { sequence: 7, streamId: "conversation:conversation_api" },
      fetchImpl,
      reconnectDelayMs: 10_000,
      sendEvent: (current) => forwarded.push(current),
      workspaceId: "workspace_api",
    });

    await waitFor(() => forwarded.length === 1);
    await stream.stop();

    expect(forwarded).toEqual([event]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

function resyncEvent(sequence: number): ConversationEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-07-11T20:00:00Z",
    eventId: `conversation:conversation_api:${sequence}`,
    payload: {
      currentSequence: sequence,
      currentStreamId: "conversation:conversation_api",
      reason: "snapshot required",
      requestedSequence: 7,
      requestedStreamId: "conversation:conversation_api",
      type: "conversation.resync_required",
    },
    schemaVersion: 1,
    sequence,
    streamId: "conversation:conversation_api",
    workspaceId: "workspace_api",
  };
}

function sseFrame(event: ConversationEvent): string {
  return `id: ${event.eventId}\nevent: ${event.payload.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function textStreamUntilAbort(text: string, signal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      signal.addEventListener("abort", () => controller.close(), { once: true });
    },
  });
}

async function waitFor(done: () => boolean) {
  const startedAt = Date.now();
  while (!done()) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error("timed out waiting for conversation event");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
