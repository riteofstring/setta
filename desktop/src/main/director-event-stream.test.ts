import type { DirectorEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { describe, expect, test, vi } from "vitest";

import { startDirectorEventStream } from "./director-event-stream";

const streamId = "director:m12";

describe("director event stream", () => {
  test("resumes the app-scoped stream from the snapshot's cursor", async () => {
    const first = selectionEvent(8, "workstream:conversation-alpha");
    const second = selectionEvent(9, "workstream:conversation-beta");
    const forwarded: DirectorEvent[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (input, init) => {
      expect(input.toString()).toBe("http://127.0.0.1:41000/director/events");
      expect(init.method).toBe("GET");
      expect((init.headers as Record<string, string>)["Last-Event-ID"]).toBe(`${streamId}:7`);
      return new Response(textStreamUntilAbort(sseFrame(first) + sseFrame(second), init.signal), {
        status: 200,
      });
    });

    const stream = startDirectorEventStream({
      baseURL: "http://127.0.0.1:41000",
      cursor: { sequence: 7, streamId },
      fetchImpl,
      reconnectDelayMs: 10_000,
      sendEvent: (event) => forwarded.push(event),
    });

    await waitFor(() => forwarded.length === 2);
    await stream.stop();

    expect(forwarded).toEqual([first, second]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // A resync says the cursor cannot continue, so reconnecting with it would ask
  // the same question again. The stream ends and the shell takes a fresh
  // snapshot.
  test("stops after a resync instead of reconnecting with the stale cursor", async () => {
    const forwarded: DirectorEvent[] = [];
    const fetchImpl: BackendFetch = vi.fn(
      async (_input, init) =>
        new Response(textStreamUntilAbort(sseFrame(resyncEvent()), init.signal), { status: 200 }),
    );

    const stream = startDirectorEventStream({
      baseURL: "http://127.0.0.1:41000",
      cursor: { sequence: 7, streamId },
      fetchImpl,
      reconnectDelayMs: 0,
      sendEvent: (event) => forwarded.push(event),
    });

    await stream.done;

    expect(forwarded.map((event) => event.kind)).toEqual(["director.resync_required"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // Semantic events are lossless, so a gap is a defect rather than something to
  // apply: the graph would claim a state no fact produced.
  test("reconnects from the last good position when a sequence gap arrives", async () => {
    const good = selectionEvent(8, "workstream:conversation-alpha");
    const forwarded: DirectorEvent[] = [];
    const cursors: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (_input, init) => {
      cursors.push((init.headers as Record<string, string>)["Last-Event-ID"] ?? "");
      const body =
        cursors.length === 1
          ? sseFrame(good) + sseFrame(selectionEvent(11, "workstream:conversation-gamma"))
          : "";
      return new Response(textStreamUntilAbort(body, init.signal), { status: 200 });
    });

    const stream = startDirectorEventStream({
      baseURL: "http://127.0.0.1:41000",
      cursor: { sequence: 7, streamId },
      fetchImpl,
      reconnectDelayMs: 0,
      sendEvent: (event) => forwarded.push(event),
    });

    await waitFor(() => cursors.length >= 2);
    await stream.stop();

    expect(forwarded).toEqual([good]);
    expect(cursors[0]).toBe(`${streamId}:7`);
    expect(cursors[1]).toBe(`${streamId}:8`);
  });
});

function directorEvent(sequence: number): DirectorEvent {
  return {
    aggregatesUpdated: null,
    approvalUpdated: null,
    artifactUpdated: null,
    emittedAt: "2026-07-24T20:00:00Z",
    eventId: `${streamId}:${sequence}`,
    graphUpdated: null,
    kind: "director.selection.changed",
    resourceRequestUpdated: null,
    resyncRequired: null,
    schemaVersion: 1,
    selectionChanged: null,
    sequence,
    streamId,
    textDelta: null,
    workstreamRemoved: null,
    workstreamUpdated: null,
  };
}

function selectionEvent(sequence: number, workstreamId: string): DirectorEvent {
  return {
    ...directorEvent(sequence),
    selectionChanged: { selectedWorkstreamId: workstreamId },
  };
}

function resyncEvent(): DirectorEvent {
  return {
    ...directorEvent(12),
    kind: "director.resync_required",
    resyncRequired: {
      currentSequence: 12,
      currentStreamId: streamId,
      reason: "event_stream_changed",
      requestedSequence: 7,
      requestedStreamId: streamId,
    },
  };
}

function sseFrame(event: DirectorEvent): string {
  return `id: ${event.eventId}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`;
}

function textStreamUntilAbort(text: string, signal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      if (text !== "") {
        controller.enqueue(new TextEncoder().encode(text));
      }
      signal.addEventListener("abort", () => controller.close(), { once: true });
    },
  });
}

async function waitFor(done: () => boolean) {
  const startedAt = Date.now();
  while (!done()) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error("timed out waiting for director event");
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
