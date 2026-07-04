import { rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import {
  appendWorkflowState,
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  createChat,
  createFixture,
  failureWithLogs,
  launchContext,
  openWorkspace,
  stopElectron,
  waitForBackendState,
} from "./chat-workflow-harness.mjs";
import { activityWorkflowGraph } from "./workflow-activity-feed-fixtures.mjs";

const trajectoryPrompt = "chat activity projection reload workflow";
const stoppableTrajectoryPrompt = "workflow hold for queue and steering";

export async function runWorkflowNodeTrajectoryContractWorkflowLaunch(results, { recordingRoot }) {
  const fixture = await createFixture("workflow-node-trajectory-contract");
  const recordingDir = join(recordingRoot, "workflow-node-trajectory-contract");
  const context = await launchContext(fixture, recordingDir);
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    await createChat(context.client, backend, workspaceId);
    const graph = activityWorkflowGraph(trajectoryPrompt);
    const validation = await rendererWorkflow(context.client, "validateDefinition", [
      workspaceId,
      graph,
    ]);
    if (!validation.valid) {
      throw new Error(`trajectory workflow graph invalid: ${JSON.stringify(validation)}`);
    }
    const definition = await rendererWorkflow(context.client, "createDefinition", [
      workspaceId,
      "Node trajectory contract",
      "Verifies workflow node-scoped chat trajectory contracts.",
      graph,
    ]);
    const started = await rendererWorkflow(context.client, "startExecution", [
      workspaceId,
      definition.id,
    ]);
    const completed = await waitForWorkflowExecution(
      context.client,
      workspaceId,
      started.id,
      (execution) => execution.status === "completed",
    );
    const activityNode = latestNodeExecution(completed, "activity");
    if (!activityNode) {
      throw new Error(`completed workflow missing activity node: ${JSON.stringify(completed)}`);
    }
    const trajectory = await rendererWorkflow(context.client, "readNodeTrajectory", [
      {
        beforeBlockOrdinal: 0,
        executionId: completed.id,
        nodeExecutionId: activityNode.id,
        outputLimit: 2,
        transcriptLimit: 2,
        workspaceId,
      },
    ]);

    assertTrajectoryPage(trajectory, {
      definition,
      execution: completed,
      nodeExecution: activityNode,
      workspaceId,
    });
    await appendWorkflowState(recordingDir, {
      executionId: completed.id,
      nodeExecutionId: activityNode.id,
      runId: trajectory.runId,
      type: "workflow_node_trajectory_contract_verified",
    });

    const stopGraph = activityWorkflowGraph(stoppableTrajectoryPrompt);
    const stopValidation = await rendererWorkflow(context.client, "validateDefinition", [
      workspaceId,
      stopGraph,
    ]);
    if (!stopValidation.valid) {
      throw new Error(
        `stoppable trajectory workflow graph invalid: ${JSON.stringify(stopValidation)}`,
      );
    }
    const stopDefinition = await rendererWorkflow(context.client, "createDefinition", [
      workspaceId,
      "Node trajectory stop contract",
      "Verifies workflow node-scoped stop contracts.",
      stopGraph,
    ]);
    const stopStarted = await rendererWorkflow(context.client, "startExecution", [
      workspaceId,
      stopDefinition.id,
    ]);
    const running = await waitForWorkflowExecution(
      context.client,
      workspaceId,
      stopStarted.id,
      workflowActivityNodeRunning,
    );
    const runningNode = latestNodeExecution(running, "activity");
    if (!runningNode) {
      throw new Error(`running workflow missing activity node: ${JSON.stringify(running)}`);
    }
    const activeTrajectory = await waitForWorkflowNodeTrajectory(
      context.client,
      workspaceId,
      running.id,
      runningNode.id,
      (page) => page.capabilities.canStopRun,
    );
    assertStoppableTrajectoryPage(activeTrajectory, {
      definition: stopDefinition,
      execution: running,
      nodeExecution: runningNode,
      workspaceId,
    });

    const stopped = await rendererWorkflow(context.client, "stopNodeRun", [
      {
        executionId: running.id,
        nodeExecutionId: runningNode.id,
        workspaceId,
      },
    ]);
    assertStoppedWorkflowExecution(stopped, runningNode.id);
    const terminal = await waitForWorkflowExecution(
      context.client,
      workspaceId,
      running.id,
      (execution) => {
        const node = nodeExecutionById(execution, runningNode.id);
        return execution.status === "cancelled" && node?.status === "cancelled";
      },
    );
    const terminalTrajectory = await rendererWorkflow(context.client, "readNodeTrajectory", [
      {
        beforeBlockOrdinal: 0,
        executionId: terminal.id,
        nodeExecutionId: runningNode.id,
        outputLimit: 5,
        transcriptLimit: 20,
        workspaceId,
      },
    ]);
    assertStoppedTrajectoryPage(terminalTrajectory, runningNode.id);
    await appendWorkflowState(recordingDir, {
      executionId: terminal.id,
      nodeExecutionId: runningNode.id,
      runId: terminalTrajectory.runId,
      type: "workflow_node_trajectory_stop_contract_verified",
    });

    await assertSteerWorkflowNodeTrajectoryContract(context.client, workspaceId, recordingDir);
    await assertRetryWorkflowNodeTrajectoryContract(context.client, workspaceId, recordingDir);
  } catch (error) {
    failure = error;
    await captureScreenshot(context.client, join(recordingDir, "failure.png")).catch(() => {});
  } finally {
    context.client?.close();
    await stopElectron(context.electron);
    await rm(fixture.tempRoot, { force: true, recursive: true });
  }

  if (failure) {
    throw failureWithLogs(failure, context.electron.logs);
  }
  await assertRecordingEvidence(recordingDir, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/conversations/list",
      "/workflows/definitions/validate",
      "/workflows/definitions/create",
      "/workflows/executions/start",
      "/workflows/executions/read",
      "/workflows/nodes/trajectory",
      "/chat/runs/reconcile",
      "/workflows/nodes/runs/retry-liveness",
      "/workflows/nodes/runs/steer",
      "/workflows/nodes/runs/stop",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "workflow:validate-definition",
      "workflow:create-definition",
      "workflow:start-execution",
      "workflow:read-execution",
      "workflow:read-node-trajectory",
      "chat:reconcile-runs",
      "workflow:retry-node-run-liveness",
      "workflow:steer-node-run",
      "workflow:stop-node-run",
    ],
  });
  results.push("workflow-node-trajectory-contract");
  process.stdout.write("Electron chat workflow passed: workflow-node-trajectory-contract\n");
}

