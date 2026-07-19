#!/usr/bin/env node
/* global console */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { chmod, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
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
import { driverCallExpression } from "./cdp-client.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import { readJsonLinesWhileAppending } from "./topic-conversation-master-overlay-assertions.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "local-macos-voice-capture";
const workflowTimeoutMs = 30_000;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const helperFixturePath = resolve(
  scriptDir,
  "../../src/main/test-fixtures/local-macos-voice-helper-fixture.mjs",
);
const scriptedListenerEventsEnvironmentVariable =
  "SETTA_LOCAL_MACOS_VOICE_HELPER_SCRIPTED_LISTENER_EVENTS";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/local-macos-voice-capture-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (process.platform !== "darwin") {
  console.log("Electron local macOS voice capture workflow skipped: provider is macOS-only");
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
const helperPath = join(fixture.tempRoot, "local-macos-voice-helper");
const modelPath = join(fixture.tempRoot, "ggml-base.en.bin");
const wakeModelPath = join(fixture.tempRoot, "hey-setta.onnx");
let context = null;
let modelDownloadFixture = null;
let workflowError = null;

try {
  await writeFile(modelPath, "local-model-bytes");
  await writeFile(wakeModelPath, "wake-model-bytes");

  const initialWakeTranscript = "open the release checklist";
  context = await launchLocalVoiceElectron({
    launchArtifactDir: artifactDir,
    scriptedListenerEvents: scriptedWakeEvents(initialWakeTranscript),
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const workspaceId = await ensureWorkspaceOpen(context.client);

  const health = await context.client.evaluate("window.setta.speech.readLocalMacOSVoiceHealth()");
  assertReadyHealth(health);
  const localVoiceCatalog = await context.client.evaluate(
    "window.setta.speech.listLocalMacOSVoices()",
  );
  assertLocalVoiceCatalog(localVoiceCatalog);
  const started = await startCapture(context.client, "capture_local");
  assertStatus(started, "started", "capture_local");
  const finished = await finishCapture(context.client, "capture_local");
  assertCompleted(finished, "capture_local", "local transcript for capture_local");

  const secondStarted = await startCapture(context.client, "capture_cancel");
  assertStatus(secondStarted, "started", "capture_cancel");
  const canceled = await context.client.evaluate(
    'window.setta.speech.cancelLocalMacOSVoiceCapture({ captureSessionId: "capture_cancel" })',
  );
  assertStatus(canceled, "canceled", "capture_cancel");

  const invalidFinish = await finishCapture(context.client, "capture_missing");
  assertFailure(invalidFinish, "invalid_session");
  const emptyStarted = await startCapture(context.client, "capture_empty");
  assertStatus(emptyStarted, "started", "capture_empty");
  const emptyFinish = await finishCapture(context.client, "capture_empty");
  assertFailure(emptyFinish, "no_speech");
  const oversizedStarted = await startCapture(context.client, "capture_too_large", {
    maximumTranscriptCharacters: 8,
  });
  assertStatus(oversizedStarted, "started", "capture_too_large");
  const oversizedFinish = await finishCapture(context.client, "capture_too_large");
  assertFailure(oversizedFinish, "transcript_too_large");
  const durationStarted = await startCapture(context.client, "capture_duration_limit", {
    maximumRecordingSeconds: 1,
  });
  assertStatus(durationStarted, "started", "capture_duration_limit");
  const durationFinish = await finishCapture(context.client, "capture_duration_limit");
  assertFailure(durationFinish, "duration_limit");
  const deniedStart = await startCapture(context.client, "capture_microphone_denied");
  assertFailure(deniedStart, "microphone_permission_denied");
  const revokedStarted = await startCapture(context.client, "capture_microphone_revoked");
  assertStatus(revokedStarted, "started", "capture_microphone_revoked");
  const revokedFinish = await finishCapture(context.client, "capture_microphone_revoked");
  assertFailure(revokedFinish, "microphone_permission_denied");
  const revokedStaleFinish = await finishCapture(context.client, "capture_microphone_revoked");
  assertFailure(revokedStaleFinish, "invalid_session");

  const routedVoiceInput = await submitLocalVoiceThroughMasterOverlay(context.client);
  const source = { conversationId: null, eventId: routedVoiceInput.inputId, speaker: "master" };
  const synthesized = await context.client.evaluate(
    `window.setta.speech.synthesize(${JSON.stringify({
      provider: "local_macos",
      resolvedVoiceId: "marin",
      source,
    })}, "speech-local-success")`,
  );
  assertSynthesized(synthesized, source, "speech-local-success");
  const canceledSynthesis = await cancelLocalSynthesis(context.client, source);
  assertSynthesisCanceled(canceledSynthesis);
  const unavailableSynthesis = await synthesizeUnavailableLocalSpeech(context.client, source);
  assertSynthesisUnavailable(unavailableSynthesis);
  const malformedSynthesis = await synthesizeMalformedLocalSpeech(context.client, source);
  assertMalformedSynthesis(malformedSynthesis);
  const initialAlwaysListening = await readAlwaysListeningSettings(context.client);
  assertAlwaysListeningReady(initialAlwaysListening, false);
  const enabledAlwaysListening = await updateAlwaysListeningSettings(context.client, true);
  assertAlwaysListeningReady(enabledAlwaysListening, true);
  const alwaysListeningInput = await waitForRecordedWakeSpeechInput(
    artifactDir,
    initialWakeTranscript,
  );
  await waitForAlwaysListeningState(context.client, "armed");
  const disabledAlwaysListening = await updateAlwaysListeningSettings(context.client, false);
  assertAlwaysListeningDisabled(disabledAlwaysListening);
  const reenabledAlwaysListening = await updateAlwaysListeningSettings(context.client, true);
  assertAlwaysListeningReady(reenabledAlwaysListening, true);
  const manualArbitration = await exerciseManualCaptureWhileListenerArmed(context.client);
  const playbackSuppression = await exercisePlaybackSuppression(context.client);

  await stopElectronCdpContext(context);
  context = null;

  modelDownloadFixture = await createLocalModelDownloadFixture();
  const missingModelArtifactDir = join(artifactDir, "missing-model-download");
  context = await launchLocalVoiceElectron({
    launchArtifactDir: missingModelArtifactDir,
    modelDownloadSpec: modelDownloadFixture.spec,
    modelSource: "download",
    scriptedListenerEvents: [],
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const missingModelWorkspaceId = await ensureWorkspaceOpen(context.client);
  assertRestartedWorkspace(workspaceId, missingModelWorkspaceId);
  const missingModelSettings = await readAlwaysListeningSettings(context.client);
  assertAlwaysListeningMissingModel(missingModelSettings);
  const idleModelDownload = await readLocalModelDownloadStatus(context.client);
  assertModelDownloadStatus(idleModelDownload, "idle");
  const startedModelDownload = await startLocalModelDownload(context.client);
  assertModelDownloadStatus(startedModelDownload, "downloading");
  const readyModelDownload = await waitForLocalModelDownloadStatus(context.client, "ready");
  const armedAfterModelDownload = await waitForAlwaysListeningState(context.client, "armed");

  await stopElectronCdpContext(context);
  context = null;
  await modelDownloadFixture.close();
  modelDownloadFixture = null;

  const restartArtifactDir = join(artifactDir, "restart-enabled");
  context = await launchLocalVoiceElectron({
    launchArtifactDir: restartArtifactDir,
    scriptedListenerEvents: [],
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const restartedWorkspaceId = await ensureWorkspaceOpen(context.client);
  assertRestartedWorkspace(workspaceId, restartedWorkspaceId);
  const restartedAlwaysListening = await waitForAlwaysListeningState(context.client, "armed");

  await stopElectronCdpContext(context);
  context = null;

  const crashRecoveryArtifactDir = join(artifactDir, "helper-crash-recovery");
  context = await launchLocalVoiceElectron({
    helperMode: "listener_exit_after_start",
    helperExitAfterStartDelayMs: 5_000,
    launchArtifactDir: crashRecoveryArtifactDir,
    scriptedListenerEvents: [],
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await installListenerEventRecorder(context.client);
  const crashRecoveryWorkspaceId = await ensureWorkspaceOpen(context.client);
  assertRestartedWorkspace(workspaceId, crashRecoveryWorkspaceId);
  const crashedAlwaysListening = await waitForRecordedListenerState(
    context.client,
    "engine_failed",
  );
  await writeHelperScript("scripted_listener");
  const recoveredAlwaysListening = await waitForAlwaysListeningState(context.client, "armed");

  await captureScreenshot(context.client, join(artifactDir, "local-macos-voice-capture.png"));
  await writeJson(join(artifactDir, "summary.json"), {
    alwaysListeningInput,
    artifactDir,
    canceledSynthesis,
    deniedStartFailure: deniedStart.failure,
    durationFailure: durationFinish.failure,
    emptyFailure: emptyFinish.failure,
    finishedTranscript: finished.transcript,
    health,
    invalidFinishFailure: invalidFinish.failure,
    initialAlwaysListening,
    localVoiceCatalog,
    malformedSynthesis,
    manualArbitration,
    missingModelRecovery: {
      armedAfterModelDownload,
      idleModelDownload,
      missingModelSettings,
      readyModelDownload,
      startedModelDownload,
    },
    oversizedFailure: oversizedFinish.failure,
    playbackSuppression,
    revokedFinishFailure: revokedFinish.failure,
    revokedStaleFinishFailure: revokedStaleFinish.failure,
    crashedAlwaysListening,
    recoveredAlwaysListening,
    reenabledAlwaysListening,
    restartedAlwaysListening,
    routedVoiceInput,
    synthesized: {
      audioBase64: synthesized.audioBase64,
      resolvedVoiceId: synthesized.resolvedVoiceId,
      source: synthesized.source,
    },
    unavailableSynthesis,
    status: "passed",
  });
} catch (error) {
  workflowError = error;
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  }).catch(() => {});
} finally {
  await stopElectronCdpContext(context).catch((error) => {
    if (workflowError === null) {
      workflowError = error;
    }
  });
  await modelDownloadFixture?.close().catch((error) => {
    if (workflowError === null) {
      workflowError = error;
    }
  });
  await rm(fixture.tempRoot, { force: true, recursive: true });
}

if (workflowError) {
  throw workflowError;
}
console.log(`Electron local macOS voice capture workflow passed: ${artifactDir}`);

function startCapture(client, captureSessionId, limits = {}) {
  return client.evaluate(
    `window.setta.speech.startLocalMacOSVoiceCapture(${JSON.stringify({
      captureSessionId,
      maximumRecordingSeconds: limits.maximumRecordingSeconds ?? 120,
      maximumTranscriptCharacters: limits.maximumTranscriptCharacters ?? 8000,
    })})`,
  );
}

function finishCapture(client, captureSessionId) {
  return client.evaluate(
    `window.setta.speech.finishLocalMacOSVoiceCapture(${JSON.stringify({
      captureSessionId,
    })})`,
  );
}

function readAlwaysListeningSettings(client) {
  return client.evaluate("window.setta.speech.readLocalMacOSVoiceListenerSettings()");
}

function updateAlwaysListeningSettings(client, enabled) {
  return client.evaluate(
    `window.setta.speech.updateLocalMacOSVoiceListenerSettings(${JSON.stringify({ enabled })})`,
  );
}

function readLocalModelDownloadStatus(client) {
  return client.evaluate("window.setta.speech.readLocalMacOSVoiceModelDownload()");
}

function startLocalModelDownload(client) {
  return client.evaluate("window.setta.speech.startLocalMacOSVoiceModelDownload()");
}

async function ensureWorkspaceOpen(client) {
  const initialWorkspaceId = await client.evaluate(workspaceIdExpression());
  if (validWorkspaceId(initialWorkspaceId)) {
    return initialWorkspaceId;
  }
  await clickEnabledButtonByAria(client, "Choose project folder", workflowTimeoutMs);
  return waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => validWorkspaceId(workspaceId),
    workflowTimeoutMs,
  );
}

function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

function validWorkspaceId(workspaceId) {
  return workspaceId !== "" && workspaceId !== "empty";
}

async function launchLocalVoiceElectron({
  helperExitAfterStartDelayMs,
  helperMode = "scripted_listener",
  launchArtifactDir,
  modelDownloadSpec,
  modelSource = "explicit",
  scriptedListenerEvents,
}) {
  await writeHelperScript(helperMode);
  const extraEnv = {
    PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
    SETTA_LOCAL_MACOS_VOICE_HELPER_PATH: helperPath,
    SETTA_LOCAL_MACOS_VOICE_WAKE_MODEL_PATH: wakeModelPath,
    SETTA_LOCAL_MACOS_VOICE_WAKE_MODEL_SHA256: sha256("wake-model-bytes"),
    SETTA_LOCAL_MACOS_VOICE_WAKE_RUNTIME: "onnx",
    SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
  };
  const unsetEnv = ["OPENAI_API_KEY"];
  if (modelSource === "download") {
    if (!modelDownloadSpec) {
      throw new Error("download-model local voice launch requires a model download spec");
    }
    extraEnv.SETTA_E2E_LOCAL_MACOS_VOICE_MODEL_DOWNLOAD_SPEC = JSON.stringify(modelDownloadSpec);
    unsetEnv.push("SETTA_LOCAL_MACOS_VOICE_MODEL_PATH");
    unsetEnv.push("SETTA_LOCAL_MACOS_VOICE_MODEL_SHA256");
  } else {
    extraEnv.SETTA_LOCAL_MACOS_VOICE_MODEL_PATH = modelPath;
    extraEnv.SETTA_LOCAL_MACOS_VOICE_MODEL_SHA256 = sha256("local-model-bytes");
    unsetEnv.push("SETTA_E2E_LOCAL_MACOS_VOICE_MODEL_DOWNLOAD_SPEC");
  }
  if (scriptedListenerEvents === undefined) {
    unsetEnv.push(scriptedListenerEventsEnvironmentVariable);
  } else {
    extraEnv[scriptedListenerEventsEnvironmentVariable] = JSON.stringify(scriptedListenerEvents);
  }
  if (helperExitAfterStartDelayMs === undefined) {
    unsetEnv.push("SETTA_LOCAL_MACOS_VOICE_HELPER_EXIT_AFTER_START_MS");
  } else {
    extraEnv.SETTA_LOCAL_MACOS_VOICE_HELPER_EXIT_AFTER_START_MS = String(
      helperExitAfterStartDelayMs,
    );
  }
  return launchElectronCdpContext({
    artifactDir: launchArtifactDir,
    extraEnv,
    fixture,
    unsetEnv,
    visible: options.visible,
  });
}

async function writeHelperScript(mode) {
  await writeFile(
    helperPath,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(
      helperFixturePath,
    )} ${JSON.stringify(mode)}\n`,
  );
  await chmod(helperPath, 0o755);
}

function scriptedWakeEvents(transcript) {
  return [
    { score: 0.74, timeMs: 960, type: "wake_detected" },
    { timeMs: 1_140, type: "message_speech_started" },
    { timeMs: 2_220, type: "candidate_endpoint_detected" },
    { transcript, type: "utterance_finalized" },
  ];
}

async function createLocalModelDownloadFixture() {
  const bytes = Buffer.from("downloaded local model bytes", "utf8");
  const server = createServer((request, response) => {
    if (request.url !== "/ggml-e2e-download.bin") {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-length": String(bytes.length),
      "content-type": "application/octet-stream",
    });
    response.end(bytes);
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("failed to start local model download fixture");
  }
  return {
    close: () =>
      new Promise((resolvePromise, reject) => {
        server.close((error) => (error ? reject(error) : resolvePromise()));
      }),
    spec: {
      bytes: bytes.length,
      filename: "ggml-e2e-download.bin",
      name: "e2e-download",
      sha256: sha256(bytes),
      url: `http://127.0.0.1:${address.port}/ggml-e2e-download.bin`,
    },
  };
}

async function waitForAlwaysListeningState(client, status) {
  return waitForState(
    client,
    "window.setta.speech.readLocalMacOSVoiceListenerSettings()",
    (settings) =>
      settings?.availability?.status === "ready" &&
      settings.enabled === true &&
      settings.state?.status === status,
    workflowTimeoutMs,
  );
}

async function waitForLocalModelDownloadStatus(client, status) {
  return waitForState(
    client,
    "window.setta.speech.readLocalMacOSVoiceModelDownload()",
    (download) => download?.status === status,
    workflowTimeoutMs,
  );
}

async function installListenerEventRecorder(client) {
  await client.evaluate(`(() => {
    if (globalThis.__settaLocalMacOSVoiceListenerEvents) {
      return;
    }
    const events = [];
    globalThis.__settaLocalMacOSVoiceListenerEvents = events;
    window.setta.speech.onLocalMacOSVoiceListenerChanged?.((event) => {
      events.push(event);
    });
  })()`);
}

async function waitForRecordedListenerState(client, status) {
  return waitForState(
    client,
    `(() => {
      const events = globalThis.__settaLocalMacOSVoiceListenerEvents ?? [];
      return events.find((event) => event?.settings?.state?.status === ${JSON.stringify(
        status,
      )})?.settings ?? null;
    })()`,
    (settings) => settings?.enabled === true && settings.state?.status === status,
    workflowTimeoutMs,
  );
}

async function exerciseManualCaptureWhileListenerArmed(client) {
  await waitForAlwaysListeningState(client, "armed");
  const started = await startCapture(client, "capture_manual_while_listener_armed");
  assertStatus(started, "started", "capture_manual_while_listener_armed");
  const paused = await waitForAlwaysListeningState(client, "paused_for_manual_capture");
  if (paused.state.captureSessionId !== "capture_manual_while_listener_armed") {
    throw new Error(`listener did not reflect manual capture: ${JSON.stringify(paused)}`);
  }
  const finished = await finishCapture(client, "capture_manual_while_listener_armed");
  assertCompleted(
    finished,
    "capture_manual_while_listener_armed",
    "local transcript for capture_manual_while_listener_armed",
  );
  const resumed = await waitForAlwaysListeningState(client, "armed");
  return {
    finishedTranscript: finished.transcript,
    paused,
    resumed,
  };
}

async function exercisePlaybackSuppression(client) {
  await waitForAlwaysListeningState(client, "armed");
  const operationId = "workflow_playback_suppression";
  const paused = await client.evaluate(
    `window.setta.speech.startLocalMacOSVoiceListenerPlayback(${JSON.stringify({ operationId })})`,
  );
  if (paused?.state?.status !== "paused_for_playback" || paused.state.operationId !== operationId) {
    throw new Error(`listener did not pause for playback: ${JSON.stringify(paused)}`);
  }
  const resumed = await client.evaluate(
    `window.setta.speech.finishLocalMacOSVoiceListenerPlayback(${JSON.stringify({ operationId })})`,
  );
  if (resumed?.state?.status !== "armed") {
    throw new Error(`listener did not resume after playback: ${JSON.stringify(resumed)}`);
  }
  return { paused, resumed };
}

function assertRestartedWorkspace(expected, actual) {
  if (actual !== expected) {
    throw new Error(`workspace changed after restart: ${JSON.stringify({ actual, expected })}`);
  }
}

async function waitForRecordedWakeSpeechInput(runArtifactDir, transcript) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < workflowTimeoutMs) {
    const events = await readJsonLinesWhileAppending(join(runArtifactDir, "ipc.jsonl"));
    const starts = events.filter(
      (event) =>
        event.type === "ipc_start" &&
        wakeSpeechSubmissionChannels().includes(event.channel) &&
        event.args?.[0]?.input?.text === transcript,
    );
    const uniqueStarts = Array.from(
      new Map(starts.map((start) => [start.args[0].input.id, start])).values(),
    );
    if (uniqueStarts.length > 1) {
      throw new Error(`wake transcript was submitted more than once: ${uniqueStarts.length}`);
    }
    const completed = completedIPC(uniqueStarts[0], events);
    if (completed) {
      assertWakeSpeechInput(completed, transcript);
      return summarizeWakeSpeechInput(completed);
    }
    await delay(50);
  }
  throw new Error(`timed out waiting for wake transcript ${JSON.stringify(transcript)}`);
}

function wakeSpeechSubmissionChannels() {
  return ["conversation:submit-input", "master:submit-input"];
}

function completedIPC(start, events) {
  if (!start) {
    return null;
  }
  const finish = events.find(
    (event) =>
      event.type === "ipc_finish" && event.channel === start.channel && event.id === start.id,
  );
  return finish
    ? { accepted: finish.result, channel: start.channel, request: start.args[0] }
    : null;
}

function assertWakeSpeechInput(recorded, transcript) {
  const input = recorded.request?.input;
  assertWakeSpeechInputBase(input, transcript, recorded);
  const assertion = wakeSpeechInputAssertion(recorded.channel);
  if (!assertion) {
    throw new Error(`wake speech input channel drifted: ${JSON.stringify(recorded)}`);
  }
  assertion(recorded, input);
}

function wakeSpeechInputAssertion(channel) {
  if (channel === "conversation:submit-input") {
    return assertWakeConversationInput;
  }
  if (channel === "master:submit-input") {
    return assertWakeMasterInput;
  }
  return null;
}

function assertWakeSpeechInputBase(input, transcript, recorded) {
  if (
    input?.text !== transcript ||
    input.modality !== "voice" ||
    typeof input.id !== "string" ||
    input.id === "" ||
    typeof input.submittedAt !== "string" ||
    input.submittedAt === ""
  ) {
    throw new Error(`wake speech input drifted: ${JSON.stringify(recorded)}`);
  }
}

function assertWakeMasterInput(recorded, input) {
  if (input.source !== "shell" || recorded.accepted?.input?.id !== input.id) {
    throw new Error(`wake master input drifted: ${JSON.stringify(recorded)}`);
  }
}

function assertWakeConversationInput(recorded, input) {
  if (
    typeof input.conversationId === "string" &&
    input.conversationId !== "" &&
    typeof input.sourcePaneId === "string" &&
    input.sourcePaneId !== "" &&
    recorded.accepted?.input?.id === input.id
  ) {
    return;
  }
  throw new Error(`wake conversation input drifted: ${JSON.stringify(recorded)}`);
}

function summarizeWakeSpeechInput(recorded) {
  const input = recorded.request.input;
  return {
    channel: recorded.channel,
    conversationId: input.conversationId ?? null,
    inputId: input.id,
    source: input.source ?? null,
    sourcePaneId: input.sourcePaneId ?? null,
    transcript: input.text,
  };
}

async function submitLocalVoiceThroughMasterOverlay(client) {
  await openMasterOverlay(client);
  await clickMasterOverlayVoice(client);
  await waitForState(
    client,
    driverCallExpression("masterOverlayVoiceButtonState"),
    (state) => state.ready && state.label.startsWith("Finish Global master voice request"),
    workflowTimeoutMs,
  );
  await clickMasterOverlayVoice(client);
  const interaction = await waitForState(
    client,
    driverCallExpression("masterOverlayRoutedInteraction"),
    (value) =>
      value.status === "decided" &&
      value.resultKind === "answer_global" &&
      value.transcript.startsWith("local transcript for "),
    workflowTimeoutMs,
  );
  if (
    interaction.decisionText !== "The shell voice request was received." ||
    interaction.transcript !== `local transcript for ${interaction.inputId}`
  ) {
    throw new Error(
      `local master voice input did not route the helper transcript: ${JSON.stringify(interaction)}`,
    );
  }
  return {
    decisionText: interaction.decisionText,
    inputId: interaction.inputId,
    transcript: interaction.transcript,
  };
}

async function openMasterOverlay(client) {
  const state = await client.driver("masterOverlayOpenState");
  if (state.open) {
    return;
  }
  await clickEnabledButtonByAria(client, "Open Ask Setta", workflowTimeoutMs);
  await waitForSelector(client, '[data-testid="master-overlay"]');
}

async function clickMasterOverlayVoice(client) {
  const result = await client.driver("masterOverlayVoiceClick");
  if (!result.clicked) {
    throw new Error("master overlay voice control was not clickable");
  }
}

async function cancelLocalSynthesis(client, source) {
  return client.evaluate(
    `(async () => {
      const promise = window.setta.speech.synthesize(${JSON.stringify({
        provider: "local_macos",
        resolvedVoiceId: "marin",
        source,
      })}, "speech-local-cancel");
      await new Promise((resolve) => setTimeout(resolve, 100));
      await window.setta.speech.cancelSynthesis("speech-local-cancel");
      try {
        await promise;
        return { status: "completed" };
      } catch (error) {
        return {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : "",
          status: "failed",
        };
      }
    })()`,
  );
}

function synthesizeUnavailableLocalSpeech(client, source) {
  return client.evaluate(
    `(async () => {
      try {
        await window.setta.speech.synthesize(${JSON.stringify({
          provider: "local_macos",
          resolvedVoiceId: "marin",
          source,
        })}, "speech-local-unavailable");
        return { status: "completed" };
      } catch (error) {
        return {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : "",
          status: "failed",
        };
      }
    })()`,
  );
}

function synthesizeMalformedLocalSpeech(client, source) {
  return client.evaluate(
    `(async () => {
      try {
        await window.setta.speech.synthesize(${JSON.stringify({
          provider: "local_macos",
          resolvedVoiceId: "marin",
          source,
        })}, "speech-local-malformed_audio");
        return { status: "completed" };
      } catch (error) {
        return {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : "",
          status: "failed",
        };
      }
    })()`,
  );
}

function assertAlwaysListeningReady(settings, enabled) {
  if (
    settings?.availability?.status !== "ready" ||
    settings.enabled !== enabled ||
    !settings.state?.status
  ) {
    throw new Error(`invalid always-listening readiness: ${JSON.stringify(settings)}`);
  }
}

function assertAlwaysListeningDisabled(settings) {
  if (
    settings?.availability?.status !== "ready" ||
    settings.enabled !== false ||
    settings.state?.status !== "disabled"
  ) {
    throw new Error(`invalid disabled always-listening state: ${JSON.stringify(settings)}`);
  }
}

function assertAlwaysListeningMissingModel(settings) {
  if (
    settings?.availability?.status !== "unavailable" ||
    settings.availability.setupAction !== "download_local_macos_voice_model" ||
    settings.enabled !== true ||
    settings.state?.status !== "local_voice_not_ready" ||
    !settings.state.message.includes("model")
  ) {
    throw new Error(`invalid missing-model always-listening state: ${JSON.stringify(settings)}`);
  }
}

function assertModelDownloadStatus(download, status) {
  if (
    download?.status !== status ||
    download.provider !== "local_macos" ||
    download.modelName !== "e2e-download" ||
    download.bytesTotal !== Buffer.byteLength("downloaded local model bytes", "utf8") ||
    !String(download.modelPath ?? "").endsWith("/ggml-e2e-download.bin")
  ) {
    throw new Error(`invalid local model download ${status} status: ${JSON.stringify(download)}`);
  }
}

function assertReadyHealth(health) {
  if (
    health?.status !== "ready" ||
    health.provider !== "local_macos" ||
    health.helperPath !== helperPath ||
    health.modelPath !== modelPath ||
    health.modelSHA256 !== sha256("local-model-bytes")
  ) {
    throw new Error(`invalid local macOS voice health: ${JSON.stringify(health)}`);
  }
}

function assertLocalVoiceCatalog(catalog) {
  const want = ["com.apple.voice.compact.en-US.Samantha", "com.apple.voice.compact.en-US.Alex"];
  if (
    catalog?.provider !== "local_macos" ||
    catalog.version !== "fixture-local-voices" ||
    JSON.stringify(catalog.voiceIds) !== JSON.stringify(want)
  ) {
    throw new Error(`invalid local macOS voice catalog: ${JSON.stringify(catalog)}`);
  }
}

function assertStatus(result, status, captureSessionId) {
  if (result?.status !== status || result.captureSessionId !== captureSessionId) {
    throw new Error(`invalid local macOS voice ${status} result: ${JSON.stringify(result)}`);
  }
}

function assertCompleted(result, captureSessionId, transcript) {
  if (
    result?.status !== "completed" ||
    result.captureSessionId !== captureSessionId ||
    result.transcript !== transcript
  ) {
    throw new Error(`invalid local macOS voice finish result: ${JSON.stringify(result)}`);
  }
}

function assertFailure(result, code) {
  if (result?.status !== "failed" || result.failure?.code !== code) {
    throw new Error(`invalid local macOS voice failure result: ${JSON.stringify(result)}`);
  }
}

function assertSynthesized(audio, source, operationId) {
  if (!synthesizedAudioMatches(audio, source, operationId)) {
    throw new Error(`invalid local macOS synthesis result: ${JSON.stringify(audio)}`);
  }
}

function synthesizedAudioMatches(audio, source, operationId) {
  return (
    audio?.audioBase64 === expectedSynthesisAudioBase64(operationId) &&
    audio.format === "wav" &&
    audio.mediaType === "audio/wav" &&
    audio.resolvedVoiceId === "marin" &&
    synthesizedSourceMatches(audio.source, source)
  );
}

function synthesizedSourceMatches(actual, expected) {
  return (
    actual?.speaker === expected.speaker &&
    actual.eventId === expected.eventId &&
    actual.conversationId === expected.conversationId
  );
}

function expectedSynthesisAudioBase64(operationId) {
  void operationId;
  return "UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==";
}

function assertSynthesisCanceled(result) {
  if (
    result?.status !== "failed" ||
    result.name !== "Error" ||
    !result.message.includes("AbortError: Speech synthesis was stopped.")
  ) {
    throw new Error(`invalid local macOS synthesis cancellation: ${JSON.stringify(result)}`);
  }
}

function assertSynthesisUnavailable(result) {
  if (
    result?.status !== "failed" ||
    result.name !== "Error" ||
    !result.message.includes("system speech synthesis is unavailable")
  ) {
    throw new Error(`invalid local macOS synthesis unavailable failure: ${JSON.stringify(result)}`);
  }
}

function assertMalformedSynthesis(result) {
  if (
    result?.status !== "failed" ||
    result.name !== "Error" ||
    !result.message.includes("Local macOS speech output returned invalid audio.")
  ) {
    throw new Error(`invalid local macOS malformed synthesis failure: ${JSON.stringify(result)}`);
  }
}

function delay(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
