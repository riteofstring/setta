import type { WorkflowEvent } from "@generated/backend";
import type { BackendFetch } from "@shared/backend-runtime";
import { describe, expect, test, vi } from "vitest";

import { startWorkflowEventStream } from "./workflow-event-stream";

describe("workflow event stream", () => {
  test("reconnects with the last workflow event id", async () => {
    const first = workflowEvent(1);
    const second = workflowEvent(2);
    const forwarded: WorkflowEvent[] = [];
    const lastEventIds: string[] = [];
    const fetchImpl: BackendFetch = vi.fn(async (input, init) => {
      expect(input.toString()).toBe("http://127.0.0.1:41000/workflows/events");
      expect(init.method).toBe("GET");
      const headers = init.headers as Record<string, string>;
      lastEventIds.push(headers["Last-Event-ID"] ?? "");
      if (lastEventIds.length === 1) {
        return new Response(textStream(sseFrame("workflow_events:1", first)), { status: 200 });
      }
      return new Response(
        textStreamUntilAbort(sseFrame("workflow_events:2", second), init.signal),
        { status: 200 },
      );
    });

    const stream = startWorkflowEventStream({
      baseURL: "http://127.0.0.1:41000",
      fetchImpl,
      reconnectDelayMs: 1,
      sendEvent: (event) => {
        forwarded.push(event);
      },
    });

    await waitFor(() => forwarded.length === 2);
    await stream.stop();

    expect(lastEventIds).toEqual(["", "workflow_events:1"]);
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

function sseFrame(id: string, event: WorkflowEvent): string {
  return `id: ${id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function workflowEvent(ordinal: number): WorkflowEvent {
  return {
    createdAt: "2026-06-05T12:00:00Z",
    definitionId: "workflow_definition_api",
    definitionVersionId: "workflow_version_api",
    details: {},
    executionId: "workflow_execution_api",
    id: `workflow_event_${ordinal}`,
    message: "workflow started",
    nodeExecutionId: "",
    nodeId: "",
    ordinal,
    runnerKind: null,
    schemaVersion: 1,
    tokenId: "",
    type: "workflow.execution.started",
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
