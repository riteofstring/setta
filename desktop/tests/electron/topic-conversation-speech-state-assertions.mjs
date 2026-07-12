import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
import { captureScreenshot, waitForState } from "./electron-cdp-harness.mjs";

export async function verifyIdleGlobalSpeech(client, timeoutMs) {
  const state = await waitForShellSpeechState(client, () => true, timeoutMs);
  assertIdleShellSpeech(state);
  return state;
}

export function assertDistinctConversationPalettes(surfaces, alphaId, betaId) {
  const alpha = surfaces.find((surface) => surface.conversationId === alphaId);
  const beta = surfaces.find((surface) => surface.conversationId === betaId);
  assertState(
    [alpha?.paletteId, beta?.paletteId, alpha?.paletteId !== beta?.paletteId],
    "topic palettes were not distinct",
    { alpha, beta },
  );
}

export async function safeTopicConversationSurfaceStates(client) {
  try {
    return await client.driver("topicConversationSurfaceStates", {});
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function verifyConversationCapturePresentation({
  artifactPath,
  client,
  conversationId,
  conversationTitle,
  sourcePaneId,
  transcriptPreview,
  timeoutMs,
}) {
  await emitTranscriptPreview(client, transcriptPreview);
  const state = await waitForConversationSurfaces(
    client,
    (surfaces) =>
      surfaces.every((surface) => surface.captureState === "listening") &&
      surfaces.some((surface) => surface.speechTranscriptText.includes(transcriptPreview)),
    timeoutMs,
  );
  assertConversationCaptureAttribution(
    state.surfaces,
    conversationId,
    sourcePaneId,
    transcriptPreview,
  );
  const shell = await waitForShellSpeechState(
    client,
    (candidate) =>
      candidate.captureState === "listening" && candidate.sourceConversationId === conversationId,
    timeoutMs,
  );
  const expectedActionLabel = `Finish the voice request for ${conversationTitle}`;
  const expectedStatusLabel = `Listening for ${conversationTitle}`;
  assertState(
    [
      shell.captureLabel === expectedActionLabel,
      shell.label.includes(expectedStatusLabel),
      shell.transcriptText.includes(transcriptPreview),
    ],
    `shell capture did not attribute ${conversationTitle}`,
    shell,
  );
  await captureScreenshot(client, artifactPath);
  return { shell, surfaces: state.surfaces };
}

export async function verifyNarratorPlaybackPresentation({
  artifactPath,
  client,
  conversationId,
  conversationTitle,
  timeoutMs,
}) {
  const state = await waitForConversationSurfaces(
    client,
    (surfaces) => surfaces.every((surface) => surface.playbackState === "speaking"),
    timeoutMs,
  );
  assertNarratorPlaybackAttribution(state.surfaces, conversationId);
  const shell = await waitForShellSpeechState(
    client,
    (candidate) =>
      candidate.playbackState === "speaking" && candidate.sourceConversationId === conversationId,
    timeoutMs,
  );
  assertState(
    [shell.label.includes(`${conversationTitle} narrator is speaking`), shell.stopAvailable],
    `shell playback did not attribute ${conversationTitle} narrator`,
    shell,
  );
  await captureScreenshot(client, artifactPath);
  return { shell, surfaces: state.surfaces };
}

export async function exercisePaneFreeShellCapture({
  artifactDirectory,
  artifactPath,
  client,
  timeoutMs,
  transcript,
  workspaceId,
}) {
  const before = await client.evaluate("globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()");
  assertDriverAction(await client.driver("topicConversationShellSpeechCapture", {}), "clicked");
  const listening = await waitForShellSpeechState(
    client,
    (state) => state.captureState === "listening" && state.sourceConversationId === "",
    timeoutMs,
  );
  await emitTranscriptPreview(client, transcript.trim());
  const preview = await waitForShellSpeechState(
    client,
    (state) => state.transcriptText.includes(transcript.trim()),
    timeoutMs,
  );
  assertState(
    [
      listening.captureLabel === "Finish the voice request for Setta",
      listening.label.includes("Listening for Setta"),
      preview.transcriptText.includes(transcript.trim()),
    ],
    "pane-free shell capture did not target the master",
    listening,
  );
  await captureScreenshot(client, artifactPath);
  assertDriverAction(await client.driver("topicConversationShellSpeechCapture", {}), "clicked");
  await waitForState(
    client,
    "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
    (state) => state.commitCount === before.commitCount + 1,
    timeoutMs,
  );
  const recorded = await waitForRecordedMasterSpeechInput(artifactDirectory, transcript, timeoutMs);
  assertRecordedShellMasterInput(recorded, workspaceId, transcript);
  return recorded;
}

export async function waitForRecordedPaneSpeechInput(
  artifactDirectory,
  conversationId,
  sourcePaneId,
  transcript,
  timeoutMs,
  occurrence = 1,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const events = await readJsonLinesWhileAppending(join(artifactDirectory, "ipc.jsonl"));
    const starts = events.filter(
      (event) =>
        event.type === "ipc_start" &&
        event.channel === "conversation:submit-input" &&
        event.args?.[0]?.input?.conversationId === conversationId &&
        event.args[0].input.sourcePaneId === sourcePaneId &&
        event.args[0].input.text === transcript,
    );
    assertPaneSpeechDidNotReachMaster(events, transcript);
    const uniqueStarts = Array.from(
      new Map(starts.map((start) => [start.args[0].input.id, start])).values(),
    );
    if (uniqueStarts.length > occurrence) {
      throw new Error(`too many durable pane speech inputs: ${uniqueStarts.length}`);
    }
    const completed = completedConversationInputIPC(uniqueStarts[occurrence - 1], events);
    if (completed) {
      assertRecordedPaneSpeechInput(
        completed.request.input,
        conversationId,
        sourcePaneId,
        transcript,
      );
      return completed;
    }
    await delay(50);
  }
  throw new Error(`timed out waiting for durable pane speech input delivery ${occurrence}`);
}

function assertPaneSpeechDidNotReachMaster(events, transcript) {
  const submittedToMaster = events.some(
    (event) =>
      event.type === "ipc_start" &&
      event.channel === "master:submit-input" &&
      event.args?.[0]?.input?.text === transcript,
  );
  if (submittedToMaster) {
    throw new Error("pane speech transcript was submitted to the global master");
  }
}

function completedConversationInputIPC(start, events) {
  if (!start) {
    return null;
  }
  const finish = events.find(
    (event) =>
      event.type === "ipc_finish" &&
      event.channel === "conversation:submit-input" &&
      event.id === start.id,
  );
  return finish ? { accepted: finish.result, request: start.args[0] } : null;
}

function assertRecordedPaneSpeechInput(input, conversationId, sourcePaneId, transcript) {
  assertPaneSpeechField(input, "conversationId", conversationId);
  assertPaneSpeechField(input, "sourcePaneId", sourcePaneId);
  assertPaneSpeechField(input, "replyToInputId", null);
  assertPaneSpeechField(input, "modality", "voice");
  assertPaneSpeechField(input, "text", transcript);
  assertNonEmptyPaneSpeechField(input, "id");
  assertNonEmptyPaneSpeechField(input, "submittedAt");
}

function assertPaneSpeechField(input, field, expected) {
  if (input?.[field] !== expected) {
    throw new Error(`invalid pane speech input ${field}: ${JSON.stringify(input)}`);
  }
}

function assertNonEmptyPaneSpeechField(input, field) {
  if (typeof input?.[field] !== "string" || input[field].length === 0) {
    throw new Error(`invalid pane speech input ${field}: ${JSON.stringify(input)}`);
  }
}

async function waitForRecordedMasterSpeechInput(artifactDirectory, transcript, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const events = await readJsonLinesWhileAppending(join(artifactDirectory, "ipc.jsonl"));
    const starts = events.filter(
      (event) =>
        event.type === "ipc_start" &&
        event.channel === "master:submit-input" &&
        event.args?.[0]?.input?.text === transcript,
    );
    if (starts.length > 1) {
      throw new Error(`shell speech transcript was submitted more than once: ${starts.length}`);
    }
    const completed = completedIPC(starts[0], events);
    if (completed) {
      return completed;
    }
    await delay(50);
  }
  throw new Error("timed out waiting for durable shell master speech input delivery");
}

