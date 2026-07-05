import { driverCallExpression } from "./cdp-client.mjs";
import { appendWorkflowState, waitForState } from "./chat-workflow-harness.mjs";
import { activityWorkflowGraph } from "./workflow-activity-feed-fixtures.mjs";

export const stoppableTrajectoryPrompt = "workflow hold for queue and steering";

const pendingWorkflowNodeTrajectoryPrompt = "workflow hold for draft event";
const workflowNodeSteeringPrompt = "finish node trajectory steering";
const pendingWorkflowNodeSteeringPrompt = "hold pending node trajectory steering";

export async function assertSteerWorkflowNodeTrajectoryContract({
  client,
  ensureWorkflowRunProjection,
  latestNodeExecution,
  openWorkflowGraphForDefinition,
  openWorkflowNodeRunDetails,
  recordingDir,
  reloadWorkflowNodeDetailsWithPersistedTarget,
  rendererWorkflow,
  startWorkflowRunFromToolbar,
  waitForWorkflowExecution,
  waitForWorkflowNodeTrajectory,
  workflowActivityNodeRunning,
  workspaceId,
}) {
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
  const graphSurfaceId = await openWorkflowGraphForDefinition(
    client,
    workspaceId,
    steerDefinition.id,
  );
  const steerStartedRun = await startWorkflowRunFromToolbar(
    client,
    graphSurfaceId,
    workspaceId,
    steerDefinition.id,
  );
  const steerRunning = await waitForWorkflowExecution(
    client,
    workspaceId,
    steerStartedRun.executionId,
    workflowActivityNodeRunning,
  );
  const steerNode = latestNodeExecution(steerRunning, "activity");
  if (!steerNode) {
    throw new Error(`steering workflow missing activity node: ${JSON.stringify(steerRunning)}`);
  }
  const steerRunningGraph = await ensureWorkflowRunProjection(
    client,
    steerStartedRun.graphSurfaceId,
    steerDefinition.id,
    steerStartedRun.executionId,
  );
  await openWorkflowNodeRunDetails(
    client,
    steerStartedRun.graphSurfaceId,
    steerRunningGraph,
    "activity",
  );
  const steerTrajectory = await waitForWorkflowNodeTrajectory(
    client,
    workspaceId,
    steerStartedRun.executionId,
    steerNode.id,
    (page) => page.capabilities.canSteer,
  );
  await reloadWorkflowNodeDetailsWithPersistedTarget(client, {
    executionId: steerStartedRun.executionId,
    isReady: steeringComposerReloaded,
    nodeId: "activity",
    workspaceId,
  });
  await waitForState(
    client,
    driverCallExpression("workflowNodeTrajectoryComposerState"),
    steeringComposerReadyForInput,
  );
  const beforeSteering = await waitForState(
    client,
    driverCallExpression("workflowNodeTrajectoryState"),
    workflowNodeTrajectoryReadyForSteering,
  );
  const updated = await client.driver("setWorkflowNodeTrajectorySteeringText", {
    text: workflowNodeSteeringPrompt,
  });
  if (!updated.updated) {
    throw new Error(
      `workflow node trajectory steering composer was not editable: ${JSON.stringify(updated)}`,
    );
  }
  await waitForState(client, driverCallExpression("workflowNodeTrajectoryComposerState"), (state) =>
    steeringComposerContainsPrompt(state, workflowNodeSteeringPrompt),
  );
  const clicked = await client.driver("clickWorkflowNodeTrajectorySteeringSend");
  if (!clicked.clicked) {
    throw new Error(
      `workflow node trajectory steering send was unavailable: ${JSON.stringify(clicked)}`,
    );
  }
  const liveCompletedState = await waitForState(
    client,
    driverCallExpression("workflowNodeTrajectoryState"),
    (state) =>
      steeredTrajectoryRenderedLive(state, beforeSteering.text, workflowNodeSteeringPrompt),
  );
  if (!liveCompletedState.text.includes("Active workflow complete.")) {
    throw new Error(
      `workflow node trajectory did not render streamed completion text live: ${JSON.stringify({
        beforeSteering,
        liveCompletedState,
      })}`,
    );
  }
  const steerCompleted = await waitForWorkflowExecution(
    client,
    workspaceId,
    steerStartedRun.executionId,
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
  assertSteeredTrajectoryPage(steeredTrajectory, steerNode.id, workflowNodeSteeringPrompt);
  await waitForState(client, driverCallExpression("workflowNodeTrajectoryState"), (state) =>
    stateIncludesSteeredText(state, workflowNodeSteeringPrompt),
  );
  if (steerTrajectory.runId !== steeredTrajectory.runId) {
    throw new Error(
      `workflow node steering changed run scope: ${JSON.stringify({
        before: steerTrajectory.runId,
        after: steeredTrajectory.runId,
      })}`,
    );
  }
  await appendWorkflowState(recordingDir, {
    executionId: steerCompleted.id,
    nodeExecutionId: steerNode.id,
    runId: steeredTrajectory.runId,
    type: "workflow_node_trajectory_steering_contract_verified",
  });
}

export async function assertPendingSteerWorkflowNodeTrajectoryContract({
  assertStoppedWorkflowExecution,
  client,
  ensureWorkflowRunProjection,
  latestNodeExecution,
  openWorkflowGraphForDefinition,
  openWorkflowNodeRunDetails,
  recordingDir,
  rendererWorkflow,
  startWorkflowRunFromToolbar,
  waitForWorkflowExecution,
  waitForWorkflowNodeTrajectory,
  workflowActivityNodeRunning,
  workspaceId,
}) {
  const pendingGraph = activityWorkflowGraph(pendingWorkflowNodeTrajectoryPrompt);
  const pendingValidation = await rendererWorkflow(client, "validateDefinition", [
    workspaceId,
    pendingGraph,
  ]);
  if (!pendingValidation.valid) {
    throw new Error(
      `pending steering trajectory workflow graph invalid: ${JSON.stringify(pendingValidation)}`,
    );
  }
  const pendingDefinition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Node trajectory pending steering contract",
    "Verifies workflow node pending steering renders before provider commit.",
    pendingGraph,
  ]);
  const graphSurfaceId = await openWorkflowGraphForDefinition(
    client,
    workspaceId,
    pendingDefinition.id,
  );
  const pendingStarted = await startWorkflowRunFromToolbar(
    client,
    graphSurfaceId,
    workspaceId,
    pendingDefinition.id,
  );
  const running = await waitForWorkflowExecution(
    client,
    workspaceId,
    pendingStarted.executionId,
    workflowActivityNodeRunning,
  );
  const pendingNode = latestNodeExecution(running, "activity");
  if (!pendingNode) {
    throw new Error(`pending steering workflow missing activity node: ${JSON.stringify(running)}`);
  }
  const runningGraph = await ensureWorkflowRunProjection(
    client,
    pendingStarted.graphSurfaceId,
    pendingDefinition.id,
    pendingStarted.executionId,
  );
  await openWorkflowNodeRunDetails(client, pendingStarted.graphSurfaceId, runningGraph, "activity");
  await waitForWorkflowNodeTrajectory(
    client,
    workspaceId,
    pendingStarted.executionId,
    pendingNode.id,
    (page) => page.capabilities.canSteer,
  );
  await waitForState(
    client,
    driverCallExpression("workflowNodeTrajectoryComposerState"),
    (state) => state.composerPresent && state.textareaExists && state.textareaDisabled === false,
  );
  const updated = await client.driver("setWorkflowNodeTrajectorySteeringText", {
    text: pendingWorkflowNodeSteeringPrompt,
  });
  if (!updated.updated) {
    throw new Error(
      `pending workflow node steering composer was not editable: ${JSON.stringify(updated)}`,
    );
  }
  await waitForState(client, driverCallExpression("workflowNodeTrajectoryComposerState"), (state) =>
    steeringComposerContainsPrompt(state, pendingWorkflowNodeSteeringPrompt),
  );
  const clicked = await client.driver("clickWorkflowNodeTrajectorySteeringSend");
  if (!clicked.clicked) {
    throw new Error(
      `pending workflow node steering send was unavailable: ${JSON.stringify(clicked)}`,
    );
  }
  const pendingState = await waitForState(
    client,
    driverCallExpression("workflowNodeTrajectoryState"),
    pendingSteeringVisibleInTrajectory,
  );
  const pendingTrajectory = await waitForWorkflowNodeTrajectory(
    client,
    workspaceId,
    pendingStarted.executionId,
    pendingNode.id,
    (page) => trajectoryHasPendingSteering(page, pendingWorkflowNodeSteeringPrompt),
  );
  assertPendingSteeringTrajectoryPage(
    pendingTrajectory,
    pendingNode.id,
    pendingWorkflowNodeSteeringPrompt,
  );

  const stopped = await rendererWorkflow(client, "stopNodeRun", [
    {
      executionId: pendingStarted.executionId,
      nodeExecutionId: pendingNode.id,
      workspaceId,
    },
  ]);
  assertStoppedWorkflowExecution(stopped, pendingNode.id);
  await appendWorkflowState(recordingDir, {
    executionId: pendingStarted.executionId,
    nodeExecutionId: pendingNode.id,
    pendingSteeringText: pendingState.pendingSteeringText,
    runId: pendingTrajectory.runId,
    type: "workflow_node_trajectory_pending_steering_verified",
  });
}

