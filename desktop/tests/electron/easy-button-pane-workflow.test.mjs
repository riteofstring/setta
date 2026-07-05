#!/usr/bin/env node
/* global console */

import { readFile, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import process from "node:process";
import { URL } from "node:url";

import {
  killExternalBackend,
  startExternalScriptedBackend,
  stopExternalBackend,
} from "./chat-workflow-external-backend.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  reloadPage,
  repoRoot,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "easy-button-pane";
const workflowTimeoutMs = 25_000;
const restartRecoveryPrompt = "cancel active workflow";
const restartRecoveryError = "run interrupted by backend restart";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/easy-button-pane-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
let context = null;

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
  await context.client.installDriver();
  await ensureWorkspaceOpen(context.client);

  await openEasyButtonFromToolbar(context.client);
  const toolbarOpen = await waitForEasyButtonPane(context.client);
  assertFullWidthColumn(toolbarOpen);
  assertIdleVisual(toolbarOpen);
  await captureScreenshot(context.client, join(artifactDir, "easy-button-toolbar-open.png"));

  await closeEasyButtonPane(context.client, toolbarOpen.paneId);
  await waitForNoEasyButtonPane(context.client);
  await openEasyButtonFromShortcut(context.client);
  const shortcutOpen = await waitForEasyButtonPane(context.client);
  assertFullWidthColumn(shortcutOpen);
  assertIdleVisual(shortcutOpen);
  await captureScreenshot(context.client, join(artifactDir, "easy-button-shortcut-open.png"));

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const restored = await waitForEasyButtonPane(context.client);
  assertFullWidthColumn(restored);
  assertIdleVisual(restored);

  await submitEasyButtonRequest(context.client, "easy run phase2 complete workflow");
  const working = await waitForEasyButtonWorking(
    context.client,
    "easy run phase2 complete workflow",
  );
  assertWorkingVisual(working, "easy run phase2 complete workflow");
  await captureScreenshot(context.client, join(artifactDir, "easy-button-working.png"));
  const completed = await waitForEasyButtonTerminal(
    context.client,
    "easy run phase2 complete workflow",
    "Done in",
  );
  assertTerminalVisual(completed, "easy run phase2 complete workflow", "Done in");
  await captureScreenshot(context.client, join(artifactDir, "easy-button-complete.png"));

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const restoredTerminal = await waitForEasyButtonTerminal(
    context.client,
    "easy run phase2 complete workflow",
    "Done in",
  );
  assertTerminalVisual(restoredTerminal, "easy run phase2 complete workflow", "Done in");
  await captureScreenshot(context.client, join(artifactDir, "easy-button-restored-terminal.png"));
  const focusedAfterCenterClick = await focusEasyButtonInputFromCenter(context.client);
  if (!focusedAfterCenterClick.inputFocused) {
    throw new Error(
      `easy-button center control did not focus input: ${JSON.stringify(focusedAfterCenterClick)}`,
    );
  }

  await submitEasyButtonRequest(context.client, "easy run phase2 second workflow");
  const secondCompleted = await waitForEasyButtonTerminal(
    context.client,
    "easy run phase2 second workflow",
    "Done in",
  );
  assertTerminalVisual(secondCompleted, "easy run phase2 second workflow", "Done in");
  await captureScreenshot(context.client, join(artifactDir, "easy-button-second-complete.png"));

  await submitEasyButtonRequest(context.client, "easy run phase2 steering workflow");
  const steeringWorking = await waitForEasyButtonWorking(
    context.client,
    "easy run phase2 steering workflow",
  );
  assertWorkingVisual(steeringWorking, "easy run phase2 steering workflow");
  await submitEasyButtonRequest(context.client, "steer easy run phase2");
  const steeredTerminal = await waitForEasyButtonTerminal(
    context.client,
    "easy run phase2 steering workflow",
    "Done in",
  );
  assertTerminalVisual(steeredTerminal, "easy run phase2 steering workflow", "Done in");
  await captureScreenshot(context.client, join(artifactDir, "easy-button-steered-complete.png"));

  await submitEasyButtonRequest(context.client, "cancel active workflow");
  const stoppingWorking = await waitForEasyButtonWorking(context.client, "cancel active workflow");
  assertWorkingVisual(stoppingWorking, "cancel active workflow");
  const activeRunRejection = await assertActiveRunStartRejected(
    context.client,
    "second active workflow",
    "cancel active workflow",
  );
  await clickEasyButtonStop(context.client);
  const stopped = await waitForEasyButtonTerminal(
    context.client,
    "cancel active workflow",
    "Stopped after",
  );
  assertTerminalVisual(stopped, "cancel active workflow", "Stopped after");

  await forceEasyButtonFrozenAttribute(context.client);
  const frozen = await waitForEasyButtonFrozen(context.client);
  if (frozen.buttonAnimationPlayState !== "paused") {
    throw new Error(`easy-button animation was not paused while frozen: ${JSON.stringify(frozen)}`);
  }
  await captureScreenshot(context.client, join(artifactDir, "easy-button-frozen.png"));

  await stopElectronCdpContext(context);
  context = null;
  const restartRecovery = await runEasyButtonRestartRecovery(join(artifactDir, "restart-recovery"));

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    completed,
    focusedAfterCenterClick,
    frozen,
    restartRecovery,
    restoredTerminal,
    restored,
    secondCompleted,
    shortcutOpen,
    steeredTerminal,
    steeringWorking,
    status: "passed",
    activeRunRejection,
    stopped,
    toolbarOpen,
    working,
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron easy button pane workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      easyButton: await safeEasyButtonState(context.client),
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

async function ensureWorkspaceOpen(client) {
  const currentWorkspaceId = await client.evaluate(workspaceIdExpression());
  if (currentWorkspaceId && currentWorkspaceId !== "empty") {
    return;
  }
  await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  await waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => workspaceId !== "" && workspaceId !== "empty",
    workflowTimeoutMs,
  );
}

