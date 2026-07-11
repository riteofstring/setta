#!/usr/bin/env node
/* global console */

import { readdir, readFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";
import process from "node:process";
import { URL } from "node:url";

import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  dispatchKeyEvent,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  reloadPage,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  clickEasyButtonStop,
  easyButtonStateExpression,
  easyButtonStateSettled,
  ensureWorkspaceOpen,
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

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "speech-capture";
const preservedDraft = "keep this typed draft";
const completedTranscript = "  easy run phase2 steering workflow  ";
const completedRequest = completedTranscript.trim();
const completedSteeringTranscript = "  steer easy run phase2  ";
const completedSteering = completedSteeringTranscript.trim();
const steeredCurrentFocus =
  "Complete the Easy Button phase 2 workflow while following the accepted steering direction.";
const narratorFailureTranscript = "  easy run narrator failure workflow  ";
const narratorFailureRequest = narratorFailureTranscript.trim();
const partialOutcomeTranscript = "  Keep the accepted work running despite stale narration.  ";
const partialOutcomeSteering = partialOutcomeTranscript.trim();
const partialOutcomeMessage = "Instruction sent, but Current focus could not be updated.";
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
const fixture = await createElectronFixture(workflowName);
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
  await ensureWorkspaceOpen(context.client);
  const workspaceId = await context.client.evaluate(workspaceIdExpression());
  await openEasyButtonFromShortcut(context.client);

  const configured = await waitForCaptureState(
    context.client,
    (state) =>
      state.capture === "off" &&
      state.speech === "configured" &&
      state.buttonAriaLabel === "Start voice request",
  );
  assertRestingCapture(configured);

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
  await completeSpeechCapture(context.client, {
    draft: preservedDraft,
    finishLabel: "Finish voice steering",
    runWorking: true,
    startLabel: "Start voice steering",
    transcript: completedSteeringTranscript,
  });
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
  await clickEasyButtonStop(context.client);
  await waitForEasyButtonTerminal(context.client, narratorFailureRequest);

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

  provider.assertHealthy();
  assertProviderOperationCount(provider, 5);
  await stopElectronCdpContext(context);
  context = null;
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    captureStates: ["requesting-permission", "connecting", "listening", "committing", "failed"],
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
  await clickEnabledButtonByAria(client, finishLabel);
  await waitForCaptureState(
    client,
    (state) => state.capture === "committing" && state.fixture.commitCount === 1,
  );
  await callBrowserFixture(client, "emitCompleted", transcript);
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

function assertProviderOperationCount(providerFixture, expected) {
  if (
    providerFixture.requests.length !== expected ||
    providerFixture.requests.some((request) => request.path !== "/v1/realtime/client_secrets")
  ) {
    throw new Error("speech capture workflow issued unexpected provider operations");
  }
}

async function assertNoSensitiveSpeechArtifacts(root, providerFixture) {
  const forbidden = [
    ["permanent speech key", providerFixture.apiKey],
    ["Realtime client secret", providerFixture.clientSecret],
    ["generated audio base64", providerFixture.audioBase64],
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
