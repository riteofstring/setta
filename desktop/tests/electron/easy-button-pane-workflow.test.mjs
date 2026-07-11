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
import {
  assertArtifactMotionParameters,
  assertEqualDesktopRailGeometry,
  assertHighlightCascade,
  assertHighlightDotPulse,
  assertNewestDotTone,
  assertControlBorderTone,
  assertRailLabelsMatchContent,
  assertRailLabelText,
  assertSummaryOkMark,
  assertSwirlComplete,
  assertSwirlFrozen,
  assertSwirlIdle,
  assertSwirlWorking,
  assertTerminalTone,
  opacityMatches,
  railLabelsMatchContent,
} from "./easy-button-pane-visual-assertions.mjs";
import {
  clickEasyButtonStop,
  desktopViewport,
  easyButtonStateExpression,
  easyButtonStateSettled,
  ensureWorkspaceOpen,
  openEasyButtonFromShortcut,
  submitEasyButtonRequest,
  workflowTimeoutMs,
} from "./easy-button-pane-actions.mjs";
import { assertLosslessSteeringChatRecord } from "./easy-button-chat-record-assertions.mjs";
import { exerciseSteeringPartialOutcome } from "./easy-button-partial-outcome-assertions.mjs";
import { assertHumanReadableTerminalSummary } from "./easy-button-summary-assertions.mjs";
import {
  assertAcceptedSteeringFocusEvents,
  assertCurrentFocusConstrained,
  assertNarratorHealth,
  assertRevisedCurrentFocus,
  assertRevisionZeroCurrentFocus,
  assertStaleCurrentFocus,
  assertUpdatingCurrentFocus,
  assertWorkingNarratorHighlights,
  assertWorkingNarratorTerminalVisual,
  waitForEasyButtonFocusStatus,
} from "./easy-button-focus-assertions.mjs";
import { runEasyButtonPixelMatchCaptures } from "./easy-button-pixel-match.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "easy-button-pane";
const mobileViewport = { deviceScaleFactor: 1, height: 700, mobile: false, width: 390 };
const restartRecoveryPrompt = "cancel active workflow";
const restartRecoveryError = "run interrupted by backend restart";
const longRequestText = `easy run phase5 long request workflow ${"unbrokenlayouttoken".repeat(36)}`;
const longRequestSteerText = "finish easy run phase5 long request";
const longRequestCurrentFocus =
  "Complete the Easy Button long-request workflow while preserving all of its constraints.";
