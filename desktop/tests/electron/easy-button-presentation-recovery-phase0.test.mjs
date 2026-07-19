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
import { saveOpenAIVoiceCredentialThroughSettingsAndClose } from "./speech-credential-byok-workflow.mjs";
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
const artifactPolicyMatrix = [
  {
    expectedKinds: ["table", "bar_chart"],
    name: "table_plus_bar_chart",
    renderTokens: ["Language line counts", "Language line count chart", "Go"],
    text: "Using the supplied language-counts dataset, produce both a table and bar chart.",
    title: "Artifact policy table and bar",
  },
  {
    expectedKinds: ["markdown"],
    name: "qualitative_markdown",
    renderTokens: ["Release themes", "Reliability work"],
    text: "Using the supplied qualitative release notes, produce a durable qualitative summary.",
    title: "Artifact policy qualitative",
  },
  {
    expectedKinds: ["bar_chart"],
    name: "numeric_bar_chart",
    renderTokens: ["Regional case comparison", "North", "18 cases"],
    text: "Using the supplied numeric comparison, produce the appropriate quantitative deliverable.",
    title: "Artifact policy numeric",
  },
  {
    expectedKinds: ["file"],
    name: "generated_file",
    renderTokens: ["/tmp/setta-artifact-policy-memo.md", "Generated policy memo"],
    text: "Using the supplied generated file request, emit the generated file reference.",
    title: "Artifact policy file",
  },
  {
    expectedKinds: [],
    name: "no_artifact_conversation",
    renderTokens: [],
    text: "Using the supplied conversational answer request, answer without a durable deliverable.",
    title: "Artifact policy conversational",
  },
];

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
  const readArtifacts = await readSnapshotArtifacts(backend, workspaceId, topic.id, snapshot);
  const surface = await waitForConversationSurface(
    context.client,
    topic.id,
    (candidate) =>
      candidate.state === "complete" &&
      candidate.artifactCount >= 1 &&
      candidate.artifactText.includes("Go"),
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
  const artifactPolicy = await runArtifactPolicyMatrix({
    backend,
    client: context.client,
    workspaceId,
  });
  const events = await readJsonLinesWhileAppending(join(artifactDir, "events.jsonl"));
  const baseline = summarizeBaseline({
    artifactPolicy,
    events,
    playback,
    readArtifacts,
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

async function runArtifactPolicyMatrix({ backend, client, workspaceId }) {
  const results = [];
  for (const scenario of artifactPolicyMatrix) {
    const topic = await createTopic(
      client,
      backend,
      workspaceId,
      scenario.title,
      workflowTimeoutMs,
    );
    assertDriverAction(
      await client.driver("topicConversationSubmit", {
        conversationId: topic.id,
        text: scenario.text,
      }),
      "submitted",
    );
    const snapshot = await waitForConversationSnapshot(
      backend,
      workspaceId,
      topic.id,
      (candidate) => artifactPolicySnapshotReady(candidate, scenario.expectedKinds.length),
      workflowTimeoutMs,
    );
    const readArtifacts = await readSnapshotArtifacts(backend, workspaceId, topic.id, snapshot);
    const surface = await waitForConversationSurface(
      client,
      topic.id,
      (candidate) =>
        candidate.state === "complete" &&
        candidate.artifactCount === scenario.expectedKinds.length &&
        scenario.renderTokens.every((token) => candidate.artifactText.includes(token)),
      workflowTimeoutMs,
    );
    results.push({
      expectedKinds: scenario.expectedKinds,
      name: scenario.name,
      readArtifacts: readArtifacts.map((artifact) => artifactSummary(artifact)),
      renderedArtifactText: surface.artifactText,
      snapshotArtifacts: artifactOutput(snapshot),
    });
  }
  return results;
}

function artifactPolicySnapshotReady(snapshot, expectedArtifactCount) {
  return (
    snapshot.conversation.status === "idle" &&
    snapshot.turns.turns.some((turn) => turn.status === "completed") &&
    snapshot.artifacts.artifacts.length === expectedArtifactCount
  );
}

function readSnapshotArtifacts(backend, workspaceId, conversationId, snapshot) {
  return Promise.all(
    snapshot.artifacts.artifacts.map((artifact) =>
      backend.post("/conversations/artifacts/read", {
        artifactId: artifact.id,
        conversationId,
        workspaceId,
      }),
    ),
  );
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
    snapshot.artifacts.artifacts.length >= 2 &&
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
  artifactPolicy,
  events,
  playback,
  readArtifacts,
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
    artifactPolicy,
    artifactReadOutput: readArtifacts.map((artifact) => artifactSummary(artifact)),
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
    surfaceAgentText: surface.agentText,
    surfaceAgentTextPresent: surface.agentTextPresent,
    surfaceArtifactText: surface.artifactText,
    surfaceHelperPresent: surface.helperPresent,
    surfaceHelperText: surface.helperText,
    surfaceHighlightedMilestoneCount: surface.highlightedMilestoneCount,
    surfaceIntentState: surface.intentState,
    surfaceIntentText: surface.intentText,
    surfaceState: surface.state,
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
  assertArtifactPolicyMatrix(baseline);
  assertRecoveryNarrationRecorded(baseline);
  assertRecoverySpeechRecorded(baseline);
  assertRecoveryEasyButtonLayoutRecovered(baseline);
}

function typedLanguageCountTable(artifact) {
  return (
    isTableArtifact(artifact) &&
    hasOnlyTablePayload(artifact) &&
    hasLanguageCountTable(artifact.table)
  );
}

function assertRecoveryArtifactShape(baseline) {
  const metadataTable = baseline.artifactOutput.find((artifact) => artifact.kind === "table");
  const metadataBarChart = baseline.artifactOutput.find(
    (artifact) => artifact.kind === "bar_chart",
  );
  const readTable = baseline.artifactReadOutput.find((artifact) => artifact.kind === "table");
  const readBarChart = baseline.artifactReadOutput.find(
    (artifact) => artifact.kind === "bar_chart",
  );
  if (
    metadataArtifact(metadataTable, "table", "Language line counts") &&
    metadataArtifact(metadataBarChart, "bar_chart", "Language line count chart") &&
    typedLanguageCountTable(readTable) &&
    typedLanguageCountBarChart(readBarChart)
  ) {
    return;
  }
  throw new Error(`recovery baseline artifact shape drifted: ${JSON.stringify(baseline)}`);
}

function assertArtifactPolicyMatrix(baseline) {
  const resultByName = new Map(baseline.artifactPolicy.map((result) => [result.name, result]));
  assertArtifactPolicyResult(resultByName.get("table_plus_bar_chart"), {
    kinds: ["table", "bar_chart"],
    read: [typedLanguageCountTable, typedLanguageCountBarChart],
  });
  assertArtifactPolicyResult(resultByName.get("qualitative_markdown"), {
    kinds: ["markdown"],
    read: [
      (artifact) =>
        artifact?.kind === "markdown" && artifact.markdown?.markdown.includes("Release themes"),
    ],
  });
  assertArtifactPolicyResult(resultByName.get("numeric_bar_chart"), {
    kinds: ["bar_chart"],
    read: [(artifact) => artifact?.kind === "bar_chart" && artifact.barChart?.items.length === 3],
  });
  assertArtifactPolicyResult(resultByName.get("generated_file"), {
    kinds: ["file"],
    read: [
      (artifact) =>
        artifact?.kind === "file" && artifact.file?.path === "/tmp/setta-artifact-policy-memo.md",
    ],
  });
  const noArtifact = resultByName.get("no_artifact_conversation");
  if (
    noArtifact?.snapshotArtifacts.length === 0 &&
    noArtifact.readArtifacts.length === 0 &&
    noArtifact.renderedArtifactText === ""
  ) {
    return;
  }
  throw new Error(`no-artifact policy scenario drifted: ${JSON.stringify(baseline)}`);
}

function assertArtifactPolicyResult(result, expectation) {
  if (!result) {
    throw new Error(`artifact policy scenario was missing: ${JSON.stringify(expectation)}`);
  }
  const snapshotKinds = result.snapshotArtifacts.map((artifact) => artifact.kind).sort();
  const expectedKinds = [...expectation.kinds].sort();
  const metadataOnly = result.snapshotArtifacts.every((artifact) =>
    metadataArtifact(artifact, artifact.kind, artifact.title),
  );
  const readMatches = expectation.read.every((matches) => result.readArtifacts.some(matches));
  if (
    JSON.stringify(snapshotKinds) === JSON.stringify(expectedKinds) &&
    metadataOnly &&
    readMatches
  ) {
    return;
  }
  throw new Error(`artifact policy scenario drifted: ${JSON.stringify(result)}`);
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

function assertRecoveryEasyButtonLayoutRecovered(baseline) {
  if (baseline.surfaceHighlightedMilestoneCount > 5) {
    throw new Error(`NOW rail rendered too many milestones: ${JSON.stringify(baseline)}`);
  }
  if (baseline.surfaceIntentState !== "stable") {
    throw new Error(
      `central intent slot did not restore stable focus: ${JSON.stringify(baseline)}`,
    );
  }
  if (baseline.surfaceIntentText !== baseline.currentFocus) {
    throw new Error(
      `central intent slot text drifted from stable focus: ${JSON.stringify(baseline)}`,
    );
  }
  assertNoRedundantWorkingPresentation(baseline);
  const passiveScrollOwners = baseline.renderedScrollOwners.filter((owner) =>
    passiveRecoveryScrollOwner(owner),
  );
  if (passiveScrollOwners.length === 0) {
    return;
  }
  throw new Error(
    `recovery layout retained passive nested scroll owners: ${JSON.stringify({
      ...baseline,
      passiveScrollOwners,
    })}`,
  );
}

function assertNoRedundantWorkingPresentation(baseline) {
  if (baseline.surfaceAgentText !== "" || baseline.surfaceAgentTextPresent) {
    throw new Error(
      `recovery layout retained redundant agent body presentation: ${JSON.stringify(baseline)}`,
    );
  }
  if (retainedWorkingHelperPresentation(baseline)) {
    throw new Error(
      `recovery layout retained redundant working helper presentation: ${JSON.stringify(baseline)}`,
    );
  }
}

function retainedWorkingHelperPresentation(baseline) {
  if (baseline.surfaceHelperText === "Working") {
    return true;
  }
  if (baseline.surfaceState !== "working") {
    return false;
  }
  return baseline.surfaceHelperPresent || baseline.surfaceHelperText !== "";
}

function passiveRecoveryScrollOwner(owner) {
  const className = String(owner.className);
  return (
    className.includes("easy-button-rail-left") ||
    className.includes("easy-button-caption-slot") ||
    className.includes("easy-button-focus-block") ||
    className.includes("easy-button-current-focus") ||
    className.includes("easy-button-summary") ||
    className.includes("easy-button-error")
  );
}

function isTableArtifact(artifact) {
  return artifact?.kind === "table" && artifact.table;
}

function metadataArtifact(artifact, kind, title) {
  return (
    artifact?.kind === kind &&
    artifact.title === title &&
    !artifact.keys.includes("table") &&
    !artifact.keys.includes("markdown") &&
    !artifact.keys.includes("barChart") &&
    !artifact.keys.includes("file")
  );
}

function typedLanguageCountBarChart(artifact) {
  return (
    artifact?.kind === "bar_chart" &&
    artifact.barChart?.items.length === suppliedDataset.length &&
    artifact.barChart.items[0]?.label === "Go"
  );
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
