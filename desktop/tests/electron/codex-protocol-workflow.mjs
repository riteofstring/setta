import process from "node:process";
import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import {
  assertAssistantCompleted,
  assertNoActiveRun,
  clickButtonByAria,
  clickButtonContainingText,
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
import { chatTextInput } from "./chat-input-helpers.mjs";

const fakeCodexAppServerFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-codex-app-server.mjs",
);
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

export async function runProtocolCurrentPlanAndGoalMultiTurnWorkflow(client, backend, workspaceId) {
  await runProtocolCurrentPlanWorkflow(client, backend, workspaceId);
  await runProtocolGoalMultiTurnWorkflow(client, backend, workspaceId);
}

async function runProtocolGoalMultiTurnWorkflow(client, backend, workspaceId) {
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

async function runProtocolCurrentPlanWorkflow(client, backend, workspaceId) {
  const conversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, "current plan workflow", "Send message");
  const run = await waitForRunStatusForPrompt(
    backend,
    workspaceId,
    conversationId,
    "current plan workflow",
    "running",
  );
  await waitForTexts(client, ["Current plan started."]);
  const initial = await waitForCurrentPlanSurface(client, {
    completedCount: "1",
    currentStep: "Render the active surface",
    runId: run.id,
    stepCount: "3",
  });
  await assertCurrentPlanExpanded(client, {
    explanation: "Planning the current active turn.",
    statuses: ["completed", "inProgress", "pending"],
  });

  await callRendererChatAPI(client, "steerMessage", [
    workspaceId,
    conversationId,
    chatTextInput("update current plan workflow"),
  ]);
  await waitForTexts(client, ["Current plan updated."]);
  const updated = await waitForCurrentPlanSurface(client, {
    completedCount: "2",
    currentStep: "Verify the active surface update",
    runId: run.id,
    stepCount: "3",
  });
  if (updated.runItemId !== initial.runItemId) {
    throw new Error(
      `current plan surface changed run item id after update: ${JSON.stringify({ initial, updated })}`,
    );
  }

  await callRendererChatAPI(client, "steerMessage", [
    workspaceId,
    conversationId,
    chatTextInput("complete current plan workflow"),
  ]);
  await waitForTexts(client, ["Current plan complete."]);
  await waitForRunStatus(backend, workspaceId, conversationId, run.id, "completed");
  await assertNoActiveRun(backend, workspaceId, conversationId);
  await waitForCurrentPlanSurface(client, {
    completedCount: "3",
    currentStep: "",
    phase: "complete",
    runId: run.id,
    stepCount: "3",
    stepText: "Verify the active surface update",
  });
  await delay(1700);
  await waitForCurrentPlanSurface(client, {
    completedCount: "3",
    currentStep: "",
    expanded: "true",
    phase: "complete",
    runId: run.id,
    stepCount: "3",
    stepText: "Verify the active surface update",
  });
  await client.evaluate(
    `document.querySelector('[data-testid="current-plan-footer"] button')?.click()`,
  );
  await waitForState(
    client,
    `(() => ({ present: Boolean(document.querySelector('[data-testid="current-plan-surface"]')) }))()`,
    (value) => !value.present,
  );
}

async function waitForCurrentPlanSurface(
  client,
  { completedCount, currentStep, expanded = "", phase = "active", runId, stepCount, stepText },
) {
  let lastSurface = null;
  await waitForState(
    client,
    `(() => {
      const surfaces = Array.from(document.querySelectorAll('[data-testid="current-plan-surface"]'));
      const surface = surfaces[0];
      return {
        completedCount: surface?.getAttribute("data-plan-completed-count") ?? "",
        count: surfaces.length,
        currentStep: surface?.getAttribute("data-current-step") ?? "",
        expanded: surface?.getAttribute("data-expanded") ?? "",
        phase: surface?.getAttribute("data-plan-state") ?? "",
        runId: surface?.getAttribute("data-run-id") ?? "",
        runItemId: surface?.getAttribute("data-run-item-id") ?? "",
        stepCount: surface?.getAttribute("data-plan-step-count") ?? "",
        text: surface?.innerText ?? "",
      };
    })()`,
    (value) => {
      lastSurface = value;
      return currentPlanSurfaceMatches(value, {
        completedCount,
        currentStep,
        expanded,
        phase,
        runId,
        stepCount,
        stepText,
      });
    },
  );
  return lastSurface;
}