async function assertSteerWorkflowNodeTrajectoryContract(client, workspaceId, recordingDir) {
  const steerGraph = activityWorkflowGraph(stoppableTrajectoryPrompt);
  const steerValidation = await rendererWorkflow(client, "validateDefinition", [
    workspaceId,
    steerGraph,
  ]);
  if (!steerValidation.valid) {
    throw new Error(
      `steerable trajectory workflow graph invalid: ${JSON.stringify(steerValidation)}`,
    );
  }
  const steerDefinition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Node trajectory steering contract",
    "Verifies workflow node-scoped steering contracts.",
    steerGraph,
  ]);
  const steerStarted = await rendererWorkflow(client, "startExecution", [
    workspaceId,
    steerDefinition.id,
  ]);
  const steerRunning = await waitForWorkflowExecution(
    client,
    workspaceId,
    steerStarted.id,
    workflowActivityNodeRunning,
  );
  const steerNode = latestNodeExecution(steerRunning, "activity");
  if (!steerNode) {
    throw new Error(`steering workflow missing activity node: ${JSON.stringify(steerRunning)}`);
  }
  const steerTrajectory = await waitForWorkflowNodeTrajectory(
    client,
    workspaceId,
    steerStarted.id,
    steerNode.id,
    (page) => page.capabilities.canSteer,
  );
  const steered = await rendererWorkflow(client, "steerNodeRun", [
    {
      executionId: steerStarted.id,
      input: textInput("finish node trajectory steering"),
      nodeExecutionId: steerNode.id,
      workspaceId,
    },
  ]);
  assertSteeringResult(steered, steerTrajectory);
  const steerCompleted = await waitForWorkflowExecution(
    client,
    workspaceId,
    steerStarted.id,
    (execution) => execution.status === "completed",
  );
  const steeredTrajectory = await rendererWorkflow(client, "readNodeTrajectory", [
    {
      beforeBlockOrdinal: 0,
      executionId: steerCompleted.id,
      nodeExecutionId: steerNode.id,
      outputLimit: 5,
      transcriptLimit: 20,
      workspaceId,
    },
  ]);
  assertSteeredTrajectoryPage(steeredTrajectory, steerNode.id);
  await appendWorkflowState(recordingDir, {
    executionId: steerCompleted.id,
    nodeExecutionId: steerNode.id,
    runId: steeredTrajectory.runId,
    type: "workflow_node_trajectory_steering_contract_verified",
  });
}

