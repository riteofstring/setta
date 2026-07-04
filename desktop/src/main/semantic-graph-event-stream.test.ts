import type { SemanticGraphChangeEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { describe, expect, test, vi } from "vitest";

import { startSemanticGraphEventStream } from "./semantic-graph-event-stream";

describe("semantic graph event stream", () => {
  test("reconnects with the last semantic graph event id", async () => {
    const first = semanticGraphEvent(1);
    const second = semanticGraphEvent(2);
    const forwarded: SemanticGraphChangeEvent[] = [];
    const lastEventIds: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (input, init) => {
      expect(input.toString()).toBe("http://127.0.0.1:41000/semantic-graph/events/changes");
      expect(init.method).toBe("GET");
      const headers = init.headers as Record<string, string>;
      lastEventIds.push(headers["Last-Event-ID"] ?? "");
      if (lastEventIds.length === 1) {
        return new Response(textStream(sseFrame(first)), { status: 200 });
      }
      return new Response(textStreamUntilAbort(sseFrame(second), init.signal), { status: 200 });
    });

    const stream = startSemanticGraphEventStream({
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 1,
      sendEvent: (event) => {
        forwarded.push(event);
      },
    });

    await waitFor(() => forwarded.length === 2);
    await stream.stop();

    expect(lastEventIds).toEqual(["", "semantic_graph_changes:1"]);
    expect(forwarded).toEqual([first, second]);
  });

  test("accepts a new semantic graph stream id after reconnect", async () => {
    const beforeRestart = semanticGraphEvent(1, "semantic_graph_changes");
    const afterRestart = semanticGraphEvent(1, "semantic_graph_changes_after_restart");
    const forwarded: SemanticGraphChangeEvent[] = [];
    const lastEventIds: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (_input, init) => {
      const headers = init.headers as Record<string, string>;
      lastEventIds.push(headers["Last-Event-ID"] ?? "");
      if (lastEventIds.length === 1) {
        return new Response(textStream(sseFrame(beforeRestart)), { status: 200 });
      }
      return new Response(textStreamUntilAbort(sseFrame(afterRestart), init.signal), {
        status: 200,
      });
    });

    const stream = startSemanticGraphEventStream({
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 1,
      sendEvent: (event) => {
        forwarded.push(event);
      },
    });

    await waitFor(() => forwarded.length === 2);
    await stream.stop();

    expect(lastEventIds).toEqual(["", "semantic_graph_changes:1"]);
    expect(forwarded).toEqual([beforeRestart, afterRestart]);
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

function sseFrame(event: SemanticGraphChangeEvent): string {
  return `id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function semanticGraphEvent(
  sequence: number,
  streamId = "semantic_graph_changes",
): SemanticGraphChangeEvent {
  return {
    cartographerPatchIds: [],
    cartographerRunIds: [],
    cartographerWindowIds: [],
    changedAreas: ["graph"],
    createdSemanticEventIds: [`semantic_event_${sequence}`],
    eventId: `${streamId}:${sequence}`,
    occurredAt: "2026-06-11T12:00:00Z",
    schemaVersion: 1,
    semanticEdgeIds: [],
    semanticNodeIds: [`node_${sequence}`],
    sequence,
    streamId,
    targetEntityIds: [`node_${sequence}`],
    type: "semantic_graph.changed",
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
