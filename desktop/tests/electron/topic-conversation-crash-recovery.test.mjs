#!/usr/bin/env node
/* global console */

import { readFile, rm } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { driverCallExpression } from "./cdp-client.mjs";
import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  crashElectronCdpContext,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  readJsonLinesOptional,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import {
  assertMasterRouteDecision,
  exerciseMasterOverlayEntryPoints,
  waitForMasterRouteDecision,
} from "./topic-conversation-master-overlay-assertions.mjs";
import {
  assertDriverAction,
  conversationSurfaces,
  createTopic,
} from "./topic-conversation-fork-workflow.mjs";
import {
  hasFinalNarrationForEveryTurn,
  narratorCaughtUp,
} from "./topic-conversation-projection-assertions.mjs";
import {
  openMasterOverlayForSpeech,
  safeTopicConversationSurfaceStates,
} from "./topic-conversation-speech-state-assertions.mjs";
import { startSpeechTranscriptionProviderFixture } from "./speech-transcription-provider-fixture.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "topic-conversation-crash-recovery";
const workflowTimeoutMs = 50_000;
const crashTranscript = "crash capture transcript";
const speechRealtimeBrowserFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "speech-realtime-browser-fixture.js",
);

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/topic-conversation-crash-recovery.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}
if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
const firstLaunchDir = join(artifactDir, "before-crash");
const secondLaunchDir = join(artifactDir, "after-crash");
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
const fakeCodex = await installFakeTopicCodex(fixture);
const speechProvider = await startSpeechTranscriptionProviderFixture();
let context = null;