async function assertRetryWorkflowNodeTrajectoryContract(client, workspaceId, recordingDir) {
  const retryGraph = activityWorkflowGraph(stoppableTrajectoryPrompt);
  const retryValidation = await rendererWorkflow(client, "validateDefinition", [
    workspaceId,
    retryGraph,
  ]);
  if (!retryValidation.valid) {
    throw new Error(
      `retryable trajectory workflow graph invalid: ${JSON.stringify(retryValidation)}`,
    );
  }
  const retryDefinition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Node trajectory retry liveness contract",
    "Verifies workflow node-scoped liveness retry contracts.",
    retryGraph,
  ]);
  const retryStarted = await rendererWorkflow(client, "startExecution", [
    workspaceId,
    retryDefinition.id,
  ]);
  const retryRunning = await waitForWorkflowExecution(
    client,
    workspaceId,
    retryStarted.id,
    workflowActivityNodeRunning,
  );
  const retryNode = latestNodeExecution(retryRunning, "activity");
  if (!retryNode) {
    throw new Error(`retry workflow missing activity node: ${JSON.stringify(retryRunning)}`);
  }
  const activeTrajectory = await waitForWorkflowNodeTrajectory(
    client,
    workspaceId,
    retryStarted.id,
    retryNode.id,
    (page) => page.capabilities.canStopRun && page.activeRunLiveness?.status === "attached",
  );
  const streamReconcile = await rendererChat(client, "reconcileRuns", [
    {
      conversationId: activeTrajectory.conversationId,
      reason: "stream_resync",
      workspaceId,
    },
  ]);
  assertWorkflowNodeLivenessResult(streamReconcile.result, activeTrajectory.runId, "stream_resync");

  const retryableTrajectory = await waitForWorkflowNodeTrajectory(
    client,
    workspaceId,
    retryStarted.id,
    retryNode.id,
    (page) => page.capabilities.canRetryLiveness,
  );
  assertRetryableTrajectoryPage(retryableTrajectory, activeTrajectory.runId, "stream_resync");
  const retried = await rendererWorkflow(client, "retryNodeRunLiveness", [
    {
      executionId: retryStarted.id,
      nodeExecutionId: retryNode.id,
      workspaceId,
    },
  ]);
  assertWorkflowNodeLivenessResult(retried, activeTrajectory.runId, "user_retry");
  const userRetryTrajectory = await waitForWorkflowNodeTrajectory(
    client,
    workspaceId,
    retryStarted.id,
    retryNode.id,
    (page) => page.activeRunLiveness?.reason === "user_retry",
  );
  assertRetryableTrajectoryPage(userRetryTrajectory, activeTrajectory.runId, "user_retry");

  const stopped = await rendererWorkflow(client, "stopNodeRun", [
    {
      executionId: retryStarted.id,
      nodeExecutionId: retryNode.id,
      workspaceId,
    },
  ]);
  assertStoppedWorkflowExecution(stopped, retryNode.id);
  await appendWorkflowState(recordingDir, {
    executionId: retryStarted.id,
    nodeExecutionId: retryNode.id,
    runId: userRetryTrajectory.runId,
    type: "workflow_node_trajectory_retry_liveness_contract_verified",
  });
}

async function waitForWorkflowExecution(client, workspaceId, executionId, isReady) {
  return waitForBackendState(
    async () => rendererWorkflow(client, "readExecution", [workspaceId, executionId]),
    isReady,
  );
}

async function waitForWorkflowNodeTrajectory(
  client,
  workspaceId,
  executionId,
  nodeExecutionId,
  isReady,
) {
  return waitForBackendState(
    async () =>
      rendererWorkflow(client, "readNodeTrajectory", [
        {
          beforeBlockOrdinal: 0,
          executionId,
          nodeExecutionId,
          outputLimit: 5,
          transcriptLimit: 20,
          workspaceId,
        },
      ]),
    isReady,
  );
}

