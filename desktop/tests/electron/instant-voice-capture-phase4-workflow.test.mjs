#!/usr/bin/env node
/* global console */

import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { driverCallExpression } from "./cdp-client.mjs";
import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import {
  assertArtifactsExcludeMarkers,
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  dispatchKeyEvent,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  repoRoot,
  reloadPage,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import { startSpeechTranscriptionProviderFixture } from "./speech-transcription-provider-fixture.mjs";
import {
  assertDriverAction,
  conversationSurfaces,
  createTopic,
  hasReadyConversation,
} from "./topic-conversation-fork-workflow.mjs";
import {
  assertRoutedConversationInputDecision,
  readConversationInputRoutingState,
} from "./topic-conversation-input-routing-assertions.mjs";
import { readJsonLinesWhileAppending } from "./topic-conversation-master-overlay-assertions.mjs";
import { expectedNarratorStatusReply } from "./topic-conversation-projection-assertions.mjs";
import {
  openMasterOverlayForSpeech,
  waitForRecordedPaneSpeechInput,
} from "./topic-conversation-speech-state-assertions.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "instant-voice-capture-phase4-workflow";
const workflowTimeoutMs = 45_000;
const speechRealtimeBrowserFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "speech-realtime-browser-fixture.js",
);
const speechRealtimeProcessedAudioObserverWorklet = join(
  dirname(fileURLToPath(import.meta.url)),
  "speech-realtime-processed-audio-observer-worklet.js",
);
const providerSetupDelaysMs = [0, 1_500];
const localReadinessCohortSampleCount = 20;
const localReadinessInterSampleSettleMs = 120;
const localReadinessP95BudgetMs = 100;
const localReadinessP95DifferenceBudgetMs = 1000 / 60;
const durationLimitMs = 120_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/instant-voice-capture-phase4-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
const speechProvider = await startSpeechTranscriptionProviderFixture();
let context = null;
let remoteRuntime = null;
let speechRealtimeBrowserFixtureSource = "";
let speechRealtimeProcessedAudioObserverWorkletSource = "";

