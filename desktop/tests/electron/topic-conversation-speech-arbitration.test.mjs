#!/usr/bin/env node
/* global console */

import { readFile, rm } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { driverCallExpression } from "./cdp-client.mjs";
import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
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
import { startSpeechTranscriptionProviderFixture } from "./speech-transcription-provider-fixture.mjs";
import {
  assertDriverAction,
  createTopic,
  hasReadyConversation,
} from "./topic-conversation-fork-workflow.mjs";
import { readJsonLinesWhileAppending } from "./topic-conversation-master-overlay-assertions.mjs";
import { narratorCaughtUp } from "./topic-conversation-projection-assertions.mjs";
import { openMasterOverlayForSpeech } from "./topic-conversation-speech-state-assertions.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "topic-conversation-speech-arbitration";
const workflowTimeoutMs = 30_000;
const speechRealtimeBrowserFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "speech-realtime-browser-fixture.js",
);
const topics = [
  { text: "hold simultaneous audio alpha", title: "Audio arbitration alpha" },
  { text: "hold simultaneous audio beta", title: "Audio arbitration beta" },
];
const completionInput = "complete simultaneous audio now";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/topic-conversation-speech-arbitration.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
const speechProvider = await startSpeechTranscriptionProviderFixture();
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      OPENAI_API_KEY: speechProvider.apiKey,
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: speechProvider.baseURL,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  await context.client.evaluate(await readFile(speechRealtimeBrowserFixture, "utf8"));

  const backend = await backendProbe(artifactDir);
  const workspaceId = await openWorkspace(context.client);
  const createdTopics = [];
  for (const topic of topics) {
    createdTopics.push(
      await createTopic(context.client, backend, workspaceId, topic.title, workflowTimeoutMs),
    );
  }
  assertDistinctNarratorVoices(createdTopics);

  await waitForConversationSurfaces(context.client, (surfaces) =>
    createdTopics.every((topic) => hasReadyConversation(surfaces, topic.id)),
  );
  for (const [index, topic] of createdTopics.entries()) {
    assertDriverAction(
      await context.client.driver("topicConversationSubmit", {
        conversationId: topic.id,
        text: topics[index].text,
      }),
      "submitted",
    );
  }

  const workingSnapshots = await waitForBackendState(
    () => readConversationSnapshots(backend, workspaceId, createdTopics),
    (snapshots) => snapshots.every(workingNarratorIsCaughtUp),
    workflowTimeoutMs,
  );
  const workingMilestoneIds = workingSnapshots.flatMap((snapshot) =>
    snapshot.narration.events
      .filter((event) => event.kind === "milestone")
      .map((event) => event.id),
  );
  if (workingMilestoneIds.length === 0) {
    throw new Error("audio arbitration topics produced no working narration milestones");
  }
  await waitForPlaybackObservations(artifactDir, (observations) =>
    workingMilestoneIds.every((eventId) =>
      observations.some(
        (observation) =>
          observation.action === "completed" && observation.intent.source.eventId === eventId,
      ),
    ),
  );
  await openMasterOverlayForSpeech(context.client, workflowTimeoutMs);
  await waitForShellSpeechState(
    context.client,
    (state) => state.playbackState === "idle" && state.sourceConversationId === "",
  );
  await waitForState(
    context.client,
    "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
    (state) => state.audioActiveCount === 0 && state.audioPlayCount === state.audioEndCount,
    workflowTimeoutMs,
  );

  await context.client.evaluate(
    "globalThis.__settaSpeechRealtimeBrowserFixture.setAudioAutoEnd(false)",
  );
  const audioBaseline = await browserAudioSnapshot(context.client);
  const providerRequestBaseline = speechProvider.requests.length;
  const completionActions = await Promise.all(
    createdTopics.map((topic) =>
      context.client.driver("topicConversationSubmit", {
        conversationId: topic.id,
        text: completionInput,
      }),
    ),
  );
  for (const action of completionActions) {
    assertDriverAction(action, "submitted");
  }

  const terminalSnapshots = await waitForBackendState(
    () => readConversationSnapshots(backend, workspaceId, createdTopics),
    (snapshots) => snapshots.every(completedTurnHasFinalNarration),
    workflowTimeoutMs,
  );
  const terminalEvents = terminalSnapshots.map((snapshot, index) =>
    terminalNarrationEvents(snapshot, workingSnapshots[index], topics[index].text),
  );
  const finalEvents = terminalEvents.map(({ final }) => final);
  const finalEventIds = finalEvents.map((event) => event.id);
  const terminalEventIds = new Set(
    terminalEvents.flatMap(({ events }) => events.map((event) => event.id)),
  );

  const firstPlaybackPhase = await waitForPlaybackObservations(artifactDir, (observations) => {
    const finalObservations = observationsForEventIds(observations, finalEventIds);
    return (
      observationsWithAction(finalObservations, "enqueued").length === 2 &&
      observationsWithAction(finalObservations, "play").length === 1
    );
  });
  const firstFinalObservations = observationsForEventIds(firstPlaybackPhase, finalEventIds);
  const enqueuedFinals = observationsWithAction(firstFinalObservations, "enqueued");
  const firstPlayedFinal = onlyObservation(
    observationsWithAction(firstFinalObservations, "play"),
    "first played final",
  );
  const firstConversationId = firstPlayedFinal.intent.source.conversationId;
  const secondConversationId = createdTopics.find((topic) => topic.id !== firstConversationId)?.id;
  if (!secondConversationId) {
    throw new Error(
      `first playback had an unknown conversation: ${JSON.stringify(firstPlayedFinal)}`,
    );
  }
  assertFirstPlaybackPhase(firstPlaybackPhase, enqueuedFinals, firstPlayedFinal, terminalEventIds);
  const firstAudioState = await waitForState(
    context.client,
    "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
    (state) =>
      state.audioActiveCount === 1 && state.audioPlayCount === audioBaseline.audioPlayCount + 1,
    workflowTimeoutMs,
  );
  assertSerializedAudioState(firstAudioState, audioBaseline, 1);
  await waitForShellSpeechState(
    context.client,
    (state) =>
      state.playbackState === "speaking" && state.sourceConversationId === firstConversationId,
  );
  assertFinalProviderRequestCount(
    speechProvider.requests.slice(providerRequestBaseline),
    finalEvents,
    createdTopics,
    1,
  );
  await captureScreenshot(context.client, join(artifactDir, "first-final-second-queued.png"));

  await context.client.evaluate("globalThis.__settaSpeechRealtimeBrowserFixture.finishAllAudio()");
  await waitForPlaybackObservations(artifactDir, (observations) => {
    const finalObservations = observationsForEventIds(observations, finalEventIds);
    return (
      observationsWithAction(finalObservations, "completed").length === 1 &&
      observationsWithAction(finalObservations, "play").length === 2
    );
  });
  const secondAudioState = await waitForState(
    context.client,
    "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
    (state) =>
      state.audioActiveCount === 1 && state.audioPlayCount === audioBaseline.audioPlayCount + 2,
    workflowTimeoutMs,
  );
  assertSerializedAudioState(secondAudioState, audioBaseline, 2);
  await waitForShellSpeechState(
    context.client,
    (state) =>
      state.playbackState === "speaking" && state.sourceConversationId === secondConversationId,
  );
  assertFinalProviderRequestCount(
    speechProvider.requests.slice(providerRequestBaseline),
    finalEvents,
    createdTopics,
    2,
  );
  await captureScreenshot(context.client, join(artifactDir, "second-final-speaking.png"));

  await context.client.evaluate("globalThis.__settaSpeechRealtimeBrowserFixture.finishAllAudio()");
  const completedPlayback = await waitForPlaybackObservations(
    artifactDir,
    (observations) =>
      observationsWithAction(observationsForEventIds(observations, finalEventIds), "completed")
        .length === 2,
  );
  const completedAudioState = await waitForState(
    context.client,
    "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
    (state) =>
      state.audioActiveCount === 0 && state.audioEndCount === audioBaseline.audioEndCount + 2,
    workflowTimeoutMs,
  );
  assertSerializedAudioState(completedAudioState, audioBaseline, 2);
  await waitForShellSpeechState(
    context.client,
    (state) => state.playbackState === "idle" && state.sourceConversationId === "",
  );
  const arbitration = assertCompletedArbitration(completedPlayback, finalEventIds);
  const supersessions = assertTerminalSupersessions(
    playbackSupersessions(
      await readJsonLinesWhileAppending(join(artifactDir, "renderer-console.jsonl")),
    ),
    terminalEvents,
  );
  speechProvider.assertHealthy();

  await writeJson(join(artifactDir, "summary.json"), {
    arbitration,
    artifactDir,
    audioBaseline,
    completedAudioState,
    conversations: createdTopics,
    finalEvents,
    status: "passed",
    supersessions,
    workspaceId,
  });
  console.log(`Electron topic conversation speech arbitration passed: ${artifactDir}`);
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
  await speechProvider.close();
  await rm(fixture.tempRoot, { force: true, recursive: true });
}