const steeredCurrentFocus =
  "Complete the Easy Button phase 2 workflow while following the accepted steering direction.";

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
  // The idle border is the resting reference, avoiding a hardcoded serialized color.
  const restingBorderColor = toolbarOpen.buttonBorderColor;
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
  if (restoredTerminal.confirmActive !== "false") {
    throw new Error(
      `easy-button restored terminal replayed the confirm pulse: ${JSON.stringify(restoredTerminal)}`,
    );
  }
  await captureScreenshot(context.client, join(artifactDir, "easy-button-restored-terminal.png"));
  const focusedAfterCenterClick = await focusEasyButtonInputFromCenter(context.client);
  if (!focusedAfterCenterClick.inputFocused) {
    throw new Error(
      `easy-button center control did not focus input: ${JSON.stringify(focusedAfterCenterClick)}`,
    );
  }

  await submitEasyButtonRequest(context.client, "easy run phase2 second workflow");
  const confirmPulse = await waitForEasyButtonConfirmPulse(
    context.client,
    "easy run phase2 second workflow",
  );
  const confirmPulseCleared = await waitForEasyButtonConfirmPulseCleared(context.client);
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
  await context.client.driver("easyButtonPaneResetEventLog");
  await submitEasyButtonRequest(context.client, "steer easy run phase2");
  const updatingSteeredFocus = await waitForEasyButtonFocusStatus(
    context.client,
    "easy run phase2 steering workflow",
    "updating",
  );
  assertUpdatingCurrentFocus(
    updatingSteeredFocus,
    "easy run phase2 steering workflow",
    "steer easy run phase2",
  );
  await captureScreenshot(context.client, join(artifactDir, "easy-button-focus-updating.png"));
  const steeredTerminal = await waitForEasyButtonTerminal(
    context.client,
    "easy run phase2 steering workflow",
    "Done in",
  );
  assertTerminalVisual(steeredTerminal, "easy run phase2 steering workflow", "Done in", {
    expectedCurrentFocus: steeredCurrentFocus,
    expectedNarration: "The Easy Button run finished.",
  });
  const steeringEvents = await context.client.driver("easyButtonPaneEventLog");
  assertAcceptedSteeringFocusEvents(
    steeringEvents,
    "easy run phase2 steering workflow",
    steeredCurrentFocus,
  );
  const steeredChatRecord = await context.client.driver("easyButtonPaneChatRecord");
  assertLosslessSteeringChatRecord(
    steeredChatRecord,
    "easy run phase2 steering workflow",
    "steer easy run phase2",
  );
  await captureScreenshot(context.client, join(artifactDir, "easy-button-steered-complete.png"));

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const restoredSteeredTerminal = await waitForEasyButtonTerminal(
    context.client,
    "easy run phase2 steering workflow",
    "Done in",
  );
  assertTerminalVisual(restoredSteeredTerminal, "easy run phase2 steering workflow", "Done in", {
    expectedCurrentFocus: steeredCurrentFocus,
    expectedNarration: "The Easy Button run finished.",
  });
  const restoredSteeredChatRecord = await context.client.driver("easyButtonPaneChatRecord");
  assertLosslessSteeringChatRecord(
    restoredSteeredChatRecord,
    "easy run phase2 steering workflow",
    "steer easy run phase2",
  );

  await submitEasyButtonRequest(context.client, "easy run narrator failure workflow");
  const staleFocus = await waitForEasyButtonFocusStatus(
    context.client,
    "easy run narrator failure workflow",
    "stale",
  );
  assertStaleCurrentFocus(staleFocus, "easy run narrator failure workflow");
  assertStateFields(
    staleFocus,
    {
      easyState: "working",
      helperText: "Working — Stop to cancel",
      stopButtonDisabled: false,
      stopButtonVisible: true,
    },
    "easy-button stale narrator projection stopped the working run",
  );
  await captureScreenshot(context.client, join(artifactDir, "easy-button-focus-stale.png"));
  const partialOutcome = await exerciseSteeringPartialOutcome(context.client, artifactDir);
  await clickEasyButtonStop(context.client);
  const staleFocusStopped = await waitForEasyButtonTerminal(
    context.client,
    "easy run narrator failure workflow",
    "Stopped after",
  );
  assertStaleCurrentFocus(staleFocusStopped, "easy run narrator failure workflow");

  await submitEasyButtonRequest(context.client, "easy run phase3 artifacts workflow");
  const artifactTerminal = await waitForEasyButtonTerminalWithArtifacts(
    context.client,
    "easy run phase3 artifacts workflow",
    4,
  );
  assertArtifactTerminalVisual(artifactTerminal, "easy run phase3 artifacts workflow");
  assertArtifactMotionParameters(artifactTerminal, "artifact terminal");
  const artifactRailLabels = await waitForEasyButtonRailLabelsSettled(context.client);
  assertRailLabelsMatchContent(artifactRailLabels, "artifact terminal");
  await captureScreenshot(context.client, join(artifactDir, "easy-button-artifacts-complete.png"));

  await submitEasyButtonRequest(context.client, "easy run phase5 artifact cap workflow");
  const artifactCapTerminal = await waitForEasyButtonArtifactCapTerminal(context.client);
  assertArtifactCapOverflowVisual(artifactCapTerminal, "easy run phase5 artifact cap workflow");
  assertTerminalTone(artifactCapTerminal, "failed", "artifact cap terminal");
  // The failed run has no highlights, so the control border is its only tone.
  const failedBorder = await waitForEasyButtonControlBorderSettled(context.client);
  assertControlBorderTone(failedBorder, restingBorderColor, false, "artifact cap terminal");
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
  const narratorCascade = await waitForEasyButtonHighlightCascade(
    context.client,
    "complete",
    [0.72, 0.6],
  );
  assertHighlightCascade(narratorCascade, [0.72, 0.6], "narrator terminal");
  assertRailLabelsMatchContent(narratorCascade, "narrator terminal");
  assertTerminalTone(narratorCascade, "completed", "narrator terminal");
  assertNewestDotTone(narratorCascade, "completed", "narrator terminal");
  await captureScreenshot(context.client, join(artifactDir, "easy-button-narrator-complete.png"));

  await submitEasyButtonRequest(context.client, "easy run working narrator cadence");
  await waitForEasyButtonWorkingWithHighlights(
    context.client,
    "easy run working narrator cadence",
    2,
  );
  const workingNarrator = await waitForEasyButtonHighlightCascade(
    context.client,
    "working",
    [0.72, 1],
  );
  assertWorkingNarratorVisual(workingNarrator, "easy run working narrator cadence");
  assertHighlightCascade(workingNarrator, [0.72, 1], "working narrator");
  assertHighlightDotPulse(workingNarrator, "working narrator");
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
  assertWorkingNarratorTerminalVisual(workingNarratorTerminal);
  assertHumanReadableTerminalSummary(
    workingNarratorTerminal.summaryText,
    "completed",
    0,
    "working narrator terminal",
  );
  assertTerminalTone(workingNarratorTerminal, "completed", "working narrator terminal");
  assertNewestDotTone(workingNarratorTerminal, "completed", "working narrator terminal");
  await captureScreenshot(
    context.client,
    join(artifactDir, "easy-button-working-narrator-complete.png"),
  );

  // The success visuals are keyed on the run status, not on the terminal view
  // state, and the only way to prove that is a terminal run that is NOT
  // `completed` yet still has a highlight to tone. The narrator cadence turn
  // parks on steering after emitting its highlights, so stopping it there is the
  // cheapest way to reach `stopped` with a populated rail.
  await submitEasyButtonRequest(context.client, "easy run working narrator cadence");
  await waitForEasyButtonWorkingWithHighlights(
    context.client,
    "easy run working narrator cadence",
    2,
  );
  await clickEasyButtonStop(context.client);
  const stoppedWithHighlights = await waitForEasyButtonTerminalWithHighlights(
    context.client,
    "easy run working narrator cadence",
    2,
  );
  assertHumanReadableTerminalSummary(
    stoppedWithHighlights.summaryText,
    "stopped",
    0,
    "stopped with highlights",
  );
  assertTerminalTone(stoppedWithHighlights, "stopped", "stopped with highlights");
  assertNewestDotTone(stoppedWithHighlights, "resting", "stopped with highlights");
  const stoppedBorder = await waitForEasyButtonControlBorderSettled(context.client);
  assertControlBorderTone(stoppedBorder, restingBorderColor, true, "stopped with highlights");
  await captureScreenshot(
    context.client,
    join(artifactDir, "easy-button-stopped-with-highlights.png"),
  );

  // This run parks in `working` until it is stopped, so it is the only place the
  // swirl's 1600ms fade has room to settle at both of its resting opacities.
  await submitEasyButtonRequest(context.client, "cancel active workflow");
  const stoppingWorking = await waitForEasyButtonWorking(context.client, "cancel active workflow");
  assertWorkingVisual(stoppingWorking, "cancel active workflow");
  const swirlWorking = await waitForEasyButtonSwirlSettled(context.client, "working", 0.85);
  assertSwirlWorking(swirlWorking, "cancel active workflow");
  await captureScreenshot(context.client, join(artifactDir, "easy-button-swirl-working.png"));
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
  assertTerminalTone(stopped, "stopped", "stopped");
  const swirlComplete = await waitForEasyButtonSwirlSettled(context.client, "complete", 0.2);
  assertSwirlComplete(swirlComplete, "stopped");

  await forceEasyButtonFrozenAttribute(context.client);
  const frozen = await waitForEasyButtonFrozen(context.client);
  if (frozen.buttonAnimationPlayState !== "paused") {
    throw new Error(`easy-button animation was not paused while frozen: ${JSON.stringify(frozen)}`);
  }
  assertSwirlFrozen(frozen, "frozen");
  await captureScreenshot(context.client, join(artifactDir, "easy-button-frozen.png"));

  await stopElectronCdpContext(context);
  context = null;
  const restartRecovery = await runEasyButtonRestartRecovery(join(artifactDir, "restart-recovery"));
  const mobileLongRequestLayout = await runEasyButtonMobileLongRequest(
    join(artifactDir, "mobile-long-request"),
  );
  const reducedMotion = await runEasyButtonReducedMotionAudit(join(artifactDir, "reduced-motion"));
  // Pinned stills, in their own context: freezing an animation through the Web
  // Animations API is one-way for the CSS animations it touches, so this must not
  // run before anything that reads `animation-play-state`.
  const pixelMatch = await runEasyButtonPixelMatchCaptures({
    artifactDir: join(artifactDir, "pixel-match"),
    visible: options.visible,
  });

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    completed,
    confirmPulse,
    confirmPulseCleared,
    focusedAfterCenterClick,
    frozen,
    longRequestLayout,
    mobileLongRequestLayout,
    pixelMatchStates: Object.keys(pixelMatch.states),
    partialOutcome,
    reducedMotion,
    restartRecovery,
    restoredTerminal,
    restored,
    secondCompleted,
    shortcutOpen,
    stoppedWithHighlights,
    artifactRailLabels,
    artifactTerminal,
    artifactCapTerminal,
    narratorCascade,
    narratorTerminal,
    workingNarrator,
    workingNarratorTerminal,
    restoredSteeredChatRecord,
    restoredSteeredTerminal,
    steeredChatRecord,
    steeredTerminal,
    steeringWorking,
    staleFocus,
    staleFocusStopped,
    status: "passed",
    activeRunRejection,
    stopped,
    swirlComplete,
    swirlWorking,
    toolbarOpen,
    updatingSteeredFocus,
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
      expectedCurrentFocus: longRequestCurrentFocus,
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

