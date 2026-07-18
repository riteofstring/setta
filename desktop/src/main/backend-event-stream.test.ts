import type { ChatEvent, ChatMessage, MessageRole, MessageStatus } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { describe, expect, test, vi } from "vitest";

import { parseServerSentEvents, startBackendEventStream } from "./backend-event-stream";

describe("backend event stream", () => {
  test("parses server-sent event frames", async () => {
    const events = [];
    for await (const event of parseServerSentEvents(
      textStream('id: 4\nevent: chat.message.created\ndata: {"ok":true}\n\n'),
    )) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        data: '{"ok":true}',
        event: "chat.message.created",
        id: "4",
      },
    ]);
  });

  test("forwards decoded backend chat events", async () => {
    const event = messageCreatedEvent(1);
    const forwarded: ChatEvent[] = [];
    const lifecycle = vi.fn();
    const fetchImpl: BackendFetch = vi.fn(async (input, init) => {
      expect(input.toString()).toBe("http://127.0.0.1:41000/events");
      expect(init.method).toBe("GET");
      expect(init.headers).toEqual({ Authorization: "Bearer token_test" });
      return new Response(textStream(sseFrame(event)), { status: 200 });
    });

    const stream = startBackendEventStream({
      authToken: "token_test",
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      observer: {
        forwarded: vi.fn(),
        lifecycle,
      },
      reconnect: {
        initialDelayMs: 10_000,
        maxDelayMs: 10_000,
      },
      sendEvent: (payload) => {
        forwarded.push(payload);
      },
    });

    await waitFor(() => forwarded.length === 1);
    await stream.stop();

    expect(forwarded).toEqual([event]);
    expect(lifecycle).toHaveBeenCalledWith(expect.objectContaining({ status: "connected" }));
  });

  test("reports malformed event payloads as resyncing and reconnects after the bad event", async () => {
    const nextEvent = messageCreatedEvent(2);
    const forwarded: ChatEvent[] = [];
    const lifecycle = vi.fn();
    const lastEventIds: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (_input, init) => {
      const headers = init.headers as Record<string, string> | undefined;
      lastEventIds.push(headers?.["Last-Event-ID"] ?? "");
      expect(headers?.Authorization).toBe("Bearer token_test");
      if (lastEventIds.length === 1) {
        return new Response(
          textStream("id: event_stream_test:1\nevent: chat.message.created\ndata: {bad\n\n"),
          { status: 200 },
        );
      }
      return new Response(textStream(sseFrame(nextEvent)), { status: 200 });
    });
    let sleepCount = 0;
    const sleep = vi.fn(async (_ms: number, signal: AbortSignal) => {
      sleepCount += 1;
      if (sleepCount === 1) {
        return;
      }
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    });

    const stream = startBackendEventStream({
      authToken: "token_test",
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      observer: {
        forwarded: vi.fn(),
        lifecycle,
      },
      reconnect: {
        initialDelayMs: 1,
        maxDelayMs: 1,
        sleep,
      },
      sendEvent: (payload) => {
        forwarded.push(payload);
      },
    });

    await waitFor(() => forwarded.length === 1);
    await stream.stop();

    expect(lastEventIds).toEqual(["", "event_stream_test:1"]);
    expect(forwarded).toEqual([nextEvent]);
    expect(lifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ lastSequence: 1, status: "resyncing" }),
    );
  });

  test("forwards resync events when a backend stream restarts with a lower sequence", async () => {
    const oldEvent = messageCreatedEvent(5, "event_stream_old");
    const resyncEvent = resyncRequiredEvent("event_stream_new", {
      currentSequence: 0,
      requestedSequence: oldEvent.sequence,
      requestedStreamId: oldEvent.streamId,
    });
    const forwarded: ChatEvent[] = [];
    const lastEventIds: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (_input, init) => {
      const headers = init.headers as Record<string, string> | undefined;
      lastEventIds.push(headers?.["Last-Event-ID"] ?? "");
      expect(headers?.Authorization).toBe("Bearer token_test");
      if (lastEventIds.length === 1) {
        return new Response(textStream(sseFrame(oldEvent)), { status: 200 });
      }
      return new Response(textStream(sseFrame(resyncEvent)), { status: 200 });
    });
    let sleepCount = 0;
    const sleep = vi.fn(async (_ms: number, signal: AbortSignal) => {
      sleepCount += 1;
      if (sleepCount === 1) {
        return;
      }
      await new Promise<void>((resolve) => {
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    });

    const stream = startBackendEventStream({
      authToken: "token_test",
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnect: {
        initialDelayMs: 1,
        maxDelayMs: 1,
        sleep,
      },
      sendEvent: (payload) => {
        forwarded.push(payload);
      },
    });

    await waitFor(() => forwarded.length === 2);
    await stream.stop();

    expect(lastEventIds).toEqual(["", "event_stream_old:5"]);
    expect(forwarded).toEqual([oldEvent, resyncEvent]);
  });
});

function textStream(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function sseFrame(event: ChatEvent): string {
  return `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

async function waitFor(done: () => boolean) {
  const startedAt = Date.now();
  while (!done()) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function messageCreatedEvent(sequence: number, streamId = "event_stream_test"): ChatEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    payload: {
      message: message("message_user", 1, "user", "complete", "hello"),
    },
    runId: "run_api",
    schemaVersion: 1,
    sequence,
    streamId,
    type: "chat.message.created",
    workspaceId: "workspace_api",
  };
}

function resyncRequiredEvent(
  streamId: string,
  cursor: {
    currentSequence: number;
    requestedSequence: number;
    requestedStreamId: string;
  },
): ChatEvent {
  return {
    conversationId: "",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: `${streamId}:${cursor.currentSequence}`,
    payload: {
      currentSequence: cursor.currentSequence,
      currentStreamId: streamId,
      earliestSequence: 0,
      reason: "event stream restarted",
      requestedSequence: cursor.requestedSequence,
      requestedStreamId: cursor.requestedStreamId,
    },
    runId: "",
    schemaVersion: 1,
    sequence: cursor.currentSequence,
    streamId,
    type: "chat.resync_required",
    workspaceId: "",
  };
}

function message(
  id: string,
  ordinal: number,
  role: MessageRole,
  status: MessageStatus,
  text: string,
): ChatMessage {
  return {
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    delivery: "normal",
    id,
    ordinal,
    parts: [
      {
        id: `${id}_part`,
        image: null,
        text: { format: role === "assistant" ? "markdown" : "plain", text },
        type: "text",
      },
    ],
    role,
    runId: role === "assistant" ? "run_api" : "",
    schemaVersion: 1,
    status,
    updatedAt: "2026-05-29T20:00:00Z",
  };
}
