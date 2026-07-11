#!/usr/bin/env node
/* global console */

import { readdir, readFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { URL } from "node:url";

import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  dispatchKeyEvent,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  reloadPage,
  readJsonLinesOptional,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { createTwoWorkspaceFixture } from "./chat-workflow-harness.mjs";
import {
  clickEasyButtonStop,
  easyButtonStateExpression,
  easyButtonStateSettled,
  openEasyButtonFromShortcut,
  workflowTimeoutMs,
  workspaceIdExpression,
} from "./easy-button-pane-actions.mjs";
import { assertLosslessSteeringChatRecord } from "./easy-button-chat-record-assertions.mjs";
import {
  assertAcceptedSteeringFocusEvents,
  assertRevisedCurrentFocus,
  assertRevisionZeroCurrentFocus,
  assertStaleCurrentFocus,
  assertUpdatingCurrentFocus,
  waitForEasyButtonFocusStatus,
} from "./easy-button-focus-assertions.mjs";
import { startSpeechProviderFixture } from "./speech-provider-fixture.mjs";
import {
  closeTerminalPane,
  runSpeechCaptureFailureCases,
} from "./speech-capture-failure-cases.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "speech-capture";
const preservedDraft = "keep this typed draft";
const completedTranscript = "  easy run phase2 steering workflow  ";
const completedRequest = completedTranscript.trim();
const completedSteeringTranscript = "  steer easy run phase2  ";
const completedSteering = completedSteeringTranscript.trim();
const liveSteeringDelta = "steer easy run phase2 with the captured direction";
const steeredCurrentFocus =
  "Complete the Easy Button phase 2 workflow while following the accepted steering direction.";
const narratorFailureTranscript = "  easy run narrator failure workflow  ";
const narratorFailureRequest = narratorFailureTranscript.trim();
const partialOutcomeTranscript = "  Keep the accepted work running despite stale narration.  ";
const partialOutcomeSteering = partialOutcomeTranscript.trim();
const partialOutcomeMessage = "Instruction sent, but Current focus could not be updated.";
const rejectedTranscript = "  speech submission must remain editable  ";
const browserFixturePath = new URL("./speech-capture-browser-fixture.js", import.meta.url);

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/speech-capture-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createTwoWorkspaceFixture(workflowName);
const provider = await startSpeechProviderFixture();
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    electronArgs: ["--use-fake-device-for-media-stream"],
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: provider.baseURL,
      OPENAI_API_KEY: provider.apiKey,
    },
    fixture,
    visible: options.visible,
  });
  await installBrowserFixture(context.client);
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const workspaceId = await waitForState(
    context.client,
    workspaceIdExpression(),
    (selectedWorkspaceId) => selectedWorkspaceId === fixture.firstWorkspace.id,
    workflowTimeoutMs,
  );
  await closeTerminalPane(context.client);
  await openEasyButtonFromShortcut(context.client);

  const configured = await waitForCaptureState(
    context.client,
    (state) =>
      state.capture === "off" &&
      state.speech === "configured" &&
      state.buttonAriaLabel === "Start voice request",
  );
  assertRestingCapture(configured);
  await exerciseConfiguredSpeechOutputControl(context.client, artifactDir);

  await setFooterDraft(context.client, preservedDraft);
  await clickEnabledButtonByAria(context.client, "Start voice request");
  const requesting = await waitForCaptureState(
    context.client,
    (state) => state.capture === "requesting-permission",
  );
  assertDraftPreserved(requesting, preservedDraft);
  assertNoListeningRings(requesting);

  await callBrowserFixture(context.client, "allowMicrophone");
  const connecting = await waitForCaptureState(
    context.client,
    (state) => state.capture === "connecting" && state.fixture.dataChannelLabel === "oai-events",
  );
  assertDraftPreserved(connecting, preservedDraft);
  assertProviderBoundary(connecting.fixture);
  assertNoListeningRings(connecting);

  await callBrowserFixture(context.client, "openProviderSession");
  const listening = await waitForCaptureState(
    context.client,
    (state) => state.capture === "listening",
  );
  assertListeningCapture(listening, false);
  await captureScreenshot(context.client, join(artifactDir, "speech-capture-listening.png"));

  await clickEnabledButtonByAria(context.client, "Finish voice request");
  const committing = await waitForCaptureState(
    context.client,
    (state) => state.capture === "committing" && state.fixture.commitCount === 1,
  );
  assertDraftPreserved(committing, preservedDraft);
  await callBrowserFixture(context.client, "emitDelta", "partial provider words");
  const withDelta = await waitForCaptureState(
    context.client,
    (state) => state.captureLine === "partial provider words",
  );
  assertDraftPreserved(withDelta, preservedDraft);
  const beforeCompletion = await context.client.evaluate(
    `window.setta.easyRun.snapshot(${JSON.stringify(workspaceId)})`,
  );
  if (beforeCompletion.latestRun !== null) {
    throw new Error("partial speech unexpectedly created an Easy Run");
  }

  await callBrowserFixture(context.client, "emitCompleted", completedTranscript);
  const completed = await waitForCaptureState(
    context.client,
    (state) =>
      state.capture === "off" && state.inputValue === "" && state.fixture.activeTrackCount === 0,
  );
  assertCaptureTeardown(completed);
  const speechStartedRun = await waitForEasyButtonWorking(context.client, completedRequest);
  assertRevisionZeroCurrentFocus(speechStartedRun, completedRequest);

  await context.client.driver("easyButtonPaneResetEventLog");
  const workingListeningCapture = await beginSpeechCapture(context.client, {
    draft: preservedDraft,
    runWorking: true,
    startLabel: "Start voice steering",
  });
  const workingListeningPane = await waitForWorkingCapturePane(
    context.client,
    completedRequest,
    "Finish voice steering",
    "listening",
  );
  assertWorkingListeningPresentation(workingListeningPane, workingListeningCapture, {
    draft: preservedDraft,
    focusStatus: "current",
    focusText: completedRequest,
    transcript: "",
  });
  await captureScreenshot(
    context.client,
    join(artifactDir, "speech-capture-working-listening.png"),
  );
  await clickEnabledButtonByAria(context.client, "Finish voice steering");
  await waitForCaptureState(
    context.client,
    (state) => state.capture === "committing" && state.fixture.commitCount === 1,
  );
  await callBrowserFixture(context.client, "emitDelta", liveSteeringDelta);
  const committingSteeringCapture = await waitForCaptureState(
    context.client,
    (state) => state.capture === "committing" && state.captureLine === liveSteeringDelta,
  );
  const committingSteeringPane = await waitForWorkingCapturePane(
    context.client,
    completedRequest,
    "Committing voice transcript",
    "committing",
  );
  assertWorkingListeningPresentation(committingSteeringPane, committingSteeringCapture, {
    draft: preservedDraft,
    focusStatus: "current",
    focusText: completedRequest,
    transcript: liveSteeringDelta,
  });
  const completedAutoSynthesisCount = provider.synthesisInputs.length;
  await callBrowserFixture(context.client, "emitCompleted", completedSteeringTranscript);
  const submittedSteeringCapture = await waitForCaptureState(
    context.client,
    (state) => state.capture === "off" && state.captureLine === "",
  );
  assertCaptureTeardown(submittedSteeringCapture);
  const updatingFocus = await waitForEasyButtonFocusStatus(
    context.client,
    completedRequest,
    "updating",
  );
  assertUpdatingCurrentFocus(updatingFocus, completedRequest, completedSteering);
  const steeredTerminal = await waitForEasyButtonTerminal(context.client, completedRequest);
  assertRevisedCurrentFocus(steeredTerminal, steeredCurrentFocus);
  const steeringEvents = await context.client.driver("easyButtonPaneEventLog");
  assertAcceptedSteeringFocusEvents(steeringEvents, completedRequest, steeredCurrentFocus);
  const steeredChatRecord = await context.client.driver("easyButtonPaneChatRecord");
  assertLosslessSteeringChatRecord(steeredChatRecord, completedRequest, completedSteering);
  await exerciseAutomaticTerminalSummary(context.client, provider, {
    artifactDir,
    label: "completed",
    state: steeredTerminal,
    synthesisCount: completedAutoSynthesisCount,
  });
  await exerciseMountedAutomaticSummaryReplayReuse(context.client, provider, {
    label: "completed",
    state: steeredTerminal,
  });
  const completedReplayState = await selectSpeechOutputMode(context.client, "off");
  const completedReplay = await exerciseTerminalSummaryReplay(context.client, provider, {
    artifactDir,
    label: "completed",
    state: completedReplayState,
  });

  await completeSpeechCapture(context.client, {
    draft: preservedDraft,
    finishLabel: "Finish voice request",
    runWorking: false,
    startLabel: "Start voice request",
    transcript: narratorFailureTranscript,
  });
  const staleFocus = await waitForEasyButtonFocusStatus(
    context.client,
    narratorFailureRequest,
    "stale",
  );
  assertStaleCurrentFocus(staleFocus, narratorFailureRequest);
  await assertUnmountedSummaryAudioReleased(context.client, completedReplay.expectedRevokedCount);
  await completeSpeechCapture(context.client, {
    draft: preservedDraft,
    finishLabel: "Finish voice steering",
    runWorking: true,
    startLabel: "Start voice steering",
    transcript: partialOutcomeTranscript,
  });
  const partialOutcome = await waitForSpeechPartialOutcome(context.client);
  assertStaleCurrentFocus(partialOutcome, narratorFailureRequest);
  const partialOutcomeChatRecord = await context.client.driver("easyButtonPaneChatRecord");
  assertLosslessSteeringChatRecord(
    partialOutcomeChatRecord,
    narratorFailureRequest,
    partialOutcomeSteering,
  );
  const stoppedListeningCapture = await beginSpeechCapture(context.client, {
    draft: preservedDraft,
    runWorking: true,
    startLabel: "Start voice steering",
  });
  const stoppedListeningPane = await waitForWorkingCapturePane(
    context.client,
    narratorFailureRequest,
    "Finish voice steering",
    "listening",
  );
  assertWorkingListeningPresentation(stoppedListeningPane, stoppedListeningCapture, {
    draft: preservedDraft,
    focusStatus: "stale",
    focusText: narratorFailureRequest,
    transcript: "",
  });
  await selectSpeechOutputMode(context.client, "final");
  const stoppedAutoSynthesisCount = provider.synthesisInputs.length;
  await clickEasyButtonStop(context.client);
  const stoppedRun = await waitForEasyButtonTerminal(context.client, narratorFailureRequest);
  const stoppedCapture = await waitForCaptureState(
    context.client,
    (state) =>
      state.capture === "off" && state.captureLine === "" && state.fixture.activeTrackCount === 0,
  );
  assertCaptureTeardown(stoppedCapture);
  assertDraftPreserved(stoppedCapture, preservedDraft);
  assertStoppedWhileListening(stoppedRun);
  await assertNoAutomaticTerminalSummary(
    context.client,
    provider,
    stoppedRun,
    stoppedAutoSynthesisCount,
  );
  const stoppedReplayState = await selectSpeechOutputMode(context.client, "off");
  await exerciseTerminalSummaryReplay(context.client, provider, {
    artifactDir,
    label: "stopped",
    state: stoppedReplayState,
  });
  const stoppedChatRecord = await context.client.driver("easyButtonPaneChatRecord");
  assertLosslessSteeringChatRecord(
    stoppedChatRecord,
    narratorFailureRequest,
    partialOutcomeSteering,
  );

  await setFooterDraft(context.client, preservedDraft);
  await callBrowserFixture(context.client, "holdMicrophone");
  await clickEnabledButtonByAria(context.client, "Start voice request");
  await waitForCaptureState(context.client, (state) => state.capture === "requesting-permission");
  await dispatchKeyEvent(context.client, { code: "Escape", key: "Escape" });
  await dispatchKeyEvent(context.client, { code: "Escape", key: "Escape", type: "keyUp" });
  const canceled = await waitForCaptureState(
    context.client,
    (state) => state.capture === "off" && state.inputValue === preservedDraft,
  );
  assertDraftPreserved(canceled, preservedDraft);
  await callBrowserFixture(context.client, "allowMicrophone");
  await waitForCaptureState(context.client, (state) => state.fixture.activeTrackCount === 0);

  await clickEnabledButtonByAria(context.client, "Start voice request");
  await waitForCaptureState(
    context.client,
    (state) => state.capture === "connecting" && state.fixture.dataChannelLabel === "oai-events",
  );
  await callBrowserFixture(context.client, "openProviderSession");
  await waitForCaptureState(context.client, (state) => state.capture === "listening");
  await callBrowserFixture(context.client, "disconnect");
  const disconnected = await waitForCaptureState(
    context.client,
    (state) => state.capture === "failed",
  );
  assertCaptureFailure(disconnected, preservedDraft);
  await captureScreenshot(context.client, join(artifactDir, "speech-capture-disconnected.png"));

  const stoppedRunId = await latestEasyRunId(context.client, workspaceId);
  await runSpeechCaptureFailureCases({
    client: context.client,
    firstWorkspaceId: workspaceId,
    narratorFailureRequest,
    preservedDraft,
    rejectedTranscript,
    secondWorkspace: fixture.secondWorkspace,
    stoppedRunId,
  });

  await exerciseAutomaticHighlightSpeech(context.client, provider, artifactDir);

  const failedRequest = "easy run phase5 artifact cap workflow";
  await selectSpeechOutputMode(context.client, "final");
  const failedAutoSynthesisCount = provider.synthesisInputs.length;
  const failedStarted = await context.client.driver("easyButtonPaneSubmitRequest", failedRequest);
  if (!failedStarted) {
    throw new Error("failed Easy Run replay fixture did not submit");
  }
  const failedTerminal = await waitForState(
    context.client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, "complete") &&
      state.runRequestText === failedRequest &&
      state.statusTone === "failed" &&
      state.summaryText.includes("Failed after") &&
      state.summaryText.includes("20 artifacts"),
    workflowTimeoutMs,
  );
  await exerciseAutomaticTerminalSummary(context.client, provider, {
    artifactDir,
    label: "failed",
    state: failedTerminal,
    synthesisCount: failedAutoSynthesisCount,
  });
  await assertRestoredTerminalSummarySilent(context.client, provider, failedTerminal);
  const failedReplayState = await selectSpeechOutputMode(context.client, "off");
  await exerciseRecordingPreemptsSummaryPlayback(context.client, provider, failedReplayState);
  await exerciseRecordingPreemptsSummarySynthesis(context.client, provider, failedReplayState);
  await exerciseTerminalSynthesisFailure(context.client, provider, {
    artifactDir,
    state: failedReplayState,
  });

  provider.assertHealthy();
  assertProviderOperationCount(provider, { synthesis: 9, transcription: 12 });
  await stopElectronCdpContext(context);
  context = null;
  await assertNoRendererConsoleErrors(artifactDir);
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    captureStates: ["requesting-permission", "connecting", "listening", "committing", "failed"],
    coveredFailures: [
      "microphone-permission-denied",
      "no-speech",
      "provider-transcription-failed",
      "submission-rejected",
    ],
    coveredTeardown: ["escape", "disconnect", "pane-close", "workspace-switch", "reload", "stop"],
    automaticallySpokenTerminalStatuses: ["completed", "failed"],
    automaticallySpokenHighlightCount: 2,
    automaticSpeechExcludedStatuses: ["stopped"],
    hydratedTerminalAutoPlaySuppressed: true,
    mountedAutomaticSummaryReplayReusedBlob: true,
    recordingPreemptedSummaryPlayback: true,
    recordingPreemptedSummarySynthesis: true,
    replayedTerminalStatuses: ["completed", "stopped", "failed"],
    terminalSynthesisFailurePreservedRun: true,
    providerOperationCount: provider.requests.length,
    status: "passed",
  });
  await assertNoSensitiveSpeechArtifacts(artifactDir, provider);
  console.log(`Electron speech capture workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
} finally {
  await stopElectronCdpContext(context);
  await provider.close();
  await rm(fixture.tempRoot, { force: true, recursive: true });
}

async function installBrowserFixture(client) {
  const source = await readFile(browserFixturePath, "utf8");
  await client.call("Page.addScriptToEvaluateOnNewDocument", { source });
}

async function completeSpeechCapture(
  client,
  { draft, finishLabel, runWorking, startLabel, transcript },
) {
  await beginSpeechCapture(client, { draft, runWorking, startLabel });
  await commitSpeechCapture(client, { finishLabel, transcript });
}

async function exerciseConfiguredSpeechOutputControl(client, recordingRoot) {
  const initial = await waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.speechOutputStatus === "configured" &&
      state.speechOutputMode === "off" &&
      state.speechOutputPlayback === "idle" &&
      state.audioControlAriaLabel === "Voice output: Off",
    workflowTimeoutMs,
  );
  if (!initial.audioControlVisible || initial.voiceOffChipText !== "") {
    throw new Error(
      `configured voice output mounted the wrong control: ${JSON.stringify(initial)}`,
    );
  }

  await client.driver("easyButtonPaneClickOutputControl");
  const menu = await waitForState(
    client,
    easyButtonStateExpression(),
    (state) => state.audioMenuOpen && state.audioMenuOptions.length === 3,
    workflowTimeoutMs,
  );
  const expectedOptions = [
    ["off", "Off"],
    ["final", "Speak the summary"],
    ["highlights_and_final", "Speak highlights and summary"],
  ];
  if (
    menu.audioDisclosureText !== "This voice is AI-generated and not a human voice." ||
    !expectedOptions.every(
      ([mode, label], index) =>
        menu.audioMenuOptions[index]?.mode === mode &&
        menu.audioMenuOptions[index]?.label === label &&
        menu.audioMenuOptions[index]?.active === (mode === "off"),
    )
  ) {
    throw new Error(`configured voice output menu was incorrect: ${JSON.stringify(menu)}`);
  }
  await captureScreenshot(client, join(recordingRoot, "speech-output-menu.png"));

  await client.driver("easyButtonPaneSelectOutputMode", "final");
  const selected = await waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.speechOutputMode === "final" &&
      state.audioControlAriaLabel === "Voice output: Speak the summary" &&
      !state.audioMenuOpen,
    workflowTimeoutMs,
  );
  if (selected.speechOutputPlayback !== "idle") {
    throw new Error(`selecting final voice mode changed playback: ${JSON.stringify(selected)}`);
  }
}

async function exerciseAutomaticHighlightSpeech(client, provider, artifactDir) {
  const requestText = "easy run working narrator cadence";
  await selectSpeechOutputMode(client, "highlights_and_final");
  const synthesisCount = provider.synthesisInputs.length;
  const started = await client.driver("easyButtonPaneSubmitRequest", requestText);
  if (!started) {
    throw new Error("automatic highlight speech fixture did not submit");
  }
  const firstSpeaking = await waitForState(
    client,
    easyButtonStateExpression(),
    (state) => firstAutomaticHighlightIsSpeaking(state, requestText),
    workflowTimeoutMs,
  );
  const snapshot = await client.evaluate(
    `window.setta.easyRun.snapshot(${JSON.stringify(firstSpeaking.workspaceId)})`,
  );
  const [firstHighlight, secondHighlight] = snapshot.highlights;
  assertFirstAutomaticHighlight({
    firstHighlight,
    firstSpeaking,
    provider,
    snapshot,
    synthesisCount,
  });
  await captureScreenshot(client, join(artifactDir, "speech-highlight-automatic.png"));
  await callBrowserFixture(client, "finishAudio");
  const secondSpeaking = await waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      secondAutomaticHighlightIsSpeaking(
        state,
        snapshot.latestRun.id,
        provider.synthesisInputs.length,
        synthesisCount + 2,
      ),
    workflowTimeoutMs,
  );
  assertSecondAutomaticHighlight({
    firstHighlight,
    provider,
    secondHighlight,
    secondSpeaking,
  });
  assertHighlightRailDidNotReflow(firstSpeaking, secondSpeaking);
  await callBrowserFixture(client, "finishAudio");
  await waitForState(
    client,
    easyButtonStateExpression(),
    (state) => state.latestRunId === snapshot.latestRun.id && state.speechOutputPlayback === "idle",
    workflowTimeoutMs,
  );
  await clickEasyButtonStop(client);
  await waitForEasyButtonTerminal(client, requestText);
}

function assertFirstAutomaticHighlight({
  firstHighlight,
  firstSpeaking,
  provider,
  snapshot,
  synthesisCount,
}) {
  assertFirstAutomaticHighlightSource({
    firstHighlight,
    firstSpeaking,
    provider,
    snapshot,
    synthesisCount,
  });
  if (
    !highlightSourceIsMarked(firstSpeaking, firstHighlight.id) ||
    firstSpeaking.highlights[0]?.color !== firstSpeaking.highlights.at(-1)?.color ||
    firstSpeaking.highlights.some(
      (highlight) =>
        highlight.id !== firstHighlight.id &&
        !highlightSourceIsUnmarked(firstSpeaking, highlight.id),
    )
  ) {
    throw new Error(
      `first live narrator highlight marked the wrong row: ${JSON.stringify(firstSpeaking)}`,
    );
  }
}

function assertFirstAutomaticHighlightSource({
  firstHighlight,
  firstSpeaking,
  provider,
  snapshot,
  synthesisCount,
}) {
  if (
    snapshot.latestRun?.id !== firstSpeaking.latestRunId ||
    snapshot.latestRun.status !== "working" ||
    !firstHighlight ||
    provider.synthesisInputs.length !== synthesisCount + 1 ||
    provider.synthesisInputs.at(-1) !== firstHighlight.text
  ) {
    throw new Error(
      `first live narrator highlight used the wrong speech source: ${JSON.stringify({ firstSpeaking, snapshot })}`,
    );
  }
}

function assertSecondAutomaticHighlight({
  firstHighlight,
  provider,
  secondHighlight,
  secondSpeaking,
}) {
  if (
    !secondHighlight ||
    provider.synthesisInputs.at(-1) !== secondHighlight.text ||
    !highlightSourceIsMarked(secondSpeaking, secondHighlight.id) ||
    !highlightSourceIsUnmarked(secondSpeaking, firstHighlight.id) ||
    secondSpeaking.highlights[0]?.color === secondSpeaking.highlights[1]?.color
  ) {
    throw new Error(
      `second live narrator highlight used the wrong speech source: ${JSON.stringify(secondSpeaking)}`,
    );
  }
}

function firstAutomaticHighlightIsSpeaking(state, requestText) {
  return (
    automaticHighlightRunIsSpeaking(state, requestText) && firstHighlightIsLifted(state.highlights)
  );
}

function automaticHighlightRunIsSpeaking(state, requestText) {
  return (
    state.runRequestText === requestText &&
    state.easyState === "working" &&
    state.highlights.length === 2 &&
    state.speechOutputMode === "highlights_and_final" &&
    state.speechOutputPlayback === "speaking" &&
    state.summaryPlayback === ""
  );
}

function firstHighlightIsLifted(highlights) {
  const first = highlights[0];
  return (
    first?.speaking === true && first.opacity === "1" && first.color === highlights.at(-1)?.color
  );
}

function secondAutomaticHighlightIsSpeaking(state, runId, synthesisCount, expectedCount) {
  const [first, second] = state.highlights;
  return (
    highlightPlaybackMatchesRun(state, runId) &&
    firstHighlightHasRested(first, second) &&
    second?.speaking === true &&
    synthesisCount === expectedCount
  );
}

function highlightPlaybackMatchesRun(state, runId) {
  return (
    state.latestRunId === runId &&
    state.speechOutputPlayback === "speaking" &&
    state.summaryPlayback === ""
  );
}

function firstHighlightHasRested(first, second) {
  return first?.speaking === false && first.opacity === "0.72" && first.color !== second?.color;
}

function highlightSourceIsMarked(state, highlightId) {
  const highlight = state.highlights.find((item) => item.id === highlightId);
  return (
    highlight?.speaking === true &&
    highlight.opacity === "1" &&
    highlight.dotBackgroundColor === "rgba(0, 0, 0, 0)" &&
    highlight.dotBars.length === 3 &&
    highlight.dotBars.every(
      (bar) => bar.display === "block" && bar.animationName === "easy-button-audio-equalizer",
    )
  );
}

function highlightSourceIsUnmarked(state, highlightId) {
  const highlight = state.highlights.find((item) => item.id === highlightId);
  return (
    highlight?.speaking === false &&
    highlight.dotBars.length === 3 &&
    highlight.dotBars.every((bar) => bar.display === "none")
  );
}

function assertHighlightRailDidNotReflow(firstSpeaking, secondSpeaking) {
  const firstGeometry = firstSpeaking.highlights.map(({ dotRect, id, rect }) => ({
    dotRect,
    id,
    rect,
  }));
  const secondGeometry = secondSpeaking.highlights.map(({ dotRect, id, rect }) => ({
    dotRect,
    id,
    rect,
  }));
  if (JSON.stringify(firstGeometry) !== JSON.stringify(secondGeometry)) {
    throw new Error(
      `moving the spoken-source indicator reflowed the highlight rail: ${JSON.stringify({ firstGeometry, secondGeometry })}`,
    );
  }
}

async function selectSpeechOutputMode(client, mode) {
  await client.driver("easyButtonPaneClickOutputControl");
  await client.driver("easyButtonPaneSelectOutputMode", mode);
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.speechOutputMode === mode &&
      !state.audioMenuOpen &&
      state.speechOutputPlayback === "idle",
    workflowTimeoutMs,
  );
}

async function exerciseAutomaticTerminalSummary(
  client,
  provider,
  { artifactDir, label, state, synthesisCount },
) {
  const snapshot = await readPersistedSummary(client, state, label);
  const speaking = await waitForSummarySpeaking(client, snapshot.latestRun.id);
  assertPersistedSummarySpoken(speaking, provider, snapshot, synthesisCount, label);
  if (speaking.speechOutputMode === "off") {
    throw new Error(`${label} summary auto-played while output was off`);
  }
  await captureScreenshot(client, join(artifactDir, `speech-summary-${label}-automatic.png`));
  await callBrowserFixture(client, "finishAudio");
  await waitForSummaryPlaybackIdle(client);
}

async function exerciseMountedAutomaticSummaryReplayReuse(client, provider, { label, state }) {
  const snapshot = await readPersistedSummary(client, state, label);
  const synthesisCount = provider.synthesisInputs.length;
  const audioBefore = (await callBrowserFixture(client, "state")).audio;
  await client.driver("easyButtonPaneClickSummaryReplay");
  const speaking = await waitForSummarySpeaking(client, snapshot.latestRun.id);
  const audioDuringReplay = (await callBrowserFixture(client, "state")).audio;
  if (
    provider.synthesisInputs.length !== synthesisCount ||
    provider.synthesisInputs.at(-1) !== snapshot.latestRun.summary ||
    audioDuringReplay.createdObjectURLCount !== audioBefore.createdObjectURLCount ||
    audioDuringReplay.count !== audioBefore.count + 1 ||
    audioDuringReplay.playCount !== audioBefore.playCount + 1 ||
    speaking.summaryColor !== speaking.toneColors.foreground
  ) {
    throw new Error(
      `${label} mounted automatic summary replay did not reuse its Blob: ${JSON.stringify({ audioBefore, audioDuringReplay, speaking })}`,
    );
  }
  await callBrowserFixture(client, "finishAudio");
  await waitForSummaryPlaybackIdle(client);
}

async function assertRestoredTerminalSummarySilent(client, provider, state) {
  const snapshot = await readPersistedSummary(client, state, "restored failed");
  const synthesisCount = provider.synthesisInputs.length;
  await reloadPage(client);
  await waitForSelector(client, '[data-testid="workspace-layout-area"]');
  await client.installDriver();
  await waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => workspaceId === state.workspaceId,
    workflowTimeoutMs,
  );
  const restored = await waitForState(
    client,
    easyButtonStateExpression(),
    (next) =>
      easyButtonStateSettled(next, "complete") &&
      next.latestRunId === snapshot.latestRun.id &&
      next.summaryText === snapshot.latestRun.summary &&
      next.speechOutputMode === "final" &&
      next.summaryPlayback === "idle" &&
      next.speechOutputPlayback === "idle",
    workflowTimeoutMs,
  );
  await client.evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  const fixture = await callBrowserFixture(client, "state");
  if (
    provider.synthesisInputs.length !== synthesisCount ||
    fixture.audio.activeCount !== 0 ||
    fixture.audio.count !== 0
  ) {
    throw new Error(
      `hydrated terminal summary auto-played unexpectedly: ${JSON.stringify({ fixture, restored })}`,
    );
  }
}

async function assertNoAutomaticTerminalSummary(client, provider, state, synthesisCount) {
  await client.evaluate("new Promise((resolve) => setTimeout(resolve, 250))");
  const settled = await waitForState(
    client,
    easyButtonStateExpression(),
    (next) =>
      next.latestRunId === state.latestRunId &&
      next.statusTone === "stopped" &&
      next.speechOutputMode === "final" &&
      next.summaryPlayback === "idle" &&
      next.speechOutputPlayback === "idle",
    workflowTimeoutMs,
  );
  const fixture = await callBrowserFixture(client, "state");
  if (provider.synthesisInputs.length !== synthesisCount || fixture.audio.activeCount !== 0) {
    throw new Error(`stopped summary auto-played unexpectedly: ${JSON.stringify(settled)}`);
  }
}

async function exerciseTerminalSummaryReplay(client, provider, { artifactDir, label, state }) {
  assertSummaryReplayAvailable(state, label);
  const snapshot = await readPersistedSummary(client, state, label);
  const audioBefore = (await callBrowserFixture(client, "state")).audio;
  const synthesisCount = provider.synthesisInputs.length;
  await client.driver("easyButtonPaneClickSummaryReplay");
  const speaking = await waitForSummarySpeaking(client, snapshot.latestRun.id);
  assertPersistedSummarySpoken(speaking, provider, snapshot, synthesisCount, label);
  await captureScreenshot(client, join(artifactDir, `speech-summary-${label}-speaking.png`));
  await callBrowserFixture(client, "finishAudio");
  await waitForSummaryPlaybackIdle(client);
  const audioAfter = (await callBrowserFixture(client, "state")).audio;
  if (audioAfter.createdObjectURLCount !== audioBefore.createdObjectURLCount + 1) {
    throw new Error(`summary replay created unexpected Blob URLs: ${JSON.stringify(audioAfter)}`);
  }
  return { expectedRevokedCount: audioBefore.revokedObjectURLCount + 1 };
}

async function exerciseRecordingPreemptsSummaryPlayback(client, provider, state) {
  const snapshot = await readPersistedSummary(client, state, "failed playback preemption");
  const synthesisCount = provider.synthesisInputs.length;
  const audioBefore = (await callBrowserFixture(client, "state")).audio;
  await client.driver("easyButtonPaneClickSummaryReplay");
  const speaking = await waitForSummarySpeaking(client, snapshot.latestRun.id);
  assertPersistedSummarySpoken(speaking, provider, snapshot, synthesisCount, "failed");
  const audioSpeaking = (await callBrowserFixture(client, "state")).audio;

  await beginHeldPermissionCapture(client);
  const preempted = await waitForState(
    client,
    easyButtonStateExpression(),
    (next) =>
      next.summaryPlayback === "idle" &&
      next.speechOutputPlayback === "idle" &&
      next.audioControlAriaLabel === "Voice output: Off",
    workflowTimeoutMs,
  );
  const audioAfter = (await callBrowserFixture(client, "state")).audio;
  if (
    audioAfter.activeCount !== 0 ||
    audioAfter.pauseCount !== audioSpeaking.pauseCount + 1 ||
    audioAfter.revokedObjectURLCount !== audioSpeaking.revokedObjectURLCount + 1 ||
    audioAfter.createdObjectURLCount !== audioBefore.createdObjectURLCount + 1
  ) {
    throw new Error(
      `recording did not preempt summary playback: ${JSON.stringify({ audioAfter, audioBefore, audioSpeaking, preempted })}`,
    );
  }
  await assertSnapshotUnchanged(client, state.workspaceId, snapshot, "playback preemption");
  await cancelHeldPermissionCapture(client);
}

async function exerciseRecordingPreemptsSummarySynthesis(client, provider, state) {
  const snapshot = await readPersistedSummary(client, state, "failed synthesis preemption");
  const audioBefore = (await callBrowserFixture(client, "state")).audio;
  const heldSynthesisReady = provider.holdNextSynthesis();
  await client.driver("easyButtonPaneClickSummaryReplay");
  await heldSynthesisReady;
  await waitForState(
    client,
    easyButtonStateExpression(),
    (next) =>
      next.summaryPlayback === "synthesizing" &&
      next.speechOutputPlayback === "synthesizing" &&
      next.audioControlAriaLabel === "Stop preparing voice",
    workflowTimeoutMs,
  );

  await beginHeldPermissionCapture(client);
  await waitForState(
    client,
    easyButtonStateExpression(),
    (next) => next.summaryPlayback === "idle" && next.speechOutputPlayback === "idle",
    workflowTimeoutMs,
  );
  await waitForProviderSynthesisCancellation(provider);
  if (provider.releaseHeldSynthesis()) {
    throw new Error("recording preemption left the OpenAI synthesis request active");
  }
  const audioAfter = (await callBrowserFixture(client, "state")).audio;
  if (
    audioAfter.activeCount !== 0 ||
    audioAfter.count !== audioBefore.count ||
    audioAfter.createdObjectURLCount !== audioBefore.createdObjectURLCount
  ) {
    throw new Error(
      `stale synthesis created playback after recording began: ${JSON.stringify({ audioAfter, audioBefore })}`,
    );
  }
  await assertSnapshotUnchanged(client, state.workspaceId, snapshot, "synthesis preemption");
  await cancelHeldPermissionCapture(client);
}

async function exerciseTerminalSynthesisFailure(client, provider, { artifactDir, state }) {
  const snapshot = await readPersistedSummary(client, state, "failed synthesis isolation");
  const paneBefore = await client.driver("easyButtonPaneState");
  const audioBefore = (await callBrowserFixture(client, "state")).audio;
  provider.failNextSynthesis();
  await client.driver("easyButtonPaneClickSummaryReplay");
  const failed = await waitForState(
    client,
    easyButtonStateExpression(),
    (next) =>
      next.summaryPlayback === "failed" &&
      next.speechOutputPlayback === "failed" &&
      next.audioControlAriaLabel === "Voice playback failed: OpenAI speech is unavailable.",
    workflowTimeoutMs,
  );
  const audioAfter = (await callBrowserFixture(client, "state")).audio;
  if (
    failed.latestRunId !== snapshot.latestRun.id ||
    failed.summaryText !== snapshot.latestRun.summary ||
    failed.statusTone !== paneBefore.statusTone ||
    failed.narratorStatusText !== paneBefore.narratorStatusText ||
    audioAfter.count !== audioBefore.count ||
    audioAfter.createdObjectURLCount !== audioBefore.createdObjectURLCount
  ) {
    throw new Error(
      `TTS failure changed the Easy Run presentation: ${JSON.stringify({ audioAfter, audioBefore, failed, paneBefore })}`,
    );
  }
  await assertSnapshotUnchanged(client, state.workspaceId, snapshot, "TTS failure");
  await captureScreenshot(client, join(artifactDir, "speech-summary-synthesis-failed.png"));
}

async function beginHeldPermissionCapture(client) {
  await setFooterDraft(client, preservedDraft);
  await callBrowserFixture(client, "holdMicrophone");
  await clickEnabledButtonByAria(client, "Start voice request");
  await waitForCaptureState(
    client,
    (state) => state.capture === "requesting-permission" && state.audio.activeCount === 0,
  );
}

async function cancelHeldPermissionCapture(client) {
  await dispatchKeyEvent(client, { code: "Escape", key: "Escape" });
  await dispatchKeyEvent(client, { code: "Escape", key: "Escape", type: "keyUp" });
  await waitForCaptureState(
    client,
    (state) => state.capture === "off" && state.inputValue === preservedDraft,
  );
  await callBrowserFixture(client, "allowMicrophone");
  await waitForCaptureState(client, (state) => state.fixture.activeTrackCount === 0);
}

async function assertSnapshotUnchanged(client, workspaceId, expected, boundary) {
  const actual = await client.evaluate(
    `window.setta.easyRun.snapshot(${JSON.stringify(workspaceId)})`,
  );
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${boundary} changed persisted Easy Run state`);
  }
}