function assertRetryableTrajectoryPage(trajectory, runId, reason) {
  const evidence = retryableTrajectoryEvidence(trajectory, runId, reason);
  const failed = Object.entries(evidence)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length > 0) {
    throw new Error(
      `retryable trajectory mismatch: ${JSON.stringify({ failed, reason, runId, trajectory })}`,
    );
  }
}

function retryableTrajectoryEvidence(trajectory, runId, reason) {
  return {
    activeRunMatches: trajectory.activeRun?.id === runId,
    livenessMatches: trajectory.activeRunLiveness?.runId === runId,
    livenessReasonMatches: trajectory.activeRunLiveness?.reason === reason,
    retryCapabilityEnabled: trajectory.capabilities.canRetryLiveness === true,
    runMatches: trajectory.runId === runId,
    stopCapabilityEnabled: trajectory.capabilities.canStopRun === true,
    stillRetryable: trajectory.activeRunLiveness?.retryable === true,
  };
}

function assertWorkflowNodeLivenessResult(result, runId, reason) {
  const liveness = result.runs?.find((candidate) => candidate.runId === runId);
  if (!liveness || liveness.reason !== reason || liveness.retryable !== true) {
    throw new Error(
      `workflow node liveness result mismatch: ${JSON.stringify({ reason, result, runId })}`,
    );
  }
}

function assertTrajectoryPage(trajectory, { definition, execution, nodeExecution, workspaceId }) {
  const conversationRef = runnerRef(nodeExecution, "chat.conversation");
  const runRef = runnerRef(nodeExecution, "chat.run");
  assertTrajectoryRunnerRefs(conversationRef, runRef, nodeExecution);
  assertTrajectoryScope(trajectory, {
    definition,
    execution,
    nodeExecution,
    workspaceId,
  });
  assertTrajectoryRunState(trajectory, conversationRef, runRef);
  assertTrajectoryBlocks(trajectory, runRef);
  const outputPage = assertTrajectoryOutputPage(trajectory, runRef);
  assertTrajectoryOutputIDs(trajectory, outputPage);
  assertTrajectoryCapabilities(trajectory);
}

function assertStoppableTrajectoryPage(
  trajectory,
  { definition, execution, nodeExecution, workspaceId },
) {
  const conversationRef = runnerRef(nodeExecution, "chat.conversation");
  const runRef = runnerRef(nodeExecution, "chat.run");
  assertTrajectoryRunnerRefs(conversationRef, runRef, nodeExecution);
  assertTrajectoryScope(trajectory, {
    definition,
    execution,
    nodeExecution,
    workspaceId,
  });
  assertStoppableTrajectoryRunState(trajectory, conversationRef, runRef);
  assertStoppableTrajectoryCapabilities(trajectory);
}

function assertStoppableTrajectoryRunState(trajectory, conversationRef, runRef) {
  const state = {
    activeRunId: trajectory.activeRun?.id ?? "",
    cancellable: trajectory.activeRunLiveness?.cancellable === true,
    conversationId: trajectory.conversationId,
    livenessRunId: trajectory.activeRunLiveness?.runId ?? "",
    runId: trajectory.runId,
    runStatus: trajectory.run.status,
    trajectoryRunId: trajectory.run.id,
  };
  const expected = {
    conversationId: conversationRef.id,
    runId: runRef.id,
  };
  if (!stoppableTrajectoryRunStateMatches(state, expected)) {
    throw new Error(
      `stoppable trajectory mismatch: ${JSON.stringify({ expected, state, trajectory })}`,
    );
  }
}

function stoppableTrajectoryRunStateMatches(state, expected) {
  return (
    state.conversationId === expected.conversationId &&
    state.runId === expected.runId &&
    state.trajectoryRunId === expected.runId &&
    state.runStatus === "running" &&
    state.activeRunId === expected.runId &&
    state.livenessRunId === expected.runId &&
    state.cancellable
  );
}

function assertStoppableTrajectoryCapabilities(trajectory) {
  const capabilities = trajectory.capabilities;
  if (
    !capabilities.canStopRun ||
    capabilities.canRetryLiveness ||
    !capabilities.canSteer ||
    capabilities.canSubmitApproval
  ) {
    throw new Error(
      `stoppable trajectory capabilities mismatch: ${JSON.stringify(trajectory.capabilities)}`,
    );
  }
}

