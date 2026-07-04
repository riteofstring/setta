import type { WorkspaceActivityEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { describe, expect, test, vi } from "vitest";

import { startWorkspaceActivityEventStream } from "./workspace-activity-event-stream";

describe("workspace activity event stream", () => {
  test("reconnects with the last workspace activity event id", async () => {
    const first = activityEvent(1);
    const second = activityEvent(2);
    const forwarded: WorkspaceActivityEvent[] = [];
    const lastEventIds: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (input, init) => {
      expect(input.toString()).toBe("http://127.0.0.1:41000/workspace-activity/events");
      expect(init.method).toBe("GET");
      const headers = init.headers as Record<string, string>;
      lastEventIds.push(headers["Last-Event-ID"] ?? "");
      if (lastEventIds.length === 1) {
        return new Response(textStream(sseFrame(first)), { status: 200 });
      }
      return new Response(textStreamUntilAbort(sseFrame(second), init.signal), { status: 200 });
    });

    const stream = startWorkspaceActivityEventStream({
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 1,
      sendEvent: (event) => {
        forwarded.push(event);
      },
    });

    await waitFor(() => forwarded.length === 2);
    await stream.stop();

    expect(lastEventIds).toEqual(["", "workspace_activity_stream_test:1"]);
    expect(forwarded).toEqual([first, second]);
  });

  test("forwards resync events when the stream id changes", async () => {
    const first = activityEvent(1, "workspace_activity_stream_old");
    const resync = resyncEvent(1, "workspace_activity_stream_new");
    const forwarded: WorkspaceActivityEvent[] = [];
    const lastEventIds: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (_input, init) => {
      const headers = init.headers as Record<string, string>;
      lastEventIds.push(headers["Last-Event-ID"] ?? "");
      if (lastEventIds.length === 1) {
        return new Response(textStream(sseFrame(first)), { status: 200 });
      }
      return new Response(textStreamUntilAbort(sseFrame(resync), init.signal), { status: 200 });
    });

    const stream = startWorkspaceActivityEventStream({
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 1,
      sendEvent: (event) => {
        forwarded.push(event);
      },
    });

    await waitFor(() => forwarded.length === 2);
    await stream.stop();

    expect(lastEventIds).toEqual(["", "workspace_activity_stream_old:1"]);
    expect(forwarded).toEqual([first, resync]);
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

function sseFrame(event: WorkspaceActivityEvent): string {
  return `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function activityEvent(
  sequence: number,
  streamId = "workspace_activity_stream_test",
): WorkspaceActivityEvent {
  return {
    delta: {
      activity: null,
      activityId: `activity_${sequence}`,
      kind: "upsert",
    },
    emittedAt: "2026-06-21T12:00:00Z",
    eventId: `${streamId}:${sequence}`,
    resync: null,
    revision: sequence,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "workspace_activity.delta",
    workspaceId: "workspace_api",
  };
}

function resyncEvent(sequence: number, streamId: string): WorkspaceActivityEvent {
  return {
    delta: null,
    emittedAt: "2026-06-21T12:00:00Z",
    eventId: `${streamId}:${sequence}`,
    resync: {
      currentRevision: sequence,
      currentSequence: sequence,
      currentStreamId: streamId,
      earliestSequence: sequence,
      reason: "workspace activity replay is no longer available",
      requestedSequence: 1,
      requestedStreamId: "workspace_activity_stream_old",
    },
    revision: sequence,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "workspace_activity.resync_required",
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