async function waitForProviderSynthesisCancellation(provider) {
  let timeout;
  try {
    await Promise.race([
      provider.waitForHeldSynthesisCancellation(),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("recording did not cancel the OpenAI synthesis request")),
          workflowTimeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function assertUnmountedSummaryAudioReleased(client, expectedRevokedCount) {
  if (expectedRevokedCount < 1) {
    throw new Error("summary replay did not create a mounted audio Blob");
  }
  await waitForCaptureState(
    client,
    (state) =>
      state.audio.activeCount === 0 && state.audio.revokedObjectURLCount >= expectedRevokedCount,
  );
}

function assertSummaryReplayAvailable(state, label) {
  if (
    !state.summaryReplayVisible ||
    state.summaryReplayDisabled ||
    state.summaryReplayAriaLabel !== "Replay the spoken summary" ||
    state.summaryPlayback !== "idle" ||
    state.speechOutputMode !== "off" ||
    state.summarySourceId !== state.latestRunId
  ) {
    throw new Error(`${label} summary replay was unavailable: ${JSON.stringify(state)}`);
  }
}

async function readPersistedSummary(client, state, label) {
  const snapshot = await client.evaluate(
    `window.setta.easyRun.snapshot(${JSON.stringify(state.workspaceId)})`,
  );
  if (
    snapshot.latestRun?.id !== state.summarySourceId ||
    snapshot.latestRun.summary !== state.summaryText
  ) {
    throw new Error(`${label} replay did not point at the persisted summary`);
  }
  return snapshot;
}

function waitForSummarySpeaking(client, easyRunId) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (next) =>
      next.summaryPlayback === "speaking" &&
      next.summarySourceId === easyRunId &&
      next.summaryEqualizerDisplay === "inline-flex" &&
      next.summaryReplayDisabled &&
      next.audioControlAriaLabel === "Stop speaking",
    workflowTimeoutMs,
  );
}

function assertPersistedSummarySpoken(speaking, provider, snapshot, synthesisCount, label) {
  if (
    speaking.summaryColor !== speaking.toneColors.foreground ||
    provider.synthesisInputs.length !== synthesisCount + 1 ||
    provider.synthesisInputs.at(-1) !== snapshot.latestRun.summary
  ) {
    throw new Error(`${label} summary replay used the wrong source: ${JSON.stringify(speaking)}`);
  }
}

function waitForSummaryPlaybackIdle(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (next) =>
      next.summaryPlayback === "idle" &&
      next.speechOutputPlayback === "idle" &&
      next.summaryReplayDisabled === false,
    workflowTimeoutMs,
  );
}