function currentPlanSurfaceMatches(value, expected) {
  return (
    currentPlanSurfaceIdentityMatches(value, expected) &&
    currentPlanSurfaceStateMatches(value, expected) &&
    currentPlanSurfaceTextMatches(value, expected)
  );
}

function currentPlanSurfaceIdentityMatches(value, expected) {
  return value.count === 1 && value.runId === expected.runId;
}

function currentPlanSurfaceStateMatches(value, expected) {
  return (
    value.completedCount === expected.completedCount &&
    currentPlanSurfaceExpansionMatches(value, expected.expanded) &&
    value.phase === expected.phase &&
    value.stepCount === expected.stepCount &&
    value.currentStep === expected.currentStep
  );
}

function currentPlanSurfaceExpansionMatches(value, expanded) {
  return expanded === "" || value.expanded === expanded;
}

function currentPlanSurfaceTextMatches(value, expected) {
  return (
    value.text.includes(currentPlanSurfaceHeading(expected.phase)) &&
    value.text.includes(`${expected.completedCount}/${expected.stepCount} done`) &&
    value.text.includes(expected.stepText ?? expected.currentStep)
  );
}

function currentPlanSurfaceHeading(phase) {
  return phase === "complete" ? "Plan complete" : "Current plan";
}

async function assertCurrentPlanExpanded(client, { explanation, statuses }) {
  await client.evaluate(
    `document.querySelector('[data-testid="current-plan-footer"] button')?.click()`,
  );
  await waitForState(
    client,
    `(() => {
      const surface = document.querySelector('[data-testid="current-plan-surface"]');
      const rows = Array.from(document.querySelectorAll('[data-testid="current-plan-steps"] li'));
      return {
        expanded: surface?.getAttribute("data-expanded") ?? "",
        explanation: document.querySelector('[data-testid="current-plan-expanded"]')?.innerText ?? "",
        statuses: rows.map((row) => row.getAttribute("data-plan-step-status") ?? ""),
      };
    })()`,
    (value) =>
      value.expanded === "true" &&
      value.explanation.includes(explanation) &&
      JSON.stringify(value.statuses) === JSON.stringify(statuses),
  );
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
  await waitForRendererLiveness(client, run.id, "reconciling", "working");
  await waitForTexts(client, ["Working"]);
  await assertRunLivenessControls(client, { retry: false, stop: true });

  await clickButtonByAria(client, "Stop run");
  await waitForRunStatus(backend, workspaceId, conversationId, run.id, "cancelled");
  await assertNoActiveRun(backend, workspaceId, conversationId);
  await runProtocolConversationSwitchLivenessWorkflow(client, backend, workspaceId);
}

