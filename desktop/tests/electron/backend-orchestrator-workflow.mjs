import { rm } from "node:fs/promises";
import { basename, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { TextDecoder } from "node:util";

import {
  appendWorkflowState,
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  clickButtonByAria,
  createChat,
  createFixture,
  failureWithLogs,
  launchContext,
  openWorkspace,
  stopLaunchedContext,
  waitForBackendState,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

const reviewerNodeIds = ["review_a", "review_b", "review_c"];

export async function runBackendOrchestratorWorkflowLaunch(results, recordingRoot) {
  const fixture = await createFixture("backend-orchestrator");
  const firstRecording = join(recordingRoot, "backend-orchestrator", "first-launch");
  const secondRecording = join(recordingRoot, "backend-orchestrator", "second-launch");
  let first = null;
  let second = null;

  try {
    first = await launchContext(fixture, firstRecording);
    const recovery = await exerciseBackendOrchestratorFirstLaunch({
      context: first,
      fixture,
      firstRecording,
      results,
    });
    await stopLaunchedContext(first);
    first = null;

    second = await launchContext(fixture, secondRecording);
    await exerciseBackendOrchestratorRecoveryLaunch({
      context: second,
      recovery,
      secondRecording,
    });
  } catch (error) {
    await captureScreenshot(
      first?.client ?? second?.client,
      join(recordingRoot, "backend-orchestrator", "failure.png"),
    ).catch(() => {});
    const logs = [...(first?.electron.logs ?? []), ...(second?.electron.logs ?? [])];
    throw failureWithLogs(error, logs);
  } finally {
    await stopLaunchedContext(first);
    await stopLaunchedContext(second);
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }

  await assertBackendOrchestratorRecordingEvidence(firstRecording, secondRecording);
  results.push("backend-orchestrator");
  process.stdout.write("Electron chat workflow passed: backend-orchestrator\n");
}

async function exerciseBackendOrchestratorFirstLaunch({
  context,
  fixture,
  firstRecording,
  results,
}) {
  const backend = await backendProbe(firstRecording);
  const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
  await createChat(context.client, backend, workspaceId);

  await runOrchestratorStep(results, "backend-orchestrator-success", async () => {
    await runPhase4WorkflowSuccess(context.client, backend, firstRecording, workspaceId);
  });
  await runOrchestratorStep(results, "backend-orchestrator-approval", async () => {
    await runWorkflowApproval(context.client, workspaceId);
  });
  await runOrchestratorStep(results, "backend-orchestrator-late-gateway-arrival", async () => {
    await runLateGatewayArrivalWorkflow(context.client, backend, workspaceId);
  });
  await runOrchestratorStep(results, "backend-orchestrator-limits", async () => {
    await runPhase4WorkflowLimitPolicies(context.client, workspaceId);
  });
  await runOrchestratorStep(results, "backend-orchestrator-cancel", async () => {
    await runPhase4WorkflowCancellation(context.client, backend, workspaceId);
  });

  const recovery = await startPhase4WorkflowForRecovery(context.client, workspaceId);
  await captureScreenshot(context.client, join(firstRecording, "orchestrator.png"));
  return {
    ...recovery,
    workspaceDisplayName: basename(fixture.workspaceRoot),
  };
}

async function exerciseBackendOrchestratorRecoveryLaunch({ context, recovery, secondRecording }) {
  const backend = await backendProbe(secondRecording);
  const recovered = await waitForWorkflowExecution(
    context.client,
    recovery.workspaceId,
    recovery.executionId,
    (execution) => execution.status === "failed" && execution.terminalReason === "interrupted",
  );
  const work = latestNodeExecution(recovered, "work");
  if (work.status !== "failed") {
    throw new Error(`recovered work status = ${work.status}, want failed`);
  }
  await waitForTexts(context.client, ["workspace-root"]);
  await createWorkspaceScopedChat(
    context.client,
    backend,
    recovery.workspaceId,
    recovery.workspaceDisplayName,
  );
  await captureScreenshot(context.client, join(secondRecording, "recovered.png"));
}

async function createWorkspaceScopedChat(client, backend, workspaceId, workspaceDisplayName) {
  const before = await backend.post("/chat/conversations/list", { workspaceId });
  const existing = new Set(before.conversations.map((item) => item.conversation.id));
  await clickButtonByAria(client, `New chat in ${workspaceDisplayName}`);
  const after = await waitForBackendState(
    async () => backend.post("/chat/conversations/list", { workspaceId }),
    (value) => value.conversations.some((item) => !existing.has(item.conversation.id)),
  );
  const created = after.conversations.find((item) => !existing.has(item.conversation.id));
  if (!created) {
    throw new Error("workspace-scoped new chat was not returned by the backend");
  }
  return created.conversation.id;
}

async function runOrchestratorStep(results, name, workflow) {
  await workflow();
  results.push(name);
  process.stdout.write(`Electron chat workflow passed: ${name}\n`);
}

async function assertBackendOrchestratorRecordingEvidence(firstRecording, secondRecording) {
  await assertRecordingEvidence(firstRecording, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      "/workflows/definitions/validate",
      "/workflows/definitions/create",
      "/workflows/definitions/list",
      "/workflows/executions/start",
      "/workflows/executions/read",
      "/workflows/executions/events",
      "/workflows/graph/read",
      "/workflows/approvals/submit",
      "/workflows/events",
      "/workflows/executions/cancel",
      "/chat/messages/steer",
      "/chat/conversations/list",
      "/chat/messages/page",
      "/chat/runs/list",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "workflow:validate-definition",
      "workflow:create-definition",
      "workflow:list-definitions",
      "workflow:start-execution",
      "workflow:read-execution",
      "workflow:execution-events",
      "workflow:graph-projection",
      "workflow:submit-approval",
      "workflow:cancel-execution",
    ],
  });
  await assertRecordingEvidence(secondRecording, {
    backendPaths: [
      "/workflows/executions/read",
      "/chat/conversations/create",
      "/chat/conversations/list",
    ],
    ipcChannels: ["workflow:read-execution", "chat:create-conversation"],
  });
}