async function beginSpeechCapture(client, { draft, runWorking, startLabel }) {
  await setFooterDraft(client, draft);
  await clickEnabledButtonByAria(client, startLabel);
  await waitForCaptureState(
    client,
    (state) => state.capture === "connecting" && state.fixture.dataChannelLabel === "oai-events",
  );
  await callBrowserFixture(client, "openProviderSession");
  const listening = await waitForCaptureState(client, (state) => state.capture === "listening");
  assertDraftPreserved(listening, draft);
  assertListeningCapture(listening, runWorking);
  return listening;
}

async function commitSpeechCapture(client, { finishLabel, transcript }) {
  await clickEnabledButtonByAria(client, finishLabel);
  await waitForCaptureState(
    client,
    (state) => state.capture === "committing" && state.fixture.commitCount === 1,
  );
  await callBrowserFixture(client, "emitCompleted", transcript);
}

function waitForWorkingCapturePane(client, requestText, buttonAriaLabel, capturePhase) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "working" &&
      state.paneChromeTitle === `Easy Button · ${capturePhase}` &&
      state.runRequestText === requestText &&
      state.buttonAriaLabel === buttonAriaLabel &&
      state.swirl.opacity === "0.45" &&
      state.stopButtonVisible &&
      !state.stopButtonDisabled,
    workflowTimeoutMs,
  );
}

