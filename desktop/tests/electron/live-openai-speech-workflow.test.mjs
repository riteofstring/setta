#!/usr/bin/env node
/* global console */

import { Buffer } from "node:buffer";
import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  dispatchMouseClick,
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

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "live-openai-speech";
const synthesisSeedRequest = "easy run phase4 narrator workflow";
const fakeMicrophoneSampleRate = 48_000;
const leadingSilenceMs = 6_000;
const minimumReadyLeadInMs = 1_000;
const trailingSilenceMs = 700;
const captureDrainMs = 300;
const apiKey = process.env.OPENAI_API_KEY ?? "";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/live-openai-speech-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}
if (!apiKey) {
  throw new Error("live OpenAI speech workflow requires OPENAI_API_KEY");
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const microphoneAudioPath = join(fixture.tempRoot, "live-openai-microphone.wav");
let context = null;
let generatedAudioBase64;

try {
  context = await launchLiveContext({
    artifactDir: join(artifactDir, "synthesis"),
    fixture,
    visible: options.visible,
  });
  await prepareEasyButton(context.client);
  const workspaceId = await context.client.evaluate(workspaceIdExpression());
  await submitEasyButtonRequest(context.client, synthesisSeedRequest);
  const synthesisSourceState = await waitForState(
    context.client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, "complete") &&
      state.runRequestText === synthesisSeedRequest &&
      state.highlights.length > 0,
    workflowTimeoutMs,
  );
  const snapshot = await context.client.evaluate(
    `window.setta.easyRun.snapshot(${JSON.stringify(workspaceId)})`,
  );
  const sourceHighlight = snapshot?.highlights?.[0];
  if (!sourceHighlight?.id || !sourceHighlight.text) {
    throw new Error("live OpenAI speech workflow did not create a synthesis source");
  }
  const speechAudio = await callSpeechAPI(
    context.client,
    "synthesizeEasyRunHighlight",
    {
      easyRunId: snapshot.latestRun.id,
      highlightId: sourceHighlight.id,
      workspaceId,
    },
    "live_openai_microphone_source",
  );
  assertSpeechAudio(speechAudio, sourceHighlight.id);
  generatedAudioBase64 = speechAudio.audioBase64;
  const microphoneAudio = prepareChromiumMicrophoneWAV(
    Buffer.from(generatedAudioBase64, "base64"),
    leadingSilenceMs,
    trailingSilenceMs,
  );
  await writeFile(microphoneAudioPath, microphoneAudio.bytes);
  await captureScreenshot(
    context.client,
    join(artifactDir, "synthesis", "live-openai-synthesis-source.png"),
  );
  await stopElectronCdpContext(context);
  context = null;

  context = await launchLiveContext({
    artifactDir: join(artifactDir, "capture"),
    electronArgs: [
      // Chromium's macOS sandbox cannot open an arbitrary temporary WAV as a
      // fake hardware device. This process is disposable and contains no user
      // profile; production Electron launches keep their normal sandbox.
      "--no-sandbox",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${microphoneAudioPath}%noloop`,
    ],
    fixture,
    visible: options.visible,
  });
  await prepareEasyButton(context.client);
  const ready = await waitForState(
    context.client,
    easyButtonStateExpression(),
    (state) =>
      state.speechStatus === "configured" &&
      state.speechCapture === "off" &&
      state.buttonAriaLabel === "Start voice request" &&
      state.latestRunId === synthesisSourceState.latestRunId,
    workflowTimeoutMs,
  );
  const captureStartedAt = Date.now();
  await dispatchMouseClick(context.client, centerOfRect(ready.buttonRect));
  const connected = await waitForState(
    context.client,
    easyButtonStateExpression(),
    (state) => state.speechCapture === "listening" || state.speechCapture === "failed",
    workflowTimeoutMs,
  );
  assertListeningState(connected);
  const realtimeReadyMs = Date.now() - captureStartedAt;
  if (realtimeReadyMs > leadingSilenceMs - minimumReadyLeadInMs) {
    throw new Error(
      `live OpenAI Realtime connection left insufficient microphone lead-in: ${JSON.stringify({
        leadingSilenceMs,
        minimumReadyLeadInMs,
        realtimeReadyMs,
      })}`,
    );
  }
  await captureScreenshot(
    context.client,
    join(artifactDir, "capture", "live-openai-listening.png"),
  );

  // Chromium begins the fake microphone file at getUserMedia(), before WebRTC is
  // ready. Its parsed duration is the deterministic signal that the entire
  // production-generated utterance has reached the peer connection.
  const captureFinishedAt = captureStartedAt + microphoneAudio.durationMs + captureDrainMs;
  await delay(Math.max(0, captureFinishedAt - Date.now()));
  const beforeCommit = await context.client.evaluate(easyButtonStateExpression());
  if (beforeCommit.speechCapture !== "listening") {
    throw new Error(`live OpenAI capture failed while receiving audio: ${safeState(beforeCommit)}`);
  }
  await dispatchMouseClick(context.client, centerOfRect(beforeCommit.buttonRect));
  const committed = await waitForState(
    context.client,
    easyButtonStateExpression(),
    (state) => state.speechCapture === "committing" || state.speechCapture === "failed",
    workflowTimeoutMs,
  );
  if (committed.speechCapture === "failed") {
    throw new Error(`live OpenAI commit failed: ${safeState(committed)}`);
  }
  const submitted = await waitForState(
    context.client,
    easyButtonStateExpression(),
    (state) =>
      state.speechCapture === "failed" ||
      (state.speechCapture === "off" && state.latestRunId !== synthesisSourceState.latestRunId),
    workflowTimeoutMs,
  );
  if (submitted.speechCapture === "failed") {
    throw new Error(`live OpenAI transcription failed: ${safeState(submitted)}`);
  }
  assertExpectedTranscript(submitted.runRequestText, sourceHighlight.text);
  const terminal = await waitForState(
    context.client,
    easyButtonStateExpression(),
    (state) =>
      easyButtonStateSettled(state, "complete") &&
      state.latestRunId === submitted.latestRunId &&
      state.runRequestText === submitted.runRequestText,
    workflowTimeoutMs,
  );
  assertPersistedVoiceRequest(
    await context.client.driver("easyButtonPaneChatRecord"),
    terminal.runRequestText,
  );
  await captureScreenshot(
    context.client,
    join(artifactDir, "capture", "live-openai-transcribed-and-submitted.png"),
  );
  await stopElectronCdpContext(context);
  context = null;

  await assertNoRendererErrors(artifactDir);
  await assertSecretsAbsentFromArtifacts(artifactDir, [apiKey, generatedAudioBase64]);
  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    microphoneAudioDurationMs: microphoneAudio.durationMs,
    persistedRequest: terminal.runRequestText,
    realtimeConnected: true,
    realtimeReadyMs,
    status: "passed",
    synthesisUsedProductionPath: true,
    transcriptSubmittedThroughEasyRun: true,
  });
  console.log(`Live OpenAI speech workflow passed: ${artifactDir}`);
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

async function launchLiveContext({
  artifactDir: contextArtifactDir,
  electronArgs = [],
  fixture,
  visible,
}) {
  return launchElectronCdpContext({
    artifactDir: contextArtifactDir,
    electronArgs,
    extraEnv: {
      OPENAI_API_KEY: apiKey,
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    },
    fixture,
    unsetEnv: ["SETTA_E2E_OPENAI_SPEECH_BASE_URL"],
    visible,
  });
}

async function prepareEasyButton(client) {
  await waitForSelector(client, '[data-testid="workspace-layout-area"]');
  await client.installDriver();
  await ensureWorkspaceOpen(client);
  await openEasyButtonFromShortcut(client);
}

function callSpeechAPI(client, method, request, operationId) {
  return client.evaluate(
    `window.setta.speech[${JSON.stringify(method)}](${JSON.stringify(request)}, ${JSON.stringify(operationId)})`,
  );
}

function assertSpeechAudio(audio, expectedSourceId) {
  if (
    audio?.sourceId !== expectedSourceId ||
    audio.format !== "wav" ||
    audio.mediaType !== "audio/wav" ||
    typeof audio.audioBase64 !== "string" ||
    audio.audioBase64 === ""
  ) {
    throw new Error("live OpenAI speech workflow received invalid synthesized audio");
  }
}

function prepareChromiumMicrophoneWAV(bytes, leadingMs, trailingMs) {
  const format = parsePCM16WAV(bytes);
  if (format.channels !== 1 || format.sampleRate !== 24_000 || format.blockAlign !== 2) {
    throw new Error(
      `live OpenAI synthesis returned unexpected PCM layout: ${JSON.stringify({
        blockAlign: format.blockAlign,
        channels: format.channels,
        sampleRate: format.sampleRate,
      })}`,
    );
  }
  const source = bytes.subarray(format.dataStart, format.dataEnd);
  const upsampled = Buffer.alloc(source.length * 2);
  for (let sourceOffset = 0; sourceOffset < source.length; sourceOffset += 2) {
    const sample = source.readInt16LE(sourceOffset);
    const targetOffset = sourceOffset * 2;
    upsampled.writeInt16LE(sample, targetOffset);
    upsampled.writeInt16LE(sample, targetOffset + 2);
  }
  const blockAlign = 2;
  const byteRate = fakeMicrophoneSampleRate * blockAlign;
  const leadingBytes = alignedDurationBytes(byteRate, blockAlign, leadingMs);
  const trailingBytes = alignedDurationBytes(byteRate, blockAlign, trailingMs);
  const audio = Buffer.concat([Buffer.alloc(leadingBytes), upsampled, Buffer.alloc(trailingBytes)]);
  const wav = canonicalPCM16WAV(audio, fakeMicrophoneSampleRate);
  return {
    bytes: wav,
    durationMs: Math.ceil((audio.length / byteRate) * 1_000),
  };
}

function canonicalPCM16WAV(audio, sampleRate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(header.length + audio.length - 8, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(audio.length, 40);
  return Buffer.concat([header, audio]);
}

function parsePCM16WAV(bytes) {
  if (!isRIFFWAV(bytes)) {
    throw new Error("live OpenAI synthesis did not return a RIFF/WAVE file");
  }
  const { data, format } = readWAVChunks(bytes);
  if (!isSupportedPCM16WAV(format, data)) {
    throw new Error("live OpenAI synthesis did not return supported PCM16 WAV audio");
  }
  return { ...format, dataEnd: data.dataEnd, dataStart: data.dataStart };
}

function isRIFFWAV(bytes) {
  return (
    bytes.length >= 44 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WAVE"
  );
}

function readWAVChunks(bytes) {
  let format = null;
  let data = null;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const chunk = readWAVChunk(bytes, offset);
    if (chunk.type === "fmt ") {
      format = decodePCM16WAVFormat(bytes, chunk);
    }
    if (chunk.type === "data") {
      data = { dataEnd: chunk.end, dataStart: chunk.start };
    }
    offset = chunk.end + (chunk.size % 2);
  }
  return { data, format };
}

function readWAVChunk(bytes, offset) {
  const type = bytes.toString("ascii", offset, offset + 4);
  const size = bytes.readUInt32LE(offset + 4);
  const start = offset + 8;
  const end = start + size;
  if (end > bytes.length) {
    throw new Error(`live OpenAI WAV contains a truncated ${type} chunk`);
  }
  return { end, size, start, type };
}

function decodePCM16WAVFormat(bytes, chunk) {
  if (chunk.size < 16) {
    throw new Error("live OpenAI WAV contains an invalid format chunk");
  }
  return {
    audioFormat: bytes.readUInt16LE(chunk.start),
    bitsPerSample: bytes.readUInt16LE(chunk.start + 14),
    blockAlign: bytes.readUInt16LE(chunk.start + 12),
    byteRate: bytes.readUInt32LE(chunk.start + 8),
    channels: bytes.readUInt16LE(chunk.start + 2),
    sampleRate: bytes.readUInt32LE(chunk.start + 4),
  };
}

function isSupportedPCM16WAV(format, data) {
  return (
    format !== null &&
    data !== null &&
    format.audioFormat === 1 &&
    format.bitsPerSample === 16 &&
    format.blockAlign >= 2 &&
    format.byteRate >= format.blockAlign
  );
}

function alignedDurationBytes(byteRate, blockAlign, durationMs) {
  return Math.ceil((byteRate * durationMs) / 1_000 / blockAlign) * blockAlign;
}

function centerOfRect(rect) {
  if (!rect || rect.width <= 0 || rect.height <= 0) {
    throw new Error(`live OpenAI microphone control has invalid bounds: ${JSON.stringify(rect)}`);
  }
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function assertListeningState(state) {
  if (
    state.speechCapture !== "listening" ||
    state.speechCapturing !== "true" ||
    state.buttonAriaLabel !== "Finish voice request" ||
    state.captureErrorText !== ""
  ) {
    throw new Error(`live OpenAI microphone capture failed: ${safeState(state)}`);
  }
}

function assertExpectedTranscript(actual, expected) {
  if (canonicalSpeechText(actual) !== canonicalSpeechText(expected)) {
    throw new Error(
      `live OpenAI transcript did not match the spoken source: ${JSON.stringify({ actual, expected })}`,
    );
  }
}

function canonicalSpeechText(text) {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function assertPersistedVoiceRequest(page, requestText) {
  const messages = completedVoiceMessages(page, requestText);
  const message = messages[0];
  const block = userMessageBlock(page, message?.id);
  if (
    !hasInternalEasyRunConversation(page) ||
    messages.length !== 1 ||
    !exactPlainText(block?.userMessage?.parts, requestText)
  ) {
    throw new Error(`voice request was not persisted losslessly: ${JSON.stringify(page)}`);
  }
}

function completedVoiceMessages(page, requestText) {
  return page?.messages?.filter((message) => isCompletedVoiceMessage(message, requestText)) ?? [];
}

function isCompletedVoiceMessage(message, requestText) {
  return (
    message.role === "user" &&
    message.delivery === "normal" &&
    message.status === "complete" &&
    exactPlainText(message.parts, requestText)
  );
}

function userMessageBlock(page, messageId) {
  return page?.blocks?.find((candidate) => isUserMessageBlock(candidate, messageId));
}

function isUserMessageBlock(candidate, messageId) {
  return candidate.kind === "user_message" && candidate.userMessage?.messageId === messageId;
}

function hasInternalEasyRunConversation(page) {
  return page?.conversation?.internal === true && Boolean(page.conversation.easyRun?.easyRunId);
}

function exactPlainText(parts, text) {
  return (
    parts?.length === 1 &&
    parts[0]?.type === "text" &&
    parts[0].text?.format === "plain" &&
    parts[0].text.text === text &&
    parts[0].image === null
  );
}

function safeState(state) {
  return JSON.stringify({
    buttonAriaLabel: state?.buttonAriaLabel,
    captureErrorText: state?.captureErrorText,
    errorText: state?.errorText,
    speechCapture: state?.speechCapture,
    speechStatus: state?.speechStatus,
  });
}

async function assertNoRendererErrors(root) {
  const errors = [];
  for (const path of await namedArtifactPaths(root, "renderer-console.jsonl")) {
    for (const line of (await readFile(path, "utf8")).split("\n")) {
      if (!line) {
        continue;
      }
      const entry = JSON.parse(line);
      if (Number(entry.level) >= 2) {
        errors.push(entry);
      }
    }
  }
  if (errors.length > 0) {
    throw new Error(`live OpenAI speech recorded renderer errors: ${JSON.stringify(errors)}`);
  }
}

async function assertSecretsAbsentFromArtifacts(root, secrets) {
  for (const path of await textArtifactPaths(root)) {
    const content = await readFile(path, "utf8");
    for (const secret of secrets) {
      if (secret && content.includes(secret)) {
        throw new Error(`live OpenAI speech secret leaked into ${path}`);
      }
    }
  }
}

async function namedArtifactPaths(root, name) {
  const paths = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await namedArtifactPaths(path, name)));
    } else if (entry.name === name) {
      paths.push(path);
    }
  }
  return paths;
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