try {
  context = await launchCrashIsolatedElectron({
    artifactDir: firstLaunchDir,
    fakeCodex,
    fixture,
    speechProvider,
    visible: options.visible,
  });
  await prepareRenderer(context.client);
  const backend = await backendProbe(firstLaunchDir);
  const workspaceId = await openWorkspace(context.client);

  const agentTopic = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Crash agent and branch topic",
    workflowTimeoutMs,
  );
  const narratorTopic = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Crash narrator and speech topic",
    workflowTimeoutMs,
  );
  await submitTopicInput(context.client, agentTopic.id, "seed crash branch");
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    agentTopic.id,
    (snapshot) => hasFinalNarrationForEveryTurn(snapshot) && narratorCaughtUp(snapshot),
  );

  await submitTopicInput(context.client, narratorTopic.id, "crash narrator");
  const narratorBeforeCrash = await waitForConversationSnapshot(
    backend,
    workspaceId,
    narratorTopic.id,
    (snapshot) =>
      snapshot.turns.turns.length === 1 &&
      snapshot.turns.turns[0]?.status === "completed" &&
      snapshot.narratorState.observedThroughSequence < snapshot.conversation.lastTrajectorySequence,
  );
  await waitForFakeCodexHold(fakeCodex.statePath, "narrator:crash-projection");

  await submitTopicInput(context.client, agentTopic.id, "hold crash agent");
  const agentBeforeCrash = await waitForConversationSnapshot(
    backend,
    workspaceId,
    agentTopic.id,
    (snapshot) =>
      snapshot.conversation.status === "working" &&
      snapshot.turns.turns.at(-1)?.status === "running",
  );
  const crashedAgentTurn = agentBeforeCrash.turns.turns.at(-1);
  if (!crashedAgentTurn?.providerTurnId) {
    throw new Error(
      `active crash turn omitted provider identity: ${JSON.stringify(agentBeforeCrash)}`,
    );
  }

  await submitTopicInput(context.client, agentTopic.id, "resume queued after crash");
  const queuedBeforeCrash = await waitForConversationSnapshot(
    backend,
    workspaceId,
    agentTopic.id,
    (snapshot) =>
      snapshot.queue.length === 1 &&
      snapshot.turns.turns.some(
        (turn) =>
          turn.delivery === "queued" &&
          turn.status === "queued" &&
          turn.authoredInput.text === "resume queued after crash",
      ),
  );
  const crashedQueuedTurn = queuedBeforeCrash.turns.turns.find(
    (turn) => turn.delivery === "queued" && turn.authoredInput.text === "resume queued after crash",
  );
  if (!crashedQueuedTurn) {
    throw new Error(`queued crash turn was not durable: ${JSON.stringify(queuedBeforeCrash)}`);
  }

  await submitTopicInput(context.client, agentTopic.id, "hold restart side");
  const branchBeforeCrash = await waitForConversationSnapshot(
    backend,
    workspaceId,
    agentTopic.id,
    (snapshot) =>
      snapshot.sideConversations.some(
        (side) =>
          side.status === "active" &&
          side.activeTurnId !== null &&
          side.activeProviderTurnId !== null,
      ),
  );
  const crashedSide = branchBeforeCrash.sideConversations.find(
    (side) => side.status === "active" && side.activeProviderTurnId !== null,
  );
  if (!crashedSide) {
    throw new Error(`active crash side was not durable: ${JSON.stringify(branchBeforeCrash)}`);
  }

  const unlinkedAgentTopic = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Crash before provider link topic",
    workflowTimeoutMs,
  );
  await submitTopicInput(context.client, unlinkedAgentTopic.id, "crash before provider link");
  await waitForFakeCodexTurnStartHold(fakeCodex.statePath, "agent:pre-provider-link");
  const unlinkedAgentBeforeCrash = await waitForConversationSnapshot(
    backend,
    workspaceId,
    unlinkedAgentTopic.id,
    (snapshot) =>
      snapshot.conversation.status === "working" &&
      snapshot.queue.length === 0 &&
      snapshot.turns.turns.length === 1 &&
      snapshot.turns.turns[0]?.status === "queued" &&
      snapshot.turns.turns[0]?.providerTurnId === null,
  );
  const unlinkedAgentTurn = unlinkedAgentBeforeCrash.turns.turns[0];

  const masterInput = await exerciseMasterOverlayEntryPoints({
    artifactDirectory: firstLaunchDir,
    client: context.client,
    text: "Crash master route.",
    timeoutMs: workflowTimeoutMs,
    workspaceId,
  });
  await waitForFakeCodexHold(fakeCodex.statePath, "master:crash-route");
  const masterBeforeCrash = await waitForBackendState(
    () => backend.post("/master/inputs/state/read", { inputId: masterInput.accepted.input.id }),
    (state) => state.status === "routing" && state.routingAttempt === 1,
    workflowTimeoutMs,
  );

  await installScriptedRealtimeBrowser(context.client, crashTranscript);
  const narratorPane = await waitForConversationSurface(
    context.client,
    narratorTopic.id,
    (surface) => surface.voiceCaptureAvailable,
  );
  assertDriverAction(
    await context.client.driver("topicConversationPresentFromNavigator", {
      conversationId: narratorTopic.id,
    }),
    "clicked",
  );
  await waitForState(
    context.client,
    driverCallExpression("topicConversationNavigatorState", {
      conversationId: narratorTopic.id,
    }),
    (state) => state.focusedPaneId === narratorPane.paneId && state.openViewCount === 1,
    workflowTimeoutMs,
  );
  assertDriverAction(
    await context.client.driver("topicConversationVoiceCapture", {
      conversationId: narratorTopic.id,
    }),
    "requested",
  );
  await waitForState(
    context.client,
    "globalThis.__settaSpeechRealtimeBrowserFixture.snapshot()",
    (state) => state.channelOpen && state.connectionCount === 1,
    workflowTimeoutMs,
  );
  await context.client.evaluate(
    `globalThis.__settaSpeechRealtimeBrowserFixture.emitTranscriptDelta(${JSON.stringify(crashTranscript)})`,
  );
  const speechBeforeCrash = await waitForConversationSurface(
    context.client,
    narratorTopic.id,
    (surface) =>
      surface.captureState === "listening" &&
      surface.speechTranscriptText.includes(crashTranscript),
  );
  if (speechBeforeCrash.paneId !== narratorPane.paneId) {
    throw new Error(
      `crash capture changed source panes: ${JSON.stringify({ narratorPane, speechBeforeCrash })}`,
    );
  }
  await assertCrashTranscriptWasNotSubmitted(firstLaunchDir, crashTranscript);
  await captureScreenshot(context.client, join(artifactDir, "all-operations-before-crash.png"));

  await crashElectronCdpContext(context);
  context = null;

  context = await launchCrashIsolatedElectron({
    artifactDir: secondLaunchDir,
    fakeCodex,
    fixture,
    speechProvider,
    visible: options.visible,
  });
  await prepareRenderer(context.client);
  await installScriptedRealtimeBrowser(context.client, crashTranscript);
  const restartedBackend = await backendProbe(secondLaunchDir);
  const restartedWorkspaceId = await openWorkspace(context.client);
  if (restartedWorkspaceId !== workspaceId) {
    throw new Error(
      `workspace changed after hard crash: ${JSON.stringify({ restartedWorkspaceId, workspaceId })}`,
    );
  }

  const masterAfterCrash = await waitForMasterRouteDecision(
    restartedBackend,
    masterInput.accepted.input.id,
    workflowTimeoutMs,
  );
  assertMasterRouteDecision(masterAfterCrash, {
    expectedInputId: masterInput.accepted.input.id,
    expectedKind: "answer_global",
    expectedRoutingAttempt: 2,
  });
  if (masterAfterCrash.routingAttempt !== 2) {
    throw new Error(
      `master crash recovery did not retry exactly once: ${JSON.stringify(masterAfterCrash)}`,
    );
  }

  const agentAfterCrash = await waitForConversationSnapshot(
    restartedBackend,
    workspaceId,
    agentTopic.id,
    (snapshot) =>
      snapshot.turns.turns.some(
        (turn) => turn.id === crashedAgentTurn.id && turn.status === "cancelled",
      ) &&
      snapshot.trajectory.events.some(
        (event) =>
          event.turnId === crashedAgentTurn.id &&
          event.kind === "turn_interrupted" &&
          event.turnInterrupted?.reason === "reconciliation",
      ) &&
      snapshot.turns.turns.some(
        (turn) => turn.id === crashedQueuedTurn.id && turn.status === "completed",
      ) &&
      snapshot.queue.length === 0,
  );
  const unlinkedAgentAfterCrash = await waitForConversationSnapshot(
    restartedBackend,
    workspaceId,
    unlinkedAgentTopic.id,
    (snapshot) => unlinkedAgentFailedAfterRestart(snapshot, unlinkedAgentTurn.id),
  );
  const branchAfterCrash = await waitForConversationSnapshot(
    restartedBackend,
    workspaceId,
    agentTopic.id,
    (snapshot) =>
      snapshot.sideConversations.some(
        (side) =>
          side.id === crashedSide.id &&
          side.status === "disposing" &&
          side.disposedAt !== null &&
          side.activeTurnId === null &&
          side.activeProviderTurnId === null,
      ) &&
      snapshot.sideEvents.events.some(
        (event) =>
          event.sideConversationId === crashedSide.id && event.event.kind === "turn_interrupted",
      ),
  );
  const narratorAfterCrash = await waitForConversationSnapshot(
    restartedBackend,
    workspaceId,
    narratorTopic.id,
    (snapshot) =>
      snapshot.narratorState.observedThroughSequence ===
        snapshot.conversation.lastTrajectorySequence &&
      snapshot.narration.events.some(
        (event) =>
          event.turnId === narratorBeforeCrash.turns.turns[0]?.id && event.kind === "final_summary",
      ),
  );
  await openMasterOverlayForSpeech(context.client, workflowTimeoutMs);
  const speechAfterCrash = await waitForState(
    context.client,
    driverCallExpression("topicConversationShellSpeechState", {}),
    speechSafelyResetAfterRestart,
    workflowTimeoutMs,
  );
  await assertCrashTranscriptWasNotSubmitted(firstLaunchDir, crashTranscript);
  await assertCrashTranscriptWasNotSubmitted(secondLaunchDir, crashTranscript, {
    requireSessionStart: false,
  });
  speechProvider.assertHealthy();
  await captureScreenshot(context.client, join(artifactDir, "all-operations-after-crash.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    agentAfterCrash,
    agentBeforeCrash,
    artifactDir,
    branchAfterCrash,
    branchBeforeCrash,
    crashedAgentTurnId: crashedAgentTurn.id,
    crashedQueuedTurnId: crashedQueuedTurn.id,
    crashedSideId: crashedSide.id,
    masterAfterCrash,
    masterBeforeCrash,
    narratorAfterCrash,
    narratorBeforeCrash,
    speechAfterCrash,
    speechBeforeCrash,
    status: "passed",
    unlinkedAgentAfterCrash,
    unlinkedAgentBeforeCrash,
    workspaceId,
  });
  console.log(`Electron topic conversation crash recovery workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      surfaces: await safeTopicConversationSurfaceStates(context.client),
    }).catch(() => {});
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

function launchCrashIsolatedElectron({ artifactDir, fakeCodex, fixture, speechProvider, visible }) {
  return launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      OPENAI_API_KEY: speechProvider.apiKey,
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_OPENAI_SPEECH_BASE_URL: speechProvider.baseURL,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    isolatedProcessGroup: true,
    visible,
  });
}

async function prepareRenderer(client) {
  await waitForSelector(client, '[data-testid="workspace-layout-area"]');
  await client.installDriver();
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

function speechSafelyResetAfterRestart(state) {
  return (
    state.captureState === "idle" &&
    state.captureLabel === "Start a voice request for Setta" &&
    state.captureAvailable &&
    state.playbackState === "idle" &&
    state.sourceConversationId === "" &&
    !state.stopAvailable &&
    state.transcriptText === ""
  );
}

function unlinkedAgentFailedAfterRestart(snapshot, turnId) {
  const [turn = {}] = snapshot.turns.turns;
  const { error = {} } = turn;
  return [
    snapshot.conversation.status === "failed",
    snapshot.turns.turns.length === 1,
    turn.id === turnId,
    turn.status === "failed",
    turn.startedAt === null,
    turn.providerTurnId === null,
    error.code === "agent_runtime_failed",
    error.retryable === true,
    String(error.message).includes("provider identity was not committed before restart"),
  ].every(Boolean);
}

async function submitTopicInput(client, conversationId, text) {
  assertDriverAction(
    await client.driver("topicConversationSubmit", { conversationId, text }),
    "submitted",
  );
}

function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    workflowTimeoutMs,
  );
}

async function waitForConversationSurface(client, conversationId, ready) {
  const state = await waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (candidate) => {
      const surface = conversationSurfaces(candidate.surfaces, conversationId)[0];
      return Boolean(surface && ready(surface));
    },
    workflowTimeoutMs,
  );
  return conversationSurfaces(state.surfaces, conversationId)[0];
}

async function waitForFakeCodexHold(statePath, key) {
  await waitForBackendState(
    async () => JSON.parse(await readFile(statePath, "utf8")),
    (state) => state.heldStructuredKeys?.includes(key) === true,
    workflowTimeoutMs,
  );
}

async function waitForFakeCodexTurnStartHold(statePath, key) {
  await waitForBackendState(
    async () => JSON.parse(await readFile(statePath, "utf8")),
    (state) => state.heldTurnStartKeys?.includes(key) === true,
    workflowTimeoutMs,
  );
}

async function installScriptedRealtimeBrowser(client, transcript) {
  await client.evaluate(await readFile(speechRealtimeBrowserFixture, "utf8"));
  await client.evaluate(
    `globalThis.__settaSpeechRealtimeBrowserFixture.setTranscript(${JSON.stringify(transcript)})`,
  );
}

async function assertCrashTranscriptWasNotSubmitted(
  artifactDirectory,
  transcript,
  { requireSessionStart = true } = {},
) {
  const events = await readJsonLinesOptional(join(artifactDirectory, "ipc.jsonl"));
  const sessionStarted = events.some(
    (event) =>
      event.type === "ipc_start" && event.channel === "speech:create-transcription-session",
  );
  const submitted = events.filter(
    (event) =>
      event.type === "ipc_start" &&
      ["conversation:submit-input", "master:submit-input"].includes(event.channel) &&
      event.args?.[0]?.input?.text === transcript,
  );
  if ((requireSessionStart && !sessionStarted) || submitted.length !== 0) {
    throw new Error(
      `crashed speech capture crossed a durable intake boundary: ${JSON.stringify({ sessionStarted, submitted })}`,
    );
  }
}
