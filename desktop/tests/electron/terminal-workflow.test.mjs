#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

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
  closeTerminalPaneFromChrome,
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
const terminalFastOutput = "SETTA_TERMINAL_FAST_OK";
const terminalFastRecoveryOutput = "SETTA_TERMINAL_FAST_RECOVERY_OK";
const terminalIsolatedOutput = "SETTA_TERMINAL_ISOLATED_OK";
const terminalPasteOutput = "SETTA_TERMINAL_PASTE_OK";
const terminalSustainedOutput = "SETTA_TERMINAL_SUSTAINED_200";
const terminalCommand = "printf 'SETTA_TERMINAL_%s:%s\\n' 'E2E_OUTPUT' \"$PWD\"";
const terminalSingleClickCommand = "printf 'SETTA_TERMINAL_%s\\n' 'SINGLE_CLICK_OK'";
const terminalSingleClickOutput = "SETTA_TERMINAL_SINGLE_CLICK_OK";
const terminalLongRunningPidFile = ".setta-terminal-e2e-long-running.pid";
const terminalLongRunningReady = "SETTA_TERMINAL_LONG_RUNNING_READY";
const terminalLongRunningCommand = `sh -c 'printf "%s\\\\n" "$$" > ${terminalLongRunningPidFile}; printf "SETTA_TERMINAL_%s\\\\n" "LONG_RUNNING_READY"; trap "" TERM; while :; do sleep 1; done'`;
const terminalWorkflowTimeoutMs = 25_000;
const execFileAsync = promisify(execFile);

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
const remoteRuntime = remoteRuntimeConfig(process.env);
await prepareRemoteRuntimeFixture(fixture, remoteRuntime);
let context = null;
let latencyWorkloadResult;
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
  await assertRemoteRuntimeSelected(context.client, artifactDir, remoteRuntime);
  await captureTailscaleRoute(artifactDir, remoteRuntime);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await openWorkspaceFromSidebar(context.client);
  const openedTerminal = await openLatencyTerminal(context.client, remoteRuntime);
  const openedPaneId = requireTerminalPaneId(openedTerminal, "opened terminal");
  await waitForTerminalReady(context.client, openedPaneId);
  await focusNonTerminalPane(context.client, openedPaneId);
  await clickTerminalForInput(context.client, openedPaneId);
  await sendTerminalCommand(context.client, openedPaneId, terminalSingleClickCommand);
  await waitForTerminalText(context.client, terminalSingleClickOutput, openedPaneId);
  await maximizeTerminalPane(context.client, openedPaneId);
  await focusTerminal(context.client, terminalWorkflowTimeoutMs, { paneId: openedPaneId });
  await waitForTerminalReady(context.client, openedPaneId);
  latencyWorkloadResult = await runTerminalLatencyWorkload(context.client, openedPaneId);
  await assertTerminalBackspaceKey(context.client, openedPaneId);
  await assertTerminalCtrlCKey(context.client, openedPaneId);
  await sendTerminalCommand(context.client, openedPaneId, terminalCommand);
  terminalState = await waitForTerminalText(context.client, terminalOutputPrefix, openedPaneId);
  const commandPaneId = requireTerminalPaneId(terminalState, terminalOutputPrefix);
  const terminalSessionsBeforeReload = await waitForVisibleTerminalSessionMap(
    context.client,
    remoteRuntime ? 1 : 2,
  );
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
  await waitForTerminalText(context.client, terminalLongRunningReady, interactivePaneId);
  if (!remoteRuntime) {
    longRunningPid = await waitForLongRunningPid(fixture.workspaceRoot);
  }
  await closeTerminalPaneFromChrome(context.client, terminalWorkflowTimeoutMs);
  await waitForTerminalPaneRemoved(context.client, terminalState.sessionId);
  if (longRunningPid) {
    await waitForProcessExit(longRunningPid);
  }
  await delay(1_000);
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
  fastTypingOutputObserved: latencyWorkloadResult?.fastTypingOutputObserved ?? false,
  runtimeHost: remoteRuntime?.host ?? "local",
  sessionId: terminalState?.sessionId ?? "",
  status: "passed",
  workspaceName: basename(fixture.workspaceRoot),
});
console.log(`Electron terminal workflow passed: ${artifactDir}`);

