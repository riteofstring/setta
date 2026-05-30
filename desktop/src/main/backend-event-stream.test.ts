import type { ChatEvent, ChatMessage } from "@generated/backend";
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
      return new Response(
        textStream(
          `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
        ),
        { status: 200 },
      );
    });

    const stream = startBackendEventStream({
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
    expect(lifecycle).toHaveBeenCalledWith(expect.objectContaining({ type: "connected" }));
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

async function waitFor(done: () => boolean) {
  const startedAt = Date.now();
  while (!done()) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error("timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function messageCreatedEvent(sequence: number): ChatEvent {
  return {
    conversationId: "conversation_api",
    emittedAt: "2026-05-29T20:00:00Z",
    eventId: String(sequence),
    payload: {
      message: message("message_user", 1, "user", "complete", "hello"),
    },
    runId: "run_api",
    schemaVersion: 1,
    sequence,
    type: "chat.message.created",
    workspaceId: "workspace_api",
  };
}

function message(
  id: string,
  ordinal: number,
  role: string,
  status: string,
  text: string,
): ChatMessage {
  return {
    conversationId: "conversation_api",
    createdAt: "2026-05-29T20:00:00Z",
    id,
    ordinal,
    parts: [
      {
        format: role === "assistant" ? "markdown" : "plain",
        id: `${id}_part`,
        text,
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
