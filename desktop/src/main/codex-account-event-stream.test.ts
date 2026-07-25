import type { CodexAccountChangeEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { describe, expect, test, vi } from "vitest";

import { startCodexAccountEventStream } from "./codex-account-event-stream";

describe("Codex account event stream", () => {
  test("forwards an initial snapshot signal and subsequent account changes", async () => {
    const events: CodexAccountChangeEvent[] = [
      accountEvent(4, "snapshot_required"),
      accountEvent(5, "login_completed"),
    ];
    const forwarded: CodexAccountChangeEvent[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (input, init) => {
      expect(input.toString()).toBe("http://127.0.0.1:41000/codex/account/events");
      expect(init.method).toBe("GET");
      return new Response(textStreamUntilAbort(events.map(sseFrame).join(""), init.signal), {
        status: 200,
      });
    });

    const stream = startCodexAccountEventStream({
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 10_000,
      sendEvent: (event) => forwarded.push(event),
    });

    await waitFor(() => forwarded.length === events.length);
    await stream.stop();

    expect(forwarded).toEqual(events);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  test("reports reconnect failures without writing to a process stream", async () => {
    const disconnected: unknown[] = [];
    const stream = startCodexAccountEventStream({
      baseURL: "http://127.0.0.1:41000",
      fetchImpl: vi.fn(async () => {
        throw new Error("account stream unavailable");
      }),
      reconnectDelayMs: 10_000,
      reportDisconnect: (error) => disconnected.push(error),
      sendEvent: vi.fn(),
    });

    await waitFor(() => disconnected.length === 1);
    await stream.stop();

    expect(disconnected).toHaveLength(1);
    expect(disconnected[0]).toEqual(new Error("account stream unavailable"));
  });
});

function accountEvent(
  sequence: number,
  reason: CodexAccountChangeEvent["reason"],
): CodexAccountChangeEvent {
  return { reason, sequence, streamId: "codex-account-stream-test" };
}

function sseFrame(event: CodexAccountChangeEvent): string {
  return `id: ${event.streamId}:${event.sequence}\nevent: codex.account.changed\ndata: ${JSON.stringify(event)}\n\n`;
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
      throw new Error("timed out waiting for Codex account event");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
