import type { TerminalEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { describe, expect, test, vi } from "vitest";

import { startTerminalEventStream } from "./terminal-event-stream";

describe("terminal event stream", () => {
  test("reconnects with the last terminal event id", async () => {
    const first = terminalEvent(1);
    const second = terminalEvent(2);
    const forwarded: TerminalEvent[] = [];
    const lastEventIds: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (input, init) => {
      expect(input.toString()).toBe("http://127.0.0.1:41000/terminals/events");
      expect(init.method).toBe("GET");
      const headers = init.headers as Record<string, string>;
      lastEventIds.push(headers["Last-Event-ID"] ?? "");
      if (lastEventIds.length === 1) {
        return new Response(textStream(sseFrame(first)), { status: 200 });
      }
      return new Response(textStreamUntilAbort(sseFrame(second), init.signal), { status: 200 });
    });

    const stream = startTerminalEventStream({
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 1,
      sendEvent: (event) => {
        forwarded.push(event);
      },
    });

    await waitFor(() => forwarded.length === 2);
    await stream.stop();

    expect(lastEventIds).toEqual(["", "terminal_stream_test:1"]);
    expect(forwarded).toEqual([first, second]);
  });

  test("resets stale terminal event cursors after backend restart", async () => {
    const first = terminalEvent(1, "terminal_stream_old");
    const restarted = terminalEvent(1, "terminal_stream_new");
    const forwarded: TerminalEvent[] = [];
    const lastEventIds: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (_input, init) => {
      const headers = init.headers as Record<string, string>;
      lastEventIds.push(headers["Last-Event-ID"] ?? "");
      if (lastEventIds.length === 1) {
        return new Response(textStream(sseFrame(first)), { status: 200 });
      }
      if (lastEventIds.length === 2) {
        return new Response("stale cursor", { status: 400 });
      }
      return new Response(textStreamUntilAbort(sseFrame(restarted), init.signal), { status: 200 });
    });

    const stream = startTerminalEventStream({
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 1,
      sendEvent: (event) => {
        forwarded.push(event);
      },
    });

    await waitFor(() => forwarded.length === 2);
    await stream.stop();

    expect(lastEventIds).toEqual(["", "terminal_stream_old:1", ""]);
    expect(forwarded).toEqual([first, restarted]);
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

function textStreamUntilAbort(text: string, signal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      signal.addEventListener(
        "abort",
        () => {
          controller.close();
        },
        { once: true },
      );
    },
  });
}

function sseFrame(event: TerminalEvent): string {
  return `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function terminalEvent(sequence: number, streamId = "terminal_stream_test"): TerminalEvent {
  return {
    emittedAt: "2026-06-06T12:00:00Z",
    eventId: `${streamId}:${sequence}`,
    paneId: "pane_terminal",
    payload: {
      byteCount: 5,
      cols: 80,
      cwd: "/tmp/workspace",
      dataBase64: "aGVsbG8=",
      droppedBytes: 0,
      droppedChunks: 0,
      exitCode: 0,
      message: "",
      rows: 24,
      status: "running",
    },
    schemaVersion: 1,
    sequence,
    sessionId: "terminal_api",
    streamId,
    type: "terminal.output",
    workspaceId: "workspace_api",
  };
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