try {
  speechRealtimeBrowserFixtureSource = await readFile(speechRealtimeBrowserFixture, "utf8");
  speechRealtimeProcessedAudioObserverWorkletSource = await readFile(
    speechRealtimeProcessedAudioObserverWorklet,
    "utf8",
  );
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      OPENAI_API_KEY: speechProvider.apiKey,
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: speechProvider.baseURL,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  await installSpeechRealtimeBrowserFixture();

  const backend = await backendProbe(artifactDir);
  const workspaceId = await openWorkspace(context.client);
  const alpha = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Instant voice Alpha",
    workflowTimeoutMs,
  );
  const beta = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Instant voice Beta",
    workflowTimeoutMs,
  );
  const initialSurfaces = await waitForConversationSurfaces(context.client, (surfaces) =>
    [alpha.id, beta.id].every((conversationId) => hasReadyConversation(surfaces, conversationId)),
  );
  const alphaPaneId = firstConversationPaneId(initialSurfaces.surfaces, alpha.id);
  const betaPaneId = firstConversationPaneId(initialSurfaces.surfaces, beta.id);

  const warmupRun = await exerciseFinishedCapture({
    destination: "master",
    providerDelayMs: 0,
    runId: "shell-warmup",
    start: () => clickShellSpeechControl(context.client),
    transcript: "Phase 4 shell warmup transcript.",
  });

  const { cohorts: localReadinessCohorts, p95DifferenceMs } = await collectLocalReadinessCohorts();
  assertLocalReadinessInvariant(localReadinessCohorts, p95DifferenceMs);

  const paneTranscript = "Phase 4 early pane marker transcript.";
  const paneRun = await exerciseFinishedCapture({
    destination: "pane",
    expectedConversationId: alpha.id,
    expectedPaneId: alphaPaneId,
    providerDelayMs: 1_500,
    runId: "easy-button-pane-before-ready",
    start: () => clickPaneSpeechControl(context.client, alpha.id),
    transcript: paneTranscript,
  });
  await waitForRecordedPaneSpeechInput(
    artifactDir,
    alpha.id,
    alphaPaneId,
    paneTranscript,
    workflowTimeoutMs,
  );

  assertDriverAction(
    await context.client.driver("topicConversationSubmit", {
      conversationId: beta.id,
      text: "hold active run for voice queue",
    }),
    "submitted",
  );
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    beta.id,
    (snapshot) =>
      snapshot.conversation.status === "working" &&
      snapshot.turns.turns.some((turn) => turn.status === "running"),
  );
  const activeRunTranscript = "Phase 4 active run voice queue transcript.";
  await exerciseFinishedCapture({
    destination: "pane",
    expectedConversationId: beta.id,
    expectedPaneId: betaPaneId,
    providerDelayMs: 1_500,
    runId: "active-run-pane-before-ready",
    start: () => clickPaneSpeechControl(context.client, beta.id),
    transcript: activeRunTranscript,
  });
  const activeRunInput = await waitForRecordedPaneSpeechInput(
    artifactDir,
    beta.id,
    betaPaneId,
    activeRunTranscript,
    workflowTimeoutMs,
  );
  const activeRunRouting = await waitForBackendState(
    () => readConversationInputRoutingState(context.client, workspaceId, activeRunInput.request),
    (state) => state.input?.status === "dispatched",
    workflowTimeoutMs,
  );
  assertRoutedConversationInputDecision(
    activeRunRouting,
    activeRunInput.accepted.input,
    "queue_parent_turn",
  );

  await openMasterOverlayForSpeech(context.client, workflowTimeoutMs);
  const overlayRun = await exerciseFinishedCapture({
    destination: "master",
    providerDelayMs: 1_500,
    runId: "master-overlay-before-ready",
    start: () => clickMasterOverlayVoice(context.client),
    transcript: "Phase 4 master overlay transcript.",
  });

  const shortcutRun = await exerciseFinishedCapture({
    destination: "master",
    providerDelayMs: 1_500,
    runId: "master-shortcut-before-ready",
    start: () => pressMasterVoiceShortcut(context.client),
    transcript: "Phase 4 master shortcut transcript.",
  });

  const playbackTopic = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Instant voice playback preemption",
    workflowTimeoutMs,
  );
  const playbackSurfaces = await waitForConversationSurfaces(context.client, (surfaces) =>
    hasReadyConversation(surfaces, playbackTopic.id),
  );
  const playbackPaneId = firstConversationPaneId(playbackSurfaces.surfaces, playbackTopic.id);
  const playbackPreemption = await exercisePlaybackPreemption({
    backend,
    conversationId: playbackTopic.id,
    narratorVoiceId: playbackTopic.narratorVoiceId,
    paneId: playbackPaneId,
    workspaceId,
  });

  const cleanup = {};
  cleanup.cancellation = await exerciseCancellationCleanup();
  cleanup.durationFailure = await exerciseDurationFailureCleanup();
  cleanup.paneClosure = await exercisePaneClosureCleanup(alpha.id);
  cleanup.runtimeSwitch = await exerciseRuntimeSwitchCleanup();
  cleanup.connectionFailure = await exerciseConnectionFailureCleanup();
  cleanup.appTeardown = await exerciseAppTeardownCleanup();

  const summary = {
    activeRunRoutingKind: activeRunRouting.decisions[0]?.decision?.kind ?? null,
    artifactDir,
    cleanup,
    localReadinessCohorts,
    localReadinessP95BudgetMs,
    localReadinessP95DifferenceBudgetMs,
    localReadinessP95DifferenceMs: p95DifferenceMs,
    overlayRun: runSummary(overlayRun),
    paneRun: runSummary(paneRun),
    playbackPreemption,
    shortcutRun: runSummary(shortcutRun),
    status: "passed",
    topics: { alpha, beta, playback: playbackTopic },
    warmupRun: runSummary(warmupRun),
    workspaceId,
  };
  await writeJson(join(artifactDir, "summary.json"), summary);
  await writeJson(join(artifactDir, "timing-summary.json"), summary);
  await captureScreenshot(context.client, join(artifactDir, "complete.png"));
  await assertArtifactsExcludeMarkers(
    artifactDir,
    [speechProvider.apiKey, speechProvider.clientSecret],
    "private speech credential",
  );
  speechProvider.assertHealthy();
  console.log(`Electron instant voice capture Phase 4 workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      browserFixture: await safeBrowserFixtureSnapshot(context.client),
      shellSpeech: await safeShellSpeechState(context.client),
      surfaces: await safeConversationSurfaces(context.client),
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
  await stopRemoteRuntime(remoteRuntime);
  await speechProvider.close();
  await rm(fixture.tempRoot, { force: true, recursive: true });
}

async function collectLocalReadinessCohorts() {
  const runsByProviderDelayMs = new Map(
    providerSetupDelaysMs.map((providerDelayMs) => [providerDelayMs, []]),
  );
  for (let sampleIndex = 1; sampleIndex <= localReadinessCohortSampleCount; sampleIndex += 1) {
    for (const providerDelayMs of providerSetupDelaysMs) {
      await delay(localReadinessInterSampleSettleMs);
      const runs = runsByProviderDelayMs.get(providerDelayMs);
      if (!runs) {
        throw new Error(`local readiness cohort was not initialized for ${providerDelayMs}`);
      }
      runs.push(
        await exerciseFinishedCapture({
          destination: "master",
          providerDelayMs,
          runId: `shell-local-readiness-${providerDelayMs}-${sampleIndex}`,
          start: () => clickShellSpeechControl(context.client),
          transcript: `Phase 4 local readiness ${providerDelayMs} sample ${sampleIndex}.`,
        }),
      );
    }
  }
  const cohorts = providerSetupDelaysMs.map((providerDelayMs) =>
    localReadinessCohortSummary(providerDelayMs, runsByProviderDelayMs.get(providerDelayMs) ?? []),
  );
  const p95DifferenceMs = localReadinessP95DifferenceMs(cohorts);
  return { cohorts, p95DifferenceMs };
}

async function exerciseFinishedCapture({
  destination,
  expectedConversationId = null,
  expectedPaneId = null,
  providerDelayMs,
  runId,
  start,
  transcript,
}) {
  await configureSpeechRun({
    providerDelayMs,
    runId,
    transcript,
  });
  const before = await browserFixtureSnapshot(context.client);
  const browserEventCountBefore = before.timing.events.length;
  const commitCountBefore = before.commitCount;
  const providerBefore = speechProvider.snapshotTiming();
  const providerEventCountBefore = providerBefore.events.length;
  await installCaptureTimingObserver(destination, expectedConversationId);
  await markBrowserTiming("capture_click", { destination });
  await start();
  const recording =
    destination === "pane"
      ? await waitForPaneCaptureState(expectedConversationId, "recording")
      : await waitForShellCaptureState("recording");
  assertRecordingPresentation(destination, recording, expectedConversationId, expectedPaneId);
  await assertAnotherPaneArbitration(expectedConversationId);
  await markBrowserTiming("finish_click", { destination });
  await finishCapture(destination, expectedConversationId);
  await waitForBrowserEvent(runId, "microphone_track_stopped");
  await waitForState(
    context.client,
    "globalThis.__settaSpeechRealtimeBrowserFixture.counters().commitCount",
    (commitCount) => commitCount === commitCountBefore + 1,
    workflowTimeoutMs,
  );
  await waitForBrowserEvent(runId, "processed_audio_marker_observed");
  await waitForBrowserEvent(runId, "transcript_completed_emitted");
  await waitForReadyForNextCapture();

  const browserAfter = await browserFixtureSnapshot(context.client);
  const providerAfter = speechProvider.snapshotTiming();
  const browserEvents = runBrowserEvents(browserAfter, browserEventCountBefore, runId);
  const providerEvents = providerAfter.events
    .slice(providerEventCountBefore)
    .filter((event) => event.detail.runId === runId);
  const measurements = captureMeasurements(browserEvents, providerEvents);
  assertFinishedCaptureRun(runId, browserEvents, measurements, providerDelayMs > 0);
  if (destination === "master") {
    await waitForRecordedMasterSpeechInput(artifactDir, transcript);
  }
  return {
    browserEvents,
    destination,
    measurements,
    providerDelayMs,
    providerEvents,
    runId,
    transcript,
  };
}

async function configureSpeechRun({
  dataChannelOpenMs = 0,
  providerDelayMs = 0,
  runId,
  transcript,
  webRTCAnswerStatus = 201,
}) {
  const timingContext = { providerDelayMs, runId };
  speechProvider.setTimingContext(timingContext);
  speechProvider.setTranscriptionSessionDelayMs(providerDelayMs);
  await context.client.evaluate(`(() => {
    const fixture = globalThis.__settaSpeechRealtimeBrowserFixture;
    fixture.clearDurationTimerOverride();
    fixture.setRequireProcessedAudioMarker(true);
    fixture.setTimingContext(${JSON.stringify(timingContext)});
    fixture.setDelays(${JSON.stringify({ dataChannelOpenMs, webRTCAnswerStatus, webRTCAnswerMs: 0 })});
    fixture.setTranscript(${JSON.stringify(transcript)});
  })()`);
}

async function installCaptureTimingObserver(destination, conversationId) {
  const result = await context.client.driver("topicConversationInstallCaptureTimingObserver", {
    conversationId,
    destination,
  });
  if (result?.installed !== true) {
    throw new Error(`capture timing observer was not installed: ${JSON.stringify(result)}`);
  }
}

async function finishCapture(destination, conversationId) {
  if (destination === "pane") {
    await clickPaneSpeechControl(context.client, conversationId);
    return;
  }
  await clickShellSpeechControl(context.client);
}

async function exerciseCancellationCleanup() {
  const runId = "cleanup-cancel-before-ready";
  await configureSpeechRun({
    dataChannelOpenMs: 1_500,
    providerDelayMs: 0,
    runId,
    transcript: "cancelled transcript must not submit",
  });
  const before = await browserFixtureSnapshot(context.client);
  await installCaptureTimingObserver("master", null);
  await markBrowserTiming("capture_click", { destination: "master" });
  await pressMasterVoiceShortcut(context.client);
  await waitForShellCaptureState("recording");
  await waitForBrowserEvent(runId, "webrtc_peer_created");
  await pressEscape(context.client);
  await waitForReadyForNextCapture();
  await waitForBrowserEvent(runId, "microphone_track_stopped");
  await waitForBrowserEvent(runId, "webrtc_peer_closed");
  await delay(1_600);
  const after = await browserFixtureSnapshot(context.client);
  assertNoCommitAfter(before, after, runId);
  return cleanupSummary(before, after, runId);
}

async function exerciseConnectionFailureCleanup() {
  const runId = "cleanup-connection-failure";
  await configureSpeechRun({
    providerDelayMs: 0,
    runId,
    transcript: "connection failure transcript must not submit",
    webRTCAnswerStatus: 503,
  });
  const before = await browserFixtureSnapshot(context.client);
  await installCaptureTimingObserver("master", null);
  await markBrowserTiming("capture_click", { destination: "master" });
  await clickShellSpeechControl(context.client);
  await waitForBrowserEvent(runId, "recording_observed");
  await waitForShellCaptureState("failed");
  await waitForBrowserEvent(runId, "microphone_track_stopped");
  await waitForBrowserEvent(runId, "webrtc_peer_closed");
  const after = await browserFixtureSnapshot(context.client);
  assertNoCommitAfter(before, after, runId);
  return cleanupSummary(before, after, runId);
}

async function exerciseDurationFailureCleanup() {
  const runId = "cleanup-duration-failure";
  await configureSpeechRun({
    dataChannelOpenMs: 1_500,
    providerDelayMs: 0,
    runId,
    transcript: "duration failure transcript must not submit",
  });
  await context.client.evaluate(
    `globalThis.__settaSpeechRealtimeBrowserFixture.setDurationTimerOverride(${JSON.stringify({
      fromMs: durationLimitMs,
      toMs: 500,
    })})`,
  );
  const before = await browserFixtureSnapshot(context.client);
  await installCaptureTimingObserver("master", null);
  await markBrowserTiming("capture_click", { destination: "master" });
  await clickShellSpeechControl(context.client);
  await waitForShellCaptureState("recording");
  await waitForShellCaptureState("failed");
  await waitForBrowserEvent(runId, "duration_timer_shortened");
  await waitForBrowserEvent(runId, "microphone_track_stopped");
  await waitForBrowserEvent(runId, "webrtc_peer_closed");
  const after = await browserFixtureSnapshot(context.client);
  assertNoCommitAfter(before, after, runId);
  await context.client.evaluate(
    "globalThis.__settaSpeechRealtimeBrowserFixture.clearDurationTimerOverride()",
  );
  await reloadSpeechFixture();
  return cleanupSummary(before, after, runId);
}

async function exercisePaneClosureCleanup(conversationId) {
  const runId = "cleanup-pane-closure";
  await configureSpeechRun({
    dataChannelOpenMs: 1_500,
    providerDelayMs: 0,
    runId,
    transcript: "pane closure transcript must not submit",
  });
  const before = await browserFixtureSnapshot(context.client);
  await installCaptureTimingObserver("pane", conversationId);
  await markBrowserTiming("capture_click", { destination: "pane" });
  await clickPaneSpeechControl(context.client, conversationId);
  await waitForPaneCaptureState(conversationId, "recording");
  assertDriverAction(
    await context.client.driver("topicConversationCloseOneBoundPane", { conversationId }),
    "clicked",
  );
  await waitForBrowserEvent(runId, "microphone_track_stopped");
  await waitForBrowserEvent(runId, "webrtc_peer_closed");
  await waitForReadyForNextCapture();
  const after = await browserFixtureSnapshot(context.client);
  assertNoCommitAfter(before, after, runId);
  return cleanupSummary(before, after, runId);
}

async function exerciseRuntimeSwitchCleanup() {
  const runId = "cleanup-runtime-switch";
  const localRuntimeId = (await context.client.evaluate("window.setta.runtimes.current()"))
    .activeRuntimeId;
  if (!localRuntimeId) {
    throw new Error("local runtime id is unavailable before runtime switch cleanup");
  }
  remoteRuntime = await startRemoteRuntime(join(fixture.tempRoot, "remote-runtime-app-data"));
  await configureSpeechRun({
    dataChannelOpenMs: 1_500,
    providerDelayMs: 0,
    runId,
    transcript: "runtime switch transcript must not submit",
  });
  const before = await browserFixtureSnapshot(context.client);
  await installCaptureTimingObserver("master", null);
  await markBrowserTiming("capture_click", { destination: "master" });
  await clickShellSpeechControl(context.client);
  await waitForShellCaptureState("recording");
  await context.client.evaluate(
    `window.setta.runtimes.addByPairingUrl(${JSON.stringify(remoteRuntime.pairingURL)})`,
  );
  await waitForBrowserEvent(runId, "microphone_track_stopped");
  await waitForBrowserEvent(runId, "webrtc_peer_closed");
  await waitForReadyForNextCapture();
  const after = await browserFixtureSnapshot(context.client);
  assertNoCommitAfter(before, after, runId);
  await context.client.evaluate(`window.setta.runtimes.switch(${JSON.stringify(localRuntimeId)})`);
  await waitForReadyForNextCapture();
  return cleanupSummary(before, after, runId);
}

async function exercisePlaybackPreemption({
  backend,
  conversationId,
  narratorVoiceId,
  paneId,
  workspaceId,
}) {
  const heldText = "hold playback preemption";
  assertDriverAction(
    await context.client.driver("topicConversationSubmit", {
      conversationId,
      text: heldText,
    }),
    "submitted",
  );
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) =>
      snapshot.conversation.status === "working" &&
      snapshot.turns.turns.some((turn) => turn.status === "running"),
  );
  const synthesisRequestCountBefore = speechProvider.requests.length;
  await context.client.evaluate(
    "globalThis.__settaSpeechRealtimeBrowserFixture.setAudioAutoEnd(false)",
  );
  try {
    assertDriverAction(
      await context.client.driver("topicConversationSubmit", {
        conversationId,
        text: "What is the primary agent doing?",
      }),
      "submitted",
    );
    await waitForConversationSnapshot(backend, workspaceId, conversationId, (snapshot) =>
      snapshot.narration.events.some((event) => event.kind === "status_reply"),
    );
    const playback = await waitForAutomaticNarrationStatusPlayback(
      synthesisRequestCountBefore,
      expectedNarratorStatusReply,
      narratorVoiceId,
    );
    const beforeCapture = await browserFixtureSnapshot(context.client);
    const transcript = "Phase 4 playback preemption transcript.";
    const run = await exerciseFinishedCapture({
      destination: "pane",
      expectedConversationId: conversationId,
      expectedPaneId: paneId,
      providerDelayMs: 1_500,
      runId: "playback-preemption-before-ready",
      start: async () => {
        await clickPaneSpeechControl(context.client, conversationId);
        await waitForState(
          context.client,
          "globalThis.__settaSpeechRealtimeBrowserFixture.counters()",
          (counters) =>
            counters.mediaRequestCount === beforeCapture.mediaRequestCount + 1 &&
            counters.audioPauseCount === beforeCapture.audioPauseCount + 1,
          workflowTimeoutMs,
        );
      },
      transcript,
    });
    await waitForRecordedPaneSpeechInput(
      artifactDir,
      conversationId,
      paneId,
      transcript,
      workflowTimeoutMs,
    );
    const afterCapture = await browserFixtureSnapshot(context.client);
    const audioPauseDelta = afterCapture.audioPauseCount - beforeCapture.audioPauseCount;
    if (audioPauseDelta !== 1) {
      throw new Error(
        `playback preemption pause count drifted: ${JSON.stringify({
          afterAudioPauseCount: afterCapture.audioPauseCount,
          beforeAudioPauseCount: beforeCapture.audioPauseCount,
        })}`,
      );
    }
    return {
      audioPauseDelta,
      audioPlayDelta: afterCapture.audioPlayCount - beforeCapture.audioPlayCount,
      playback: playbackSummary(playback),
      run: runSummary(run),
    };
  } finally {
    await context.client
      .evaluate("globalThis.__settaSpeechRealtimeBrowserFixture.setAudioAutoEnd(true)")
      .catch(() => {});
  }
}

function playbackSummary(playback) {
  return {
    audioActiveCount: playback.audio.audioActiveCount,
    audioEndCount: playback.audio.audioEndCount,
    audioPlayCount: playback.audio.audioPlayCount,
    providerRequest: {
      input: playback.providerRequest.input,
      path: playback.providerRequest.path,
      voice: playback.providerRequest.voice,
    },
  };
}

async function waitForAutomaticNarrationStatusPlayback(initialRequestCount, text, resolvedVoiceId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < workflowTimeoutMs) {
    const request = speechProvider.requests
      .slice(initialRequestCount)
      .find(
        (candidate) =>
          candidate.path === "/v1/audio/speech" &&
          candidate.input === text &&
          candidate.voice === resolvedVoiceId,
      );
    if (request) {
      const audio = await waitForState(
        context.client,
        "globalThis.__settaSpeechRealtimeBrowserFixture.counters()",
        (counters) => counters.audioPlayCount > counters.audioEndCount,
        workflowTimeoutMs,
      );
      speechProvider.assertHealthy();
      return { audio, providerRequest: request };
    }
    await context.client.evaluate(
      "globalThis.__settaSpeechRealtimeBrowserFixture.finishAllAudio()",
    );
    await delay(20);
  }
  throw new Error("automatic narrator status playback did not reach the speech provider");
}

async function exerciseAppTeardownCleanup() {
  const runId = "cleanup-app-teardown";
  await configureSpeechRun({
    dataChannelOpenMs: 1_500,
    providerDelayMs: 0,
    runId,
    transcript: "app teardown transcript must not submit",
  });
  const before = await browserFixtureSnapshot(context.client);
  await installCaptureTimingObserver("master", null);
  await markBrowserTiming("capture_click", { destination: "master" });
  await clickShellSpeechControl(context.client);
  await waitForShellCaptureState("recording");
  await waitForBrowserEvent(runId, "webrtc_peer_created");
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  await installSpeechRealtimeBrowserFixture();
  const finalized = await finalizedBrowserFixtureSnapshot(runId);
  await writeJson(join(artifactDir, "app-teardown-finalized-snapshot.json"), finalized);
  assertBrowserEvents(runId, finalized.timing.events, [
    "fixture_pagehide_observed",
    "microphone_track_stopped",
    "webrtc_peer_closed",
  ]);
  await delay(1_600);
  return cleanupSummary(before, finalized, runId);
}

async function startRemoteRuntime(appDataDir) {
  await mkdir(appDataDir, { recursive: true });
  const child = spawn(
    join(repoRoot, "scripts/go.sh"),
    ["run", "./cmd/setta", "serve", "--app-data-dir", appDataDir, "--port", "0"],
    {
      cwd: repoRoot,
      detached: true,
      env: {
        ...process.env,
        OPENAI_API_KEY: speechProvider.apiKey,
        SETTA_E2E: "1",
        SETTA_E2E_OPENAI_SPEECH_BASE_URL: speechProvider.baseURL,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.logs = [];
  child.stdout.on("data", (data) => appendProcessLog(child, data));
  child.stderr.on("data", (data) => appendProcessLog(child, data));
  const pairingURL = await waitForPairingURL(child);
  return { child, pairingURL };
}

function appendProcessLog(child, data) {
  child.logs.push(data.toString());
  if (child.logs.join("").length > 200_000) {
    child.logs = [child.logs.join("").slice(-100_000)];
  }
}

async function waitForPairingURL(child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < workflowTimeoutMs) {
    const output = child.logs.join("");
    const match = output.match(/setta:\/\/pair\?[^\s]+/);
    if (match) {
      return match[0];
    }
    if (child.exitCode !== null) {
      throw new Error(`remote setta serve exited before pairing URL:\n${output}`);
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for remote pairing URL:\n${child.logs.join("")}`);
}