async function runEasyButtonReducedMotionAudit(recordingRoot) {
  const reducedFixture = await createElectronFixture("easy-button-reduced-motion");
  let reducedContext = null;
  try {
    reducedContext = await launchElectronCdpContext({
      artifactDir: recordingRoot,
      extraEnv: {
        SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      },
      fixture: reducedFixture,
      visible: options.visible,
    });
    await emulateReducedMotion(reducedContext.client);
    await waitForSelector(reducedContext.client, '[data-testid="workspace-layout-area"]');
    await reducedContext.client.installDriver();
    await ensureWorkspaceOpen(reducedContext.client);

    await openEasyButtonFromShortcut(reducedContext.client);
    const idle = await waitForEasyButtonPane(reducedContext.client);
    assertFullWidthColumn(idle);
    assertReducedMotionVisual(idle, "idle");
    await captureScreenshot(
      reducedContext.client,
      join(recordingRoot, "easy-button-reduced-idle.png"),
    );

    await submitEasyButtonRequest(reducedContext.client, "cancel active workflow");
    const working = await waitForEasyButtonWorking(reducedContext.client, "cancel active workflow");
    assertWorkingVisual(working, "cancel active workflow");
    assertReducedMotionVisual(working, "working");
    await captureScreenshot(
      reducedContext.client,
      join(recordingRoot, "easy-button-reduced-working.png"),
    );
    await clickEasyButtonStop(reducedContext.client);
    const stopped = await waitForEasyButtonTerminal(
      reducedContext.client,
      "cancel active workflow",
      "Stopped after",
    );
    assertTerminalVisual(stopped, "cancel active workflow", "Stopped after", {
      expectedNarration: "The run was stopped before finishing.",
    });
    assertReducedMotionVisual(stopped, "stopped");

    await submitEasyButtonRequest(reducedContext.client, "easy run phase3 artifacts workflow");
    const artifactTerminal = await waitForEasyButtonTerminalWithArtifacts(
      reducedContext.client,
      "easy run phase3 artifacts workflow",
      4,
    );
    assertArtifactTerminalVisual(artifactTerminal, "easy run phase3 artifacts workflow");
    assertReducedMotionVisual(artifactTerminal, "artifact terminal");
    await captureScreenshot(
      reducedContext.client,
      join(recordingRoot, "easy-button-reduced-artifacts.png"),
    );

    await submitEasyButtonRequest(reducedContext.client, "easy run phase4 narrator workflow");
    const narratorTerminal = await waitForEasyButtonTerminalWithHighlights(
      reducedContext.client,
      "easy run phase4 narrator workflow",
      2,
    );
    assertNarratorTerminalVisual(narratorTerminal, "easy run phase4 narrator workflow");
    assertReducedMotionVisual(narratorTerminal, "narrator terminal");
    // Reduced motion kills the fade transitions, so the cascade is already at rest.
    assertHighlightCascade(narratorTerminal, [0.72, 0.6], "reduced narrator terminal");
    assertRailLabelsMatchContent(narratorTerminal, "reduced narrator terminal");
    await captureScreenshot(
      reducedContext.client,
      join(recordingRoot, "easy-button-reduced-highlights.png"),
    );
    return { artifactTerminal, idle, narratorTerminal, stopped, working };
  } finally {
    await stopElectronCdpContext(reducedContext);
    await rm(reducedFixture.tempRoot, { force: true, recursive: true });
  }
}

