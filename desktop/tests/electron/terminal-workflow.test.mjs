#!/usr/bin/env node
/* global console */

import { Buffer } from "node:buffer";
import { basename, join } from "node:path";
import process from "node:process";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  dispatchMouseClick,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  readJsonLinesOptional,
  reloadPage,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  focusTerminal,
  openTerminalFromShortcut,
  terminalScrollbackSearchExpression,
  terminalSnapshotExpression,
  terminalSnapshotsExpression,
  waitForTerminalPaneStageContained,
} from "./terminal-workflow-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const terminalOutputPrefix = "SETTA_TERMINAL_E2E_OUTPUT:";
const terminalBackspaceOutput = "SETTA_TERMINAL_BACKSPACE_OK";
const terminalBackspaceCommandPrefix = "printf 'SETTA_TERMINAL_BACKSPACE_%s\\n' XXX";
const terminalBackspaceCommandSuffix = "OK";
const terminalCtrlCOutput = "SETTA_TERMINAL_CTRL_C_OK";
const terminalCommand = "printf 'SETTA_TERMINAL_%s:%s\\n' 'E2E_OUTPUT' \"$PWD\"";
const terminalSingleClickCommand = "printf 'SETTA_TERMINAL_SINGLE_CLICK_OK\\n'";
const terminalSingleClickOutput = "SETTA_TERMINAL_SINGLE_CLICK_OK";
const terminalLongRunningPidFile = ".setta-terminal-e2e-long-running.pid";
const terminalLongRunningCommand = `sh -c 'printf "%s\\\\n" "$$" > ${terminalLongRunningPidFile}; trap "" TERM; while :; do sleep 1; done'`;
const terminalWorkflowTimeoutMs = 25_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/terminal-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("terminal-workflow");
await writeLatestRecordingPointer("terminal-workflow", artifactDir);
const fixture = await createElectronFixture("terminal-workflow");
let context = null;
let longRunningPid;
let terminalState;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await openWorkspaceFromSidebar(context.client);
  const openedTerminal = await openTerminalFromShortcut(context.client, terminalWorkflowTimeoutMs);
  const openedPaneId = requireTerminalPaneId(openedTerminal, "opened terminal");
  await waitForTerminalReady(context.client, openedPaneId);
  await focusNonTerminalPane(context.client, openedPaneId);
  await clickTerminalForInput(context.client, openedPaneId);
  await sendTerminalCommand(context.client, openedPaneId, terminalSingleClickCommand);
  await waitForTerminalText(context.client, terminalSingleClickOutput, openedPaneId);
  await maximizeTerminalPane(context.client, openedPaneId);
  await focusTerminal(context.client, terminalWorkflowTimeoutMs, { paneId: openedPaneId });
  await waitForTerminalReady(context.client, openedPaneId);
  await assertTerminalBackspaceKey(context.client, openedPaneId);
  await assertTerminalCtrlCKey(context.client, openedPaneId);
  await sendTerminalCommand(context.client, openedPaneId, terminalCommand);
  terminalState = await waitForTerminalText(context.client, terminalOutputPrefix, openedPaneId);
  const commandPaneId = requireTerminalPaneId(terminalState, terminalOutputPrefix);
  const terminalSessionsBeforeReload = await waitForVisibleTerminalSessionMap(context.client, 2);
  if (terminalSessionsBeforeReload.get(commandPaneId) !== terminalState.sessionId) {
    throw new Error(
      `terminal output pane ${commandPaneId} session ${terminalState.sessionId} was not in visible terminal map ${formatTerminalSessionMap(
        terminalSessionsBeforeReload,
      )}`,
    );
  }
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const terminalSessionsAfterReload = await waitForTerminalSessionReattach(
    context.client,
    terminalSessionsBeforeReload,
  );
  await waitForTerminalTextInScrollback(context.client, terminalOutputPrefix, commandPaneId);
  const interactivePaneId = await waitForVisibleReattachedTerminalPane(
    context.client,
    terminalSessionsAfterReload,
    commandPaneId,
  );
  await focusTerminalPane(context.client, interactivePaneId);
  terminalState = await waitForTerminalPaneReady(context.client, interactivePaneId);
  await sendTerminalCommand(context.client, interactivePaneId, terminalLongRunningCommand);
  longRunningPid = await waitForLongRunningPid(fixture.workspaceRoot);
  await closeTerminalFromRenderer(context.client, terminalState.sessionId);
  await waitForTerminalClosed(context.client, terminalState.sessionId, interactivePaneId);
  await waitForProcessExit(longRunningPid);
  await captureScreenshot(context.client, join(artifactDir, "terminal-closed.png"));
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeTerminalSnapshot(context.client, join(artifactDir, "failure-snapshot.json")).catch(
      () => {},
    );
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

