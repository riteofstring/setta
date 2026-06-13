import { describe, expect, test } from "vitest";

import type { SemanticActivityInterval, SemanticGraph, SemanticNode } from "@generated/backend";
import {
  mergeWorkflowAndSemanticGraphs,
  rendererGraphFromSemanticGraph,
  semanticLayoutPositionInputsFromRendererPositions,
  semanticNodeIdFromRendererNodeId,
  semanticRendererNodeId,
} from "./semantic-graph-projection";
import type { WorkflowGraphGraph } from "./pixi-renderer";
import { workflowNodeAccentColor } from "./workspace-neon-theme";

describe("rendererGraphFromSemanticGraph", () => {
  test("maps semantic graph state into distinct renderer nodes, edges, and activity markers", () => {
    const semanticGraph = testSemanticGraph();
    const graph = rendererGraphFromSemanticGraph({
      semanticActivities: new Map([
        [
          "node_constraint",
          [
            activity({
              endedAt: "",
              id: "activity_active",
              kind: "validating",
              summary: "Checking constraint",
            }),
          ],
        ],
      ]),
      semanticGraph,
      workflowGraph: testWorkflowGraph(),
    });

    expect(graph.nodes.map((node) => [node.id, node.layer, node.connectable])).toEqual([
      ["semantic:node_constraint", "semantic", false],
      ["semantic:node_finding", "semantic", false],
    ]);
    expect(graph.nodes.find((node) => node.id === "semantic:node_constraint")).toMatchObject({
      activity: { active: true, count: 1, kind: "validating" },
      dismissed: false,
      mergedIntoNodeId: "",
      promoted: false,
      splitFromNodeId: "",
      splitIntoNodeIds: [],
      x: 80,
      y: -40,
    });
    expect(
      graph.edges.map((edge) => [edge.id, edge.layer, edge.sourceNodeId, edge.targetNodeId]),
    ).toEqual([
      [
        "semantic-edge:edge_supports",
        "semantic",
        "semantic:node_finding",
        "semantic:node_constraint",
      ],
    ]);
  });

  test("creates layout update inputs only for moved semantic nodes", () => {
    expect(
      semanticLayoutPositionInputsFromRendererPositions({
        positions: [
          { moved: true, nodeId: "workflow_node", x: 1, y: 2 },
          { moved: false, nodeId: semanticRendererNodeId("node_constraint"), x: 3, y: 4 },
          { moved: true, nodeId: semanticRendererNodeId("node_constraint"), x: 80, y: -40 },
          { moved: true, nodeId: semanticRendererNodeId("missing"), x: 5, y: 6 },
        ],
        semanticGraph: testSemanticGraph(),
      }),
    ).toEqual([{ entityId: "node_constraint", pinned: true, x: 80, y: -40 }]);
  });

  test("threads semantic provenance fields in renderer node id namespace", () => {
    const graph = rendererGraphFromSemanticGraph({
      semanticActivities: new Map(),
      semanticGraph: {
        ...testSemanticGraph(),
        nodes: [
          {
            ...node("node_parent", "concept", "Parent"),
            dismissed: true,
            splitIntoNodeIds: ["node_left", "node_right"],
          },
          {
            ...node("node_left", "finding", "Left"),
            promoted: true,
            splitFromNodeId: "node_parent",
          },
          {
            ...node("node_absorbed", "question", "Absorbed"),
            dismissed: true,
            mergedIntoNodeId: "node_left",
          },
        ],
      },
      workflowGraph: undefined,
    });

    expect(graph.nodes.find((candidate) => candidate.id === "semantic:node_parent")).toMatchObject({
      dismissed: true,
      splitFromNodeId: "",
      splitIntoNodeIds: ["semantic:node_left", "semantic:node_right"],
    });
    expect(graph.nodes.find((candidate) => candidate.id === "semantic:node_left")).toMatchObject({
      promoted: true,
      splitFromNodeId: "semantic:node_parent",
    });
    expect(
      graph.nodes.find((candidate) => candidate.id === "semantic:node_absorbed"),
    ).toMatchObject({
      dismissed: true,
      mergedIntoNodeId: "semantic:node_left",
    });
  });

  test("merges workflow and semantic renderer graphs without changing workflow metadata", () => {
    const workflowGraph = testWorkflowGraph();
    const semanticGraph = rendererGraphFromSemanticGraph({
      semanticActivities: new Map(),
      semanticGraph: testSemanticGraph(),
      workflowGraph,
    });

    const merged = mergeWorkflowAndSemanticGraphs({ semanticGraph, workflowGraph });

    expect(merged?.workflow).toEqual(workflowGraph.workflow);
    expect(merged?.nodes.map((node) => node.id)).toEqual([
      "workflow_node",
      "semantic:node_constraint",
      "semantic:node_finding",
    ]);
  });

  test("round trips semantic renderer node ids", () => {
    expect(semanticNodeIdFromRendererNodeId("semantic:node_constraint")).toBe("node_constraint");
    expect(semanticNodeIdFromRendererNodeId("workflow_node")).toBeNull();
  });
});