async function openWorkspace(client) {
  const initial = await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId: "" }),
    (state) => state.openButtonReady || validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  if (!validWorkspaceId(initial.workspaceId)) {
    await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  }
  const opened = await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId: "" }),
    (state) => validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  return opened.workspaceId;
}

function validWorkspaceId(workspaceId) {
  return workspaceId !== "" && workspaceId !== "empty";
}

function assertDistinctNarratorVoices(createdTopics) {
  const voices = createdTopics.map((topic) => topic.narratorVoiceId);
  if (
    voices.some((voice) => typeof voice !== "string" || voice === "") ||
    new Set(voices).size !== 2
  ) {
    throw new Error(`simultaneous narrators require distinct voices: ${JSON.stringify(voices)}`);
  }
}

function readConversationSnapshots(backend, workspaceId, createdTopics) {
  return Promise.all(
    createdTopics.map((topic) =>
      backend.post("/conversations/snapshot/read", {
        conversationId: topic.id,
        workspaceId,
      }),
    ),
  );
}

function workingNarratorIsCaughtUp(snapshot) {
  return (
    snapshot.conversation.status === "working" &&
    snapshot.turns.turns.some((turn) => turn.status === "running") &&
    snapshot.narration.events.some((event) => event.kind === "milestone") &&
    narratorCaughtUp(snapshot)
  );
}