await assertTerminalRecordingEvidence(artifactDir);
await writeJson(join(artifactDir, "summary.json"), {
  artifactDir,
  sessionId: terminalState?.sessionId ?? "",
  status: "passed",
  workspaceName: basename(fixture.workspaceRoot),
});
console.log(`Electron terminal workflow passed: ${artifactDir}`);

async function waitForTerminalReady(client, paneId) {
  return waitForState(
    client,
    terminalSnapshotExpression({ paneId }),
    (snapshot) =>
      snapshot.exists &&
      snapshot.visible &&
      snapshot.xtermReady &&
      snapshot.sessionId.startsWith("terminal_") &&
      snapshot.statusText !== "" &&
      snapshot.statusText !== "Starting shell" &&
      snapshot.titleText === snapshot.statusText,
    terminalWorkflowTimeoutMs,
  );
}

async function waitForVisibleTerminalSessionMap(client, minimumCount) {
  await client.installDriver();
  const snapshots = await waitForState(
    client,
    terminalSnapshotsExpression(),
    (candidateSnapshots) =>
      terminalSessionMapFromSnapshots(candidateSnapshots).size >= minimumCount,
    terminalWorkflowTimeoutMs,
  );
  const sessions = terminalSessionMapFromSnapshots(snapshots);
  if (sessions.size < minimumCount) {
    throw new Error(
      `visible terminal session map had ${sessions.size} entries, want ${minimumCount}: ${JSON.stringify(
        snapshots,
      )}`,
    );
  }
  return sessions;
}

async function waitForTerminalSessionReattach(client, expectedSessions) {
  await client.installDriver();
  const snapshots = await waitForState(
    client,
    terminalSnapshotsExpression(),
    (candidateSnapshots) => terminalSessionsMatch(candidateSnapshots, expectedSessions),
    terminalWorkflowTimeoutMs,
  );
  const actual = terminalSessionMapFromSnapshots(snapshots, { requireVisible: false });
  if (!terminalSessionMapsEqual(actual, expectedSessions)) {
    throw new Error(
      `terminal reload session map ${formatTerminalSessionMap(actual)}, want ${formatTerminalSessionMap(
        expectedSessions,
      )}`,
    );
  }
  return actual;
}

async function waitForVisibleReattachedTerminalPane(
  client,
  expectedSessions,
  preferredPaneId = null,
) {
  await client.installDriver();
  const snapshots = await waitForState(
    client,
    terminalSnapshotsExpression(),
    (candidateSnapshots) =>
      visibleReattachedTerminalSnapshot(candidateSnapshots, expectedSessions, preferredPaneId) !==
      null,
    terminalWorkflowTimeoutMs,
  );
  const snapshot = visibleReattachedTerminalSnapshot(snapshots, expectedSessions, preferredPaneId);
  if (!snapshot) {
    throw new Error(
      `no visible reattached terminal pane found in ${JSON.stringify(
        snapshots,
      )}; expected ${formatTerminalSessionMap(expectedSessions)}`,
    );
  }
  return snapshot.paneId;
}

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

async function maximizeTerminalPane(client, paneId) {
  const result = await client.driver("maximizeTerminalPane", { paneId });
  if (!result.ok) {
    throw new Error(`terminal pane maximize failed: ${JSON.stringify(result)}`);
  }
  await waitForState(
    client,
    terminalSnapshotExpression({ paneId }),
    (snapshot) => snapshot.maximized,
    terminalWorkflowTimeoutMs,
  );
}

async function focusNonTerminalPane(client, terminalPaneId) {
  const result = await client.driver("focusNonTerminalPane");
  if (!result.ok) {
    throw new Error(`non-terminal pane focus failed: ${JSON.stringify(result)}`);
  }
  await waitForState(
    client,
    terminalSnapshotExpression({ paneId: terminalPaneId }),
    (snapshot) => !snapshot.focused,
    terminalWorkflowTimeoutMs,
  );
}

