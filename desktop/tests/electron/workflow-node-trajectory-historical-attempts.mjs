import { driverCallExpression } from "./cdp-client.mjs";
import { appendWorkflowState, waitForState } from "./chat-workflow-harness.mjs";

const historicalTrajectoryPrompt = "phase4 consolidator workflow";

export async function assertHistoricalAttemptWorkflowNodeTrajectoryContract({
  client,
  ensureWorkflowRunProjection,
  openWorkflowGraphForDefinition,
  openWorkflowNodeRunDetails,
  recordingDir,
  startWorkflowRunFromToolbar,
  waitForWorkflowExecution,
  waitForWorkflowNodeDetailsUILayout,
  workspaceId,
}) {
  const historicalGraph = historicalAttemptWorkflowGraph();
  const validation = await rendererWorkflow(client, "validateDefinition", [
    workspaceId,
    historicalGraph,
  ]);
  if (!validation.valid) {
    throw new Error(`historical trajectory workflow graph invalid: ${JSON.stringify(validation)}`);
  }
  const definition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Node trajectory historical attempts",
    "Verifies historical workflow node attempt trajectory paging.",
    historicalGraph,
  ]);
  const graphSurfaceId = await openWorkflowGraphForDefinition(client, workspaceId, definition.id);
  const startedRun = await startWorkflowRunFromToolbar(
    client,
    graphSurfaceId,
    workspaceId,
    definition.id,
  );
  const completed = await waitForWorkflowExecution(
    client,
    workspaceId,
    startedRun.executionId,
    (execution) =>
      execution.status === "completed" && nodeExecutionsForNode(execution, "activity").length >= 2,
  );
  const attempts = nodeExecutionsForNode(completed, "activity").sort(
    (left, right) => left.attempt - right.attempt || left.iteration - right.iteration,
  );
  const firstAttempt = attempts[0];
  const secondAttempt = attempts[1];
  if (!firstAttempt || !secondAttempt) {
    throw new Error(
      `historical workflow missing repeated activity attempts: ${JSON.stringify(completed)}`,
    );
  }
  const firstRunRef = runnerRef(firstAttempt, "chat.run");
  const secondRunRef = runnerRef(secondAttempt, "chat.run");
  if (!firstRunRef || !secondRunRef || firstRunRef.id === secondRunRef.id) {
    throw new Error(
      `historical workflow attempts missing distinct run refs: ${JSON.stringify(attempts)}`,
    );
  }

  const firstPage = await readWorkflowNodeTrajectoryPage(client, {
    executionId: completed.id,
    nodeExecutionId: firstAttempt.id,
    outputLimit: 5,
    transcriptLimit: 1,
    workspaceId,
  });
  assertHistoricalAttemptTrajectoryPage(firstPage, firstAttempt, firstRunRef.id);
  if (!firstPage.hasMoreOlder || firstPage.olderBeforeBlockOrdinal <= 0) {
    throw new Error(
      `historical first attempt missing older cursor: ${JSON.stringify({
        hasMoreOlder: firstPage.hasMoreOlder,
        olderBeforeBlockOrdinal: firstPage.olderBeforeBlockOrdinal,
      })}`,
    );
  }
  const firstOlderPage = await readWorkflowNodeTrajectoryPage(client, {
    beforeBlockOrdinal: firstPage.olderBeforeBlockOrdinal,
    executionId: completed.id,
    nodeExecutionId: firstAttempt.id,
    outputLimit: 5,
    transcriptLimit: 20,
    workspaceId,
  });
  assertHistoricalAttemptTrajectoryPage(firstOlderPage, firstAttempt, firstRunRef.id);

  const secondPage = await readWorkflowNodeTrajectoryPage(client, {
    executionId: completed.id,
    nodeExecutionId: secondAttempt.id,
    outputLimit: 5,
    transcriptLimit: 20,
    workspaceId,
  });
  assertHistoricalAttemptTrajectoryPage(secondPage, secondAttempt, secondRunRef.id);
  assertTrajectoryPagesDoNotIncludeRun([firstPage, firstOlderPage], secondRunRef.id);
  assertTrajectoryPagesDoNotIncludeRun([secondPage], firstRunRef.id);

  const graphSnapshot = await ensureWorkflowRunProjection(
    client,
    startedRun.graphSurfaceId,
    definition.id,
    completed.id,
  );
  await openWorkflowNodeRunDetails(
    client,
    startedRun.graphSurfaceId,
    graphSnapshot,
    "activity",
    firstAttempt.id,
  );
  await waitForWorkflowNodeDetailsUILayout(
    client,
    workspaceId,
    completed.id,
    "activity",
    firstAttempt.id,
  );
  await waitForState(
    client,
    driverCallExpression("workflowNodeTrajectoryState"),
    (state) =>
      state.trajectoryPresent &&
      state.nodeExecutionId === firstAttempt.id &&
      state.runId === firstRunRef.id,
  );
  await appendWorkflowState(recordingDir, {
    executionId: completed.id,
    firstNodeExecutionId: firstAttempt.id,
    firstRunId: firstRunRef.id,
    secondNodeExecutionId: secondAttempt.id,
    secondRunId: secondRunRef.id,
    type: "workflow_node_trajectory_historical_attempt_verified",
  });
}

