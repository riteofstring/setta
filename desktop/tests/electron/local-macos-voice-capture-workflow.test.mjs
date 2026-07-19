#!/usr/bin/env node
/* global console */

import { createHash } from "node:crypto";
import { chmod, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "local-macos-voice-capture";
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
      SETTA_LOCAL_MACOS_VOICE_HELPER_PATH: helperPath,
      SETTA_LOCAL_MACOS_VOICE_MODEL_PATH: modelPath,
      SETTA_LOCAL_MACOS_VOICE_MODEL_SHA256: sha256("local-model-bytes"),
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');

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

  await captureScreenshot(context.client, join(artifactDir, "local-macos-voice-capture.png"));
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    finishedTranscript: finished.transcript,
    health,
    invalidFinishFailure: invalidFinish.failure,
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

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
