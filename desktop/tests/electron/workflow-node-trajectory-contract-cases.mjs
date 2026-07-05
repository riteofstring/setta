import { rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
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
  waitForState,
} from "./chat-workflow-harness.mjs";
import {
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
} from "./workflow-graph-layout-helpers.mjs";
import { activityWorkflowGraph } from "./workflow-activity-feed-fixtures.mjs";
import { assertHistoricalAttemptWorkflowNodeTrajectoryContract } from "./workflow-node-trajectory-historical-attempts.mjs";

const trajectoryPrompt = "chat activity projection reload workflow";
const approvalTrajectoryPrompt = "command approval workflow";
const stoppableTrajectoryPrompt = "workflow hold for queue and steering";
const workflowNodeSteeringPrompt = "finish node trajectory steering";

export async function runWorkflowNodeTrajectoryContractWorkflowLaunch(results, { recordingRoot }) {
  const fixture = await createFixture("workflow-node-trajectory-contract");
  const recordingDir = join(recordingRoot, "workflow-node-trajectory-contract");
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: { SETTA_WORKFLOW_GRAPH_DEBUG: "1" },
  });
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
    const graphSurfaceId = await openWorkflowGraphForDefinition(
      context.client,
      workspaceId,
      definition.id,
    );
    const startedRun = await startWorkflowRunFromToolbar(
      context.client,
      graphSurfaceId,
      workspaceId,
      definition.id,
    );
    const completed = await waitForWorkflowExecution(
      context.client,
      workspaceId,
      startedRun.executionId,
      (execution) => execution.status === "completed",
    );
    const completedGraph = startedRun.graphSnapshot.graph.nodes.some(
      (node) => node.id === "activity",
    )
      ? startedRun.graphSnapshot
      : await waitForWorkflowGraphSnapshot(context.client, startedRun.graphSurfaceId, (snapshot) =>
          snapshot.graph.nodes.some((node) => node.id === "activity"),
        );
    const activityNode = latestNodeExecution(completed, "activity");
    if (!activityNode) {
      throw new Error(`completed workflow missing activity node: ${JSON.stringify(completed)}`);
    }
    const trajectory = await rendererWorkflow(context.client, "readNodeTrajectory", [
      {
        afterItemId: "",
        beforeBlockOrdinal: 0,
        executionId: completed.id,
        itemLimit: 20,
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
    await assertTrajectoryActivityItemPagination(
      context.client,
      workspaceId,
      completed.id,
      activityNode.id,
    );
    await assertWorkflowNodeDetailsOutputPagination(
      context.client,
      workspaceId,
      startedRun.graphSurfaceId,
      completedGraph,
      completed.id,
      activityNode.id,
    );
    await appendWorkflowState(recordingDir, {
      executionId: completed.id,
      nodeExecutionId: activityNode.id,
      runId: trajectory.runId,
      type: "workflow_node_trajectory_contract_verified",
    });

    await assertApproveWorkflowNodeTrajectoryDetails(context.client, workspaceId, recordingDir);

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
    await assertHistoricalAttemptWorkflowNodeTrajectoryContract({
      client: context.client,
      ensureWorkflowRunProjection,
      openWorkflowGraphForDefinition,
      openWorkflowNodeRunDetails,
      recordingDir,
      startWorkflowRunFromToolbar,
      waitForWorkflowExecution,
      waitForWorkflowNodeDetailsUILayout,
      workspaceId,
    });
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
      "/workspaces/ui/layout/read",
      "/workspaces/ui/layout/save",
      "/chat/conversations/create",
      "/chat/conversations/list",
      "/workflows/definitions/validate",
      "/workflows/definitions/create",
      "/workflows/executions/start",
      "/workflows/executions/read",
      "/workflows/nodes/trajectory",
      "/chat/runs/item-output",
      "/chat/runs/reconcile",
      "/workflows/approvals/submit",
      "/workflows/nodes/runs/retry-liveness",
      "/workflows/nodes/runs/steer",
      "/workflows/nodes/runs/stop",
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "workspace:read-ui-layout",
      "workspace:save-ui-layout",
      "chat:create-conversation",
      "workflow:validate-definition",
      "workflow:create-definition",
      "workflow:start-execution",
      "workflow:read-execution",
      "workflow:read-node-trajectory",
      "chat:run-item-output",
      "chat:reconcile-runs",
      "workflow:submit-approval",
      "workflow:retry-node-run-liveness",
      "workflow:steer-node-run",
      "workflow:stop-node-run",
    ],
  });
  results.push("workflow-node-trajectory-contract");
  process.stdout.write("Electron chat workflow passed: workflow-node-trajectory-contract\n");
}

