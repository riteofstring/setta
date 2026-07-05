import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import process from "node:process";

import {
  assertAssistantCompleted,
  assertNoActiveRun,
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  createChat,
  launchContext,
  submitComposer,
  stopLaunchedContext,
  waitForBackendState,
  waitForDriverState,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

const workflowAuthoringTimeoutMs = 60_000;
const workflowAuthoringPrompt =
  "Please create, validate, save, and run a tiny Setta workflow with the workflow-builder skill and the setta workflow CLI for the workflow authoring CLI smoke.";
const workflowAuthoringDefinitionName = "CLI Authored Workflow";

export async function runProtocolWorkflowAuthoringCLIWorkflow(
  client,
  backend,
  workspaceId,
  fixture,
) {
  const conversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, workflowAuthoringPrompt, "Send message");
  const run = await waitForSingleConversationRunStatus(
    backend,
    workspaceId,
    conversationId,
    "completed",
    workflowAuthoringTimeoutMs,
  );
  await assertAssistantCompleted(backend, workspaceId, conversationId, run.id);
  await waitForTexts(
    client,
    ["CLI-authored workflow saved and run.", workflowAuthoringDefinitionName],
    workflowAuthoringTimeoutMs,
  );

  const definition = await waitForWorkflowDefinitionByName(backend, workspaceId);
  await assertWorkflowDefinitionVisibleInSidebar(client, definition.name);
  await assertRendererWorkflowDefinitionVisible(client, workspaceId, definition.id);
  const execution = await waitForWorkflowExecutionForDefinition(
    backend,
    workspaceId,
    definition.id,
  );
  await assertWorkflowAuthoringActivity(backend, workspaceId, run.id);
  await assertWorkflowAuthoringAuditRecords(
    join(fixture.appDataDir, "runtime", "workflow-command-audit.jsonl"),
    workspaceId,
    definition.id,
    execution.id,
  );
  await assertNoActiveRun(backend, workspaceId, conversationId);
  return { conversationId, definition, execution, runId: run.id };
}

export async function runProtocolWorkflowAuthoringPersistenceWorkflow({
  backend,
  context,
  fakeCodexBinDir,
  fixture,
  launchOptions,
  onContextChanged,
  recordingDir,
  restartRecordingDir,
  workspaceId,
}) {
  const logs = [];
  const authoring = await runProtocolWorkflowAuthoringCLIWorkflow(
    context.client,
    backend,
    workspaceId,
    fixture,
  );
  await assertProtocolWorkflowAuthoringReloadRecovery(
    context.client,
    backend,
    workspaceId,
    authoring.definition,
  );
  await captureScreenshot(context.client, join(recordingDir, "success.png"));
  logs.push(...context.electron.logs);
  await stopLaunchedContext(context);
  onContextChanged(null);

  const restartedContext = await launchContext(fixture, restartRecordingDir, launchOptions);
  onContextChanged(restartedContext);
  const restartedBackend = await backendProbe(restartRecordingDir);
  await assertProtocolWorkflowAuthoringRestartRecovery({
    backend: restartedBackend,
    client: restartedContext.client,
    definition: authoring.definition,
    fakeCodexBinDir,
    fixture,
    workspaceId,
  });
  await captureScreenshot(restartedContext.client, join(restartRecordingDir, "success.png"));
  return { logs };
}

export async function assertProtocolWorkflowAuthoringRestartRecording(restartRecordingDir) {
  await assertRecordingEvidence(restartRecordingDir, {
    backendPaths: [
      "/workspace-session",
      "/workflows/definitions/read",
      "/workflows/definitions/list",
    ],
    ipcChannels: [],
  });
}

export async function assertProtocolWorkflowAuthoringReloadRecovery(
  client,
  backend,
  workspaceId,
  definition,
) {
  await reloadSettaPage(client);
  await waitForTexts(client, ["workspace-root", definition.name], workflowAuthoringTimeoutMs);
  await assertWorkflowDefinitionPersisted(backend, workspaceId, definition);
  await assertWorkflowDefinitionVisibleInSidebar(client, definition.name);
  await assertRendererWorkflowDefinitionVisible(client, workspaceId, definition.id);
}

