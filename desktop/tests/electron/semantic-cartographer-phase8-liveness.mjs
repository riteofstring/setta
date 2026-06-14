import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { waitForBackendState, waitForState } from "./chat-workflow-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";
import { writeJson } from "./electron-cdp-harness.mjs";
import { openSelectedGraphNodeDetailsFromToolbar } from "./semantic-graph-ui-helpers.mjs";
import {
  dispatchWorkflowGraphMouseClick,
  dispatchWorkflowGraphWheel,
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
} from "./workflow-graph-layout-helpers.mjs";

const seedNodeId = "semantic_auto_workflow_context";
const smokeAgentNodeId = "agent";

export async function buildWorkflowSourcePulseWithinOneSecond({
  client,
  definitionId,
  executionId,
  graphSurfaceId,
  startedAtMs,
  workspaceId,
}) {
  const built = await buildPhase8CartographerWindow(client, {
    definitionId,
    executionId,
    summary: "Phase 8 pre-patch workflow source liveness window.",
    targetEntityId: seedNodeId,
    triggerKind: "workflow_window",
    workflowNodeId: smokeAgentNodeId,
    workspaceId,
  });
  const workingSet = await waitForBackendState(
    () => readWorkingSet(client, workspaceId, executionId),
    (value) => workflowSourcePulseReady(value, built.run.id, built.window.id),
    1000,
  );
  const latencyMs = Date.now() - startedAtMs;
  if (latencyMs > 1000) {
    throw new Error(`semantic liveness pulse latency ${latencyMs}ms exceeded 1000ms`);
  }
  const snapshot = await getWorkflowGraphSnapshot(client, graphSurfaceId);
  return {
    latencyMs,
    pulseKinds: workingSet.pulses.map((pulse) => pulse.kind),
    renderedLiveSourceCount: renderedSemanticLiveSourceIds(snapshot).length,
    runId: built.run.id,
    windowId: built.window.id,
  };
}

export async function runPhase8SemanticLivenessGate({
  automatic,
  client,
  definitionId,
  execution,
  executionId,
  graphSurfaceId,
  prePatchPulse,
  recordingDir,
  workspaceId,
}) {
  const workflowItems = await assertScriptedWorkflowRunItems({
    client,
    execution,
    workspaceId,
  });
  const duplicateEvidence = await assertDuplicateEvidencePreventedOrReported({
    automatic,
    client,
    executionId,
    workspaceId,
  });
  const statuses = await phase8StatusRecords({
    automatic,
    client,
    definitionId,
    executionId,
    workspaceId,
  });
  assertPhase8StatusCoverage(statuses);
  const reload = await assertPhase8DetailsAndReload({
    automatic,
    client,
    graphSurfaceId,
    workspaceId,
  });
  const report = {
    duplicateEvidence,
    prePatchPulse,
    reload,
    statuses,
    workflowItems,
  };
  await writeJson(join(recordingDir, "phase8-semantic-liveness-gate.json"), report);
  return report;
}

async function phase8StatusRecords({ automatic, client, definitionId, executionId, workspaceId }) {
  return [
    await assertPhase8QueuedStatus({ client, definitionId, workspaceId }),
    ...(await assertPhase8RunningAndNoopStatuses({ client, workspaceId })),
    await assertPhase8PendingReviewStatus({ client, definitionId, workspaceId }),
    await assertPhase8AppliedStatus({ automatic, client, executionId, workspaceId }),
    await assertPhase8FailedStatus({ client, workspaceId }),
  ];
}

function workflowSourcePulseReady(workingSet, runId, windowId) {
  return (
    workingSet.activeCartographerRuns.some((run) => run.id === runId && run.status === "queued") &&
    workingSet.pulses.some((pulse) => workflowSourcePulseMatches(pulse, runId, windowId))
  );
}

function workflowSourcePulseMatches(pulse, runId, windowId) {
  return (
    pulse.runId === runId &&
    pulse.windowId === windowId &&
    ["active_workflow_source", "cartographer_observing"].includes(pulse.kind)
  );
}

function renderedSemanticLiveSourceIds(snapshot) {
  return (snapshot.graph.nodes ?? [])
    .map((node) => node.id)
    .filter((id) => typeof id === "string" && id.startsWith("semantic-live-source:"));
}

