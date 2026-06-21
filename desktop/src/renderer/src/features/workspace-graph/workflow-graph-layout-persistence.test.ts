import type { SemanticGraph, WorkflowGraphProjection } from "@generated/backend";
import { afterEach, describe, expect, test, vi } from "vitest";

import { semanticRendererNodeId } from "./semantic-graph-projection";
import { persistGraphNodePositions } from "./workflow-graph-layout-persistence";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("workflow graph layout persistence", () => {
  test("surfaces backend workflow layout failures with the specific error message", async () => {
    const updateDefinitionLayout = vi.fn(async () => {
      throw new Error("workflow draft revision mismatch");
    });
    vi.stubGlobal("window", {
      setta: {
        workflow: {
          updateDefinitionLayout,
        },
      } as unknown as Window["setta"],
    });
    const setWorkflowEditorError = vi.fn();

    const outcome = await persistGraphNodePositions({
      positions: [{ moved: true, nodeId: "work", x: 42, y: 64 }],
      semanticGraph: null,
      workflowProjection: draftProjection(),
    });

    expect(outcome).toEqual({
      semantic: { owner: "semantic_layout", status: "skipped" },
      status: "failed",
      workflow: {
        error: "workflow draft revision mismatch",
        owner: "workflow_definition_layout",
        status: "failed",
      },
    });
    expect(setWorkflowEditorError).not.toHaveBeenCalled();
    expect(updateDefinitionLayout).toHaveBeenCalledWith({
      definitionId: "definition_review",
      expectedRevision: "sha256:draft",
      positions: [{ nodeId: "work", x: 42, y: 64 }],
      workspaceId: "workspace_test",
    });
  });

  test("persists read-only workflow moves through graph view layout", async () => {
    const updateDefinitionLayout = vi.fn();
    const updateGraphViewLayout = vi.fn(async () => ({
      positions: [{ nodeId: "work", x: 42, y: 64 }],
    }));
    vi.stubGlobal("window", {
      setta: {
        workflow: {
          updateDefinitionLayout,
          updateGraphViewLayout,
        },
      } as unknown as Window["setta"],
    });

    const outcome = await persistGraphNodePositions({
      positions: [
        { moved: false, nodeId: "start", x: 0, y: 0 },
        { moved: true, nodeId: "work", x: 42.4, y: 64.5 },
      ],
      semanticGraph: null,
      workflowProjection: {
        ...draftProjection(),
        definitionVersionCreatedAt: "2026-06-05T12:00:00Z",
        definitionVersionId: "version_review",
        definitionVersionNumber: 2,
        editable: false,
        executionId: "execution_review",
        executionStatus: "running",
        viewMode: "run",
      },
      workflowViewLayoutTarget: {
        definitionVersion: null,
        kind: "workflow_execution",
        workflowExecution: {
          definitionId: "definition_review",
          executionId: "execution_review",
          versionId: "version_review",
        },
      },
    });

    expect(outcome).toEqual({
      semantic: { owner: "semantic_layout", status: "skipped" },
      status: "persisted",
      workflow: {
        owner: "workflow_view_layout",
        positions: [{ nodeId: "work", x: 42, y: 64 }],
        status: "persisted",
      },
    });
    expect(updateDefinitionLayout).not.toHaveBeenCalled();
    expect(updateGraphViewLayout).toHaveBeenCalledWith({
      positions: [{ nodeId: "work", x: 42, y: 65 }],
      target: {
        definitionVersion: null,
        kind: "workflow_execution",
        workflowExecution: {
          definitionId: "definition_review",
          executionId: "execution_review",
          versionId: "version_review",
        },
      },
      workspaceId: "workspace_test",
    });
  });

  test("reports skipped persistence when no durable moved positions are present", async () => {
    const updateDefinitionLayout = vi.fn();
    vi.stubGlobal("window", {
      setta: {
        workflow: {
          updateDefinitionLayout,
        },
      } as unknown as Window["setta"],
    });

    const outcome = await persistGraphNodePositions({
      positions: [{ moved: false, nodeId: "work", x: 42, y: 64 }],
      semanticGraph: null,
      workflowProjection: draftProjection(),
    });

    expect(outcome).toEqual({
      semantic: { owner: "semantic_layout", status: "skipped" },
      status: "skipped",
      workflow: { owner: "workflow_definition_layout", status: "skipped" },
    });
    expect(updateDefinitionLayout).not.toHaveBeenCalled();
  });

  test("returns saved semantic layout positions as a persisted owner outcome", async () => {
    const updateLayoutPositions = vi.fn(async () => ({
      positions: [
        {
          entityId: "semantic_constraint",
          pinned: true,
          updatedAt: "2026-06-10T12:00:04Z",
          workspaceId: "workspace_test",
          x: 72,
          y: -18,
        },
      ],
    }));
    vi.stubGlobal("window", {
      setta: {
        semanticGraph: {
          updateLayoutPositions,
        },
      } as unknown as Window["setta"],
    });

    const outcome = await persistGraphNodePositions({
      positions: [
        {
          moved: true,
          nodeId: semanticRendererNodeId("semantic_constraint"),
          x: 72.2,
          y: -18.7,
        },
      ],
      semanticGraph: semanticGraph(),
      workflowProjection: null,
    });

    expect(outcome).toEqual({
      semantic: {
        owner: "semantic_layout",
        positions: [
          {
            entityId: "semantic_constraint",
            pinned: true,
            updatedAt: "2026-06-10T12:00:04Z",
            workspaceId: "workspace_test",
            x: 72,
            y: -18,
          },
        ],
        status: "persisted",
      },
      status: "persisted",
      workflow: { owner: "workflow_definition_layout", status: "skipped" },
    });
    expect(updateLayoutPositions).toHaveBeenCalledWith({
      positions: [{ entityId: "semantic_constraint", pinned: true, x: 72.2, y: -18.7 }],
      workspaceId: "workspace_test",
    });
  });

  test("reports semantic layout failures without attempting workflow persistence", async () => {
    const updateLayoutPositions = vi.fn(async () => {
      throw new Error("semantic layout store unavailable");
    });
    const updateDefinitionLayout = vi.fn();
    vi.stubGlobal("window", {
      setta: {
        semanticGraph: {
          updateLayoutPositions,
        },
        workflow: {
          updateDefinitionLayout,
        },
      } as unknown as Window["setta"],
    });

    const outcome = await persistGraphNodePositions({
      positions: [
        {
          moved: true,
          nodeId: semanticRendererNodeId("semantic_constraint"),
          x: 72,
          y: -18,
        },
        { moved: true, nodeId: "work", x: 42, y: 64 },
      ],
      semanticGraph: semanticGraph(),
      workflowProjection: draftProjection(),
    });

    expect(outcome).toEqual({
      semantic: {
        error: "semantic layout store unavailable",
        owner: "semantic_layout",
        status: "failed",
      },
      status: "failed",
      workflow: { owner: "workflow_definition_layout", status: "skipped" },
    });
    expect(updateDefinitionLayout).not.toHaveBeenCalled();
  });
});

