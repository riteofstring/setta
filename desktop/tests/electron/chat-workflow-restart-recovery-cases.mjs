import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";

import {
  killExternalBackend,
  startExternalScriptedBackend,
  stopExternalBackend,
} from "./chat-workflow-external-backend.mjs";
import {
  assertChatLayout,
  assertNoActiveRun,
  assertRecordingEvidence,
  backendProbe,
  captureScreenshot,
  createChat,
  createFixture,
  failureWithLogs,
  launchContext,
  openWorkspace,
  stopLaunchedContext,
  submitComposer,
  waitForDriverState,
  waitForRunWithPrompt,
  waitForState,
  waitForText,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

const restartRecoveryBackgroundTerminalPrompt = "background terminal workflow";
const restartRecoveryPrompt = "workflow hold for queue and steering";
const restartRecoveryError = "run interrupted by backend restart";

export async function runRestartRecoveryWorkflow(results, { recordingRoot, repoRoot }) {
  const fixture = await createFixture("restart-recovery");
  const firstRecording = join(recordingRoot, "restart-recovery", "first-launch");
  const secondRecording = join(recordingRoot, "restart-recovery", "second-launch");
  let first = null;
  let second = null;
  let firstBackend = null;
  let secondBackend = null;

  try {
    firstBackend = await startExternalScriptedBackend(fixture, repoRoot);
    first = await launchExternalBackendContext(fixture, firstRecording, firstBackend);
    const interrupted = await createInterruptedRun(first, fixture, firstRecording);
    await killExternalBackend(firstBackend);
    firstBackend = null;
    await stopLaunchedContext(first);
    first = null;

    secondBackend = await startExternalScriptedBackend(fixture, repoRoot);
    second = await launchExternalBackendContext(fixture, secondRecording, secondBackend);
    await assertRecoveredRun(second, secondRecording, interrupted);
  } catch (error) {
    await captureRestartRecoveryFailure(first, second, recordingRoot);
    throw failureWithLogs(error, restartRecoveryLogs(first, second, firstBackend, secondBackend));
  } finally {
    await stopLaunchedContext(first);
    await stopLaunchedContext(second);
    await stopExternalBackend(firstBackend, { force: true });
    await stopExternalBackend(secondBackend);
    await rmFixture(fixture);
  }

  await assertRestartRecoveryRecordingEvidence(firstRecording, secondRecording);
  results.push("restart-recovery");
  process.stdout.write("Electron chat workflow passed: restart-recovery\n");
}

async function launchExternalBackendContext(fixture, recordingDir, backend) {
  return launchContext(fixture, recordingDir, {
    extraEnv: {
      SETTA_BACKEND_TOKEN: backend.token,
      SETTA_BACKEND_URL: backend.url,
    },
  });
}

async function createInterruptedRun(context, fixture, recordingDir) {
  const backend = await backendProbe(recordingDir);
  const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
  const conversationId = await createChat(context.client, backend, workspaceId);
  await submitComposer(context.client, restartRecoveryBackgroundTerminalPrompt, "Send message");
  await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    restartRecoveryBackgroundTerminalPrompt,
    "completed",
  );
  await waitForBackgroundTerminalFooter(context.client, {
    phase: "active",
    text: "2 background terminals running",
  });
  await submitComposer(context.client, restartRecoveryPrompt, "Send message");
  const activeRun = await waitForRunWithPrompt(
    backend,
    workspaceId,
    conversationId,
    restartRecoveryPrompt,
    "running",
  );
  await waitForText(context.client, "Workflow stream started.");
  await waitForActiveRunPresentation(context.client, activeRun.id, "working");
  await captureScreenshot(context.client, join(recordingDir, "active-before-backend-kill.png"));
  return { conversationId, runId: activeRun.id, workspaceId };
}

async function assertRecoveredRun(context, recordingDir, interrupted) {
  const backend = await backendProbe(recordingDir);
  const recovered = await waitForRunWithPrompt(
    backend,
    interrupted.workspaceId,
    interrupted.conversationId,
    restartRecoveryPrompt,
    "failed",
  );
  if (recovered.id !== interrupted.runId || recovered.error !== restartRecoveryError) {
    throw new Error(`recovered run mismatch: ${JSON.stringify(recovered)}`);
  }
  await assertNoActiveRun(backend, interrupted.workspaceId, interrupted.conversationId);
  await waitForTexts(context.client, [restartRecoveryPrompt, "Workflow stream started."]);
  await waitForRecoveredRestartPresentation(context.client, interrupted.runId);
  await assertRecoveredBackgroundTerminalAttention(context.client, backend, interrupted);
  await assertChatLayout(context.client);
  await captureScreenshot(context.client, join(recordingDir, "recovered-after-restart.png"));
}

