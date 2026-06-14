import type {
  SemanticEdge,
  SemanticGraphChangeEvent,
  SemanticNode,
  SemanticNodeDetail,
} from "@generated/backend";
import { describe, expect, test } from "vitest";

import { semanticGraphChangeAffectsSemanticNodeInspection } from "./semantic-node-details-invalidation";

describe("semanticGraphChangeAffectsSemanticNodeInspection", () => {
  test("matches selected node target and ignores other workspaces", () => {
    const detail = semanticNodeDetail();
    const target = { nodeId: "node_selected", workspaceId: "workspace_graph" };

    expect(
      semanticGraphChangeAffectsSemanticNodeInspection(
        semanticGraphChangeEvent({ semanticNodeIds: ["node_selected"] }),
        target,
        detail,
      ),
    ).toBe(true);
    expect(
      semanticGraphChangeAffectsSemanticNodeInspection(
        semanticGraphChangeEvent({
          semanticNodeIds: ["node_selected"],
          workspaceId: "workspace_other",
        }),
        target,
        detail,
      ),
    ).toBe(false);
  });

  test("matches visible edge and cartographer audit records", () => {
    const detail = semanticNodeDetail();
    const target = { nodeId: "node_selected", workspaceId: "workspace_graph" };

    expect(
      semanticGraphChangeAffectsSemanticNodeInspection(
        semanticGraphChangeEvent({ semanticEdgeIds: ["edge_selected"] }),
        target,
        detail,
      ),
    ).toBe(true);
    expect(
      semanticGraphChangeAffectsSemanticNodeInspection(
        semanticGraphChangeEvent({
          cartographerPatchIds: ["cartographer_patch_selected"],
          changedAreas: ["cartographer_audit"],
          semanticNodeIds: [],
          targetEntityIds: [],
        }),
        target,
        detail,
      ),
    ).toBe(true);
    expect(
      semanticGraphChangeAffectsSemanticNodeInspection(
        semanticGraphChangeEvent({
          cartographerRunIds: ["cartographer_run_other"],
          changedAreas: ["cartographer_audit"],
          semanticNodeIds: [],
          targetEntityIds: [],
        }),
        target,
        detail,
      ),
    ).toBe(false);
  });
});

function semanticNodeDetail(): SemanticNodeDetail {
  return {
    activity: [],
    cartographerCursors: [],
    cartographerPatches: [
      { id: "cartographer_patch_selected" },
    ] as SemanticNodeDetail["cartographerPatches"],
    cartographerRuns: [
      { id: "cartographer_run_selected" },
    ] as SemanticNodeDetail["cartographerRuns"],
    cartographerWindows: [
      { id: "cartographer_window_selected" },
    ] as SemanticNodeDetail["cartographerWindows"],
    contextPackHistory: [],
    evidence: [],
    incomingEdges: [],
    node: semanticNode("node_selected"),
    outgoingEdges: [semanticEdge("edge_selected")],
    steeringDirectives: [],
    workspaceId: "workspace_graph",
  };
}

function semanticNode(id: string): SemanticNode {
  return {
    createdAt: "2026-06-11T12:00:00Z",
    createdByEventId: "semantic_event_node",
    dismissed: false,
    id,
    kind: "finding",
    label: "Selected Node",
    mergedIntoNodeId: "",
    promoted: false,
    splitFromNodeId: "",
    splitIntoNodeIds: [],
    summary: "Selected node summary",
    updatedAt: "2026-06-11T12:00:00Z",
    updatedByEventId: "semantic_event_node",
    workspaceId: "workspace_graph",
  };
}

function semanticEdge(id: string): SemanticEdge {
  return {
    createdAt: "2026-06-11T12:00:00Z",
    createdByEventId: "semantic_event_edge",
    fromNodeId: "node_selected",
    id,
    kind: "supports",
    label: "supports",
    summary: "",
    toNodeId: "node_other",
    updatedAt: "2026-06-11T12:00:00Z",
    updatedByEventId: "semantic_event_edge",
    workspaceId: "workspace_graph",
  };
}

function semanticGraphChangeEvent(
  patch: Partial<SemanticGraphChangeEvent> = {},
): SemanticGraphChangeEvent {
  return {
    cartographerPatchIds: [],
    cartographerRunIds: [],
    cartographerWindowIds: [],
    changedAreas: ["graph"],
    createdSemanticEventIds: [],
    eventId: "semantic_graph_changes:1",
    occurredAt: "2026-06-11T12:00:00Z",
    schemaVersion: 1,
    semanticEdgeIds: [],
    semanticNodeIds: ["node_selected"],
    semanticRuntimeDelta: null,
    semanticRuntimeRevision: 1,
    semanticRuntimeSnapshotRequired: false,
    sequence: 1,
    streamId: "semantic_graph_changes",
    targetEntityIds: ["node_selected"],
    type: "semantic_graph.changed",
    workspaceId: "workspace_graph",
    ...patch,
  };
}