async function stopRemoteRuntime(runtime) {
  if (!runtime) {
    return;
  }
  const child = runtime.child;
  const exited = new Promise((resolvePromise) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise();
      return;
    }
    child.once("close", resolvePromise);
  });
  signalProcessGroup(child, "SIGTERM");
  const stopped = await Promise.race([exited.then(() => true), delay(8_000).then(() => false)]);
  if (!stopped && child.exitCode === null && child.signalCode === null) {
    signalProcessGroup(child, "SIGKILL");
    await Promise.race([exited, delay(3_000)]);
  }
}

function signalProcessGroup(child, signal) {
  try {
    if (process.platform === "win32") {
      child.kill(signal);
      return;
    }
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") {
      throw error;
    }
  }
}

async function clickShellSpeechControl(client) {
  assertDriverAction(await client.driver("topicConversationShellSpeechCapture", {}), "clicked");
}

async function clickPaneSpeechControl(client, conversationId) {
  assertDriverAction(
    await client.driver("topicConversationVoiceCapture", { conversationId }),
    "requested",
  );
}

async function clickMasterOverlayVoice(client) {
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector('[data-testid="master-overlay-voice-capture"]');
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error("master overlay voice control was not clickable");
  }
}

async function pressMasterVoiceShortcut(client) {
  const platform = await client.evaluate("window.setta.app.platform");
  const modifiers = platform === "darwin" ? 12 : 10;
  await dispatchKeyEvent(client, { code: "KeyK", key: "K", modifiers });
  await dispatchKeyEvent(client, { code: "KeyK", key: "K", modifiers, type: "keyUp" });
}