function completedTurnHasFinalNarration(snapshot) {
  const completedTurnIds = new Set(
    snapshot.turns.turns.filter((turn) => turn.status === "completed").map((turn) => turn.id),
  );
  return (
    snapshot.conversation.status === "idle" &&
    completedTurnIds.size === 1 &&
    snapshot.narration.events.some(
      (event) => event.kind === "final_summary" && completedTurnIds.has(event.turnId),
    ) &&
    narratorCaughtUp(snapshot)
  );
}

function terminalNarrationEvents(snapshot, workingSnapshot, authoredText) {
  const turn = snapshot.turns.turns.find(
    (candidate) =>
      candidate.authoredInput.text === authoredText && candidate.status === "completed",
  );
  if (!turn) {
    throw new Error(`completed arbitration turn is missing: ${JSON.stringify(snapshot.turns)}`);
  }
  const priorEventIds = new Set(workingSnapshot.narration.events.map((event) => event.id));
  const events = snapshot.narration.events.filter(
    (event) => event.turnId === turn.id && !priorEventIds.has(event.id),
  );
  const milestones = events.filter((event) => event.kind === "milestone");
  const finals = events.filter((event) => event.kind === "final_summary");
  if (
    milestones.length !== 1 ||
    finals.length !== 1 ||
    typeof finals[0].finalSummary?.text !== "string"
  ) {
    throw new Error(`terminal arbitration narration is invalid: ${JSON.stringify(events)}`);
  }
  return { events, final: finals[0], milestone: milestones[0] };
}