function waitForEasyButtonWorking(client, requestText) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, "working") &&
      state.runRequestText === requestText &&
      state.buttonAriaLabel === "Start voice steering" &&
      state.inputValue === "" &&
      state.stopButtonVisible &&
      !state.stopButtonDisabled,
    workflowTimeoutMs,
  );
}

function waitForEasyButtonTerminal(client, requestText) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, "complete") &&
      state.runRequestText === requestText &&
      state.summaryText !== "",
    workflowTimeoutMs,
  );
}

function waitForSpeechPartialOutcome(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, "working") &&
      state.runRequestText === narratorFailureRequest &&
      state.focusStatus === "stale" &&
      state.errorText === partialOutcomeMessage &&
      state.inputValue === "" &&
      !state.inputFocused &&
      state.stopButtonVisible &&
      !state.stopButtonDisabled,
    workflowTimeoutMs,
  );
}

function captureStateExpression() {
  return "globalThis.__settaSpeechCaptureFixture?.state() ?? {}";
}

function waitForCaptureState(client, isReady) {
  return waitForState(client, captureStateExpression(), isReady);
}

function callBrowserFixture(client, method, argument) {
  const serializedArgument = argument === undefined ? "" : JSON.stringify(argument);
  return client.evaluate(
    `globalThis.__settaSpeechCaptureFixture[${JSON.stringify(method)}](${serializedArgument})`,
  );
}