function steeringComposerReloaded(state) {
  const composer = state.trajectory.trajectorySteeringComposer;
  return (
    composer.composerPresent &&
    composer.textareaExists &&
    composer.textareaDisabled === false &&
    !composer.sendButtonReady
  );
}

function steeringComposerReadyForInput(state) {
  return (
    state.composerPresent &&
    state.textareaExists &&
    state.textareaDisabled === false &&
    !state.sendButtonReady
  );
}

function workflowNodeTrajectoryReadyForSteering(state) {
  return (
    state.trajectoryPresent &&
    state.text.includes("Workflow stream started.") &&
    state.trajectorySteeringComposer.composerPresent
  );
}

function steeringComposerContainsPrompt(state, prompt) {
  return state.textareaValue === prompt && state.sendButtonReady;
}

function steeredTrajectoryRenderedLive(state, beforeText, steeringPrompt) {
  return (
    state.trajectoryPresent &&
    state.text.length > beforeText.length &&
    stateIncludesSteeredText(state, steeringPrompt) &&
    !state.trajectorySteeringComposer.composerPresent
  );
}

function stateIncludesSteeredText(state, steeringPrompt) {
  return (
    state.text.includes(steeringPrompt) && state.text.includes(`Steered with ${steeringPrompt}.`)
  );
}

