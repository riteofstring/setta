import process from "node:process";
import { chmod, copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  assertAssistantCompleted,
  assertNoActiveRun,
  clickButtonByAria,
  createChat,
  setInputValue,
  submitComposer,
  waitForBackendState,
  waitForCommandResult,
  waitForGoalStatus,
  waitForRunStatus,
  waitForState,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

const fakeCodexAppServerFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-codex-app-server.mjs",
);
const goalBackgroundTerminal = {
  command: "npm run goal-bg",
  idleGapOutput: "goal background idle output\n",
  itemId: "goal_bg_terminal",
  processId: "goal_bg_process",
  secondTurnOutput: "goal background turn B output\n",
};
const goalForegroundUnifiedExec = {
  command: "command -v tokei",
  itemId: "goal_fg_command",
  processId: "goal_fg_process",
};

export async function installFakeCodexAppServer(fixture) {
  const binDir = join(fixture.tempRoot, "fake-bin");
  await mkdir(binDir, { recursive: true });
  const scriptPath = join(binDir, "fake-codex-app-server.mjs");
  await copyFile(fakeCodexAppServerFixture, scriptPath);
  if (process.platform === "win32") {
    const commandPath = join(binDir, "codex.cmd");
    await writeFile(commandPath, `@echo off\r\nnode "${scriptPath}" %*\r\n`, "utf8");
    return { binDir, commandPath };
  }
  const commandPath = join(binDir, "codex");
  await writeFile(commandPath, `#!/usr/bin/env sh\nexec node "${scriptPath}" "$@"\n`, "utf8");
  await chmod(commandPath, 0o755);
  return { binDir, commandPath };
}

export async function assertProtocolNotificationActivity(
  client,
  backend,
  workspaceId,
  conversationId,
  runId,
) {
  const page = await backend.post("/chat/runs/activity", { limit: 100, runId, workspaceId });
  await assertRunActivityItem(page, "hook", (item) => item.title === "Hook: pre-command");
  await assertRunActivityItem(
    page,
    "approval_review",
    (item) => item.details?.approval?.reviewId === "review_fake",
  );
  await assertRunActivityItem(
    page,
    "context_compaction",
    (item) => item.title === "Context compaction" && item.status === "completed",
  );
  await assertRunActivityItem(page, "file_change", (item) => isProtocolFileChangeItem(item));
  await assertRunActivityItem(page, "diff", (item) => isProtocolDiffItem(item));
  await assertRunActivityItem(page, "reasoning", (item) => item.hiddenText === "private reasoning");
  await assertRunActivityItem(
    page,
    "command_execution",
    (item) => commandExecutionDetails(item)?.processId === "process_fake",
  );
  await assertRunActivityItem(
    page,
    "dynamic_tool_call",
    (item) =>
      item.status === "completed" &&
      item.details?.dynamicToolCall?.namespace === "setta" &&
      item.details.dynamicToolCall.toolName === "workspace_context" &&
      JSON.stringify(item.details.dynamicToolCall.result?.contentItems ?? []).includes("rootPath"),
  );
  await assertRunActivityItem(
    page,
    "dynamic_tool_call",
    (item) =>
      item.status === "failed" &&
      item.details?.dynamicToolCall?.namespace === "setta" &&
      item.details.dynamicToolCall.toolName === "missing_tool" &&
      item.details.dynamicToolCall.error.includes("unsupported dynamic tool"),
  );
  await assertRunActivityItem(page, "mcp_tool_call", (item) => isCompletedMCPToolCallItem(item));
  await assertRunActivityItem(page, "mcp_tool_call", (item) => isFailedMCPToolCallItem(item));
  const mcpActivity = (page.activity ?? []).find((row) => isProjectedMCPActivityRow(row));
  if (!mcpActivity) {
    throw new Error(
      `projected MCP activity missing generated details: ${JSON.stringify(page.activity)}`,
    );
  }
  await assertProtocolMCPActivityRendered(client, mcpActivity.sourceRunItemId);
  await assertProtocolMCPActivitySearchable(client, mcpActivity.sourceRunItemId);
  await assertProtocolFileChangeSearchable(client);
  await assertProtocolDiffSearchable(client);
  await assertRunActivityItem(page, "notice", (item) => item.noticeKind === "deprecationNotice");
  if ((page.activity ?? []).some((row) => row.type === "reasoning")) {
    throw new Error(`reasoning leaked into projected activity: ${JSON.stringify(page.activity)}`);
  }
  if ((page.activity ?? []).some((row) => row.type === "agent_message")) {
    throw new Error(
      `agent messages leaked into projected activity: ${JSON.stringify(page.activity)}`,
    );
  }

  const diagnostics = await backend.post("/chat/diagnostics/list", {
    conversationId,
    runId,
    workspaceId,
  });
  const warningCodes = diagnostics.diagnostics.map((diagnostic) => diagnostic.code);
  if (
    !warningCodes.includes("codex_windows_world_writable_warning") ||
    !warningCodes.includes("codex_realtime_notification_ignored")
  ) {
    throw new Error(
      `protocol diagnostics missing expected warnings: ${JSON.stringify(diagnostics)}`,
    );
  }
}