async function emulateReducedMotion(client) {
  await client.call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
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

async function closeEasyButtonPane(client, paneId) {
  const closed = await client.driver("easyButtonPaneClose", { paneId });
  if (!closed) {
    throw new Error(`easy button pane close action was not clickable: ${paneId}`);
  }
}

async function clickEasyButtonControl(client) {
  const clicked = await client.driver("easyButtonPaneClickControl");
  if (!clicked) {
    throw new Error("easy button control was not clickable");
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
    expectedCurrentFocus: longRequestCurrentFocus,
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
  assertEqualDesktopRailGeometry(state);
}

function assertIdleVisual(state) {
  if (
    state.currentFocusText !== "" ||
    state.easyState !== "idle" ||
    state.focusBlockDisplay !== "none" ||
    state.focusLabelText !== "" ||
    state.focusStatus !== "none" ||
    !state.buttonVisible ||
    state.railText !== ""
  ) {
    throw new Error(`easy-button idle visual did not match Phase 2b: ${JSON.stringify(state)}`);
  }
  if (state.buttonAnimationName !== "easy-button-glow-breathe") {
    throw new Error(`easy-button idle glow animation was missing: ${JSON.stringify(state)}`);
  }
  assertSwirlIdle(state, "idle");
  assertIdleControls(state);
  assertIdleCaption(state);
  assertIdleRailLabels(state);
}

function assertIdleControls(state) {
  assertStateFields(
    state,
    {
      buttonAriaLabel: "Focus Easy Button request input",
      confirmActive: "false",
      inputDisabled: false,
      paneChromeTitle: "Easy Button",
      speechStatus: "unavailable",
      stopButtonVisible: false,
    },
    "easy-button idle controls did not match Phase 2d",
  );
}
function assertIdleCaption(state) {
  if (state.helperText !== "Type a request to begin" || state.enterChipText !== "⏎") {
    throw new Error(`easy-button idle caption did not match the mockup: ${JSON.stringify(state)}`);
  }
}

function assertIdleRailLabels(state) {
  assertRailLabelText(state, "idle");
  if (!state.railLabels.every((label) => opacityMatches(label.opacity, 0))) {
    throw new Error(`easy-button idle rail labels were not faded: ${JSON.stringify(state)}`);
  }
}

function assertWorkingVisual(state, requestText) {
  assertStateFields(
    state,
    {
      agentChipText: "1 agent",
      buttonAriaLabel: "Focus Easy Button steering input",
      currentFocusText: requestText,
      easyState: "working",
      focusBlockDisplay: "block",
      focusLabelText: "Current focus",
      focusStatus: "current",
      helperText: "Working — Stop to cancel",
      inputDisabled: false,
      paneChromeTitle: "Easy Button · working",
      railText: "",
      stopButtonAriaLabel: "Stop easy run",
      stopButtonDisabled: false,
      stopButtonText: "Stop",
      stopButtonVisible: true,
    },
    "easy-button working visual did not match Phase 2d",
  );
  assertRevisionZeroCurrentFocus(state, requestText);
}

function assertTerminalVisual(state, requestText, summaryFact, options = {}) {
  assertStateFields(
    state,
    {
      buttonAriaLabel: "Focus Easy Button request input",
      currentFocusText: options.expectedCurrentFocus ?? requestText,
      easyState: "complete",
      focusBlockDisplay: "block",
      focusLabelText: "Current focus",
      focusStatus: "current",
      helperText: "Type a request to start again",
      inputDisabled: false,
      paneChromeTitle: "Easy Button · complete",
      railText: "",
      stopButtonVisible: false,
    },
    "easy-button terminal visual did not match Phase 2d",
  );
  assertNarratorHealth(state, options.expectedNarration ?? null);
  const status = {
    "Done in": "completed",
    "Failed after": "failed",
    "Stopped after": "stopped",
  }[summaryFact];
  if (!status) {
    throw new Error(`unsupported easy-button terminal summary fact ${summaryFact}`);
  }
  assertHumanReadableTerminalSummary(state.summaryText, status, 0, "terminal");
  assertSummaryOkMark(state, summaryFact);
  if (options.expectedCurrentFocus) {
    assertRevisedCurrentFocus(state, options.expectedCurrentFocus);
  } else {
    assertRevisionZeroCurrentFocus(state, requestText);
  }
}

function assertArtifactTerminalVisual(state, requestText) {
  assertStateFields(
    state,
    {
      buttonAriaLabel: "Focus Easy Button request input",
      currentFocusText: requestText,
      easyState: "complete",
      focusLabelText: "Current focus",
      focusStatus: "current",
      inputDisabled: false,
      paneChromeTitle: "Easy Button · complete",
      stopButtonVisible: false,
    },
    "easy-button artifact terminal visual did not match Phase 3",
  );
  assertNarratorHealth(state, "The Easy Button run finished.");
  assertHumanReadableTerminalSummary(state.summaryText, "completed", 4, "artifact terminal");
  const titles = state.artifacts.map((artifact) => artifact.title);
  const kinds = state.artifacts.map((artifact) => artifact.kind);
  if (state.artifacts.length !== 4 || kinds.join(",") !== "markdown,table,bar_chart,file") {
    throw new Error(`easy-button artifact cards had wrong kinds: ${JSON.stringify(state)}`);
  }
  for (const title of [
    "Phase 3 Report",
    "Artifact Table",
    "Paint Cost Per Frame",
    "Swirl Stylesheet",
  ]) {
    if (!titles.includes(title)) {
      throw new Error(`easy-button artifact cards had wrong titles: ${JSON.stringify(state)}`);
    }
  }
  const railText = state.artifacts.map((artifact) => artifact.text).join("\n");
  for (const expected of ["scripted easy run emitted", "Markdown", "Ready", "conic x3", "0.8ms"]) {
    if (!railText.includes(expected)) {
      throw new Error(
        `easy-button artifact card text missing ${expected}: ${JSON.stringify(state)}`,
      );
    }
  }
  assertBarChartArtifact(state);
  assertFileArtifact(state);
}

// `barWidthStyle` scales each bar against the largest value, so the max item is
// the only one at 100%. Nothing rendered these two kinds before, so nothing
// measured this.
function assertBarChartArtifact(state) {
  const chart = state.artifacts.find((artifact) => artifact.kind === "bar_chart");
  const widths = chart?.barWidths ?? [];
  // values 0.8 / 1.2 / 2.4 against a 2.4 max
  if (widths.join(",") !== "33%,50%,100%") {
    throw new Error(`easy-button bar chart widths were not proportional: ${JSON.stringify(chart)}`);
  }
}

function assertFileArtifact(state) {
  const file = state.artifacts.find((artifact) => artifact.kind === "file");
  const expectedPath = "desktop/src/renderer/src/features/easy-button/easy-button.css";
  if (file?.filePath !== expectedPath) {
    throw new Error(`easy-button file artifact did not render its path: ${JSON.stringify(file)}`);
  }
  if (!file.text.includes("The conic layers and their blur stack.")) {
    throw new Error(`easy-button file artifact dropped its description: ${JSON.stringify(file)}`);
  }
}

function assertArtifactCapOverflowVisual(state, requestText) {
  assertStateFields(
    state,
    {
      buttonAriaLabel: "Focus Easy Button request input",
      currentFocusText: requestText,
      easyState: "complete",
      focusLabelText: "Current focus",
      focusStatus: "current",
      inputDisabled: false,
      paneChromeTitle: "Easy Button · complete",
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
  assertHumanReadableTerminalSummary(state.summaryText, "failed", 20, "artifact cap terminal");
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
  assertCurrentFocusConstrained(state, label, state.currentFocus?.revision === 0);
  assertTextHasNoHorizontalOverflow(state.currentFocusMetrics, label, "current focus");
  assertRectContains(state.stageRect, state.rect, label, "pane host");
  assertRectContains(state.centerRect, state.captionRect, label, "caption");
  assertNoRectOverlap(state.buttonRect, state.captionRect, label, "control", "caption");
  assertNoRectOverlap(state.captionRect, state.inputRect, label, "caption", "input");
  if (state.stopButtonVisible) {
    assertNoRectOverlap(state.captionRect, state.stopButtonRect, label, "caption", "stop");
  }
  if (state.summaryText !== "") {
    assertTextHasNoHorizontalOverflow(state.summaryTextMetrics, label, "summary");
  }
}

function assertReducedMotionVisual(state, label) {
  if (state.reducedMotionMatches !== true) {
    throw new Error(`easy-button ${label} did not match reduced motion: ${JSON.stringify(state)}`);
  }
  assertReducedMotionSwirl(state, label);
  assertAnimationNamesCleared(
    {
      button: state.buttonAnimationName,
      control: state.controlAnimationName,
    },
    label,
  );
  assertTransitionDurationsCleared(
    {
      button: state.buttonTransitionDuration,
      input: state.inputTransitionDuration,
      inputWrap: state.inputWrapTransitionDuration,
      stopButton: state.stopButtonTransitionDuration,
      swirl: state.swirl.transitionDuration,
    },
    label,
  );
  for (const [index, artifact] of state.artifacts.entries()) {
    assertAnimationNamesCleared({ [`artifact ${index + 1}`]: artifact.animationName }, label);
    assertTransitionDurationsCleared(
      { [`artifact ${index + 1}`]: artifact.transitionDuration },
      label,
    );
  }
  for (const [index, highlight] of state.highlights.entries()) {
    assertAnimationNamesCleared(
      {
        [`highlight ${index + 1}`]: highlight.animationName,
        [`highlight dot ${index + 1}`]: highlight.dotAnimationName,
      },
      label,
    );
    assertTransitionDurationsCleared(
      { [`highlight ${index + 1}`]: highlight.transitionDuration },
      label,
    );
  }
}

// The swirl is now the only working-state indicator, so reduced motion cannot
// simply hide it the way it could hide a spinner: it stays visible and still, at
// half field, and every rotation is off.
function assertReducedMotionSwirl(state, label) {
  if (!state.swirl.exists) {
    throw new Error(`easy-button ${label} lost its swirl field: ${JSON.stringify(state)}`);
  }
  assertAnimationNamesCleared(
    {
      "swirl breathe": state.swirl.inner.animationName,
      ...Object.fromEntries(
        state.swirl.layers.map((layer, index) => [`swirl layer ${index + 1}`, layer.animationName]),
      ),
    },
    label,
  );
  if (state.easyState === "working" && !opacityMatches(state.swirl.opacity, 0.5)) {
    throw new Error(
      `easy-button ${label} reduced-motion swirl did not rest at half field: ${JSON.stringify(state)}`,
    );
  }
}

function assertAnimationNamesCleared(fields, label) {
  const animated = Object.entries(fields).filter(([, value]) => value && value !== "none");
  if (animated.length > 0) {
    throw new Error(
      `easy-button ${label} reduced motion left animations enabled: ${JSON.stringify(animated)}`,
    );
  }
}

function assertTransitionDurationsCleared(fields, label) {
  const transitioning = Object.entries(fields).filter(
    ([, value]) => value && !transitionDurationsAreZero(value),
  );
  if (transitioning.length > 0) {
    throw new Error(
      `easy-button ${label} reduced motion left transitions enabled: ${JSON.stringify(
        transitioning,
      )}`,
    );
  }
}

function transitionDurationsAreZero(value) {
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .every((part) => part === "0s" || part === "0ms");
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
      currentFocusText: requestText,
      easyState: "complete",
      focusLabelText: "Current focus",
      focusStatus: "current",
      inputDisabled: false,
      paneChromeTitle: "Easy Button · complete",
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
  assertHumanReadableTerminalSummary(state.summaryText, "completed", 0, "narrator terminal");
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
      currentFocusText: requestText,
      easyState: "working",
      focusLabelText: "Current focus",
      focusStatus: "current",
      inputDisabled: false,
      paneChromeTitle: "Easy Button · working",
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
      easyButtonStateSettled(state, "working") &&
      state.runRequestText === requestText &&
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
      easyButtonStateSettled(state, "complete") &&
      state.runRequestText === requestText &&
      state.summaryText.includes(summaryPrefix),
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonTerminalWithArtifacts(client, requestText, artifactCount) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, "complete") &&
      state.runRequestText === requestText &&
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
      easyButtonStateSettled(state, "complete") &&
      state.runRequestText === "easy run phase5 artifact cap workflow" &&
      state.summaryText.includes("Failed after") &&
      state.summaryText.includes("artifact limit reached") &&
      state.artifacts.length === 20,
    workflowTimeoutMs,
  );
}

// The swirl crossfades over 1600ms, so a state read the instant the pane enters
// a new view state reports an interpolated opacity that equals neither endpoint.
async function waitForEasyButtonSwirlSettled(client, easyState, expectedOpacity) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, easyState) &&
      state.swirl.exists &&
      opacityMatches(state.swirl.opacity, expectedOpacity),
    workflowTimeoutMs,
  );
}

