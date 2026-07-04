/* global HTMLButtonElement, document, setTimeout, window */

(() => {
  const version = "setta-semantic-graph-workflow-driver-v1";
  const seedConstraintNodeId = "semantic_seed_constraint";
  const seedCartographerPatchId = "semantic_seed_cartographer_patch_pending";
  const seedWorkflowExecutionId = "semantic_seed_workflow_execution";
  const semanticActor = { actorId: "semantic_e2e_user", actorKind: "user" };

  function installSemanticGraphWorkflowDriver() {
    const driver = globalThis.__settaE2EDriver;
    if (!driver) {
      throw new Error("base Setta E2E driver is not installed");
    }
    Object.assign(driver, {
      semanticGraphAttachChatRunEvidenceForProcessedCartographerWindow,
      semanticGraphAttachNodeToChatRun,
      semanticGraphBuildCartographerAuditBurst,
      semanticGraphBuildCartographerWindow,
      semanticGraphClickCartographerPatchAccept,
      semanticGraphEditingReadback,
      semanticGraphExerciseEditing,
      semanticGraphNodeDetailsText,
      semanticGraphProcessCartographerWindow,
      semanticGraphProcessedCartographerReadback,
      semanticGraphReadEventHistory,
      semanticGraphReadGraph,
      semanticGraphReadSeedCartographerState,
      semanticGraphReadSeedContextPack,
      semanticGraphWorkflowVersion: version,
    });
  }

  async function semanticGraphAttachNodeToChatRun({ chatInput, workspaceId }) {
    const graphBefore = await window.setta.semanticGraph.read({ workspaceId });
    const conversation = await window.setta.chat.createConversation(
      workspaceId,
      "Semantic graph attachment",
    );
    const sent = await window.setta.chat.sendMessage(workspaceId, conversation.id, chatInput);
    const attached = await window.setta.semanticGraph.attachChatRun({
      activityKind: "exploring",
      ...semanticActor,
      chatRunId: sent.run.id,
      nodeId: seedConstraintNodeId,
      summary: "Explicit semantic attachment from deterministic Electron workflow",
      workspaceId,
    });
    const ended = await window.setta.semanticGraph.endActivity({
      activityIntervalId: attached.activity.id,
      ...semanticActor,
      workspaceId,
    });
    const detail = await window.setta.semanticGraph.readNodeDetail({
      nodeId: seedConstraintNodeId,
      workspaceId,
    });
    const page = await window.setta.semanticGraph.listActivityPage({
      actorId: "",
      actorKind: null,
      chatConversationId: "",
      chatMessageId: "",
      chatRunId: sent.run.id,
      limit: 10,
      offset: 0,
      sourceId: "",
      sourceKind: "chat_run",
      targetEntityId: seedConstraintNodeId,
      workflowExecutionId: "",
      workflowNodeId: "",
      workspaceId,
    });
    const summary = await window.setta.semanticGraph.readActivitySummary({
      recentLimit: 5,
      workspaceId,
    });
    const graphAfter = await window.setta.semanticGraph.read({ workspaceId });
    return {
      attached,
      assistantMessageId: sent.assistantMessage.id,
      conversationId: conversation.id,
      detail,
      ended,
      graphNodeIdsAfter: graphAfter.nodes.map((node) => node.id).sort(),
      graphNodeIdsBefore: graphBefore.nodes.map((node) => node.id).sort(),
      page,
      runId: sent.run.id,
      summary,
      userMessageId: sent.userMessage.id,
    };
  }

  async function semanticGraphExerciseEditing({ workspaceId }) {
    await window.setta.semanticGraph.createNode({
      ...semanticActor,
      kind: "finding",
      label: "E2E editable node",
      nodeId: "semantic_e2e_edit",
      summary: "Created through semantic graph mutation endpoint.",
      workspaceId,
    });
    await window.setta.semanticGraph.renameNode({
      ...semanticActor,
      label: "E2E renamed semantic node",
      nodeId: "semantic_e2e_edit",
      workspaceId,
    });
    await window.setta.semanticGraph.updateNode({
      ...semanticActor,
      kind: "constraint",
      nodeId: "semantic_e2e_edit",
      summary: "Updated through semantic graph mutation endpoint.",
      workspaceId,
    });
    await window.setta.semanticGraph.promoteNode({
      ...semanticActor,
      nodeId: "semantic_e2e_edit",
      workspaceId,
    });
    await window.setta.semanticGraph.createNode({
      ...semanticActor,
      kind: "constraint",
      label: "E2E connected constraint",
      nodeId: "semantic_e2e_constraint",
      summary: "Constraint connected by a user-authored edge.",
      workspaceId,
    });
    await window.setta.semanticGraph.createEdge({
      ...semanticActor,
      edgeId: "semantic_e2e_constrains",
      fromNodeId: "semantic_e2e_constraint",
      kind: "constrains",
      label: "constrains",
      summary: "Constraint connected through semantic graph mutation endpoint.",
      toNodeId: "semantic_e2e_edit",
      workspaceId,
    });
    await window.setta.semanticGraph.updateEdge({
      ...semanticActor,
      edgeId: "semantic_e2e_constrains",
      kind: null,
      label: "constrains",
      summary: "Updated edge summary through semantic graph mutation endpoint.",
      workspaceId,
    });
    await window.setta.semanticGraph.createEdge({
      ...semanticActor,
      edgeId: "semantic_e2e_related",
      fromNodeId: "semantic_e2e_edit",
      kind: "related_to",
      label: "related",
      summary: "Temporary removable edge.",
      toNodeId: seedConstraintNodeId,
      workspaceId,
    });
    await window.setta.semanticGraph.removeEdge({
      ...semanticActor,
      edgeId: "semantic_e2e_related",
      workspaceId,
    });
    const steering = await window.setta.semanticGraph.createSteeringDirective({
      ...semanticActor,
      chatConversationId: "",
      chatMessageId: "",
      chatRunId: "",
      instruction: "Focus on this edited semantic node during the session.",
      kind: "focus",
      runItemId: "",
      scope: "session",
      targetEntityId: "semantic_e2e_edit",
      workflowDefinitionId: "",
      workflowExecutionId: "",
      workflowNodeExecutionId: "",
      workflowNodeId: "",
      workspaceId,
    });
    const directiveId = steering.nodeDetail.steeringDirectives[0].id;
    await window.setta.semanticGraph.updateSteeringDirective({
      ...semanticActor,
      directiveId,
      instruction: null,
      status: "completed",
      supersedesDirectiveId: "",
      workspaceId,
    });
    const split = await window.setta.semanticGraph.splitNode({
      ...semanticActor,
      nodes: [
        {
          kind: "constraint",
          label: "E2E split child A",
          nodeId: "semantic_e2e_child_a",
          summary: "",
        },
        {
          kind: "constraint",
          label: "E2E split child B",
          nodeId: "semantic_e2e_child_b",
          summary: "",
        },
      ],
      reassignments: { activity: [], edges: [], evidence: [], layout: [], steering: [] },
      sourceNodeId: "semantic_e2e_edit",
      workspaceId,
    });
    const merged = await window.setta.semanticGraph.mergeNodes({
      ...semanticActor,
      reassignments: { activity: [], edges: [], evidence: [], layout: [], steering: [] },
      sourceNodeIds: ["semantic_e2e_child_a", "semantic_e2e_child_b"],
      targetNode: {
        kind: "decision",
        label: "E2E merged decision",
        nodeId: "semantic_e2e_merged",
        summary: "",
      },
      workspaceId,
    });
    const editDetail = await window.setta.semanticGraph.readNodeDetail({
      nodeId: "semantic_e2e_edit",
      workspaceId,
    });
    const mergedDetail = await window.setta.semanticGraph.readNodeDetail({
      nodeId: "semantic_e2e_merged",
      workspaceId,
    });
    const editHistory = await window.setta.semanticGraph.readEventHistory({
      beforeLogicalClock: 0,
      limit: 80,
      targetEntityId: "semantic_e2e_edit",
      workspaceId,
    });
    return {
      directiveId,
      editDetail,
      editHistory,
      merged,
      mergedDetail,
      split,
    };
  }

  async function semanticGraphBuildCartographerAuditBurst({ burstSize, workspaceId }) {
    const sourceRefs = {
      chatConversationId: "",
      chatMessageId: "",
      chatRunId: "",
      runItemId: "",
      workflowDefinitionId: "",
      workflowExecutionId: seedWorkflowExecutionId,
      workflowNodeExecutionId: "",
      workflowNodeId: "",
    };
    const events = [];
    const unsubscribe = window.setta.semanticGraph.onEvent((event) => {
      if (
        event.workspaceId === workspaceId &&
        event.changedAreas.length === 1 &&
        event.changedAreas[0] === "cartographer_audit"
      ) {
        events.push(event);
      }
    });
    const built = [];
    try {
      for (let index = 0; index < burstSize; index += 1) {
        built.push(
          await window.setta.semanticGraph.buildCartographerWindow({
            runStatus: "completed",
            sourceRefs,
            summary: `Workflow graph audit-only burst ${index + 1}`,
            targetEntityId: seedConstraintNodeId,
            terminalReason: "manual",
            triggerKind: "manual",
            workspaceId,
          }),
        );
      }
      const deadline = Date.now() + 5000;
      while (events.length < 1 && Date.now() < deadline) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 50));
      }
      return {
        auditEventCount: events.length,
        builtCount: built.length,
        changedAreas: events.map((event) => event.changedAreas),
        deliveredRunIds: [...new Set(events.flatMap((event) => event.cartographerRunIds))],
        deliveredWindowIds: [...new Set(events.flatMap((event) => event.cartographerWindowIds))],
        runIds: built.map((item) => item.run.id),
        windowIds: built.map((item) => item.window.id),
      };
    } finally {
      unsubscribe();
    }
  }

  async function semanticGraphReadSeedContextPack({ workspaceId }) {
    const list = await window.setta.semanticGraph.listContextPacks({
      chatRunId: "",
      limit: 10,
      offset: 0,
      targetEntityId: seedConstraintNodeId,
      workflowExecutionId: "",
      workspaceId,
    });
    const pack = list.packs.find((candidate) => candidate.id === "semantic_seed_context_phase2");
    const read = pack
      ? await window.setta.semanticGraph.readContextPack({ packId: pack.id, workspaceId })
      : null;
    return { list, read };
  }

  async function semanticGraphReadSeedCartographerState({ workspaceId }) {
    const patches = await window.setta.semanticGraph.listCartographerPatches({
      limit: 10,
      runId: "",
      semanticTargetId: seedConstraintNodeId,
      status: "",
      workspaceId,
    });
    const patch =
      patches.patches.find((candidate) => candidate.id === seedCartographerPatchId) ?? null;
    const run = patch
      ? await window.setta.semanticGraph.readCartographerRun({ runId: patch.runId, workspaceId })
      : null;
    const runs = await window.setta.semanticGraph.listCartographerRuns({
      chatRunId: "",
      limit: 10,
      targetEntityId: "",
      workflowExecutionId: seedWorkflowExecutionId,
      workspaceId,
    });
    const windows = await window.setta.semanticGraph.listCartographerWindows({
      chatRunId: "",
      limit: 10,
      runId: "",
      sourceId: "",
      sourceKind: "",
      workflowExecutionId: seedWorkflowExecutionId,
      workspaceId,
    });
    const cursors = await window.setta.semanticGraph.listCartographerCursors({
      chatRunId: "",
      limit: 10,
      workflowExecutionId: seedWorkflowExecutionId,
      workspaceId,
    });
    const detail = await window.setta.semanticGraph.readNodeDetail({
      nodeId: seedConstraintNodeId,
      workspaceId,
    });
    const history = await window.setta.semanticGraph.readEventHistory({
      beforeLogicalClock: 0,
      limit: 100,
      targetEntityId: seedConstraintNodeId,
      workspaceId,
    });
    return { cursors, detail, history, patch, patches, run, runs, windows };
  }

  async function semanticGraphBuildCartographerWindow({ sourceRefs, workspaceId }) {
    return window.setta.semanticGraph.buildCartographerWindow({
      runStatus: "completed",
      sourceRefs,
      summary: "E2E cartographer build current progress",
      targetEntityId: seedConstraintNodeId,
      terminalReason: "manual",
      triggerKind: "manual",
      workspaceId,
    });
  }

  async function semanticGraphAttachChatRunEvidenceForProcessedCartographerWindow({
    chatInput,
    workspaceId,
  }) {
    const conversation = await window.setta.chat.createConversation(
      workspaceId,
      "Semantic cartographer process evidence",
    );
    const sent = await window.setta.chat.sendMessage(workspaceId, conversation.id, chatInput);
    const attached = await window.setta.semanticGraph.attachChatRun({
      activityKind: "validating",
      ...semanticActor,
      chatRunId: sent.run.id,
      nodeId: seedConstraintNodeId,
      summary: "Chat run evidence for deterministic structured cartographer processing",
      workspaceId,
    });
    await window.setta.semanticGraph.endActivity({
      activityIntervalId: attached.activity.id,
      ...semanticActor,
      workspaceId,
    });
    return { chatRunId: sent.run.id, evidenceAnchorId: attached.evidence.id };
  }

  async function semanticGraphProcessCartographerWindow({ windowId, workspaceId }) {
    return window.setta.semanticGraph.processCartographerWindow({ windowId, workspaceId });
  }

  function semanticGraphClickCartographerPatchAccept() {
    const button = document.querySelector('[data-testid="cartographer-patch-accept"]');
    const surface = document.querySelector('[data-testid="semantic-node-details-surface"]');
    if (!(button instanceof HTMLButtonElement)) {
      return {
        clicked: false,
        disabled: true,
        hasButton: false,
        loading: surface?.innerText.includes("Loading semantic node details") ?? true,
        reason: "missing-cartographer-accept-button",
      };
    }
    if (button.disabled) {
      return {
        clicked: false,
        disabled: true,
        hasButton: true,
        loading: surface?.innerText.includes("Loading semantic node details") ?? true,
        reason: "disabled-cartographer-accept-button",
      };
    }
    if (surface?.innerText.includes("Loading semantic node details")) {
      return {
        clicked: false,
        disabled: false,
        hasButton: true,
        loading: true,
        reason: "loading-semantic-node-details",
      };
    }
    button.click();
    return {
      clicked: true,
      disabled: false,
      hasButton: true,
      loading: false,
      reason: "",
    };
  }

  function semanticGraphNodeDetailsText() {
    return {
      text:
        document.querySelector('[data-testid="semantic-node-details-surface"]')?.innerText ?? "",
    };
  }

  async function semanticGraphProcessedCartographerReadback({
    processedCartographer,
    workspaceId,
  }) {
    const run = await window.setta.semanticGraph.readCartographerRun({
      runId: processedCartographer.runId,
      workspaceId,
    });
    const patches = await window.setta.semanticGraph.listCartographerPatches({
      limit: 10,
      runId: processedCartographer.runId,
      semanticTargetId: "",
      status: "",
      workspaceId,
    });
    const windows = await window.setta.semanticGraph.listCartographerWindows({
      chatRunId: "",
      limit: 10,
      runId: processedCartographer.runId,
      sourceId: "",
      sourceKind: "",
      workflowExecutionId: "",
      workspaceId,
    });
    const detail = await window.setta.semanticGraph.readNodeDetail({
      nodeId: processedCartographer.nodeId,
      workspaceId,
    });
    const graph = await window.setta.semanticGraph.read({ workspaceId });
    return { detail, graph, patches, run, windows };
  }

  async function semanticGraphReadEventHistory({ workspaceId }) {
    return window.setta.semanticGraph.readEventHistory({
      beforeLogicalClock: 0,
      limit: 100,
      targetEntityId: seedConstraintNodeId,
      workspaceId,
    });
  }

  async function semanticGraphReadGraph({ workspaceId }) {
    return window.setta.semanticGraph.read({ workspaceId });
  }

  async function semanticGraphEditingReadback({ workspaceId }) {
    const editDetail = await window.setta.semanticGraph.readNodeDetail({
      nodeId: "semantic_e2e_edit",
      workspaceId,
    });
    const mergedDetail = await window.setta.semanticGraph.readNodeDetail({
      nodeId: "semantic_e2e_merged",
      workspaceId,
    });
    const graph = await window.setta.semanticGraph.read({ workspaceId });
    return { editDetail, graph, mergedDetail };
  }

  installSemanticGraphWorkflowDriver();
})();
