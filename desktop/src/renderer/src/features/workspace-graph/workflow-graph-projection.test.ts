import { describe, expect, test } from "vitest";

import type { WorkflowGraphProjection } from "@generated/backend";
import { rendererGraphFromWorkflowProjection } from "./workflow-graph-projection";

describe("rendererGraphFromWorkflowProjection", () => {
  test("maps backend workflow projection into deterministic renderer graph data", () => {
    const graph = rendererGraphFromWorkflowProjection(testProjection());

    expect(graph.workflow).toEqual({
      definitionId: "definition_review",
      definitionName: "Review workflow",
      definitionVersionId: "version_review",
      definitionVersionNumber: 2,
      draftRevision: "sha256:draft",
      editable: false,
      executionId: "execution_review",
      executionStatus: "running",
      versionMismatch: false,
      viewMode: "run",
      workspaceId: "workspace_test",
    });
    expect(
      graph.nodes.map((node) => [
        node.id,
        node.layer,
        node.status,
        node.executionCount,
        node.connectable,
        node.movementOwner,
      ]),
    ).toEqual([
      ["start", "workflow", "succeeded", 1, false, { kind: "workflow_view_layout" }],
      ["work", "workflow", "running", 2, false, { kind: "workflow_view_layout" }],
      ["end", "workflow", "not_started", 0, false, { kind: "workflow_view_layout" }],
    ]);
    expect(
      graph.edges.map((edge) => [
        edge.id,
        edge.layer,
        edge.sourceNodeId,
        edge.sourcePortId,
        edge.targetNodeId,
        edge.status,
        edge.label,
      ]),
    ).toEqual([
      ["start_work", "workflow", "start", "output", "work", "completed", ""],
      ["work_end", "workflow", "work", "output", "end", "active", ""],
    ]);
    expect(graph.nodes.find((node) => node.id === "start")?.x).toBeLessThan(
      graph.nodes.find((node) => node.id === "work")?.x ?? 0,
    );
    expect(graph.nodes.find((node) => node.id === "work")?.x).toBeLessThan(
      graph.nodes.find((node) => node.id === "end")?.x ?? 0,
    );
  });

  test("uses persisted workflow layout when projection includes editor positions", () => {
    const graph = rendererGraphFromWorkflowProjection({
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

  test("marks editable draft nodes as definition-layout movable and connectable", () => {
    const graph = rendererGraphFromWorkflowProjection(draftProjection());

    expect(graph.nodes.map((node) => [node.id, node.connectable, node.movementOwner])).toEqual([
      ["start", true, { kind: "workflow_definition_layout" }],
      ["work", true, { kind: "workflow_definition_layout" }],
      ["end", true, { kind: "workflow_definition_layout" }],
    ]);
  });

  test("maps route conditions to labeled virtual ports", () => {
    const graph = rendererGraphFromWorkflowProjection({
      ...testProjection(),
      edges: [
        {
          activeTokenCount: 0,
          cancelledTokenCount: 0,
          completedTokenCount: 0,
          condition: {
            exitCode: null,
            invert: false,
            kind: "action_signal",
            nodeId: "work",
            signalName: "route",
            signalValue: "yes",
            status: null,
          },
          fromNodeId: "route",
          id: "route_yes",
          kind: "normal",
          label: "route=yes",
          status: "inactive",
          toNodeId: "end",
        },
        {
          activeTokenCount: 0,
          cancelledTokenCount: 0,
          completedTokenCount: 0,
          condition: {
            exitCode: null,
            invert: false,
            kind: "default",
            nodeId: "",
            signalName: "",
            signalValue: "",
            status: null,
          },
          fromNodeId: "route",
          id: "route_default",
          kind: "normal",
          label: "default",
          status: "inactive",
          toNodeId: "end",
        },
      ],
      nodes: [
        projectedNode("work", "action", "succeeded", 1),
        projectedNode("route", "gateway.xor", "succeeded", 1),
        projectedNode("end", "end", "not_started", 0),
      ],
    });

    expect(
      graph.nodes.find((node) => node.id === "route")?.ports?.map((port) => [port.id, port.label]),
    ).toEqual([
      ["input", ""],
      ["route_yes", "yes"],
      ["route_no", "no"],
      ["route_default", "default"],
    ]);
    expect(graph.edges.map((edge) => [edge.id, edge.sourcePortId, edge.label])).toEqual([
      ["route_yes", "route_yes", "route=yes"],
      ["route_default", "route_default", "default"],
    ]);
  });

  test("maps draft validation diagnostics onto nodes and edges", () => {
    const graph = rendererGraphFromWorkflowProjection(draftProjection(), {
      diagnostics: [
        diagnostic("warning", "layout_node_unknown", "start", ""),
        diagnostic("error", "start_node_output_required", "start", ""),
        diagnostic("error", "edge_to_unknown", "", "work_end"),
      ],
      valid: false,
    });

    expect(graph.nodes.find((node) => node.id === "start")?.diagnostic).toEqual({
      codes: ["layout_node_unknown", "start_node_output_required"],
      count: 2,
      severity: "error",
    });
    expect(graph.nodes.find((node) => node.id === "end")?.diagnostic).toBeNull();
    expect(graph.edges.find((edge) => edge.id === "work_end")?.diagnostic).toEqual({
      codes: ["edge_to_unknown"],
      count: 1,
      severity: "error",
    });
    expect(graph.edges.find((edge) => edge.id === "start_work")?.diagnostic).toBeNull();
  });

  test("does not overlay draft validation diagnostics on run projections", () => {
    const graph = rendererGraphFromWorkflowProjection(testProjection(), {
      diagnostics: [diagnostic("error", "start_node_output_required", "start", "work_end")],
      valid: false,
    });

    expect(graph.nodes.find((node) => node.id === "start")?.diagnostic).toBeNull();
    expect(graph.edges.find((edge) => edge.id === "work_end")?.diagnostic).toBeNull();
  });

  test("uses current projection validation state for draft diagnostics", () => {
    const graph = rendererGraphFromWorkflowProjection({
      ...draftProjection(),
      validation: validationState({
        diagnostics: [diagnostic("error", "start_node_output_required", "start", "")],
        valid: false,
      }),
    });

    expect(graph.nodes.find((node) => node.id === "start")?.diagnostic).toEqual({
      codes: ["start_node_output_required"],
      count: 1,
      severity: "error",
    });
  });
});

function draftProjection(): WorkflowGraphProjection {
  return {
    ...testProjection(),
    definitionVersionCreatedAt: "",
    definitionVersionId: "",
    definitionVersionNumber: 0,
    draftMatchesVersion: true,
    editable: true,
    executionId: "",
    executionStatus: null,
    versionMismatch: false,
    viewMode: "draft",
  };
}

function diagnostic(severity: "error" | "warning", code: string, nodeId: string, edgeId: string) {
  return {
    code,
    edgeId,
    message: code,
    nodeId,
    severity,
  };
}

function testProjection(): WorkflowGraphProjection {
  return {
    definitionDescription: "",
    definitionId: "definition_review",
    definitionName: "Review workflow",
    definitionVersionCreatedAt: "2026-06-05T12:00:00Z",
    definitionVersionId: "version_review",
    definitionVersionNumber: 2,
    draftMatchesVersion: true,
    draftRevision: "sha256:draft",
    draftUpdatedAt: "2026-06-05T12:00:00Z",
    editable: false,
    edges: [
      {
        activeTokenCount: 0,
        cancelledTokenCount: 0,
        completedTokenCount: 1,
        condition: null,
        fromNodeId: "start",
        id: "start_work",
        kind: "normal",
        label: "",
        status: "completed",
        toNodeId: "work",
      },
      {
        activeTokenCount: 1,
        cancelledTokenCount: 0,
        completedTokenCount: 0,
        condition: null,
        fromNodeId: "work",
        id: "work_end",
        kind: "normal",
        label: "",
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
    validation: validationState(null),
    versionMismatch: false,
    viewMode: "run",
    workspaceId: "workspace_test",
  };
}

function validationState(
  result: NonNullable<WorkflowGraphProjection["validation"]["snapshot"]>["result"] | null,
) {
  return {
    currentDraftRevision: "sha256:draft",
    currentGraphFingerprint: "sha256:graph",
    currentValidatorFingerprint: "workflow-validator:v1",
    snapshot:
      result === null
        ? null
        : {
            definitionId: "definition_review",
            graphFingerprint: "sha256:graph",
            result,
            schemaVersion: 1,
            validatedAt: "2026-06-05T12:00:00Z",
            validatorFingerprint: "workflow-validator:v1",
            workspaceId: "workspace_test",
          },
    status: result === null ? "not_validated" : "current",
  } satisfies WorkflowGraphProjection["validation"];
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