async function pressEscape(client) {
  await dispatchKeyEvent(client, { code: "Escape", key: "Escape" });
  await dispatchKeyEvent(client, { code: "Escape", key: "Escape", type: "keyUp" });
}

async function reloadSpeechFixture() {
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  await installSpeechRealtimeBrowserFixture();
  await waitForReadyForNextCapture();
}

async function installSpeechRealtimeBrowserFixture() {
  await context.client.evaluate(speechRealtimeBrowserFixtureSource);
  await context.client.evaluate(
    `globalThis.__settaSpeechRealtimeBrowserFixture.installProcessedAudioObserverWorklet(${JSON.stringify(
      speechRealtimeProcessedAudioObserverWorkletSource,
    )})`,
  );
}

async function openWorkspace(client) {
  const initial = await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId: "" }),
    (state) => state.openButtonReady || validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  if (!validWorkspaceId(initial.workspaceId)) {
    await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  }
  const opened = await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId: "" }),
    (state) => validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  return opened.workspaceId;
}

function validWorkspaceId(workspaceId) {
  return workspaceId !== "" && workspaceId !== "empty";
}

async function waitForConversationSurfaces(client, ready) {
  return waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (state) => ready(state.surfaces),
    workflowTimeoutMs,
  );
}

async function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    async () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    workflowTimeoutMs,
  );
}