function draftProjection(): WorkflowGraphProjection {
  return {
    definitionDescription: "",
    definitionId: "definition_review",
    definitionName: "Review workflow",
    definitionVersionCreatedAt: "",
    definitionVersionId: "",
    definitionVersionNumber: 0,
    draftMatchesVersion: true,
    draftRevision: "sha256:draft",
    draftUpdatedAt: "2026-06-05T12:00:00Z",
    editable: true,
    edges: [],
    executionId: "",
    executionStatus: null,
    lastEventOrdinal: 0,
    layout: { nodes: [{ nodeId: "work", x: 0, y: 0 }] },
    nodes: [projectedNode("work", "action")],
    schemaVersion: 1,
    terminalReason: null,
    updatedAt: "2026-06-05T12:00:00Z",
    validation: {
      currentDraftRevision: "sha256:draft",
      currentGraphFingerprint: "sha256:graph",
      currentValidatorFingerprint: "workflow-validator:v1",
      snapshot: null,
      status: "not_validated",
    },
    versionMismatch: false,
    viewMode: "draft",
    workspaceId: "workspace_test",
  };
}

function projectedNode(
  id: string,
  kind: WorkflowGraphProjection["nodes"][number]["kind"],
): WorkflowGraphProjection["nodes"][number] {
  return {
    actionKind: null,
    active: false,
    error: "",
    executionCount: 0,
    filePaths: [],
    id,
    kind,
    label: id,
    latestAttempt: 0,
    latestIteration: 0,
    latestNodeExecutionId: "",
    pendingApproval: null,
    recoveryMessage: "",
    recoveryOutcome: null,
    signals: [],
    status: "not_started",
    title: "",
  };
}

function semanticGraph(): SemanticGraph {
  return {
    edges: [],
    layoutPositions: [],
    nodes: [semanticNode("semantic_constraint")],
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
