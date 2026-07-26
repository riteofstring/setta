#!/usr/bin/env node
/* global console, fetch */

import { Buffer } from "node:buffer";
import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

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
import {
  finalizeLiveOpenAIArtifacts,
  redactLiveOpenAIError,
} from "./instant-voice-capture-live-openai-artifacts.mjs";
import { resolveLiveOpenAIApiKey } from "./instant-voice-capture-live-openai-credentials.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "instant-voice-capture-phase0-live-openai";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const browserFixturePath = join(scriptDir, "instant-voice-capture-phase0-live-openai-fixture.js");
const workletPath = join(scriptDir, "instant-voice-capture-phase0-audioworklet-worklets.js");
const expectedPhrase = "This is a live smoke test for instant voice capture.";
const expectedTranscriptWords = ["live", "smoke", "instant", "voice", "capture"];
const openAIBaseURL = "https://api.openai.com/v1";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/instant-voice-capture-phase0-live-openai.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);

const resolvedCredential = await resolveLiveOpenAIApiKey({
  workflowModuleURL: import.meta.url,
});
if (resolvedCredential.status === "blocked") {
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    reason: resolvedCredential.reason,
    status: "blocked",
    workflowName,
  });
  throw new Error(resolvedCredential.reason);
}
const apiKey = resolvedCredential.apiKey;

if (process.env.SETTA_E2E_OPENAI_SPEECH_BASE_URL) {
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    reason: "SETTA_E2E_OPENAI_SPEECH_BASE_URL was present; live smoke must use OpenAI",
    status: "blocked",
    workflowName,
  });
  throw new Error("live OpenAI smoke refuses SETTA_E2E_OPENAI_SPEECH_BASE_URL");
}

if (!options.skipBuild) {
  assertBuildExists();
}

const fixture = await createElectronFixture(workflowName);
let context = null;
let session = null;
let workflowError = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      OPENAI_API_KEY: apiKey,
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const capabilities = await context.client.evaluate("window.setta.speech.readCapabilities()");
  assertSpeechCapabilities(capabilities);
  session = await context.client.evaluate("window.setta.speech.createTranscriptionSession()");
  assertTranscriptionSession(session);
  const audio = await synthesizeLiveSmokeAudio({
    apiKey,
    input: expectedPhrase,
    model: capabilities.synthesisModel,
    voice: capabilities.voiceCatalog.voiceIds[0],
  });
  const browserFixture = await readFile(browserFixturePath, "utf8");
  const workletSource = await readFile(workletPath, "utf8");
  await context.client.evaluate(browserFixture);
  const result = await context.client.evaluate(
    `globalThis.__settaInstantVoiceCaptureLiveOpenAI.run(${JSON.stringify({
      audioBase64: audio.audioBase64,
      expectedPhrase,
      session,
      transcriptTimeoutMs: 45_000,
      workletSource,
    })})`,
  );
  assertLiveSmokeResult(result);
  const summary = {
    artifactDir,
    expectedPhrase,
    expectedTranscriptWords,
    result,
    session: redactedSession(session),
    status: "passed",
    credentialSource: resolvedCredential.source,
    synthesis: {
      audioBytes: audio.audioBytes,
      model: capabilities.synthesisModel,
      voice: capabilities.voiceCatalog.voiceIds[0],
    },
    workflowName,
  };
  await writeJson(join(artifactDir, "summary.json"), summary);
  await captureScreenshot(context.client, join(artifactDir, "complete.png"));
} catch (error) {
  workflowError = error;
  await recordWorkflowFailure(error).catch(() => {});
}
await finalizeLiveOpenAIArtifacts({
  artifactDir,
  finalizers: [
    async () => {
      const currentContext = context;
      context = null;
      await stopElectronCdpContext(currentContext);
    },
    async () => {
      await rm(fixture.tempRoot, { force: true, recursive: true });
    },
  ],
  markers: privateMarkers(),
  workflowError,
});
console.log(`Electron instant voice capture live OpenAI smoke passed: ${artifactDir}`);

async function recordWorkflowFailure(error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
  }
  const redactedError = redactLiveOpenAIError(error, privateMarkers());
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    error: redactedError instanceof Error ? redactedError.message : String(redactedError),
    session: session ? redactedSession(session) : null,
    status: "failed",
    workflowName,
  });
}

