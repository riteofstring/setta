#!/usr/bin/env node
/* global console */

import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  readLocalRuntimeAccess,
  reloadPage,
  repoRoot,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  finalizeLiveOpenAIArtifacts,
  redactLiveOpenAIError,
} from "./instant-voice-capture-live-openai-artifacts.mjs";
import {
  disconnectOpenAIVoiceCredentialThroughSettings,
  openOpenAIVoiceCredentialSettings,
  rejectOpenAIVoiceCredentialReplacementThroughSettings,
  replaceOpenAIVoiceCredentialThroughSettings,
  saveOpenAIVoiceCredentialThroughSettings,
  waitForOpenAIVoiceCredentialState,
} from "./speech-credential-byok-workflow.mjs";
import { startSpeechTranscriptionProviderFixture } from "./speech-transcription-provider-fixture.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "global-speech-session";
const workflowTimeoutMs = 30_000;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/global-speech-session-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
const firstLaunchDir = join(artifactDir, "first-launch");
const secondLaunchDir = join(artifactDir, "second-launch");
const thirdLaunchDir = join(artifactDir, "third-launch-after-removal");
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const provider = await startSpeechTranscriptionProviderFixture();
let context = null;
let remoteRuntime = null;
let credentialSetup;
let rejectedReplacement;
let successfulReplacement;
let disconnectResult;
let firstAcceptedInput;
let secondAcceptedInput;
let firstMasterVoiceSelection;
let secondMasterVoiceSelection;
let initialTranscriptionSession;
let previousCredentialTranscriptionSession;
let replacementTranscriptionSession;
let reloadedTranscriptionSession;
let switchedBackTranscriptionSession;
let restoredTranscriptionSession;
let workflowError = null;
const runtimeDeviceTokens = [];
const localRuntimeAccesses = [];
const replacementCredential = provider.createCredential("replacement");
const rejectedCandidateAPIKey = provider.createRejectedAPIKey("rejected");