async function waitForPaneCaptureState(conversationId, captureState) {
  const state = await waitForConversationSurfaces(context.client, (surfaces) =>
    conversationSurfaces(surfaces, conversationId).some(
      (surface) => surface.captureState === captureState,
    ),
  );
  return conversationSurfaces(state.surfaces, conversationId).find(
    (surface) => surface.captureState === captureState,
  );
}

async function waitForShellCaptureState(captureState) {
  return waitForState(
    context.client,
    driverCallExpression("topicConversationShellSpeechState", {}),
    (state) => state.captureState === captureState,
    workflowTimeoutMs,
  );
}

async function waitForReadyForNextCapture() {
  return waitForState(
    context.client,
    driverCallExpression("topicConversationShellSpeechState", {}),
    (state) =>
      state.captureState === "idle" &&
      state.captureAvailable &&
      state.captureLabel === "Start a voice request for Setta",
    workflowTimeoutMs,
  );
}

async function waitForBrowserEvent(runId, eventName) {
  await waitForState(
    context.client,
    `globalThis.__settaSpeechRealtimeBrowserFixture.hasTimingEvent(${JSON.stringify(runId)}, ${JSON.stringify(eventName)})`,
    (observed) => observed === true,
    workflowTimeoutMs,
  );
}

async function markBrowserTiming(name, detail = {}) {
  await context.client.evaluate(`globalThis.__settaSpeechRealtimeBrowserFixture.markTiming(
    ${JSON.stringify(name)},
    ${JSON.stringify(detail)}
  )`);
}