function privateMarkers() {
  return session ? [apiKey, session.clientSecret] : [apiKey];
}

async function synthesizeLiveSmokeAudio({ apiKey, input, model, voice }) {
  const response = await fetch(`${openAIBaseURL}/audio/speech`, {
    body: JSON.stringify({
      input,
      model,
      response_format: "wav",
      voice,
    }),
    headers: {
      Accept: "audio/wav,application/octet-stream",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
    redirect: "error",
  });
  if (!response.ok) {
    throw new Error(
      `OpenAI live smoke speech synthesis failed with HTTP ${response.status}: ${(
        await response.text()
      ).slice(0, 512)}`,
    );
  }
  const audio = Buffer.from(await response.arrayBuffer());
  if (audio.length === 0) {
    throw new Error("OpenAI live smoke speech synthesis returned empty audio");
  }
  return {
    audioBase64: audio.toString("base64"),
    audioBytes: audio.length,
  };
}

function assertSpeechCapabilities(capabilities) {
  if (
    !capabilities ||
    capabilities.providerStatus !== "configured" ||
    typeof capabilities.synthesisModel !== "string" ||
    capabilities.synthesisModel === "" ||
    !Array.isArray(capabilities.voiceCatalog?.voiceIds) ||
    capabilities.voiceCatalog.voiceIds.length === 0
  ) {
    throw new Error(
      `live OpenAI smoke received invalid speech capabilities: ${JSON.stringify(capabilities)}`,
    );
  }
}

function assertTranscriptionSession(value) {
  if (
    !value ||
    typeof value.clientSecret !== "string" ||
    value.clientSecret === "" ||
    typeof value.webRTCURL !== "string" ||
    value.webRTCURL === "" ||
    typeof value.transcriptionModel !== "string" ||
    value.transcriptionModel === ""
  ) {
    throw new Error(
      `live OpenAI smoke received invalid transcription session: ${JSON.stringify(redactedSession(value))}`,
    );
  }
}

function assertLiveSmokeResult(result) {
  assertPassedLiveSmokeResult(result);
  assertRequiredEvents(result.events, [
    "input_prefix_retained",
    "webrtc_ready",
    "output_prefix_observed",
    "raw_track_stopped",
    "gate_drained",
    "transcript_commit_sent",
    "transcript_completed",
  ]);
  assertLiveSmokeGraph(result.graph);
  assertTranscriptContainsExpectedWords(result.transcript);
}

function assertPassedLiveSmokeResult(result) {
  if (!result || result.status !== "passed") {
    throw new Error(`live OpenAI smoke did not pass: ${JSON.stringify(result)}`);
  }
}

function assertLiveSmokeGraph(graph) {
  if (graph?.processedAudioTracks !== 1 || graph?.processedTrackKind !== "audio") {
    throw new Error(`live OpenAI smoke processed graph drifted: ${JSON.stringify(graph)}`);
  }
  if (graph?.rawTrackReadyState !== "ended") {
    throw new Error(`live OpenAI smoke raw track did not stop: ${JSON.stringify(graph)}`);
  }
}

function assertTranscriptContainsExpectedWords(transcript) {
  const transcriptWords = new Set(normalizeWords(transcript));
  for (const expected of expectedTranscriptWords) {
    if (!transcriptWords.has(expected)) {
      throw new Error(
        `live OpenAI smoke transcript ${JSON.stringify(transcript)} did not contain ${expected}`,
      );
    }
  }
}

function assertRequiredEvents(events, requiredNames) {
  if (!Array.isArray(events)) {
    throw new Error("live OpenAI smoke events were not recorded");
  }
  const eventNames = new Set(events.map((event) => event.name));
  for (const name of requiredNames) {
    if (!eventNames.has(name)) {
      throw new Error(`live OpenAI smoke missing event ${name}`);
    }
  }
}

function normalizeWords(value) {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function redactedSession(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return {
    expiresAt: value.expiresAt ?? null,
    maximumRecordingSeconds: value.maximumRecordingSeconds ?? null,
    maximumTranscriptCharacters: value.maximumTranscriptCharacters ?? null,
    transcriptionDelay: value.transcriptionDelay ?? null,
    transcriptionModel: value.transcriptionModel ?? null,
    webRTCURL: value.webRTCURL ?? null,
  };
}