function assertIdleShellSpeech(state) {
  assertState(
    [
      state.captureState === "idle",
      state.playbackState === "idle",
      state.captureAvailable,
      state.captureLabel === "Start a voice request for Setta",
      !state.stopAvailable,
    ],
    "shell idle speech state drifted",
    state,
  );
}

function assertConversationCaptureAttribution(
  surfaces,
  conversationId,
  sourcePaneId,
  transcriptPreview,
) {
  for (const surface of surfaces) {
    assertCaptureSurface(surface, conversationId, sourcePaneId, transcriptPreview);
  }
}

function assertNarratorPlaybackAttribution(surfaces, conversationId) {
  for (const surface of surfaces) {
    assertPlaybackSurface(surface, conversationId);
  }
}

function assertRecordedShellMasterInput(recorded, workspaceId, transcript) {
  const input = recordedShellInput(recorded);
  const accepted = recordedShellAcceptance(recorded);
  if (!input || !accepted) {
    throw new Error(`shell master speech input drifted: ${JSON.stringify(recorded)}`);
  }
  assertState(
    [
      input.modality === "voice",
      input.source === "shell",
      input.text === transcript,
      input.focusedWorkspaceId === workspaceId,
      typeof input.id === "string",
      input.id !== "",
      typeof input.submittedAt === "string",
      input.submittedAt !== "",
      input.originatingWorkspaceId === null,
      input.originatingConversationId === null,
      input.originatingPaneId === null,
      input.originatingConversationInputId === null,
      accepted.input.id === input.id,
      accepted.input.text === input.text,
      accepted.replyDelivery?.originatingWorkspaceId === null,
      accepted.replyDelivery?.originatingConversationId === null,
      accepted.replyDelivery?.originatingPaneId === null,
      accepted.replyDelivery?.originatingConversationInputId === null,
      Number.isSafeInteger(accepted.sequence),
      accepted.sequence >= 1,
    ],
    "shell master speech input drifted",
    recorded,
  );
}

