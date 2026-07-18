#!/usr/bin/env node
/* global console */

import { readFile, rm, writeFile } from "node:fs/promises";
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
  conversationSurfaces,
  createTopic,
  hasReadyConversation,
} from "./topic-conversation-fork-workflow.mjs";
import { readJsonLinesWhileAppending } from "./topic-conversation-master-overlay-assertions.mjs";
import { safeTopicConversationSurfaceStates } from "./topic-conversation-speech-state-assertions.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "easy-button-presentation-recovery-phase0";
const workflowTimeoutMs = 35_000;
const speechRealtimeBrowserFixture = join(
  dirname(fileURLToPath(import.meta.url)),
  "speech-realtime-browser-fixture.js",
);
const suppliedDataset = [
  { language: "Go", lines: 34 },
  { language: "TypeScript", lines: 21 },
  { language: "CSS", lines: 8 },
];
const requestText =
  "Using the supplied language-counts dataset, produce a concise artifact baseline.";

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/easy-button-presentation-recovery-phase0.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir(workflowName);
await writeLatestRecordingPointer(workflowName, artifactDir);
const fixture = await createElectronFixture(workflowName);
await writeFile(
  join(fixture.workspaceRoot, "language-counts-baseline.json"),
  JSON.stringify(suppliedDataset, null, 2) + "\n",
);
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
  const topic = await createTopic(
    context.client,
    backend,
    workspaceId,
    "Recovery phase 0 baseline",
    workflowTimeoutMs,
  );
  await waitForConversationSurfaces(
    context.client,
    (surfaces) => hasReadyConversation(surfaces, topic.id),
    workflowTimeoutMs,
  );

  assertDriverAction(
    await context.client.driver("topicConversationSubmit", {
      conversationId: topic.id,
      text: requestText,
    }),
    "submitted",
  );

  const snapshot = await waitForConversationSnapshot(
    backend,
    workspaceId,
    topic.id,
    recoveryBaselineSnapshotReady,
    workflowTimeoutMs,
  );
  const readArtifact = await backend.post("/conversations/artifacts/read", {
    artifactId: snapshot.artifacts.artifacts[0].id,
    conversationId: topic.id,
    workspaceId,
  });
  const surface = await waitForConversationSurface(
    context.client,
    topic.id,
    (candidate) => candidate.state === "complete" && candidate.artifactCount >= 1,
    workflowTimeoutMs,
  );
  await context.client.driver("dispatchLayoutSnapshot", {
    trigger: "easy_button_presentation_recovery_phase0",
  });
  await captureScreenshot(context.client, join(artifactDir, "baseline-complete.png"));

  const scrollOwners = await context.client.driver("topicConversationRenderedScrollOwners", {
    conversationId: topic.id,
  });
  const playback = await waitForPlaybackBaseline(
    artifactDir,
    snapshot.narration.events.map((event) => event.id),
    workflowTimeoutMs,
  );
  const events = await readJsonLinesWhileAppending(join(artifactDir, "events.jsonl"));
  const baseline = summarizeBaseline({
    events,
    playback,
    readArtifact,
    scrollOwners,
    snapshot,
    surface,
    topic,
    workspaceId,
  });
  assertCurrentRecoveryBaseline(baseline);
  speechProvider.assertHealthy();

  await writeJson(join(artifactDir, "summary.json"), {
    ...baseline,
    artifactDir,
    status: "passed",
  });
  console.log(`Electron Easy Button recovery phase 0 baseline passed: ${artifactDir}`);
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

async function waitForConversationSurfaces(client, ready, timeoutMs) {
  return waitForState(
    client,
    driverCallExpression("topicConversationSurfaceStates", {}),
    (state) => ready(state.surfaces),
    timeoutMs,
  );
}

async function waitForConversationSurface(client, conversationId, ready, timeoutMs) {
  const state = await waitForConversationSurfaces(
    client,
    (surfaces) => {
      const surface = conversationSurfaces(surfaces, conversationId)[0];
      return Boolean(surface && ready(surface));
    },
    timeoutMs,
  );
  return conversationSurfaces(state.surfaces, conversationId)[0];
}

function waitForConversationSnapshot(backend, workspaceId, conversationId, ready, timeoutMs) {
  return waitForBackendState(
    async () => backend.post("/conversations/snapshot/read", { conversationId, workspaceId }),
    ready,
    timeoutMs,
  );
}

function recoveryBaselineSnapshotReady(snapshot) {
  return (
    snapshot.conversation.status === "idle" &&
    snapshot.turns.turns.some((turn) => turn.status === "completed") &&
    snapshot.artifacts.artifacts.length >= 1 &&
    snapshot.narration.events.some((event) => event.kind === "final_summary") &&
    snapshot.narratorState.observedThroughSequence === snapshot.conversation.lastTrajectorySequence
  );
}

async function waitForPlaybackBaseline(artifactDirectory, narrationIds, timeoutMs) {
  const expected = new Set(narrationIds);
  const startedAt = Date.now();
  let last = { observations: [], timedRecords: [] };
  while (Date.now() - startedAt < timeoutMs) {
    const records = await readJsonLinesWhileAppending(
      join(artifactDirectory, "renderer-console.jsonl"),
    );
    last = playbackObservations(records);
    if (
      last.observations.some(
        (observation) =>
          observation.action === "play" && expected.has(observation.intent?.source?.eventId),
      )
    ) {
      return last;
    }
    await delay(100);
  }
  throw new Error(`timed out waiting for recovery baseline playback: ${JSON.stringify(last)}`);
}

