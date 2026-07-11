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
const desktopViewport = { deviceScaleFactor: 1, height: 900, mobile: false, width: 1440 };
const mobileViewport = { deviceScaleFactor: 1, height: 700, mobile: false, width: 390 };
const restartRecoveryPrompt = "cancel active workflow";
const restartRecoveryError = "run interrupted by backend restart";
const longRequestText = `easy run phase5 long request workflow ${"unbrokenlayouttoken".repeat(36)}`;
const longRequestSteerText = "finish easy run phase5 long request";

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
  assertTerminalVisual(completed, "easy run phase2 complete workflow", "Done in", {
    expectedNarration: "The Easy Button run finished.",
  });
  await captureScreenshot(context.client, join(artifactDir, "easy-button-complete.png"));

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const restoredTerminal = await waitForEasyButtonTerminal(
    context.client,
    "easy run phase2 complete workflow",
    "Done in",
  );
  assertTerminalVisual(restoredTerminal, "easy run phase2 complete workflow", "Done in", {
    expectedNarration: "The Easy Button run finished.",
  });
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
  assertTerminalVisual(secondCompleted, "easy run phase2 second workflow", "Done in", {
    expectedNarration: "The Easy Button run finished.",
  });
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
  assertTerminalVisual(steeredTerminal, "easy run phase2 steering workflow", "Done in", {
    expectedNarration: "The Easy Button run finished.",
  });
  await captureScreenshot(context.client, join(artifactDir, "easy-button-steered-complete.png"));

  await submitEasyButtonRequest(context.client, "easy run phase3 artifacts workflow");
  const artifactTerminal = await waitForEasyButtonTerminalWithArtifacts(
    context.client,
    "easy run phase3 artifacts workflow",
    2,
  );
  assertArtifactTerminalVisual(artifactTerminal, "easy run phase3 artifacts workflow");
  await captureScreenshot(context.client, join(artifactDir, "easy-button-artifacts-complete.png"));

  await submitEasyButtonRequest(context.client, "easy run phase5 artifact cap workflow");
  const artifactCapTerminal = await waitForEasyButtonArtifactCapTerminal(context.client);
  assertArtifactCapOverflowVisual(artifactCapTerminal, "easy run phase5 artifact cap workflow");
  await captureScreenshot(
    context.client,
    join(artifactDir, "easy-button-artifact-cap-overflow.png"),
  );

  const longRequestLayout = await exerciseLongRequestLayout(context.client, artifactDir);

  await submitEasyButtonRequest(context.client, "easy run phase4 narrator workflow");
  const narratorTerminal = await waitForEasyButtonTerminalWithHighlights(
    context.client,
    "easy run phase4 narrator workflow",
    2,
  );
  assertNarratorTerminalVisual(narratorTerminal, "easy run phase4 narrator workflow");
  await captureScreenshot(context.client, join(artifactDir, "easy-button-narrator-complete.png"));

  await submitEasyButtonRequest(context.client, "easy run working narrator cadence");
  const workingNarrator = await waitForEasyButtonWorkingWithHighlights(
    context.client,
    "easy run working narrator cadence",
    2,
  );
  assertWorkingNarratorVisual(workingNarrator, "easy run working narrator cadence");
  await captureScreenshot(
    context.client,
    join(artifactDir, "easy-button-working-narrator-highlights.png"),
  );
  await submitEasyButtonRequest(context.client, "finish working narrator cadence");
  const workingNarratorTerminal = await waitForEasyButtonTerminalWithHighlights(
    context.client,
    "easy run working narrator cadence",
    2,
  );
  assertWorkingNarratorTerminalVisual(workingNarratorTerminal, "easy run working narrator cadence");
  await captureScreenshot(
    context.client,
    join(artifactDir, "easy-button-working-narrator-complete.png"),
  );

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
  assertTerminalVisual(stopped, "cancel active workflow", "Stopped after", {
    expectedNarration: "The run was stopped before finishing.",
  });

  await forceEasyButtonFrozenAttribute(context.client);
  const frozen = await waitForEasyButtonFrozen(context.client);
  if (frozen.buttonAnimationPlayState !== "paused") {
    throw new Error(`easy-button animation was not paused while frozen: ${JSON.stringify(frozen)}`);
  }
  await captureScreenshot(context.client, join(artifactDir, "easy-button-frozen.png"));

  await stopElectronCdpContext(context);
  context = null;
  const restartRecovery = await runEasyButtonRestartRecovery(join(artifactDir, "restart-recovery"));
  const mobileLongRequestLayout = await runEasyButtonMobileLongRequest(
    join(artifactDir, "mobile-long-request"),
  );

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    completed,
    focusedAfterCenterClick,
    frozen,
    longRequestLayout,
    mobileLongRequestLayout,
    restartRecovery,
    restoredTerminal,
    restored,
    secondCompleted,
    shortcutOpen,
    artifactTerminal,
    artifactCapTerminal,
    narratorTerminal,
    workingNarrator,
    workingNarratorTerminal,
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