async function assertScriptedWorkflowRunItems({ client, execution, workspaceId }) {
  const chatRunId = workflowRunnerRefID(execution, smokeAgentNodeId, "chat.run");
  const chatConversationId = workflowRunnerRefID(execution, smokeAgentNodeId, "chat.conversation");
  const activity = await waitForBackendState(
    () => rendererChat(client, "runActivity", [workspaceId, chatRunId, 80]),
    scriptedWorkflowActivityReady,
    5000,
  );
  const messagePage = await waitForBackendState(
    () => rendererChat(client, "messagePage", [workspaceId, chatConversationId, 0, 40]),
    scriptedWorkflowAssistantMessageReady,
    5000,
  );
  const command = requiredActivityItem(activity, isScriptedCommandItem, "command_execution");
  const fileChange = requiredActivityItem(activity, isScriptedFileChangeItem, "file_change");
  const workflowResult = requiredActivityItem(
    activity,
    isScriptedWorkflowResultItem,
    "workflow_result",
  );
  return {
    assistantMessageId:
      messagePage.messages.find((message) => message.role === "assistant")?.id ?? "",
    chatConversationId,
    chatRunId,
    commandItemId: command.id,
    fileChangeItemId: fileChange.id,
    workflowResultItemId: workflowResult.id,
  };
}

function scriptedWorkflowActivityReady(activity) {
  return (
    activity.items.some(isScriptedCommandItem) &&
    activity.items.some(isScriptedFileChangeItem) &&
    activity.items.some(isScriptedWorkflowResultItem)
  );
}

function scriptedWorkflowAssistantMessageReady(page) {
  return page.messages.some(
    (message) =>
      message.role === "assistant" &&
      chatMessageText(message).includes("Workflow result action complete."),
  );
}

function requiredActivityItem(activity, predicate, label) {
  const item = activity.items.find(predicate);
  if (!item) {
    throw new Error(`scripted workflow activity missing ${label}: ${JSON.stringify(activity)}`);
  }
  return item;
}

function isScriptedCommandItem(item) {
  return (
    item.type === "command_execution" &&
    item.status === "completed" &&
    item.command.includes("test")
  );
}

function isScriptedFileChangeItem(item) {
  return (
    item.type === "file_change" &&
    item.status === "completed" &&
    item.filePaths.includes("reports/workflow-result.md")
  );
}

function isScriptedWorkflowResultItem(item) {
  return (
    item.type === "dynamic_tool_call" &&
    item.status === "completed" &&
    item.toolName === "workflow_result"
  );
}

function workflowRunnerRefID(execution, nodeId, kind) {
  const nodeExecution = latestNodeExecution(execution, nodeId);
  const ref = nodeExecution?.runnerRefs.find((candidate) => candidate.kind === kind);
  if (!ref?.id) {
    throw new Error(
      `workflow runner ref ${kind} missing for ${nodeId}: ${JSON.stringify(nodeExecution)}`,
    );
  }
  return ref.id;
}

function chatMessageText(message) {
  return (message.parts ?? []).map((part) => part.text ?? "").join("");
}

async function assertDuplicateEvidencePreventedOrReported({
  automatic,
  client,
  executionId,
  workspaceId,
}) {
  const graph = await rendererSemanticGraph(client, "read", [{ workspaceId }]);
  const duplicateIdentity = firstDuplicateSourceLinkIdentity(graph.sourceLinks);
  if (duplicateIdentity !== "") {
    throw new Error(`duplicate source-link identity remained in graph: ${duplicateIdentity}`);
  }
  const runs = await rendererSemanticGraph(client, "listCartographerRuns", [
    {
      chatRunId: "",
      limit: 40,
      targetEntityId: "",
      workflowExecutionId: executionId,
      workspaceId,
    },
  ]);
  if (!graph.sourceLinks.some((link) => link.targetEntityId === automatic.nodeId)) {
    throw new Error(`automatic node source link missing: ${JSON.stringify(graph.sourceLinks)}`);
  }
  return {
    finalSynthesisDedupeRunId:
      runs.runs.find((run) =>
        (run.trajectorySummary ?? "").includes("deduplicated repeated final-synthesis context"),
      )?.id ?? "",
    publicGraphDuplicateSourceLinksPrevented: true,
    sourceLinkCount: graph.sourceLinks.length,
    targetEntityId: automatic.nodeId,
  };
}