function playbackObservations(records) {
  const timedRecords = [];
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
    if (payload?.type !== "speech_playback") {
      continue;
    }
    observations.push(payload);
    timedRecords.push({ at: record.at, observation: payload });
  }
  return { observations, timedRecords };
}

function summarizeBaseline({
  events,
  playback,
  readArtifact,
  scrollOwners,
  snapshot,
  surface,
  topic,
  workspaceId,
}) {
  const narratorRecords = events
    .filter((event) => event.type === "narrator_output_observed")
    .map((event) => event.payload);
  const narrationCreatedAt = new Map(
    narratorRecords.map((record) => [record.narrationId, record.createdAt]),
  );
  return {
    artifactOutput: artifactOutput(snapshot),
    artifactReadOutput: artifactSummary(readArtifact),
    conversationId: topic.id,
    currentFocus: snapshot.narratorState.currentFocus,
    currentFocusRevision: snapshot.narratorState.currentFocusRevision,
    focusRevisionCount: snapshot.narratorState.currentFocusRevision,
    narratorEventCount: snapshot.narration.events.length,
    narratorEventKinds: countBy(snapshot.narration.events.map((event) => event.kind)),
    playbackLatencyMs: playbackLatency(playback.timedRecords, narrationCreatedAt),
    renderedScrollOwners: scrollOwners,
    requestText,
    suppliedDataset,
    surfaceArtifactText: surface.artifactText,
    surfaceSummaryText: surface.summaryText,
    trajectoryEventCount: snapshot.trajectory.events.length,
    workspaceId,
  };
}

function artifactOutput(snapshot) {
  return snapshot.artifacts.artifacts.map((artifact) => artifactSummary(artifact));
}

function artifactSummary(artifact) {
  return {
    barChart: artifact.barChart,
    file: artifact.file,
    id: artifact.id,
    kind: artifact.kind,
    keys: Object.keys(artifact).sort(),
    markdown: artifact.markdown,
    table: artifact.table,
    title: artifact.title,
  };
}

function countBy(values) {
  const counts = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function playbackLatency(records, narrationCreatedAt) {
  return records.flatMap((record) => {
    const eventId = record.observation.intent?.source?.eventId;
    const createdAt = narrationCreatedAt.get(eventId);
    if (!createdAt) {
      return [];
    }
    return [
      {
        action: record.observation.action,
        eventId,
        kind: record.observation.intent.kind,
        latencyMs: Date.parse(record.at) - Date.parse(createdAt),
      },
    ];
  });
}

function assertCurrentRecoveryBaseline(baseline) {
  assertRecoveryArtifactShape(baseline);
  assertRecoveryArtifactRendered(baseline);
  assertRecoveryNarrationRecorded(baseline);
  assertRecoverySpeechRecorded(baseline);
  assertRecoveryScrollOwnersRecorded(baseline);
}

function typedLanguageCountTable(artifact) {
  return (
    isTableArtifact(artifact) &&
    hasOnlyTablePayload(artifact) &&
    hasLanguageCountTable(artifact.table)
  );
}

function assertRecoveryArtifactShape(baseline) {
  const artifact = baseline.artifactOutput[0];
  if (typedLanguageCountTable(artifact) && typedLanguageCountTable(baseline.artifactReadOutput)) {
    return;
  }
  throw new Error(`recovery baseline artifact shape drifted: ${JSON.stringify(baseline)}`);
}

function assertRecoveryArtifactRendered(baseline) {
  const renderedTokens = ["Language line counts", "Go", "TypeScript"];
  if (renderedTokens.every((token) => baseline.surfaceArtifactText.includes(token))) {
    return;
  }
  throw new Error(`recovery baseline artifact did not render: ${JSON.stringify(baseline)}`);
}

function assertRecoveryNarrationRecorded(baseline) {
  if (baseline.narratorEventCount >= 2 && baseline.focusRevisionCount >= 1) {
    return;
  }
  throw new Error(`recovery baseline narration was not recorded: ${JSON.stringify(baseline)}`);
}

function assertRecoverySpeechRecorded(baseline) {
  if (baseline.playbackLatencyMs.some((entry) => entry.action === "play")) {
    return;
  }
  throw new Error(
    `recovery baseline speech playback was not recorded: ${JSON.stringify(baseline)}`,
  );
}

function assertRecoveryScrollOwnersRecorded(baseline) {
  if (baseline.renderedScrollOwners.length > 0) {
    return;
  }
  throw new Error(`recovery baseline scroll owners were not recorded: ${JSON.stringify(baseline)}`);
}

function isTableArtifact(artifact) {
  return artifact?.kind === "table" && artifact.table;
}

function hasOnlyTablePayload(artifact) {
  return artifact.markdown === null && artifact.barChart === null && artifact.file === null;
}

function hasLanguageCountTable(table) {
  return hasLanguageCountColumns(table) && hasLanguageCountRows(table);
}

function hasLanguageCountColumns(table) {
  return table?.columns?.map((column) => column.key).join(",") === "language,lines";
}

function hasLanguageCountRows(table) {
  return table?.rows?.length === suppliedDataset.length && table.rows[0]?.join(",") === "Go,34";
}
