import type { WorkflowGraphProjection } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { workflowProjectionWithLayoutPositions } from "./workflow-graph-surface-helpers";
import {
  pendingWorkflowLayoutPositionsAfterPersist,
  pendingWorkflowLayoutPositionsWithInputs,
  workflowLayoutPositionsForProjection,
} from "./workflow-graph-layout-overlay";

describe("workflow graph layout overlay", () => {
  test("merges pending local node positions over a stale projection refresh", () => {
    const projection = draftProjection({
      layout: { nodes: [{ nodeId: "work", x: 0, y: 0 }] },
    });
    const pending = workflowLayoutPositionsForProjection({
      positions: [{ moved: true, nodeId: "work", x: 220.4, y: -80.6 }],
      projection,
      saveSequence: 1,
    });
    const staleRefresh = draftProjection({
      draftRevision: "sha256:stale-refresh",
      draftUpdatedAt: "2026-06-05T12:00:01Z",
      layout: { nodes: [{ nodeId: "work", x: 0, y: 0 }] },
    });

    const overlaid = workflowProjectionWithLayoutPositions(staleRefresh, pending);

    expect(overlaid?.draftRevision).toBe("sha256:stale-refresh");
    expect(overlaid?.layout.nodes).toEqual([{ nodeId: "work", x: 220, y: -81 }]);
  });

  test("clears only the persisted save generation", () => {
    const current = pendingWorkflowLayoutPositionsWithInputs({
      current: [
        { moved: true, nodeId: "work", saveSequence: 2, x: 300, y: 40 },
        { moved: true, nodeId: "end", saveSequence: 1, x: 500, y: 60 },
      ],
      inputs: [{ moved: true, nodeId: "route", saveSequence: 1, x: 120, y: 20 }],
    });

    const remaining = pendingWorkflowLayoutPositionsAfterPersist({
      current,
      inputs: [
        { moved: true, nodeId: "work", saveSequence: 1, x: 220, y: -80 },
        { moved: true, nodeId: "end", saveSequence: 1, x: 500, y: 60 },
        { moved: true, nodeId: "route", saveSequence: 1, x: 120, y: 20 },
      ],
      saveSequence: 1,
    });

    expect(remaining).toEqual([{ moved: true, nodeId: "work", saveSequence: 2, x: 300, y: 40 }]);
  });
});

function draftProjection(
  overrides: Partial<WorkflowGraphProjection> = {},
): WorkflowGraphProjection {
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
    layout: { nodes: [] },
    nodes: [projectedNode("work", "action"), projectedNode("end", "end")],
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
    ...overrides,
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
