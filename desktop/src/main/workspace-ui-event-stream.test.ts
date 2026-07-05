import type { WorkspaceUIEvent, WorkspaceUILayout } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { describe, expect, test, vi } from "vitest";

import { startWorkspaceUIEventStream } from "./workspace-ui-event-stream";

describe("workspace UI event stream", () => {
  test("connects to the scoped workspace UI event endpoint and reconnects with the last id", async () => {
    const first = layoutUpdatedEvent(1);
    const second = layoutUpdatedEvent(2);
    const forwarded: WorkspaceUIEvent[] = [];
    const forwardedSecond = deferred<void>();
    const lastEventIds: string[] = [];
    const urls: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (input, init) => {
      urls.push(input.toString());
      expect(init.method).toBe("GET");
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer token_test");
      lastEventIds.push(headers["Last-Event-ID"] ?? "");
      if (lastEventIds.length === 1) {
        return new Response(textStream(sseFrame(first)), { status: 200 });
      }
      return new Response(textStreamUntilAbort(sseFrame(second), init.signal), { status: 200 });
    });

    const stream = startWorkspaceUIEventStream({
      authToken: "token_test",
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 0,
      sendEvent: (event) => {
        forwarded.push(event);
        if (forwarded.length === 2) {
          forwardedSecond.resolve();
        }
      },
      workspaceId: "workspace_api",
    });

    await forwardedSecond.promise;
    await stream.stop();

    expect(urls).toEqual([
      "http://127.0.0.1:41000/workspaces/ui/events?workspaceId=workspace_api",
      "http://127.0.0.1:41000/workspaces/ui/events?workspaceId=workspace_api",
    ]);
    expect(lastEventIds).toEqual(["", "workspace_ui_stream_test:1"]);
    expect(forwarded).toEqual([first, second]);
  });

  test("forwards resync events when the stream id changes", async () => {
    const first = layoutUpdatedEvent(1, "workspace_ui_stream_old");
    const resync = resyncEvent(1, "workspace_ui_stream_new");
    const forwarded: WorkspaceUIEvent[] = [];
    const forwardedSecond = deferred<void>();
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

    const stream = startWorkspaceUIEventStream({
      authToken: "token_test",
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 0,
      sendEvent: (event) => {
        forwarded.push(event);
        if (forwarded.length === 2) {
          forwardedSecond.resolve();
        }
      },
      workspaceId: "workspace_api",
    });

    await forwardedSecond.promise;
    await stream.stop();

    expect(lastEventIds).toEqual(["", "workspace_ui_stream_old:1"]);
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

function sseFrame(event: WorkspaceUIEvent): string {
  return `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function layoutUpdatedEvent(
  sequence: number,
  streamId = "workspace_ui_stream_test",
): WorkspaceUIEvent {
  return {
    emittedAt: "2026-07-08T12:00:00Z",
    eventId: `${streamId}:${sequence}`,
    layout: workspaceUILayout(sequence),
    resync: null,
    revision: sequence,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "workspace_ui.layout_updated",
    workspaceId: "workspace_api",
  };
}

function resyncEvent(sequence: number, streamId: string): WorkspaceUIEvent {
  return {
    emittedAt: "2026-07-08T12:00:00Z",
    eventId: `${streamId}:${sequence}`,
    layout: null,
    resync: {
      currentRevision: sequence,
      currentSequence: sequence,
      currentStreamId: streamId,
      earliestSequence: sequence,
      reason: "workspace UI replay is no longer available",
      requestedSequence: 1,
      requestedStreamId: "workspace_ui_stream_old",
    },
    revision: sequence,
    schemaVersion: 1,
    sequence,
    streamId,
    type: "workspace_ui.resync_required",
    workspaceId: "workspace_api",
  };
}

function workspaceUILayout(revision: number): WorkspaceUILayout {
  return {
    columns: [
      {
        columnId: "workspace_column_0",
        idealWidthSpec: { unit: "px", value: 520 },
        index: 0,
        paneIds: ["workspace_pane_0"],
        planeIndex: 0,
        previousProportionWidth: null,
        slotIndex: 0,
        widthSpec: { unit: "px", value: 520 },
      },
    ],
    focusedPaneId: "workspace_pane_0",
    panes: [
      {
        columnId: "workspace_column_0",
        heat: 0,
        heightPx: null,
        paneId: "workspace_pane_0",
        sequence: 0,
        subtitle: "workspace",
        surfaceId: "workspace_surface_0",
        surfaceKind: "chat-dom",
        terminalConfig: null,
        title: "Chat",
        tone: "cyan",
        weight: 1,
        workflowNodeDetailsConfig: null,
      },
    ],
    revision,
    schemaVersion: 3,
    workspaceId: "workspace_api",
  };
}

function deferred<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}