function firstDuplicateSourceLinkIdentity(sourceLinks) {
  const seen = new Set();
  for (const link of sourceLinks) {
    const identity = sourceLinkIdentity(link);
    if (seen.has(identity)) {
      return identity;
    }
    seen.add(identity);
  }
  return "";
}

function sourceLinkIdentity(link) {
  return [
    link.targetEntityId,
    link.sourceKind,
    link.sourceId,
    link.workflowDefinitionId,
    link.workflowExecutionId,
    link.workflowNodeId,
    link.workflowNodeExecutionId,
    link.chatConversationId,
    link.chatRunId,
    link.chatMessageId,
    link.runItemId,
    link.reassignedFromAnchorId,
  ].join("\u0000");
}

async function assertPhase8QueuedStatus({ client, definitionId, workspaceId }) {
  const executionId = "phase8_queued_execution";
  const built = await buildPhase8CartographerWindow(client, {
    definitionId,
    executionId,
    summary: "Phase 8 queued cartographer working-set status.",
    targetEntityId: seedNodeId,
    triggerKind: "workflow_window",
    workflowNodeId: "phase8_queued",
    workspaceId,
  });
  if (built.run.status !== "queued") {
    throw new Error(`phase 8 queued run mismatch: ${JSON.stringify(built)}`);
  }
  const workingSet = await waitForWorkingSetStatus({
    client,
    executionId,
    status: "queued",
    workspaceId,
  });
  assertWorkingSetPulse(workingSet, "active_workflow_source");
  return phase8StatusRecord("queued", built.run.id, built.window.id, workingSet);
}

async function assertPhase8RunningAndNoopStatuses({ client, workspaceId }) {
  const executionId = "phase8_running_execution";
  const built = await buildPhase8CartographerWindow(client, {
    definitionId: "",
    executionId,
    summary: "Phase 8 running-to-noop cartographer working-set status.",
    targetEntityId: "",
    triggerKind: "workflow_window",
    workflowNodeId: "phase8_running",
    workspaceId,
  });
  const processed = await processCartographerWindowWhileRunning({
    client,
    executionId,
    windowId: built.window.id,
    workspaceId,
  });
  const noop = await waitForWorkingSetStatus({
    client,
    executionId,
    status: "noop",
    workspaceId,
  });
  return [
    phase8StatusRecord("running", built.run.id, built.window.id, processed.running),
    phase8StatusRecord("noop", processed.result.run.id, processed.result.window.id, noop),
  ];
}

async function processCartographerWindowWhileRunning({
  client,
  executionId,
  windowId,
  workspaceId,
}) {
  const promiseKey = `__settaPhase8CartographerProcess_${Date.now()}`;
  await startCartographerWindowProcess(client, promiseKey, windowId, workspaceId);
  const running = await waitForWorkingSetStatus({
    client,
    executionId,
    status: "running",
    workspaceId,
  });
  assertWorkingSetPulse(running, "cartographer_running");
  const processed = await client.evaluate(`globalThis[${JSON.stringify(promiseKey)}]`);
  if (!processed.ok) {
    throw new Error(`phase 8 running process failed: ${JSON.stringify(processed)}`);
  }
  if (processed.result.run.status !== "completed_noop") {
    throw new Error(`phase 8 no-op result mismatch: ${JSON.stringify(processed.result)}`);
  }
  return { result: processed.result, running };
}

async function startCartographerWindowProcess(client, promiseKey, windowId, workspaceId) {
  await client.evaluate(`(() => {
    globalThis[${JSON.stringify(promiseKey)}] = window.setta.semanticGraph
      .processCartographerWindow({
        windowId: ${JSON.stringify(windowId)},
        workspaceId: ${JSON.stringify(workspaceId)}
      })
      .then((result) => ({ ok: true, result }))
      .catch((error) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  })()`);
}