try {
  context = await launchElectronCdpContext({
    artifactDir: firstLaunchDir,
    extraEnv: {
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: provider.baseURL,
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const workspaceId = await ensureWorkspaceOpen(context.client);
  const firstLocalRuntimeAccess = await readLocalRuntimeAccess(fixture.appDataDir);
  localRuntimeAccesses.push(firstLocalRuntimeAccess);
  runtimeDeviceTokens.push(firstLocalRuntimeAccess.deviceToken);

  const initialCapabilities = await context.client.evaluate(
    "window.setta.speech.readCapabilities()",
  );
  assertUnconfiguredCapabilities(initialCapabilities);
  credentialSetup = await saveOpenAIVoiceCredentialThroughSettings(context.client, provider.apiKey);
  assertProviderCredentialRequests(provider.requests, [credentialRequest("initial", false)]);

  const capabilities = await context.client.evaluate("window.setta.speech.readCapabilities()");
  assertConfiguredCapabilities(capabilities);
  firstMasterVoiceSelection = await context.client.evaluate(
    "window.setta.speech.readMasterVoiceSelection()",
  );
  assertMasterVoiceSelection(firstMasterVoiceSelection);
  initialTranscriptionSession = await context.client.evaluate(
    "window.setta.speech.createTranscriptionSession()",
  );
  assertTranscriptionSession(initialTranscriptionSession, provider.clientSecret);
  const easyButtonPaneCount = await context.client.evaluate(
    "document.querySelectorAll('[data-testid=\"easy-button-surface\"]').length",
  );
  if (easyButtonPaneCount > 1) {
    throw new Error(
      `global transcription session expected at most 1 Easy Button pane, got ${easyButtonPaneCount}`,
    );
  }
  const masterInputRequest = voiceMasterInputRequest();
  firstAcceptedInput = await submitMasterInput(context.client, masterInputRequest);
  const duplicate = await submitMasterInput(context.client, masterInputRequest);
  assertIdempotentMasterInput(firstAcceptedInput, duplicate, masterInputRequest.input);
  await assertChangedMasterInputConflicts(context.client, masterInputRequest);

  rejectedReplacement = await rejectOpenAIVoiceCredentialReplacementThroughSettings(
    context.client,
    rejectedCandidateAPIKey,
  );
  assertRejectedReplacement(rejectedReplacement);
  previousCredentialTranscriptionSession = await context.client.evaluate(
    "window.setta.speech.createTranscriptionSession()",
  );
  assertTranscriptionSession(previousCredentialTranscriptionSession, provider.clientSecret);

  successfulReplacement = await replaceOpenAIVoiceCredentialThroughSettings(
    context.client,
    replacementCredential.apiKey,
  );
  replacementTranscriptionSession = await context.client.evaluate(
    "window.setta.speech.createTranscriptionSession()",
  );
  assertTranscriptionSession(replacementTranscriptionSession, replacementCredential.clientSecret);
  await assertConfiguredCredentialSettings(context.client);

  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await assertConfiguredCredentialSettings(context.client);
  const reloadedCapabilities = await context.client.evaluate(
    "window.setta.speech.readCapabilities()",
  );
  assertConfiguredCapabilities(reloadedCapabilities);
  reloadedTranscriptionSession = await context.client.evaluate(
    "window.setta.speech.createTranscriptionSession()",
  );
  assertTranscriptionSession(reloadedTranscriptionSession, replacementCredential.clientSecret);

  const runtimeSwitch = await exerciseRuntimeSwitchIsolation(
    context.client,
    firstLocalRuntimeAccess,
  );
  switchedBackTranscriptionSession = await context.client.evaluate(
    "window.setta.speech.createTranscriptionSession()",
  );
  assertTranscriptionSession(switchedBackTranscriptionSession, replacementCredential.clientSecret);

  provider.assertHealthy();
  assertProviderCredentialRequests(provider.requests, [
    credentialRequest("initial", false),
    credentialRequest("initial", false),
    credentialRequest(null, true),
    credentialRequest("initial", false),
    credentialRequest("replacement", false),
    credentialRequest("replacement", false),
    credentialRequest("replacement", false),
    credentialRequest("replacement", false),
  ]);

  await captureScreenshot(context.client, join(firstLaunchDir, "global-speech-session.png"));
  await stopElectronCdpContext(context);
  context = null;

  context = await launchElectronCdpContext({
    artifactDir: secondLaunchDir,
    extraEnv: {
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: provider.baseURL,
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const secondLocalRuntimeAccess = await readLocalRuntimeAccess(fixture.appDataDir);
  localRuntimeAccesses.push(secondLocalRuntimeAccess);
  runtimeDeviceTokens.push(secondLocalRuntimeAccess.deviceToken);
  assertLocalRuntimeReplacement(firstLocalRuntimeAccess, secondLocalRuntimeAccess);
  const restoredCapabilities = await context.client.evaluate(
    "window.setta.speech.readCapabilities()",
  );
  assertConfiguredCapabilities(restoredCapabilities);
  await assertConfiguredCredentialSettings(context.client);
  secondMasterVoiceSelection = await context.client.evaluate(
    "window.setta.speech.readMasterVoiceSelection()",
  );
  assertMasterVoiceSelection(secondMasterVoiceSelection);
  if (JSON.stringify(secondMasterVoiceSelection) !== JSON.stringify(firstMasterVoiceSelection)) {
    throw new Error(
      `master voice selection changed across restart: ${JSON.stringify({ firstMasterVoiceSelection, secondMasterVoiceSelection })}`,
    );
  }
  restoredTranscriptionSession = await context.client.evaluate(
    "window.setta.speech.createTranscriptionSession()",
  );
  assertTranscriptionSession(restoredTranscriptionSession, replacementCredential.clientSecret);
  secondAcceptedInput = await submitMasterInput(context.client, masterInputRequest);
  assertIdempotentMasterInput(firstAcceptedInput, secondAcceptedInput, masterInputRequest.input);
  disconnectResult = await disconnectOpenAIVoiceCredentialThroughSettings(context.client);
  const removedCapabilities = await context.client.evaluate(
    "window.setta.speech.readCapabilities()",
  );
  assertUnconfiguredCapabilities(removedCapabilities);
  await assertSpeechNotConfigured(context.client, "removed credential");
  assertProviderCredentialRequests(provider.requests, [
    credentialRequest("initial", false),
    credentialRequest("initial", false),
    credentialRequest(null, true),
    credentialRequest("initial", false),
    credentialRequest("replacement", false),
    credentialRequest("replacement", false),
    credentialRequest("replacement", false),
    credentialRequest("replacement", false),
    credentialRequest("replacement", false),
  ]);
  await captureScreenshot(context.client, join(secondLaunchDir, "master-input-restored.png"));
  await stopElectronCdpContext(context);
  context = null;

  context = await launchElectronCdpContext({
    artifactDir: thirdLaunchDir,
    extraEnv: {
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: provider.baseURL,
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const thirdLocalRuntimeAccess = await readLocalRuntimeAccess(fixture.appDataDir);
  localRuntimeAccesses.push(thirdLocalRuntimeAccess);
  runtimeDeviceTokens.push(thirdLocalRuntimeAccess.deviceToken);
  const removedAfterRestartCapabilities = await context.client.evaluate(
    "window.setta.speech.readCapabilities()",
  );
  assertUnconfiguredCapabilities(removedAfterRestartCapabilities);
  await assertNotConfiguredCredentialSettings(context.client);
  await assertSpeechNotConfigured(context.client, "removed credential restart");
  await captureScreenshot(context.client, join(thirdLaunchDir, "removed-after-restart.png"));
  await stopElectronCdpContext(context);
  context = null;

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    credentialSetup,
    disconnectResult,
    easyButtonPaneCount,
    localRuntimeReplaced: localRuntimeAccesses.length >= 2,
    masterInputAcceptedAt: firstAcceptedInput.acceptedAt,
    masterInputSequence: firstAcceptedInput.sequence,
    providerCredentialRequests: providerRequestSummary(provider.requests),
    providerOperationCount: provider.requests.length,
    rejectedReplacement,
    replacementSetup: successfulReplacement,
    restartPreservedMasterInput: firstAcceptedInput.acceptedAt === secondAcceptedInput.acceptedAt,
    restartPreservedMasterVoice: firstMasterVoiceSelection,
    runtimeSwitch,
    restoredTranscriptionModel: restoredTranscriptionSession.transcriptionModel,
    status: "passed",
    workspaceId,
  });
} catch (error) {
  workflowError = error;
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
  }
  const redactedError = redactLiveOpenAIError(error, artifactPrivacyMarkers());
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: redactedError instanceof Error ? redactedError.message : String(redactedError),
    status: "failed",
  }).catch(() => {});
}
await finalizeLiveOpenAIArtifacts({
  artifactDir,
  cleanupFinalizers: [
    async () => {
      await rm(fixture.tempRoot, { force: true, recursive: true });
    },
  ],
  description: "fake OpenAI speech or runtime credential",
  finalizers: [
    async () => {
      const currentContext = context;
      context = null;
      await stopElectronCdpContext(currentContext);
    },
    async () => {
      await stopRemoteRuntime(remoteRuntime);
      remoteRuntime = null;
    },
    async () => {
      await provider.close();
    },
  ],
  markers: artifactPrivacyMarkers(),
  scanRoots: [
    {
      description: "temporary-state",
      markers: provider.privacyMarkers,
      root: fixture.tempRoot,
    },
  ],
  workflowError,
});
console.log(`Electron global speech session workflow passed: ${artifactDir}`);

async function ensureWorkspaceOpen(client) {
  const initialWorkspaceId = await client.evaluate(workspaceIdExpression());
  if (validWorkspaceId(initialWorkspaceId)) {
    return initialWorkspaceId;
  }
  await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
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

function assertUnconfiguredCapabilities(capabilities) {
  if (
    capabilities?.providerStatus !== "not_configured" ||
    capabilities.transcriptionModel !== "gpt-realtime-whisper" ||
    capabilities.maximumRecordingSeconds !== 120 ||
    capabilities.maximumTranscriptCharacters !== 8000
  ) {
    throw new Error(`invalid unconfigured speech capabilities: ${JSON.stringify(capabilities)}`);
  }
  assertVoiceCatalog(capabilities.voiceCatalog);
}

function assertConfiguredCapabilities(capabilities) {
  if (
    capabilities?.providerStatus !== "configured" ||
    capabilities.transcriptionModel !== "gpt-realtime-whisper" ||
    capabilities.maximumRecordingSeconds !== 120 ||
    capabilities.maximumTranscriptCharacters !== 8000
  ) {
    throw new Error(`invalid global speech capabilities: ${JSON.stringify(capabilities)}`);
  }
  assertVoiceCatalog(capabilities.voiceCatalog);
}

function credentialRequest(credentialLabel, rejected) {
  return {
    credentialLabel,
    path: "/v1/realtime/client_secrets",
    rejected,
  };
}

function assertProviderCredentialRequests(requests, expected) {
  const summary = providerRequestSummary(requests);
  if (JSON.stringify(summary) !== JSON.stringify(expected)) {
    throw new Error(`unexpected provider credential operations: ${JSON.stringify(summary)}`);
  }
}

function providerRequestSummary(requests) {
  return requests.map((request) => ({
    credentialLabel: request.credentialLabel ?? null,
    path: request.path,
    rejected: request.rejected === true,
  }));
}

function artifactPrivacyMarkers() {
  return [...new Set([...provider.privacyMarkers, ...runtimeDeviceTokens])];
}

function assertVoiceCatalog(catalog) {
  if (
    catalog?.provider !== "openai" ||
    typeof catalog.version !== "string" ||
    catalog.version.length === 0 ||
    !Array.isArray(catalog.voiceIds) ||
    catalog.voiceIds.length !== 13 ||
    new Set(catalog.voiceIds).size !== 13
  ) {
    throw new Error(`invalid speech voice catalog: ${JSON.stringify(catalog)}`);
  }
}

function assertRejectedReplacement(result) {
  if (
    result?.statusLabel !== "Save failed" ||
    !result.statusDetail.includes("OpenAI rejected the speech credential") ||
    result.inputValueLength <= 0
  ) {
    throw new Error(`invalid rejected replacement state: ${JSON.stringify(result)}`);
  }
}

async function assertConfiguredCredentialSettings(client) {
  const settings = await waitForCredentialSettingsStatus(client, "configured");
  if (settings.provider !== "openai") {
    throw new Error(`configured credential settings drifted: ${JSON.stringify(settings)}`);
  }
}

async function assertNotConfiguredCredentialSettings(client) {
  const settings = await waitForCredentialSettingsStatus(client, "not_configured");
  if (settings.provider !== "openai") {
    throw new Error(`not-configured credential settings drifted: ${JSON.stringify(settings)}`);
  }
}

function waitForCredentialSettingsStatus(client, status) {
  return waitForState(
    client,
    "window.setta.speech.readCredentialSettings()",
    (settings) => settings?.status === status,
    workflowTimeoutMs,
  );
}

function assertMasterVoiceSelection(selection) {
  if (
    selection?.selection !== "exact" ||
    selection.requestedVoiceId !== "marin" ||
    selection.resolvedVoiceId !== "marin" ||
    typeof selection.updatedAt !== "string" ||
    selection.updatedAt.length === 0
  ) {
    throw new Error(`invalid global master voice selection: ${JSON.stringify(selection)}`);
  }
}

function assertLocalRuntimeReplacement(before, after) {
  if (before.baseURL === after.baseURL && before.deviceToken === after.deviceToken) {
    throw new Error(
      `local runtime access did not change across app/backend restart: ${JSON.stringify({
        baseURL: after.baseURL,
      })}`,
    );
  }
}

function assertTranscriptionSession(session, expectedSecret) {
  if (
    session?.clientSecret !== expectedSecret ||
    session.transcriptionModel !== "gpt-realtime-whisper" ||
    session.transcriptionDelay !== "medium" ||
    session.maximumRecordingSeconds !== 120 ||
    session.maximumTranscriptCharacters !== 8000 ||
    session.webRTCURL !== "https://api.openai.com/v1/realtime/calls"
  ) {
    throw new Error("global speech workflow received an invalid transcription session");
  }
}

async function assertSpeechNotConfigured(client, label) {
  const result = await client.evaluate(`(async () => {
    try {
      await window.setta.speech.createTranscriptionSession();
      return { ok: true, message: "" };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  })()`);
  if (result?.ok || !result?.message.includes("not configured")) {
    throw new Error(`${label} unexpectedly allowed speech: ${JSON.stringify(result)}`);
  }
}

async function exerciseRuntimeSwitchIsolation(client, firstLocalRuntimeAccess) {
  const localRuntime = await waitForRuntimeStatus(client, "connected", { isLocal: true });
  const localRuntimeId = localRuntime.activeRuntimeId;
  if (!localRuntimeId) {
    throw new Error("local runtime id was unavailable before remote switch");
  }
  remoteRuntime = await startRemoteRuntime(join(fixture.tempRoot, "remote-runtime-app-data"));
  const requestCountBeforeSwitch = provider.requests.length;
  const remote = await client.evaluate(
    `window.setta.runtimes.addByPairingUrl(${JSON.stringify(remoteRuntime.pairingURL)})`,
  );
  const remoteRuntimeId = remote.activeRuntimeId;
  await waitForRuntimeStatus(client, "connected", { isLocal: false, runtimeId: remoteRuntimeId });
  const remoteCapabilities = await client.evaluate("window.setta.speech.readCapabilities()");
  assertUnconfiguredCapabilities(remoteCapabilities);
  await assertSpeechNotConfigured(client, "remote runtime");
  await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  await waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => validWorkspaceId(workspaceId),
    workflowTimeoutMs,
  );
  await openOpenAIVoiceCredentialSettings(client);
  const remoteCard = await waitForOpenAIVoiceCredentialState(
    client,
    (state) =>
      state.statusLabel === "Connected" &&
      state.activeRuntimeStatusText.includes("Active runtime voice status") &&
      state.activeRuntimeStatusText.includes("Not connected") &&
      state.activeRuntimeStatusText.includes("not sent"),
    workflowTimeoutMs,
  );
  if (provider.requests.length !== requestCountBeforeSwitch) {
    throw new Error(
      `remote runtime switch used local speech credential: ${JSON.stringify(
        providerRequestSummary(provider.requests.slice(requestCountBeforeSwitch)),
      )}`,
    );
  }
  await client.evaluate(`window.setta.runtimes.switch(${JSON.stringify(localRuntimeId)})`);
  await waitForRuntimeStatus(client, "connected", { isLocal: true, runtimeId: localRuntimeId });
  const localAccessAfterSwitch = await readLocalRuntimeAccess(fixture.appDataDir);
  if (localAccessAfterSwitch.baseURL !== firstLocalRuntimeAccess.baseURL) {
    throw new Error(
      `local runtime access changed during remote switch: ${JSON.stringify({
        after: localAccessAfterSwitch.baseURL,
        before: firstLocalRuntimeAccess.baseURL,
      })}`,
    );
  }
  const restoredLocalCapabilities = await client.evaluate("window.setta.speech.readCapabilities()");
  assertConfiguredCapabilities(restoredLocalCapabilities);
  return {
    localRuntimeId,
    remoteRuntimeId,
    remoteVoiceStatusText: remoteCard.activeRuntimeStatusText,
  };
}

async function waitForRuntimeStatus(client, status, filter = {}) {
  return waitForState(
    client,
    "window.setta.runtimes.current()",
    (snapshot) => {
      if (snapshot.switching || snapshot.connection.status !== status) {
        return false;
      }
      if (filter.runtimeId && snapshot.connection.runtimeId !== filter.runtimeId) {
        return false;
      }
      if (filter.isLocal !== undefined) {
        const active = snapshot.runtimes.find((runtime) => runtime.active);
        return active?.isLocal === filter.isLocal;
      }
      return true;
    },
    workflowTimeoutMs,
  );
}

function voiceMasterInputRequest() {
  return {
    input: {
      focusedConversationId: null,
      focusedPaneId: null,
      focusedWorkspaceId: null,
      id: "master_input_global_speech_e2e",
      modality: "voice",
      originatingConversationId: null,
      originatingConversationInputId: null,
      originatingPaneId: null,
      originatingWorkspaceId: null,
      source: "shell",
      submittedAt: "2026-07-12T18:00:00Z",
      text: "  Reopen the exact conversation about global speech.  ",
    },
  };
}

async function submitMasterInput(client, request) {
  return client.evaluate(`window.setta.master.submitInput(${JSON.stringify(request)})`);
}

function assertIdempotentMasterInput(first, duplicate, expectedInput) {
  const firstSummary = acceptedMasterInputSummary(first);
  const expectedFirst = {
    ...firstSummary,
    input: masterInputSummary(expectedInput),
    replyDelivery: {
      originatingWorkspaceId: null,
      originatingConversationId: null,
      originatingPaneId: null,
      originatingConversationInputId: null,
    },
    sequence: 1,
  };
  if (
    JSON.stringify(firstSummary) !== JSON.stringify(expectedFirst) ||
    JSON.stringify(acceptedMasterInputSummary(duplicate)) !== JSON.stringify(firstSummary)
  ) {
    throw new Error(
      `master input was not accepted idempotently: ${JSON.stringify({ duplicate, first })}`,
    );
  }
}

function acceptedMasterInputSummary(accepted) {
  return {
    acceptedAt: accepted?.acceptedAt,
    input: masterInputSummary(accepted?.input),
    replyDelivery: accepted?.replyDelivery,
    sequence: accepted?.sequence,
  };
}

function masterInputSummary(input) {
  const value = input ?? {};
  return {
    focusedConversationId: value.focusedConversationId,
    focusedPaneId: value.focusedPaneId,
    focusedWorkspaceId: value.focusedWorkspaceId,
    id: value.id,
    modality: value.modality,
    originatingConversationId: value.originatingConversationId,
    originatingConversationInputId: value.originatingConversationInputId,
    originatingPaneId: value.originatingPaneId,
    originatingWorkspaceId: value.originatingWorkspaceId,
    source: value.source,
    submittedAt: value.submittedAt,
    text: value.text,
  };
}

async function assertChangedMasterInputConflicts(client, request) {
  const changed = {
    input: { ...request.input, text: "Changed content for the same input id" },
  };
  const result = await client.evaluate(`(async () => {
    try {
      await window.setta.master.submitInput(${JSON.stringify(changed)});
      return { accepted: true, message: "" };
    } catch (error) {
      return { accepted: false, message: error instanceof Error ? error.message : String(error) };
    }
  })()`);
  if (result?.accepted || !result?.message.includes("already accepted with different content")) {
    throw new Error(`changed master input id did not conflict: ${JSON.stringify(result)}`);
  }
}

async function startRemoteRuntime(appDataDir) {
  await mkdir(appDataDir, { recursive: true });
  const env = {
    ...process.env,
    SETTA_E2E: "1",
  };
  delete env.OPENAI_API_KEY;
  const child = spawn(
    join(repoRoot, "scripts/go.sh"),
    ["run", "./cmd/setta", "serve", "--app-data-dir", appDataDir, "--port", "0"],
    {
      cwd: repoRoot,
      detached: process.platform !== "win32",
      env,
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
