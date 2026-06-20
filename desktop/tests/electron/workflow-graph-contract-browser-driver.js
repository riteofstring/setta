/* global document, window */

(() => {
  const version = "setta-workflow-graph-contract-driver-v1";

  async function readWorkflowGraphProjection({
    definitionId,
    executionId = "",
    versionId = "",
    workspaceId,
  }) {
    return window.setta.workflow.graphProjection(workspaceId, definitionId, versionId, executionId);
  }

  async function readWorkflowGraphViewLayout({ target, workspaceId }) {
    return window.setta.workflow.readGraphViewLayout({ target, workspaceId });
  }

  function workflowGraphCanvasCursor({ surfaceId = null } = {}) {
    const canvas = workflowGraphCanvas(surfaceId);
    return canvas === null ? "" : window.getComputedStyle(canvas).cursor;
  }

  function workflowGraphCanvas(surfaceId) {
    const surfaces = Array.from(document.querySelectorAll('[data-testid="workflow-graph"]'));
    const surface =
      surfaces.find((candidate) => candidate.dataset.surfaceId === surfaceId) ?? surfaces[0];
    return surface?.querySelector('[data-testid="workflow-graph-canvas"]') ?? null;
  }

  window.__settaWorkflowGraphContractDriver = {
    readWorkflowGraphProjection,
    readWorkflowGraphViewLayout,
    version,
    workflowGraphCanvasCursor,
  };
})();
