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
const goalBackgroundTerminal = {
  command: "npm run goal-bg",
  idleGapOutput: "goal background idle output\n",
  itemId: "goal_bg_terminal",
  processId: "goal_bg_process",
  secondTurnOutput: "goal background turn B output\n",
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
  const run = await waitForRunStatus(backend, workspaceId, conversationId, runId, "completed");
  await assertAssistantCompleted(backend, workspaceId, conversationId, run.id);
  await waitForGoalStatus(backend, workspaceId, conversationId, "complete");
  await waitForTexts(client, ["Goal turn A.", "Goal turn B.", goalBackgroundTerminal.command]);
  await assertProtocolBackgroundTerminalMarker(client);
  await waitForProtocolGoalBackgroundTerminalStore(fixture, workspaceId, conversationId);
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