async function assertPhase8PendingReviewStatus({ client, definitionId, workspaceId }) {
  const executionId = "phase8_pending_review_execution";
  const built = await buildPhase8CartographerWindow(client, {
    definitionId,
    executionId,
    summary: "Phase 8 proposed patch pending review.",
    targetEntityId: seedNodeId,
    triggerKind: "workflow_window",
    workflowNodeId: "phase8_pending_review",
    workspaceId,
  });
  const processed = await rendererSemanticGraph(client, "processCartographerWindow", [
    {
      windowId: built.window.id,
      workspaceId,
    },
  ]);
  assertPendingReviewResult(processed);
  const workingSet = await waitForWorkingSetStatus({
    client,
    executionId,
    status: "pending_review",
    workspaceId,
  });
  assertWorkingSetPulse(workingSet, "patch_proposed");
  if (workingSet.pendingPatchPreviews.length === 0) {
    throw new Error(`phase 8 pending patch preview missing: ${JSON.stringify(workingSet)}`);
  }
  return phase8StatusRecord("proposed", processed.run.id, processed.window.id, workingSet);
}

function assertPendingReviewResult(processed) {
  if (!pendingReviewResultReady(processed)) {
    throw new Error(`phase 8 pending-review result mismatch: ${JSON.stringify(processed)}`);
  }
}

function pendingReviewResultReady(processed) {
  return (
    processed.run.status === "pending_review" &&
    processed.patches.some((patch) => patch.status === "pending_review")
  );
}

async function assertPhase8AppliedStatus({ automatic, client, executionId, workspaceId }) {
  const workingSet = await waitForWorkingSetStatus({
    client,
    executionId,
    status: "applied",
    workspaceId,
  });
  assertWorkingSetPulseTouches(workingSet, "node_updated_recent", automatic.nodeId);
  assertWorkingSetPulseTouches(workingSet, "evidence_attached", automatic.nodeId);
  assertWorkingSetPulse(workingSet, "edge_created");
  return phase8StatusRecord("applied", automatic.run.id, automatic.window.id, workingSet);
}

async function assertPhase8FailedStatus({ client, workspaceId }) {
  const executionId = "phase8_failed_execution";
  await setFinalSynthesisInputBudget(client, workspaceId, 1);
  const built = await buildPhase8CartographerWindow(client, {
    chatRunId: "phase8_failed_chat_run",
    executionId,
    summary: "Phase 8 final synthesis budget failure.",
    targetEntityId: seedNodeId,
    terminalReason: "phase8_failed_budget",
    triggerKind: "workflow_done",
    workspaceId,
  });
  const processed = await rendererSemanticGraph(client, "processCartographerWindow", [
    {
      windowId: built.window.id,
      workspaceId,
    },
  ]);
  if (processed.run.status !== "failed") {
    throw new Error(`phase 8 failed result mismatch: ${JSON.stringify(processed)}`);
  }
  const workingSet = await waitForWorkingSetStatus({
    client,
    executionId,
    status: "failed",
    workspaceId,
  });
  return phase8StatusRecord("failed", processed.run.id, processed.window.id, workingSet);
}

async function buildPhase8CartographerWindow(
  client,
  {
    chatRunId = "",
    definitionId = "",
    executionId,
    summary,
    targetEntityId,
    terminalReason = "",
    triggerKind,
    workflowNodeId = "",
    workspaceId,
  },
) {
  return rendererSemanticGraph(client, "buildCartographerWindow", [
    {
      runStatus: "",
      sourceRefs: phase8SourceRefs({
        chatRunId,
        definitionId,
        executionId,
        workflowNodeId,
      }),
      summary,
      targetEntityId,
      terminalReason,
      triggerKind,
      workspaceId,
    },
  ]);
}

function phase8SourceRefs({ chatRunId = "", definitionId = "", executionId, workflowNodeId = "" }) {
  return {
    chatConversationId: "",
    chatMessageId: "",
    chatRunId,
    runItemId: "",
    workflowDefinitionId: definitionId,
    workflowExecutionId: executionId,
    workflowNodeExecutionId: "",
    workflowNodeId,
  };
}

async function readWorkingSet(client, workspaceId, executionId) {
  return rendererSemanticGraph(client, "readWorkingSet", [
    {
      chatRunId: "",
      limit: 100,
      workflowExecutionId: executionId,
      workspaceId,
    },
  ]);
}