async function assertApproveWorkflowNodeTrajectoryDetails(client, workspaceId, recordingDir) {
  const approvalGraph = activityWorkflowGraph(approvalTrajectoryPrompt);
  const approvalValidation = await rendererWorkflow(client, "validateDefinition", [
    workspaceId,
    approvalGraph,
  ]);
  if (!approvalValidation.valid) {
    throw new Error(
      `approval trajectory workflow graph invalid: ${JSON.stringify(approvalValidation)}`,
    );
  }
  const approvalDefinition = await rendererWorkflow(client, "createDefinition", [
    workspaceId,
    "Node trajectory approval details",
    "Verifies workflow node-scoped approval submission from rendered node details.",
    approvalGraph,
  ]);
  const graphSurfaceId = await openWorkflowGraphForDefinition(
    client,
    workspaceId,
    approvalDefinition.id,
  );
  const startedRun = await startWorkflowRunFromToolbar(
    client,
    graphSurfaceId,
    workspaceId,
    approvalDefinition.id,
  );
  const waiting = await waitForWorkflowExecution(
    client,
    workspaceId,
    startedRun.executionId,
    workflowActivityNodeWaitingApproval,
  );
  const approvalNode = latestNodeExecution(waiting, "activity");
  const pendingApproval = approvalNode?.result?.pendingApproval ?? null;
  if (!approvalNode || pendingApproval === null) {
    throw new Error(
      `approval workflow did not expose pending approval: ${JSON.stringify(waiting)}`,
    );
  }
  const waitingGraph = await ensureWorkflowRunProjection(
    client,
    startedRun.graphSurfaceId,
    approvalDefinition.id,
    startedRun.executionId,
  );
  await openWorkflowNodeRunDetails(client, startedRun.graphSurfaceId, waitingGraph, "activity");
  const initial = await waitForState(
    client,
    driverCallExpression("workflowNodeTrajectoryState"),
    (state) =>
      state.trajectoryPresent &&
      state.approvalCardCount === 1 &&
      state.approvalApproveButtonReady &&
      state.approvalText.includes("Command approval") &&
      state.approvalText.includes("Approve the scripted command."),
  );
  await reloadWorkflowNodeDetailsWithPersistedTarget(client, {
    executionId: startedRun.executionId,
    isReady: (state) =>
      state.trajectory.approvalCardCount === 1 &&
      state.trajectory.approvalApproveButtonReady &&
      state.trajectory.approvalText.includes("Command approval") &&
      state.trajectory.approvalText.includes("Approve the scripted command."),
    nodeId: "activity",
    workspaceId,
  });
  const submitted = await client.driver("clickWorkflowNodeTrajectoryDecisionApproval", {
    approved: true,
  });
  if (!submitted.clicked) {
    throw new Error(
      `workflow node trajectory approval was unavailable: ${JSON.stringify(initial)}`,
    );
  }
  const completed = await waitForWorkflowExecution(
    client,
    workspaceId,
    startedRun.executionId,
    (execution) => {
      const node = nodeExecutionById(execution, approvalNode.id);
      return (
        execution.status === "completed" &&
        node?.status === "succeeded" &&
        node.result?.pendingApproval === null
      );
    },
  );
  await waitForState(
    client,
    driverCallExpression("workflowNodeTrajectoryState"),
    (state) =>
      state.trajectoryPresent &&
      state.approvalCardCount === 0 &&
      state.text.includes("Command approval resolved."),
  );
  await appendWorkflowState(recordingDir, {
    approvalId: pendingApproval.approvalId,
    executionId: completed.id,
    nodeExecutionId: approvalNode.id,
    type: "workflow_node_trajectory_approval_details_verified",
  });
}

