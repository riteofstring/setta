#!/usr/bin/env node
/* global console */

import { createHash } from "node:crypto";
import { chmod, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
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
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "director-command-center-local-voice";
const workflowTimeoutMs = 30_000;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const helperFixturePath = resolve(
  scriptDir,
  "../../src/main/test-fixtures/local-macos-voice-helper-fixture.mjs",
);

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/director-command-center-local-voice-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (process.platform !== "darwin") {
  console.log("Electron Director local voice workflow skipped: provider is macOS-only");
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
const helperPath = join(fixture.tempRoot, "director-local-voice-helper");
const modelPath = join(fixture.tempRoot, "ggml-base.en.bin");
let context = null;

try {
  await writeFile(
    helperPath,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(helperFixturePath)}\n`,
  );
  await chmod(helperPath, 0o755);
  await writeFile(modelPath, "director-local-model-bytes");

  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
      SETTA_LOCAL_MACOS_VOICE_HELPER_PATH: helperPath,
      SETTA_LOCAL_MACOS_VOICE_MODEL_PATH: modelPath,
      SETTA_LOCAL_MACOS_VOICE_MODEL_SHA256: sha256("director-local-model-bytes"),
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="director-command-center-shell"]');

  const ready = await waitForVoiceState(
    context.client,
    (state) => state.controlLabel === "Start voice request" && state.voiceState === "idle",
  );
  await clickVoiceControl(context.client);
  const recording = await waitForVoiceState(
    context.client,
    (state) => state.controlLabel === "Finish voice request" && state.voiceState === "recording",
  );
  await clickVoiceControl(context.client);
  const submitted = await waitForVoiceState(
    context.client,
    (state) =>
      state.voiceState === "submitted" &&
      state.status.includes("The Director received the voice request."),
  );
  const snapshot = await context.client.evaluate("window.setta.director.readSnapshot()");
  if (snapshot.workstreams.length !== 0) {
    throw new Error(
      `answer-directly voice request unexpectedly created work: ${JSON.stringify(snapshot)}`,
    );
  }

  await captureScreenshot(context.client, join(artifactDir, "director-local-voice.png"));
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    ready,
    recording,
    status: "passed",
    submitted,
  });
  console.log(`Electron Director local voice workflow passed: ${artifactDir}`);
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

function waitForVoiceState(client, ready) {
  return waitForState(client, voiceStateExpression(), ready, workflowTimeoutMs);
}

function voiceStateExpression() {
  return `(() => {
    const composer = document.querySelector(".director-composer");
    const control = document.querySelector(".director-composer-voice-button");
    return {
      controlLabel: control?.getAttribute("aria-label") ?? "",
      status: document.querySelector(".director-composer-voice-status")?.textContent?.trim() ?? "",
      voiceState: composer?.getAttribute("data-voice-state") ?? ""
    };
  })()`;
}

async function clickVoiceControl(client) {
  const clicked = await client.evaluate(`(() => {
    const button = document.querySelector(".director-composer-voice-button");
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error("Director voice control was unavailable");
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
