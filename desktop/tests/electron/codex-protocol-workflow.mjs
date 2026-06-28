import process from "node:process";
import { chmod, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertAssistantCompleted,
  assertNoActiveRun,
  clickButtonByAria,
  createChat,
  submitComposer,
  waitForCommandResult,
  waitForGoalStatus,
  waitForRunStatus,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

const fakeCodexAppServerFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "fake-codex-app-server.mjs",
);

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
  backend,
  workspaceId,
  conversationId,
  runId,
) {
  const page = await backend.post("/chat/runs/activity", { limit: 100, runId, workspaceId });
  await assertRunActivityItem(page, "hook", (item) => item.title === "Hook: pre-command");
  await assertRunActivityItem(page, "approval_review", (item) => item.reviewId === "review_fake");
  await assertRunActivityItem(
    page,
    "context_compaction",
    (item) => item.title === "Context compaction" && item.status === "completed",
  );
  await assertRunActivityItem(
    page,
    "file_change",
    (item) => item.patchStatus === "updated" && item.filePaths.includes("/tmp/workspace/main.go"),
  );
  await assertRunActivityItem(page, "reasoning", (item) => item.hiddenText === "private reasoning");
  await assertRunActivityItem(
    page,
    "command_execution",
    (item) => item.processId === "process_fake",
  );
  await assertRunActivityItem(
    page,
    "dynamic_tool_call",
    (item) =>
      item.status === "completed" &&
      item.namespace === "setta" &&
      item.toolName === "workspace_context" &&
      item.result.includes("rootPath"),
  );
  await assertRunActivityItem(
    page,
    "dynamic_tool_call",
    (item) =>
      item.status === "failed" &&
      item.namespace === "setta" &&
      item.toolName === "missing_tool" &&
      item.error.includes("unsupported dynamic tool"),
  );
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

function goalRunIDFromCommandPage(page) {
  const assistant = page.messages.find(
    (message) => message.role === "assistant" && message.runId !== "",
  );
  if (!assistant) {
    throw new Error(`goal command page did not include assistant run: ${JSON.stringify(page)}`);
  }
  return assistant.runId;
}

async function assertRunActivityItem(page, type, matches) {
  const item = page.items.find((candidate) => candidate.type === type && matches(candidate));
  if (!item) {
    throw new Error(`run activity missing ${type}: ${JSON.stringify(page.items)}`);
  }
  return item;
}