function assertSteeredTrajectoryPage(trajectory, nodeExecutionId) {
  if (
    trajectory.scope.nodeExecutionId !== nodeExecutionId ||
    trajectory.run.status !== "completed" ||
    trajectory.activeRun !== null ||
    trajectory.activeRunLiveness !== null ||
    trajectory.capabilities.canSteer ||
    !trajectory.blocks.some(
      (block) =>
        block.assistantText?.text?.includes("Steered with finish node trajectory steering.") ===
        true,
    )
  ) {
    throw new Error(`steered trajectory mismatch: ${JSON.stringify(trajectory)}`);
  }
}

function assertSteeringResult(steered, steerTrajectory) {
  if (
    steered.run.id !== steerTrajectory.runId ||
    steered.userMessage.runId !== steerTrajectory.runId ||
    steered.userMessage.delivery !== "steering"
  ) {
    throw new Error(
      `workflow node steering result mismatch: ${JSON.stringify({ steered, steerTrajectory })}`,
    );
  }
}

function assertStoppedTrajectoryPage(trajectory, nodeExecutionId) {
  assertStoppedTrajectoryRunState(trajectory, nodeExecutionId);
  assertStoppedTrajectoryActiveState(trajectory);
  assertStoppedTrajectoryCapabilities(trajectory);
}

function assertStoppedTrajectoryRunState(trajectory, nodeExecutionId) {
  if (
    trajectory.scope.nodeExecutionId !== nodeExecutionId ||
    trajectory.run.status !== "cancelled"
  ) {
    throw new Error(`stopped trajectory scope/run mismatch: ${JSON.stringify(trajectory)}`);
  }
}

function assertStoppedTrajectoryActiveState(trajectory) {
  if (
    trajectory.activeRun !== null ||
    trajectory.activeRunLiveness !== null ||
    trajectory.pendingApproval !== null
  ) {
    throw new Error(`stopped trajectory exposed active state: ${JSON.stringify(trajectory)}`);
  }
}

function assertStoppedTrajectoryCapabilities(trajectory) {
  const capabilities = trajectory.capabilities;
  if (
    capabilities.canRetryLiveness ||
    capabilities.canSteer ||
    capabilities.canStopRun ||
    capabilities.canSubmitApproval
  ) {
    throw new Error(
      `stopped trajectory capabilities mismatch: ${JSON.stringify(trajectory.capabilities)}`,
    );
  }
}

function assertStoppedWorkflowExecution(execution, nodeExecutionId) {
  const nodeExecution = nodeExecutionById(execution, nodeExecutionId);
  if (
    execution.status !== "cancelled" ||
    execution.terminalReason !== "action_cancelled" ||
    nodeExecution?.status !== "cancelled" ||
    nodeExecution.result?.status !== "cancelled"
  ) {
    throw new Error(`stopped workflow execution mismatch: ${JSON.stringify(execution)}`);
  }
}

function assertTrajectoryRunnerRefs(conversationRef, runRef, nodeExecution) {
  if (!conversationRef || !runRef) {
    throw new Error(`activity node missing chat runner refs: ${JSON.stringify(nodeExecution)}`);
  }
}

function assertTrajectoryScope(trajectory, { definition, execution, nodeExecution, workspaceId }) {
  if (trajectory.schemaVersion !== 1) {
    throw new Error(`trajectory schema version = ${trajectory.schemaVersion}, want 1`);
  }
  const mismatch = [
    ["workspaceId", workspaceId],
    ["definitionId", definition.id],
    ["definitionVersionId", execution.definitionVersionId],
    ["executionId", execution.id],
    ["nodeId", nodeExecution.nodeId],
    ["nodeExecutionId", nodeExecution.id],
    ["attempt", nodeExecution.attempt],
    ["iteration", nodeExecution.iteration],
  ].find(([field, expected]) => trajectory.scope[field] !== expected);
  if (mismatch) {
    throw new Error(
      `trajectory scope mismatch: ${JSON.stringify({ actual: trajectory.scope, mismatch })}`,
    );
  }
}

