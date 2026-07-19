#!/usr/bin/env node
/* global console */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { chmod, rm, writeFile } from "node:fs/promises";
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

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "local-macos-voice-capture";
const workflowTimeoutMs = 30_000;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const helperFixturePath = resolve(
  scriptDir,
  "../../src/main/test-fixtures/local-macos-voice-helper-fixture.mjs",
);

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
let context = null;
let workflowError = null;

try {
  await writeFile(
    helperPath,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(helperFixturePath)}\n`,
  );
  await chmod(helperPath, 0o755);
  await writeFile(modelPath, "local-model-bytes");

  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_LOCAL_MACOS_VOICE_HELPER_PATH: helperPath,
      SETTA_LOCAL_MACOS_VOICE_MODEL_PATH: modelPath,
      SETTA_LOCAL_MACOS_VOICE_MODEL_SHA256: sha256("local-model-bytes"),
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await ensureWorkspaceOpen(context.client);

  const health = await context.client.evaluate("window.setta.speech.readLocalMacOSVoiceHealth()");
  assertReadyHealth(health);
  const started = await startCapture(context.client, "capture_local");
  assertStatus(started, "started", "capture_local");
  const finished = await context.client.evaluate(
    'window.setta.speech.finishLocalMacOSVoiceCapture({ captureSessionId: "capture_local" })',
  );
  assertCompleted(finished, "capture_local", "local transcript for capture_local");

  const secondStarted = await startCapture(context.client, "capture_cancel");
  assertStatus(secondStarted, "started", "capture_cancel");
  const canceled = await context.client.evaluate(
    'window.setta.speech.cancelLocalMacOSVoiceCapture({ captureSessionId: "capture_cancel" })',
  );
  assertStatus(canceled, "canceled", "capture_cancel");

  const invalidFinish = await context.client.evaluate(
    'window.setta.speech.finishLocalMacOSVoiceCapture({ captureSessionId: "capture_missing" })',
  );
  assertFailure(invalidFinish, "invalid_session");

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

  await captureScreenshot(context.client, join(artifactDir, "local-macos-voice-capture.png"));
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    canceledSynthesis,
    finishedTranscript: finished.transcript,
    health,
    invalidFinishFailure: invalidFinish.failure,
    routedVoiceInput,
    synthesized: {
      audioBase64: synthesized.audioBase64,
      resolvedVoiceId: synthesized.resolvedVoiceId,
      source: synthesized.source,
    },
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
  await rm(fixture.tempRoot, { force: true, recursive: true });
}

if (workflowError) {
  throw workflowError;
}
console.log(`Electron local macOS voice capture workflow passed: ${artifactDir}`);

function startCapture(client, captureSessionId) {
  return client.evaluate(
    `window.setta.speech.startLocalMacOSVoiceCapture(${JSON.stringify({
      captureSessionId,
      maximumRecordingSeconds: 120,
      maximumTranscriptCharacters: 8000,
    })})`,
  );
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
  return Buffer.from(`local speech for ${operationId}`, "utf8").toString("base64");
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

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
