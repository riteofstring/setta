#!/usr/bin/env node
/* global console */

import { createHash } from "node:crypto";
import { chmod, rm, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
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
import { readJsonLinesWhileAppending } from "./topic-conversation-master-overlay-assertions.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "folderless-conversation-local-voice";
const workflowTimeoutMs = 30_000;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const helperFixturePath = resolve(
  scriptDir,
  "../../src/main/test-fixtures/local-macos-voice-helper-fixture.mjs",
);
const answerTranscript = "what can you help with?";
const resourceTranscript = "Inspect the repository files.";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/folderless-conversation-local-voice-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (process.platform !== "darwin") {
  console.log("Electron folderless local macOS voice workflow skipped: provider is macOS-only");
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
      SETTA_E2E_LOCAL_MACOS_VOICE_TRANSCRIPTS: JSON.stringify([
        answerTranscript,
        resourceTranscript,
      ]),
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
      SETTA_LOCAL_MACOS_VOICE_HELPER_PATH: helperPath,
      SETTA_LOCAL_MACOS_VOICE_MODEL_PATH: modelPath,
      SETTA_LOCAL_MACOS_VOICE_MODEL_SHA256: sha256("local-model-bytes"),
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const initialShell = await waitForNoSelectedFolder(context.client);
  const health = await context.client.evaluate("window.setta.speech.readLocalMacOSVoiceHealth()");
  assertReadyHealth(health);

  const folderlessConversation = await context.client.driver(
    "appPaneLayoutCreateFolderlessConversationFromMaster",
  );
  assertDriverPassed(folderlessConversation, "folderless conversation creation");
  const { conversationId } = folderlessConversation;
  const ready = await waitForFolderlessVoiceReady(context.client, conversationId);
  assertNoFolderPickerIPC(await readIPCEvents(artifactDir), "before voice capture");

  const answered = await captureFolderlessVoice({
    client: context.client,
    conversationId,
    expectedFolderResourceRequest: false,
    expectedStartCount: 1,
    transcript: answerTranscript,
  });
  const resourceRequested = await captureFolderlessVoice({
    client: context.client,
    conversationId,
    expectedFolderResourceRequest: true,
    expectedStartCount: 2,
    transcript: resourceTranscript,
  });
  assertNoFolderPickerIPC(await readIPCEvents(artifactDir), "after routed folder request");

  await captureScreenshot(context.client, join(artifactDir, "folderless-local-voice.png"));
  await writeJson(join(artifactDir, "summary.json"), {
    answered,
    artifactDir,
    folderlessConversation,
    health,
    initialShell,
    ready,
    resourceRequested,
    status: "passed",
  });
} catch (error) {
  workflowError = error;
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      shell: await safeDriver(context.client, "appPaneLayoutShellState"),
      surfaces: await safeDriver(context.client, "topicConversationSurfaceStates"),
    }).catch(() => {});
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
console.log(`Electron folderless local macOS voice workflow passed: ${artifactDir}`);

async function waitForNoSelectedFolder(client) {
  return waitForState(
    client,
    driverCallExpression("appPaneLayoutShellState"),
    (state) => state.ready && state.workspaceId === "empty" && state.masterPaneCount === 1,
    workflowTimeoutMs,
  );
}

async function waitForFolderlessVoiceReady(client, conversationId) {
  return waitForState(
    client,
    driverCallExpression("appPaneLayoutFolderlessConversationVoiceState", { conversationId }),
    (state) =>
      state.status === "passed" &&
      state.workspaceLayoutId === "empty" &&
      state.workspaceId === null &&
      state.inputAvailable &&
      state.voiceControlAvailable &&
      state.voiceControlLabel === "Start a voice request for this conversation" &&
      !state.folderResourceRequestPresent,
    workflowTimeoutMs,
  );
}

async function captureFolderlessVoice({
  client,
  conversationId,
  expectedFolderResourceRequest,
  expectedStartCount,
  transcript,
}) {
  const started = await client.driver("appPaneLayoutStartFolderlessConversationVoice", {
    conversationId,
  });
  assertClicked(started, `start folderless voice capture: ${transcript}`);
  const recording = await waitForState(
    client,
    driverCallExpression("appPaneLayoutFolderlessConversationVoiceState", { conversationId }),
    (state) =>
      state.captureState === "recording" &&
      state.captureScope === "this_pane" &&
      state.voiceControlAvailable &&
      state.voiceControlLabel === "Finish this voice request",
    workflowTimeoutMs,
  );
  await waitForLocalCaptureStart(artifactDir, expectedStartCount);
  assertNoFolderPickerIPC(await readIPCEvents(artifactDir), `while recording: ${transcript}`);

  const finished = await client.driver("appPaneLayoutStartFolderlessConversationVoice", {
    conversationId,
  });
  assertClicked(finished, `finish folderless voice capture: ${transcript}`);
  const submitted = await waitForConversationVoiceInput({
    artifactDir,
    conversationId,
    text: transcript,
  });
  const routed = await waitForState(
    client,
    driverCallExpression("appPaneLayoutFolderlessConversationVoiceState", { conversationId }),
    (state) =>
      state.status === "passed" &&
      state.workspaceLayoutId === "empty" &&
      state.workspaceId === null &&
      state.captureState !== "failed" &&
      state.inputAvailable &&
      state.folderResourceRequestPresent === expectedFolderResourceRequest &&
      !state.speechActivityText.includes("could not finish") &&
      (expectedFolderResourceRequest
        ? state.responseText === ""
        : state.responseText.includes("I can answer questions here")),
    workflowTimeoutMs,
  );
  return { recording, routed, submitted };
}

