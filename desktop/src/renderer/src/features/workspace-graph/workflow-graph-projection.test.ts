import { describe, expect, test } from "vitest";

import type { WorkflowGraphProjection } from "@generated/backend";
import { pixiGraphFromWorkflowProjection } from "./workflow-graph-projection";

describe("pixiGraphFromWorkflowProjection", () => {
  test("maps backend workflow projection into deterministic Pixi graph data", () => {
    const graph = pixiGraphFromWorkflowProjection(testProjection());

    expect(graph.workflow).toEqual({
      definitionId: "definition_review",
      definitionName: "Review workflow",
      executionId: "execution_review",
      executionStatus: "running",
      workspaceId: "workspace_test",
    });
    expect(graph.nodes.map((node) => [node.id, node.status, node.executionCount])).toEqual([
      ["start", "succeeded", 1],
      ["work", "running", 2],
      ["end", "not_started", 0],
    ]);
    expect(
      graph.edges.map((edge) => [edge.id, edge.sourceNodeId, edge.targetNodeId, edge.status]),
    ).toEqual([
      ["start_work", "start", "work", "completed"],
      ["work_end", "work", "end", "active"],
    ]);
    expect(graph.nodes.find((node) => node.id === "start")?.x).toBeLessThan(
      graph.nodes.find((node) => node.id === "work")?.x ?? 0,
    );
    expect(graph.nodes.find((node) => node.id === "work")?.x).toBeLessThan(
      graph.nodes.find((node) => node.id === "end")?.x ?? 0,
    );
  });

  test("uses persisted workflow layout when projection includes editor positions", () => {
    const graph = pixiGraphFromWorkflowProjection({
      ...testProjection(),
      layout: {
        nodes: [
          { nodeId: "start", x: -480, y: -40 },
          { nodeId: "work", x: 80, y: 140 },
          { nodeId: "end", x: 420, y: -20 },
        ],
      },
    });

    expect(graph.nodes.map((node) => [node.id, node.x, node.y])).toEqual([
      ["start", -480, -40],
      ["work", 80, 140],
      ["end", 420, -20],
    ]);
  });
});

function testProjection(): WorkflowGraphProjection {
  return {
    definitionDescription: "",
    definitionId: "definition_review",
    definitionName: "Review workflow",
    definitionVersionId: "version_review",
    edges: [
      {
        activeTokenCount: 0,
        cancelledTokenCount: 0,
        completedTokenCount: 1,
        fromNodeId: "start",
        id: "start_work",
        kind: "normal",
        status: "completed",
        toNodeId: "work",
      },
      {
        activeTokenCount: 1,
        cancelledTokenCount: 0,
        completedTokenCount: 0,
        fromNodeId: "work",
        id: "work_end",
        kind: "normal",
        status: "active",
        toNodeId: "end",
      },
    ],
    executionId: "execution_review",
    executionStatus: "running",
    lastEventOrdinal: 4,
    layout: { nodes: [] },
    nodes: [
      projectedNode("start", "start", "succeeded", 1),
      projectedNode("work", "action", "running", 2),
      projectedNode("end", "end", "not_started", 0),
    ],
    schemaVersion: 1,
    terminalReason: null,
    updatedAt: "2026-06-05T12:00:00Z",
    workspaceId: "workspace_test",
  };
}

function projectedNode(
  id: string,
  kind: WorkflowGraphProjection["nodes"][number]["kind"],
  status: WorkflowGraphProjection["nodes"][number]["status"],
  executionCount: number,
): WorkflowGraphProjection["nodes"][number] {
  return {
    actionKind: null,
    active: status === "running",
    error: "",
    executionCount,
    filePaths: [],
    id,
    kind,
    label: id,
    latestAttempt: executionCount,
    latestIteration: 1,
    latestNodeExecutionId: executionCount > 0 ? `node_execution_${id}` : "",
    pendingApproval: null,
    recoveryMessage: "",
    recoveryOutcome: null,
    signals: [],
    status,
    title: "",
  };
}
