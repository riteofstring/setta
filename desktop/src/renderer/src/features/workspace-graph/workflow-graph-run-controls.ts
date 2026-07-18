import type { WorkflowGraphProjection } from "@generated/backend";

import type { WorkflowToolbarOperation } from "./workflow-graph-toolbar";

export interface CancelWorkflowRunRequest {
  projection: WorkflowGraphProjection | null;
  replaceWorkflowProjection: (projection: WorkflowGraphProjection) => void;
  setWorkflowEditorError: (message: string) => void;
  setWorkflowOperation: (operation: WorkflowToolbarOperation | null) => void;
  syntheticGraphEnabled: boolean;
}

export async function cancelWorkflowRunFromSurface({
  projection,
  replaceWorkflowProjection,
  setWorkflowEditorError,
  setWorkflowOperation,
  syntheticGraphEnabled,
}: CancelWorkflowRunRequest): Promise<void> {
  if (syntheticGraphEnabled) {
    return;
  }
  if (!workflowProjectionIsRunningRun(projection)) {
    setWorkflowEditorError("Select a running workflow run before stopping");
    return;
  }
  setWorkflowOperation("cancel");
  setWorkflowEditorError("");
  try {
    await window.setta.workflow.cancelExecution(projection.workspaceId, projection.executionId);
    replaceWorkflowProjection(await workflowProjectionForRun(projection));
  } catch (error: unknown) {
    try {
      replaceWorkflowProjection(await workflowProjectionForRun(projection));
    } catch {
      // Keep the original cancellation failure visible when the state refresh also fails.
    }
    setWorkflowEditorError(error instanceof Error ? error.message : "Workflow stop failed");
  } finally {
    setWorkflowOperation(null);
  }
}

function workflowProjectionIsRunningRun(
  projection: WorkflowGraphProjection | null,
): projection is WorkflowGraphProjection & {
  executionId: string;
  executionStatus: "running";
  viewMode: "run";
} {
  return (
    projection !== null &&
    projection.viewMode === "run" &&
    projection.executionId !== "" &&
    projection.executionStatus === "running"
  );
}

async function workflowProjectionForRun(
  projection: WorkflowGraphProjection & {
    executionId: string;
    viewMode: "run";
  },
): Promise<WorkflowGraphProjection> {
  const refreshed = await window.setta.workflow.graphProjection(
    projection.workspaceId,
    projection.definitionId,
    projection.definitionVersionId,
    projection.executionId,
  );
  if (refreshed.projection === null) {
    throw new Error(`workflow graph projection ${projection.executionId} was not returned`);
  }
  return refreshed.projection;
}