async function runEasyButtonRestartRecovery(recordingRoot) {
  const recoveryFixture = await createElectronFixture("easy-button-restart-recovery");
  const recordingDir = join(recordingRoot, "in-place-backend-restart");
  let context = null;
  let firstBackend = null;
  let secondBackend = null;

  try {
    firstBackend = await startExternalScriptedBackend(recoveryFixture, repoRoot);
    context = await launchExternalBackendEasyButtonContext(
      recoveryFixture,
      recordingDir,
      firstBackend,
    );
    await ensureWorkspaceOpen(context.client);
    await openEasyButtonFromToolbar(context.client);
    const opened = await waitForEasyButtonPane(context.client);
    assertFullWidthColumn(opened);
    assertIdleVisual(opened);
    await submitEasyButtonRequest(context.client, restartRecoveryPrompt);
    const working = await waitForEasyButtonWorking(context.client, restartRecoveryPrompt);
    assertWorkingVisual(working, restartRecoveryPrompt);
    await captureScreenshot(context.client, join(recordingDir, "easy-button-restart-working.png"));

    const restartPort = portFromBackendURL(firstBackend.url);
    await killExternalBackend(firstBackend);
    firstBackend = null;
    secondBackend = await startExternalScriptedBackend(recoveryFixture, repoRoot, {
      port: restartPort,
      skipBootstrapDeviceSession: true,
    });
    const recovered = await waitForEasyButtonTerminal(
      context.client,
      restartRecoveryPrompt,
      "Failed after",
    );
    assertRestartRecoveredVisual(recovered);
    await assertEasyRunResyncForwarded(recordingDir);
    await captureScreenshot(
      context.client,
      join(recordingDir, "easy-button-restart-recovered.png"),
    );
    return { recovered, working };
  } finally {
    await stopElectronCdpContext(context);
    await stopExternalBackend(firstBackend, { force: true });
    await stopExternalBackend(secondBackend);
    await rm(recoveryFixture.tempRoot, { force: true, recursive: true });
  }
}

async function assertEasyRunResyncForwarded(recordingDir) {
  const rows = await readJsonLines(join(recordingDir, "events.jsonl"));
  const resync = rows.find(
    (row) =>
      row.type === "easy_run_event_forwarded" && row.payload?.type === "easyrun.resync_required",
  );
  if (!resync) {
    throw new Error(`easy-run resync event was not forwarded in ${recordingDir}`);
  }
}

async function readJsonLines(path) {
  const text = await readFile(path, "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line));
}

function portFromBackendURL(rawURL) {
  const url = new URL(rawURL);
  const port = Number.parseInt(url.port, 10);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`external backend URL did not include a reusable port: ${rawURL}`);
  }
  return port;
}