async function openWorkflowGraphForDefinition(client, workspaceId, definitionId) {
  const definition = await rendererWorkflow(client, "readDefinition", [workspaceId, definitionId]);
  await reloadRendererWithSelectedWorkspace(client, workspaceId);
  await selectWorkflowDefinitionFromSidebar(client, definition.name);
  await openWorkflowGraphPane(client);
  const surfaceId = await maximizeWorkflowGraphPane(client);
  await waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    (snapshot) =>
      snapshot.graph.workflow?.definitionId === definitionId &&
      snapshot.graph.workflow?.viewMode === "draft",
  );
  return surfaceId;
}

async function selectWorkflowDefinitionFromSidebar(client, definitionName) {
  await waitForState(
    client,
    driverCallExpression("workflowDefinitionSidebarItemState", { name: definitionName }),
    (state) => state.exists && state.disabled === false,
  );
  const clicked = await client.driver("clickWorkflowDefinitionSidebarItem", {
    name: definitionName,
  });
  if (!clicked.clicked) {
    throw new Error(
      `workflow definition sidebar row was not clickable: ${JSON.stringify({
        definitionName,
        clicked,
      })}`,
    );
  }
  await waitForState(
    client,
    driverCallExpression("workflowDefinitionSidebarItemState", { name: definitionName }),
    (state) => state.selected === true,
  );
}

async function reloadRendererWithSelectedWorkspace(client, workspaceId) {
  await client.call("Page.enable");
  const pageLoaded = waitForPageLoadEvent(client, 20_000);
  try {
    await client.call("Page.reload", { ignoreCache: true });
  } catch (error) {
    if (!isRendererNavigationError(error)) {
      throw error;
    }
  }
  await pageLoaded;
  const startedAt = Date.now();
  let lastError = null;
  let lastState = null;
  while (Date.now() - startedAt < 20_000) {
    try {
      lastState = await client.driver("rendererWorkspace");
      if (lastState.workspaceId === workspaceId) {
        return;
      }
    } catch (error) {
      lastError = error;
      if (!isRendererNavigationError(error)) {
        throw error;
      }
    }
    await delay(100);
  }
  throw new Error(
    `renderer workflow API did not recover after reload: ${JSON.stringify({
      lastError: lastError instanceof Error ? lastError.message : String(lastError),
      lastState,
    })}`,
  );
}

function waitForPageLoadEvent(client, timeoutMs) {
  return new Promise((resolvePromise, reject) => {
    let dispose = () => {};
    const timeout = globalThis.setTimeout(() => {
      dispose();
      reject(new Error("renderer reload did not emit Page.loadEventFired"));
    }, timeoutMs);
    dispose = client.on("Page.loadEventFired", () => {
      globalThis.clearTimeout(timeout);
      dispose();
      resolvePromise();
    });
  });
}

function isRendererNavigationError(error) {
  return error instanceof Error && error.message.includes("Inspected target navigated or closed");
}