function isCompletedMCPToolCallItem(item) {
  const details = expectedMCPToolCallDetails(item, "completed", "github", "search");
  if (details === null) {
    return false;
  }
  if (!details.resultSummary.includes("Found repository data")) {
    return false;
  }
  if (mcpToolResultRepositories(details) !== 1) {
    return false;
  }
  return mcpToolResultTraceID(details) === "mcp_trace";
}

function isFailedMCPToolCallItem(item) {
  const details = expectedMCPToolCallDetails(item, "failed", "github", "broken_search");
  return details !== null && details.error === "MCP tool failed";
}

function isProjectedMCPActivityRow(row) {
  return (
    row.type === "mcp_tool_call" &&
    row.title === "MCP: github" &&
    row.details?.mcpToolCall?.result?.structuredContent?.repositories === 1
  );
}

function expectedMCPToolCallDetails(item, status, serverName, toolName) {
  if (item.status !== status || item.details?.kind !== "mcp_tool_call") {
    return null;
  }
  const details = item.details.mcpToolCall;
  if (details.serverName !== serverName || details.toolName !== toolName) {
    return null;
  }
  return details;
}

function commandExecutionDetails(item) {
  if (item.details?.kind !== "command_execution") {
    return null;
  }
  return item.details.commandExecution;
}

function isProtocolFileChangeItem(item) {
  if (item.details?.kind !== "file_change") {
    return false;
  }
  const details = item.details.fileChange;
  const firstPath = details?.paths?.[0];
  return (
    firstPath?.path === "/tmp/workspace/main.go" &&
    firstPath.operation === "update" &&
    firstPath.patch.includes("+updated") &&
    firstPath.additions === 1
  );
}

function isProtocolDiffItem(item) {
  const details = protocolDiffDetails(item);
  if (details === null) {
    return false;
  }
  return (
    details.summary === "1 file, +1 -1" &&
    isProtocolDiffPath(details.paths?.[0]) &&
    details.patch.includes("+updated")
  );
}

function protocolDiffDetails(item) {
  if (item.details?.kind !== "diff") {
    return null;
  }
  return item.details.diff ?? null;
}

function isProtocolDiffPath(path) {
  return (
    path?.path === "main.go" &&
    path.operation === "update" &&
    path.additions === 1 &&
    path.deletions === 1
  );
}

function mcpToolResultRepositories(details) {
  return details.result?.structuredContent?.repositories;
}

function mcpToolResultTraceID(details) {
  return details.result?._meta?.traceId;
}

async function assertProtocolMCPActivityRendered(client, sourceRunItemId) {
  await openProtocolActivityRow(client, sourceRunItemId);
  await waitForState(
    client,
    `(() => {
      const sourceRunItemId = ${JSON.stringify(sourceRunItemId)};
      const row = Array.from(document.querySelectorAll('[data-testid="run-activity-row"]'))
        .find((candidate) => candidate.getAttribute("data-run-item-id") === sourceRunItemId);
      const text = row?.innerText ?? "";
      return {
        ok:
          text.includes("MCP: github") &&
          text.includes("tool: search") &&
          text.includes("ARGUMENTS") &&
          text.includes("CONTENT") &&
          text.includes("STRUCTURED CONTENT") &&
          text.includes("METADATA") &&
          text.includes("repositories") &&
          text.includes("mcp_trace"),
        text,
      };
    })()`,
    (value) => value.ok,
  );
}