async function runEasyButtonMobileLongRequest(recordingRoot) {
  const mobileFixture = await createElectronFixture("easy-button-mobile-long-request");
  let mobileContext = null;
  try {
    mobileContext = await launchElectronCdpContext({
      artifactDir: recordingRoot,
      extraEnv: {
        SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      },
      fixture: mobileFixture,
      visible: options.visible,
    });
    await mobileContext.client.call("Emulation.setDeviceMetricsOverride", desktopViewport);
    await waitForSelector(mobileContext.client, '[data-testid="workspace-layout-area"]');
    await mobileContext.client.installDriver();
    await ensureWorkspaceOpen(mobileContext.client);

    await mobileContext.client.call("Emulation.setDeviceMetricsOverride", mobileViewport);
    await waitForCompactLayout(mobileContext.client);
    await openEasyButtonFromShortcut(mobileContext.client);
    const opened = await waitForEasyButtonPane(mobileContext.client);
    assertFullWidthColumn(opened);
    const openedContained = await waitForEasyButtonStageContained(mobileContext.client);
    assertIdleVisual(openedContained);

    await submitEasyButtonRequest(mobileContext.client, longRequestText);
    await waitForEasyButtonWorking(mobileContext.client, longRequestText);
    const working = await waitForEasyButtonStageContained(mobileContext.client);
    assertWorkingVisual(working, longRequestText);
    assertLongRequestLayout(working, "mobile working long request");
    await captureScreenshot(
      mobileContext.client,
      join(recordingRoot, "easy-button-mobile-long-request-working.png"),
    );

    await submitEasyButtonRequest(mobileContext.client, longRequestSteerText);
    await waitForEasyButtonTerminal(mobileContext.client, longRequestText, "Done in");
    const terminalContained = await waitForEasyButtonStageContained(mobileContext.client);
    assertTerminalVisual(terminalContained, longRequestText, "Done in", {
      expectedNarration: "The Easy Button run finished.",
    });
    assertLongRequestLayout(terminalContained, "mobile terminal long request");
    await captureScreenshot(
      mobileContext.client,
      join(recordingRoot, "easy-button-mobile-long-request-complete.png"),
    );
    return { opened: openedContained, terminal: terminalContained, working };
  } finally {
    await stopElectronCdpContext(mobileContext);
    await rm(mobileFixture.tempRoot, { force: true, recursive: true });
  }
}