function browserFixtureSnapshot(client) {
  return client.evaluate("globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()");
}

async function finalizedBrowserFixtureSnapshot(runId) {
  return waitForState(
    context.client,
    "globalThis.__settaSpeechRealtimeBrowserFixture.finalizedSnapshots()",
    (snapshots) =>
      snapshots
        .map((entry) => entry.snapshot)
        .some((snapshot) =>
          snapshot?.timing?.events?.some(
            (event) => event.name === "fixture_pagehide_observed" && event.detail.runId === runId,
          ),
        ),
    workflowTimeoutMs,
  ).then((snapshots) => {
    const entry = snapshots
      .toReversed()
      .find((candidate) =>
        candidate.snapshot?.timing?.events?.some(
          (event) => event.name === "fixture_pagehide_observed" && event.detail.runId === runId,
        ),
      );
    if (!entry?.snapshot) {
      throw new Error(`missing finalized browser fixture snapshot for ${runId}`);
    }
    return entry.snapshot;
  });
}

async function waitForRecordedMasterSpeechInput(runArtifactDir, transcript) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < workflowTimeoutMs) {
    const events = await readJsonLinesWhileAppending(join(runArtifactDir, "ipc.jsonl"));
    const starts = events.filter(
      (event) =>
        event.type === "ipc_start" &&
        event.channel === "master:submit-input" &&
        event.args?.[0]?.input?.text === transcript,
    );
    if (starts.length > 1) {
      throw new Error(`master voice transcript was submitted more than once: ${starts.length}`);
    }
    const completed = completedIPC(starts[0], events);
    if (completed) {
      assertMasterVoiceInput(completed, transcript);
      return completed;
    }
    await delay(50);
  }
  throw new Error(`timed out waiting for master voice transcript ${JSON.stringify(transcript)}`);
}

function completedIPC(start, events) {
  if (!start) {
    return null;
  }
  const finish = events.find(
    (event) =>
      event.type === "ipc_finish" &&
      event.channel === "master:submit-input" &&
      event.id === start.id,
  );
  return finish ? { accepted: finish.result, request: start.args[0] } : null;
}

function assertMasterVoiceInput(recorded, transcript) {
  const input = recordedRequestInput(recorded);
  const acceptedInput = recordedAcceptedInput(recorded);
  if (!input) {
    throw new Error(`master voice input drifted: ${JSON.stringify(recorded)}`);
  }
  if (!acceptedInput) {
    throw new Error(`master voice input drifted: ${JSON.stringify(recorded)}`);
  }
  if (!masterRequestInputMatches(input, transcript)) {
    throw new Error(`master voice input drifted: ${JSON.stringify(recorded)}`);
  }
  if (!acceptedMasterInputMatches(acceptedInput, input.id, transcript)) {
    throw new Error(`master voice input drifted: ${JSON.stringify(recorded)}`);
  }
}

function recordedRequestInput(recorded) {
  return recorded.request?.input ?? null;
}

function recordedAcceptedInput(recorded) {
  return recorded.accepted?.input ?? null;
}

function masterRequestInputMatches(input, transcript) {
  return [
    input.modality === "voice",
    input.source === "shell",
    input.text === transcript,
    typeof input.id === "string",
    input.id !== "",
  ].every(Boolean);
}