async function assertProtocolMCPActivitySearchable(client, sourceRunItemId) {
  await openProtocolChatSearch(client);
  await setInputValue(client, 'input[placeholder="Search chat"]', "mcp_trace");
  await waitForState(
    client,
    `(() => {
      const sourceRunItemId = ${JSON.stringify(sourceRunItemId)};
      const row = document.querySelector('[data-activity-focused="true"]');
      return {
        ok:
          row?.getAttribute("data-run-item-id") === sourceRunItemId &&
          row?.innerText.includes("mcp_trace"),
        sourceRunItemId: row?.getAttribute("data-run-item-id") ?? "",
        text: row?.innerText ?? "",
      };
    })()`,
    (value) => value.ok,
  );
  await clickButtonByAria(client, "Close chat search");
}

async function assertProtocolFileChangeSearchable(client) {
  await openProtocolChatSearch(client);
  await setInputValue(client, 'input[placeholder="Search chat"]', "+updated");
  await waitForState(
    client,
    `(() => {
      const row = document.querySelector('[data-activity-focused="true"]');
      return {
        ok:
          row?.innerText.includes("Updated main.go") &&
          row?.innerText.includes("main.go") &&
          row?.innerText.includes("PATCH"),
        text: row?.innerText ?? "",
      };
    })()`,
    (value) => value.ok,
  );
  await clickButtonByAria(client, "Close chat search");
}

async function assertProtocolDiffSearchable(client) {
  await openProtocolChatSearch(client);
  await setInputValue(client, 'input[placeholder="Search chat"]', "-old");
  await waitForState(
    client,
    `(() => {
      const row = document.querySelector('[data-activity-focused="true"]');
      return {
        ok:
          row?.innerText.includes("Diff updated: 1 file, +1 -1") &&
          row?.innerText.includes("main.go") &&
          row?.innerText.includes("PATCH"),
        text: row?.innerText ?? "",
      };
    })()`,
    (value) => value.ok,
  );
  await clickButtonByAria(client, "Close chat search");
}

