import { rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import {
  appendWorkflowState,
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  createFixture,
  failureWithLogs,
  launchContext,
  openWorkspace,
  stopElectron,
  waitForBackendState,
} from "./chat-workflow-harness.mjs";
import { activityWorkflowGraph } from "./workflow-activity-feed-fixtures.mjs";

const postStartFailurePrompt = "cancel active workflow";

export async function runWorkflowRunnerPostStartFailureWorkflowLaunch(results, { recordingRoot }) {
  const fixture = await createFixture("workflow-runner-post-start-failure");
  const recordingDir = join(recordingRoot, "workflow-runner-post-start-failure");
  const context = await launchContext(fixture, recordingDir, {
    extraEnv: {
      SETTA_E2E_WORKFLOW_FAIL_FIRST_RUNNER_POST_START_PERSIST: "1",
    },
  });
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    const graph = activityWorkflowGraph(postStartFailurePrompt);
    const validation = await rendererWorkflow(context.client, "validateDefinition", [
      workspaceId,
      graph,
    ]);
    if (!validation.valid) {
      throw new Error(
        `post-start workflow graph invalid: ${JSON.stringify(validation.diagnostics)}`,
      );
    }
    const definition = await rendererWorkflow(context.client, "createDefinition", [
      workspaceId,
      "Runner post-start failure",
      "Verifies workflow runner cleanup after refs persistence fails.",
      graph,
    ]);

    await expectPostStartFailure(context.client, workspaceId, definition.id);
    const failedSummary = await waitForFailedExecutionSummary(
      context.client,
      workspaceId,
      definition.id,
    );
    const failedExecution = await rendererWorkflow(context.client, "readExecution", [
      workspaceId,
      failedSummary.id,
    ]);
    const failedNode = assertPostStartFailureExecution(failedExecution);
    await assertWorkflowChatRunCancelled(backend, workspaceId, failedNode);

    const retry = await rendererWorkflow(context.client, "startExecution", [
      workspaceId,
      definition.id,
    ]);
    const running = await waitForWorkflowExecution(
      context.client,
      workspaceId,
      retry.id,
      (execution) => {
        const node = latestNodeExecution(execution, "activity");
        return (
          execution.status === "running" &&
          node?.status === "running" &&
          runnerRef(node, "chat.run")
        );
      },
    );
    const retryNode = latestNodeExecution(running, "activity");
    if (!runnerRef(retryNode, "chat.conversation") || !runnerRef(retryNode, "chat.run")) {
      throw new Error(`retry workflow missing runner refs: ${JSON.stringify(running)}`);
    }
    const cancelled = await rendererWorkflow(context.client, "cancelExecution", [
      workspaceId,
      retry.id,
    ]);
    if (cancelled.status !== "cancelled") {
      throw new Error(`retry workflow cancel = ${cancelled.status}, want cancelled`);
    }

    await appendWorkflowState(recordingDir, {
      failedExecutionId: failedExecution.id,
      retryExecutionId: retry.id,
      type: "workflow_runner_post_start_failure_verified",
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
      "/workflows/definitions/validate",
      "/workflows/definitions/create",
      "/workflows/executions/start",
      "/workflows/executions/list",
      "/workflows/executions/read",
      "/chat/runs/list",
    ],
    expectedIpcFailures: [
      (entry) =>
        entry.channel === "workflow:start-execution" &&
        typeof entry.error?.message === "string" &&
        entry.error.message.includes("e2e injected workflow runner post-start persistence failure"),
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "workflow:validate-definition",
      "workflow:create-definition",
      "workflow:start-execution",
      "workflow:list-executions",
      "workflow:read-execution",
    ],
  });
  results.push("workflow-runner-post-start-failure");
  process.stdout.write("Electron chat workflow passed: workflow-runner-post-start-failure\n");
}

async function expectPostStartFailure(client, workspaceId, definitionId) {
  try {
    await rendererWorkflow(client, "startExecution", [workspaceId, definitionId]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("e2e injected workflow runner post-start persistence failure")) {
      return;
    }
    throw error;
  }
  throw new Error("workflow start succeeded, want injected post-start persistence failure");
}

async function waitForFailedExecutionSummary(client, workspaceId, definitionId) {
  const response = await waitForBackendState(
    async () => rendererWorkflow(client, "listExecutions", [workspaceId, definitionId, 5]),
    (value) =>
      value.executions.some((execution) => execution.status === "failed" && execution.completedAt),
  );
  return response.executions.find((execution) => execution.status === "failed");
}

function assertPostStartFailureExecution(execution) {
  if (execution.status !== "failed" || execution.terminalReason !== "action_failed") {
    throw new Error(
      `post-start cleanup execution = ${execution.status}/${execution.terminalReason}, want failed/action_failed`,
    );
  }
  const node = latestNodeExecution(execution, "activity");
  if (!node || node.status !== "failed") {
    throw new Error(`activity node was not failed: ${JSON.stringify(node)}`);
  }
  if (!node.error.includes("e2e injected workflow runner post-start persistence failure")) {
    throw new Error(`activity node error did not expose post-start failure: ${node.error}`);
  }
  if (!runnerRef(node, "chat.conversation") || !runnerRef(node, "chat.run")) {
    throw new Error(`failed node did not retain cleanup runner refs: ${JSON.stringify(node)}`);
  }
  return node;
}

async function assertWorkflowChatRunCancelled(backend, workspaceId, nodeExecution) {
  const conversationId = runnerRef(nodeExecution, "chat.conversation");
  const runId = runnerRef(nodeExecution, "chat.run");
  await waitForBackendState(
    async () => backend.post("/chat/runs/list", { conversationId, workspaceId }),
    (response) => response.runs.some((run) => run.id === runId && run.status === "cancelled"),
  );
}

async function waitForWorkflowExecution(client, workspaceId, executionId, isReady) {
  return waitForBackendState(
    async () => rendererWorkflow(client, "readExecution", [workspaceId, executionId]),
    isReady,
  );
}

async function rendererWorkflow(client, method, args) {
  return client.evaluate(
    `window.setta.workflow[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

function latestNodeExecution(execution, nodeId) {
  return execution.nodeExecutions.filter((nodeExecution) => nodeExecution.nodeId === nodeId).at(-1);
}

function runnerRef(nodeExecution, kind) {
  return nodeExecution?.runnerRefs.find((ref) => ref.kind === kind)?.id ?? "";
}