function setFooterDraft(client, value) {
  return client.driver("setInputValue", {
    selector: '[data-testid="easy-button-input"]',
    value,
  });
}

function assertRestingCapture(state) {
  if (state.capturing !== "false" || state.inputDisabled || state.captureLine !== "") {
    throw new Error(`configured capture did not rest cleanly: ${JSON.stringify(state)}`);
  }
}

function assertDraftPreserved(state, expectedDraft) {
  if (state.inputValue !== expectedDraft) {
    throw new Error(`speech capture did not preserve the footer draft: ${JSON.stringify(state)}`);
  }
}

function assertNoListeningRings(state) {
  if (state.ringAnimations.some((name) => name !== "none")) {
    throw new Error(`speech capture showed listening rings too early: ${JSON.stringify(state)}`);
  }
}

function assertProviderBoundary(fixtureState) {
  if (
    !fixtureState.providerAuthorized ||
    fixtureState.providerBody !== "fixture-offer-sdp" ||
    fixtureState.providerMethod !== "POST"
  ) {
    throw new Error(
      `speech capture did not use the Realtime boundary: ${JSON.stringify(fixtureState)}`,
    );
  }
}

function assertListeningCapture(state, runWorking) {
  if (
    state.capturing !== "true" ||
    state.buttonDisabled ||
    state.captureLineCount !== 1 ||
    !state.helper.includes(runWorking ? "steer" : "send") ||
    state.inputDisabled !== true ||
    state.ringAnimations.some((name) => name !== "easy-button-ring-in")
  ) {
    throw new Error(`speech capture did not render listening accurately: ${JSON.stringify(state)}`);
  }
}