function recordedShellInput(recorded) {
  if (!recorded) {
    return null;
  }
  if (!recorded.request) {
    return null;
  }
  return recorded.request.input;
}

function recordedShellAcceptance(recorded) {
  if (!recorded) {
    return null;
  }
  const accepted = recorded.accepted;
  if (!accepted) {
    return null;
  }
  return accepted.input ? accepted : null;
}

function completedIPC(start, events) {
  if (!start) {
    return null;
  }
  const finish = events.find(
    (event) =>
      event.type === "ipc_finish" &&
      event.channel === "master:submit-input" &&
      event.id === start.id,
  );
  return finish ? { accepted: finish.result, request: start.args[0] } : null;
}

function assertCaptureSurface(surface, conversationId, sourcePaneId, transcriptPreview) {
  if (surface.captureState !== "listening") {
    throw new Error(`pane did not render global capture: ${JSON.stringify(surface)}`);
  }
  if (surface.conversationId !== conversationId) {
    assertOtherConversationCapture(surface);
    return;
  }
  if (surface.paneId === sourcePaneId) {
    assertSourcePaneCapture(surface, transcriptPreview);
    return;
  }
  assertDuplicateViewCapture(surface);
}

function assertOtherConversationCapture(surface) {
  assertState(
    [
      surface.captureScope === "other_conversation",
      !surface.voiceCaptureAvailable,
      surface.speechActivityText.includes("another topic"),
      surface.speechTranscriptText === "",
    ],
    "other topic claimed global capture",
    surface,
  );
}

function assertSourcePaneCapture(surface, transcriptPreview) {
  assertState(
    [
      surface.captureScope === "this_pane",
      surface.voiceCaptureAvailable,
      surface.voiceCaptureLabel === "Finish this voice request",
      surface.speechActivityText.includes("Listening"),
      surface.speechTranscriptText.includes(transcriptPreview),
    ],
    "source pane did not own its capture",
    surface,
  );
}

function assertDuplicateViewCapture(surface) {
  assertState(
    [
      surface.captureScope === "this_conversation",
      !surface.voiceCaptureAvailable,
      surface.speechActivityText.includes("another view"),
      surface.speechTranscriptText === "",
    ],
    "duplicate topic view claimed source-pane capture",
    surface,
  );
}

function assertPlaybackSurface(surface, conversationId) {
  if (surface.playbackState !== "speaking") {
    throw new Error(`pane did not render global playback: ${JSON.stringify(surface)}`);
  }
  if (surface.conversationId === conversationId) {
    assertTopicPlayback(surface);
    return;
  }
  assertOtherTopicPlayback(surface);
}

function assertTopicPlayback(surface) {
  assertState(
    [
      surface.playbackScope === "this_conversation",
      surface.speechActivityText === "Narrator speaking",
    ],
    "topic view did not claim its narrator",
    surface,
  );
}

function assertOtherTopicPlayback(surface) {
  assertState(
    [
      surface.playbackScope === "other_conversation",
      surface.speechActivityText.includes("Alpha topic narrator speaking"),
    ],
    "other topic playback attribution drifted",
    surface,
  );
}

function assertState(conditions, message, state) {
  if (!conditions.every(Boolean)) {
    throw new Error(`${message}: ${JSON.stringify(state)}`);
  }
}

function waitForConversationSurfaces(client, ready, timeoutMs) {
  return waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (state) => ready(state.surfaces),
    timeoutMs,
  );
}

function waitForShellSpeechState(client, ready, timeoutMs) {
  return waitForState(
    client,
    driverCallExpression("topicConversationShellSpeechState", {}),
    ready,
    timeoutMs,
  );
}

async function emitTranscriptPreview(client, transcript) {
  await client.evaluate(
    `globalThis.__settaSpeechRealtimeBrowserFixture.emitTranscriptDelta(${JSON.stringify(transcript)})`,
  );
}

function assertDriverAction(result, property) {
  if (result?.[property] !== true) {
    throw new Error(`topic conversation action ${property} failed: ${JSON.stringify(result)}`);
  }
}

async function readJsonLinesWhileAppending(path) {
  let content;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
  const events = [];
  for (const line of content.split("\n")) {
    if (line.trim() === "") {
      continue;
    }
    try {
      events.push(JSON.parse(line));
    } catch {
      break;
    }
  }
  return events;
}
