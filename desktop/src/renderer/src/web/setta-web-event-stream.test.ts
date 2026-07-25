import { describe, expect, test, vi } from "vitest";

import type { BackendFetch } from "@shared/backend-runtime";
import { startWebBackendEventStream, type StreamCursor } from "./setta-web-event-stream";

interface TestStreamEvent extends StreamCursor {
  reset: boolean;
}

describe("web backend event stream", () => {
  test("forwards an authoritative cursor reset behind the requested cursor", async () => {
    const forwarded: TestStreamEvent[] = [];
    const reset: TestStreamEvent = {
      reset: true,
      sequence: 3,
      streamId: "conversation:topic",
    };
    const fetchImpl: BackendFetch = vi.fn(async (_input, init = {}) => {
      expect(new Headers(init.headers).get("Last-Event-ID")).toBe("conversation:topic:7");
      return new Response(streamUntilAbort(sseFrame(reset), init.signal as AbortSignal), {
        status: 200,
      });
    });
    const stop = startWebBackendEventStream<TestStreamEvent>({
      authToken: "token",
      baseURL: "http://127.0.0.1:7345",
      cursorForEvent: (event) => event,
      decode: (value) => value as TestStreamEvent,
      endpoint: { method: "GET", path: "/conversations/events" },
      fetchImpl,
      initialCursor: { sequence: 7, streamId: "conversation:topic" },
      isCursorResetEvent: (event) => event.reset,
      sendEvent: (event) => forwarded.push(event),
      streamName: "test conversation stream",
    });

    await waitFor(() => forwarded.length === 1);
    stop();

    expect(forwarded).toEqual([reset]);
  });
});

function sseFrame(event: TestStreamEvent): string {
  return `id: ${event.streamId}:${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`;
}

function streamUntilAbort(text: string, signal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      signal.addEventListener("abort", () => controller.close(), { once: true });
    },
  });
}

async function waitFor(done: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!done()) {
    if (Date.now() > deadline) {
      throw new Error("timed out waiting for web stream event");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