async function startWorkflowRunFromToolbar(client, surfaceId, workspaceId, definitionId) {
  const before = await rendererWorkflow(client, "listExecutions", [workspaceId, definitionId, 20]);
  const beforeExecutionIds = new Set(before.executions.map((execution) => execution.id));
  await waitForWorkflowGraphSnapshot(
    client,
    surfaceId,
    (snapshot) =>
      snapshot.graph.workflow?.definitionId === definitionId &&
      snapshot.graph.workflow?.viewMode === "draft",
  );
  await waitForState(
    client,
    driverCallExpression("workflowToolbarButtonState", { testId: "workflow-run-button" }),
    (state) => state.exists && !state.disabled && state.text.includes("Run"),
  );
  const clicked = await client.driver("clickWorkflowToolbarButton", {
    testId: "workflow-run-button",
  });
  if (!clicked.ok) {
    throw new Error(`workflow run button was not clickable: ${JSON.stringify(clicked)}`);
  }
  const started = await waitForWorkflowExecutionSummary(
    client,
    workspaceId,
    definitionId,
    (execution) => !beforeExecutionIds.has(execution.id),
  );
  const graphSnapshot = await ensureWorkflowRunProjection(
    client,
    surfaceId,
    definitionId,
    started.id,
  );
  return {
    executionId: started.id,
    graphSnapshot,
    graphSurfaceId: surfaceId,
  };
}

async function ensureWorkflowRunProjection(client, surfaceId, definitionId, executionId) {
  const navigation = await waitForWorkflowRunNavigationState(
    client,
    surfaceId,
    definitionId,
    executionId,
  );
  // The Pixi debug snapshot can trail the React toolbar state during fast run completion. The
  // selected-run attribute is owned by the production toolbar and is the deterministic source of the
  // current run projection.
  if (!navigation.runProjectionMatches && !navigation.selectedRunMatches) {
    if (navigation.viewActiveRunReady) {
      const activeRunClicked = await client.driver("clickWorkflowToolbarButton", {
        testId: "workflow-view-active-run-button",
      });
      if (!activeRunClicked.ok) {
        throw new Error(
          `workflow active-run button was not clickable: ${JSON.stringify(activeRunClicked)}`,
        );
      }
    } else {
      await selectWorkflowRunProjection(client, executionId);
    }
  }
  await waitForWorkflowRunNavigationState(
    client,
    surfaceId,
    definitionId,
    executionId,
    (value) => value.runProjectionMatches || value.selectedRunMatches,
  );
  return waitForWorkflowGraphSnapshot(client, surfaceId, (snapshot) =>
    snapshot.graph.nodes.some((node) => node.id === "activity"),
  );
}

async function waitForWorkflowExecutionSummary(client, workspaceId, definitionId, isReady) {
  const response = await waitForBackendState(
    async () => rendererWorkflow(client, "listExecutions", [workspaceId, definitionId, 20]),
    (value) => value.executions.some(isReady),
  );
  const execution = response.executions.find(isReady);
  if (!execution) {
    throw new Error(`workflow execution summary disappeared: ${JSON.stringify(response)}`);
  }
  return execution;
}

async function selectWorkflowRunProjection(client, executionId) {
  await waitForState(
    client,
    driverCallExpression("workflowRunSelectorState"),
    (state) => state.buttonExists && !state.buttonDisabled,
  );
  const opened = await client.driver("openWorkflowRunSelector");
  if (!opened.ok) {
    throw new Error(`workflow run selector did not open: ${JSON.stringify(opened)}`);
  }
  await waitForState(
    client,
    driverCallExpression("workflowRunSelectorState"),
    (state) =>
      state.menuOpen &&
      state.rows.some((row) => row.testId === `workflow-run-selector-row-${executionId}`),
  );
  const selected = await client.driver("selectWorkflowRunSelectorRow", { executionId });
  if (!selected.ok) {
    throw new Error(`workflow run selector row did not select: ${JSON.stringify(selected)}`);
  }
}

async function waitForWorkflowRunNavigationState(
  client,
  surfaceId,
  definitionId,
  executionId,
  isReady = (value) =>
    value.runProjectionMatches ||
    value.selectedRunMatches ||
    value.viewActiveRunReady ||
    value.runSelectorReady,
) {
  return waitForState(
    client,
    driverCallExpression("workflowGraphRunNavigationState", {
      definitionId,
      executionId,
      surfaceId,
    }),
    (value) => value.ready && isReady(value),
  );
}

