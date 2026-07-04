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
} from "./terminal-workflow-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const terminalOutputPrefix = "SETTA_TERMINAL_E2E_OUTPUT:";
const terminalBackspaceOutput = "SETTA_TERMINAL_BACKSPACE_OK";
const terminalBackspaceCommandPrefix = "printf 'SETTA_TERMINAL_BACKSPACE_%s\\n' XXX";
const terminalBackspaceCommandSuffix = "OK";
const terminalCtrlCOutput = "SETTA_TERMINAL_CTRL_C_OK";
const terminalCommand = "printf 'SETTA_TERMINAL_%s:%s\\n' 'E2E_OUTPUT' \"$PWD\"";
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
  await openTerminalFromShortcut(context.client, terminalWorkflowTimeoutMs);
  await focusTerminal(context.client, terminalWorkflowTimeoutMs);
  await waitForTerminalReady(context.client);
  await maximizeTerminalPane(context.client);
  await focusTerminal(context.client, terminalWorkflowTimeoutMs);
  await waitForTerminalReady(context.client);
  await assertTerminalBackspaceKey(context.client);
  await assertTerminalCtrlCKey(context.client);
  await sendTerminalCommand(context.client, terminalCommand);
  terminalState = await waitForTerminalText(context.client, terminalOutputPrefix);
  const sessionIdBeforeReload = terminalState.sessionId;
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await focusTerminal(context.client, terminalWorkflowTimeoutMs);
  terminalState = await waitForTerminalReady(context.client);
  if (terminalState.sessionId !== sessionIdBeforeReload) {
    throw new Error(
      `terminal reload attached session ${terminalState.sessionId}, want ${sessionIdBeforeReload}`,
    );
  }
  terminalState = await waitForTerminalTextInScrollback(context.client, terminalOutputPrefix);
  await focusTerminal(context.client, terminalWorkflowTimeoutMs);
  await sendTerminalCommand(context.client, terminalLongRunningCommand);
  longRunningPid = await waitForLongRunningPid(fixture.workspaceRoot);
  await closeTerminalPaneFromChrome(context.client, terminalWorkflowTimeoutMs);
  await waitForTerminalPaneRemoved(context.client, terminalState.sessionId);
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

async function maximizeTerminalPane(client) {
  const result = await client.driver("maximizeTerminalPane");
  if (!result.ok) {
    throw new Error(`terminal pane maximize failed: ${JSON.stringify(result)}`);
  }
  await waitForState(
    client,
    terminalSnapshotExpression(),
    (snapshot) => snapshot.maximized,
    terminalWorkflowTimeoutMs,
  );
}

async function sendTerminalCommand(client, text) {
  await client.call("Input.insertText", { text });
  await pressTerminalEnter(client);
  await delay(100);
}

async function assertTerminalBackspaceKey(client) {
  await client.call("Input.insertText", { text: terminalBackspaceCommandPrefix });
  await dispatchTerminalBackspace(client);
  await dispatchTerminalBackspace(client);
  await dispatchTerminalBackspace(client);
  await client.call("Input.insertText", { text: terminalBackspaceCommandSuffix });
  await pressTerminalEnter(client);
  await waitForTerminalText(client, terminalBackspaceOutput);
}

async function assertTerminalCtrlCKey(client) {
  await sendTerminalCommand(client, "sleep 30");
  await delay(300);
  await dispatchTerminalCtrlC(client);
  await delay(100);
  await sendTerminalCommand(client, "printf 'SETTA_TERMINAL_%s_C_OK\\n' CTRL");
  await waitForTerminalText(client, terminalCtrlCOutput);
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

async function waitForTerminalText(client, expectedText) {
  return waitForState(
    client,
    terminalSnapshotExpression(),
    (snapshot) => snapshot.text.includes(expectedText),
    terminalWorkflowTimeoutMs,
  );
}

async function waitForTerminalTextInScrollback(client, expectedText) {
  return waitForState(
    client,
    terminalScrollbackSearchExpression(expectedText),
    (snapshot) => snapshot.found,
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

async function writeTerminalSnapshot(client, path) {
  await writeJson(path, await client.evaluate(terminalSnapshotExpression()));
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
