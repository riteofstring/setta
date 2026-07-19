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
import { saveOpenAIVoiceCredentialThroughSettingsAndClose } from "./speech-credential-byok-workflow.mjs";
import {
  expectedSynthesisSpeed,
  startSpeechTranscriptionProviderFixture,
} from "./speech-transcription-provider-fixture.mjs";
import {
  assertDriverAction,
  createTopic,
  hasReadyConversation,
} from "./topic-conversation-fork-workflow.mjs";
import { readJsonLinesWhileAppending } from "./topic-conversation-master-overlay-assertions.mjs";
import {
  expectedNarratorStatusReply,
  narratorCaughtUp,
} from "./topic-conversation-projection-assertions.mjs";
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
const statusQuestion = "What is the primary agent doing?";
const noSpeechObservationWindowMs = 250;

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
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: speechProvider.baseURL,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  await context.client.evaluate(await readFile(speechRealtimeBrowserFixture, "utf8"));

  const backend = await backendProbe(artifactDir);
  const workspaceId = await openWorkspace(context.client);
  await saveOpenAIVoiceCredentialThroughSettingsAndClose(
    context.client,
    speechProvider.apiKey,
    workflowTimeoutMs,
  );
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
  const workingNarrationIds = workingSnapshots.flatMap((snapshot) =>
    snapshot.narration.events.map((event) => event.id),
  );
  await assertNoPlaybackForEventIds(artifactDir, workingNarrationIds, "routine working narration");
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
  const statusActions = await Promise.all(
    createdTopics.map((topic) =>
      context.client.driver("topicConversationSubmit", {
        conversationId: topic.id,
        text: statusQuestion,
      }),
    ),
  );
  for (const action of statusActions) {
    assertDriverAction(action, "submitted");
  }

  const statusSnapshots = await waitForBackendState(
    () => readConversationSnapshots(backend, workspaceId, createdTopics),
    (snapshots) =>
      snapshots.every((snapshot, index) => hasNewStatusReply(snapshot, workingSnapshots[index])),
    workflowTimeoutMs,
  );
  const statusEvents = statusSnapshots.map((snapshot, index) =>
    statusNarrationEvent(snapshot, workingSnapshots[index]),
  );
  const statusEventIds = statusEvents.map((event) => event.id);

  const firstPlaybackPhase = await waitForPlaybackObservations(artifactDir, (observations) => {
    const statusObservations = observationsForEventIds(observations, statusEventIds);
    return (
      observationsWithAction(statusObservations, "enqueued").length === 2 &&
      observationsWithAction(statusObservations, "play").length === 1
    );
  });
  const firstStatusObservations = observationsForEventIds(firstPlaybackPhase, statusEventIds);
  const enqueuedStatuses = observationsWithAction(firstStatusObservations, "enqueued");
  const firstPlayedStatus = onlyObservation(
    observationsWithAction(firstStatusObservations, "play"),
    "first played status",
  );
  const firstConversationId = firstPlayedStatus.intent.source.conversationId;
  const secondConversationId = createdTopics.find((topic) => topic.id !== firstConversationId)?.id;
  if (!secondConversationId) {
    throw new Error(
      `first playback had an unknown conversation: ${JSON.stringify(firstPlayedStatus)}`,
    );
  }
  assertFirstStatusPlaybackPhase(firstPlaybackPhase, enqueuedStatuses, firstPlayedStatus);
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
  assertNarrationProviderRequestCount(
    speechProvider.requests.slice(providerRequestBaseline),
    statusEvents,
    createdTopics,
    1,
  );
  await captureScreenshot(context.client, join(artifactDir, "first-status-second-queued.png"));

  await context.client.evaluate("globalThis.__settaSpeechRealtimeBrowserFixture.finishAllAudio()");
  await waitForPlaybackObservations(artifactDir, (observations) => {
    const statusObservations = observationsForEventIds(observations, statusEventIds);
    return (
      observationsWithAction(statusObservations, "completed").length === 1 &&
      observationsWithAction(statusObservations, "play").length === 2
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
  assertNarrationProviderRequestCount(
    speechProvider.requests.slice(providerRequestBaseline),
    statusEvents,
    createdTopics,
    2,
  );
  await captureScreenshot(context.client, join(artifactDir, "second-status-speaking.png"));

  await context.client.evaluate("globalThis.__settaSpeechRealtimeBrowserFixture.finishAllAudio()");
  const completedPlayback = await waitForPlaybackObservations(
    artifactDir,
    (observations) =>
      observationsWithAction(observationsForEventIds(observations, statusEventIds), "completed")
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
  const arbitration = assertCompletedArbitration(completedPlayback, statusEventIds);

  const finalProviderRequestBaseline = speechProvider.requests.length;
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
    terminalNarrationEvents(snapshot, statusSnapshots[index], topics[index].text),
  );
  const finalEvents = terminalEvents.map(({ final }) => final);
  const finalEventIds = finalEvents.map((event) => event.id);
  await assertNoPlaybackForEventIds(artifactDir, finalEventIds, "successful terminal narration");
  assertNoNarrationProviderRequests(
    speechProvider.requests.slice(finalProviderRequestBaseline),
    finalEvents,
    "successful terminal narration",
  );
  speechProvider.assertHealthy();

  await writeJson(join(artifactDir, "summary.json"), {
    arbitration,
    artifactDir,
    audioBaseline,
    completedAudioState,
    conversations: createdTopics,
    finalEvents,
    statusEvents,
    status: "passed",
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
  const routineMilestone = snapshot.narration.events.find(
    (event) => event.kind === "milestone" && event.trigger !== "approval_required",
  );
  if (routineMilestone) {
    throw new Error(
      `routine working milestone was emitted: ${JSON.stringify({ routineMilestone, snapshot })}`,
    );
  }
  return (
    snapshot.conversation.status === "working" &&
    snapshot.turns.turns.some((turn) => turn.status === "running") &&
    narratorCaughtUp(snapshot)
  );
}

function completedTurnHasFinalNarration(snapshot) {
  const completedTurnIds = new Set(
    snapshot.turns.turns.filter((turn) => turn.status === "completed").map((turn) => turn.id),
  );
  const terminalMilestone = snapshot.narration.events.find(
    (event) => event.kind === "milestone" && completedTurnIds.has(event.turnId),
  );
  if (terminalMilestone) {
    throw new Error(
      `terminal milestone was emitted for a successful turn: ${JSON.stringify({ snapshot, terminalMilestone })}`,
    );
  }
  return (
    snapshot.conversation.status === "idle" &&
    completedTurnIds.size === 1 &&
    snapshot.narration.events.some(
      (event) => event.kind === "final_summary" && completedTurnIds.has(event.turnId),
    ) &&
    narratorCaughtUp(snapshot)
  );
}

function hasNewStatusReply(snapshot, workingSnapshot) {
  const reply = newNarrationEvents(snapshot, workingSnapshot).findLast(
    (event) => event.kind === "status_reply",
  );
  if (!reply) {
    return false;
  }
  assertStatusReplyEvent(reply, { snapshot, workingSnapshot });
  return snapshot.conversation.status === "working" && narratorCaughtUp(snapshot);
}

function statusNarrationEvent(snapshot, workingSnapshot) {
  const replies = newNarrationEvents(snapshot, workingSnapshot).filter(
    (event) => event.kind === "status_reply",
  );
  if (replies.length !== 1) {
    throw new Error(
      `status arbitration requires one new status reply: ${JSON.stringify({ replies, snapshot, workingSnapshot })}`,
    );
  }
  assertStatusReplyEvent(replies[0], { snapshot, workingSnapshot });
  return replies[0];
}

function assertStatusReplyEvent(reply, snapshots) {
  if (
    reply.statusReply?.question !== statusQuestion ||
    reply.statusReply.text !== expectedNarratorStatusReply
  ) {
    throw new Error(`status arbitration reply drifted: ${JSON.stringify({ reply, ...snapshots })}`);
  }
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
    milestones.length !== 0 ||
    finals.length !== 1 ||
    typeof finals[0].finalSummary?.text !== "string"
  ) {
    throw new Error(`terminal arbitration narration is invalid: ${JSON.stringify(events)}`);
  }
  return { events, final: finals[0] };
}

function newNarrationEvents(snapshot, priorSnapshot) {
  const priorEventIds = new Set(priorSnapshot.narration.events.map((event) => event.id));
  return snapshot.narration.events.filter((event) => !priorEventIds.has(event.id));
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

async function assertNoPlaybackForEventIds(artifactDirectory, eventIds, label) {
  if (eventIds.length === 0) {
    return;
  }
  await delay(noSpeechObservationWindowMs);
  const observations = playbackObservations(
    await readJsonLinesWhileAppending(join(artifactDirectory, "renderer-console.jsonl")),
  );
  const matching = observationsForEventIds(observations, eventIds);
  if (matching.length > 0) {
    throw new Error(`${label} reached playback: ${JSON.stringify(matching)}`);
  }
}

function assertFirstStatusPlaybackPhase(observations, enqueuedStatuses, firstPlayedStatus) {
  if (
    enqueuedStatuses.length !== 2 ||
    enqueuedStatuses.some(
      (observation) =>
        observation.intent.kind !== "status_reply" ||
        observation.priority !== 4 ||
        typeof observation.queuePosition !== "number" ||
        observation.queuePosition < 1,
    )
  ) {
    throw new Error(
      `status replies did not enter the expected queue: ${JSON.stringify(enqueuedStatuses)}`,
    );
  }
  if (firstPlayedStatus.intent.kind !== "status_reply" || firstPlayedStatus.priority !== 4) {
    throw new Error(
      `first played event was not a status reply: ${JSON.stringify(firstPlayedStatus)}`,
    );
  }
  const firstCompletedIndex = observations.findIndex(
    (observation) =>
      observation.action === "completed" &&
      observation.intent.source.eventId === firstPlayedStatus.intent.source.eventId,
  );
  const secondQueuedStatus = enqueuedStatuses.find(
    (observation) => observation.intent.source.eventId !== firstPlayedStatus.intent.source.eventId,
  );
  const secondEnqueuedIndex = observations.findIndex(
    (observation) =>
      observation.action === "enqueued" &&
      observation.intent.source.eventId === secondQueuedStatus?.intent.source.eventId,
  );
  if (firstCompletedIndex !== -1 || secondEnqueuedIndex === -1) {
    throw new Error("the second status reply was not queued while the first was speaking");
  }
  const unexpectedPlay = observations.find(
    (observation) =>
      observation.action === "play" &&
      enqueuedStatuses.some(
        (enqueued) => enqueued.intent.source.eventId === observation.intent.source.eventId,
      ) &&
      observation.intent.kind !== "status_reply",
  );
  if (unexpectedPlay) {
    throw new Error(
      `non-status narration reached status playback: ${JSON.stringify(unexpectedPlay)}`,
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

function assertNarrationProviderRequestCount(requests, events, createdTopics, expectedCount) {
  const expected = expectedNarrationProviderRequests(events, createdTopics);
  const matching = requests.filter((request) =>
    expected.some(
      (candidate) =>
        request.path === "/v1/audio/speech" &&
        request.input === candidate.input &&
        request.speed === expectedSynthesisSpeed &&
        request.voice === candidate.voice,
    ),
  );
  if (matching.length !== expectedCount) {
    throw new Error(
      `narration provider requests were not serialized: ${JSON.stringify({ expected, matching, requests })}`,
    );
  }
}

function assertNoNarrationProviderRequests(requests, events, label) {
  const expected = expectedNarrationProviderRequests(events, []);
  const matching = requests.filter((request) =>
    expected.some(
      (candidate) =>
        request.path === "/v1/audio/speech" &&
        request.input === candidate.input &&
        request.speed === expectedSynthesisSpeed &&
        (candidate.voice === null || request.voice === candidate.voice),
    ),
  );
  if (matching.length > 0) {
    throw new Error(
      `${label} reached the speech provider: ${JSON.stringify({ expected, matching, requests })}`,
    );
  }
}

function expectedNarrationProviderRequests(events, createdTopics) {
  const topicsByConversationId = new Map(
    createdTopics.map((topic) => [topic.id, topic.narratorVoiceId]),
  );
  return events.map((event) => ({
    input: narrationEventText(event),
    voice: topicsByConversationId.get(event.conversationId) ?? null,
  }));
}

function narrationEventText(event) {
  if (event.kind === "status_reply" && typeof event.statusReply?.text === "string") {
    return event.statusReply.text;
  }
  if (event.kind === "final_summary" && typeof event.finalSummary?.text === "string") {
    return event.finalSummary.text;
  }
  throw new Error(`narration event has no speech text: ${JSON.stringify(event)}`);
}

function assertCompletedArbitration(observations, eventIds) {
  const relevant = observationsForEventIds(observations, eventIds);
  const enqueueOrder = observationsWithAction(relevant, "enqueued").map(
    (observation) => observation.intent.source.eventId,
  );
  const playOrder = observationsWithAction(relevant, "play").map(
    (observation) => observation.intent.source.eventId,
  );
  const completedOrder = observationsWithAction(relevant, "completed").map(
    (observation) => observation.intent.source.eventId,
  );
  const invalid = relevant.filter((observation) =>
    ["dropped", "failed", "preempted"].includes(observation.action),
  );
  if (
    enqueueOrder.length !== 2 ||
    JSON.stringify(playOrder) !== JSON.stringify(enqueueOrder) ||
    JSON.stringify(completedOrder) !== JSON.stringify(enqueueOrder) ||
    invalid.length > 0
  ) {
    throw new Error(
      `simultaneous status playback violated FIFO arbitration: ${JSON.stringify({ completedOrder, enqueueOrder, invalid, playOrder })}`,
    );
  }
  return { completedOrder, enqueueOrder, playOrder };
}
