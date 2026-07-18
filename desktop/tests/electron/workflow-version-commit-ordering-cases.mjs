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

export async function runWorkflowVersionCommitOrderingWorkflowLaunch(results, { recordingRoot }) {
  const fixture = await createFixture("workflow-version-commit-ordering");
  const recordingDir = join(recordingRoot, "workflow-version-commit-ordering");
  const context = await launchContext(fixture, recordingDir);
  let failure = null;

  try {
    const backend = await backendProbe(recordingDir);
    const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
    await createChat(context.client, backend, workspaceId);
    const definition = await rendererWorkflow(context.client, "createDefinition", [
      workspaceId,
      "Version commit ordering",
      "Invalid start attempts must not create immutable workflow versions.",
      blankGraph(),
    ]);

    await expectBlankStartFailure(context.client, workspaceId, definition.id);
    await assertNoExecutionSummaries(context.client, workspaceId, definition.id);

    const repairedGraph = startEndGraph();
    const validation = await rendererWorkflow(context.client, "validateDefinition", [
      workspaceId,
      repairedGraph,
    ]);
    if (!validation.valid) {
      throw new Error(`repaired workflow graph invalid: ${JSON.stringify(validation.diagnostics)}`);
    }
    await rendererWorkflow(context.client, "updateDefinition", [
      workspaceId,
      definition.id,
      definition.name,
      definition.description,
      repairedGraph,
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
    const summary = await waitForWorkflowSummary(
      context.client,
      workspaceId,
      definition.id,
      started.id,
    );
    if (
      summary.definitionVersionNumber !== 1 ||
      summary.definitionVersionId !== completed.definitionVersionId
    ) {
      throw new Error(
        `first successful workflow summary = ${JSON.stringify(summary)}, want version 1/${completed.definitionVersionId}`,
      );
    }

    await appendWorkflowState(recordingDir, {
      definitionId: definition.id,
      executionId: completed.id,
      type: "workflow_version_commit_ordering_verified",
      versionId: completed.definitionVersionId,
      versionNumber: summary.definitionVersionNumber,
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
      "/workflows/definitions/create",
      "/workflows/definitions/validate",
      "/workflows/definitions/update",
      "/workflows/executions/start",
      "/workflows/executions/list",
      "/workflows/executions/read",
    ],
    expectedIpcFailures: [
      (entry) =>
        entry.channel === "workflow:start-execution" &&
        typeof entry.error?.message === "string" &&
        entry.error.message.includes("blank workflow cannot be run"),
    ],
    ipcChannels: [
      "workspace:open-local-folder",
      "chat:create-conversation",
      "workflow:create-definition",
      "workflow:validate-definition",
      "workflow:update-definition",
      "workflow:start-execution",
      "workflow:list-executions",
      "workflow:read-execution",
    ],
  });
  results.push("workflow-version-commit-ordering");
  process.stdout.write("Electron chat workflow passed: workflow-version-commit-ordering\n");
}

async function expectBlankStartFailure(client, workspaceId, definitionId) {
  try {
    await rendererWorkflow(client, "startExecution", [workspaceId, definitionId]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("blank workflow cannot be run")) {
      return;
    }
    throw error;
  }
  throw new Error("blank workflow start succeeded, want validation failure");
}

async function assertNoExecutionSummaries(client, workspaceId, definitionId) {
  const response = await rendererWorkflow(client, "listExecutions", [workspaceId, definitionId, 5]);
  if (response.executions.length !== 0) {
    throw new Error(`invalid start left execution summaries: ${JSON.stringify(response)}`);
  }
}

async function waitForWorkflowExecution(client, workspaceId, executionId, isReady) {
  return waitForBackendState(
    async () => rendererWorkflow(client, "readExecution", [workspaceId, executionId]),
    isReady,
  );
}

async function waitForWorkflowSummary(client, workspaceId, definitionId, executionId) {
  const response = await waitForBackendState(
    async () => rendererWorkflow(client, "listExecutions", [workspaceId, definitionId, 5]),
    (value) => value.executions.some((execution) => execution.id === executionId),
  );
  return response.executions.find((execution) => execution.id === executionId);
}

async function rendererWorkflow(client, method, args) {
  return client.evaluate(
    `window.setta.workflow[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

function blankGraph() {
  return {
    agentDefaults: { model: "", permission: null, reasoningEffort: null },
    edges: [],
    layout: { nodes: [] },
    nodes: [],
  };
}

function startEndGraph() {
  return {
    agentDefaults: { model: "", permission: null, reasoningEffort: null },
    edges: [{ fromNodeId: "start", id: "start_end", kind: "normal", toNodeId: "end" }],
    layout: {
      nodes: [
        { nodeId: "start", x: 0, y: 0 },
        { nodeId: "end", x: 260, y: 0 },
      ],
    },
    nodes: [
      { id: "start", kind: "start" },
      { id: "end", kind: "end" },
    ],
  };
}