async function assertWorkflowNodeDetailsOutputPagination(
  client,
  workspaceId,
  surfaceId,
  snapshot,
  executionId,
  nodeExecutionId,
) {
  await openWorkflowNodeRunDetails(client, surfaceId, snapshot, "activity");
  await client.driver("expandWorkflowNodeTrajectoryActivityGroup");
  await waitForState(
    client,
    driverCallExpression("workflowRunDetailsState"),
    (state) => state.runActivityRowCount > 0,
  );
  await client.driver("expandWorkflowNodeTrajectoryCommandOutput");
  const initial = await waitForState(
    client,
    driverCallExpression("workflowNodeTrajectoryState"),
    (state) =>
      state.trajectoryPresent &&
      state.loadMoreButtonCount === 1 &&
      state.outputText.includes("projection output chunk 001") &&
      state.outputText.includes("projection output chunk 040") &&
      !state.outputText.includes("projection output chunk 041"),
  );
  const loaded = await client.driver("clickWorkflowNodeTrajectoryLoadMoreOutput");
  if (!loaded.clicked) {
    throw new Error(
      `workflow node trajectory load-more was unavailable: ${JSON.stringify(initial)}`,
    );
  }
  await waitForState(
    client,
    driverCallExpression("workflowNodeTrajectoryState"),
    (state) =>
      state.trajectoryPresent &&
      state.loadMoreButtonCount === 0 &&
      state.outputText.includes("projection output chunk 041"),
  );
  assertWorkflowNodeDetailsEvidence(
    await client.driver("workflowRunDetailsState"),
    nodeExecutionId,
  );
  await reloadWorkflowNodeDetailsWithPersistedTarget(client, {
    executionId,
    isReady: (state) =>
      state.trajectory.loadMoreButtonCount === 1 &&
      state.trajectory.outputText.includes("projection output chunk 001") &&
      state.trajectory.outputText.includes("projection output chunk 040") &&
      !state.trajectory.outputText.includes("projection output chunk 041"),
    nodeId: "activity",
    prepare: async () => {
      await client.driver("expandWorkflowNodeTrajectoryActivityGroup");
      await waitForState(
        client,
        driverCallExpression("workflowRunDetailsState"),
        (state) => state.runActivityRowCount > 0,
      );
      await client.driver("expandWorkflowNodeTrajectoryCommandOutput");
    },
    workspaceId,
  });
  const reloaded = await client.driver("clickWorkflowNodeTrajectoryLoadMoreOutput");
  if (!reloaded.clicked) {
    throw new Error("workflow node trajectory load-more was unavailable after renderer reload");
  }
  await waitForState(
    client,
    driverCallExpression("workflowNodeTrajectoryState"),
    (state) =>
      state.trajectoryPresent &&
      state.loadMoreButtonCount === 0 &&
      state.outputText.includes("projection output chunk 041"),
  );
}

async function openWorkflowNodeRunDetails(
  client,
  surfaceId,
  snapshot,
  nodeId,
  nodeExecutionId = "",
) {
  if (!snapshot.graph.nodes.some((candidate) => candidate.id === nodeId)) {
    throw new Error(`workflow graph node ${nodeId} missing: ${JSON.stringify(snapshot.graph)}`);
  }
  const opened = await client.driver("openWorkflowNodeDetailsFromGraphDebug", {
    nodeExecutionId,
    nodeId,
    surfaceId,
  });
  if (!opened.ok) {
    throw new Error(`workflow node details did not open: ${JSON.stringify(opened)}`);
  }
  await waitForState(
    client,
    driverCallExpression("workflowRunDetailsState"),
    (state) =>
      state.present &&
      state.workflowTrajectorySurfaceCount === 1 &&
      state.chatConversationTrajectoryCount === 0,
  );
}

