import type { WorkflowGraphProjection } from "@generated/backend";
import { afterEach, describe, expect, test, vi } from "vitest";

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

    const refreshed = await persistGraphNodePositions({
      positions: [{ moved: true, nodeId: "work", x: 42, y: 64 }],
      semanticGraph: null,
      setWorkflowEditorError,
      updateSemanticLayoutPositions: vi.fn(),
      workflowProjection: draftProjection(),
    });

    expect(refreshed).toBeNull();
    expect(setWorkflowEditorError).toHaveBeenCalledWith("workflow draft revision mismatch");
    expect(updateDefinitionLayout).toHaveBeenCalledWith({
      definitionId: "definition_review",
      expectedRevision: "sha256:draft",
      positions: [{ nodeId: "work", x: 42, y: 64 }],
      workspaceId: "workspace_test",
    });
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