async function focusTerminalPane(client, paneId) {
  const point = await client.driver("terminalPaneFocusPoint", { paneId });
  if (!point.ok) {
    throw new Error(`terminal pane ${paneId} focus point unavailable: ${JSON.stringify(point)}`);
  }
  await dispatchMouseClick(client, point);
  await waitForState(
    client,
    terminalSnapshotsExpression(),
    (snapshots) => {
      const snapshot = terminalSnapshotForPane(snapshots, paneId);
      return Boolean(snapshot?.focused && snapshot.visible && snapshot.xtermReady);
    },
    terminalWorkflowTimeoutMs,
  );
  await waitForTerminalPaneStageContained(client, paneId, terminalWorkflowTimeoutMs);
  const result = await client.driver("focusTerminalTextarea", { paneId });
  if (!result.ok) {
    throw new Error(`terminal pane ${paneId} focus failed: ${JSON.stringify(result)}`);
  }
}

async function waitForTerminalPaneReady(client, paneId) {
  const snapshots = await waitForState(
    client,
    terminalSnapshotsExpression(),
    (candidateSnapshots) => {
      const snapshot = terminalSnapshotForPane(candidateSnapshots, paneId);
      return Boolean(
        snapshot?.visible &&
        snapshot.xtermReady &&
        snapshot.sessionId.startsWith("terminal_") &&
        snapshot.statusText !== "" &&
        snapshot.statusText !== "Starting shell" &&
        snapshot.titleText === snapshot.statusText,
      );
    },
    terminalWorkflowTimeoutMs,
  );
  const snapshot = terminalSnapshotForPane(snapshots, paneId);
  if (!snapshot) {
    throw new Error(`terminal pane ${paneId} was missing after ready wait`);
  }
  return snapshot;
}

async function clickTerminalForInput(client, paneId) {
  await waitForTerminalPaneStageContained(client, paneId, terminalWorkflowTimeoutMs);
  const point = await client.driver("terminalInputPoint", { paneId });
  if (!point.ok) {
    throw new Error(`terminal input point unavailable: ${JSON.stringify(point)}`);
  }
  await dispatchMouseClick(client, point);
  await waitForState(
    client,
    terminalSnapshotExpression({ paneId }),
    (snapshot) => snapshot.focused && snapshot.visible && snapshot.xtermReady,
    terminalWorkflowTimeoutMs,
  );
}

async function sendTerminalCommand(client, paneId, text) {
  await waitForState(
    client,
    terminalSnapshotExpression({ paneId }),
    (snapshot) => snapshot.focused && snapshot.visible && snapshot.xtermReady,
    terminalWorkflowTimeoutMs,
  );
  await client.call("Input.insertText", { text });
  await pressTerminalEnter(client);
  await delay(100);
}

async function assertTerminalBackspaceKey(client, paneId) {
  await client.call("Input.insertText", { text: terminalBackspaceCommandPrefix });
  await dispatchTerminalBackspace(client);
  await dispatchTerminalBackspace(client);
  await dispatchTerminalBackspace(client);
  await client.call("Input.insertText", { text: terminalBackspaceCommandSuffix });
  await pressTerminalEnter(client);
  await waitForTerminalText(client, terminalBackspaceOutput, paneId);
}

async function assertTerminalCtrlCKey(client, paneId) {
  await sendTerminalCommand(client, paneId, "sleep 30");
  await delay(300);
  await dispatchTerminalCtrlC(client);
  await delay(100);
  await sendTerminalCommand(client, paneId, "printf 'SETTA_TERMINAL_%s_C_OK\\n' CTRL");
  await waitForTerminalText(client, terminalCtrlCOutput, paneId);
}

async function pressTerminalEnter(client) {
  await client.call("Input.dispatchKeyEvent", {
    code: "Enter",
    key: "Enter",
    nativeVirtualKeyCode: 13,
    text: "\r",
    type: "keyDown",
    windowsVirtualKeyCode: 13,
  });
  await client.call("Input.dispatchKeyEvent", {
    code: "Enter",
    key: "Enter",
    nativeVirtualKeyCode: 13,
    type: "keyUp",
    windowsVirtualKeyCode: 13,
  });
}

async function dispatchTerminalBackspace(client) {
  await dispatchTerminalKey(client, {
    code: "Backspace",
    key: "Backspace",
    nativeVirtualKeyCode: 8,
    windowsVirtualKeyCode: 8,
  });
}

async function dispatchTerminalCtrlC(client) {
  await dispatchTerminalKey(client, {
    code: "KeyC",
    key: "c",
    modifiers: 2,
    nativeVirtualKeyCode: 67,
    windowsVirtualKeyCode: 67,
  });
}

