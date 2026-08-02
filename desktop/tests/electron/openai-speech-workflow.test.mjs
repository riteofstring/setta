#!/usr/bin/env node
/* global console */

import { rm } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { delimiter, join } from "node:path";
import process from "node:process";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import {
  finalizeLiveOpenAIArtifacts,
  redactLiveOpenAIError,
} from "./instant-voice-capture-live-openai-artifacts.mjs";
import { saveOpenAIVoiceCredentialThroughSettingsAndClose } from "./speech-credential-byok-workflow.mjs";
import { startSpeechTranscriptionProviderFixture } from "./speech-transcription-provider-fixture.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "openai-speech";
const workflowTimeoutMs = 30_000;
const directorRequest = "Director normal conversation.";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/openai-speech-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
const firstLaunchDir = join(artifactDir, "first-launch");
const restoredLaunchDir = join(artifactDir, "restored-launch");
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
const provider = await startSpeechTranscriptionProviderFixture();
const launchEnvironment = {
  PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
  SETTA_E2E_OPENAI_SPEECH_BASE_URL: provider.baseURL,
  SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
};
const privateMarkers = [...provider.privacyMarkers, provider.audioMarker];
let context = null;
let workflowError = null;

try {
  context = await launchSpeechApp(firstLaunchDir);
  await assertRemovedLocalSpeechSurface(context.client);
  assertSpeechCapabilities(
    await context.client.evaluate("window.setta.speech.readCapabilities()"),
    "not_configured",
  );
  const credentialSetup = await saveOpenAIVoiceCredentialThroughSettingsAndClose(
    context.client,
    provider.apiKey,
    workflowTimeoutMs,
  );
  const first = await exerciseConfiguredSpeech(context.client, "openai-speech-first");
  await captureScreenshot(context.client, join(firstLaunchDir, "configured.png"));
  await stopElectronCdpContext(context);
  context = null;

  context = await launchSpeechApp(restoredLaunchDir);
  await assertRemovedLocalSpeechSurface(context.client);
  const restored = await exerciseRestoredSpeech(context.client, first);
  await captureScreenshot(context.client, join(restoredLaunchDir, "restored.png"));
  provider.assertHealthy();
  assertProviderRequests(provider.requests, first.replyText);

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    credentialSetup,
    firstLaunch: speechSummary(first),
    providerOperationCount: provider.requests.length,
    restoredLaunch: speechSummary(restored),
    status: "passed",
    workflowName,
  });
} catch (error) {
  workflowError = error;
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
  }
  const redacted = redactLiveOpenAIError(error, privateMarkers);
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: redacted.message,
    status: "failed",
    workflowName,
  }).catch(() => {});
}

await finalizeLiveOpenAIArtifacts({
  artifactDir,
  cleanupFinalizers: [async () => rm(fixture.tempRoot, { force: true, recursive: true })],
  description: "fake OpenAI speech credential or generated audio",
  finalizers: [
    async () => {
      const activeContext = context;
      context = null;
      await stopElectronCdpContext(activeContext);
    },
    async () => provider.close(),
  ],
  markers: privateMarkers,
  scanRoots: [
    {
      description: "temporary-state",
      markers: privateMarkers,
      root: fixture.tempRoot,
    },
  ],
  workflowError,
});
console.log(`Electron OpenAI speech workflow passed: ${artifactDir}`);

