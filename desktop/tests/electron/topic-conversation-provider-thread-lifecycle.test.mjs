#!/usr/bin/env node
/* global console */

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { basename, delimiter, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  openFixtureWorkspace,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import {
  assertDriverAction,
  conversationSurfaces,
  listTopics,
  waitForPersistedConversationPane,
} from "./topic-conversation-fork-workflow.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "topic-conversation-provider-thread-lifecycle";
const workflowTimeoutMs = 60_000;
const execFileAsync = promisify(execFile);
const viewport = {
  deviceScaleFactor: 1,
  height: 900,
  mobile: false,
  width: 1600,
};

if (options.help) {
  console.log(
    `Usage: node desktop/tests/electron/${basename(import.meta.url)} [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]`,
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
let context = null;
let launchIndex = 0;

try {
  let launch = await launchWorkflowElectron();
  context = launch.context;
  let backend = launch.backend;
  const workspaceId = await openWorkspace(context.client);
  await waitForInitialNavigator(backend, workspaceId);

  const created = await createConversationThroughHeader({
    backend,
    client: context.client,
    workspaceId,
  });
  const createdSnapshot = await readConversationSnapshot(backend, workspaceId, created.id);
  assertUnlinkedCreatedConversation(createdSnapshot);
  await waitForPersistedConversationPane(backend, workspaceId, created.id, workflowTimeoutMs);
  assertNoThreadStart(await readFakeCodexState(fakeCodex.statePath), "after new conversation");
  await captureScreenshot(context.client, join(launch.artifactDir, "created-unlinked.png"));

  await stopElectronCdpContext(context);
  context = null;

  launch = await launchWorkflowElectron();
  context = launch.context;
  backend = launch.backend;
  await openWorkspace(context.client);
  await presentConversation(context.client, created.id);
  await waitForConversationSurface(
    context.client,
    created.id,
    (surface) => surface.projectionStatus === "ready" && !surface.inputDisabled,
  );
  const reloadedBeforeInput = await readConversationSnapshot(backend, workspaceId, created.id);
  assertUnlinkedCreatedConversation(reloadedBeforeInput);
  await submitTopicInput(context.client, created.id, "provider lifecycle first turn");
  const firstCompleted = await waitForConversationSnapshot(
    backend,
    workspaceId,
    created.id,
    (snapshot) =>
      snapshot.threadBinding !== null &&
      snapshot.conversation.status === "idle" &&
      latestTurn(snapshot)?.status === "completed",
  );
  const providerThreadId = firstCompleted.threadBinding.threadId;
  assertFirstTurnProviderOrder(
    await readFakeCodexState(fakeCodex.statePath),
    providerThreadId,
    "provider lifecycle first turn",
  );

  await stopElectronCdpContext(context);
  context = null;

  launch = await launchWorkflowElectron();
  context = launch.context;
  backend = launch.backend;
  await openWorkspace(context.client);
  await presentConversation(context.client, created.id);
  await submitTopicInput(context.client, created.id, "provider lifecycle second turn");
  await waitForConversationSnapshot(
    backend,
    workspaceId,
    created.id,
    (snapshot) =>
      snapshot.threadBinding?.threadId === providerThreadId &&
      snapshot.conversation.status === "idle" &&
      latestTurn(snapshot)?.status === "completed" &&
      snapshot.turns.turns.length === 2,
  );
  const resumedState = await readFakeCodexState(fakeCodex.statePath);
  assertResumeBeforeTurnStart(
    resumedState,
    providerThreadId,
    "provider lifecycle second turn",
    resumedState.processGeneration,
  );
  assertProviderThreadRetainedContext(resumedState, providerThreadId, 2);

  const providerCrash = await exerciseSameBackendProviderCrash({
    backend,
    client: context.client,
    conversationId: created.id,
    providerThreadId,
    statePath: fakeCodex.statePath,
    workspaceId,
  });

  const concurrent = await exerciseConcurrentFirstSubmissions({
    backend,
    client: context.client,
    statePath: fakeCodex.statePath,
    workspaceId,
  });

  const staleBlank = await prepareStaleBlankThreadBinding({
    backend,
    client: context.client,
    workspaceId,
  });

  await stopElectronCdpContext(context);
  context = null;
  await seedStaleBlankBinding(
    fixture.appDataDir,
    staleBlank.conversationId,
    staleBlank.orphanThreadId,
  );

  launch = await launchWorkflowElectron();
  context = launch.context;
  backend = launch.backend;
  await openWorkspace(context.client);
  await presentConversation(context.client, staleBlank.conversationId);
  const staleBlankBeforeSequence = latestProviderMethodSequence(
    await readFakeCodexState(fakeCodex.statePath),
  );
  await submitTopicInput(context.client, staleBlank.conversationId, staleBlank.inputText);
  const staleBlankCompleted = await waitForConversationSnapshot(
    backend,
    workspaceId,
    staleBlank.conversationId,
    (snapshot) =>
      snapshot.threadBinding !== null &&
      snapshot.threadBinding.threadId !== staleBlank.orphanThreadId &&
      snapshot.conversation.status === "idle" &&
      snapshot.turns.turns.length === 1 &&
      latestTurn(snapshot)?.status === "completed",
  );
  assertStaleBlankBindingReplaced(
    await readFakeCodexState(fakeCodex.statePath),
    staleBlankBeforeSequence,
    staleBlank.orphanThreadId,
    staleBlankCompleted.threadBinding.threadId,
    staleBlank.inputText,
  );

  const missingHistorical = await prepareMissingHistoricalThread({
    backend,
    client: context.client,
    statePath: fakeCodex.statePath,
    workspaceId,
  });

  await stopElectronCdpContext(context);
  context = null;
  await removeDurableProviderThread(fakeCodex.statePath, missingHistorical.threadId);

  launch = await launchWorkflowElectron();
  context = launch.context;
  backend = launch.backend;
  await openWorkspace(context.client);
  await presentConversation(context.client, missingHistorical.conversationId);
  const missingBeforeSequence = latestProviderMethodSequence(
    await readFakeCodexState(fakeCodex.statePath),
  );
  await submitTopicInput(
    context.client,
    missingHistorical.conversationId,
    "missing historical continuation",
  );
  const missingFailed = await waitForConversationSnapshot(
    backend,
    workspaceId,
    missingHistorical.conversationId,
    (snapshot) => missingHistoricalThreadFailed(snapshot, missingHistorical.threadId),
  );
  const missingState = await readFakeCodexState(fakeCodex.statePath);
  assertMissingHistoricalProviderState(
    missingState,
    missingBeforeSequence,
    missingHistorical.threadId,
    "missing historical continuation",
  );

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    concurrent,
    createdConversationId: created.id,
    missingHistorical: {
      conversationId: missingHistorical.conversationId,
      failedTurnId: latestTurn(missingFailed)?.id ?? null,
      threadId: missingHistorical.threadId,
    },
    providerThreadId,
    providerCrash,
    staleBlank: {
      conversationId: staleBlank.conversationId,
      orphanThreadId: staleBlank.orphanThreadId,
      providerThreadId: staleBlankCompleted.threadBinding.threadId,
    },
    status: "passed",
    workspaceId,
  });
  console.log(`Electron provider thread lifecycle workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      fakeCodex: await safeReadFakeCodexState(fakeCodex.statePath),
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
}

async function launchWorkflowElectron() {
  launchIndex += 1;
  const launchArtifactDir = join(artifactDir, `launch-${launchIndex}`);
  const launched = await launchElectronCdpContext({
    artifactDir: launchArtifactDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    unsetEnv: ["OPENAI_API_KEY"],
    visible: options.visible,
  });
  await launched.client.call("Emulation.setDeviceMetricsOverride", viewport);
  await waitForSelector(launched.client, '[data-testid="workspace-layout-area"]');
  await launched.client.installDriver();
  const backend = await backendProbe(launchArtifactDir);
  return { artifactDir: launchArtifactDir, backend, context: launched };
}

async function openWorkspace(client) {
  const initial = await waitForState(
    client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId: "" }),
    (state) => state.openButtonReady || validWorkspaceId(state.workspaceId),
    workflowTimeoutMs,
  );
  if (!validWorkspaceId(initial.workspaceId)) {
    await openFixtureWorkspace(client, workflowTimeoutMs);
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

async function waitForInitialNavigator(backend, workspaceId) {
  await waitForBackendState(
    () => listTopics(backend, workspaceId),
    (page) => page.items.length >= 1,
    workflowTimeoutMs,
  );
}

async function createConversationThroughHeader({ backend, client, workspaceId }) {
  const before = await listTopics(backend, workspaceId);
  const beforeIds = new Set(before.items.map((item) => item.conversation.id));
  assertDriverAction(
    await client.driver("topicConversationClickNewConversationHeader", { clicks: 1 }),
    "clicked",
  );
  const page = await waitForBackendState(
    () => listTopics(backend, workspaceId),
    (current) => newConversationItems(current, beforeIds).length === 1,
    workflowTimeoutMs,
  );
  const item = newConversationItems(page, beforeIds)[0];
  await waitForConversationSurface(
    client,
    item.conversation.id,
    (surface) => surface.projectionStatus === "ready" && !surface.inputDisabled,
  );
  return { id: item.conversation.id, title: item.conversation.title };
}

function newConversationItems(page, beforeIds) {
  return page.items.filter((item) => !beforeIds.has(item.conversation.id));
}

async function presentConversation(client, conversationId) {
  assertDriverAction(
    await client.driver("topicConversationPresentFromNavigator", { conversationId }),
    "clicked",
  );
}

async function submitTopicInput(client, conversationId, text) {
  assertDriverAction(
    await client.driver("topicConversationSubmit", { conversationId, text }),
    "submitted",
  );
}

function readConversationSnapshot(backend, workspaceId, conversationId) {
  return backend.post("/conversations/snapshot/read", { conversationId, workspaceId });
}

function waitForConversationSnapshot(backend, workspaceId, conversationId, ready) {
  return waitForBackendState(
    () => readConversationSnapshot(backend, workspaceId, conversationId),
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

function assertUnlinkedCreatedConversation(snapshot) {
  const valid = [
    snapshot.conversation.status === "idle",
    snapshot.threadBinding === null,
    snapshot.turns.turns.length === 0,
    snapshot.narratorState?.status === "ready",
    snapshot.presentationProfile?.conversationId === snapshot.conversation.id,
  ].every(Boolean);
  if (!valid) {
    throw new Error(`new conversation was not provider-independent: ${JSON.stringify(snapshot)}`);
  }
}

async function exerciseConcurrentFirstSubmissions({ backend, client, statePath, workspaceId }) {
  const before = await readFakeCodexState(statePath);
  const conversation = await createConversationThroughHeader({ backend, client, workspaceId });
  await Promise.allSettled([
    client.driver("topicConversationSubmit", {
      conversationId: conversation.id,
      text: "concurrent first submission A",
    }),
    client.driver("topicConversationSubmit", {
      conversationId: conversation.id,
      text: "concurrent first submission B",
    }),
  ]);
  const completed = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversation.id,
    (snapshot) =>
      snapshot.threadBinding !== null &&
      snapshot.conversation.status === "idle" &&
      snapshot.turns.turns.length >= 1 &&
      snapshot.turns.turns.every((turn) => ["completed", "failed"].includes(turn.status)),
  );
  const after = await readFakeCodexState(statePath);
  const methods = providerMethodsAfter(after, latestProviderMethodSequence(before));
  const newMaterializations = methods.filter((entry) => entry.method === "thread/inject_items");
  if (
    newMaterializations.length !== 1 ||
    newMaterializations[0].threadId !== completed.threadBinding.threadId
  ) {
    throw new Error(
      `concurrent first submissions materialized multiple topic threads: ${JSON.stringify({
        completed,
        materializations: newMaterializations,
        methodLog: after.methodLog,
      })}`,
    );
  }
  return {
    conversationId: conversation.id,
    providerThreadId: completed.threadBinding.threadId,
    materializedThreadId: newMaterializations[0].threadId,
    turnCount: completed.turns.turns.length,
  };
}

async function prepareMissingHistoricalThread({ backend, client, statePath, workspaceId }) {
  const conversation = await createConversationThroughHeader({ backend, client, workspaceId });
  await submitTopicInput(client, conversation.id, "missing historical foundation");
  const completed = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversation.id,
    (snapshot) =>
      snapshot.threadBinding !== null &&
      snapshot.conversation.status === "idle" &&
      latestTurn(snapshot)?.status === "completed",
  );
  const state = await readFakeCodexState(statePath);
  assertProviderThreadRetainedContext(state, completed.threadBinding.threadId, 1);
  return {
    conversationId: conversation.id,
    threadId: completed.threadBinding.threadId,
  };
}

async function prepareStaleBlankThreadBinding({ backend, client, workspaceId }) {
  const conversation = await createConversationThroughHeader({ backend, client, workspaceId });
  await waitForPersistedConversationPane(backend, workspaceId, conversation.id, workflowTimeoutMs);
  assertUnlinkedCreatedConversation(
    await readConversationSnapshot(backend, workspaceId, conversation.id),
  );
  return {
    conversationId: conversation.id,
    inputText: "stale blank binding first turn",
    orphanThreadId: `orphan-blank-${conversation.id}`,
  };
}

async function seedStaleBlankBinding(appDataDir, conversationId, threadId) {
  const databasePath = join(appDataDir, "topic-conversations-v3", "conversations.sqlite");
  await execFileAsync("sqlite3", [
    databasePath,
    `
INSERT INTO agent_thread_bindings (
  conversation_id, provider, thread_id, status, created_at, last_resumed_at,
  last_turn_id, provider_metadata_json
)
SELECT id, 'codex', ${sqlString(threadId)}, 'linked', created_at, NULL, NULL, '{}'
FROM conversations
WHERE id = ${sqlString(conversationId)};
`,
  ]);
}

function assertStaleBlankBindingReplaced(
  state,
  beforeSequence,
  orphanThreadId,
  replacementThreadId,
  inputText,
) {
  const methods = providerMethodsAfter(state, beforeSequence);
  const orphanUsage = methods.filter(
    (entry) =>
      entry.threadId === orphanThreadId &&
      ["thread/resume", "thread/inject_items", "turn/start"].includes(entry.method),
  );
  const replacementStarts = methods.filter(
    (entry) => entry.method === "thread/start" && entry.threadId === replacementThreadId,
  );
  const replacementMaterializations = methods.filter(
    (entry) => entry.method === "thread/inject_items" && entry.threadId === replacementThreadId,
  );
  const replacementTurnStarts = methods.filter(
    (entry) =>
      entry.method === "turn/start" &&
      entry.threadId === replacementThreadId &&
      entry.inputText === inputText,
  );
  if (
    orphanUsage.length !== 0 ||
    replacementStarts.length !== 1 ||
    replacementMaterializations.length !== 1 ||
    replacementTurnStarts.length !== 1
  ) {
    throw new Error(
      `stale blank binding was not replaced before first turn: ${JSON.stringify({
        methods,
        orphanThreadId,
        orphanUsage,
        replacementMaterializations,
        replacementStarts,
        replacementThreadId,
        replacementTurnStarts,
      })}`,
    );
  }
  assertFirstTurnProviderOrder(state, replacementThreadId, inputText);
}

function missingHistoricalThreadFailed(snapshot, threadId) {
  const turn = latestTurn(snapshot);
  return [
    snapshot.threadBinding?.threadId === threadId,
    snapshot.threadBinding?.status === "missing",
    snapshot.conversation.status === "failed",
    turn?.status === "failed",
    turn?.providerTurnId === null,
    turn?.error?.code === "provider_thread_missing",
    turn?.error?.retryable === false,
  ].every(Boolean);
}

function assertNoThreadStart(state, description) {
  const starts = state.methodLog.filter((entry) => entry.method === "thread/start");
  if (starts.length !== 0) {
    throw new Error(
      `${description} unexpectedly started provider threads: ${JSON.stringify(starts)}`,
    );
  }
}

async function exerciseSameBackendProviderCrash({
  backend,
  client,
  conversationId,
  providerThreadId,
  statePath,
  workspaceId,
}) {
  const crash = await completeCachedProviderCrashTrigger({
    backend,
    client,
    conversationId,
    providerThreadId,
    statePath,
    workspaceId,
  });
  await waitForBackendState(
    () => readFakeCodexState(statePath),
    (state) => (state.crashCounter ?? 0) > crash.beforeCrashCount,
    workflowTimeoutMs,
  );
  await delay(250);
  return completeProviderCrashContinuation({
    backend,
    client,
    conversationId,
    providerThreadId,
    statePath,
    workspaceId,
  });
}

async function completeCachedProviderCrashTrigger({
  backend,
  client,
  conversationId,
  providerThreadId,
  statePath,
  workspaceId,
}) {
  const beforeSnapshot = await readConversationSnapshot(backend, workspaceId, conversationId);
  const lastResumedAt = beforeSnapshot.threadBinding?.lastResumedAt ?? null;
  const beforeState = await readFakeCodexState(statePath);
  const beforeSequence = latestProviderMethodSequence(beforeState);
  await submitTopicInput(client, conversationId, "provider lifecycle crash idle turn");
  const cachedTurn = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) => completedProviderTurnSnapshot(snapshot, providerThreadId, 3),
  );
  if ((cachedTurn.threadBinding?.lastResumedAt ?? null) !== lastResumedAt) {
    throw new Error(
      `cache hit updated lastResumedAt without a provider resume: ${JSON.stringify({
        after: cachedTurn.threadBinding,
        before: beforeSnapshot.threadBinding,
      })}`,
    );
  }
  const cachedState = await readFakeCodexState(statePath);
  assertCacheHitTurnStartedWithoutResume(
    cachedState,
    beforeSequence,
    providerThreadId,
    "provider lifecycle crash idle turn",
  );
  return { beforeCrashCount: beforeState.crashCounter ?? 0 };
}

async function completeProviderCrashContinuation({
  backend,
  client,
  conversationId,
  providerThreadId,
  statePath,
  workspaceId,
}) {
  const afterCrashBeforeSequence = latestProviderMethodSequence(
    await readFakeCodexState(statePath),
  );
  await submitTopicInput(client, conversationId, "provider lifecycle after provider crash");
  const continued = await waitForConversationSnapshot(
    backend,
    workspaceId,
    conversationId,
    (snapshot) => completedProviderTurnSnapshot(snapshot, providerThreadId, 4),
  );
  const afterCrashState = await readFakeCodexState(statePath);
  const turnStart = providerMethodsAfter(afterCrashState, afterCrashBeforeSequence).find((entry) =>
    providerCrashContinuationTurnStart(entry, providerThreadId),
  );
  if (!turnStart) {
    throw new Error(
      `provider crash continuation did not reach turn/start: ${JSON.stringify(
        afterCrashState.methodLog,
      )}`,
    );
  }
  assertResumeBeforeTurnStart(
    afterCrashState,
    providerThreadId,
    "provider lifecycle after provider crash",
    turnStart.generation,
  );
  assertProviderThreadRetainedContext(afterCrashState, providerThreadId, 4);
  return {
    crashCounter: afterCrashState.crashCounter ?? 0,
    generation: turnStart.generation,
    lastTurnId: latestTurn(continued)?.id ?? null,
  };
}

function completedProviderTurnSnapshot(snapshot, providerThreadId, turnCount) {
  return (
    snapshot.threadBinding?.threadId === providerThreadId &&
    snapshot.conversation.status === "idle" &&
    latestTurn(snapshot)?.status === "completed" &&
    snapshot.turns.turns.length === turnCount
  );
}

function providerCrashContinuationTurnStart(entry, providerThreadId) {
  return (
    entry.method === "turn/start" &&
    entry.threadId === providerThreadId &&
    entry.inputText === "provider lifecycle after provider crash"
  );
}

function assertCacheHitTurnStartedWithoutResume(state, beforeSequence, threadId, inputText) {
  const methods = providerMethodsAfter(state, beforeSequence);
  const resumes = methods.filter(
    (entry) => entry.method === "thread/resume" && entry.threadId === threadId,
  );
  const starts = methods.filter(
    (entry) =>
      entry.method === "turn/start" && entry.threadId === threadId && entry.inputText === inputText,
  );
  if (resumes.length !== 0 || starts.length !== 1) {
    throw new Error(
      `cache hit did not use the already-loaded provider thread exactly once: ${JSON.stringify({
        methods,
        resumes,
        starts,
      })}`,
    );
  }
}

function assertFirstTurnProviderOrder(state, threadId, inputText) {
  const generation = state.methodLog.find(
    (entry) => entry.method === "thread/start" && entry.threadId === threadId,
  )?.generation;
  if (!Number.isInteger(generation)) {
    throw new Error(
      `thread/start was not recorded for ${threadId}: ${JSON.stringify(state.methodLog)}`,
    );
  }
  assertProviderMethodOrder(
    state,
    generation,
    [
      { method: "thread/start", threadId },
      { method: "thread/inject_items", threadId },
      { inputText, method: "turn/start", threadId },
    ],
    "first turn provider materialization order",
  );
}

function assertResumeBeforeTurnStart(state, threadId, inputText, generation) {
  const resume = state.methodLog.find(
    (entry) =>
      entry.generation === generation &&
      entry.method === "thread/resume" &&
      entry.threadId === threadId,
  );
  if (!resume || resume.excludeTurns !== true) {
    throw new Error(
      `continuation resume did not exclude turns: ${JSON.stringify({ resume, state })}`,
    );
  }
  assertProviderMethodOrder(
    state,
    generation,
    [
      { method: "thread/resume", threadId },
      { inputText, method: "turn/start", threadId },
    ],
    "resume before continuation turn/start",
  );
}

function assertProviderMethodOrder(state, generation, expected, description) {
  const methods = state.methodLog.filter((entry) => entry.generation === generation);
  let cursor = 0;
  for (const entry of methods) {
    if (cursor < expected.length && providerMethodMatches(entry, expected[cursor])) {
      cursor += 1;
    }
  }
  if (cursor !== expected.length) {
    throw new Error(
      `${description} drifted: ${JSON.stringify({ expected, generation, methodLog: state.methodLog })}`,
    );
  }
}

function providerMethodMatches(entry, expected) {
  return (
    entry.method === expected.method &&
    (expected.threadId === undefined || entry.threadId === expected.threadId) &&
    (expected.inputText === undefined || entry.inputText === expected.inputText)
  );
}

function assertProviderThreadRetainedContext(state, threadId, minTurnCount) {
  const thread = state.threads.find((candidate) => candidate.id === threadId);
  if (!thread || !Array.isArray(thread.turnIds) || thread.turnIds.length < minTurnCount) {
    throw new Error(
      `provider thread did not retain context: ${JSON.stringify({ minTurnCount, thread, threadId })}`,
    );
  }
}

function assertMissingHistoricalProviderState(state, beforeSequence, threadId, inputText) {
  const methods = providerMethodsAfter(state, beforeSequence);
  const resumes = methods.filter(
    (entry) => entry.method === "thread/resume" && entry.threadId === threadId,
  );
  const reads = methods.filter((entry) => entry.method === "thread/read");
  const lists = methods.filter((entry) => entry.method === "thread/list");
  const materializations = methods.filter((entry) => entry.method === "thread/inject_items");
  const turnStarts = methods.filter(
    (entry) => entry.method === "turn/start" && entry.inputText === inputText,
  );
  if (
    resumes.length !== 1 ||
    resumes[0].excludeTurns !== true ||
    reads.length !== 0 ||
    lists.length !== 2 ||
    lists[0].archived !== false ||
    lists[1].archived !== true ||
    materializations.length !== 0 ||
    turnStarts.length !== 0
  ) {
    throw new Error(
      `missing historical provider failure replayed or replaced input: ${JSON.stringify({
        lists,
        materializations,
        methods,
        reads,
        resumes,
        turnStarts,
      })}`,
    );
  }
  assertProviderMethodOrder(
    state,
    resumes[0].generation,
    [{ method: "thread/resume", threadId }, { method: "thread/list" }, { method: "thread/list" }],
    "missing historical provider existence check order",
  );
}

function providerMethodsAfter(state, sequence) {
  return state.methodLog.filter((entry) => entry.sequence > sequence);
}

function latestProviderMethodSequence(state) {
  return state.methodLog.reduce((max, entry) => Math.max(max, entry.sequence ?? 0), 0);
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function readFakeCodexState(path) {
  try {
    const state = JSON.parse(await readFile(path, "utf8"));
    return { crashCounter: 0, ...state };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { crashCounter: 0, methodLog: [], processGeneration: 0, threads: [] };
    }
    throw error;
  }
}

async function safeReadFakeCodexState(path) {
  try {
    return await readFakeCodexState(path);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function removeDurableProviderThread(path, threadId) {
  const state = await readFakeCodexState(path);
  state.threads = state.threads.filter((thread) => thread.id !== threadId);
  await writeFile(path, `${JSON.stringify(state)}\n`, "utf8");
}

function latestTurn(snapshot) {
  return snapshot.turns.turns.at(-1) ?? null;
}

async function safeTopicConversationSurfaceStates(client) {
  try {
    return await client.driver("topicConversationSurfaceStates", {});
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
