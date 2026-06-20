import { describe, expect, test } from "vitest";

import type { RendererGraphSnapshotEvent } from "@shared/recording";
import { compactRendererRecordedEvent } from "./session-recorder";

describe("session recorder graph events", () => {
  test("keeps graph payload bounds explicit", () => {
    const event = graphSnapshotEvent({
      nodeCount: 40,
      timingBucketCount: 50,
      timingSampleCount: 20,
    });

    const compacted = compactRendererRecordedEvent(event);

    if (compacted.type !== "graph_snapshot") {
      throw new Error(`unexpected compacted event type: ${compacted.type}`);
    }
    expect(compacted.graph.nodes.visible).toHaveLength(24);
    expect(compacted.graph.timing?.timingSamples).toHaveLength(12);
    expect(Object.keys(compacted.graph.timing?.timingBuckets ?? {})).toHaveLength(40);
    expect(compacted.graph.truncation).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          limit: 24,
          omitted: 16,
          path: "graph.nodes.visible",
          total: 40,
        }),
        expect.objectContaining({
          limit: 12,
          omitted: 8,
          path: "graph.timing.timingSamples",
          total: 20,
        }),
        expect.objectContaining({
          limit: 40,
          omitted: 10,
          path: "graph.timing.timingBuckets",
          total: 50,
        }),
      ]),
    );
  });
});

function graphSnapshotEvent({
  nodeCount,
  timingBucketCount,
  timingSampleCount,
}: {
  nodeCount: number;
  timingBucketCount: number;
  timingSampleCount: number;
}): RendererGraphSnapshotEvent {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node_${index}`,
    kind: "action",
    labelVisibilityReason: "all-visible",
    labelVisible: true,
    layer: "workflow",
    materialized: true,
    moved: false,
    movementOwner: "workflow_definition_layout",
    screenX: index,
    screenY: index,
    selected: false,
    status: "ready",
    visible: true,
    x: index,
    y: index,
  }));
  return {
    at: "2026-06-20T12:00:00.000Z",
    graph: {
      camera: { x: 0, y: 0, zoom: 1 },
      counts: {
        edges: 0,
        materializedNodes: nodeCount,
        movedNodes: 0,
        nodes: nodeCount,
        selectedEdges: 0,
        selectedNodes: 0,
        trajectorySprites: 0,
        visibleNodes: nodeCount,
      },
      lastLayoutSave: null,
      nodes: {
        moved: [],
        selected: [],
        touched: [],
        visible: nodes,
      },
      pendingLayout: {
        generation: null,
        writeCount: 0,
      },
      schemaVersion: 2,
      selected: {
        edgeIds: [],
        nodeIds: [],
      },
      surfaceId: "surface_recording",
      timing: {
        averageFrameMs: 16,
        p95FrameMs: 24,
        recentFrameMs: [],
        timingBucketCount,
        timingBuckets: Object.fromEntries(
          Array.from({ length: timingBucketCount }, (_, index) => [`bucket_${index}`, index]),
        ),
        timingSampleCount,
        timingSamples: Array.from({ length: timingSampleCount }, (_, index) => ({
          durationMs: index,
          name: `sample_${index}`,
        })),
        worstFrameMs: 32,
      },
      trajectory: {
        anchorSummaries: [],
        anchors: null,
        displayCount: 0,
        frameRevision: 0,
        groupCount: 0,
        recentLaneCount: 0,
        totalCount: 0,
      },
      truncation: [],
      visibility: {
        edges: visibilitySummary(0, 0),
        labels: visibilitySummary(nodeCount, nodeCount, { "all-visible": nodeCount }),
        nodes: visibilitySummary(nodeCount, nodeCount, { materialized: nodeCount }),
        sprites: visibilitySummary(0, 0),
      },
      workflow: null,
    },
    surfaceId: "surface_recording",
    trigger: "manual",
    type: "graph_snapshot",
    url: "app://setta",
  };
}

function visibilitySummary(
  total: number,
  visible: number,
  visibleReasons: Record<string, number> = {},
) {
  return {
    hidden: total - visible,
    hiddenReasons: {},
    total,
    visible,
    visibleReasons,
  };
}