async function captureRestartRecoveryFailure(first, second, recordingRoot) {
  await mkdir(join(recordingRoot, "restart-recovery"), { recursive: true });
  await captureScreenshot(
    first?.client ?? second?.client,
    join(recordingRoot, "restart-recovery", "failure.png"),
  ).catch(() => {});
}

function restartRecoveryLogs(first, second, firstBackend, secondBackend) {
  return [
    ...(first?.electron.logs ?? []),
    ...(second?.electron.logs ?? []),
    ...(firstBackend?.logs ?? []),
    ...(secondBackend?.logs ?? []),
  ];
}

async function rmFixture(fixture) {
  await rm(fixture.tempRoot, { force: true, recursive: true });
}

async function assertRestartRecoveryRecordingEvidence(firstRecording, secondRecording) {
  await assertRecordingEvidence(firstRecording, {
    backendPaths: [
      "/workspaces/open",
      "/chat/conversations/create",
      "/chat/messages/send",
      "/chat/runs/list",
    ],
    ipcChannels: ["workspace:open-local-folder", "chat:create-conversation", "chat:send-message"],
  });
  await assertRecordingEvidence(secondRecording, {
    backendPaths: [
      "/workspace-session",
      "/chat/conversations/list",
      "/chat/messages/page",
      "/chat/runs/active",
      "/chat/runs/list",
    ],
    ipcChannels: ["workspace:session", "chat:list-conversations", "chat:message-page"],
  });
}

async function waitForActiveRunPresentation(client, runId, mode) {
  await waitForDriverState(
    client,
    "runPresentation",
    { runId },
    (value) =>
      value.mode === mode &&
      value.liveHeadline &&
      value.detailRunStatus === "running" &&
      value.stopEnabled,
  );
}

async function waitForRecoveredRestartPresentation(client, runId) {
  await waitForDriverState(
    client,
    "runPresentation",
    { runId },
    (value) =>
      value.mode === "failed" &&
      value.text.includes(restartRecoveryError) &&
      value.detailRunStatus === "" &&
      value.detailLivenessStatus === "" &&
      !value.liveHeadline &&
      !value.stopEnabled,
    30_000,
  );
}

async function assertRecoveredBackgroundTerminalAttention(client, backend, interrupted) {
  const list = await backend.post("/chat/background-terminals/list", {
    conversationId: interrupted.conversationId,
    workspaceId: interrupted.workspaceId,
  });
  const statuses = (list.terminals ?? []).map((terminal) => terminal.status);
  if (statuses.length !== 2 || statuses.some((status) => status !== "lost")) {
    throw new Error(`recovered background terminals = ${JSON.stringify(list.terminals)}`);
  }
  await waitForBackgroundTerminalFooter(client, {
    phase: "attention",
    text: "2 background terminals need attention",
  });
  await delay(2700);
  await waitForBackgroundTerminalFooter(client, {
    phase: "attention",
    text: "2 background terminals need attention",
  });
  await client.evaluate(
    `document.querySelector('[data-testid="background-terminals-footer"]')?.click()`,
  );
  await waitForState(
    client,
    backgroundTerminalMonitorExpression(),
    (value) =>
      value.monitorOpen &&
      value.processes.length === 2 &&
      value.processes.every((process) => process.status === "lost"),
  );
  await client.evaluate(
    `document.querySelector('button[aria-label="Close background terminal monitor"]')?.click()`,
  );
  await waitForState(
    client,
    backgroundTerminalFooterExpression(),
    (value) => !value.footerPresent && !value.monitorOpen,
  );
}

async function waitForBackgroundTerminalFooter(client, { phase, text }) {
  await waitForState(
    client,
    backgroundTerminalFooterExpression(),
    (value) =>
      value.footerPresent && value.footerPhase === phase && value.footerText.includes(text),
  );
}

function backgroundTerminalFooterExpression() {
  return `(() => {
    const footer = document.querySelector('[data-testid="background-terminals-footer"]');
    return {
      footerPhase: footer?.getAttribute("data-terminal-surface-state") ?? "",
      footerPresent: Boolean(footer),
      footerText: footer?.innerText ?? "",
      monitorOpen: Boolean(document.querySelector('[data-testid="background-terminal-monitor"]')),
    };
  })()`;
}

function backgroundTerminalMonitorExpression() {
  return `(() => ({
    monitorOpen: Boolean(document.querySelector('[data-testid="background-terminal-monitor"]')),
    processes: Array.from(document.querySelectorAll('[data-testid="background-terminal-monitor-process"]')).map((row) => ({
      command: row.getAttribute("data-command") ?? "",
      status: row.getAttribute("data-status") ?? "",
      text: row.innerText,
    })),
  }))()`;
}