function remoteRuntimeConfig(env) {
  const host = env.SETTA_E2E_REMOTE_RUNTIME_HOST?.trim();
  const registrySource = env.SETTA_E2E_RUNTIME_REGISTRY_SOURCE?.trim();
  const workspaceRoot = env.SETTA_E2E_REMOTE_WORKSPACE_ROOT?.trim();
  const populated = [host, registrySource, workspaceRoot].filter(Boolean);
  if (populated.length === 0) {
    return null;
  }
  if (populated.length !== 3) {
    throw new Error(
      "remote terminal workflow requires SETTA_E2E_REMOTE_RUNTIME_HOST, SETTA_E2E_RUNTIME_REGISTRY_SOURCE, and SETTA_E2E_REMOTE_WORKSPACE_ROOT",
    );
  }
  return { host, registrySource, workspaceRoot };
}

async function prepareRemoteRuntimeFixture(fixture, remoteRuntime) {
  if (!remoteRuntime) {
    return;
  }
  const target = join(fixture.appDataDir, "electron-user-data");
  await mkdir(target, { recursive: true });
  for (const filename of ["known-runtimes.json", "runtime-secrets.json"]) {
    await cp(join(remoteRuntime.registrySource, filename), join(target, filename));
  }
  fixture.workspaceRoot = remoteRuntime.workspaceRoot;
}

async function captureTailscaleRoute(recordingDir, remoteRuntime) {
  if (!remoteRuntime) {
    return;
  }
  const { stdout, stderr } = await execFileAsync("tailscale", [
    "ping",
    "--until-direct=false",
    "-c",
    "10",
    remoteRuntime.host,
  ]);
  await writeFile(join(recordingDir, "tailscale-ping.txt"), `${stdout}${stderr}`);
}

async function assertRemoteRuntimeSelected(client, recordingDir, remoteRuntime) {
  if (!remoteRuntime) {
    return;
  }
  const snapshot = await waitForState(
    client,
    "window.setta.runtimes.current()",
    (candidate) => {
      const active = candidate?.runtimes?.find(
        (runtime) => runtime.runtimeId === candidate.activeRuntimeId,
      );
      return candidate?.connection?.status === "connected" && active?.isLocal === false;
    },
    terminalWorkflowTimeoutMs,
  );
  await writeJson(join(recordingDir, "runtime-snapshot.json"), snapshot);
}

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

async function openLatencyTerminal(client, remoteRuntime) {
  if (!remoteRuntime) {
    return openTerminalFromShortcut(client, terminalWorkflowTimeoutMs);
  }
  await delay(1_000);
  const snapshots = await client.evaluate(terminalSnapshotsExpression());
  const existing = snapshots.find(
    (snapshot) => snapshot.visible && snapshot.xtermReady && snapshot.sessionId !== "",
  );
  return existing ?? openTerminalFromShortcut(client, terminalWorkflowTimeoutMs);
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
  await delay(400);
  await pressTerminalEnter(client);
  await delay(100);
}

async function assertTerminalBackspaceKey(client, paneId) {
  await client.call("Input.insertText", { text: terminalBackspaceCommandPrefix });
  await dispatchTerminalBackspace(client);
  await dispatchTerminalBackspace(client);
  await dispatchTerminalBackspace(client);
  await client.call("Input.insertText", { text: terminalBackspaceCommandSuffix });
  await delay(400);
  await pressTerminalEnter(client);
  await waitForTerminalText(client, terminalBackspaceOutput, paneId);
}

