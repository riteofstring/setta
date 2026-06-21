import type {
  WorkflowExecutionSummary,
  WorkflowGraphProjection,
  WorkflowValidationResult,
} from "@generated/backend";

import {
  workflowGraphRunTarget,
  type WorkflowGraphTarget,
} from "./workflow-graph-projection-state";

type RefreshWorkflowRunSummaries = (
  workspaceId: string,
  definitionId: string,
) => Promise<WorkflowExecutionSummary[]>;

type LoadWorkflowGraphTarget = (
  target: WorkflowGraphTarget,
  updateSource?: "draft-validation-local",
) => Promise<void>;

type WorkflowDraftRunPreflight =
  | { status: "error"; message: string }
  | { status: "ready"; projection: WorkflowGraphProjection }
  | { status: "skip" };

export function workflowDraftRunPreflight({
  projection,
  syntheticGraphEnabled,
  workspaceId,
}: {
  projection: WorkflowGraphProjection | null;
  syntheticGraphEnabled: boolean;
  workspaceId: string;
}): WorkflowDraftRunPreflight {
  if (syntheticGraphEnabled) {
    return { status: "skip" };
  }
  if (workspaceId === "") {
    return { message: "Open a workspace before running a workflow", status: "error" };
  }
  if (projection === null) {
    return { message: "Add a workflow node before running", status: "error" };
  }
  if (!projection.editable) {
    return {
      message: "Switch to the draft workflow before starting another run",
      status: "error",
    };
  }
  return { projection, status: "ready" };
}

export async function startWorkflowDraftRun({
  loadWorkflowGraphTarget,
  projection,
  refreshWorkflowRunSummaries,
  setWorkflowValidation,
}: {
  loadWorkflowGraphTarget: LoadWorkflowGraphTarget;
  projection: WorkflowGraphProjection;
  refreshWorkflowRunSummaries: RefreshWorkflowRunSummaries;
  setWorkflowValidation: (validation: WorkflowValidationResult | null) => void;
}) {
  const definition = await window.setta.workflow.readDefinition(
    projection.workspaceId,
    projection.definitionId,
  );
  const validation = await window.setta.workflow.validateDefinition(
    projection.workspaceId,
    definition.graph,
  );
  if (!validation.valid) {
    // Invalid draft: restore the diagnostics the caller cleared on run-accept and stay on the
    // draft. No run starts, so the validation panel belongs to the draft the user keeps editing.
    setWorkflowValidation(validation);
    return;
  }
  // Valid draft: the caller already cleared the validation overlay synchronously when the run was
  // accepted (batched with the Starting state), so it never lingers into the Starting or loading
  // frames. Nothing to clear here.
  const execution = await window.setta.workflow.startExecution(
    projection.workspaceId,
    projection.definitionId,
  );
  await refreshWorkflowRunSummaries(projection.workspaceId, projection.definitionId);
  await loadWorkflowGraphTarget(
    workflowGraphRunTarget({
      definitionId: projection.definitionId,
      executionId: execution.id,
      versionId: execution.definitionVersionId,
      workspaceId: projection.workspaceId,
    }),
    "draft-validation-local",
  );
}

export async function refreshWorkflowRunsAfterStartFailure(
  projection: WorkflowGraphProjection,
  refreshWorkflowRunSummaries: RefreshWorkflowRunSummaries,
) {
  try {
    await refreshWorkflowRunSummaries(projection.workspaceId, projection.definitionId);
  } catch (refreshError: unknown) {
    console.error("Failed to refresh workflow runs after run failure", refreshError);
  }
}