export async function assertProtocolWorkflowAuthoringRestartRecovery({
  backend,
  client,
  definition,
  fakeCodexBinDir,
  fixture,
  workspaceId,
}) {
  const session = await waitForBackendState(
    async () => backend.get("/workspace-session"),
    (value) => value.selectedWorkspaceId === workspaceId,
    workflowAuthoringTimeoutMs,
  );
  if (!session.activeWorkspaces.some((workspace) => workspace.id === workspaceId)) {
    throw new Error(`restarted workflow session missing workspace: ${JSON.stringify(session)}`);
  }
  await waitForTexts(client, ["workspace-root", definition.name], workflowAuthoringTimeoutMs);
  await assertWorkflowDefinitionPersisted(backend, workspaceId, definition);
  await assertWorkflowDefinitionVisibleInSidebar(client, definition.name);
  await assertRendererWorkflowDefinitionVisible(client, workspaceId, definition.id);
  const cliDefinition = await readWorkflowDefinitionWithCLI(
    fakeCodexBinDir,
    fixture.appDataDir,
    definition.id,
  );
  if (
    cliDefinition.id !== definition.id ||
    cliDefinition.workspaceId !== workspaceId ||
    cliDefinition.name !== definition.name
  ) {
    throw new Error(
      `workflow CLI read after restart returned mismatch: ${JSON.stringify(cliDefinition)}`,
    );
  }
}

async function waitForSingleConversationRunStatus(
  backend,
  workspaceId,
  conversationId,
  status,
  timeoutMs,
) {
  return waitForBackendState(
    async () => {
      const list = await backend.post("/chat/runs/list", { conversationId, workspaceId });
      if (list.runs.length > 1) {
        throw new Error(
          `workflow authoring conversation has multiple runs: ${JSON.stringify(list.runs)}`,
        );
      }
      const run = list.runs[0] ?? null;
      if (run === null) {
        return null;
      }
      if (run.status === status) {
        return run;
      }
      if (workflowAuthoringTerminalRunStatus(run.status)) {
        const details = await workflowAuthoringFailureDetails(
          backend,
          workspaceId,
          conversationId,
          run,
        );
        throw new Error(
          `workflow authoring run ended ${run.status}: ${run.error}: ${JSON.stringify(details)}`,
        );
      }
      return null;
    },
    Boolean,
    timeoutMs,
  );
}

function workflowAuthoringTerminalRunStatus(status) {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "interrupted"
  );
}

async function workflowAuthoringFailureDetails(backend, workspaceId, conversationId, run) {
  const [activity, diagnostics, page] = await Promise.all([
    backend.post("/chat/runs/activity", { limit: 100, runId: run.id, workspaceId }),
    backend.post("/chat/diagnostics/list", { conversationId, runId: run.id, workspaceId }),
    backend.post("/chat/messages/page", { conversationId, limit: 40, workspaceId }),
  ]);
  return {
    activity: workflowAuthoringActivitySummary(activity),
    diagnostics: diagnostics.diagnostics ?? [],
    messages: (page.messages ?? []).map((message) => ({
      role: message.role,
      status: message.status,
      text: workflowAuthoringMessageText(message),
    })),
  };
}

function workflowAuthoringActivitySummary(page) {
  return (page.activity ?? []).map((item) => ({
    command: workflowAuthoringActivityCommand(item),
    details: item.details ?? null,
    status: item.status,
    title: item.title,
    type: item.type,
  }));
}

function workflowAuthoringMessageText(message) {
  return (message.parts ?? [])
    .map((part) => part.text?.text ?? "")
    .filter((text) => text !== "")
    .join("\n");
}

async function waitForWorkflowDefinitionByName(backend, workspaceId) {
  return waitForBackendState(
    async () => {
      const response = await backend.post("/workflows/definitions/list", { workspaceId });
      return (
        response.definitions.find(
          (definition) => definition.name === workflowAuthoringDefinitionName,
        ) ?? null
      );
    },
    Boolean,
    workflowAuthoringTimeoutMs,
  );
}

