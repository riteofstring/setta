import type { WorkspaceTrajectoryRuntimeEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { describe, expect, test, vi } from "vitest";

import { startWorkspaceTrajectoryRuntimeEventStream } from "./workspace-trajectory-event-stream";

describe("workspace trajectory runtime event stream", () => {
  test("reconnects with the last workspace trajectory runtime event id", async () => {
    const first = trajectoryRuntimeEvent(1);
    const second = trajectoryRuntimeEvent(2);
    const forwarded: WorkspaceTrajectoryRuntimeEvent[] = [];
    const lastEventIds: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (input, init) => {
      expect(input.toString()).toBe("http://127.0.0.1:41000/workspace-trajectory/runtime/events");
      expect(init.method).toBe("GET");
      const headers = init.headers as Record<string, string>;
      lastEventIds.push(headers["Last-Event-ID"] ?? "");
      if (lastEventIds.length === 1) {
        return new Response(textStream(sseFrame(first)), { status: 200 });
      }
      return new Response(textStreamUntilAbort(sseFrame(second), init.signal), { status: 200 });
    });

    const stream = startWorkspaceTrajectoryRuntimeEventStream({
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 1,
      sendEvent: (event) => {
        forwarded.push(event);
      },
    });

    await waitFor(() => forwarded.length === 2);
    await stream.stop();

    expect(lastEventIds).toEqual(["", "workspace_trajectory_runtime:1"]);
    expect(forwarded).toEqual([first, second]);
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

function sseFrame(event: WorkspaceTrajectoryRuntimeEvent): string {
  return `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function trajectoryRuntimeEvent(sequence: number): WorkspaceTrajectoryRuntimeEvent {
  return {
    delta: null,
    eventId: `workspace_trajectory_runtime:${sequence}`,
    occurredAt: "2026-06-17T12:00:00Z",
    revision: sequence,
    schemaVersion: 1,
    sequence,
    snapshotRequired: false,
    streamId: "workspace_trajectory_runtime",
    type: "workspace_trajectory.runtime.changed",
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