async function runTerminalLatencyWorkload(client, paneId) {
  await sendTerminalCharacters(client, "printf 'SETTA_TERMINAL_%s\\n' 'ISOLATED_OK'", 125);
  await delay(400);
  await pressTerminalEnter(client);
  await waitForTerminalText(client, terminalIsolatedOutput, paneId);

  await sendTerminalCharacters(client, "printf 'SETTA_TERMINAL_%s\\n' 'FAST_OK'", 0);
  await pressTerminalEnter(client);
  await delay(1_000);
  const fastTypingSnapshot = await client.evaluate(terminalSnapshotExpression({ paneId }));
  const fastTypingOutputObserved = fastTypingSnapshot.text.includes(terminalFastOutput);
  await dispatchTerminalCtrlC(client);
  await sendTerminalCommand(client, paneId, "printf 'SETTA_TERMINAL_%s\\n' 'FAST_RECOVERY_OK'");
  await waitForTerminalText(client, terminalFastRecoveryOutput, paneId);

  await sendTerminalCommand(client, paneId, "printf 'SETTA_TERMINAL_%s\\n' 'PASTE_OK'");
  await waitForTerminalText(client, terminalPasteOutput, paneId);

  await client.call("Input.insertText", {
    text: "printf 'SETTA_TERMINAL_%s\\n' 'ARROW_OK'",
  });
  await dispatchTerminalKey(client, {
    code: "ArrowLeft",
    key: "ArrowLeft",
    nativeVirtualKeyCode: 37,
    windowsVirtualKeyCode: 37,
  });
  await dispatchTerminalKey(client, {
    code: "ArrowRight",
    key: "ArrowRight",
    nativeVirtualKeyCode: 39,
    windowsVirtualKeyCode: 39,
  });
  await delay(400);
  await pressTerminalEnter(client);
  await waitForTerminalText(client, "SETTA_TERMINAL_ARROW_OK", paneId);

  await sendTerminalCommand(
    client,
    paneId,
    "i=1; while [ $i -le 200 ]; do printf 'SETTA_TERMINAL_SUSTAINED_%s\\n' \"$i\"; i=$((i+1)); done",
  );
  await waitForTerminalText(client, terminalSustainedOutput, paneId);
  return { fastTypingOutputObserved };
}