function acceptedMasterInputMatches(input, inputId, transcript) {
  return [input.id === inputId, input.text === transcript].every(Boolean);
}

function assertRecordingPresentation(destination, recording, conversationId, paneId) {
  if (destination === "pane") {
    if (!paneRecordingPresentationMatches(recording, conversationId, paneId)) {
      throw new Error(`pane capture was not immediately actionable: ${JSON.stringify(recording)}`);
    }
    return;
  }
  if (!masterRecordingPresentationMatches(recording)) {
    throw new Error(`shell capture was not immediately actionable: ${JSON.stringify(recording)}`);
  }
}

function paneRecordingPresentationMatches(recording, conversationId, paneId) {
  return [
    recording?.conversationId === conversationId,
    recording?.paneId === paneId,
    recording?.captureScope === "this_pane",
    recording?.voiceCaptureAvailable === true,
    recording?.voiceCaptureLabel === "Finish this voice request",
    recording?.speechActivityText?.includes("Listening") === true,
  ].every(Boolean);
}

function masterRecordingPresentationMatches(recording) {
  return [
    recording?.captureState === "recording",
    recording?.captureLabel === "Finish the voice request for Setta",
    recording?.label?.includes("Listening for Setta") === true,
  ].every(Boolean);
}

async function assertAnotherPaneArbitration(activeConversationId) {
  if (!activeConversationId) {
    return;
  }
  const state = await waitForConversationSurfaces(context.client, (surfaces) =>
    surfaces.some(
      (surface) =>
        surface.conversationId !== activeConversationId &&
        surface.captureState === "recording" &&
        surface.captureScope === "other_conversation",
    ),
  );
  const conflicting = state.surfaces.find(
    (surface) => surface.conversationId !== activeConversationId && surface.voiceCaptureAvailable,
  );
  if (conflicting) {
    throw new Error(`another pane could steal active capture: ${JSON.stringify(conflicting)}`);
  }
}

function firstConversationPaneId(surfaces, conversationId) {
  const surface = conversationSurfaces(surfaces, conversationId)[0];
  if (!surface?.paneId) {
    throw new Error(
      `conversation pane is unavailable: ${JSON.stringify({ conversationId, surfaces })}`,
    );
  }
  return surface.paneId;
}

function runBrowserEvents(snapshot, fromIndex, runId) {
  return snapshot.timing.events.slice(fromIndex).filter((event) => event.detail.runId === runId);
}

function captureMeasurements(browserEvents, providerEvents) {
  return {
    clickToCommitMs: elapsedBrowserMs(browserEvents, "capture_click", "transcript_commit_sent"),
    clickToCompletedTranscriptMs: elapsedBrowserMs(
      browserEvents,
      "capture_click",
      "transcript_completed_emitted",
    ),
    clickToLocalCaptureReadyMs: elapsedBrowserMs(
      browserEvents,
      "capture_click",
      "recording_observed",
    ),
    clickToMicrophoneGrantMs: elapsedBrowserMs(browserEvents, "capture_click", "microphone_grant"),
    clickToProcessedMarkerMs: elapsedBrowserMs(
      browserEvents,
      "capture_click",
      "processed_audio_marker_observed",
    ),
    clickToWebRTCReadyMs: elapsedBrowserMs(
      browserEvents,
      "capture_click",
      "realtime_session_created",
    ),
    finishToCommitMs: elapsedBrowserMs(browserEvents, "finish_click", "transcript_commit_sent"),
    firstRetainedFrameReleasedMs: elapsedBrowserMs(
      browserEvents,
      "realtime_session_created",
      "processed_audio_marker_observed",
    ),
    localDrainCompletedMs: elapsedBrowserMs(
      browserEvents,
      "microphone_track_stopped",
      "transcript_commit_sent",
    ),
    sessionRequestToResponseMs: elapsedProviderMs(
      providerEvents,
      "transcription_session_request_received",
      "transcription_session_response_sent",
    ),
  };
}

function assertFinishedCaptureRun(runId, events, measurements, expectStopBeforeReady) {
  assertRequiredEvents(runId, events, [
    "capture_click",
    "microphone_request",
    "microphone_grant",
    "recording_observed",
    "finish_click",
    "microphone_track_stopped",
    "webrtc_track_added",
    "realtime_session_created",
    "processed_audio_marker_observed",
    "transcript_commit_sent",
    "transcript_completed_emitted",
  ]);
  const marker = requiredEvent(events, "processed_audio_marker_observed");
  if (marker.detail.observerMode !== "worklet") {
    throw new Error(`${runId} processed marker did not use the worklet observer`);
  }
  assertFiniteMeasurement(
    runId,
    "clickToLocalCaptureReadyMs",
    measurements.clickToLocalCaptureReadyMs,
  );
  assertFiniteMeasurement(
    runId,
    "firstRetainedFrameReleasedMs",
    measurements.firstRetainedFrameReleasedMs,
  );
  if (expectStopBeforeReady) {
    assertStopBeforeReadyTimeline(runId, events);
  }
}

function assertStopBeforeReadyTimeline(runId, events) {
  const finish = requiredEvent(events, "finish_click");
  const rawStop = requiredEvent(events, "microphone_track_stopped");
  const ready = requiredEvent(events, "realtime_session_created");
  const marker = requiredEvent(events, "processed_audio_marker_observed");
  const commit = requiredEvent(events, "transcript_commit_sent");
  if (ready.performanceMs < finish.performanceMs) {
    throw new Error(`${runId} provider became ready before the user finished`);
  }
  if (rawStop.performanceMs < finish.performanceMs) {
    throw new Error(`${runId} raw microphone stopped before finish was requested`);
  }
  if (marker.performanceMs < rawStop.performanceMs || marker.performanceMs < ready.performanceMs) {
    throw new Error(`${runId} processed marker was not retained across readiness/drain`);
  }
  if (commit.performanceMs < marker.performanceMs) {
    throw new Error(`${runId} committed before the processed marker was observed`);
  }
}

