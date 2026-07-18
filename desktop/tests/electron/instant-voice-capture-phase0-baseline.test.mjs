#!/usr/bin/env node
/* global console */

import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertArtifactsExcludeMarkers,
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { startSpeechTranscriptionProviderFixture } from "./speech-transcription-provider-fixture.mjs";
import { openMasterOverlayForSpeech } from "./topic-conversation-speech-state-assertions.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "instant-voice-capture-phase0-baseline";
const workflowTimeoutMs = 30_000;
const providerSetupDelaysMs = [0, 500, 1_500];
const speechRealtimeBrowserFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "speech-realtime-browser-fixture.js",
);

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/instant-voice-capture-phase0-baseline.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const provider = await startSpeechTranscriptionProviderFixture();
let context = null;
const runFixtures = [];

try {
  const runs = [];
  for (const providerDelayMs of providerSetupDelaysMs) {
    const runId = `provider-delay-${providerDelayMs}`;
    const runFixture = await createElectronFixture(`${workflowName}-${providerDelayMs}`);
    runFixtures.push(runFixture);
    context = await launchBaselineContext(runFixture, join(artifactDir, runId));
    const run = await recordBaselineRun(context.client, providerDelayMs);
    await captureScreenshot(context.client, join(artifactDir, runId, "complete.png"));
    runs.push(run);
    await stopElectronCdpContext(context);
    context = null;
  }

  const summary = {
    artifactDir,
    providerSetupDelaysMs,
    runs,
    status: "passed",
  };
  await writeJson(join(artifactDir, "timing-summary.json"), summary);
  await writeJson(join(artifactDir, "summary.json"), summary);
  await assertArtifactsExcludeMarkers(
    artifactDir,
    [provider.apiKey, provider.clientSecret],
    "private speech credential",
  );
  console.log(`Electron instant voice capture Phase 0 baseline passed: ${artifactDir}`);
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
  for (const runFixture of runFixtures) {
    await rm(runFixture.tempRoot, { force: true, recursive: true });
  }
}

async function launchBaselineContext(runFixture, runArtifactDir) {
  const launched = await launchElectronCdpContext({
    artifactDir: runArtifactDir,
    extraEnv: {
      OPENAI_API_KEY: provider.apiKey,
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: provider.baseURL,
    },
    fixture: runFixture,
    visible: options.visible,
  });
  await waitForSelector(launched.client, '[data-testid="workspace-layout-area"]');
  await launched.client.installDriver();
  await launched.client.evaluate(await readFile(speechRealtimeBrowserFixture, "utf8"));
  await openMasterOverlayForSpeech(launched.client, workflowTimeoutMs);
  return launched;
}

async function recordBaselineRun(client, providerDelayMs) {
  const runId = `provider-delay-${providerDelayMs}`;
  const transcript = `Instant voice capture Phase 0 baseline transcript ${providerDelayMs}.`;
  provider.setTimingContext({ providerDelayMs, runId });
  provider.setTranscriptionSessionDelayMs(providerDelayMs);
  await client.evaluate(`(() => {
    const fixture = globalThis.__settaSpeechRealtimeBrowserFixture;
    fixture.setTimingContext(${JSON.stringify({ providerDelayMs, runId })});
    fixture.setDelays({ dataChannelOpenMs: 0, webRTCAnswerMs: 0 });
    fixture.setTranscript(${JSON.stringify(transcript)});
  })()`);

  const browserBefore = await browserTimingSnapshot(client);
  const providerBefore = provider.snapshotTiming();
  const browserEventCountBefore = browserBefore.timing.events.length;
  const providerEventCountBefore = providerBefore.events.length;
  const commitCountBefore = browserBefore.commitCount;

  await clickCaptureControl(client, "capture_click");
  const listening = await waitForShellCaptureState(client, "listening");
  await markBrowserTiming(client, "listening_observed", {
    captureLabel: listening.captureLabel,
    label: listening.label,
  });
  await clickCaptureControl(client, "finish_click");
  await waitForState(
    client,
    "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
    (state) => state.commitCount === commitCountBefore + 1,
    workflowTimeoutMs,
  );
  await waitForBrowserEvent(client, runId, "transcript_completed_emitted");
  await waitForShellReadyForNextCapture(client);

  const browserAfter = await browserTimingSnapshot(client);
  const providerAfter = provider.snapshotTiming();
  const browserEvents = browserAfter.timing.events
    .slice(browserEventCountBefore)
    .filter((event) => event.detail.runId === runId);
  const providerEvents = providerAfter.events
    .slice(providerEventCountBefore)
    .filter((event) => event.detail.runId === runId);
  const measurements = baselineMeasurements(browserEvents, providerEvents);
  assertBaselineRun(runId, browserEvents, providerEvents, measurements, transcript);
  return {
    browserEvents,
    measurements,
    providerDelayMs,
    providerEvents,
    runId,
    transcript,
  };
}