function assertWorkingListeningPresentation(pane, capture, expected) {
  assertWorkingCaptureFocus(pane, expected);
  assertWorkingCaptureControls(pane);
  assertDraftPreserved(capture, expected.draft);
  assertCaptureTranscriptPlacement(pane, capture, expected.transcript);
}

function assertWorkingCaptureFocus(pane, expected) {
  if (
    pane.currentFocusText !== expected.focusText ||
    pane.currentFocus?.text !== expected.focusText ||
    pane.currentFocus?.status !== expected.focusStatus ||
    pane.focusStatus !== expected.focusStatus ||
    pane.focusBlockDisplay !== "block"
  ) {
    throw new Error(`working voice capture displaced Current focus: ${JSON.stringify(pane)}`);
  }
}

function assertWorkingCaptureControls(pane) {
  if (pane.stopButtonAriaLabel !== "Stop easy run" || pane.swirl.opacity !== "0.45") {
    throw new Error(`working voice capture displaced working controls: ${JSON.stringify(pane)}`);
  }
}

function assertCaptureTranscriptPlacement(pane, capture, transcript) {
  if (
    capture.captureLine !== transcript ||
    pane.railText.includes("Steering:") ||
    (transcript !== "" &&
      (pane.railText.includes(transcript) || pane.currentFocusText.includes(transcript)))
  ) {
    throw new Error(
      `working voice capture escaped its dedicated line: ${JSON.stringify({ capture, pane })}`,
    );
  }
}