function localReadinessCohortSummary(providerDelayMs, runs) {
  const clickToLocalCaptureReadyMs = runs.map((run) => run.measurements.clickToLocalCaptureReadyMs);
  for (const [index, value] of clickToLocalCaptureReadyMs.entries()) {
    if (!Number.isFinite(value)) {
      throw new Error(
        `provider delay run ${runs[index].runId} did not produce a local readiness sample: ${JSON.stringify(clickToLocalCaptureReadyMs)}`,
      );
    }
  }
  return {
    clickToLocalCaptureReadyMs,
    p95ClickToLocalCaptureReadyMs: nearestRankPercentile(clickToLocalCaptureReadyMs, 0.95),
    providerDelayMs,
    runIds: runs.map((run) => run.runId),
    sampleCount: clickToLocalCaptureReadyMs.length,
  };
}

function assertLocalReadinessInvariant(cohorts, p95DifferenceMs) {
  for (const cohort of cohorts) {
    if (cohort.sampleCount < localReadinessCohortSampleCount) {
      throw new Error(
        `provider delay ${cohort.providerDelayMs} local readiness cohort is too small: ${JSON.stringify(cohort)}`,
      );
    }
    if (cohort.p95ClickToLocalCaptureReadyMs > localReadinessP95BudgetMs) {
      throw new Error(
        `provider delay ${cohort.providerDelayMs} local readiness p95 exceeded ${localReadinessP95BudgetMs} ms: ${JSON.stringify(cohort)}`,
      );
    }
  }
  if (p95DifferenceMs > localReadinessP95DifferenceBudgetMs) {
    throw new Error(
      `provider delay moved local readiness p95 by ${p95DifferenceMs} ms: ${JSON.stringify(cohorts)}`,
    );
  }
}

function localReadinessP95DifferenceMs(cohorts) {
  const baseline = cohortForProviderDelay(cohorts, 0);
  const delayed = cohortForProviderDelay(cohorts, 1_500);
  return roundMilliseconds(
    Math.abs(delayed.p95ClickToLocalCaptureReadyMs - baseline.p95ClickToLocalCaptureReadyMs),
  );
}

function cohortForProviderDelay(cohorts, providerDelayMs) {
  const cohort = cohorts.find((candidate) => candidate.providerDelayMs === providerDelayMs);
  if (!cohort) {
    throw new Error(`missing local readiness cohort for provider delay ${providerDelayMs}`);
  }
  return cohort;
}

function nearestRankPercentile(values, percentile) {
  if (values.length === 0) {
    throw new Error("cannot calculate nearest-rank percentile for an empty sample");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil(percentile * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

function roundMilliseconds(value) {
  return Math.round(value * 1_000) / 1_000;
}

function assertRequiredEvents(runId, events, requiredNames) {
  assertBrowserEvents(runId, events, requiredNames);
}

function assertBrowserEvents(runId, events, requiredNames) {
  for (const name of requiredNames) {
    if (!events.some((event) => event.name === name && event.detail?.runId === runId)) {
      throw new Error(`${runId} missing browser timing event ${name}`);
    }
  }
}

function requiredEvent(events, name) {
  const event = events.find((candidate) => candidate.name === name);
  if (!event) {
    throw new Error(`missing timing event ${name}`);
  }
  return event;
}

function elapsedBrowserMs(events, startName, endName) {
  const start = events.find((event) => event.name === startName);
  const end = events.find((event) => event.name === endName);
  if (!start || !end) {
    return null;
  }
  return Math.round((end.performanceMs - start.performanceMs) * 10) / 10;
}

function elapsedProviderMs(events, startName, endName) {
  const start = events.find((event) => event.name === startName);
  const end = events.find((event) => event.name === endName);
  if (!start || !end) {
    return null;
  }
  return end.epochMs - start.epochMs;
}

function assertFiniteMeasurement(runId, field, value) {
  if (!Number.isFinite(value)) {
    throw new Error(`${runId} did not produce usable ${field} timing`);
  }
}

function assertNoCommitAfter(before, after, runId) {
  if (after.commitCount !== before.commitCount) {
    throw new Error(`${runId} committed after cleanup: ${JSON.stringify({ after, before })}`);
  }
}

function cleanupSummary(before, after, runId) {
  const summary = {
    commitDelta: after.commitCount - before.commitCount,
    peerCloseDelta: after.peerCloseCount - before.peerCloseCount,
    stoppedTrackDelta: after.stoppedTrackCount - before.stoppedTrackCount,
  };
  assertCleanupDeltas(runId, summary);
  return summary;
}

function assertCleanupDeltas(runId, summary) {
  const expected = {
    commitDelta: 0,
    peerCloseDelta: 1,
    stoppedTrackDelta: 1,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (summary[field] !== value) {
      throw new Error(`${runId} cleanup ${field} was ${summary[field]}, expected ${value}`);
    }
  }
}

function runSummary(run) {
  return {
    destination: run.destination,
    measurements: run.measurements,
    providerDelayMs: run.providerDelayMs,
    runId: run.runId,
  };
}

async function safeBrowserFixtureSnapshot(client) {
  try {
    return await browserFixtureSnapshot(client);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function safeShellSpeechState(client) {
  try {
    return await client.driver("topicConversationShellSpeechState", {});
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function safeConversationSurfaces(client) {
  try {
    return await client.driver("topicConversationSurfaceStates", {});
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