function testSemanticGraph(): SemanticGraph {
  return {
    edges: [
      {
        createdAt: "2026-06-10T12:00:03Z",
        createdByEventId: "event_edge",
        fromNodeId: "node_finding",
        id: "edge_supports",
        kind: "supports",
        label: "supports",
        summary: "",
        toNodeId: "node_constraint",
        updatedAt: "2026-06-10T12:00:03Z",
        updatedByEventId: "event_edge",
        workspaceId: "workspace_test",
      },
    ],
    layoutPositions: [
      {
        entityId: "node_constraint",
        pinned: true,
        updatedAt: "2026-06-10T12:00:04Z",
        workspaceId: "workspace_test",
        x: 80,
        y: -40,
      },
    ],
    nodes: [
      node("node_constraint", "constraint", "Keep layout read-only"),
      node("node_finding", "finding", "Backend writes are scoped"),
    ],
    workspaceId: "workspace_test",
  };
}

function node(id: string, kind: SemanticNode["kind"], label: string): SemanticNode {
  return {
    createdAt: "2026-06-10T12:00:01Z",
    createdByEventId: "event_node",
    dismissed: false,
    id,
    kind,
    label,
    mergedIntoNodeId: "",
    promoted: false,
    splitFromNodeId: "",
    splitIntoNodeIds: [],
    summary: "",
    updatedAt: "2026-06-10T12:00:02Z",
    updatedByEventId: "event_node",
    workspaceId: "workspace_test",
  };
}

function activity({
  endedAt,
  id,
  kind,
  summary,
}: {
  endedAt: string;
  id: string;
  kind: SemanticActivityInterval["kind"];
  summary: string;
}): SemanticActivityInterval {
  return {
    endedAt,
    endedByEventId: endedAt === "" ? "" : "event_activity_end",
    actorId: "user_projection",
    actorKind: "user",
    chatConversationId: "",
    chatMessageId: "",
    chatRunId: "",
    evidenceAnchorId: "evidence_projection",
    id,
    kind,
    sourceId: "workflow_execution_projection",
    sourceKind: "workflow_execution",
    startedAt: "2026-06-10T12:00:05Z",
    startedByEventId: "event_activity_start",
    summary,
    targetEntityId: "node_constraint",
    updatedAt: "2026-06-10T12:00:05Z",
    workflowDefinitionId: "",
    workflowExecutionId: "workflow_execution_projection",
    workflowNodeId: "",
    workflowNodeExecutionId: "",
    runItemId: "",
    reassignedFromIntervalId: "",
    workspaceId: "workspace_test",
  };
}

function testWorkflowGraph(): WorkflowGraphGraph {
  return {
    edges: [],
    nodes: [
      {
        color: workflowNodeAccentColor("ready", "action"),
        height: 82,
        id: "workflow_node",
        kind: "action",
        layer: "workflow",
        label: "Workflow Node",
        status: "ready",
        width: 180,
        x: -120,
        y: 0,
      },
    ],
    workflow: {
      definitionId: "definition_test",
      definitionName: "Workflow",
      definitionVersionId: "",
      definitionVersionNumber: 0,
      draftRevision: "sha256:draft",
      editable: true,
      executionId: "",
      executionStatus: "",
      versionMismatch: false,
      viewMode: "draft",
      workspaceId: "workspace_test",
    },
  };
}