async function waitForCompactLayout(client) {
  return waitForState(
    client,
    `(() => document.querySelector('[data-testid="workspace-layout-area"]')?.getAttribute("data-compact-layout") ?? "")()`,
    (value) => value === "true",
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonStageContained(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) => state.exists && rectContains(state.stageRect, state.rect),
    workflowTimeoutMs,
  );
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

async function exerciseLongRequestLayout(client, artifactDir) {
  await client.call("Emulation.setDeviceMetricsOverride", desktopViewport);
  await submitEasyButtonRequest(client, longRequestText);
  const working = await waitForEasyButtonWorking(client, longRequestText);
  assertWorkingVisual(working, longRequestText);
  assertLongRequestLayout(working, "desktop working long request");
  await captureScreenshot(client, join(artifactDir, "easy-button-long-request-working.png"));

  await submitEasyButtonRequest(client, longRequestSteerText);
  const terminal = await waitForEasyButtonTerminal(client, longRequestText, "Done in");
  assertTerminalVisual(terminal, longRequestText, "Done in", {
    expectedNarration: "The Easy Button run finished.",
  });
  assertLongRequestLayout(terminal, "desktop terminal long request");
  await captureScreenshot(client, join(artifactDir, "easy-button-long-request-complete.png"));
  return { terminal, working };
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

function assertTerminalVisual(state, requestText, summaryFact, options = {}) {
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
  assertNarratorHealth(state, options.expectedNarration ?? null);
  if (!state.summaryText.includes(summaryFact) || !state.summaryText.includes("no artifacts")) {
    throw new Error(
      `easy-button terminal summary did not match Phase 2d: ${JSON.stringify(state)}`,
    );
  }
}

function assertArtifactTerminalVisual(state, requestText) {
  assertStateFields(
    state,
    {
      buttonAriaLabel: "Focus Easy Button request input",
      easyState: "complete",
      inputDisabled: false,
      paneChromeTitle: "Easy Button · complete",
      requestText,
      stopButtonVisible: false,
    },
    "easy-button artifact terminal visual did not match Phase 3",
  );
  assertNarratorHealth(state, "The Easy Button run finished.");
  if (!state.summaryText.includes("Done in") || !state.summaryText.includes("2 artifacts")) {
    throw new Error(`easy-button artifact summary did not include count: ${JSON.stringify(state)}`);
  }
  const titles = state.artifacts.map((artifact) => artifact.title);
  const kinds = state.artifacts.map((artifact) => artifact.kind);
  if (state.artifacts.length !== 2 || kinds.join(",") !== "markdown,table") {
    throw new Error(`easy-button artifact cards had wrong kinds: ${JSON.stringify(state)}`);
  }
  if (!titles.includes("Phase 3 Report") || !titles.includes("Artifact Table")) {
    throw new Error(`easy-button artifact cards had wrong titles: ${JSON.stringify(state)}`);
  }
  const railText = state.artifacts.map((artifact) => artifact.text).join("\n");
  for (const expected of ["scripted easy run emitted", "Markdown", "Ready"]) {
    if (!railText.includes(expected)) {
      throw new Error(
        `easy-button artifact card text missing ${expected}: ${JSON.stringify(state)}`,
      );
    }
  }
}

function assertArtifactCapOverflowVisual(state, requestText) {
  assertStateFields(
    state,
    {
      buttonAriaLabel: "Focus Easy Button request input",
      easyState: "complete",
      inputDisabled: false,
      paneChromeTitle: "Easy Button · complete",
      requestText,
      stopButtonVisible: false,
    },
    "easy-button artifact cap terminal visual did not match Phase 5",
  );
  assertNarratorHealth(state, "The run could not finish.");
  if (
    !state.summaryText.includes("Failed after") ||
    !state.summaryText.includes("artifact limit reached") ||
    !state.summaryText.includes("20 artifacts")
  ) {
    throw new Error(
      `easy-button artifact cap summary did not expose the cap failure: ${JSON.stringify(state)}`,
    );
  }
  const titles = state.artifacts.map((artifact) => artifact.title);
  if (
    state.artifacts.length !== 20 ||
    titles[0] !== "Cap Artifact 01" ||
    titles[19] !== "Cap Artifact 20" ||
    titles.includes("Overflow Artifact")
  ) {
    throw new Error(`easy-button artifact cap cards were wrong: ${JSON.stringify(state)}`);
  }
}

function assertLongRequestLayout(state, label) {
  assertRequestTextConstrained(state, label);
  assertTextHasNoHorizontalOverflow(state.requestTextMetrics, label, "request text");
  assertRectContains(state.stageRect, state.rect, label, "pane host");
  assertRectContains(state.centerRect, state.runCopyRect, label, "run copy");
  assertNoRectOverlap(state.buttonRect, state.runCopyRect, label, "control", "run copy");
  assertNoRectOverlap(state.runCopyRect, state.inputRect, label, "run copy", "input");
  if (state.stopButtonVisible) {
    assertNoRectOverlap(state.runCopyRect, state.stopButtonRect, label, "run copy", "stop");
  }
  if (state.summaryText !== "") {
    assertTextHasNoHorizontalOverflow(state.summaryTextMetrics, label, "summary");
  }
}

function assertRequestTextConstrained(state, label) {
  const metrics = state.requestTextMetrics;
  if (!metrics.exists || metrics.webkitLineClamp !== "4" || metrics.overflowWrap !== "anywhere") {
    throw new Error(
      `easy-button ${label} request text was not constrained: ${JSON.stringify(state)}`,
    );
  }
  const maxClampedHeight = metrics.lineHeightPx * 4 + 4;
  if (metrics.clientHeight > maxClampedHeight || metrics.scrollHeight <= metrics.clientHeight) {
    throw new Error(`easy-button ${label} request text did not clamp: ${JSON.stringify(state)}`);
  }
}

function assertTextHasNoHorizontalOverflow(metrics, label, name) {
  if (metrics.exists && metrics.scrollWidth > metrics.clientWidth + 2) {
    throw new Error(
      `easy-button ${label} ${name} overflowed horizontally: ${JSON.stringify(metrics)}`,
    );
  }
}

function assertRectContains(container, child, label, childName) {
  if (!rectHasArea(container) || !rectHasArea(child) || !rectContains(container, child)) {
    throw new Error(
      `easy-button ${label} ${childName} escaped its container: ${JSON.stringify({ child, container })}`,
    );
  }
}

function assertNoRectOverlap(first, second, label, firstName, secondName) {
  if (rectHasArea(first) && rectHasArea(second) && rectsOverlap(first, second)) {
    throw new Error(
      `easy-button ${label} ${firstName} overlapped ${secondName}: ${JSON.stringify({ first, second })}`,
    );
  }
}

function rectHasArea(rect) {
  return rect.width > 0 && rect.height > 0;
}

function rectContains(container, child) {
  return (
    child.left >= container.left - 2 &&
    child.top >= container.top - 2 &&
    rectRight(child) <= rectRight(container) + 2 &&
    rectBottom(child) <= rectBottom(container) + 2
  );
}

function rectsOverlap(first, second) {
  return (
    first.left < rectRight(second) &&
    rectRight(first) > second.left &&
    first.top < rectBottom(second) &&
    rectBottom(first) > second.top
  );
}

function rectRight(rect) {
  return rect.left + rect.width;
}

function rectBottom(rect) {
  return rect.top + rect.height;
}

function assertNarratorTerminalVisual(state, requestText) {
  assertStateFields(
    state,
    {
      buttonAriaLabel: "Focus Easy Button request input",
      easyState: "complete",
      inputDisabled: false,
      paneChromeTitle: "Easy Button · complete",
      requestText,
      stopButtonVisible: false,
    },
    "easy-button narrator terminal visual did not match Phase 4",
  );
  if (
    !state.summaryText.includes("scripted narrator condensed") ||
    !state.summaryText.includes("Done in")
  ) {
    throw new Error(`easy-button narrator summary did not render: ${JSON.stringify(state)}`);
  }
  assertNarratorHealth(state, null);
  const highlightTexts = state.highlights.map((highlight) => highlight.text);
  if (
    state.highlights.length !== 2 ||
    highlightTexts[0] !== "Framing the request as a user-facing result" ||
    highlightTexts[1] !== "Preparing the final visible answer"
  ) {
    throw new Error(`easy-button narrator highlights were wrong: ${JSON.stringify(state)}`);
  }
  if (state.railText.includes("Command noise")) {
    throw new Error(`easy-button narrator leaked command noise: ${JSON.stringify(state)}`);
  }
}

function assertWorkingNarratorVisual(state, requestText) {
  assertStateFields(
    state,
    {
      agentChipText: "1 agent",
      buttonAriaLabel: "Focus Easy Button steering input",
      easyState: "working",
      inputDisabled: false,
      paneChromeTitle: "Easy Button · working",
      requestText,
      stopButtonAriaLabel: "Stop easy run",
      stopButtonDisabled: false,
      stopButtonText: "Stop",
      stopButtonVisible: true,
    },
    "easy-button working narrator visual did not match Phase 4",
  );
  assertNarratorHealth(state, null);
  assertWorkingNarratorHighlights(state);
  if (state.summaryText !== "") {
    throw new Error(
      `easy-button working narrator rendered terminal summary: ${JSON.stringify(state)}`,
    );
  }
}

function assertWorkingNarratorTerminalVisual(state, requestText) {
  assertStateFields(
    state,
    {
      buttonAriaLabel: "Focus Easy Button request input",
      easyState: "complete",
      inputDisabled: false,
      paneChromeTitle: "Easy Button · complete",
      requestText,
      stopButtonVisible: false,
    },
    "easy-button working narrator terminal visual did not match Phase 4",
  );
  assertNarratorHealth(state, "The Easy Button run finished.");
  assertWorkingNarratorHighlights(state);
  if (!state.summaryText.includes("Done in") || !state.summaryText.includes("no artifacts")) {
    throw new Error(
      `easy-button working narrator terminal summary was wrong: ${JSON.stringify(state)}`,
    );
  }
}

function assertWorkingNarratorHighlights(state) {
  const highlightTexts = state.highlights.map((highlight) => highlight.text);
  if (
    state.highlights.length !== 2 ||
    highlightTexts[0] !== "Working through the request shape" ||
    highlightTexts[1] !== "Preparing a visible result"
  ) {
    throw new Error(`easy-button working narrator highlights were wrong: ${JSON.stringify(state)}`);
  }
  if (state.railText.includes("Working narrator phase evidence")) {
    throw new Error(
      `easy-button working narrator leaked digest evidence: ${JSON.stringify(state)}`,
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
  assertTerminalVisual(state, restartRecoveryPrompt, "Failed after", {
    expectedNarration: null,
  });
  if (!state.summaryText.includes(restartRecoveryError)) {
    throw new Error(
      `easy-button restart recovery summary omitted reason: ${JSON.stringify(state)}`,
    );
  }
}

function assertNarratorHealth(state, expectedNarration) {
  if (state.narratorStatusText !== "") {
    throw new Error(`easy-button narrator unexpectedly degraded: ${JSON.stringify(state)}`);
  }
  if (expectedNarration && !state.summaryText.includes(expectedNarration)) {
    throw new Error(`easy-button narrator summary was missing: ${JSON.stringify(state)}`);
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
      state.summaryText.includes(summaryPrefix),
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonTerminalWithArtifacts(client, requestText, artifactCount) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "complete" &&
      state.requestText === requestText &&
      state.summaryText.includes("Done in") &&
      state.artifacts.length === artifactCount,
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonArtifactCapTerminal(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "complete" &&
      state.requestText === "easy run phase5 artifact cap workflow" &&
      state.summaryText.includes("Failed after") &&
      state.summaryText.includes("artifact limit reached") &&
      state.artifacts.length === 20,
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonTerminalWithHighlights(client, requestText, highlightCount) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "complete" &&
      state.requestText === requestText &&
      state.highlights.length === highlightCount,
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonWorkingWithHighlights(client, requestText, highlightCount) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "working" &&
      state.requestText === requestText &&
      state.highlights.length === highlightCount,
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