async function readWorkflowNodeTrajectoryPage(
  client,
  {
    beforeBlockOrdinal = 0,
    executionId,
    nodeExecutionId,
    outputLimit,
    transcriptLimit,
    workspaceId,
  },
) {
  return rendererWorkflow(client, "readNodeTrajectory", [
    {
      beforeBlockOrdinal,
      executionId,
      nodeExecutionId,
      outputLimit,
      transcriptLimit,
      workspaceId,
    },
  ]);
}

function assertHistoricalAttemptTrajectoryPage(page, nodeExecution, runId) {
  if (
    page.scope.nodeExecutionId !== nodeExecution.id ||
    page.scope.nodeId !== nodeExecution.nodeId ||
    page.scope.attempt !== nodeExecution.attempt ||
    page.scope.iteration !== nodeExecution.iteration ||
    page.runId !== runId ||
    page.run.id !== runId
  ) {
    throw new Error(
      `historical trajectory scope mismatch: ${JSON.stringify({
        nodeExecution,
        pageScope: page.scope,
        runId,
        trajectoryRunId: page.runId,
      })}`,
    );
  }
  if (!page.blocks.every((block) => block.runId === runId)) {
    throw new Error(
      `historical trajectory blocks crossed run scope: ${JSON.stringify({
        blocks: page.blocks,
        runId,
      })}`,
    );
  }
}

function assertTrajectoryPagesDoNotIncludeRun(pages, runId) {
  const matchingBlocks = pages.flatMap((page) =>
    page.blocks.filter((block) => block.runId === runId),
  );
  if (matchingBlocks.length > 0) {
    throw new Error(
      `historical trajectory page included unrelated run ${runId}: ${JSON.stringify(matchingBlocks)}`,
    );
  }
}

function historicalAttemptWorkflowGraph() {
  return {
    agentDefaults: { model: "", permission: null, reasoningEffort: null },
    edges: [
      workflowEdge("start_activity", "start", "activity"),
      workflowEdge("activity_guard", "activity", "guard"),
      workflowEdge("guard_activity", "guard", "activity", { kind: "loop_continue" }),
      workflowEdge("guard_end", "guard", "end", { kind: "loop_exit" }),
    ],
    layout: {
      nodes: [
        { nodeId: "start", x: -320, y: 0 },
        { nodeId: "activity", x: 0, y: 120 },
        { nodeId: "guard", x: 280, y: 120 },
        { nodeId: "end", x: 560, y: 0 },
      ],
    },
    nodes: [
      workflowControlNode("start", "start", "Start"),
      workflowCodexNode("activity", "Activity", historicalTrajectoryPrompt),
      workflowLoopGuardNode("guard", "activity"),
      workflowControlNode("end", "end", "End"),
    ],
  };
}

function workflowControlNode(id, kind, title) {
  return {
    action: null,
    gateway: null,
    id,
    kind,
    loopGuard: null,
    title,
  };
}

function workflowCodexNode(id, title, prompt) {
  return {
    action: {
      codex: {
        freshConversation: true,
        prompt,
        settings: { model: "", permission: null, reasoningEffort: null },
      },
      kind: "agent.codex",
    },
    gateway: null,
    id,
    kind: "action",
    loopGuard: null,
    title,
  };
}

function workflowLoopGuardNode(id, actionNodeId) {
  return {
    action: null,
    gateway: null,
    id,
    kind: "loop.guard",
    loopGuard: {
      continueCondition: workflowSignalCondition(actionNodeId, "decision", "continue"),
      exitCondition: workflowSignalCondition(actionNodeId, "decision", "exit"),
      limitPolicy: "failed",
      maxIterations: 3,
    },
    title: "Loop guard",
  };
}

function workflowSignalCondition(nodeId, signalName, signalValue) {
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

function workflowEdge(id, fromNodeId, toNodeId, options = {}) {
  return {
    condition: options.condition ?? null,
    fromNodeId,
    id,
    kind: options.kind ?? "normal",
    toNodeId,
  };
}

function nodeExecutionsForNode(execution, nodeId) {
  return execution.nodeExecutions.filter((node) => node.nodeId === nodeId);
}

function runnerRef(nodeExecution, kind) {
  return nodeExecution.runnerRefs.find((ref) => ref.kind === kind) ?? null;
}

async function rendererWorkflow(client, method, args) {
  return client.evaluate(
    `window.setta.workflow[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}
