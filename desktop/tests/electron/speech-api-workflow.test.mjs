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
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  easyButtonStateExpression,
  easyButtonStateSettled,
  ensureWorkspaceOpen,
  openEasyButtonFromShortcut,
  submitEasyButtonRequest,
  workflowTimeoutMs,
  workspaceIdExpression,
} from "./easy-button-pane-actions.mjs";
import { startSpeechProviderFixture } from "./speech-provider-fixture.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "speech-api";
const requestText = "easy run phase4 narrator workflow";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/speech-api-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
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
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: provider.baseURL,
      OPENAI_API_KEY: provider.apiKey,
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  await ensureWorkspaceOpen(context.client);
  const workspaceId = await context.client.evaluate(workspaceIdExpression());

  const capabilities = await context.client.evaluate("window.setta.speech.readCapabilities()");
  assertConfiguredCapabilities(capabilities);
  const session = await callSpeechAPI(context.client, "createTranscriptionSession", {
    workspaceId,
  });
  assertTranscriptionSession(session, provider.clientSecret);

  await openEasyButtonFromShortcut(context.client);
  await submitEasyButtonRequest(context.client, requestText);
  await waitForState(
    context.client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, "complete") &&
      state.runRequestText === requestText &&
      state.highlights.length === 2,
    workflowTimeoutMs,
  );
  const snapshot = await context.client.evaluate(
    `window.setta.easyRun.snapshot(${JSON.stringify(workspaceId)})`,
  );
  assertSpeechSources(snapshot);
  const summaryAudio = await callSpeechAPI(context.client, "synthesizeEasyRunSummary", {
    easyRunId: snapshot.latestRun.id,
    workspaceId,
  });
  const highlightAudio = await callSpeechAPI(context.client, "synthesizeEasyRunHighlight", {
    easyRunId: snapshot.latestRun.id,
    highlightId: snapshot.highlights[0].id,
    workspaceId,
  });
  assertSpeechAudio(summaryAudio, snapshot.latestRun.id, provider.audioBase64);
  assertSpeechAudio(highlightAudio, snapshot.highlights[0].id, provider.audioBase64);
  provider.assertHealthy();
  if (
    provider.requests.map((request) => request.path).join(",") !==
    "/v1/realtime/client_secrets,/v1/audio/speech,/v1/audio/speech"
  ) {
    throw new Error("speech API workflow did not issue the expected provider operations");
  }
  if (
    provider.synthesisInputs[0] !== snapshot.latestRun.summary ||
    provider.synthesisInputs[1] !== snapshot.highlights[0].text
  ) {
    throw new Error("speech API workflow did not synthesize the exact persisted sources");
  }
  await captureScreenshot(context.client, join(artifactDir, "speech-api-terminal.png"));
  await stopElectronCdpContext(context);
  context = null;

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    providerOperationCount: provider.requests.length,
    sourceIds: [summaryAudio.sourceId, highlightAudio.sourceId],
    status: "passed",
  });
  await assertNoSensitiveSpeechArtifacts(artifactDir, provider);
  console.log(`Electron speech API workflow passed: ${artifactDir}`);
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

function callSpeechAPI(client, method, request) {
  return client.evaluate(
    `window.setta.speech[${JSON.stringify(method)}](${JSON.stringify(request)})`,
  );
}

function assertConfiguredCapabilities(capabilities) {
  if (
    capabilities.providerStatus !== "configured" ||
    capabilities.transcriptionModel !== "gpt-realtime-whisper" ||
    capabilities.synthesisModel !== "gpt-4o-mini-tts" ||
    capabilities.synthesisVoice !== "marin" ||
    capabilities.maximumRecordingSeconds !== 120 ||
    capabilities.maximumTranscriptCharacters !== 8000 ||
    capabilities.maximumSynthesisCharacters !== 4096 ||
    !capabilities.aiVoiceDisclosure.includes("AI-generated")
  ) {
    throw new Error("speech API workflow received invalid capabilities");
  }
}

function assertTranscriptionSession(session, expectedSecret) {
  if (
    session.clientSecret !== expectedSecret ||
    session.transcriptionModel !== "gpt-realtime-whisper" ||
    session.transcriptionDelay !== "medium" ||
    session.maximumRecordingSeconds !== 120 ||
    session.maximumTranscriptCharacters !== 8000 ||
    session.webRTCURL !== "https://api.openai.com/v1/realtime/calls"
  ) {
    throw new Error("speech API workflow received an invalid transcription session");
  }
}

function assertSpeechSources(snapshot) {
  if (!validTerminalSpeechSource(snapshot?.latestRun) || !validHighlightSources(snapshot)) {
    throw new Error("speech API workflow did not produce persisted synthesis sources");
  }
}

function validTerminalSpeechSource(run) {
  return run?.status === "completed" && typeof run.summary === "string" && run.summary !== "";
}

function validHighlightSources(snapshot) {
  return snapshot?.highlights?.length === 2 && typeof snapshot.highlights[0]?.text === "string";
}

function assertSpeechAudio(audio, sourceId, expectedAudioBase64) {
  if (
    audio.audioBase64 !== expectedAudioBase64 ||
    audio.format !== "wav" ||
    audio.mediaType !== "audio/wav" ||
    audio.sourceId !== sourceId
  ) {
    throw new Error("speech API workflow received invalid synthesized audio");
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
    } else if ([".json", ".jsonl", ".log", ".txt"].includes(extname(entry.name))) {
      paths.push(path);
    }
  }
  return paths;
}
