import { describe, expect, test } from "vitest";

import type { WorkflowEvent, WorkflowGraphProjection } from "@generated/backend";
import {
  type WorkflowProjectionState,
  initialWorkflowProjectionState,
  workflowAutoDraftLoadShouldPreserveRunTarget,
  workflowEventMatchesProjectionTarget,
  workflowEventRefreshesProjectionTarget,
  workflowGraphDraftTarget,
  workflowGraphRunTarget,
  workflowProjectionReducer,
  workflowProjectionStateView,
} from "./workflow-graph-projection-state";

describe("workflow projection event targeting", () => {
  test("matches draft definition events without refreshing the graph projection", () => {
    const current = draftTarget({ definitionId: "definition" });
    const incoming = event({
      definitionId: "definition",
      executionId: "execution",
      versionId: "version",
    });

    expect(workflowEventMatchesProjectionTarget(current, incoming)).toBe(true);
    expect(workflowEventRefreshesProjectionTarget(current, incoming)).toBe(false);
  });

  test("accepts only the active execution once the run projection is selected", () => {
    const current = runTarget({
      definitionId: "definition",
      executionId: "execution_active",
      versionId: "version",
    });

    expect(
      workflowEventMatchesProjectionTarget(
        current,
        event({
          definitionId: "definition",
          executionId: "execution_active",
          versionId: "version",
        }),
      ),
    ).toBe(true);
    expect(
      workflowEventRefreshesProjectionTarget(
        current,
        event({
          definitionId: "definition",
          executionId: "execution_active",
          versionId: "version",
        }),
      ),
    ).toBe(true);
    expect(
      workflowEventMatchesProjectionTarget(
        current,
        event({
          definitionId: "definition",
          executionId: "execution_other",
          versionId: "version",
        }),
      ),
    ).toBe(false);
  });

  test("does not switch a version projection to a different definition version", () => {
    expect(
      workflowEventMatchesProjectionTarget(
        versionTarget({ definitionId: "definition", versionId: "version_a" }),
        event({ definitionId: "definition", executionId: "execution", versionId: "version_b" }),
      ),
    ).toBe(false);
  });

  test("rejects events for unrelated workspaces or definitions", () => {
    expect(
      workflowEventMatchesProjectionTarget(
        draftTarget({ definitionId: "definition", workspaceId: "workspace_a" }),
        event({
          definitionId: "definition",
          executionId: "execution",
          versionId: "version",
          workspaceId: "workspace_b",
        }),
      ),
    ).toBe(false);
    expect(
      workflowEventMatchesProjectionTarget(
        draftTarget({ definitionId: "definition_a" }),
        event({ definitionId: "definition_b", executionId: "execution", versionId: "version" }),
      ),
    ).toBe(false);
  });

  test("keeps an explicitly selected run when the selected definition auto-loader catches up", () => {
    const selectedRun = runTarget({
      definitionId: "definition",
      executionId: "execution",
      versionId: "version",
    });

    expect(
      workflowAutoDraftLoadShouldPreserveRunTarget(selectedRun, "workspace", "definition"),
    ).toBe(true);
    expect(
      workflowAutoDraftLoadShouldPreserveRunTarget(selectedRun, "workspace", "other_definition"),
    ).toBe(false);
    expect(
      workflowAutoDraftLoadShouldPreserveRunTarget(
        runTarget({
          definitionId: "definition",
          executionId: "execution",
          versionId: "version",
          workspaceId: "workspace_other",
        }),
        "workspace",
        "definition",
      ),
    ).toBe(false);
    expect(
      workflowAutoDraftLoadShouldPreserveRunTarget(
        draftTarget({ definitionId: "definition" }),
        "workspace",
        "definition",
      ),
    ).toBe(false);
  });
});