async function waitForConversationSurfaces(client, ready) {
  return waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (state) => ready(state.surfaces),
    workflowTimeoutMs,
  );
}

function waitForShellSpeechState(client, ready) {
  return waitForState(
    client,
    driverCallExpression("topicConversationShellSpeechState", {}),
    ready,
    workflowTimeoutMs,
  );
}

function browserAudioSnapshot(client) {
  return client.evaluate("globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()");
}

async function waitForPlaybackObservations(artifactDirectory, ready) {
  const startedAt = Date.now();
  let observations = [];
  while (Date.now() - startedAt < workflowTimeoutMs) {
    observations = playbackObservations(
      await readJsonLinesWhileAppending(join(artifactDirectory, "renderer-console.jsonl")),
    );
    if (ready(observations)) {
      return observations;
    }
    await delay(20);
  }
  throw new Error(
    `timed out waiting for speech playback observations: ${JSON.stringify(observations)}`,
  );
}

function playbackObservations(records) {
  return speechConsolePayloads(records, "speech_playback");
}

function playbackSupersessions(records) {
  return speechConsolePayloads(records, "speech_playback_supersession");
}

function speechConsolePayloads(records, type) {
  const observations = [];
  for (const record of records) {
    if (record.type !== "renderer_console" || typeof record.message !== "string") {
      continue;
    }
    let payload;
    try {
      payload = JSON.parse(record.message);
    } catch {
      continue;
    }
    if (payload?.type === type) {
      observations.push(payload);
    }
  }
  return observations;
}

function observationsForEventIds(observations, eventIds) {
  const expected = new Set(eventIds);
  return observations.filter((observation) => expected.has(observation.intent?.source?.eventId));
}

function observationsWithAction(observations, action) {
  return observations.filter((observation) => observation.action === action);
}

function onlyObservation(observations, label) {
  if (observations.length !== 1) {
    throw new Error(`${label} requires one observation: ${JSON.stringify(observations)}`);
  }
  return observations[0];
}

function assertFirstPlaybackPhase(
  observations,
  enqueuedFinals,
  firstPlayedFinal,
  terminalEventIds,
) {
  if (
    enqueuedFinals.some(
      (observation) =>
        observation.intent.kind !== "final_summary" ||
        observation.priority !== 2 ||
        observation.queuePosition !== 1,
    )
  ) {
    throw new Error(
      `terminal summaries did not enter the expected queue: ${JSON.stringify(enqueuedFinals)}`,
    );
  }
  const firstCompletedIndex = observations.findIndex(
    (observation) =>
      observation.action === "completed" &&
      observation.intent.source.eventId === firstPlayedFinal.intent.source.eventId,
  );
  const secondEnqueuedIndex = observations.findIndex(
    (observation) =>
      observation.action === "enqueued" &&
      observation.intent.source.eventId === enqueuedFinals[1].intent.source.eventId,
  );
  if (firstCompletedIndex !== -1 || secondEnqueuedIndex === -1) {
    throw new Error("the second terminal summary was not queued while the first was speaking");
  }
  const unexpectedTerminalPlay = observations.find(
    (observation) =>
      observation.action === "play" &&
      terminalEventIds.has(observation.intent.source.eventId) &&
      observation.intent.kind !== "final_summary",
  );
  if (unexpectedTerminalPlay) {
    throw new Error(
      `covered terminal milestone reached playback: ${JSON.stringify(unexpectedTerminalPlay)}`,
    );
  }
}

function assertSerializedAudioState(state, baseline, expectedPlayedCount) {
  if (
    state.audioMaximumConcurrentCount !== 1 ||
    state.audioPlayCount !== baseline.audioPlayCount + expectedPlayedCount ||
    state.audioCreateCount !== baseline.audioCreateCount + expectedPlayedCount
  ) {
    throw new Error(
      `global audio playback was not serialized: ${JSON.stringify({ baseline, state })}`,
    );
  }
}