function assertStoppedWhileListening(state) {
  if (
    state.statusTone !== "stopped" ||
    !state.summaryText.startsWith("Stopped after") ||
    state.stopButtonVisible ||
    state.railText.includes("Steering:")
  ) {
    throw new Error(
      `stopping during voice capture left an invalid presentation: ${JSON.stringify(state)}`,
    );
  }
}

function assertCaptureTeardown(state) {
  if (
    state.captureLine !== "" ||
    !state.fixture.channelClosed ||
    !state.fixture.peerClosed ||
    state.inputDisabled
  ) {
    throw new Error(`completed capture left ephemeral state behind: ${JSON.stringify(state)}`);
  }
}

function assertCaptureFailure(state, expectedDraft) {
  if (
    state.captureError !== "The transcription connection was lost. Please try again." ||
    state.inputValue !== expectedDraft ||
    state.fixture.activeTrackCount !== 0 ||
    !state.fixture.channelClosed ||
    !state.fixture.peerClosed
  ) {
    throw new Error(`disconnect recovery was incorrect: ${JSON.stringify(state)}`);
  }
}

async function latestEasyRunId(client, workspaceId) {
  const snapshot = await client.evaluate(
    `window.setta.easyRun.snapshot(${JSON.stringify(workspaceId)})`,
  );
  return snapshot.latestRun?.id ?? null;
}

