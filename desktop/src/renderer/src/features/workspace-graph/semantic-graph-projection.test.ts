import { describe, expect, test } from "vitest";

import type {
  SemanticActivityInterval,
  SemanticGraph,
  SemanticNode,
  SemanticWorkingSet,
} from "@generated/backend";
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
      width: 68,
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
      [
        "semantic-source:evidence_constraint",
        "semantic",
        "workflow_node",
        "semantic:node_constraint",
      ],
      [
        "semantic-activity:activity_active",
        "semantic",
        "workflow_node",
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

  test("projects semantic working-set pulses and pending patch previews", () => {
    const graph = rendererGraphFromSemanticGraph({
      semanticActivities: new Map(),
      semanticGraph: testSemanticGraph(),
      semanticWorkingSet: testSemanticWorkingSet(),
      workflowGraph: testWorkflowGraph(),
    });

    expect(graph.nodes.find((node) => node.id === "semantic:node_constraint")).toMatchObject({
      activity: {
        active: true,
        count: 5,
        kind: "exploring",
        pulseKind: "cartographer_running",
      },
      semanticPulseKind: "cartographer_running",
      semanticRole: "committed",
    });
    const workflowRuntime = graph.workflowRuntimeByNodeId?.workflow_node;
    expect(workflowRuntime).toMatchObject({
      patchIds: ["cartographer_patch_preview"],
      pulseCount: 4,
      runIds: ["cartographer_run_live", "cartographer_run_target"],
      sourceCount: 5,
      status: "pending_review",
      statusCounts: [
        { count: 3, status: "pending_review" },
        { count: 5, status: "running" },
        { count: 1, status: "applied" },
      ],
      windowIds: [],
    });
    expect(workflowRuntime?.sourceRefs).toContainEqual(sourceRefs());
    expect(workflowRuntime?.recentPulses.map((pulse) => pulse.kind)).toEqual([
      "patch_proposed",
      "active_workflow_source",
      "cartographer_running",
      "evidence_attached",
    ]);
    expect(graph.nodes.filter((node) => node.semanticRole === "source_pulse")).toEqual([]);
    expect(
      graph.edges.find(
        (edge) =>
          edge.id === "semantic-live-source:semantic-working-set-source:run:cartographer_run_live",
      ),
    ).toBeUndefined();
    expect(
      graph.nodes.find(
        (node) => node.id === "semantic-preview:cartographer_patch_preview:node_preview",
      ),
    ).toMatchObject({
      activity: {
        active: true,
        count: 1,
        kind: "editing",
        pulseKind: "patch_proposed",
      },
      label: "Preview finding",
      semanticPulseKind: "patch_proposed",
      semanticRole: "preview",
    });
    expect(
      graph.edges.map((edge) => [edge.id, edge.sourceNodeId, edge.targetNodeId]),
    ).toContainEqual([
      "semantic-live-source:semantic-working-set-source:patch:cartographer_patch_preview",
      "workflow_node",
      "semantic-preview:cartographer_patch_preview:node_preview",
    ]);
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

  test("attaches aggregate runtime indicators to workflow nodes instead of source-pulse nodes", () => {
    const workflowGraph = testWorkflowGraph();
    const semanticGraph = rendererGraphFromSemanticGraph({
      semanticActivities: new Map(),
      semanticGraph: testSemanticGraph(),
      semanticWorkingSet: testSemanticWorkingSet(),
      workflowGraph,
    });

    const merged = mergeWorkflowAndSemanticGraphs({ semanticGraph, workflowGraph });

    expect(merged?.nodes.filter((node) => node.semanticRole === "source_pulse")).toEqual([]);
    expect(merged?.nodes.find((node) => node.id === "workflow_node")).toMatchObject({
      runtime: {
        patchIds: ["cartographer_patch_preview"],
        pulseCount: 4,
        runIds: ["cartographer_run_live", "cartographer_run_target"],
        sourceCount: 5,
        status: "pending_review",
      },
    });
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
    sourceLinks: [
      {
        chatConversationId: "",
        chatMessageId: "",
        chatRunId: "",
        contentHash: "",
        createdAt: "2026-06-10T12:00:04Z",
        createdByEventId: "event_evidence",
        id: "evidence_constraint",
        path: "",
        rangeEnd: 0,
        rangeStart: 0,
        reassignedFromAnchorId: "",
        runItemId: "",
        sourceId: "workflow_node",
        sourceKind: "workflow_node",
        summary: "Workflow node produced this constraint.",
        targetEntityId: "node_constraint",
        text: "",
        uri: "",
        workflowDefinitionId: "definition_test",
        workflowExecutionId: "execution_test",
        workflowNodeExecutionId: "",
        workflowNodeId: "workflow_node",
        workspaceId: "workspace_test",
      },
    ],
    workspaceId: "workspace_test",
  };
}

function testSemanticWorkingSet(): SemanticWorkingSet {
  return {
    activeCartographerRuns: [
      {
        changedSemanticEdgeIds: [],
        changedSemanticNodeIds: [],
        completedAt: "",
        createdAt: "2026-06-10T12:00:07Z",
        createdSemanticEventIds: [],
        diagnostics: [],
        id: "cartographer_run_live",
        inputItemCounts: inputItemCounts(),
        patchOperationNames: [],
        publicSummary: "",
        sourceRefs: sourceRefs(),
        startedAt: "",
        status: "running",
        targetEntityId: "",
        triggerKind: "workflow_window",
        updatedAt: "2026-06-10T12:00:07Z",
        windowId: "",
      },
    ],
    activeCartographerWindows: [],
    activeRunItemIds: ["run_item_live"],
    activeWorkflowNodeIds: ["workflow_node"],
    candidateTargets: [
      {
        changedSemanticEdgeIds: [],
        changedSemanticNodeIds: ["node_constraint"],
        diagnostics: [],
        patchIds: [],
        patchOperationNames: [],
        publicSummaries: [],
        runIds: ["cartographer_run_target"],
        sourceRefs: sourceRefs(),
        status: "running",
        targetEntityId: "node_constraint",
        triggerKind: "workflow_window",
        updatedAt: "2026-06-10T12:00:08Z",
        windowIds: [],
      },
    ],
    chatRunId: "",
    lastUpdatedAt: "2026-06-10T12:00:09Z",
    liveSourceRefs: [
      {
        changedSemanticEdgeIds: [],
        changedSemanticNodeIds: [],
        diagnostics: [],
        id: "semantic-working-set-source:run:cartographer_run_live",
        patchId: "",
        patchOperationNames: [],
        publicSummary: "",
        runId: "cartographer_run_live",
        sourceRefs: sourceRefs(),
        status: "running",
        targetEntityId: "",
        triggerKind: "workflow_window",
        updatedAt: "2026-06-10T12:00:07Z",
        windowId: "",
      },
      {
        changedSemanticEdgeIds: [],
        changedSemanticNodeIds: ["node_preview"],
        diagnostics: [],
        id: "semantic-working-set-source:patch:cartographer_patch_preview",
        patchId: "cartographer_patch_preview",
        patchOperationNames: ["record_finding"],
        publicSummary: "Preview a finding.",
        runId: "cartographer_run_live",
        sourceRefs: sourceRefs(),
        status: "pending_review",
        targetEntityId: "node_preview",
        triggerKind: "workflow_window",
        updatedAt: "2026-06-10T12:00:09Z",
        windowId: "",
      },
    ],
    pendingPatchPreviews: [
      {
        changedSemanticEdgeIds: [],
        changedSemanticNodeIds: ["node_preview"],
        createdAt: "2026-06-10T12:00:09Z",
        diagnostics: [],
        id: "semantic-working-set-preview:cartographer_patch_preview",
        newNodes: [
          {
            kind: "finding",
            label: "Preview finding",
            scope: "session",
            semanticNodeId: "node_preview",
            summary: "Preview summary.",
          },
        ],
        operation: "record_finding",
        patchId: "cartographer_patch_preview",
        patchOperationNames: ["record_finding"],
        publicSummary: "Preview a finding.",
        runId: "cartographer_run_live",
        sourceRefs: sourceRefs(),
        status: "pending_review",
        targetEntityId: "node_preview",
        triggerKind: "workflow_window",
        updatedAt: "2026-06-10T12:00:09Z",
        windowId: "",
      },
    ],
    pulses: [
      {
        activityKind: "exploring",
        diagnostics: [],
        evidenceAnchorIds: [],
        id: "semantic-working-set-pulse:active_workflow_source:run:cartographer_run_live",
        kind: "active_workflow_source",
        occurredAt: "2026-06-10T12:00:07Z",
        patchId: "",
        patchOperationNames: [],
        publicSummary: "",
        runId: "cartographer_run_live",
        semanticEdgeIds: [],
        semanticNodeIds: [],
        sourceRefs: sourceRefs(),
        status: "running",
        targetEntityId: "",
        triggerKind: "workflow_window",
        updatedAt: "2026-06-10T12:00:07Z",
        windowId: "",
      },
      {
        activityKind: "exploring",
        diagnostics: [],
        evidenceAnchorIds: [],
        id: "semantic-working-set-pulse:cartographer_running:run:cartographer_run_live",
        kind: "cartographer_running",
        occurredAt: "2026-06-10T12:00:07Z",
        patchId: "",
        patchOperationNames: [],
        publicSummary: "",
        runId: "cartographer_run_live",
        semanticEdgeIds: [],
        semanticNodeIds: ["node_constraint"],
        sourceRefs: sourceRefs(),
        status: "running",
        targetEntityId: "node_constraint",
        triggerKind: "workflow_window",
        updatedAt: "2026-06-10T12:00:08Z",
        windowId: "",
      },
      {
        activityKind: "editing",
        diagnostics: [],
        evidenceAnchorIds: [],
        id: "semantic-working-set-pulse:patch_proposed:patch:cartographer_patch_preview",
        kind: "patch_proposed",
        occurredAt: "2026-06-10T12:00:09Z",
        patchId: "cartographer_patch_preview",
        patchOperationNames: ["record_finding"],
        publicSummary: "Preview a finding.",
        runId: "cartographer_run_live",
        semanticEdgeIds: [],
        semanticNodeIds: ["node_preview"],
        sourceRefs: sourceRefs(),
        status: "pending_review",
        targetEntityId: "node_preview",
        triggerKind: "workflow_window",
        updatedAt: "2026-06-10T12:00:09Z",
        windowId: "",
      },
      {
        activityKind: "validating",
        diagnostics: [],
        evidenceAnchorIds: [],
        id: "semantic-working-set-pulse:node_updated_recent:node:node_constraint:event_node",
        kind: "node_updated_recent",
        occurredAt: "2026-06-10T12:00:02Z",
        patchId: "",
        patchOperationNames: [],
        publicSummary: "Recent node update.",
        runId: "",
        semanticEdgeIds: [],
        semanticNodeIds: ["node_constraint"],
        sourceRefs: emptySourceRefs(),
        status: "applied",
        targetEntityId: "node_constraint",
        triggerKind: "manual",
        updatedAt: "2026-06-10T12:00:02Z",
        windowId: "",
      },
      {
        activityKind: "validating",
        diagnostics: [],
        evidenceAnchorIds: ["evidence_constraint"],
        id: "semantic-working-set-pulse:evidence_attached:evidence:evidence_constraint",
        kind: "evidence_attached",
        occurredAt: "2026-06-10T12:00:04Z",
        patchId: "",
        patchOperationNames: [],
        publicSummary: "Evidence attached.",
        runId: "",
        semanticEdgeIds: [],
        semanticNodeIds: ["node_constraint"],
        sourceRefs: sourceRefs(),
        status: "applied",
        targetEntityId: "node_constraint",
        triggerKind: "manual",
        updatedAt: "2026-06-10T12:00:04Z",
        windowId: "",
      },
      {
        activityKind: "validating",
        diagnostics: [],
        evidenceAnchorIds: [],
        id: "semantic-working-set-pulse:edge_created:edge:edge_supports",
        kind: "edge_created",
        occurredAt: "2026-06-10T12:00:03Z",
        patchId: "",
        patchOperationNames: [],
        publicSummary: "Edge created.",
        runId: "",
        semanticEdgeIds: ["edge_supports"],
        semanticNodeIds: ["node_constraint", "node_finding"],
        sourceRefs: emptySourceRefs(),
        status: "applied",
        targetEntityId: "node_constraint",
        triggerKind: "manual",
        updatedAt: "2026-06-10T12:00:03Z",
        windowId: "",
      },
    ],
    recentCartographerRuns: [],
    recentSemanticChanges: [],
    workflowExecutionId: "",
    workspaceId: "workspace_test",
  };
}

function sourceRefs() {
  return {
    chatConversationId: "",
    chatMessageId: "",
    chatRunId: "",
    runItemId: "run_item_live",
    workflowDefinitionId: "definition_test",
    workflowExecutionId: "execution_test",
    workflowNodeExecutionId: "",
    workflowNodeId: "workflow_node",
  };
}

function emptySourceRefs() {
  return {
    chatConversationId: "",
    chatMessageId: "",
    chatRunId: "",
    runItemId: "",
    workflowDefinitionId: "",
    workflowExecutionId: "",
    workflowNodeExecutionId: "",
    workflowNodeId: "",
  };
}

function inputItemCounts() {
  return {
    activity: 0,
    contextPacks: 0,
    evidence: 0,
    existingEdges: 0,
    existingNodes: 0,
    fileChanges: 0,
    newEvents: 0,
    observations: 0,
    observedEventRefs: 0,
    outputSummaries: 0,
    retrievalResults: 0,
    steering: 0,
    testResults: 0,
    toolCalls: 0,
    trajectorySummaries: 0,
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
    sourceId: "workflow_node",
    sourceKind: "workflow_node",
    startedAt: "2026-06-10T12:00:05Z",
    startedByEventId: "event_activity_start",
    summary,
    targetEntityId: "node_constraint",
    updatedAt: "2026-06-10T12:00:05Z",
    workflowDefinitionId: "",
    workflowExecutionId: "execution_test",
    workflowNodeId: "workflow_node",
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