async function sendTerminalCharacters(client, text, cadenceMs) {
  for (const character of text) {
    await client.call("Input.insertText", { text: character });
    if (cadenceMs > 0) {
      await delay(cadenceMs);
    }
  }
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
    candidates.find((snapshot) => snapshot.focused) ??
    candidates.find((snapshot) => snapshot.paneId === preferredPaneId) ??
    candidates[0] ??
    null
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

async function waitForTerminalPaneRemoved(client, sessionId) {
  return waitForState(
    client,
    `globalThis.__settaE2EDriver.terminalSessionState(${JSON.stringify({ sessionId })})`,
    (state) => !state.visible,
    terminalWorkflowTimeoutMs,
  );
}

async function writeTerminalSnapshot(client, path) {
  await writeJson(path, await client.evaluate(terminalSnapshotsExpression()));
}

async function assertTerminalRecordingEvidence(recordingDir) {
  const ipc = await readJsonLinesOptional(join(recordingDir, "ipc.jsonl"));
  assertNoUnexpectedIPCFailures(ipc);
  assertSuccessfulTerminalIPC(ipc);
  assertTerminalInputRecordsAreRedactedAndSequenced(ipc);

  const backend = await readJsonLinesOptional(join(recordingDir, "backend-http.jsonl"));
  assertSuccessfulTerminalBackendRequests(backend);

  const events = await readJsonLinesOptional(join(recordingDir, "events.jsonl"));
  assertForwardedTerminalEvents(events);
  assertMainTerminalLatencyStages(events);
  assertForwardedTerminalEventMetadata(events);

  const rendererEvents = await readJsonLinesOptional(join(recordingDir, "renderer-events.jsonl"));
  assertRendererTerminalLatencyStages(rendererEvents);
  assertNoTerminalContents(ipc, backend, events, rendererEvents);
}

function assertNoUnexpectedIPCFailures(ipc) {
  const failures = ipc.filter(
    (entry) =>
      entry.type === "ipc_failure" &&
      !isExpectedInitialTerminalAttachMiss(entry) &&
      !isExpectedShutdownLayoutPersistenceFailure(entry),
  );
  if (failures.length > 0) {
    throw new Error(`recording included IPC failures: ${JSON.stringify(failures)}`);
  }
}

function assertSuccessfulTerminalIPC(ipc) {
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
}

function assertSuccessfulTerminalBackendRequests(backend) {
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
}

function assertForwardedTerminalEvents(events) {
  if (!events.some((entry) => terminalEventMatches(entry, "terminal.output"))) {
    throw new Error("recording missing forwarded terminal output event");
  }
  if (!events.some((entry) => terminalEventMatches(entry, "terminal.closed"))) {
    throw new Error("recording missing forwarded terminal closed event");
  }
}

function assertRendererTerminalLatencyStages(rendererEvents) {
  for (const type of [
    "terminal_input_renderer_received",
    "terminal_output_renderer_received",
    "terminal_output_xterm_write",
    "terminal_output_painted",
  ]) {
    if (!rendererEvents.some((entry) => entry.type === type)) {
      throw new Error(`recording missing renderer terminal latency stage: ${type}`);
    }
  }
}

function assertTerminalInputRecordsAreRedactedAndSequenced(ipc) {
  const requests = ipc
    .filter((entry) => entry.type === "ipc_start" && entry.channel === "terminal:input")
    .map((entry) => entry.args?.[0]);
  if (requests.length === 0) {
    throw new Error("recording missing terminal input IPC requests");
  }
  const sequencesBySession = new Map();
  for (const request of requests) {
    assertSafeTerminalInputSummary(request);
    const key = `${request.trace?.clientId}:${request.sessionId}`;
    const expected = (sequencesBySession.get(key) ?? 0) + 1;
    assertTerminalInputSequence(request, key, expected);
    sequencesBySession.set(key, expected);
  }
}

function assertSafeTerminalInputSummary(request) {
  if (!request || request.dataBase64 !== undefined || request.byteCount <= 0) {
    throw new Error(`terminal input IPC was not safely summarized: ${JSON.stringify(request)}`);
  }
}

function assertTerminalInputSequence(request, key, expected) {
  if (request.trace?.inputSequence !== expected) {
    throw new Error(
      `terminal input sequence for ${key} = ${request.trace?.inputSequence}, want ${expected}`,
    );
  }
}

function assertMainTerminalLatencyStages(events) {
  for (const type of [
    "terminal_input_main_received",
    "terminal_input_http_dispatched",
    "terminal_input_http_response_received",
  ]) {
    if (!events.some((entry) => entry.type === type)) {
      throw new Error(`recording missing main terminal latency stage: ${type}`);
    }
  }
  const response = events.find((entry) => entry.type === "terminal_input_http_response_received");
  if (!response?.payload?.handlerReceivedAt || !response.payload.ptyWriteCompletedAt) {
    throw new Error(
      `terminal input response missing backend timestamps: ${JSON.stringify(response)}`,
    );
  }
}

function assertForwardedTerminalEventMetadata(events) {
  const output = events.find((entry) => terminalEventMatches(entry, "terminal.output"));
  if (
    !output?.payload?.emittedAt ||
    output.payload.byteCount <= 0 ||
    output.payload.transportSequence <= 0 ||
    !output.payload.runId
  ) {
    throw new Error(`forwarded terminal event missing latency metadata: ${JSON.stringify(output)}`);
  }
}

function assertNoTerminalContents(...recordSets) {
  for (const records of recordSets) {
    for (const record of records) {
      const serialized = JSON.stringify(record);
      if (serialized.includes("dataBase64") || serialized.includes(terminalPasteOutput)) {
        throw new Error(`terminal contents leaked into performance recording: ${serialized}`);
      }
    }
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

function isExpectedShutdownLayoutPersistenceFailure(entry) {
  return (
    entry.channel === "workspace:save-ui-layout" && entry.error?.message === "backend is stopping"
  );
}

function terminalEventMatches(entry, type) {
  return entry.type === "terminal_event_forwarded" && entry.payload?.type === type;
}