function assertProviderOperationCount(providerFixture, expected) {
  const transcription = providerFixture.requests.filter(
    (request) => request.path === "/v1/realtime/client_secrets",
  ).length;
  const synthesis = providerFixture.requests.filter(
    (request) => request.path === "/v1/audio/speech",
  ).length;
  if (
    providerFixture.requests.length !== expected.transcription + expected.synthesis ||
    transcription !== expected.transcription ||
    synthesis !== expected.synthesis
  ) {
    throw new Error("speech capture workflow issued unexpected provider operations");
  }
}

async function assertNoSensitiveSpeechArtifacts(root, providerFixture) {
  const forbidden = [
    ["permanent speech key", providerFixture.apiKey],
    ["Realtime client secret", providerFixture.clientSecret],
    ["generated audio base64", providerFixture.audioBase64],
    ["provider failure body", "fixture provider body must stay hidden"],
    ["synthesis provider failure body", "fixture synthesis provider body must stay hidden"],
  ];
  for (const path of await textArtifactPaths(root)) {
    const content = await readFile(path, "utf8");
    for (const [label, value] of forbidden) {
      if (content.includes(value)) {
        throw new Error(`${label} leaked into ${path}`);
      }
    }
  }
}

async function assertNoRendererConsoleErrors(root) {
  const rows = await readJsonLinesOptional(join(root, "renderer-console.jsonl"));
  const errors = rows.filter((row) => Number(row.level) >= 2);
  if (errors.length > 0) {
    throw new Error(`speech capture workflow recorded renderer errors: ${JSON.stringify(errors)}`);
  }
}

async function textArtifactPaths(root) {
  const paths = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await textArtifactPaths(path)));
    } else if (textArtifactExtension(path)) {
      paths.push(path);
    }
  }
  return paths;
}

function textArtifactExtension(path) {
  return new Set([".json", ".jsonl", ".log", ".txt"]).has(extname(path));
}