async function waitForWorkingSetStatus({ client, executionId, status, workspaceId }) {
  return waitForBackendState(
    () => readWorkingSet(client, workspaceId, executionId),
    (workingSet) => workingSetHasStatus(workingSet, status),
    5000,
  );
}

function workingSetHasStatus(workingSet, status) {
  return (
    workingSet.activeCartographerRuns.some((run) => run.status === status) ||
    workingSet.recentCartographerRuns.some((run) => run.status === status) ||
    workingSet.activeCartographerWindows.some((window) => window.status === status) ||
    workingSet.pendingPatchPreviews.some((preview) => preview.status === status) ||
    workingSet.recentSemanticChanges.some((change) => change.status === status)
  );
}

function assertWorkingSetPulse(workingSet, kind) {
  if (!workingSet.pulses.some((pulse) => pulse.kind === kind)) {
    throw new Error(`working-set pulse ${kind} missing: ${JSON.stringify(workingSet)}`);
  }
}

function assertWorkingSetPulseTouches(workingSet, kind, nodeId) {
  if (!workingSet.pulses.some((pulse) => workingSetPulseTouchesNode(pulse, kind, nodeId))) {
    throw new Error(
      `working-set pulse ${kind} missing for ${nodeId}: ${JSON.stringify(workingSet)}`,
    );
  }
}

function workingSetPulseTouchesNode(pulse, kind, nodeId) {
  return (
    pulse.kind === kind &&
    (pulse.targetEntityId === nodeId || pulse.semanticNodeIds.includes(nodeId))
  );
}

function phase8StatusRecord(status, runId, windowId, workingSet) {
  return {
    pulseKinds: workingSet.pulses.map((pulse) => pulse.kind),
    runId,
    status,
    windowId,
  };
}

function assertPhase8StatusCoverage(statuses) {
  const observed = new Set(statuses.map((status) => status.status));
  for (const required of ["queued", "running", "proposed", "applied", "noop", "failed"]) {
    if (!observed.has(required)) {
      throw new Error(`phase 8 status ${required} missing: ${JSON.stringify(statuses)}`);
    }
  }
}

async function setFinalSynthesisInputBudget(client, workspaceId, inputBudget) {
  const record = await rendererSemanticGraph(client, "readCartographerSettings", [{}]);
  const settings = semanticCartographerSettingsInput(record.settings);
  settings.finalSynthesisTaskConfig = {
    ...settings.finalSynthesisTaskConfig,
    inputBudget,
  };
  await rendererSemanticGraph(client, "updateCartographerSettings", [
    {
      settings,
      workspaceId,
    },
  ]);
}

function semanticCartographerSettingsInput(settings) {
  return {
    auditConfig: settings.auditConfig,
    automaticProcessingEnabled: settings.automaticProcessingEnabled,
    finalSynthesisTaskConfig: settings.finalSynthesisTaskConfig,
    liveTaskConfig: settings.liveTaskConfig,
    observationConfig: settings.observationConfig,
    processingConfig: settings.processingConfig,
  };
}

async function assertPhase8DetailsAndReload({ automatic, client, graphSurfaceId, workspaceId }) {
  const expectedLabel = "Workflow node agent result";
  const beforeText = await openAndAssertAutomaticNodeDetails({
    client,
    expectedLabel,
    graphSurfaceId,
    nodeId: automatic.nodeId,
  });
  await client.call("Page.reload", { ignoreCache: true });
  await waitForState(
    client,
    `(() => Boolean(document.querySelector('[data-testid="workspace-layout-area"]')))()`,
    (value) => value === true,
    30_000,
  );
  await openWorkflowGraphPane(client, { timeoutMs: 30_000 });
  const reloadedSurfaceId = await maximizeWorkflowGraphPane(client, { timeoutMs: 30_000 });
  await waitForRenderedSemanticGraphNode(client, reloadedSurfaceId, automatic.nodeId);
  await assertAutomaticSemanticNodeReadback(client, workspaceId, automatic);
  const afterText = await openAndAssertAutomaticNodeDetails({
    client,
    expectedLabel,
    graphSurfaceId: reloadedSurfaceId,
    nodeId: automatic.nodeId,
  });
  return {
    afterTextLength: afterText.length,
    beforeTextLength: beforeText.length,
    reloadedSurfaceId,
  };
}

