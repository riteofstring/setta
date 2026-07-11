import { decodeEasyRunEvent, type EasyRunEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { describe, expect, test, vi } from "vitest";

import { startEasyRunEventStream } from "./easy-run-event-stream";

describe("easy-run event stream", () => {
  test("reconnects with the last easy-run event id", async () => {
    const first = runUpdatedEvent(1);
    const second = runUpdatedEvent(2);
    const forwarded: EasyRunEvent[] = [];
    const lastEventIds: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (input, init) => {
      expect(input.toString()).toBe("http://127.0.0.1:41000/easy-runs/events");
      expect(init.method).toBe("GET");
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer token_test");
      lastEventIds.push(headers["Last-Event-ID"] ?? "");
      if (lastEventIds.length === 1) {
        return new Response(textStream(sseFrame(first)), { status: 200 });
      }
      return new Response(textStreamUntilAbort(sseFrame(second), init.signal), { status: 200 });
    });

    const stream = startEasyRunEventStream({
      authToken: "token_test",
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 1,
      sendEvent: (event) => {
        forwarded.push(event);
      },
    });

    await waitFor(() => forwarded.length === 2);
    await stream.stop();

    expect(lastEventIds).toEqual(["", "easyrun_events:1"]);
    expect(forwarded).toEqual([first, second]);
  });

  test("reconnects with the forwarded cursor after a transport error", async () => {
    const first = runUpdatedEvent(1);
    const second = runUpdatedEvent(2);
    const forwarded: EasyRunEvent[] = [];
    const lastEventIds: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (_input, init) => {
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer token_test");
      lastEventIds.push(headers["Last-Event-ID"] ?? "");
      if (lastEventIds.length === 1) {
        return new Response(textStreamThenError(sseFrame(first)), { status: 200 });
      }
      return new Response(textStreamUntilAbort(sseFrame(second), init.signal), { status: 200 });
    });

    const stream = startEasyRunEventStream({
      authToken: "token_test",
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 1,
      sendEvent: (event) => {
        forwarded.push(event);
      },
    });

    await waitFor(() => forwarded.length === 2);
    await stream.stop();

    expect(lastEventIds).toEqual(["", "easyrun_events:1"]);
    expect(forwarded).toEqual([first, second]);
  });

  test("forwards resync events when the stream id changes", async () => {
    const first = runUpdatedEvent(1, "easyrun_events_old");
    const resync = resyncEvent(1, "easyrun_events_new");
    const forwarded: EasyRunEvent[] = [];
    const lastEventIds: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (_input, init) => {
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer token_test");
      lastEventIds.push(headers["Last-Event-ID"] ?? "");
      if (lastEventIds.length === 1) {
        return new Response(textStream(sseFrame(first)), { status: 200 });
      }
      return new Response(textStreamUntilAbort(sseFrame(resync), init.signal), { status: 200 });
    });

    const stream = startEasyRunEventStream({
      authToken: "token_test",
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 1,
      sendEvent: (event) => {
        forwarded.push(event);
      },
    });

    await waitFor(() => forwarded.length === 2);
    await stream.stop();

    expect(lastEventIds).toEqual(["", "easyrun_events_old:1"]);
    expect(forwarded).toEqual([first, resync]);
  });

  test("forwards resync events before duplicate filtering", async () => {
    const first = runUpdatedEvent(4);
    const resync = resyncEvent(0, "easyrun_events");
    const recovered = runUpdatedEvent(1);
    const forwarded: EasyRunEvent[] = [];
    const lastEventIds: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (_input, init) => {
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer token_test");
      lastEventIds.push(headers["Last-Event-ID"] ?? "");
      if (lastEventIds.length === 1) {
        return new Response(textStream(sseFrame(first)), { status: 200 });
      }
      if (lastEventIds.length === 2) {
        return new Response(textStream(sseFrame(resync)), { status: 200 });
      }
      return new Response(textStreamUntilAbort(sseFrame(recovered), init.signal), { status: 200 });
    });

    const stream = startEasyRunEventStream({
      authToken: "token_test",
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 1,
      sendEvent: (event) => {
        forwarded.push(event);
      },
    });

    await waitFor(() => forwarded.length === 3);
    await stream.stop();

    expect(lastEventIds).toEqual(["", "easyrun_events:4", "easyrun_events:0"]);
    expect(forwarded).toEqual([first, resync, recovered]);
  });

  test("rejects pre-version-two run payloads without current focus", () => {
    const event = JSON.parse(JSON.stringify(runUpdatedEvent(1))) as Record<string, unknown>;
    const runUpdated = event.runUpdated as { run: Record<string, unknown> };
    delete runUpdated.run.currentFocus;

    expect(() => decodeEasyRunEvent(event)).toThrow(/currentFocus/);
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

function textStreamThenError(text: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      setTimeout(() => {
        controller.error(new Error("terminated"));
      }, 0);
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

function sseFrame(event: EasyRunEvent): string {
  return `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function runUpdatedEvent(sequence: number, streamId = "easyrun_events"): EasyRunEvent {
  return {
    artifactCreated: null,
    easyRunId: "easy_run_api",
    emittedAt: "2026-07-08T12:00:00Z",
    eventId: `${streamId}:${sequence}`,
    highlightCreated: null,
    resyncRequired: null,
    runUpdated: {
      run: {
        activeAgentCount: 1,
        artifactCount: 0,
        conversationId: "conversation_api",
        currentFocus: {
          revision: 0,
          status: "current",
          text: "Do the work",
          updatedAt: "2026-07-08T12:00:00Z",
        },
        endedAt: null,
        error: null,
        highlightCount: 0,
        id: "easy_run_api",
        narratorStatus: "ok",
        requestText: "Do the work",
        startedAt: "2026-07-08T12:00:00Z",
        status: "working",
        summary: null,
        workspaceId: "workspace_api",
      },
    },
    schemaVersion: 2,
    sequence,
    streamId,
    type: "easyrun.run.updated",
    workspaceId: "workspace_api",
  };
}

function resyncEvent(sequence: number, streamId: string): EasyRunEvent {
  return {
    artifactCreated: null,
    easyRunId: "",
    emittedAt: "2026-07-08T12:00:00Z",
    eventId: `${streamId}:${sequence}`,
    highlightCreated: null,
    resyncRequired: {
      currentSequence: sequence,
      currentStreamId: streamId,
      earliestSequence: sequence,
      reason: "event replay is no longer available",
      requestedSequence: 1,
      requestedStreamId: "easyrun_events_old",
    },
    runUpdated: null,
    schemaVersion: 2,
    sequence,
    streamId,
    type: "easyrun.resync_required",
    workspaceId: "",
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