async function runPhase4WorkflowSuccess(client, backend, recordingDir, workspaceId) {
  const graph = phase4WorkflowGraph({ limitPolicy: "completed", maxIterations: 3 });
  const validation = await rendererWorkflow(client, "validateDefinition", [workspaceId, graph]);
  if (!validation.valid) {
    throw new Error(`phase 4 graph validation failed: ${JSON.stringify(validation.diagnostics)}`);
  }
  const definition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Phase 4 review loop",
    "Parallel reviewer workflow fixture",
    graph,
  ]);
  await assertDefinitionListed(client, workspaceId, definition.id);

  const started = await startWorkflowWithPushedEvent({
    backend,
    client,
    definitionId: definition.id,
    recordingDir,
    workspaceId,
  });
  const execution = await waitForWorkflowExecution(
    client,
    workspaceId,
    started.id,
    (value) => value.status === "completed",
  );
  assertWorkflowTerminal(execution, "completed", "end_reached");
  assertNodeExecutionCount(execution, "review_a", 2);
  assertNodeExecutionCount(execution, "review_b", 2);
  assertNodeExecutionCount(execution, "review_c", 2);
  assertNodeExecutionCount(execution, "join", 2);
  assertNodeExecutionCount(execution, "consolidator", 2);
  assertNodeExecutionCount(execution, "fix", 1);
  assertNodeExecutionCount(execution, "guard", 1);
  assertStructuredPhase4Routing(execution);
  await assertFreshWorkflowConversations(backend, workspaceId, execution, reviewerNodeIds);

  const page = await rendererWorkflow(client, "executionEvents", [
    workspaceId,
    execution.id,
    0,
    200,
  ]);
  assertWorkflowEventTypes(page.events, [
    "workflow.execution.started",
    "workflow.action.started",
    "workflow.action.completed",
    "workflow.gateway.resolved",
    "workflow.loop.advanced",
    "workflow.execution.completed",
  ]);
  assertParallelReviewersStartedBeforeCompletion(page.events);
}

