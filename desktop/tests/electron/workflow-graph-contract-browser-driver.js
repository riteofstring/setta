/* global document, window */

(() => {
  const version = "setta-workflow-graph-contract-driver-v2";

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

  async function createSemanticRuntimeSeed({
    definitionId,
    targetEntityId,
    workflowNodeId,
    workspaceId,
  }) {
    await window.setta.semanticGraph.createNode({
      actorId: "workflow_graph_contract",
      actorKind: "user",
      kind: "constraint",
      label: "Workflow graph live drag runtime seed",
      nodeId: targetEntityId,
      summary: "Runtime source used by the workflow graph live-drag contract workflow.",
      workspaceId,
    });
    const attachment = await window.setta.semanticGraph.attachWorkflowNode({
      activityKind: "validating",
      actorId: "workflow_graph_contract",
      actorKind: "user",
      nodeId: targetEntityId,
      summary: "Attach runtime seed to the workflow node under drag.",
      workflowDefinitionId: definitionId,
      workflowExecutionId: "",
      workflowNodeExecutionId: "",
      workflowNodeId,
      workspaceId,
    });
    return { attachment, ok: Boolean(attachment.evidence?.id) };
  }

  function startSemanticRuntimeBurst({
    count = 8,
    definitionId,
    delayMs = 12,
    executionId,
    processFirst = 0,
    targetEntityId,
    workflowNodeId,
    workspaceId,
  }) {
    const token = `semantic-runtime-burst-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const status = {
      done: false,
      error: "",
      processedCount: 0,
      token,
      windowCount: 0,
    };
    status.promise = emitSemanticRuntimeBurst({
      count,
      definitionId,
      delayMs,
      executionId,
      processFirst,
      status,
      targetEntityId,
      workflowNodeId,
      workspaceId,
    })
      .then(() => {
        status.done = true;
      })
      .catch((error) => {
        status.done = true;
        status.error = error instanceof Error ? error.message : String(error);
      });
    semanticRuntimeBursts().set(token, status);
    return { ok: true, token };
  }

  async function semanticRuntimeBurstResult({ token }) {
    const status = semanticRuntimeBursts().get(token);
    if (!status) {
      return { ok: false, reason: "missing-burst-token", token };
    }
    await status.promise;
    semanticRuntimeBursts().delete(token);
    if (status.error !== "") {
      return {
        error: status.error,
        ok: false,
        processedCount: status.processedCount,
        reason: "burst-failed",
        token,
        windowCount: status.windowCount,
      };
    }
    return {
      ok: true,
      processedCount: status.processedCount,
      token,
      windowCount: status.windowCount,
    };
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

  async function emitSemanticRuntimeBurst({
    count,
    definitionId,
    delayMs,
    executionId,
    processFirst,
    status,
    targetEntityId,
    workflowNodeId,
    workspaceId,
  }) {
    for (let index = 0; index < count; index += 1) {
      const built = await window.setta.semanticGraph.buildCartographerWindow({
        runStatus: "",
        sourceRefs: {
          chatConversationId: "",
          chatMessageId: "",
          chatRunId: "",
          runItemId: "",
          workflowDefinitionId: definitionId,
          workflowExecutionId: executionId,
          workflowNodeExecutionId: "",
          workflowNodeId,
        },
        summary: `Workflow graph live drag runtime burst ${index + 1}.`,
        targetEntityId,
        terminalReason: "",
        triggerKind: "workflow_window",
        workspaceId,
      });
      status.windowCount += 1;
      if (index < processFirst) {
        await window.setta.semanticGraph.processCartographerWindow({
          windowId: built.window.id,
          workspaceId,
        });
        status.processedCount += 1;
      }
      if (delayMs > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, delayMs));
      }
    }
  }

  function semanticRuntimeBursts() {
    if (!window.__settaWorkflowGraphContractSemanticRuntimeBursts) {
      window.__settaWorkflowGraphContractSemanticRuntimeBursts = new Map();
    }
    return window.__settaWorkflowGraphContractSemanticRuntimeBursts;
  }

  window.__settaWorkflowGraphContractDriver = {
    createSemanticRuntimeSeed,
    readWorkflowGraphProjection,
    readWorkflowGraphViewLayout,
    semanticRuntimeBurstResult,
    startSemanticRuntimeBurst,
    version,
    workflowGraphCanvasCursor,
  };
})();