async function launchExternalBackendEasyButtonContext(fixture, recordingDir, backend) {
  const launched = await launchElectronCdpContext({
    artifactDir: recordingDir,
    extraEnv: {
      SETTA_BACKEND_TOKEN: backend.token,
      SETTA_BACKEND_URL: backend.url,
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(launched.client, '[data-testid="workspace-layout-area"]');
  await launched.client.installDriver();
  return launched;
}

async function openEasyButtonFromToolbar(client) {
  await clickEnabledButtonByAria(client, "New frame", workflowTimeoutMs);
  const clicked = await client.driver("easyButtonPaneClickToolbarAction");
  if (!clicked) {
    throw new Error("easy button toolbar action was not clickable");
  }
}

async function openEasyButtonFromShortcut(client) {
  const dispatched = await client.driver("easyButtonPaneOpenShortcut");
  if (!dispatched) {
    throw new Error("easy button shortcut was not dispatched");
  }
}

async function closeEasyButtonPane(client, paneId) {
  const closed = await client.driver("easyButtonPaneClose", { paneId });
  if (!closed) {
    throw new Error(`easy button pane close action was not clickable: ${paneId}`);
  }
}

async function submitEasyButtonRequest(client, requestText) {
  const submitted = await client.driver("easyButtonPaneSubmitRequest", requestText);
  if (!submitted) {
    throw new Error(`easy button request input was not submittable: ${requestText}`);
  }
}

async function clickEasyButtonControl(client) {
  const clicked = await client.driver("easyButtonPaneClickControl");
  if (!clicked) {
    throw new Error("easy button control was not clickable");
  }
}

async function clickEasyButtonStop(client) {
  const clicked = await client.driver("easyButtonPaneClickStop");
  if (!clicked) {
    throw new Error("easy button stop control was not clickable");
  }
}

async function focusEasyButtonInputFromCenter(client) {
  await clickEasyButtonControl(client);
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) => state.exists && state.inputFocused === true,
    workflowTimeoutMs,
  );
}

async function assertActiveRunStartRejected(client, requestText, activeRequestText) {
  const result = await client.driver("easyButtonPaneStartDirect", requestText);
  if (result.ok || !result.message.includes("already working")) {
    throw new Error(`easy-button active-run start was not rejected: ${JSON.stringify(result)}`);
  }
  const state = await waitForEasyButtonWorking(client, activeRequestText);
  assertWorkingVisual(state, activeRequestText);
  return result;
}

async function forceEasyButtonFrozenAttribute(client) {
  const frozen = await client.driver("easyButtonPaneForceFrozen");
  if (!frozen) {
    throw new Error("easy button pane host was not available for frozen CSS verification");
  }
}

function assertFullWidthColumn(state) {
  if (state.layoutWidthSpec?.unit !== "proportion" || state.layoutWidthSpec.value !== 1) {
    throw new Error(
      `easy-button pane did not persist a full-width column spec: ${JSON.stringify(state)}`,
    );
  }
  if (state.widthRatio < 0.75) {
    throw new Error(
      `easy-button pane was not opened as a full-width column: ${JSON.stringify(state)}`,
    );
  }
}

function assertIdleVisual(state) {
  if (state.easyState !== "idle" || !state.buttonVisible || state.railText !== "") {
    throw new Error(`easy-button idle visual did not match Phase 2b: ${JSON.stringify(state)}`);
  }
  if (state.buttonAnimationName !== "easy-button-glow-breathe") {
    throw new Error(`easy-button idle glow animation was missing: ${JSON.stringify(state)}`);
  }
  if (
    state.buttonAriaLabel !== "Focus Easy Button request input" ||
    state.inputDisabled !== false ||
    state.stopButtonVisible !== false ||
    state.paneChromeTitle !== "Easy Button"
  ) {
    throw new Error(`easy-button idle controls did not match Phase 2d: ${JSON.stringify(state)}`);
  }
}

function assertWorkingVisual(state, requestText) {
  assertStateFields(
    state,
    {
      agentChipText: "1 agent",
      buttonAriaLabel: "Focus Easy Button steering input",
      easyState: "working",
      inputDisabled: false,
      paneChromeTitle: "Easy Button · working",
      railText: "",
      requestText,
      stopButtonAriaLabel: "Stop easy run",
      stopButtonDisabled: false,
      stopButtonText: "Stop",
      stopButtonVisible: true,
    },
    "easy-button working visual did not match Phase 2d",
  );
}

function assertTerminalVisual(state, requestText, summaryPrefix) {
  assertStateFields(
    state,
    {
      buttonAriaLabel: "Focus Easy Button request input",
      easyState: "complete",
      inputDisabled: false,
      paneChromeTitle: "Easy Button · complete",
      railText: "",
      requestText,
      stopButtonVisible: false,
    },
    "easy-button terminal visual did not match Phase 2d",
  );
  if (!state.summaryText.startsWith(summaryPrefix) || !state.summaryText.includes("no artifacts")) {
    throw new Error(
      `easy-button terminal summary did not match Phase 2d: ${JSON.stringify(state)}`,
    );
  }
}

function assertStateFields(state, expected, message) {
  for (const [key, value] of Object.entries(expected)) {
    if (state[key] !== value) {
      throw new Error(`${message}: ${JSON.stringify(state)}`);
    }
  }
}

function assertRestartRecoveredVisual(state) {
  assertTerminalVisual(state, restartRecoveryPrompt, "Failed after");
  if (!state.summaryText.includes(restartRecoveryError)) {
    throw new Error(
      `easy-button restart recovery summary omitted reason: ${JSON.stringify(state)}`,
    );
  }
}

async function waitForEasyButtonPane(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "idle" &&
      state.buttonVisible &&
      state.paneChromeTitle === "Easy Button",
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonWorking(client, requestText) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "working" &&
      state.requestText === requestText &&
      state.buttonAriaLabel === "Focus Easy Button steering input" &&
      state.inputDisabled === false &&
      state.stopButtonDisabled === false &&
      state.stopButtonVisible === true,
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonTerminal(client, requestText, summaryPrefix) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "complete" &&
      state.requestText === requestText &&
      state.summaryText.startsWith(summaryPrefix),
    workflowTimeoutMs,
  );
}

async function waitForNoEasyButtonPane(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) => !state.exists,
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonFrozen(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) => state.exists && state.hostFrozen === "true",
    workflowTimeoutMs,
  );
}

async function safeEasyButtonState(client) {
  try {
    return await client.evaluate(easyButtonStateExpression());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

function easyButtonStateExpression() {
  return driverCallExpression("easyButtonPaneState");
}