async function assertAutomaticSemanticNodeReadback(client, workspaceId, automatic) {
  const graph = await rendererSemanticGraph(client, "read", [{ workspaceId }]);
  const detail = await rendererSemanticGraph(client, "readNodeDetail", [
    { nodeId: automatic.nodeId, workspaceId },
  ]);
  if (!automaticSemanticNodeReadbackReady({ detail, graph }, automatic)) {
    throw new Error(
      `automatic cartographer semantic node mismatch: ${JSON.stringify({ detail, graph })}`,
    );
  }
}

function automaticSemanticNodeReadbackReady(readback, automatic) {
  return (
    readback.graph.nodes.some((node) => node.id === automatic.nodeId) &&
    readback.graph.sourceLinks.some((link) => link.targetEntityId === automatic.nodeId) &&
    readback.graph.edges.some(
      (edge) => edge.fromNodeId === automatic.nodeId && edge.toNodeId === seedNodeId,
    ) &&
    readback.detail.detail.evidence.some(
      (evidence) => evidence.reassignedFromAnchorId === automatic.evidenceAnchorId,
    )
  );
}

async function openAndAssertAutomaticNodeDetails({
  client,
  expectedLabel,
  graphSurfaceId,
  nodeId,
}) {
  const existingText = await client.evaluate(
    `document.querySelector('[data-testid="semantic-node-details-surface"]')?.innerText ?? ""`,
  );
  if (automaticDetailsTextReady(existingText, expectedLabel)) {
    return existingText;
  }
  await selectRenderedSemanticNode(client, graphSurfaceId, nodeId);
  await openSelectedGraphNodeDetailsFromToolbar(client, expectedLabel);
  const details = await waitForState(
    client,
    `(() => ({ text: document.querySelector('[data-testid="semantic-node-details-surface"]')?.innerText ?? "" }))()`,
    (value) => automaticDetailsTextReady(value.text, expectedLabel),
    5000,
  );
  return details.text;
}

function automaticDetailsTextReady(text, expectedLabel) {
  return (
    text.includes(expectedLabel) &&
    text.includes("SOURCE LINKS") &&
    text.includes("CARTOGRAPHER") &&
    text.includes("Workflow node agent")
  );
}

async function selectRenderedSemanticNode(client, graphSurfaceId, semanticNodeId) {
  const rendererNodeId = `semantic:${semanticNodeId}`;
  const node = await ensureRenderedSemanticNodeClickable(client, graphSurfaceId, rendererNodeId);
  await dispatchWorkflowGraphMouseClick(client, graphSurfaceId, {
    x: node.screenX,
    y: node.screenY,
  });
  await waitForWorkflowGraphSnapshot(
    client,
    graphSurfaceId,
    (candidate) => candidate.interaction.selectedNodeId === rendererNodeId,
    5000,
  );
}

async function ensureRenderedSemanticNodeClickable(client, graphSurfaceId, rendererNodeId) {
  let snapshot = await waitForWorkflowGraphSnapshot(
    client,
    graphSurfaceId,
    (candidate) => candidate.graph.nodes.some((node) => node.id === rendererNodeId),
    30_000,
  );
  let direction = { x: 0, y: 0 };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const node = requireRenderedGraphNode(snapshot, rendererNodeId);
    if (isClickableMaterializedNode(snapshot, node)) {
      return node;
    }
    const pan = panVectorForNode(snapshot, node, direction);
    const next = await panWorkflowGraph(client, graphSurfaceId, snapshot, pan);
    direction = nextPanDirection(snapshot, next, rendererNodeId, pan, direction);
    snapshot = next;
  }
  throw new Error(
    `rendered semantic node did not become clickable: nodeId=${rendererNodeId} snapshot=${JSON.stringify(snapshot)}`,
  );
}

function requireRenderedGraphNode(snapshot, rendererNodeId) {
  const node = snapshot.graph.nodes.find((candidate) => candidate.id === rendererNodeId);
  if (!node) {
    throw new Error(`rendered semantic node disappeared: ${rendererNodeId}`);
  }
  return node;
}

function isClickableMaterializedNode(snapshot, node) {
  return node.materialized === true && workflowGraphPointClickable(snapshot, node);
}