function assertFinalProviderRequestCount(requests, finalEvents, createdTopics, expectedCount) {
  const expected = finalEvents.map((event, index) => ({
    input: event.finalSummary.text,
    voice: createdTopics[index].narratorVoiceId,
  }));
  const matching = requests.filter((request) =>
    expected.some(
      (candidate) =>
        request.path === "/v1/audio/speech" &&
        request.input === candidate.input &&
        request.voice === candidate.voice,
    ),
  );
  if (matching.length !== expectedCount) {
    throw new Error(
      `terminal summary provider requests were not serialized: ${JSON.stringify({ expected, matching, requests })}`,
    );
  }
}

function assertCompletedArbitration(observations, finalEventIds) {
  const finals = observationsForEventIds(observations, finalEventIds);
  const enqueueOrder = observationsWithAction(finals, "enqueued").map(
    (observation) => observation.intent.source.eventId,
  );
  const playOrder = observationsWithAction(finals, "play").map(
    (observation) => observation.intent.source.eventId,
  );
  const completedOrder = observationsWithAction(finals, "completed").map(
    (observation) => observation.intent.source.eventId,
  );
  const invalid = finals.filter((observation) =>
    ["dropped", "failed", "preempted"].includes(observation.action),
  );
  if (
    enqueueOrder.length !== 2 ||
    JSON.stringify(playOrder) !== JSON.stringify(enqueueOrder) ||
    JSON.stringify(completedOrder) !== JSON.stringify(enqueueOrder) ||
    invalid.length > 0
  ) {
    throw new Error(
      `simultaneous final playback violated FIFO arbitration: ${JSON.stringify({ completedOrder, enqueueOrder, invalid, playOrder })}`,
    );
  }
  return { completedOrder, enqueueOrder, playOrder };
}

function assertTerminalSupersessions(supersessions, terminalEvents) {
  const expectedFinalIds = new Set(terminalEvents.map(({ final }) => final.id));
  const matching = supersessions.filter((decision) =>
    expectedFinalIds.has(decision.superseding.source.eventId),
  );
  const asserted = terminalEvents.map((terminal) => assertTerminalSupersession(matching, terminal));
  if (matching.length !== terminalEvents.length) {
    throw new Error(`terminal supersession count is invalid: ${JSON.stringify(matching)}`);
  }
  return asserted;
}

function assertTerminalSupersession(supersessions, { final, milestone }) {
  const decisions = supersessions.filter(
    (decision) => decision.superseding.source.eventId === final.id,
  );
  if (decisions.length !== 1) {
    throw new Error(
      `terminal milestone supersession count is invalid: ${JSON.stringify({ decisions, final, milestone })}`,
    );
  }
  const decision = decisions[0];
  const actual = terminalSupersessionShape(decision);
  const expected = {
    reason: "final_summary_covers_unplayed_milestone",
    superseded: {
      conversationId: final.conversationId,
      eventId: milestone.id,
      kind: "milestone",
      turnId: final.turnId,
    },
    superseding: {
      conversationId: final.conversationId,
      eventId: final.id,
      kind: "final_summary",
      turnId: final.turnId,
    },
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `terminal milestone supersession was not explicit: ${JSON.stringify({ actual, expected })}`,
    );
  }
  return decision;
}

function terminalSupersessionShape(decision) {
  return {
    reason: decision.reason,
    superseded: {
      conversationId: decision.superseded.source.conversationId,
      eventId: decision.superseded.source.eventId,
      kind: decision.superseded.kind,
      turnId: decision.superseded.turnId,
    },
    superseding: {
      conversationId: decision.superseding.source.conversationId,
      eventId: decision.superseding.source.eventId,
      kind: decision.superseding.kind,
      turnId: decision.superseding.turnId,
    },
  };
}