async function runProtocolConversationSwitchLivenessWorkflow(client, backend, workspaceId) {
  const prompt = "liveness navigation workflow";
  const firstConversationId = await createChat(client, backend, workspaceId);
  await submitComposer(client, prompt, "Send message");
  const run = await waitForRunStatusForPrompt(
    backend,
    workspaceId,
    firstConversationId,
    prompt,
    "running",
  );
  await waitForTexts(client, [prompt, "Navigation liveness started."]);
  await waitForRendererLiveness(client, run.id, "attached", "working");
  await assertConversationSidebarIndicator(client, prompt, "Chat response running");

  const secondConversationId = await createChat(client, backend, workspaceId);
  await waitForSelectedConversation(client, secondConversationId);
  await assertConversationSidebarIndicator(client, prompt, "Chat response running");

  await clickButtonContainingText(client, prompt);
  await waitForSelectedConversation(client, firstConversationId);
  await waitForRendererRunMode(client, run.id, "working");
  await assertConversationSidebarIndicator(client, prompt, "Chat response running");
  await assertRunLivenessControls(client, { retry: false, stop: true });

  await submitComposer(client, "finish liveness navigation workflow", "Send steering message");
  await waitForTexts(client, ["Navigation liveness complete."]);
  await waitForRunStatus(backend, workspaceId, firstConversationId, run.id, "completed");
  await assertAssistantCompleted(backend, workspaceId, firstConversationId, run.id);
  await assertNoActiveRun(backend, workspaceId, firstConversationId);
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
  await assertConversationSidebarIndicator(
    client,
    "app-server exit workflow",
    "Chat response reconnecting",
  );
  const list = await backend.post("/chat/conversations/list", { workspaceId });
  const item = list.conversations.find((candidate) => candidate.conversation.id === conversationId);
  assertProviderRestartLivenessItem(item, run.id);
  await waitForTexts(client, ["Reconnecting"]);
  await assertRunLivenessControls(client, { retry: true, stop: true });
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
  await assertConversationSidebarIndicator(
    client,
    "retryable stream error workflow",
    "Chat response reconnecting",
  );
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
  const retryingActivity = await assertProviderStreamLifecycleActivity(
    backend,
    workspaceId,
    retryingRun.id,
    {
      livenessReason: "stream_resync",
      livenessStatus: "reconciling",
      message: "Codex connection retrying",
      status: "running",
      title: "Codex connection retrying",
      willRetry: true,
    },
  );
  await assertProviderStreamLifecycleActivityRendered(
    client,
    retryingActivity.sourceRunItemId,
    "Codex connection retrying",
    "stream_resync",
  );
  await assertRunLivenessControls(client, { retry: true, stop: true });
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
  await assertConversationSidebarIndicator(
    client,
    "nonretryable stream error workflow",
    "Chat connection lost",
  );
  await waitForTexts(client, ["Connection lost", "stream disconnected before completion"]);
  await assertStreamErrorLivenessItem(backend, workspaceId, lostConversationId, lostRun.id, {
    error: "stream disconnected before completion",
    reason: "provider_unavailable",
    status: "lost",
  });
  const lostActivity = await assertProviderStreamLifecycleActivity(
    backend,
    workspaceId,
    lostRun.id,
    {
      livenessReason: "provider_unavailable",
      livenessStatus: "lost",
      message: "stream disconnected before completion",
      status: "failed",
      title: "Codex stream failed",
      willRetry: false,
    },
  );
  await assertProviderStreamLifecycleActivityRendered(
    client,
    lostActivity.sourceRunItemId,
    "Codex stream failed",
    "provider_unavailable",
  );
  await assertProviderStreamLifecycleActivitySearchable(client, lostActivity.sourceRunItemId);
  await assertRunLivenessControls(client, { retry: true, stop: true });
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

async function assertProviderStreamLifecycleActivity(backend, workspaceId, runId, expected) {
  return waitForBackendState(async () => {
    const page = await backend.post("/chat/runs/activity", { limit: 100, runId, workspaceId });
    const row = providerStreamLifecycleActivity(page, expected.livenessReason);
    if (!row) {
      return null;
    }
    assertProviderStreamLifecycleActivityMatches(row, expected);
    return row;
  }, Boolean);
}

function providerStreamLifecycleActivity(page, livenessReason) {
  return (page.activity ?? []).find(
    (candidate) =>
      candidate.type === "provider_stream_lifecycle" &&
      candidate.details?.providerStreamLifecycle?.livenessReason === livenessReason,
  );
}

function assertProviderStreamLifecycleActivityMatches(row, expected) {
  const details = row.details.providerStreamLifecycle;
  const checks = [
    ["title", row.title, expected.title],
    ["status", row.status, expected.status],
    ["message", details.message, expected.message],
    ["codexErrorKind", details.codexErrorKind, "responseStreamDisconnected"],
    ["additionalDetails", details.additionalDetails, "fake response stream disconnect"],
    ["willRetry", details.willRetry, expected.willRetry],
    ["streamFailure", details.streamFailure, true],
    ["livenessStatus", details.livenessStatus, expected.livenessStatus],
    ["providerThreadId", details.providerThreadId, "thread_fake"],
    ["providerTurnId", details.providerTurnId, "turn_fake"],
  ];
  const mismatch = checks.find(([, actual, want]) => actual !== want);
  if (mismatch) {
    throw new Error(
      `provider stream lifecycle activity ${mismatch[0]} mismatch: ${JSON.stringify({
        actual: mismatch[1],
        expected: mismatch[2],
        row,
      })}`,
    );
  }
}

async function assertProviderStreamLifecycleActivityRendered(
  client,
  sourceRunItemId,
  title,
  livenessReason,
) {
  await waitForState(
    client,
    `(() => {
      const sourceRunItemId = ${JSON.stringify(sourceRunItemId)};
      const transcript = document.querySelector('[data-testid="chat-transcript-region"]') ?? document;
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      };
      const groupHeader = Array.from(transcript.querySelectorAll('[data-testid="activity-group-header"]'))
        .find((candidate) =>
          isVisible(candidate) &&
          (candidate.getAttribute("data-activity-group-source-run-item-ids") ?? "")
            .split(/\\s+/)
            .includes(sourceRunItemId)
        );
      if (
        groupHeader instanceof HTMLButtonElement &&
        groupHeader.getAttribute("data-activity-group-expanded") !== "true"
      ) {
        groupHeader.click();
        return {
          ok: false,
          reason: "expanding-group",
          groupText: groupHeader.innerText,
        };
      }
      const row = Array.from(transcript.querySelectorAll('[data-testid="run-activity-row"]'))
        .find(
          (candidate) =>
            isVisible(candidate) &&
            candidate.getAttribute("data-run-item-id") === sourceRunItemId,
        );
      if (!(row instanceof HTMLDetailsElement)) {
        return {
          ok: false,
          reason: row ? "compact-row" : "missing-row",
          groupExpanded: groupHeader?.getAttribute("data-activity-group-expanded") ?? "",
          groupText: groupHeader?.innerText ?? "",
          rowText: row?.innerText ?? "",
        };
      }
      if (!row.open) {
        row.querySelector("summary")?.click();
        return {
          ok: false,
          reason: "opening-row",
          groupExpanded: groupHeader?.getAttribute("data-activity-group-expanded") ?? "",
          text: row.innerText,
        };
      }
      const text = row?.innerText ?? "";
      return {
        ok:
          text.includes(${JSON.stringify(title)}) &&
          text.includes("responseStreamDisconnected") &&
          text.includes("fake response stream disconnect") &&
          text.includes(${JSON.stringify(livenessReason)}) &&
          text.includes("thread_fake") &&
          text.includes("turn_fake"),
        reason: "waiting-for-details",
        groupExpanded: groupHeader?.getAttribute("data-activity-group-expanded") ?? "",
        text,
      };
    })()`,
    (value) => value.ok,
  );
}

async function assertProviderStreamLifecycleActivitySearchable(client, sourceRunItemId) {
  await openProtocolChatSearch(client);
  await setInputValue(client, 'input[placeholder="Search chat"]', "responseStreamDisconnected");
  await waitForState(
    client,
    `(() => {
      const sourceRunItemId = ${JSON.stringify(sourceRunItemId)};
      const row = document.querySelector('[data-activity-focused="true"]');
      return {
        ok:
          row?.getAttribute("data-run-item-id") === sourceRunItemId &&
          row?.innerText.includes("responseStreamDisconnected") &&
          row?.innerText.includes("provider_unavailable"),
        sourceRunItemId: row?.getAttribute("data-run-item-id") ?? "",
        text: row?.innerText ?? "",
      };
    })()`,
    (value) => value.ok,
  );
  await clickButtonByAria(client, "Close chat search");
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

async function waitForRendererRunMode(client, runId, rowMode) {
  await waitForState(
    client,
    `(() => {
      const runId = ${JSON.stringify(runId)};
      const rows = Array.from(document.querySelectorAll('[data-block-kind="run_status"]'));
      const target = rows.find((row) => row.getAttribute("data-run-id") === runId);
      return {
        mode: target?.getAttribute("data-run-status-mode") ?? "",
        text: target?.textContent ?? "",
      };
    })()`,
    (value) => value.mode === rowMode,
  );
}

async function waitForSelectedConversation(client, conversationId) {
  await waitForState(
    client,
    `(() => {
      const panel = document.querySelector('[data-testid="chat-detail-pane"]');
      return { conversationId: panel?.getAttribute("data-conversation-id") ?? "" };
    })()`,
    (value) => value.conversationId === conversationId,
  );
}

async function assertConversationSidebarIndicator(client, conversationTitle, expectedLabel) {
  await waitForState(
    client,
    `(() => {
      const conversationTitle = ${JSON.stringify(conversationTitle)};
      const rows = Array.from(document.querySelectorAll('[data-testid="conversation-list-item"]'));
      const row = rows.find((candidate) => candidate.innerText.includes(conversationTitle));
      const status = row?.querySelector('[role="status"]')?.getAttribute("aria-label") ?? "";
      return {
        ok: status === ${JSON.stringify(expectedLabel)},
        rows: rows.map((candidate) => ({
          status: candidate.querySelector('[role="status"]')?.getAttribute("aria-label") ?? "",
          text: candidate.innerText,
        })),
        status,
      };
    })()`,
    (value) => value.ok,
  );
}

async function assertRunLivenessControls(client, expected) {
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

async function callRendererChatAPI(client, method, args) {
  return client.evaluate(
    `window.setta.chat[${JSON.stringify(method)}](...${JSON.stringify(args)})`,
  );
}

async function assertRunActivityItem(page, type, matches) {
  const item = page.items.find((candidate) => candidate.type === type && matches(candidate));
  if (!item) {
    throw new Error(`run activity missing ${type}: ${JSON.stringify(page.items)}`);
  }
  return item;
}