function panVectorForNode(snapshot, node, direction) {
  const center = workflowGraphCanvasCenter(snapshot);
  return {
    x:
      axisPanDirection(node.screenX, 48, snapshot.canvas.clientWidth - 48, center.x, direction.x) *
      420,
    y:
      axisPanDirection(node.screenY, 48, snapshot.canvas.clientHeight - 48, center.y, direction.y) *
      320,
  };
}

function axisPanDirection(value, min, max, center, previous) {
  if (value >= min && value <= max) {
    return 0;
  }
  return previous || (value > center ? -1 : 1);
}

async function panWorkflowGraph(client, graphSurfaceId, snapshot, pan) {
  const center = workflowGraphCanvasCenter(snapshot);
  await dispatchWorkflowGraphWheel(client, graphSurfaceId, {
    deltaX: pan.x,
    deltaY: pan.y,
    x: center.x,
    y: center.y,
  });
  await delay(120);
  return getWorkflowGraphSnapshot(client, graphSurfaceId);
}

function nextPanDirection(before, after, rendererNodeId, pan, previous) {
  const beforeNode = requireRenderedGraphNode(before, rendererNodeId);
  const afterNode = after.graph.nodes.find((candidate) => candidate.id === rendererNodeId);
  const improved =
    afterNode &&
    distanceToWorkflowGraphClickableArea(after, afterNode) <
      distanceToWorkflowGraphClickableArea(before, beforeNode) - 1;
  return {
    x: updatedAxisDirection(pan.x, previous.x, improved),
    y: updatedAxisDirection(pan.y, previous.y, improved),
  };
}

function updatedAxisDirection(delta, previous, improved) {
  if (delta === 0) {
    return previous;
  }
  return Math.sign(delta) * (improved ? 1 : -1);
}

function workflowGraphCanvasCenter(snapshot) {
  return {
    x: Math.floor(snapshot.canvas.clientWidth / 2),
    y: Math.floor(snapshot.canvas.clientHeight / 2),
  };
}

function workflowGraphPointClickable(snapshot, point) {
  const margin = 48;
  return (
    point.screenX >= margin &&
    point.screenY >= margin &&
    point.screenX <= snapshot.canvas.clientWidth - margin &&
    point.screenY <= snapshot.canvas.clientHeight - margin
  );
}

function distanceToWorkflowGraphClickableArea(snapshot, point) {
  const margin = 48;
  const x = Math.max(margin, Math.min(snapshot.canvas.clientWidth - margin, point.screenX));
  const y = Math.max(margin, Math.min(snapshot.canvas.clientHeight - margin, point.screenY));
  return Math.hypot(point.screenX - x, point.screenY - y);
}

async function waitForRenderedSemanticGraphNode(client, graphSurfaceId, semanticNodeId) {
  return waitForWorkflowGraphSnapshot(
    client,
    graphSurfaceId,
    (snapshot) => renderedSemanticNodeIds(snapshot).has(semanticNodeId),
    30_000,
  );
}

async function waitForWorkflowGraphSnapshot(client, graphSurfaceId, predicate, timeoutMs) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", {
      surfaceId: graphSurfaceId,
    }),
    (value) => value.ready && predicate(value.snapshot),
    timeoutMs,
  ).then((value) => value.snapshot);
}

async function getWorkflowGraphSnapshot(client, graphSurfaceId) {
  await client.installDriver();
  return client.driver("workflowGraphDebugSnapshot", { surfaceId: graphSurfaceId });
}

function renderedSemanticNodeIds(snapshot) {
  const ids = new Set();
  for (const node of snapshot.graph.nodes ?? []) {
    if (typeof node.id === "string" && node.id.startsWith("semantic:")) {
      ids.add(node.id.slice("semantic:".length));
    }
  }
  return ids;
}

async function rendererChat(client, method, args) {
  return client.evaluate(
    `window.setta.chat[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

async function rendererSemanticGraph(client, method, args) {
  return client.evaluate(
    `window.setta.semanticGraph[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

function latestNodeExecution(execution, nodeId) {
  return execution.nodeExecutions.filter((nodeExecution) => nodeExecution.nodeId === nodeId).at(-1);
}
