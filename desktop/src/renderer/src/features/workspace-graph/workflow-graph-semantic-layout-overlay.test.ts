import type { SemanticGraph, SemanticLayoutPositionInput } from "@generated/backend";
import { describe, expect, test } from "vitest";

import {
  pendingSemanticLayoutPositionsAfterSaveSettlement,
  pendingSemanticLayoutPositionsWithInputs,
  type PendingSemanticLayoutPosition,
} from "./workflow-graph-semantic-layout-overlay";

describe("workflow graph semantic layout overlay", () => {
  test("settles only the affected semantic layout save generation", () => {
    const current = pendingSemanticLayoutPositionsWithInputs({
      current: [
        pendingPosition("semantic_constraint", 2, 300, 40),
        pendingPosition("semantic_finding", 1, 500, 60),
      ],
      inputs: [input("semantic_decision", 120, 20)],
      saveSequence: 1,
      semanticGraph: semanticGraph(),
    });

    const remaining = pendingSemanticLayoutPositionsAfterSaveSettlement({
      current,
      inputs: [
        input("semantic_constraint", 220, -80),
        input("semantic_finding", 500, 60),
        input("semantic_decision", 120, 20),
      ],
      saveSequence: 1,
    });

    expect(remaining).toEqual([pendingPosition("semantic_constraint", 2, 300, 40)]);
  });
});

function pendingPosition(
  entityId: string,
  saveSequence: number,
  x: number,
  y: number,
): PendingSemanticLayoutPosition {
  return {
    entityId,
    pinned: true,
    saveSequence,
    updatedAt: "",
    workspaceId: "workspace_test",
    x,
    y,
  };
}

function input(entityId: string, x: number, y: number): SemanticLayoutPositionInput {
  return {
    entityId,
    pinned: true,
    x,
    y,
  };
}

function semanticGraph(): SemanticGraph {
  return {
    edges: [],
    layoutPositions: [],
    nodes: [
      semanticNode("semantic_constraint"),
      semanticNode("semantic_finding"),
      semanticNode("semantic_decision"),
    ],
    sourceLinks: [],
    workspaceId: "workspace_test",
  };
}

function semanticNode(id: string): SemanticGraph["nodes"][number] {
  return {
    createdAt: "2026-06-10T12:00:00Z",
    createdByEventId: "event_create",
    dismissed: false,
    futureUse: "",
    id,
    kind: "constraint",
    label: id,
    mergedIntoNodeId: "",
    promoted: false,
    splitFromNodeId: "",
    splitIntoNodeIds: [],
    summary: "",
    updatedAt: "2026-06-10T12:00:00Z",
    updatedByEventId: "event_update",
    whyItExists: "",
    workspaceId: "workspace_test",
  };
}
