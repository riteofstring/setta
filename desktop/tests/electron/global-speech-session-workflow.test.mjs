#!/usr/bin/env node
/* global console */

import { readdir, readFile, rm } from "node:fs/promises";
import { extname, join } from "node:path";
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
import { startSpeechTranscriptionProviderFixture } from "./speech-transcription-provider-fixture.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "global-speech-session";

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
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const provider = await startSpeechTranscriptionProviderFixture();
let context = null;
let firstAcceptedInput;
let secondAcceptedInput;
let firstMasterVoiceSelection;
let secondMasterVoiceSelection;

try {
  context = await launchElectronCdpContext({
    artifactDir: firstLaunchDir,
    extraEnv: {
      OPENAI_API_KEY: provider.apiKey,
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: provider.baseURL,
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');

  const capabilities = await context.client.evaluate("window.setta.speech.readCapabilities()");
  assertConfiguredCapabilities(capabilities);
  firstMasterVoiceSelection = await context.client.evaluate(
    "window.setta.speech.readMasterVoiceSelection()",
  );
  assertMasterVoiceSelection(firstMasterVoiceSelection);
  const session = await context.client.evaluate("window.setta.speech.createTranscriptionSession()");
  assertTranscriptionSession(session, provider.clientSecret);
  const easyButtonPaneCount = await context.client.evaluate(
    "document.querySelectorAll('[data-testid=\"easy-button-surface\"]').length",
  );
  if (easyButtonPaneCount !== 0) {
    throw new Error(
      `global transcription session required ${easyButtonPaneCount} Easy Button panes`,
    );
  }
  const masterInputRequest = voiceMasterInputRequest();
  firstAcceptedInput = await submitMasterInput(context.client, masterInputRequest);
  const duplicate = await submitMasterInput(context.client, masterInputRequest);
  assertIdempotentMasterInput(firstAcceptedInput, duplicate, masterInputRequest.input);
  await assertChangedMasterInputConflicts(context.client, masterInputRequest);
  provider.assertHealthy();
  if (
    provider.requests.length !== 1 ||
    provider.requests[0]?.path !== "/v1/realtime/client_secrets"
  ) {
    throw new Error(`unexpected provider operations: ${JSON.stringify(provider.requests)}`);
  }

  await captureScreenshot(context.client, join(firstLaunchDir, "global-speech-session.png"));
  await stopElectronCdpContext(context);
  context = null;

  context = await launchElectronCdpContext({
    artifactDir: secondLaunchDir,
    extraEnv: {
      OPENAI_API_KEY: provider.apiKey,
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: provider.baseURL,
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  secondMasterVoiceSelection = await context.client.evaluate(
    "window.setta.speech.readMasterVoiceSelection()",
  );
  assertMasterVoiceSelection(secondMasterVoiceSelection);
  if (JSON.stringify(secondMasterVoiceSelection) !== JSON.stringify(firstMasterVoiceSelection)) {
    throw new Error(
      `master voice selection changed across restart: ${JSON.stringify({ firstMasterVoiceSelection, secondMasterVoiceSelection })}`,
    );
  }
  secondAcceptedInput = await submitMasterInput(context.client, masterInputRequest);
  assertIdempotentMasterInput(firstAcceptedInput, secondAcceptedInput, masterInputRequest.input);
  await captureScreenshot(context.client, join(secondLaunchDir, "master-input-restored.png"));
  await stopElectronCdpContext(context);
  context = null;

  await assertNoSensitiveSpeechArtifacts(artifactDir, [provider.apiKey, provider.clientSecret]);
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    easyButtonPaneCount,
    masterInputAcceptedAt: firstAcceptedInput.acceptedAt,
    masterInputSequence: firstAcceptedInput.sequence,
    providerOperationCount: provider.requests.length,
    restartPreservedMasterInput: firstAcceptedInput.acceptedAt === secondAcceptedInput.acceptedAt,
    restartPreservedMasterVoice: firstMasterVoiceSelection,
    status: "passed",
  });
  console.log(`Electron global speech session workflow passed: ${artifactDir}`);
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

async function assertNoSensitiveSpeechArtifacts(root, markers) {
  for (const path of await textArtifactPaths(root)) {
    const content = await readFile(path, "utf8");
    for (const marker of markers) {
      if (content.includes(marker)) {
        throw new Error(`private speech credential leaked into ${path}`);
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
    } else if ([".json", ".jsonl", ".log", ".txt"].includes(extname(entry.name))) {
      paths.push(path);
    }
  }
  return paths;
}