async function runWorkflowApproval(client, workspaceId) {
  const graph = approvalWorkflowGraph();
  const validation = await rendererWorkflow(client, "validateDefinition", [workspaceId, graph]);
  if (!validation.valid) {
    throw new Error(`approval graph validation failed: ${JSON.stringify(validation.diagnostics)}`);
  }
  const definition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Approval workflow",
    "Workflow-owned approval fixture",
    graph,
  ]);
  const started = await rendererWorkflow(client, "startExecution", [workspaceId, definition.id]);
  const waiting = await waitForWorkflowExecution(client, workspaceId, started.id, (execution) => {
    const work = latestNodeExecution(execution, "work");
    return work?.status === "waiting_approval" && work.result?.pendingApproval !== null;
  });
  const work = latestNodeExecution(waiting, "work");
  const pending = work.result.pendingApproval;
  assertWorkflowPendingApproval(pending, {
    executionId: started.id,
    nodeExecutionId: work.id,
    workspaceId,
  });
  await assertWorkflowApprovalProjection(client, workspaceId, definition, started.id, pending);

  await rendererWorkflow(client, "submitApproval", [
    {
      answers: [],
      approvalId: pending.approvalId,
      approved: true,
      cancelled: false,
      executionId: started.id,
      nodeExecutionId: work.id,
      response: "",
      workspaceId,
    },
  ]);
  const completed = await waitForWorkflowExecution(
    client,
    workspaceId,
    started.id,
    (execution) => execution.status === "completed",
  );
  assertWorkflowTerminal(completed, "completed", "end_reached");
  assertWorkflowApprovalCleared(completed);
}

function assertWorkflowPendingApproval(pending, expected) {
  if (
    pending.workspaceId !== expected.workspaceId ||
    pending.executionId !== expected.executionId ||
    pending.nodeExecutionId !== expected.nodeExecutionId ||
    pending.approvalId !== pending.approval.id
  ) {
    throw new Error(`workflow pending approval metadata mismatch: ${JSON.stringify(pending)}`);
  }
}

async function assertWorkflowApprovalProjection(
  client,
  workspaceId,
  definition,
  executionId,
  pending,
) {
  const projectionResponse = await rendererWorkflow(client, "graphProjection", [
    workspaceId,
    definition.id,
    definition.currentVersionId,
    executionId,
  ]);
  const projectedWork = projectedNode(projectionResponse.projection, "work");
  if (projectedWork.pendingApproval?.approvalId !== pending.approvalId) {
    throw new Error(
      `projected approval = ${JSON.stringify(projectedWork.pendingApproval)}, want ${pending.approvalId}`,
    );
  }
}

function assertWorkflowApprovalCleared(completed) {
  const completedWork = latestNodeExecution(completed, "work");
  if (completedWork.result?.pendingApproval !== null) {
    throw new Error(
      `completed workflow retained pending approval: ${JSON.stringify(completedWork)}`,
    );
  }
}

async function runLateGatewayArrivalWorkflow(client, backend, workspaceId) {
  const graph = lateGatewayArrivalWorkflowGraph();
  const validation = await rendererWorkflow(client, "validateDefinition", [workspaceId, graph]);
  if (!validation.valid) {
    throw new Error(
      `late gateway arrival graph validation failed: ${JSON.stringify(validation.diagnostics)}`,
    );
  }
  const definition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Late gateway arrival",
    "Late branch completion after end fixture",
    graph,
  ]);
  const started = await rendererWorkflow(client, "startExecution", [workspaceId, definition.id]);
  const reachedEnd = await waitForWorkflowExecution(
    client,
    workspaceId,
    started.id,
    hasReachedEndWithSlowBranchActive,
  );
  const slow = latestNodeExecution(reachedEnd, "slow");
  await backend.post("/chat/messages/steer", {
    conversationId: runnerRef(slow, "chat.conversation"),
    prompt: "finish late branch",
    workspaceId,
  });

  const execution = await waitForWorkflowExecution(
    client,
    workspaceId,
    started.id,
    (value) => value.status === "completed",
  );
  assertWorkflowTerminal(execution, "completed", "end_reached");
  assertNodeStatus(execution, "fast", "succeeded");
  assertNodeStatus(execution, "slow", "succeeded");
  assertNodeExecutionCount(execution, "route", 1);
  assertNodeExecutionCount(execution, "end", 1);
}

async function assertDefinitionListed(client, workspaceId, definitionId) {
  const definitions = await rendererWorkflow(client, "listDefinitions", [workspaceId]);
  if (!definitions.definitions.some((item) => item.id === definitionId)) {
    throw new Error("created workflow definition was not listed");
  }
}