async function waitForLocalCaptureStart(artifactDir, expectedCount) {
  return waitForIPCEvent(
    artifactDir,
    (events) =>
      events.filter(
        (event) =>
          event.type === "ipc_start" && event.channel === "speech:start-local-macos-voice-capture",
      ).length >= expectedCount,
    `local macOS capture start count ${expectedCount}`,
  );
}

async function waitForConversationVoiceInput({ artifactDir, conversationId, text }) {
  return waitForIPCEvent(
    artifactDir,
    (events) => completedConversationVoiceInput(events, { conversationId, text }),
    `conversation voice input ${text}`,
  );
}

function completedConversationVoiceInput(events, { conversationId, text }) {
  for (const start of uniqueConversationVoiceInputStarts(events, { conversationId, text })) {
    const finish = conversationInputFinishForStart(events, start);
    if (!finish) {
      continue;
    }
    const waitState = conversationInputWaitStateForStart(events, conversationId, start);
    assertFolderlessInputWaitState(waitState, start);
    return {
      accepted: finish.result,
      request: start.args[0],
      waitState: waitState?.args?.[0] ?? null,
    };
  }
  return null;
}

function uniqueConversationVoiceInputStarts(events, { conversationId, text }) {
  const starts = events.filter((event) =>
    conversationVoiceInputStartMatches(event, { conversationId, text }),
  );
  return Array.from(new Map(starts.map((event) => [event.args[0].input.id, event])).values());
}

function conversationVoiceInputStartMatches(event, { conversationId, text }) {
  const input = event.args?.[0]?.input;
  return (
    event.type === "ipc_start" &&
    event.channel === "conversation:submit-input" &&
    input?.conversationId === conversationId &&
    input.modality === "voice" &&
    input.text === text
  );
}

function conversationInputFinishForStart(events, start) {
  return events.find(
    (event) =>
      event.type === "ipc_finish" &&
      event.channel === "conversation:submit-input" &&
      event.id === start.id,
  );
}

function conversationInputWaitStateForStart(events, conversationId, start) {
  const inputId = start.args[0].input.id;
  return events.find(
    (event) =>
      event.type === "ipc_start" &&
      event.channel === "conversation:wait-input-state" &&
      event.args?.[0]?.conversationId === conversationId &&
      event.args[0].inputId === inputId,
  );
}

function assertFolderlessInputWaitState(waitState, start) {
  if (waitState?.args?.[0]?.workspaceId === null) {
    return;
  }
  throw new Error(
    `folderless voice waited with a workspace: ${JSON.stringify({ start, waitState })}`,
  );
}

async function waitForIPCEvent(artifactDir, ready, description) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < workflowTimeoutMs) {
    const events = await readIPCEvents(artifactDir);
    const result = ready(events);
    if (result) {
      return result;
    }
    await delay(50);
  }
  throw new Error(`timed out waiting for ${description}`);
}

function readIPCEvents(artifactDir) {
  return readJsonLinesWhileAppending(join(artifactDir, "ipc.jsonl"));
}

function assertReadyHealth(health) {
  if (health?.status !== "ready") {
    throw new Error(`local macOS voice health was not ready: ${JSON.stringify(health)}`);
  }
}

function assertDriverPassed(result, description) {
  if (result?.status !== "passed") {
    throw new Error(`${description} failed: ${JSON.stringify(result)}`);
  }
}

function assertClicked(result, description) {
  if (!result?.clicked) {
    throw new Error(`${description} did not click: ${JSON.stringify(result)}`);
  }
}

function assertNoFolderPickerIPC(events, description) {
  const opens = events.filter(
    (event) => event.type === "ipc_start" && event.channel === "workspace:open-local-folder",
  );
  if (opens.length > 0) {
    throw new Error(`${description} opened the folder picker: ${JSON.stringify(opens)}`);
  }
}

async function safeDriver(client, method) {
  try {
    return await client.driver(method, {});
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}