async function assertWorkflowDefinitionPersisted(backend, workspaceId, expectedDefinition) {
  const definition = await waitForWorkflowDefinitionByID(
    backend,
    workspaceId,
    expectedDefinition.id,
  );
  if (definition.name !== expectedDefinition.name) {
    throw new Error(
      `workflow definition persisted with unexpected name: ${JSON.stringify(definition)}`,
    );
  }
}

async function waitForWorkflowDefinitionByID(backend, workspaceId, definitionId) {
  return waitForBackendState(
    async () => {
      const response = await backend.post("/workflows/definitions/read", {
        definitionId,
        workspaceId,
      });
      return response.id === definitionId ? response : null;
    },
    Boolean,
    workflowAuthoringTimeoutMs,
  );
}

async function assertWorkflowDefinitionVisibleInSidebar(client, definitionName) {
  await waitForDriverState(
    client,
    "sidebarWorkflowRows",
    {},
    (sidebar) => sidebar.ok && sidebar.rows.some((row) => row.text.includes(definitionName)),
    workflowAuthoringTimeoutMs,
  );
}

async function assertRendererWorkflowDefinitionVisible(client, workspaceId, definitionId) {
  await waitForDriverState(
    client,
    "workflowDefinitions",
    { workspaceId },
    (definitions) => definitions.some((definition) => definition.id === definitionId),
    workflowAuthoringTimeoutMs,
  );
}

async function waitForWorkflowExecutionForDefinition(backend, workspaceId, definitionId) {
  const response = await waitForBackendState(
    async () =>
      backend.post("/workflows/executions/list", { definitionId, limit: 20, workspaceId }),
    (value) =>
      value.executions.some(
        (execution) =>
          execution.definitionId === definitionId &&
          (execution.status === "completed" || execution.status === "running"),
      ),
    workflowAuthoringTimeoutMs,
  );
  const execution = response.executions.find(
    (candidate) => candidate.definitionId === definitionId,
  );
  if (!execution) {
    throw new Error(`workflow execution missing after authoring run: ${JSON.stringify(response)}`);
  }
  return execution;
}

async function assertWorkflowAuthoringActivity(backend, workspaceId, runId) {
  const page = await waitForBackendState(
    async () => backend.post("/chat/runs/activity", { limit: 100, runId, workspaceId }),
    (value) => workflowAuthoringCommandCoverage(value).complete,
    workflowAuthoringTimeoutMs,
  );
  const forbidden = (page.activity ?? []).filter(
    (item) => item.type === "dynamic_tool_call" || item.type === "mcp_tool_call",
  );
  if (forbidden.length > 0) {
    throw new Error(
      `workflow authoring used dynamic tools or MCP instead of the CLI: ${JSON.stringify(forbidden)}`,
    );
  }
}

function workflowAuthoringCommandCoverage(page) {
  const commands = (page.activity ?? [])
    .map((item) => workflowAuthoringActivityCommand(item))
    .filter((command) => command.startsWith("setta workflow "));
  const expectedPrefixes = [
    "setta workflow current-workspace",
    "setta workflow schema",
    "setta workflow definitions validate",
    "setta workflow definitions save",
    "setta workflow definitions list",
    "setta workflow executions start",
    "setta workflow executions read",
  ];
  return {
    commands,
    complete: expectedPrefixes.every((prefix) =>
      commands.some((command) => command.startsWith(prefix)),
    ),
  };
}

function workflowAuthoringActivityCommand(item) {
  return (
    commandExecutionDetails(item)?.command ??
    item.details?.commandExecution?.command ??
    item.details?.command ??
    ""
  );
}

function commandExecutionDetails(item) {
  if (item.details?.kind !== "command_execution") {
    return null;
  }
  return item.details.commandExecution;
}