async function dispatchTerminalKey(
  client,
  { code, key, modifiers = 0, nativeVirtualKeyCode, windowsVirtualKeyCode },
) {
  await client.call("Input.dispatchKeyEvent", {
    code,
    key,
    modifiers,
    nativeVirtualKeyCode,
    type: "rawKeyDown",
    windowsVirtualKeyCode,
  });
  await client.call("Input.dispatchKeyEvent", {
    code,
    key,
    modifiers,
    nativeVirtualKeyCode,
    type: "keyUp",
    windowsVirtualKeyCode,
  });
  await delay(50);
}

async function waitForLongRunningPid(workspaceRoot) {
  const pidPath = join(workspaceRoot, terminalLongRunningPidFile);
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < terminalWorkflowTimeoutMs) {
    try {
      const pid = Number.parseInt((await readFile(pidPath, "utf8")).trim(), 10);
      if (Number.isInteger(pid) && pid > 0 && processIsRunning(pid)) {
        return pid;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(
    `timed out waiting for long-running terminal pid${lastError ? `: ${lastError.message}` : ""}`,
  );
}

async function waitForProcessExit(pid) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < terminalWorkflowTimeoutMs) {
    if (!processIsRunning(pid)) {
      return;
    }
    await delay(100);
  }
  throw new Error(`terminal close did not stop long-running process ${pid}`);
}

function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ESRCH") {
      return false;
    }
    throw error;
  }
}

async function waitForTerminalText(client, expectedText, paneId) {
  return waitForState(
    client,
    terminalSnapshotExpression({ paneId }),
    (snapshot) => snapshot.text.includes(expectedText),
    terminalWorkflowTimeoutMs,
  );
}

async function waitForTerminalTextInScrollback(client, expectedText, paneId) {
  return waitForState(
    client,
    terminalScrollbackSearchExpression(expectedText, { paneId }),
    (snapshot) => snapshot.found,
    terminalWorkflowTimeoutMs,
  );
}

function requireTerminalPaneId(snapshot, label) {
  if (typeof snapshot.paneId === "string" && snapshot.paneId !== "") {
    return snapshot.paneId;
  }
  throw new Error(`terminal pane id missing for ${label}: ${JSON.stringify(snapshot)}`);
}

function terminalSnapshotForPane(snapshots, paneId) {
  return Array.isArray(snapshots)
    ? (snapshots.find((snapshot) => snapshot?.paneId === paneId) ?? null)
    : null;
}

function terminalSessionMapFromSnapshots(snapshots, { requireVisible = true } = {}) {
  const sessions = new Map();
  if (!Array.isArray(snapshots)) {
    return sessions;
  }
  for (const snapshot of snapshots) {
    const entry = terminalSessionMapEntry(snapshot, requireVisible);
    if (entry) {
      sessions.set(entry.paneId, entry.sessionId);
    }
  }
  return sessions;
}

function terminalSessionMapEntry(snapshot, requireVisible) {
  if (!terminalSnapshotHasSession(snapshot) || (requireVisible && !snapshot.visible)) {
    return null;
  }
  return { paneId: snapshot.paneId, sessionId: snapshot.sessionId };
}

function terminalSnapshotHasSession(snapshot) {
  return (
    snapshot &&
    snapshot.paneId !== "" &&
    snapshot.xtermReady &&
    typeof snapshot.sessionId === "string" &&
    snapshot.sessionId.startsWith("terminal_")
  );
}

function terminalSessionsMatch(snapshots, expectedSessions) {
  const actual = terminalSessionMapFromSnapshots(snapshots, { requireVisible: false });
  return terminalSessionMapsEqual(actual, expectedSessions);
}

function visibleReattachedTerminalSnapshot(snapshots, expectedSessions, preferredPaneId = null) {
  if (!Array.isArray(snapshots)) {
    return null;
  }
  const candidates = snapshots.filter(
    (snapshot) =>
      snapshot &&
      snapshot.visible &&
      snapshot.xtermReady &&
      expectedSessions.get(snapshot.paneId) === snapshot.sessionId,
  );
  return (
    candidates.find((snapshot) => snapshot.paneId === preferredPaneId) ?? candidates[0] ?? null
  );
}

