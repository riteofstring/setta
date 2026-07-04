import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { clearTimeout, setTimeout as startTimer } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import process from "node:process";

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
  waitForRunWithPrompt,
  waitForState,
  waitForText,
  waitForTexts,
} from "./chat-workflow-harness.mjs";

const externalBackendReadyTimeoutMs = 20_000;
const externalBackendStopTimeoutMs = 5_000;
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
    first = await launchExternalBackendContext(fixture, firstRecording, firstBackend.url);
    const interrupted = await createInterruptedRun(first, fixture, firstRecording);
    await killExternalBackend(firstBackend);
    firstBackend = null;
    await stopLaunchedContext(first);
    first = null;

    secondBackend = await startExternalScriptedBackend(fixture, repoRoot);
    second = await launchExternalBackendContext(fixture, secondRecording, secondBackend.url);
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

async function launchExternalBackendContext(fixture, recordingDir, backendURL) {
  return launchContext(fixture, recordingDir, {
    extraEnv: { SETTA_BACKEND_URL: backendURL },
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
  await waitForState(
    client,
    runPresentationExpression(runId),
    (value) =>
      value.mode === mode &&
      value.liveHeadline &&
      value.detailRunStatus === "running" &&
      value.stopEnabled,
  );
}

async function waitForRecoveredRestartPresentation(client, runId) {
  await waitForState(
    client,
    runPresentationExpression(runId),
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

function runPresentationExpression(runId) {
  return `(() => {
    const runId = ${JSON.stringify(runId)};
    const pane = document.querySelector('[data-testid="chat-detail-pane"]');
    const rows = Array.from(document.querySelectorAll('[data-block-kind="run_status"]'));
    const target = rows.find((row) => row.getAttribute("data-run-id") === runId);
    const stop = document.querySelector('button[aria-label="Stop run"]');
    return {
      detailLivenessStatus: pane?.getAttribute("data-run-liveness-status") ?? "",
      detailRunStatus: pane?.getAttribute("data-run-status") ?? "",
      liveHeadline: Boolean(target?.querySelector('[data-live-headline="active"]')),
      mode: target?.getAttribute("data-run-status-mode") ?? "",
      stopEnabled: stop instanceof HTMLButtonElement && !stop.disabled,
      text: target?.textContent ?? "",
    };
  })()`;
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

async function startExternalScriptedBackend(fixture, repoRoot) {
  const child = spawn(
    join(repoRoot, "scripts", "go.sh"),
    ["run", "./cmd/setta-backend", "--app-data-dir", fixture.appDataDir, "--port", "0"],
    {
      cwd: repoRoot,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        SETTA_E2E: "1",
        SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const logs = [];
  const ready = await waitForExternalBackendReady(child, logs);
  return { child, logs, url: `http://${ready.addr}` };
}

function waitForExternalBackendReady(child, logs) {
  return new Promise((resolvePromise, reject) => {
    let settled = false;
    const timeout = startTimer(
      () => finish(new Error("external backend readiness timed out")),
      externalBackendReadyTimeoutMs,
    );
    const stdout = createInterface({ input: child.stdout });
    const stderr = createInterface({ input: child.stderr });

    child.once("error", (error) => finish(error));
    child.once("exit", (code, signal) => {
      finish(new Error(`external backend exited before ready: code=${code} signal=${signal}`));
    });
    stdout.on("line", (line) => {
      appendExternalBackendLog(logs, line);
      const ready = parseExternalBackendReadyLine(line);
      if (ready) {
        finish(ready);
      }
    });
    stderr.on("line", (line) => appendExternalBackendLog(logs, line));

    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (result instanceof Error) {
        reject(errorWithExternalBackendLogs(result, logs));
        return;
      }
      resolvePromise(result);
    }
  });
}

function parseExternalBackendReadyLine(line) {
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (
    value !== null &&
    typeof value === "object" &&
    value.event === "ready" &&
    typeof value.addr === "string" &&
    value.addr !== ""
  ) {
    return value;
  }
  return null;
}

async function killExternalBackend(handle) {
  await stopExternalBackend(handle, { force: true });
}

async function stopExternalBackend(handle, { force = false } = {}) {
  if (!handle || handle.child.exitCode !== null || handle.child.killed) {
    return;
  }
  const exitPromise = new Promise((resolvePromise) => {
    handle.child.once("exit", resolvePromise);
  });
  signalExternalBackendProcess(handle.child, force ? "SIGKILL" : "SIGTERM");
  const exited = await Promise.race([
    exitPromise.then(() => true),
    delay(externalBackendStopTimeoutMs).then(() => false),
  ]);
  if (!exited && handle.child.exitCode === null) {
    signalExternalBackendProcess(handle.child, "SIGKILL");
    await Promise.race([exitPromise, delay(externalBackendStopTimeoutMs)]);
  }
}

function signalExternalBackendProcess(child, signal) {
  if (child.pid === undefined) {
    return false;
  }
  if (process.platform === "win32") {
    child.kill(signal);
    return true;
  }
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") {
      return false;
    }
    throw error;
  }
}

function appendExternalBackendLog(logs, line) {
  logs.push(line + "\n");
  if (logs.length > 100) {
    logs.shift();
  }
}

function errorWithExternalBackendLogs(error, logs) {
  if (logs.length === 0) {
    return error;
  }
  return new Error(`${error.message}\nExternal backend output:\n${logs.join("")}`);
}