function assertWorkflowNodeDetailsEvidence(state, nodeExecutionId) {
  if (!state.text.includes("Agent Trajectory") || !state.trajectory?.trajectoryPresent) {
    throw new Error(`workflow node details evidence missing: ${JSON.stringify(state)}`);
  }
  if (nodeExecutionId === "") {
    throw new Error("workflow node execution id is required for details evidence");
  }
}

async function waitForWorkflowGraphSnapshot(client, surfaceId, predicate) {
  const state = await waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", {
      includeVisual: false,
      surfaceId,
    }),
    (value) => value.ready && predicate(value.snapshot),
  );
  return state.snapshot;
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
    isReady: (state) =>
      state.trajectory.trajectorySteeringComposer.composerPresent &&
      state.trajectory.trajectorySteeringComposer.textareaExists &&
      state.trajectory.trajectorySteeringComposer.textareaDisabled === false &&
      !state.trajectory.trajectorySteeringComposer.sendButtonReady,
    nodeId: "activity",
    workspaceId,
  });
  await waitForState(
    client,
    driverCallExpression("workflowNodeTrajectoryComposerState"),
    (state) =>
      state.composerPresent &&
      state.textareaExists &&
      state.textareaDisabled === false &&
      !state.sendButtonReady,
  );
  const updated = await client.driver("setWorkflowNodeTrajectorySteeringText", {
    text: workflowNodeSteeringPrompt,
  });
  if (!updated.updated) {
    throw new Error(
      `workflow node trajectory steering composer was not editable: ${JSON.stringify(updated)}`,
    );
  }
  await waitForState(
    client,
    driverCallExpression("workflowNodeTrajectoryComposerState"),
    (state) => state.textareaValue === workflowNodeSteeringPrompt && state.sendButtonReady,
  );
  const clicked = await client.driver("clickWorkflowNodeTrajectorySteeringSend");
  if (!clicked.clicked) {
    throw new Error(
      `workflow node trajectory steering send was unavailable: ${JSON.stringify(clicked)}`,
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
  await waitForState(
    client,
    driverCallExpression("workflowNodeTrajectoryState"),
    (state) =>
      state.trajectoryPresent &&
      state.text.includes(workflowNodeSteeringPrompt) &&
      state.text.includes(`Steered with ${workflowNodeSteeringPrompt}.`),
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

async function reloadWorkflowNodeDetailsWithPersistedTarget(
  client,
  { executionId, isReady, nodeId, prepare = async () => {}, workspaceId },
) {
  await waitForWorkflowNodeDetailsUILayout(client, workspaceId, executionId, nodeId);
  await reloadRendererWithSelectedWorkspace(client, workspaceId);
  await waitForState(
    client,
    driverCallExpression("workflowRunDetailsState"),
    (state) =>
      state.present &&
      state.nodeId === nodeId &&
      state.workflowTrajectorySurfaceCount === 1 &&
      state.chatConversationTrajectoryCount === 0 &&
      state.trajectory?.trajectoryPresent,
  );
  await prepare();
  return waitForState(
    client,
    driverCallExpression("workflowRunDetailsState"),
    (state) =>
      state.present &&
      state.nodeId === nodeId &&
      state.workflowTrajectorySurfaceCount === 1 &&
      state.chatConversationTrajectoryCount === 0 &&
      state.trajectory?.trajectoryPresent &&
      isReady(state),
  );
}

async function waitForWorkflowNodeDetailsUILayout(
  client,
  workspaceId,
  executionId,
  nodeId,
  nodeExecutionId = "",
) {
  return waitForBackendState(
    async () => rendererWorkspace(client, "readUILayout", [workspaceId]),
    (result) =>
      result.layout?.panes.some(
        (pane) =>
          pane.surfaceKind === "workflow-node-details" &&
          pane.workflowNodeDetailsConfig?.workspaceId === workspaceId &&
          pane.workflowNodeDetailsConfig.executionId === executionId &&
          pane.workflowNodeDetailsConfig.nodeId === nodeId &&
          (nodeExecutionId === "" ||
            pane.workflowNodeDetailsConfig.nodeExecutionId === nodeExecutionId),
      ) === true,
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

async function assertTrajectoryActivityItemPagination(
  client,
  workspaceId,
  executionId,
  nodeExecutionId,
) {
  const firstPage = await rendererWorkflow(client, "readNodeTrajectory", [
    {
      afterItemId: "",
      beforeBlockOrdinal: 0,
      executionId,
      itemLimit: 1,
      nodeExecutionId,
      outputLimit: 2,
      transcriptLimit: 2,
      workspaceId,
    },
  ]);
  if (
    firstPage.items.length !== 1 ||
    !firstPage.hasMoreItems ||
    firstPage.nextItemId === "" ||
    !firstPage.capabilities.canLoadMoreActivity
  ) {
    throw new Error(
      `first trajectory activity item page mismatch: ${JSON.stringify({
        hasMoreItems: firstPage.hasMoreItems,
        itemCount: firstPage.items.length,
        nextItemId: firstPage.nextItemId,
        capabilities: firstPage.capabilities,
      })}`,
    );
  }

  const secondPage = await rendererWorkflow(client, "readNodeTrajectory", [
    {
      afterItemId: firstPage.nextItemId,
      beforeBlockOrdinal: 0,
      executionId,
      itemLimit: 1,
      nodeExecutionId,
      outputLimit: 2,
      transcriptLimit: 2,
      workspaceId,
    },
  ]);
  if (
    secondPage.items.length !== 1 ||
    secondPage.items[0].id === firstPage.items[0].id ||
    secondPage.items[0].runId !== firstPage.runId
  ) {
    throw new Error(
      `second trajectory activity item page mismatch: ${JSON.stringify({
        firstItem: firstPage.items[0],
        secondItems: secondPage.items,
      })}`,
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

function assertSteeredTrajectoryPage(trajectory, nodeExecutionId, steeringPrompt) {
  const assistantText = `Steered with ${steeringPrompt}.`;
  if (
    trajectory.scope.nodeExecutionId !== nodeExecutionId ||
    trajectory.run.status !== "completed" ||
    trajectory.activeRun !== null ||
    trajectory.activeRunLiveness !== null ||
    trajectory.capabilities.canSteer ||
    !trajectory.blocks.some((block) => workflowSteeringUserBlockMatches(block, steeringPrompt)) ||
    !trajectory.blocks.some((block) => block.assistantText?.text?.includes(assistantText) === true)
  ) {
    throw new Error(
      `steered trajectory mismatch: ${JSON.stringify({
        assistantText,
        nodeExecutionId,
        steeringPrompt,
        trajectory,
      })}`,
    );
  }
}

function workflowSteeringUserBlockMatches(block, steeringPrompt) {
  return (
    block.userMessage?.delivery === "steering" &&
    block.userMessage.parts.some(
      (part) => part.type === "text" && part.text?.text === steeringPrompt,
    )
  );
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
    trajectory.capabilities.canLoadMoreActivity ||
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

function workflowActivityNodeWaitingApproval(execution) {
  const nodeExecution = latestNodeExecution(execution, "activity");
  return (
    execution.status === "running" &&
    nodeExecution?.status === "waiting_approval" &&
    nodeExecution.result?.pendingApproval != null &&
    runnerRef(nodeExecution, "chat.conversation") !== null &&
    runnerRef(nodeExecution, "chat.run") !== null
  );
}

function runnerRef(nodeExecution, kind) {
  return nodeExecution.runnerRefs.find((ref) => ref.kind === kind) ?? null;
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

async function rendererWorkspace(client, method, args) {
  return client.evaluate(
    `window.setta.workspace[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}
