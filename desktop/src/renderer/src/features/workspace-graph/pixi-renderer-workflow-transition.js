/* global performance */

export function workflowTransitionSnapshot(workflow, reason) {
  const at = Math.round(performance.now());
  if (!workflow) {
    return {
      at,
      definitionId: "",
      editable: null,
      executionId: "",
      reason,
      versionId: "",
      viewMode: "",
    };
  }
  return {
    at,
    definitionId: workflow.definitionId,
    editable: workflow.editable,
    executionId: workflow.executionId,
    reason,
    versionId: workflow.definitionVersionId,
    viewMode: workflow.viewMode,
  };
}