function assertTrajectoryRunState(trajectory, conversationRef, runRef) {
  if (trajectory.conversationId !== conversationRef.id || trajectory.runId !== runRef.id) {
    throw new Error(
      `trajectory runner refs mismatch: ${JSON.stringify({
        conversationId: trajectory.conversationId,
        runId: trajectory.runId,
        refs: [conversationRef, runRef],
      })}`,
    );
  }
  if (
    trajectory.run.id !== trajectory.runId ||
    trajectory.run.conversationId !== trajectory.conversationId ||
    trajectory.run.status !== "completed"
  ) {
    throw new Error(`trajectory run mismatch: ${JSON.stringify(trajectory.run)}`);
  }
  if (trajectory.activeRun !== null || trajectory.activeRunLiveness !== null) {
    throw new Error(`completed trajectory exposed active run state: ${JSON.stringify(trajectory)}`);
  }
  if (trajectory.pendingApproval !== null) {
    throw new Error(`completed trajectory exposed pending approval: ${JSON.stringify(trajectory)}`);
  }
}

function assertTrajectoryBlocks(trajectory, runRef) {
  if (
    trajectory.blocks.length === 0 ||
    !trajectory.blocks.every((block) => block.runId === runRef.id)
  ) {
    throw new Error(
      `trajectory blocks were not scoped to run ${runRef.id}: ${JSON.stringify(trajectory.blocks)}`,
    );
  }
  if (!trajectory.hasMoreOlder || trajectory.olderBeforeBlockOrdinal <= 0) {
    throw new Error(
      `trajectory older cursor missing: ${JSON.stringify({
        hasMoreOlder: trajectory.hasMoreOlder,
        olderBeforeBlockOrdinal: trajectory.olderBeforeBlockOrdinal,
      })}`,
    );
  }
}

function assertTrajectoryOutputPage(trajectory, runRef) {
  const outputPage = trajectory.outputPages.find(
    (page) =>
      page.runId === runRef.id &&
      page.outputIds.length === 2 &&
      page.hasMore &&
      page.loadedThroughOrdinal === 2 &&
      page.nextOrdinal === 2,
  );
  if (!outputPage) {
    throw new Error(
      `trajectory output pages missing paged command output: ${JSON.stringify(trajectory.outputPages)}`,
    );
  }
  return outputPage;
}

function assertTrajectoryOutputIDs(trajectory, outputPage) {
  const outputIDs = new Set(trajectory.outputs.map((output) => output.id));
  for (const outputId of outputPage.outputIds) {
    if (!outputIDs.has(outputId)) {
      throw new Error(`trajectory output ${outputId} missing from flat outputs`);
    }
  }
  if (!trajectory.activity.some((item) => item.sourceRunItemId === outputPage.runItemId)) {
    throw new Error(`trajectory activity missing output item ${outputPage.runItemId}`);
  }
}

function assertTrajectoryCapabilities(trajectory) {
  if (
    !trajectory.capabilities.canLoadOlderHistory ||
    !trajectory.capabilities.canLoadRunItemOutput ||
    trajectory.capabilities.canRetryLiveness ||
    trajectory.capabilities.canSteer ||
    trajectory.capabilities.canStopRun ||
    trajectory.capabilities.canSubmitApproval
  ) {
    throw new Error(`trajectory capabilities mismatch: ${JSON.stringify(trajectory.capabilities)}`);
  }
}

function latestNodeExecution(execution, nodeId) {
  const matches = execution.nodeExecutions.filter((node) => node.nodeId === nodeId);
  return matches[matches.length - 1] ?? null;
}

function nodeExecutionById(execution, nodeExecutionId) {
  return execution.nodeExecutions.find((node) => node.id === nodeExecutionId) ?? null;
}

function workflowActivityNodeRunning(execution) {
  const nodeExecution = latestNodeExecution(execution, "activity");
  return (
    execution.status === "running" &&
    nodeExecution?.status === "running" &&
    runnerRef(nodeExecution, "chat.conversation") !== null &&
    runnerRef(nodeExecution, "chat.run") !== null
  );
}

function runnerRef(nodeExecution, kind) {
  return nodeExecution.runnerRefs.find((ref) => ref.kind === kind) ?? null;
}

function textInput(text) {
  return {
    parts: [
      {
        image: null,
        text: { format: "plain", text },
        type: "text",
      },
    ],
  };
}

async function rendererWorkflow(client, method, args) {
  return client.evaluate(
    `window.setta.workflow[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

async function rendererChat(client, method, args) {
  return client.evaluate(
    `window.setta.chat[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}