async function openProtocolChatSearch(client) {
  await client.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      ctrlKey: true,
      key: "f",
      metaKey: true,
    }));
  })()`);
  await waitForState(
    client,
    `(() => ({ open: Boolean(document.querySelector('input[placeholder="Search chat"]')) }))()`,
    (value) => value.open,
  );
}

async function openProtocolActivityRow(client, sourceRunItemId) {
  const startedAt = Date.now();
  let opened = null;
  while (Date.now() - startedAt < 2_000) {
    opened = await client.evaluate(`(() => {
      const sourceRunItemId = ${JSON.stringify(sourceRunItemId)};
      const transcript = document.querySelector('[data-testid="chat-transcript-region"]') ?? document;
      const groupHeaders = Array.from(transcript.querySelectorAll('[data-testid="activity-group-header"]'));
      const groupHeader = groupHeaders.find((candidate) =>
        (candidate.getAttribute("data-activity-group-source-run-item-ids") ?? "")
          .split(/\\s+/)
          .includes(sourceRunItemId)
      );
      let rows = Array.from(transcript.querySelectorAll('[data-testid="run-activity-row"]'));
      let row = rows.find((candidate) => candidate.getAttribute("data-run-item-id") === sourceRunItemId);
      if (
        !row &&
        groupHeader instanceof HTMLButtonElement &&
        groupHeader.getAttribute("data-activity-group-expanded") !== "true"
      ) {
        groupHeader.click();
        rows = Array.from(transcript.querySelectorAll('[data-testid="run-activity-row"]'));
        row = rows.find((candidate) => candidate.getAttribute("data-run-item-id") === sourceRunItemId);
      }
      if (!row) {
        return {
          ok: false,
          reason: "missing-row",
          groups: groupHeaders.map((candidate) => ({
            expanded: candidate.getAttribute("data-activity-group-expanded") ?? "",
            sourceRunItemIds: candidate.getAttribute("data-activity-group-source-run-item-ids") ?? "",
            text: candidate.innerText,
          })),
          rows: rows.map((candidate) => ({
            sourceRunItemId: candidate.getAttribute("data-run-item-id") ?? "",
            text: candidate.innerText,
          })),
        };
      }
      if (!(row instanceof HTMLDetailsElement)) {
        return { ok: true, reason: "compact-row" };
      }
      if (!row.open) {
        row.querySelector("summary")?.click();
      }
      return { ok: row.open, reason: row.open ? "opened" : "not-opened", text: row.innerText };
    })()`);
    if (opened.ok) {
      return;
    }
    await delay(50);
  }
  throw new Error(
    `protocol activity row ${sourceRunItemId} was not opened: ${JSON.stringify(opened)}`,
  );
}

export async function runProtocolGoalMultiTurnWorkflow(client, backend, workspaceId) {
  const conversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "/goal phase0 codex multi turn", "Send message");
  const commandPage = await waitForCommandResult(
    backend,
    workspaceId,
    conversationId,
    "Goal set: phase0 codex multi turn",
  );
  const runId = goalRunIDFromCommandPage(commandPage);
  const run = await waitForRunStatus(backend, workspaceId, conversationId, runId, "completed");
  await assertAssistantCompleted(backend, workspaceId, conversationId, run.id);
  await waitForGoalStatus(backend, workspaceId, conversationId, "complete");
  await waitForTexts(client, ["Goal turn A.", "Goal turn B."]);
  await assertNoActiveRun(backend, workspaceId, conversationId);
}

export async function runProtocolGoalForegroundUnifiedExecWorkflow(client, backend, workspaceId) {
  const conversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "/goal phase5 codex foreground command", "Send message");
  const commandPage = await waitForCommandResult(
    backend,
    workspaceId,
    conversationId,
    "Goal set: phase5 codex foreground command",
  );
  const runId = goalRunIDFromCommandPage(commandPage);
  const run = await waitForRunStatus(backend, workspaceId, conversationId, runId, "completed");
  await assertAssistantCompleted(backend, workspaceId, conversationId, run.id);
  await waitForGoalStatus(backend, workspaceId, conversationId, "complete");
  await waitForTexts(client, ["Checking available tools.", goalForegroundUnifiedExec.command]);
  await assertProtocolGoalForegroundUnifiedExecProjections(
    client,
    backend,
    workspaceId,
    conversationId,
    run.id,
  );
  await assertNoActiveRun(backend, workspaceId, conversationId);
}

export async function runProtocolGoalBackgroundTerminalWorkflow(
  client,
  backend,
  workspaceId,
  fixture,
) {
  const conversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "/goal phase5 codex background terminal", "Send message");
  const commandPage = await waitForCommandResult(
    backend,
    workspaceId,
    conversationId,
    "Goal set: phase5 codex background terminal",
  );
  const runId = goalRunIDFromCommandPage(commandPage);
  await assertProtocolGoalBackgroundTerminalMonitor(client);
  const run = await waitForRunStatus(backend, workspaceId, conversationId, runId, "completed");
  await assertAssistantCompleted(backend, workspaceId, conversationId, run.id);
  await waitForGoalStatus(backend, workspaceId, conversationId, "complete");
  await waitForTexts(client, ["Goal turn A.", "Goal turn B.", goalBackgroundTerminal.command]);
  await assertProtocolBackgroundTerminalMarker(client);
  await waitForProtocolGoalBackgroundTerminalStore(fixture, workspaceId, conversationId);
  await assertProtocolGoalBackgroundTerminalProjections(
    client,
    backend,
    workspaceId,
    conversationId,
  );
  await assertNoActiveRun(backend, workspaceId, conversationId);
}

async function assertProtocolGoalBackgroundTerminalMonitor(client) {
  await waitForState(
    client,
    `(() => {
      const footer = document.querySelector('[data-testid="background-terminals-footer"]');
      return { present: Boolean(footer), text: footer?.innerText ?? "" };
    })()`,
    (value) => value.present && value.text.includes("1 background terminal running"),
  );
  await client.evaluate(
    `document.querySelector('[data-testid="background-terminals-footer"]')?.click()`,
  );
  await waitForState(
    client,
    protocolGoalBackgroundTerminalMonitorExpression(),
    (value) =>
      value.monitorOpen &&
      value.processes.some(
        (process) =>
          process.command === goalBackgroundTerminal.command &&
          process.status === "running" &&
          process.text.includes(goalBackgroundTerminal.idleGapOutput.trim()),
      ),
  );
  await waitForState(client, protocolGoalBackgroundTerminalMonitorExpression(), (value) =>
    value.processes.some(
      (process) =>
        process.command === goalBackgroundTerminal.command &&
        process.text.includes(goalBackgroundTerminal.secondTurnOutput.trim()),
    ),
  );
}

function protocolGoalBackgroundTerminalMonitorExpression() {
  return `(() => ({
    monitorOpen: Boolean(document.querySelector('[data-testid="background-terminal-monitor"]')),
    processes: Array.from(document.querySelectorAll('[data-testid="background-terminal-monitor-process"]')).map((row) => ({
      command: row.getAttribute("data-command") ?? "",
      status: row.getAttribute("data-status") ?? "",
      text: row.innerText,
    })),
  }))()`;
}

export async function runProtocolGoalCancellationWorkflow(client, backend, workspaceId) {
  const conversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "/goal phase4 codex cancel", "Send message");
  const commandPage = await waitForCommandResult(
    backend,
    workspaceId,
    conversationId,
    "Goal set: phase4 codex cancel",
  );
  const runId = goalRunIDFromCommandPage(commandPage);
  await waitForRunStatus(backend, workspaceId, conversationId, runId, "running");
  await waitForTexts(client, ["Goal cancel waiting."]);
  await clickButtonByAria(client, "Stop run");
  await waitForRunStatus(backend, workspaceId, conversationId, runId, "cancelled");
  await waitForGoalStatus(backend, workspaceId, conversationId, "paused");
  await assertNoActiveRun(backend, workspaceId, conversationId);
}

export async function runProtocolLivenessReconciliationWorkflow(client, backend, workspaceId) {
  const conversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "liveness reconciliation workflow", "Send message");
  const run = await waitForRunStatusForPrompt(
    backend,
    workspaceId,
    conversationId,
    "liveness reconciliation workflow",
    "running",
  );
  await waitForTexts(client, ["Liveness stream started."]);
  await waitForRendererLiveness(client, run.id, "attached", "working");

  const reconciled = await callRendererChatAPI(client, "reconcileRuns", [
    {
      conversationId,
      reason: "wake_recheck",
      workspaceId,
    },
  ]);
  assertReconciledRunLiveness(reconciled, run.id);
  await waitForRendererLiveness(client, run.id, "reconciling", "reconnecting");
  await waitForTexts(client, ["Reconnecting"]);
  await assertDegradedRunControls(client, { retry: true, stop: true });

  await clickButtonByAria(client, "Stop run");
  await waitForRunStatus(backend, workspaceId, conversationId, run.id, "cancelled");
  await assertNoActiveRun(backend, workspaceId, conversationId);
}

export async function runProtocolProviderRestartLivenessWorkflow(client, backend, workspaceId) {
  const conversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "app-server exit workflow", "Send message");
  const run = await waitForRunStatusForPrompt(
    backend,
    workspaceId,
    conversationId,
    "app-server exit workflow",
    "running",
  );
  await waitForTexts(client, ["Partial before provider restart."]);
  await waitForRendererLiveness(client, run.id, "reconciling", "reconnecting");
  const list = await backend.post("/chat/conversations/list", { workspaceId });
  const item = list.conversations.find((candidate) => candidate.conversation.id === conversationId);
  assertProviderRestartLivenessItem(item, run.id);
  await waitForTexts(client, ["Reconnecting"]);
  await assertDegradedRunControls(client, { retry: true, stop: true });
  await clickButtonByAria(client, "Stop run");
  await waitForRunStatus(backend, workspaceId, conversationId, run.id, "cancelled");
  await assertNoActiveRun(backend, workspaceId, conversationId);
}

export async function runProtocolStreamErrorLivenessWorkflow(client, backend, workspaceId) {
  const retryingConversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "retryable stream error workflow", "Send message");
  const retryingRun = await waitForRunStatusForPrompt(
    backend,
    workspaceId,
    retryingConversationId,
    "retryable stream error workflow",
    "running",
  );
  await waitForTexts(client, ["Retryable stream started."]);
  await waitForRendererLiveness(client, retryingRun.id, "reconciling", "reconnecting");
  await waitForTexts(client, ["Reconnecting"]);
  await assertStreamErrorLivenessItem(
    backend,
    workspaceId,
    retryingConversationId,
    retryingRun.id,
    {
      reason: "stream_resync",
      status: "reconciling",
    },
  );
  await assertDegradedRunControls(client, { retry: true, stop: true });
  await clickButtonByAria(client, "Stop run");
  await waitForRunStatus(backend, workspaceId, retryingConversationId, retryingRun.id, "cancelled");
  await assertNoActiveRun(backend, workspaceId, retryingConversationId);

  const lostConversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "nonretryable stream error workflow", "Send message");
  const lostRun = await waitForRunStatusForPrompt(
    backend,
    workspaceId,
    lostConversationId,
    "nonretryable stream error workflow",
    "running",
  );
  await waitForTexts(client, ["Partial before stream loss."]);
  await waitForRendererLiveness(client, lostRun.id, "lost", "lost");
  await waitForTexts(client, ["Connection lost", "stream disconnected before completion"]);
  await assertStreamErrorLivenessItem(backend, workspaceId, lostConversationId, lostRun.id, {
    error: "stream disconnected before completion",
    reason: "provider_unavailable",
    status: "lost",
  });
  await assertDegradedRunControls(client, { retry: true, stop: true });
  await clickButtonByAria(client, "Stop run");
  await waitForRunStatus(backend, workspaceId, lostConversationId, lostRun.id, "cancelled");
  await assertNoActiveRun(backend, workspaceId, lostConversationId);
}

async function waitForRunStatusForPrompt(backend, workspaceId, conversationId, prompt, status) {
  return waitForBackendState(async () => {
    const list = await backend.post("/chat/runs/list", { conversationId, workspaceId });
    return list.runs.find((run) => run.promptSummary === prompt && run.status === status) ?? null;
  }, Boolean);
}

function assertReconciledRunLiveness(response, runId) {
  const liveness = response?.result?.runs?.find((candidate) => candidate.runId === runId);
  if (!liveness) {
    throw new Error(`reconcile response missing run ${runId}: ${JSON.stringify(response)}`);
  }
  if (liveness.status !== "reconciling" || liveness.reason !== "wake_recheck") {
    throw new Error(`reconciled liveness status mismatch: ${JSON.stringify(liveness)}`);
  }
  if (!liveness.retryable || !liveness.cancellable) {
    throw new Error(`reconciled liveness capabilities mismatch: ${JSON.stringify(liveness)}`);
  }
}

function assertProviderRestartLivenessItem(item, runId) {
  if (!item) {
    throw new Error(`provider restart conversation missing for run ${runId}`);
  }
  const liveness = item.activeRunLiveness;
  if (item.activeRunId !== runId) {
    throw new Error(`provider restart active run mismatch: ${JSON.stringify(item)}`);
  }
  if (!liveness) {
    throw new Error(`provider restart liveness missing: ${JSON.stringify(item)}`);
  }
  if (liveness.status !== "reconciling" || liveness.reason !== "provider_restarted") {
    throw new Error(`provider restart liveness status mismatch: ${JSON.stringify(liveness)}`);
  }
  if (!liveness.retryable || !liveness.cancellable) {
    throw new Error(`provider restart liveness capabilities mismatch: ${JSON.stringify(liveness)}`);
  }
}

async function assertStreamErrorLivenessItem(
  backend,
  workspaceId,
  conversationId,
  runId,
  expected,
) {
  const list = await backend.post("/chat/conversations/list", { workspaceId });
  const liveness = requireStreamErrorLivenessItem(list, conversationId, runId);
  assertStreamErrorLiveness(liveness, expected);
}

function requireStreamErrorLivenessItem(list, conversationId, runId) {
  const item = list.conversations.find((candidate) => candidate.conversation.id === conversationId);
  if (!item) {
    throw new Error(`stream error conversation missing for run ${runId}`);
  }
  const liveness = item.activeRunLiveness;
  if (item.activeRunId !== runId || !liveness) {
    throw new Error(`stream error active liveness missing: ${JSON.stringify(item)}`);
  }
  return liveness;
}

function assertStreamErrorLiveness(liveness, expected) {
  if (liveness.status !== expected.status || liveness.reason !== expected.reason) {
    throw new Error(`stream error liveness status mismatch: ${JSON.stringify(liveness)}`);
  }
  if (expected.error !== undefined && liveness.error !== expected.error) {
    throw new Error(`stream error liveness error mismatch: ${JSON.stringify(liveness)}`);
  }
  if (!liveness.retryable || !liveness.cancellable) {
    throw new Error(`stream error liveness capabilities mismatch: ${JSON.stringify(liveness)}`);
  }
}

async function waitForRendererLiveness(client, runId, status, rowMode) {
  await waitForState(
    client,
    `(() => {
      const runId = ${JSON.stringify(runId)};
      const pane = document.querySelector('[data-testid="chat-detail-pane"]');
      const rows = Array.from(document.querySelectorAll('[data-block-kind="run_status"]'));
      const target = rows.find((row) => row.getAttribute("data-run-id") === runId);
      return {
        liveness: pane?.getAttribute("data-run-liveness-status") ?? "",
        mode: target?.getAttribute("data-run-status-mode") ?? "",
        text: target?.textContent ?? "",
      };
    })()`,
    (value) => value.liveness === status && value.mode === rowMode,
  );
}

async function assertDegradedRunControls(client, expected) {
  await waitForState(
    client,
    `(() => {
      const retry = document.querySelector('button[aria-label="Retry run liveness check"]');
      const stop = document.querySelector('button[aria-label="Stop run"]');
      return {
        retry: Boolean(retry && !retry.disabled),
        stop: Boolean(stop && !stop.disabled),
      };
    })()`,
    (controls) => controls.retry === expected.retry && controls.stop === expected.stop,
  );
}

async function assertProtocolGoalForegroundUnifiedExecProjections(
  client,
  backend,
  workspaceId,
  conversationId,
  runId,
) {
  const activityPage = await backend.post("/chat/runs/activity", {
    limit: 100,
    runId,
    workspaceId,
  });
  await assertRunActivityItem(activityPage, "command_execution", (item) => {
    const details = commandExecutionDetails(item);
    return (
      details?.command === goalForegroundUnifiedExec.command &&
      details.processId === goalForegroundUnifiedExec.processId &&
      item.status === "completed"
    );
  });

  const list = await backend.post("/chat/background-terminals/list", {
    conversationId,
    workspaceId,
  });
  if (Array.isArray(list.terminals) && list.terminals.length !== 0) {
    throw new Error(
      `foreground unified exec created backend background terminals: ${JSON.stringify(list)}`,
    );
  }

  const surface = await client.evaluate(`(() => ({
    footer: Boolean(document.querySelector('[data-testid="background-terminals-footer"]')),
    markers: Array.from(document.querySelectorAll('[data-testid="background-terminal-block"]')).map((el) => el.innerText),
    text: document.body.innerText,
  }))()`);
  if (
    surface.footer ||
    surface.markers.length !== 0 ||
    surface.text.includes("Started background terminal")
  ) {
    throw new Error(
      `foreground unified exec rendered background-terminal UI: ${JSON.stringify(surface)}`,
    );
  }
}

function goalRunIDFromCommandPage(page) {
  const assistant = page.messages.find(
    (message) => message.role === "assistant" && message.runId !== "",
  );
  if (!assistant) {
    throw new Error(`goal command page did not include assistant run: ${JSON.stringify(page)}`);
  }
  return assistant.runId;
}

async function assertProtocolBackgroundTerminalMarker(client) {
  const markers = await client.evaluate(`(() =>
    Array.from(document.querySelectorAll('[data-testid="background-terminal-block"]')).map((el) => ({
      processId: el.getAttribute("data-process-id") ?? "",
      text: el.innerText,
    }))
  )()`);
  const marker = markers.find((candidate) =>
    candidate.text.includes(goalBackgroundTerminal.command),
  );
  if (!marker) {
    throw new Error(`goal background terminal marker missing: ${JSON.stringify(markers)}`);
  }
  if (marker.processId === "") {
    throw new Error(
      `goal background terminal marker missing process id: ${JSON.stringify(marker)}`,
    );
  }
}

async function waitForProtocolGoalBackgroundTerminalStore(fixture, workspaceId, conversationId) {
  const conversationDir = join(
    fixture.appDataDir,
    "workspaces",
    workspaceId,
    "conversations",
    conversationId,
  );
  const startedAt = Date.now();
  let lastState = null;
  while (Date.now() - startedAt < 5000) {
    lastState = await readProtocolGoalBackgroundTerminalState(conversationDir);
    if (protocolGoalBackgroundTerminalStateReady(lastState)) {
      return;
    }
    await delay(100);
  }
  throw new Error(
    `timed out waiting for goal background terminal store state: ${JSON.stringify(lastState)}`,
  );
}

async function readProtocolGoalBackgroundTerminalState(conversationDir) {
  const processes = await readJsonFiles(join(conversationDir, "background_terminals"));
  const processRecord = processes.find(
    (candidate) => candidate.providerItemId === goalBackgroundTerminal.itemId,
  );
  const outputs =
    processRecord === undefined
      ? []
      : await readJsonFiles(join(conversationDir, "background_terminal_output", processRecord.id));
  return { outputs, process: processRecord ?? null };
}

function protocolGoalBackgroundTerminalStateReady(state) {
  if (
    state.process?.command !== goalBackgroundTerminal.command ||
    state.process?.processId !== goalBackgroundTerminal.processId ||
    state.process?.status !== "exited"
  ) {
    return false;
  }
  const outputText = state.outputs
    .slice()
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((output) => output.text)
    .join("");
  return (
    outputText === goalBackgroundTerminal.idleGapOutput + goalBackgroundTerminal.secondTurnOutput
  );
}

async function assertProtocolGoalBackgroundTerminalProjections(
  client,
  backend,
  workspaceId,
  conversationId,
) {
  const list = await backend.post("/chat/background-terminals/list", {
    conversationId,
    workspaceId,
  });
  const terminal = assertProtocolGoalBackgroundTerminalList(list, "backend HTTP list");

  const outputPage = await backend.post("/chat/background-terminals/output", {
    afterOrdinal: 0,
    conversationId,
    limit: 20,
    processId: terminal.id,
    workspaceId,
  });
  assertProtocolGoalBackgroundTerminalOutput(outputPage, terminal.id, "backend HTTP output");

  const ipcList = await callRendererChatAPI(client, "listBackgroundTerminals", [
    workspaceId,
    conversationId,
  ]);
  const ipcTerminal = assertProtocolGoalBackgroundTerminalList(ipcList, "renderer IPC list");
  const ipcOutputPage = await callRendererChatAPI(client, "getBackgroundTerminalOutput", [
    workspaceId,
    conversationId,
    ipcTerminal.id,
    0,
    20,
  ]);
  assertProtocolGoalBackgroundTerminalOutput(ipcOutputPage, ipcTerminal.id, "renderer IPC output");
}

function assertProtocolGoalBackgroundTerminalList(list, label) {
  if (!Array.isArray(list.terminals) || list.terminals.length !== 1) {
    throw new Error(`${label} terminals = ${JSON.stringify(list)}, want one goal terminal`);
  }
  const terminal = list.terminals[0];
  if (
    terminal.command !== goalBackgroundTerminal.command ||
    terminal.processId !== goalBackgroundTerminal.processId ||
    terminal.providerItemId !== goalBackgroundTerminal.itemId ||
    terminal.status !== "exited"
  ) {
    throw new Error(`${label} terminal = ${JSON.stringify(terminal)}`);
  }
  if (
    terminal.recentOutput.join("\n") !==
    "goal background idle output\ngoal background turn B output"
  ) {
    throw new Error(`${label} recent output = ${JSON.stringify(terminal.recentOutput)}`);
  }
  return terminal;
}

function assertProtocolGoalBackgroundTerminalOutput(page, processId, label) {
  if (page.processId !== processId || !Array.isArray(page.output) || page.output.length !== 2) {
    throw new Error(`${label} output page = ${JSON.stringify(page)}, want two chunks`);
  }
  const outputText = page.output.map((output) => output.text).join("");
  if (
    outputText !==
    goalBackgroundTerminal.idleGapOutput + goalBackgroundTerminal.secondTurnOutput
  ) {
    throw new Error(`${label} output text = ${JSON.stringify(outputText)}`);
  }
}

async function callRendererChatAPI(client, method, args) {
  return client.evaluate(
    `window.setta.chat[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

async function readJsonFiles(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    files.map(async (file) => JSON.parse(await readFile(join(dir, file), "utf8"))),
  );
}

async function assertRunActivityItem(page, type, matches) {
  const item = page.items.find((candidate) => candidate.type === type && matches(candidate));
  if (!item) {
    throw new Error(`run activity missing ${type}: ${JSON.stringify(page.items)}`);
  }
  return item;
}
