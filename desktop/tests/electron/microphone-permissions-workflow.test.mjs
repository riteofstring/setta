#!/usr/bin/env node
/* global console */

import { rm } from "node:fs/promises";
import { join } from "node:path";
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
const workflowName = "microphone-permissions";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/microphone-permissions-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
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
    electronArgs: ["--use-fake-device-for-media-stream"],
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');

  const result = await context.client.driver("microphonePermissionsProbe");
  assertMediaPermissionResult(result);
  await captureScreenshot(context.client, join(artifactDir, "microphone-permissions.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    result,
    status: "passed",
  });
  console.log(`Electron microphone permission workflow passed: ${artifactDir}`);
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
  await rm(fixture.tempRoot, { force: true, recursive: true });
}

function assertMediaPermissionResult(result) {
  assertMediaCaptureAvailable(result);
  assertAudioGranted(result);
  assertCaptureDenied("video", result, result.video);
  assertCaptureDenied("audio-and-video", result, result.audioAndVideo);
}

function assertMediaCaptureAvailable(result) {
  if (!result?.isSecureContext || !result.mediaDevicesAvailable) {
    throw new Error(
      `main renderer does not expose secure media capture: ${JSON.stringify(result)}`,
    );
  }
}

function assertAudioGranted(result) {
  if (!result.audio.granted || result.audio.audioTracks !== 1 || result.audio.videoTracks !== 0) {
    throw new Error(
      `trusted main renderer audio capture was not granted: ${JSON.stringify(result)}`,
    );
  }
}

function assertCaptureDenied(name, result, denied) {
  if (denied.granted || denied.errorName !== "NotAllowedError") {
    throw new Error(`${name} capture did not fail with NotAllowedError: ${JSON.stringify(result)}`);
  }
}