// The pulse lives for confirmPulseDurationMs, and waitForState polls every
// 100ms, so this must run with nothing slow between it and the transition.
async function waitForEasyButtonConfirmPulse(client, requestText) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.easyState === "complete" &&
      state.runRequestText === requestText &&
      state.confirmActive === "true" &&
      state.controlAnimationName === "easy-button-confirm-pulse",
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonConfirmPulseCleared(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists && state.confirmActive === "false" && state.controlAnimationName === "none",
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonHighlightCascade(client, easyState, expectedOpacities) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, easyState) &&
      state.highlights.length === expectedOpacities.length &&
      state.highlights.every((highlight, index) =>
        opacityMatches(highlight.opacity, expectedOpacities[index]),
      ),
    workflowTimeoutMs,
  );
}

// The control transitions `border-color` over 320ms, so a single poll can catch
// an interpolated value that matches neither endpoint. Two consecutive equal
// samples mean the transition has landed.
async function waitForEasyButtonControlBorderSettled(client) {
  let previous = null;
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) => {
      const settled = previous !== null && state.buttonBorderColor === previous;
      previous = state.buttonBorderColor;
      return settled;
    },
    workflowTimeoutMs,
  );
}

// Expectations come from each rail's own content rather than a hardcoded pair,
// so this does not depend on whether a given scripted run also emits highlights.
async function waitForEasyButtonRailLabelsSettled(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) => state.exists && railLabelsMatchContent(state),
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonTerminalWithHighlights(client, requestText, highlightCount) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, "complete") &&
      state.runRequestText === requestText &&
      state.highlights.length === highlightCount,
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonWorkingWithHighlights(client, requestText, highlightCount) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, "working") &&
      state.runRequestText === requestText &&
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