async function startWorkflowWithPushedEvent({
  backend,
  client,
  definitionId,
  recordingDir,
  workspaceId,
}) {
  const stream = await openWorkflowEventStream(backend.baseURL, recordingDir);
  try {
    const started = await rendererWorkflow(client, "startExecution", [workspaceId, definitionId]);
    const pushed = await stream.next();
    if (pushed.executionId !== started.id || pushed.type !== "workflow.execution.started") {
      throw new Error(`unexpected pushed workflow event: ${JSON.stringify(pushed)}`);
    }
    return started;
  } finally {
    await stream.close();
  }
}

async function runPhase4WorkflowLimitPolicies(client, workspaceId) {
  const cases = [
    { policy: "completed", status: "completed" },
    { policy: "failed", status: "failed" },
    { policy: "stopped", status: "stopped" },
  ];
  for (const item of cases) {
    const graph = phase4WorkflowGraph({ limitPolicy: item.policy, maxIterations: 1 });
    const definition = await rendererWorkflow(client, "createDefinition", [
      workspaceId,
      `Phase 4 ${item.policy} limit`,
      "Max iteration policy fixture",
      graph,
    ]);
    const started = await rendererWorkflow(client, "startExecution", [workspaceId, definition.id]);
    const execution = await waitForWorkflowExecution(
      client,
      workspaceId,
      started.id,
      (value) => value.status === item.status,
    );
    assertWorkflowTerminal(execution, item.status, "limit_reached");
    assertNodeExecutionCount(execution, "consolidator", 1);
    assertNodeExecutionCount(execution, "guard", 1);
  }
}

async function runPhase4WorkflowCancellation(client, backend, workspaceId) {
  const definition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Phase 4 cancellation",
    "Cancellation propagation fixture",
    cancellationWorkflowGraph(),
  ]);
  const started = await rendererWorkflow(client, "startExecution", [workspaceId, definition.id]);
  const running = await waitForWorkflowExecution(client, workspaceId, started.id, hasRunningWork);
  const work = latestNodeExecution(running, "work");
  const conversationId = runnerRef(work, "chat.conversation");
  const chatRunId = runnerRef(work, "chat.run");
  const cancelled = await rendererWorkflow(client, "cancelExecution", [workspaceId, started.id]);
  assertWorkflowTerminal(cancelled, "cancelled", "execution_cancelled");
  assertNodeStatus(cancelled, "work", "cancelled");

  await waitForBackendState(
    async () => backend.post("/chat/runs/list", { conversationId, workspaceId }),
    (list) => list.runs.some((run) => run.id === chatRunId && run.status === "cancelled"),
  );
}

function hasRunningWork(execution) {
  const work = latestNodeExecution(execution, "work");
  return work?.status === "running" && runnerRef(work, "chat.conversation") !== "";
}

function hasReachedEndWithSlowBranchActive(execution) {
  const slow = latestNodeExecution(execution, "slow");
  const end = latestNodeExecution(execution, "end");
  return (
    execution.status === "running" &&
    slow?.status === "running" &&
    runnerRef(slow, "chat.conversation") !== "" &&
    end?.status === "succeeded"
  );
}

async function startPhase4WorkflowForRecovery(client, workspaceId) {
  const definition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Phase 4 recovery",
    "Interrupted execution recovery fixture",
    cancellationWorkflowGraph(),
  ]);
  const started = await rendererWorkflow(client, "startExecution", [workspaceId, definition.id]);
  await waitForWorkflowExecution(client, workspaceId, started.id, hasRunningWork);
  return { executionId: started.id, workspaceId };
}