function launchSpeechApp(launchArtifactDir) {
  return launchElectronCdpContext({
    artifactDir: launchArtifactDir,
    extraEnv: launchEnvironment,
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
}

async function exerciseConfiguredSpeech(client, operationId) {
  const capabilities = await client.evaluate("window.setta.speech.readCapabilities()");
  assertSpeechCapabilities(capabilities, "configured");
  const session = await client.evaluate(
    'window.setta.speech.createTranscriptionSession({ provider: "openai" })',
  );
  assertTranscriptionSession(session);
  const receipt = await client.evaluate(
    `window.setta.director.dispatch(${JSON.stringify({
      kind: "submit",
      submit: { modality: "text", text: directorRequest },
    })})`,
  );
  const { eventId, replyText } = readDirectorReply(receipt);
  const selection = await client.evaluate("window.setta.speech.readDirectorVoiceSelection()");
  const resolvedVoiceId = readResolvedVoice(selection, capabilities.voiceCatalog.voiceIds);
  const source = { conversationId: null, eventId, speaker: "director" };
  const audio = await synthesize(client, operationId, resolvedVoiceId, source);
  assertSpeechAudio(audio, source, resolvedVoiceId);
  return { audio, capabilities, replyText, session, source };
}

function readDirectorReply(receipt) {
  const replyText = receipt?.submit?.replyText;
  const eventId = receipt?.submit?.intentId;
  if (typeof replyText !== "string" || replyText === "" || typeof eventId !== "string") {
    throw new Error(
      `OpenAI speech workflow received invalid Director output: ${JSON.stringify(receipt)}`,
    );
  }
  return { eventId, replyText };
}

function readResolvedVoice(selection, voiceIds) {
  const resolvedVoiceId = selection?.resolvedVoiceId;
  if (typeof resolvedVoiceId !== "string" || !voiceIds.includes(resolvedVoiceId)) {
    throw new Error(
      `OpenAI speech workflow received invalid voice selection: ${JSON.stringify(selection)}`,
    );
  }
  return resolvedVoiceId;
}

async function exerciseRestoredSpeech(client, first) {
  const capabilities = await client.evaluate("window.setta.speech.readCapabilities()");
  assertSpeechCapabilities(capabilities, "configured");
  const session = await client.evaluate(
    'window.setta.speech.createTranscriptionSession({ provider: "openai" })',
  );
  assertTranscriptionSession(session);
  const audio = await synthesize(
    client,
    "openai-speech-restored",
    first.audio.resolvedVoiceId,
    first.source,
  );
  assertSpeechAudio(audio, first.source, first.audio.resolvedVoiceId);
  return { audio, capabilities, replyText: first.replyText, session, source: first.source };
}

function synthesize(client, operationId, resolvedVoiceId, source) {
  return client.evaluate(
    `window.setta.speech.synthesize(${JSON.stringify({
      provider: "openai",
      resolvedVoiceId,
      source,
    })}, ${JSON.stringify(operationId)})`,
  );
}

async function assertRemovedLocalSpeechSurface(client) {
  const methods = await client.evaluate("Object.keys(window.setta.speech).sort()");
  const removedMethods = [
    "cancelLocalMacOSCapture",
    "finishLocalMacOSCapture",
    "readLocalMacOSVoiceHealth",
    "readLocalMacOSVoiceModelDownloadStatus",
    "readProviderSelection",
    "startLocalMacOSCapture",
    "startLocalMacOSVoiceModelDownload",
    "updateProviderSelection",
  ];
  const present = removedMethods.filter((method) => methods.includes(method));
  if (present.length > 0) {
    throw new Error(`removed local speech APIs remain exposed: ${present.join(", ")}`);
  }
}

function assertSpeechCapabilities(capabilities, providerStatus) {
  if (
    capabilities?.providerStatus !== providerStatus ||
    capabilities.transcriptionModel !== "gpt-realtime-whisper" ||
    capabilities.synthesisModel !== "gpt-4o-mini-tts" ||
    capabilities.voiceCatalog?.provider !== "openai" ||
    !Array.isArray(capabilities.voiceCatalog.voiceIds) ||
    capabilities.voiceCatalog.voiceIds.length === 0
  ) {
    throw new Error(
      `OpenAI speech workflow received invalid capabilities: ${JSON.stringify(capabilities)}`,
    );
  }
}

function assertTranscriptionSession(session) {
  if (
    session?.clientSecret !== provider.clientSecret ||
    session.webRTCURL !== "https://api.openai.com/v1/realtime/calls" ||
    session.transcriptionModel !== "gpt-realtime-whisper" ||
    session.maximumRecordingSeconds !== 120 ||
    session.maximumTranscriptCharacters !== 8000
  ) {
    throw new Error("OpenAI speech workflow received an invalid transcription session");
  }
}

function assertSpeechAudio(audio, source, resolvedVoiceId) {
  if (!audio || typeof audio !== "object" || !isExpectedWAV(audio.audioBase64)) {
    throw new Error("OpenAI speech workflow received invalid synthesized audio");
  }
  assertSpeechAudioMetadata(audio, resolvedVoiceId);
  assertSpeechSource(audio.source, source);
}

function assertSpeechAudioMetadata(audio, resolvedVoiceId) {
  if (
    audio.format !== "wav" ||
    audio.mediaType !== "audio/wav" ||
    audio.resolvedVoiceId !== resolvedVoiceId
  ) {
    throw new Error("OpenAI speech workflow received invalid synthesized audio metadata");
  }
}

function assertSpeechSource(actual, expected) {
  if (
    actual?.speaker !== expected.speaker ||
    actual.eventId !== expected.eventId ||
    actual.conversationId !== expected.conversationId
  ) {
    throw new Error("OpenAI speech workflow received an invalid synthesized audio source");
  }
}

function isExpectedWAV(audioBase64) {
  if (typeof audioBase64 !== "string") {
    return false;
  }
  const audio = Buffer.from(audioBase64, "base64");
  const pcm = Buffer.from(provider.audioMarker, "utf8");
  return (
    audio.length === 44 + pcm.length &&
    audio.subarray(0, 4).toString("ascii") === "RIFF" &&
    audio.subarray(8, 12).toString("ascii") === "WAVE" &&
    audio.subarray(36, 40).toString("ascii") === "data" &&
    audio.readUInt32LE(40) === pcm.length &&
    audio.subarray(44).equals(pcm)
  );
}

function assertProviderRequests(requests, replyText) {
  const paths = requests.map((request) => request.path);
  const expectedPaths = [
    "/v1/realtime/client_secrets",
    "/v1/realtime/client_secrets",
    "/v1/audio/speech",
    "/v1/realtime/client_secrets",
    "/v1/audio/speech",
  ];
  if (JSON.stringify(paths) !== JSON.stringify(expectedPaths)) {
    throw new Error(`OpenAI speech workflow provider operations drifted: ${JSON.stringify(paths)}`);
  }
  const synthesisRequests = requests.filter((request) => request.path === "/v1/audio/speech");
  if (synthesisRequests.some((request) => request.input !== replyText)) {
    throw new Error(
      "OpenAI speech workflow synthesized text other than the persisted Director reply",
    );
  }
}

function speechSummary(result) {
  return {
    providerStatus: result.capabilities.providerStatus,
    resolvedVoiceId: result.audio.resolvedVoiceId,
    sourceEventId: result.source.eventId,
    transcriptionModel: result.session.transcriptionModel,
  };
}