async function clickCaptureControl(client, eventName) {
  const result = await client.evaluate(`(() => {
    const fixture = globalThis.__settaSpeechRealtimeBrowserFixture;
    fixture.markTiming(${JSON.stringify(eventName)});
    const button =
      document.querySelector('[data-testid="master-overlay-voice-capture"]') ??
      document.querySelector('[data-testid="shell-speech-capture-control"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { clicked: false, reason: "missing-button" };
    }
    if (button.disabled) {
      return { clicked: false, reason: "disabled-button" };
    }
    button.click();
    return { clicked: true, reason: "clicked" };
  })()`);
  if (!result?.clicked) {
    throw new Error(`speech capture control was not clickable: ${JSON.stringify(result)}`);
  }
}

async function markBrowserTiming(client, eventName, detail = {}) {
  await client.evaluate(`globalThis.__settaSpeechRealtimeBrowserFixture.markTiming(
    ${JSON.stringify(eventName)},
    ${JSON.stringify(detail)}
  )`);
}

async function browserTimingSnapshot(client) {
  return client.evaluate("globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()");
}

async function waitForBrowserEvent(client, runId, eventName) {
  await waitForState(
    client,
    "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
    (state) =>
      state.timing.events.some((event) => event.name === eventName && event.detail.runId === runId),
    workflowTimeoutMs,
  );
}

async function waitForShellCaptureState(client, captureState) {
  return waitForState(
    client,
    driverCallExpression("topicConversationShellSpeechState", {}),
    (state) => state.captureState === captureState,
    workflowTimeoutMs,
  );
}

async function waitForShellReadyForNextCapture(client) {
  return waitForState(
    client,
    driverCallExpression("topicConversationShellSpeechState", {}),
    (state) =>
      state.captureState === "idle" &&
      state.captureAvailable &&
      state.captureLabel === "Start a voice request for Setta",
    workflowTimeoutMs,
  );
}

function baselineMeasurements(browserEvents, providerEvents) {
  return {
    clickToCommitMs: elapsedBrowserMs(browserEvents, "capture_click", "transcript_commit_sent"),
    clickToCompletedTranscriptMs: elapsedBrowserMs(
      browserEvents,
      "capture_click",
      "transcript_completed_emitted",
    ),
    clickToListeningMs: elapsedBrowserMs(browserEvents, "capture_click", "listening_observed"),
    clickToLocalCaptureReadyMs: elapsedBrowserMs(
      browserEvents,
      "capture_click",
      "microphone_grant",
    ),
    clickToMicrophoneGrantMs: elapsedBrowserMs(browserEvents, "capture_click", "microphone_grant"),
    clickToWebRTCReadyMs: elapsedBrowserMs(
      browserEvents,
      "capture_click",
      "realtime_session_created",
    ),
    finishToCommitMs: elapsedBrowserMs(browserEvents, "finish_click", "transcript_commit_sent"),
    firstRetainedFrameReleasedMs: null,
    localDrainCompletedMs: null,
    sessionRequestToResponseMs: elapsedProviderMs(
      providerEvents,
      "transcription_session_request_received",
      "transcription_session_response_sent",
    ),
  };
}

function elapsedBrowserMs(events, startName, endName) {
  const start = firstEvent(events, startName);
  const end = firstEvent(events, endName);
  if (!start || !end) {
    return null;
  }
  return Math.round((end.performanceMs - start.performanceMs) * 10) / 10;
}

function elapsedProviderMs(events, startName, endName) {
  const start = firstEvent(events, startName);
  const end = firstEvent(events, endName);
  if (!start || !end) {
    return null;
  }
  return end.epochMs - start.epochMs;
}

function firstEvent(events, name) {
  return events.find((event) => event.name === name) ?? null;
}

function assertBaselineRun(runId, browserEvents, providerEvents, measurements, transcript) {
  assertRequiredTimingEvents(runId, "browser", browserEvents, [
    "capture_click",
    "microphone_request",
    "microphone_grant",
    "webrtc_track_added",
    "webrtc_answer_response",
    "realtime_session_created",
    "listening_observed",
    "finish_click",
    "microphone_track_stopped",
    "transcript_commit_sent",
    "transcript_completed_emitted",
  ]);
  assertRequiredTimingEvents(runId, "provider", providerEvents, [
    "transcription_session_request_received",
    "transcription_session_response_sent",
  ]);
  assertFiniteMeasurement(runId, "clickToListeningMs", measurements.clickToListeningMs);
  assertFiniteMeasurement(
    runId,
    "sessionRequestToResponseMs",
    measurements.sessionRequestToResponseMs,
  );
  if (typeof transcript !== "string" || transcript.length === 0) {
    throw new Error(`${runId} did not complete the scripted transcript`);
  }
}

function assertRequiredTimingEvents(runId, source, events, requiredNames) {
  const eventNames = new Set(events.map((event) => event.name));
  for (const name of requiredNames) {
    if (!eventNames.has(name)) {
      throw new Error(`${runId} missing ${source} timing event ${name}`);
    }
  }
}

function assertFiniteMeasurement(runId, field, value) {
  if (!Number.isFinite(value)) {
    throw new Error(`${runId} did not produce usable ${field} timing`);
  }
}
