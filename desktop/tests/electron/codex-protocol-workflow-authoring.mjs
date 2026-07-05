import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  assertAssistantCompleted,
  assertNoActiveRun,
  createChat,
  submitComposer,
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