async function rendererWorkflow(client, method, args) {
  return client.evaluate(
    `window.setta.workflow[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

async function waitForWorkflowExecution(client, workspaceId, executionId, isReady) {
  return waitForBackendState(
    async () => rendererWorkflow(client, "readExecution", [workspaceId, executionId]),
    isReady,
  );
}

async function openWorkflowEventStream(baseURL, recordingDir) {
  const response = await globalThis.fetch(baseURL + "/workflows/events");
  await appendWorkflowState(recordingDir, {
    method: "GET",
    ok: response.ok,
    path: "/workflows/events",
    status: response.status,
    type: "backend_request",
  });
  if (!response.ok) {
    throw new Error(`/workflows/events returned ${response.status}`);
  }
  return workflowEventStreamReader(response.body.getReader());
}

function workflowEventStreamReader(reader) {
  const decoder = new TextDecoder();
  let buffered = "";
  return {
    close: async () => {
      await reader.cancel().catch(() => {});
    },
    next: async () => {
      for (;;) {
        const read = await readWorkflowStreamChunk(reader);
        if (read.done) {
          throw new Error("workflow event stream closed before an event was received");
        }
        buffered += decoder.decode(read.value, { stream: true });
        const event = workflowEventFromBufferedSSE(buffered);
        if (event) {
          return event;
        }
      }
    },
  };
}

async function readWorkflowStreamChunk(reader) {
  const timeout = delay(15_000).then(() => ({ timeout: true }));
  const read = await Promise.race([reader.read(), timeout]);
  if (read.timeout) {
    throw new Error("timed out waiting for workflow event stream");
  }
  return read;
}

function workflowEventFromBufferedSSE(buffered) {
  const normalized = buffered.replaceAll("\r\n", "\n");
  const boundary = normalized.indexOf("\n\n");
  if (boundary < 0) {
    return null;
  }
  const block = normalized.slice(0, boundary);
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length))
    .join("\n");
  return data === "" ? null : JSON.parse(data);
}

async function assertFreshWorkflowConversations(backend, workspaceId, execution, nodeIds) {
  await assertWorkflowChatsHidden(backend, workspaceId);
  for (const nodeId of nodeIds) {
    await assertFreshNodeConversations(backend, workspaceId, execution, nodeId);
  }
}

async function assertWorkflowChatsHidden(backend, workspaceId) {
  const visible = await backend.post("/chat/conversations/list", { workspaceId });
  const leaked = visible.conversations.filter(
    (item) => item.conversation.internal || item.conversation.workflow !== null,
  );
  if (leaked.length !== 0) {
    throw new Error(`workflow-owned chats leaked into master list: ${JSON.stringify(visible)}`);
  }
}

async function assertFreshNodeConversations(backend, workspaceId, execution, nodeId) {
  const executions = nodeExecutions(execution, nodeId);
  const conversationIds = executions.map((nodeExecution) =>
    runnerRef(nodeExecution, "chat.conversation"),
  );
  const distinct = new Set(conversationIds);
  if (executions.length !== 2 || distinct.size !== 2) {
    throw new Error(
      `${nodeId} conversation ids = ${JSON.stringify(conversationIds)}, want two distinct chats`,
    );
  }
  for (const nodeExecution of executions) {
    await assertWorkflowConversationMetadata(backend, workspaceId, execution.id, nodeExecution);
  }
}

async function assertWorkflowConversationMetadata(
  backend,
  workspaceId,
  executionId,
  nodeExecution,
) {
  const conversationId = runnerRef(nodeExecution, "chat.conversation");
  const page = await backend.post("/chat/messages/page", {
    beforeOrdinal: 0,
    conversationId,
    limit: 20,
    workspaceId,
  });
  if (!page.conversation.internal || !page.conversation.workflow) {
    throw new Error(`conversation ${conversationId} is not workflow-owned/internal`);
  }
  if (
    page.conversation.workflow.executionId !== executionId ||
    page.conversation.workflow.nodeExecutionId !== nodeExecution.id
  ) {
    throw new Error(`conversation ${conversationId} workflow metadata mismatch`);
  }
}

function assertStructuredPhase4Routing(execution) {
  const consolidators = nodeExecutions(execution, "consolidator");
  const decisions = consolidators.map((nodeExecution) =>
    signalValue(nodeExecution.result?.signals ?? [], "decision"),
  );
  if (decisions[0] !== "continue" || decisions[1] !== "exit") {
    throw new Error(
      `consolidator decisions = ${JSON.stringify(decisions)}, want continue then exit`,
    );
  }
  const actionable = consolidators.map((nodeExecution) =>
    signalValue(nodeExecution.result?.signals ?? [], "actionable"),
  );
  if (actionable[0] !== "yes" || actionable[1] !== "no") {
    throw new Error(`consolidator actionable signals = ${JSON.stringify(actionable)}`);
  }
}

function assertWorkflowTerminal(execution, status, terminalReason) {
  if (execution.status !== status || execution.terminalReason !== terminalReason) {
    throw new Error(
      `workflow ${execution.id} terminal = ${execution.status}/${execution.terminalReason}, want ${status}/${terminalReason}`,
    );
  }
}

function assertNodeExecutionCount(execution, nodeId, expected) {
  const count = nodeExecutions(execution, nodeId).length;
  if (count !== expected) {
    throw new Error(`node ${nodeId} executions = ${count}, want ${expected}`);
  }
}

function assertNodeStatus(execution, nodeId, expected) {
  const nodeExecution = latestNodeExecution(execution, nodeId);
  if (nodeExecution.status !== expected) {
    throw new Error(`${nodeId} status = ${nodeExecution.status}, want ${expected}`);
  }
}

function assertWorkflowEventTypes(events, expectedTypes) {
  for (const type of expectedTypes) {
    if (!events.some((event) => event.type === type)) {
      throw new Error(`workflow event ${type} was not recorded`);
    }
  }
}

function assertParallelReviewersStartedBeforeCompletion(events) {
  const startOrdinals = reviewerNodeIds.map((nodeId) =>
    firstEventOrdinal(events, nodeId, "workflow.action.started"),
  );
  const completionOrdinals = reviewerNodeIds.map((nodeId) =>
    firstEventOrdinal(events, nodeId, "workflow.action.completed"),
  );
  if (startOrdinals.some((ordinal) => ordinal === null)) {
    throw new Error("parallel reviewer start events were not recorded");
  }
  const firstCompletion = Math.min(...completionOrdinals.filter((ordinal) => ordinal !== null));
  if (!Number.isFinite(firstCompletion)) {
    throw new Error("parallel reviewer completion events were not recorded");
  }
  if (startOrdinals.some((ordinal) => ordinal > firstCompletion)) {
    throw new Error("a reviewer completed before every reviewer had started");
  }
}

function firstEventOrdinal(events, nodeId, type) {
  return events.find((event) => event.nodeId === nodeId && event.type === type)?.ordinal ?? null;
}

function nodeExecutions(execution, nodeId) {
  return execution.nodeExecutions.filter((nodeExecution) => nodeExecution.nodeId === nodeId);
}

function latestNodeExecution(execution, nodeId) {
  return nodeExecutions(execution, nodeId).at(-1) ?? null;
}

function projectedNode(projection, nodeId) {
  const node = projection?.nodes.find((candidate) => candidate.id === nodeId) ?? null;
  if (!node) {
    throw new Error(`projected node ${nodeId} was not found`);
  }
  return node;
}

function runnerRef(nodeExecution, kind) {
  return nodeExecution?.runnerRefs.find((ref) => ref.kind === kind)?.id ?? "";
}

function signalValue(signals, name) {
  return signals.find((signal) => signal.name === name)?.value ?? "";
}

function phase4WorkflowGraph({ limitPolicy, maxIterations }) {
  return {
    nodes: [
      workflowControlNode("start", "start"),
      workflowCodexNode("review_a", "phase4 reviewer a workflow", true),
      workflowCodexNode("review_b", "phase4 reviewer b workflow", true),
      workflowCodexNode("review_c", "phase4 reviewer c workflow", true),
      workflowANDJoinNode(),
      workflowCodexNode("consolidator", "phase4 consolidator workflow", true),
      workflowXORRouteNode(),
      workflowCodexNode("fix", "phase4 fix workflow", true),
      workflowLoopGuardNode({ limitPolicy, maxIterations }),
      workflowControlNode("end", "end"),
    ],
    edges: phase4WorkflowEdges(),
  };
}

function workflowANDJoinNode() {
  return {
    action: null,
    gateway: {
      requiredIncoming: ["review_a_join", "review_b_join", "review_c_join"],
    },
    id: "join",
    kind: "gateway.and",
    loopGuard: null,
    title: "Join reviewers",
  };
}

function workflowXORRouteNode() {
  return {
    action: null,
    gateway: { requiredIncoming: [] },
    id: "route",
    kind: "gateway.xor",
    loopGuard: null,
    title: "Route findings",
  };
}

function workflowLoopGuardNode({ limitPolicy, maxIterations }) {
  return {
    action: null,
    gateway: null,
    id: "guard",
    kind: "loop.guard",
    loopGuard: {
      continueCondition: signalCondition("consolidator", "decision", "continue"),
      exitCondition: signalCondition("consolidator", "decision", "exit"),
      limitPolicy,
      maxIterations,
    },
    title: "Loop guard",
  };
}

function phase4WorkflowEdges() {
  return [
    workflowEdge("start_review_a", "start", "review_a"),
    workflowEdge("start_review_b", "start", "review_b"),
    workflowEdge("start_review_c", "start", "review_c"),
    workflowEdge("review_a_join", "review_a", "join"),
    workflowEdge("review_b_join", "review_b", "join"),
    workflowEdge("review_c_join", "review_c", "join"),
    workflowEdge("join_consolidator", "join", "consolidator"),
    workflowEdge("consolidator_route", "consolidator", "route"),
    workflowEdge("route_fix", "route", "fix", {
      condition: signalCondition("consolidator", "decision", "continue"),
    }),
    workflowEdge("route_end", "route", "end", {
      condition: signalCondition("consolidator", "decision", "exit"),
    }),
    workflowEdge("fix_guard", "fix", "guard"),
    workflowEdge("guard_review_a", "guard", "review_a", { kind: "loop_continue" }),
    workflowEdge("guard_review_b", "guard", "review_b", { kind: "loop_continue" }),
    workflowEdge("guard_review_c", "guard", "review_c", { kind: "loop_continue" }),
    workflowEdge("guard_end", "guard", "end", { kind: "loop_exit" }),
  ];
}

function cancellationWorkflowGraph() {
  return {
    nodes: [
      workflowControlNode("start", "start"),
      workflowCodexNode("work", "cancel active workflow", true),
      workflowControlNode("end", "end"),
    ],
    edges: [workflowEdge("start_work", "start", "work"), workflowEdge("work_end", "work", "end")],
  };
}

function approvalWorkflowGraph() {
  return {
    nodes: [
      workflowControlNode("start", "start"),
      workflowCodexNode("work", "command approval workflow", true),
      workflowControlNode("end", "end"),
    ],
    edges: [workflowEdge("start_work", "start", "work"), workflowEdge("work_end", "work", "end")],
  };
}

function lateGatewayArrivalWorkflowGraph() {
  return {
    nodes: [
      workflowControlNode("start", "start"),
      workflowCodexNode("fast", "workflow result action", true),
      workflowCodexNode("slow", "workflow hold for queue and steering", true),
      workflowGatewayNode("route", "gateway.or"),
      workflowControlNode("end", "end"),
    ],
    edges: [
      workflowEdge("start_fast", "start", "fast"),
      workflowEdge("start_slow", "start", "slow"),
      workflowEdge("fast_route", "fast", "route"),
      workflowEdge("slow_route", "slow", "route"),
      workflowEdge("route_end", "route", "end"),
    ],
  };
}

function workflowControlNode(id, kind) {
  return {
    action: null,
    gateway: null,
    id,
    kind,
    loopGuard: null,
    title: id,
  };
}

function workflowGatewayNode(id, kind) {
  return {
    action: null,
    gateway: { requiredIncoming: [] },
    id,
    kind,
    loopGuard: null,
    title: id,
  };
}

function workflowCodexNode(id, prompt, freshConversation) {
  return {
    action: {
      codex: {
        freshConversation,
        model: "",
        prompt,
        reasoningEffort: "",
      },
      kind: "agent.codex",
    },
    gateway: null,
    id,
    kind: "action",
    loopGuard: null,
    title: id,
  };
}

function workflowEdge(id, fromNodeId, toNodeId, options = {}) {
  return {
    condition: options.condition ?? null,
    fromNodeId,
    id,
    kind: options.kind ?? "normal",
    toNodeId,
  };
}

function signalCondition(nodeId, signalName, signalValue) {
  return {
    exitCode: null,
    invert: false,
    kind: "action_signal",
    nodeId,
    signalName,
    signalValue,
    status: null,
  };
}
