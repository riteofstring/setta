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
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "workflow:validate-definition",
      "workflow:create-definition",
      "workflow:start-execution",
      "workflow:read-execution",
      "workflow:read-node-trajectory",
    ],
  });
  results.push("workflow-node-trajectory-contract");
  process.stdout.write("Electron chat workflow passed: workflow-node-trajectory-contract\n");
}

async function waitForWorkflowExecution(client, workspaceId, executionId, isReady) {
  return waitForBackendState(
    async () => rendererWorkflow(client, "readExecution", [workspaceId, executionId]),
    isReady,
  );
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

function runnerRef(nodeExecution, kind) {
  return nodeExecution.runnerRefs.find((ref) => ref.kind === kind) ?? null;
}

async function rendererWorkflow(client, method, args) {
  return client.evaluate(
    `window.setta.workflow[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}