async function assertWorkflowAuthoringAuditRecords(
  auditPath,
  workspaceId,
  definitionId,
  executionId,
) {
  const records = await waitForBackendState(
    async () => readJSONLines(auditPath),
    (items) =>
      items.some((record) =>
        workflowAuthoringSaveAuditRecordMatches(record, workspaceId, definitionId),
      ) &&
      items.some((record) =>
        workflowAuthoringStartAuditRecordMatches(record, workspaceId, definitionId, executionId),
      ),
    workflowAuthoringTimeoutMs,
  );
  for (const record of records) {
    if (
      record.commandName === "setta workflow definitions save" ||
      record.commandName === "setta workflow executions start"
    ) {
      assertWorkflowAuthoringAuditDevice(record);
    }
  }
}

function workflowAuthoringSaveAuditRecordMatches(record, workspaceId, definitionId) {
  return (
    record.commandName === "setta workflow definitions save" &&
    record.outcome === "workflow_definition_saved" &&
    record.workspaceId === workspaceId &&
    record.definitionId === definitionId &&
    record.saveOperation === "create" &&
    record.saved === true &&
    record.validation?.valid === true
  );
}

function workflowAuthoringStartAuditRecordMatches(record, workspaceId, definitionId, executionId) {
  return (
    record.commandName === "setta workflow executions start" &&
    record.outcome === "workflow_execution_started" &&
    record.workspaceId === workspaceId &&
    record.definitionId === definitionId &&
    record.executionId === executionId &&
    record.validation?.valid === true
  );
}

function assertWorkflowAuthoringAuditDevice(record) {
  const session = record.authenticatedDeviceSession;
  if (
    typeof session?.deviceId !== "string" ||
    session.deviceId === "" ||
    session.scope !== "full" ||
    typeof session.displayName !== "string" ||
    !session.displayName.startsWith("Setta CLI workflow ")
  ) {
    throw new Error(`workflow audit record missing CLI auth session: ${JSON.stringify(record)}`);
  }
}

async function readJSONLines(path) {
  try {
    const content = await readFile(path, "utf8");
    return content
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function reloadSettaPage(client) {
  await client.call("Page.enable");
  const loaded = waitForPageLoad(client);
  await client.call("Page.reload", { ignoreCache: true });
  await loaded;
  await client.call("Runtime.enable");
}

function waitForPageLoad(client) {
  return new Promise((resolvePromise, reject) => {
    const timeout = globalThis.setTimeout(() => {
      off();
      reject(new Error("renderer reload did not emit Page.loadEventFired"));
    }, workflowAuthoringTimeoutMs);
    const off = client.on("Page.loadEventFired", () => {
      globalThis.clearTimeout(timeout);
      off();
      resolvePromise();
    });
  });
}

async function readWorkflowDefinitionWithCLI(fakeCodexBinDir, appDataDir, definitionId) {
  const result = await runSettaWorkflowCommand(fakeCodexBinDir, appDataDir, [
    "workflow",
    "definitions",
    "read",
    "--app-data-dir",
    appDataDir,
    definitionId,
  ]);
  if (result.status !== 0) {
    throw new Error(
      `setta workflow definitions read after restart exited ${result.status}: stdout=${result.stdout} stderr=${result.stderr}`,
    );
  }
  return parseWorkflowCLIJSON("setta workflow definitions read", result.stdout);
}

function runSettaWorkflowCommand(fakeCodexBinDir, appDataDir, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("setta", args, {
      cwd: process.cwd(),
      env: workflowCLIEnv(fakeCodexBinDir, appDataDir),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = globalThis.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`setta workflow command timed out: ${["setta", ...args].join(" ")}`));
    }, workflowAuthoringTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      globalThis.clearTimeout(timeout);
      resolvePromise({ signal, status: signal ? 1 : (code ?? 1), stderr, stdout });
    });
  });
}

function workflowCLIEnv(fakeCodexBinDir, appDataDir) {
  const env = { ...process.env, SETTA_APP_DATA_DIR: appDataDir };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  env[pathKey] = `${fakeCodexBinDir}${delimiter}${env[pathKey] ?? ""}`;
  return env;
}

function parseWorkflowCLIJSON(command, stdout) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`parse ${command} JSON output: ${message}: ${stdout}`, { cause: error });
  }
}