describe("workflow projection non-destructive loading", () => {
  const draftT = workflowGraphDraftTarget("workspace", "definition");
  const runT = workflowGraphRunTarget({
    definitionId: "definition",
    executionId: "execution",
    versionId: "version",
    workspaceId: "workspace",
  });

  function settledDraft(projection: WorkflowGraphProjection): WorkflowProjectionState {
    return workflowProjectionReducer(
      workflowProjectionReducer(initialWorkflowProjectionState, {
        target: draftT,
        type: "loading",
      }),
      {
        expectedTarget: draftT,
        projection,
        target: draftT,
        type: "ready",
        updateSource: "workflow-projection",
      },
    );
  }

  test("keeps the displayed projection while a newly selected target loads", () => {
    const draftProjection = projectionFixture({ viewMode: "draft" });
    const loadingRun = workflowProjectionReducer(settledDraft(draftProjection), {
      target: runT,
      type: "loading",
    });

    const view = workflowProjectionStateView(loadingRun);
    expect(view.projection).toBe(draftProjection);
    // `loading` stays true so the toolbar disables the previous target's actions and shows a
    // subtle loading state (see workflow-graph-toolbar).
    expect(view.loading).toBe(true);
    // Content-based readiness stays true so the renderer keeps the previous graph on the canvas
    // (no blank frame, no redundant scene replacement) and the toolbar keeps a stable title;
    // disabling the actions is driven by `loading`, not by flipping `ready`.
    expect(view.ready).toBe(true);
    // Activity and run-summary scoping must track the displayed graph, not the pending target.
    expect(view.graphTarget).toEqual(draftT);
  });

  test("swaps the displayed projection only once the new target resolves", () => {
    const draftProjection = projectionFixture({ viewMode: "draft" });
    const runProjection = projectionFixture({
      editable: false,
      executionId: "execution",
      executionStatus: "running",
      viewMode: "run",
    });
    const loadingRun = workflowProjectionReducer(settledDraft(draftProjection), {
      target: runT,
      type: "loading",
    });

    const settledRun = workflowProjectionReducer(loadingRun, {
      expectedTarget: runT,
      projection: runProjection,
      target: runT,
      type: "ready",
      updateSource: "workflow-projection",
    });

    const view = workflowProjectionStateView(settledRun);
    expect(view.projection).toBe(runProjection);
    expect(view.graphTarget).toEqual(runT);
    expect(view.loading).toBe(false);
  });

  test("ignores a resolved projection for a superseded target", () => {
    const loadingRun = workflowProjectionReducer(
      settledDraft(projectionFixture({ viewMode: "draft" })),
      { target: runT, type: "loading" },
    );

    const staleDraftReady = workflowProjectionReducer(loadingRun, {
      expectedTarget: draftT,
      projection: projectionFixture({ definitionName: "stale draft" }),
      target: draftT,
      type: "ready",
      updateSource: "workflow-projection",
    });

    expect(staleDraftReady).toBe(loadingRun);
  });

  test("keeps the displayed projection visible behind a failed load", () => {
    const draftProjection = projectionFixture({ viewMode: "draft" });
    const loadingRun = workflowProjectionReducer(settledDraft(draftProjection), {
      target: runT,
      type: "loading",
    });

    const failed = workflowProjectionReducer(loadingRun, {
      error: "projection load failed",
      expectedTarget: runT,
      target: runT,
      type: "failed",
    });

    const view = workflowProjectionStateView(failed);
    expect(view.projection).toBe(draftProjection);
    expect(view.error).toBe("projection load failed");
    expect(view.ready).toBe(true);
  });

  test("reports a cold load with nothing displayed as not ready", () => {
    const cold = workflowProjectionReducer(initialWorkflowProjectionState, {
      target: draftT,
      type: "loading",
    });

    const view = workflowProjectionStateView(cold);
    expect(view.projection).toBeNull();
    expect(view.loading).toBe(true);
    expect(view.ready).toBe(false);
    expect(view.graphTarget).toBeNull();
  });
});

function projectionFixture(
  overrides: Partial<WorkflowGraphProjection> = {},
): WorkflowGraphProjection {
  return {
    definitionDescription: "",
    definitionId: "definition",
    definitionName: "Workflow",
    definitionVersionCreatedAt: "",
    definitionVersionId: "",
    definitionVersionNumber: 0,
    draftMatchesVersion: true,
    draftUpdatedAt: "2026-06-24T12:00:00Z",
    editable: true,
    edges: [],
    executionId: "",
    executionStatus: null,
    lastEventOrdinal: 0,
    layout: { nodes: [] },
    nodes: [],
    schemaVersion: 1,
    terminalReason: null,
    updatedAt: "2026-06-24T12:00:00Z",
    versionMismatch: false,
    viewMode: "draft",
    workspaceId: "workspace",
    ...overrides,
  };
}

function draftTarget({
  definitionId,
  workspaceId = "workspace",
}: {
  definitionId: string;
  workspaceId?: string;
}) {
  return {
    definitionId,
    kind: "draft" as const,
    workspaceId,
  };
}

function runTarget({
  definitionId,
  executionId,
  versionId,
  workspaceId = "workspace",
}: {
  definitionId: string;
  executionId: string;
  versionId: string;
  workspaceId?: string;
}) {
  return {
    definitionId,
    executionId,
    kind: "run" as const,
    versionId,
    workspaceId,
  };
}

function versionTarget({
  definitionId,
  versionId,
  workspaceId = "workspace",
}: {
  definitionId: string;
  versionId: string;
  workspaceId?: string;
}) {
  return {
    definitionId,
    kind: "version" as const,
    versionId,
    workspaceId,
  };
}

function event({
  definitionId,
  executionId,
  versionId,
  workspaceId = "workspace",
}: {
  definitionId: string;
  executionId: string;
  versionId: string;
  workspaceId?: string;
}): WorkflowEvent {
  return {
    createdAt: "2026-06-22T12:00:00Z",
    definitionId,
    definitionName: "",
    definitionVersionId: versionId,
    details: null,
    executionId,
    id: "event_" + executionId,
    message: "started",
    nodeExecutionId: "",
    nodeId: "",
    ordinal: 1,
    runnerKind: null,
    schemaVersion: 1,
    tokenId: "",
    type: "workflow.execution.started",
    workspaceId,
  };
}
