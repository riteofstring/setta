#!/usr/bin/env node
/* global console */

import { execFile } from "node:child_process";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { URL } from "node:url";
import { promisify } from "node:util";

import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  readJsonLinesOptional,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  focusTerminal,
  closeTerminalPaneFromChrome,
  openTerminalFromShortcut,
  terminalSnapshotExpression,
} from "./terminal-workflow-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const execFileAsync = promisify(execFile);
const terminalWorkflowTimeoutMs = 25_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/terminal-backend-crash-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("terminal-backend-crash");
const firstRecordingDir = join(artifactDir, "first-launch");
const secondRecordingDir = join(artifactDir, "second-launch");
await writeLatestRecordingPointer("terminal-backend-crash", artifactDir);
const fixture = await createElectronFixture("terminal-backend-crash");
let context = null;
let terminalState;

try {
  context = await launchElectronCdpContext({
    artifactDir: firstRecordingDir,
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await openWorkspaceFromSidebar(context.client);
  await openTerminalFromShortcut(context.client, terminalWorkflowTimeoutMs);
  await focusTerminal(context.client, terminalWorkflowTimeoutMs);
  terminalState = await waitForTerminalReady(context.client);
  const port = await waitForBackendPort(firstRecordingDir);
  await killBackendOnPort(port);
  terminalState = await waitForTerminalLost(context.client, terminalState.sessionId);
  await closeTerminalPaneFromChrome(context.client, terminalWorkflowTimeoutMs);
  terminalState = await waitForTerminalCloseFailure(context.client, terminalState.sessionId);
  await captureScreenshot(context.client, join(firstRecordingDir, "terminal-close-failed.png"));
  await stopElectronCdpContext(context);
  context = null;

  context = await launchElectronCdpContext({
    artifactDir: secondRecordingDir,
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await openWorkspaceFromSidebar(context.client);
  await focusTerminal(context.client, terminalWorkflowTimeoutMs);
  terminalState = await waitForTerminalReady(context.client);
  await closeTerminalPaneFromChrome(context.client, terminalWorkflowTimeoutMs);
  await waitForTerminalPaneRemoved(context.client, terminalState.sessionId);
  await captureScreenshot(context.client, join(secondRecordingDir, "terminal-closed.png"));
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(context.artifactDir, "failure.png")).catch(
      () => {},
    );
    await writeJson(join(context.artifactDir, "failure-snapshot.json"), {
      terminal: await context.client.evaluate(terminalSnapshotExpression()).catch(() => null),
    }).catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
} finally {
  await stopElectronCdpContext(context);
}

await assertTerminalCloseFailureRecordingEvidence(firstRecordingDir);
await assertTerminalCloseSuccessRecordingEvidence(secondRecordingDir);
await writeJson(join(artifactDir, "summary.json"), {
  artifactDir,
  sessionId: terminalState?.sessionId ?? "",
  status: "passed",
});
console.log(`Electron terminal backend crash workflow passed: ${artifactDir}`);

async function openWorkspaceFromSidebar(client) {
  await clickEnabledButtonByAria(client, "Open project folder", terminalWorkflowTimeoutMs);
  await waitForState(
    client,
    `(() => {
      const area = document.querySelector('[data-testid="workspace-layout-area"]');
      return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
    })()`,
    (workspaceId) => workspaceId !== "" && workspaceId !== "empty",
    terminalWorkflowTimeoutMs,
  );
}

async function waitForTerminalReady(client) {
  return waitForState(
    client,
    terminalSnapshotExpression(),
    (snapshot) =>
      snapshot.exists &&
      snapshot.visible &&
      snapshot.xtermReady &&
      snapshot.sessionId.startsWith("terminal_") &&
      snapshot.statusText !== "" &&
      snapshot.statusText !== "Starting shell",
    terminalWorkflowTimeoutMs,
  );
}

async function waitForTerminalLost(client, sessionId) {
  return waitForState(
    client,
    terminalSnapshotExpression(),
    (snapshot) =>
      snapshot.sessionId === sessionId &&
      snapshot.terminalLost &&
      snapshot.statusText.includes("Terminal session lost"),
    terminalWorkflowTimeoutMs,
  );
}

async function waitForTerminalCloseFailure(client, sessionId) {
  return waitForState(
    client,
    terminalSnapshotExpression(),
    (snapshot) =>
      snapshot.exists &&
      snapshot.visible &&
      snapshot.sessionId === sessionId &&
      snapshot.statusText.includes("Terminal close failed"),
    terminalWorkflowTimeoutMs,
  );
}

async function waitForTerminalPaneRemoved(client, sessionId) {
  return waitForState(
    client,
    `globalThis.__settaE2EDriver.terminalSessionState(${JSON.stringify({ sessionId })})`,
    (state) => !state.visible,
    terminalWorkflowTimeoutMs,
  );
}

async function waitForBackendPort(recordingDir) {
  return waitForStateLike(
    async () => {
      const entries = await readJsonLinesOptional(join(recordingDir, "backend-http.jsonl"));
      for (const entry of entries) {
        if (entry.type !== "backend_http_response" || typeof entry.url !== "string") {
          continue;
        }
        const url = new URL(entry.url);
        if (url.pathname === "/terminals/events" && url.port !== "") {
          return Number.parseInt(url.port, 10);
        }
      }
      return 0;
    },
    (port) => Number.isInteger(port) && port > 0,
  );
}

async function killBackendOnPort(port) {
  const { stdout } = await execFileAsync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]);
  const pids = stdout
    .split("\n")
    .map((line) => Number.parseInt(line.trim(), 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0);
  if (pids.length === 0) {
    throw new Error(`no backend process found listening on port ${port}`);
  }
  for (const pid of pids) {
    process.kill(pid, "SIGKILL");
  }
}

async function assertTerminalCloseFailureRecordingEvidence(recordingDir) {
  const events = await readJsonLinesOptional(join(recordingDir, "events.jsonl"));
  if (!events.some((entry) => entry.type === "backend_exit")) {
    throw new Error("recording missing backend exit event");
  }
  const ipc = await readJsonLinesOptional(join(recordingDir, "ipc.jsonl"));
  if (!ipc.some((entry) => entry.type === "ipc_failure" && entry.channel === "terminal:close")) {
    throw new Error("recording missing failed terminal close IPC");
  }
}

async function assertTerminalCloseSuccessRecordingEvidence(recordingDir) {
  const ipc = await readJsonLinesOptional(join(recordingDir, "ipc.jsonl"));
  if (!ipc.some((entry) => entry.type === "ipc_finish" && entry.channel === "terminal:close")) {
    throw new Error("recording missing successful terminal close IPC");
  }
  const events = await readJsonLinesOptional(join(recordingDir, "events.jsonl"));
  if (
    !events.some(
      (entry) =>
        entry.type === "terminal_event_forwarded" && entry.payload?.type === "terminal.closed",
    )
  ) {
    throw new Error("recording missing forwarded terminal closed event");
  }
}

async function waitForStateLike(read, isReady) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < terminalWorkflowTimeoutMs) {
    lastValue = await read();
    if (isReady(lastValue)) {
      return lastValue;
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for state: ${JSON.stringify(lastValue)}`);
}
