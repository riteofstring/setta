import type { SemanticGraphChangeEvent } from "@generated/backend";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createSemanticGraphEventForwarder } from "./semantic-graph-event-forwarding-stream";

describe("semantic graph event forwarding stream", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("coalesces audit-only events before forwarding to renderers", () => {
    vi.useFakeTimers();
    const forwarded: SemanticGraphChangeEvent[] = [];
    const recorded: SemanticGraphChangeEvent[] = [];
    const forwarder = createSemanticGraphEventForwarder({
      forwardEvent: (event) => forwarded.push(event),
      recordEvent: (event) => recorded.push(event),
    });

    forwarder.sendEvent(
      semanticGraphEvent(1, {
        cartographerRunIds: ["run_1"],
        changedAreas: ["cartographer_audit"],
      }),
    );
    forwarder.sendEvent(
      semanticGraphEvent(2, {
        cartographerRunIds: ["run_2"],
        changedAreas: ["cartographer_audit"],
        targetEntityIds: ["node_2"],
      }),
    );

    expect(forwarded).toEqual([]);
    vi.advanceTimersByTime(100);

    expect(forwarded).toHaveLength(1);
    expect(forwarded[0]).toMatchObject({
      cartographerRunIds: ["run_1", "run_2"],
      changedAreas: ["cartographer_audit"],
      eventId: "semantic_graph_changes:2",
      sequence: 2,
      targetEntityIds: ["node_2"],
    });
    expect(recorded).toEqual(forwarded);
  });

  test("flushes pending audit events before immediate graph events", () => {
    vi.useFakeTimers();
    const forwarded: SemanticGraphChangeEvent[] = [];
    const forwarder = createSemanticGraphEventForwarder({
      forwardEvent: (event) => forwarded.push(event),
      recordEvent: () => {},
    });
    const audit = semanticGraphEvent(1, { changedAreas: ["cartographer_audit"] });
    const graph = semanticGraphEvent(2, { changedAreas: ["graph"] });

    forwarder.sendEvent(audit);
    forwarder.sendEvent(graph);

    expect(forwarded).toEqual([audit, graph]);
  });
});

function semanticGraphEvent(
  sequence: number,
  patch: Partial<SemanticGraphChangeEvent> = {},
): SemanticGraphChangeEvent {
  return {
    cartographerPatchIds: [],
    cartographerRunIds: [],
    cartographerWindowIds: [],
    changedAreas: ["graph"],
    createdSemanticEventIds: [],
    eventId: `semantic_graph_changes:${sequence}`,
    occurredAt: "2026-06-11T12:00:00Z",
    schemaVersion: 1,
    semanticEdgeIds: [],
    semanticNodeIds: [],
    sequence,
    streamId: "semantic_graph_changes",
    targetEntityIds: [],
    type: "semantic_graph.changed",
    workspaceId: "workspace_api",
    ...patch,
  };
}
