#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
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

const options = parseElectronHarnessArgs(process.argv.slice(2));
const terminalOutputPrefix = "SETTA_TERMINAL_E2E_OUTPUT:";
const terminalCommand = "printf 'SETTA_TERMINAL_%s:%s\\n' 'E2E_OUTPUT' \"$PWD\"";
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
  await waitForSelector(context.client, '[data-testid="niri-workspace-area"]');
  await openWorkspaceFromSidebar(context.client);
  await waitForTerminalReady(context.client);
  await maximizeTerminalPane(context.client);
  await waitForTerminalReady(context.client);
  await focusTerminal(context.client);
  await sendTerminalCommand(context.client, terminalCommand);
  terminalState = await waitForTerminalText(context.client, terminalOutputPrefix);
  await closeTerminalFromRenderer(context.client, terminalState.sessionId);
  await waitForTerminalClosed(context.client, terminalState.sessionId);
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
  const opened = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Open project folder"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-open-project-folder-button" };
    }
    if (button.disabled) {
      return { ok: false, reason: "disabled-open-project-folder-button" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!opened.ok) {
    throw new Error(`workspace open failed: ${JSON.stringify(opened)}`);
  }
  await waitForState(
    client,
    `(() => {
      const area = document.querySelector('[data-testid="niri-workspace-area"]');
      return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
    })()`,
    (workspaceId) => workspaceId !== "" && !workspaceId.endsWith(":empty"),
    terminalWorkflowTimeoutMs,
  );
}

async function maximizeTerminalPane(client) {
  const result = await client.evaluate(`(() => {
    const host = terminalHost();
    const button = host?.querySelector('[data-niri-pane-maximize-button="true"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-maximize-button" };
    }
    if (host.dataset.maximized !== "true") {
      button.click();
    }
    return { ok: true };

    function terminalHost() {
      return document.querySelector('[data-testid="niri-fake-pane-host"][data-surface-kind="terminal"]');
    }
  })()`);
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

async function focusTerminal(client) {
  const result = await client.evaluate(`(() => {
    const host = document.querySelector('[data-testid="niri-fake-pane-host"][data-surface-kind="terminal"]');
    const viewport = host?.querySelector(".niri-xterm-viewport");
    const textarea = host?.querySelector(".xterm-helper-textarea");
    if (!(viewport instanceof HTMLElement) || !(textarea instanceof HTMLTextAreaElement)) {
      return { ok: false, reason: "missing-xterm-focus-target" };
    }
    viewport.click();
    textarea.focus();
    return { ok: document.activeElement === textarea };
  })()`);
  if (!result.ok) {
    throw new Error(`terminal focus failed: ${JSON.stringify(result)}`);
  }
}

async function sendTerminalCommand(client, text) {
  await client.call("Input.insertText", { text });
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
  await delay(100);
}

async function waitForTerminalText(client, expectedText) {
  return waitForState(
    client,
    terminalSnapshotExpression(),
    (snapshot) => snapshot.text.includes(expectedText),
    terminalWorkflowTimeoutMs,
  );
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

async function waitForTerminalClosed(client, sessionId) {
  return waitForState(
    client,
    terminalSnapshotExpression(),
    (snapshot) =>
      snapshot.sessionId === sessionId && snapshot.statusText.includes("Terminal closed"),
    terminalWorkflowTimeoutMs,
  );
}

function terminalSnapshotExpression() {
  return `(() => {
    const host = document.querySelector('[data-testid="niri-fake-pane-host"][data-surface-kind="terminal"]');
    if (!(host instanceof HTMLElement)) {
      return emptySnapshot(false);
    }
    const rect = host.getBoundingClientRect();
    const rows = [...host.querySelectorAll(".xterm-rows > div")]
      .map((row) => row.textContent ?? "")
      .join("\\n");
    return {
      exists: true,
      maximized: host.dataset.maximized === "true",
      sessionId: host.dataset.terminalSessionId ?? "",
      statusText: host.querySelector(".niri-terminal-status")?.textContent?.trim() ?? "",
      text: rows,
      visible: host.dataset.visible === "true" && rect.width > 0 && rect.height > 0,
      xtermReady: Boolean(host.querySelector(".xterm-helper-textarea")),
    };

    function emptySnapshot(exists) {
      return {
        exists,
        maximized: false,
        sessionId: "",
        statusText: "",
        text: "",
        visible: false,
        xtermReady: false,
      };
    }
  })()`;
}

async function writeTerminalSnapshot(client, path) {
  await writeJson(path, await client.evaluate(terminalSnapshotExpression()));
}

async function assertTerminalRecordingEvidence(recordingDir) {
  const ipc = await readJsonLinesOptional(join(recordingDir, "ipc.jsonl"));
  const failures = ipc.filter((entry) => entry.type === "ipc_failure");
  if (failures.length > 0) {
    throw new Error(`recording included IPC failures: ${JSON.stringify(failures)}`);
  }
  for (const channel of [
    "workspace:open-local-folder",
    "terminal:create",
    "terminal:input",
    "terminal:resize",
    "terminal:close",
  ]) {
    if (!ipc.some((entry) => entry.type === "ipc_finish" && entry.channel === channel)) {
      throw new Error(`recording missing successful terminal IPC channel: ${channel}`);
    }
  }

  const backend = await readJsonLinesOptional(join(recordingDir, "backend-http.jsonl"));
  for (const path of [
    "/workspaces/open",
    "/terminals/create",
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

function backendResponseMatches(entry, path) {
  return (
    entry.type === "backend_http_response" &&
    entry.status === 200 &&
    typeof entry.url === "string" &&
    entry.url.includes(path)
  );
}

function terminalEventMatches(entry, type) {
  return entry.type === "terminal_event_forwarded" && entry.payload?.type === type;
}