function terminalSessionMapsEqual(actual, expected) {
  if (actual.size !== expected.size) {
    return false;
  }
  for (const [paneId, sessionId] of expected) {
    if (actual.get(paneId) !== sessionId) {
      return false;
    }
  }
  return true;
}

function formatTerminalSessionMap(sessions) {
  return JSON.stringify(Object.fromEntries(sessions));
}

async function closeTerminalFromRenderer(client, sessionId) {
  if (!sessionId) {
    throw new Error("terminal session id is missing");
  }
  const result = await client.evaluate(
    `window.setta.terminal.close(${JSON.stringify(
      sessionId,
    )}, "terminate").then((response) => ({ ok: true, status: response.session.status })).catch((error) => ({ ok: false, message: error instanceof Error ? error.message : String(error) }))`,
  );
  if (!result.ok) {
    throw new Error(`terminal close failed: ${JSON.stringify(result)}`);
  }
}

async function waitForTerminalClosed(client, sessionId, paneId = null) {
  if (paneId === null || paneId === "") {
    throw new Error("waitForTerminalClosed requires an explicit terminal pane id");
  }
  return waitForState(
    client,
    terminalSnapshotsExpression(),
    (snapshots) => {
      const snapshot = terminalSnapshotForPane(snapshots, paneId);
      return snapshot?.sessionId === sessionId && snapshot.statusText.includes("Terminal closed");
    },
    terminalWorkflowTimeoutMs,
  );
}

async function writeTerminalSnapshot(client, path) {
  await writeJson(path, await client.evaluate(terminalSnapshotsExpression()));
}

async function assertTerminalRecordingEvidence(recordingDir) {
  const ipc = await readJsonLinesOptional(join(recordingDir, "ipc.jsonl"));
  const failures = ipc.filter(
    (entry) => entry.type === "ipc_failure" && !isExpectedInitialTerminalAttachMiss(entry),
  );
  if (failures.length > 0) {
    throw new Error(`recording included IPC failures: ${JSON.stringify(failures)}`);
  }
  for (const channel of [
    "workspace:open-local-folder",
    "terminal:create",
    "terminal:attach",
    "terminal:input",
    "terminal:resize",
    "terminal:close",
  ]) {
    if (!ipc.some((entry) => entry.type === "ipc_finish" && entry.channel === channel)) {
      throw new Error(`recording missing successful terminal IPC channel: ${channel}`);
    }
  }
  assertTerminalInputByte(ipc, 0x7f, "Backspace");
  assertTerminalInputByte(ipc, 0x03, "Ctrl-C");

  const backend = await readJsonLinesOptional(join(recordingDir, "backend-http.jsonl"));
  for (const path of [
    "/workspaces/open",
    "/terminals/create",
    "/terminals/attach",
    "/terminals/events",
    "/terminals/input",
    "/terminals/resize",
    "/terminals/close",
  ]) {
    if (!backend.some((entry) => backendResponseMatches(entry, path))) {
      throw new Error(`recording missing successful terminal backend path: ${path}`);
    }
  }

  const events = await readJsonLinesOptional(join(recordingDir, "events.jsonl"));
  if (!events.some((entry) => terminalEventMatches(entry, "terminal.output"))) {
    throw new Error("recording missing forwarded terminal output event");
  }
  if (!events.some((entry) => terminalEventMatches(entry, "terminal.closed"))) {
    throw new Error("recording missing forwarded terminal closed event");
  }
}

function assertTerminalInputByte(ipc, byte, label) {
  const found = ipc.some((entry) => {
    if (entry.type !== "ipc_start" || entry.channel !== "terminal:input") {
      return false;
    }
    const request = entry.args?.[0];
    if (!request || typeof request.dataBase64 !== "string") {
      return false;
    }
    return Buffer.from(request.dataBase64, "base64").includes(byte);
  });
  if (!found) {
    throw new Error(`recording missing terminal input byte for ${label}: 0x${byte.toString(16)}`);
  }
}

function backendResponseMatches(entry, path) {
  return (
    entry.type === "backend_http_response" &&
    entry.status === 200 &&
    typeof entry.url === "string" &&
    entry.url.includes(path)
  );
}

function isExpectedInitialTerminalAttachMiss(entry) {
  return (
    entry.channel === "terminal:attach" &&
    typeof entry.error?.message === "string" &&
    entry.error.message.includes("terminal session not found")
  );
}

function terminalEventMatches(entry, type) {
  return entry.type === "terminal_event_forwarded" && entry.payload?.type === type;
}