function pendingSteeringVisibleInTrajectory(state) {
  return (
    state.trajectoryPresent &&
    state.pendingSteeringRowCount === 1 &&
    state.pendingSteeringBlockCount === 0 &&
    state.pendingSteeringText.includes("Steering pending") &&
    state.pendingSteeringText.includes(pendingWorkflowNodeSteeringPrompt)
  );
}

function trajectoryHasPendingSteering(page, steeringPrompt) {
  return page.pendingSteeringMessages.some((message) =>
    messageIsPendingSteering(message, steeringPrompt),
  );
}

function messageIsPendingSteering(message, steeringPrompt) {
  if (message.status !== "pending") {
    return false;
  }
  return workflowSteeringMessageMatches(message, steeringPrompt);
}

function assertSteeredTrajectoryPage(trajectory, nodeExecutionId, steeringPrompt) {
  const assistantText = `Steered with ${steeringPrompt}.`;
  const terminalSteering = trajectory.pendingSteeringMessages.filter((message) =>
    workflowSteeringMessageMatches(message, steeringPrompt),
  );
  const failed = Object.entries(
    steeredTrajectoryEvidence(trajectory, nodeExecutionId, steeringPrompt, {
      assistantText,
      terminalSteering,
    }),
  )
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length > 0) {
    throw new Error(
      `steered trajectory mismatch: ${JSON.stringify({
        assistantText,
        failed,
        nodeExecutionId,
        steeringPrompt,
        terminalSteering,
        trajectory,
      })}`,
    );
  }
}

function steeredTrajectoryEvidence(
  trajectory,
  nodeExecutionId,
  steeringPrompt,
  { assistantText, terminalSteering },
) {
  return {
    activeRunCleared: trajectory.activeRun === null,
    assistantTextPresent: assistantTextPresent(trajectory, assistantText),
    livenessCleared: trajectory.activeRunLiveness === null,
    noSteeringCapability: !trajectory.capabilities.canSteer,
    noSteeringUserBlock: !workflowSteeringUserBlockPresent(trajectory, steeringPrompt),
    scopeMatches: trajectory.scope.nodeExecutionId === nodeExecutionId,
    statusCompleted: trajectory.run.status === "completed",
    terminalSteeringCancelled:
      terminalSteering.length === 1 && terminalSteering[0]?.status === "cancelled",
  };
}

function assistantTextPresent(trajectory, assistantText) {
  return trajectory.blocks.some(
    (block) => block.assistantText?.text?.includes(assistantText) === true,
  );
}

function assertPendingSteeringTrajectoryPage(trajectory, nodeExecutionId, steeringPrompt) {
  const pending = trajectory.pendingSteeringMessages.filter((message) =>
    workflowSteeringMessageMatches(message, steeringPrompt),
  );
  const failed = Object.entries(
    pendingSteeringTrajectoryEvidence(trajectory, nodeExecutionId, steeringPrompt, pending),
  )
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failed.length > 0) {
    throw new Error(
      `pending steering trajectory mismatch: ${JSON.stringify({
        failed,
        nodeExecutionId,
        pending,
        steeringPrompt,
        trajectory,
      })}`,
    );
  }
}

function pendingSteeringTrajectoryEvidence(trajectory, nodeExecutionId, steeringPrompt, pending) {
  return {
    noSteeringUserBlock: !workflowSteeringUserBlockPresent(trajectory, steeringPrompt),
    pendingMessageVisible: pending.length === 1 && pending[0]?.status === "pending",
    runStillActive: trajectory.run.status === "running",
    scopeMatches: trajectory.scope.nodeExecutionId === nodeExecutionId,
  };
}

function workflowSteeringUserBlockPresent(trajectory, steeringPrompt) {
  return trajectory.blocks.some((block) => workflowSteeringUserBlockMatches(block, steeringPrompt));
}

function workflowSteeringUserBlockMatches(block, steeringPrompt) {
  return (
    block.userMessage?.delivery === "steering" &&
    messagePartsIncludeText(block.userMessage.parts, steeringPrompt)
  );
}

function workflowSteeringMessageMatches(message, steeringPrompt) {
  return message.delivery === "steering" && messagePartsIncludeText(message.parts, steeringPrompt);
}

function messagePartsIncludeText(parts, text) {
  return parts.some((part) => part.type === "text" && part.text?.text === text);
}
