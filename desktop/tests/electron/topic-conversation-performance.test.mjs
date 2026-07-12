#!/usr/bin/env node
/* global console */

import { basename, delimiter, join } from "node:path";
import process from "node:process";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  startChromiumTrace,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { backendProbe, waitForBackendState } from "./electron-workflow-harness.mjs";
import { installFakeTopicCodex } from "./fake-topic-codex-fixture.mjs";
import { assertSmoothFrameSample, frameBudgetSummary } from "./performance-frame-budget.mjs";
import { assertDriverAction, createTopic } from "./topic-conversation-fork-workflow.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "topic-conversation-performance";
const workflowTimeoutMs = 60_000;
const conversationCount = 4;
const eventsPerConversation = 640;
const profiledRuntimeStates = new Set(["live", "live-throttled", "snapshot"]);
const viewport = {
  deviceScaleFactor: 1,
  height: 1000,
  mobile: false,
  width: 5200,
};

if (options.help) {
  console.log(
    `Usage: node desktop/tests/electron/${basename(import.meta.url)} [--skip-build] [--visible] [--keep-artifacts] [--trace] [--artifact-dir <dir>]`,
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
let performanceResult = null;
let trace = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      PATH: `${fakeCodex.binDir}${delimiter}${process.env.PATH ?? ""}`,
      SETTA_E2E_TOPIC_CODEX_STATE_PATH: fakeCodex.statePath,
    },
    fixture,
    visible: options.visible,
  });
  await context.client.call("Emulation.setDeviceMetricsOverride", viewport);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  const backend = await backendProbe(artifactDir);
  const workspaceId = await openWorkspace(context.client);
  const conversations = [];
  for (let index = 0; index < conversationCount; index += 1) {
    conversations.push(
      await createTopic(
        context.client,
        backend,
        workspaceId,
        `Performance topic ${index + 1}`,
        workflowTimeoutMs,
      ),
    );
  }
  const ready = await waitForPerformanceState(
    context.client,
    (snapshot) =>
      representedPaneCount(snapshot) === conversationCount &&
      snapshot.surfaces.every(
        (surface) =>
          surface.projectionStatus === "ready" &&
          profiledRuntimeStates.has(surface.runtimeState) &&
          surface.visible,
      ) &&
      snapshot.surfaces.some((surface) => surface.runtimeState === "live"),
  );
  const initialSnapshots = await readSnapshots(backend, conversations, workspaceId);
  await captureScreenshot(context.client, join(artifactDir, "multiple-panes-before-stream.png"));
  const started = await context.client.driver("topicConversationPerformanceStart");
  if (!started.ok) {
    throw new Error(`topic conversation profiler did not start: ${JSON.stringify(started)}`);
  }
  if (options.trace) {
    trace = await startChromiumTrace(context.client, join(artifactDir, "chromium-trace.json"));
  }
  for (const [index, conversation] of conversations.entries()) {
    assertDriverAction(
      await context.client.driver("topicConversationPresentFromNavigator", {
        conversationId: conversation.id,
      }),
      "clicked",
    );
    await waitForPerformanceState(context.client, (snapshot) =>
      snapshot.surfaces.some(
        (surface) =>
          surface.conversationId === conversation.id &&
          surface.projectionStatus === "ready" &&
          surface.runtimeState === "live",
      ),
    );
    assertDriverAction(
      await context.client.driver("topicConversationSubmit", {
        conversationId: conversation.id,
        text: `Profile exactly ${eventsPerConversation} conversation events for pane ${index + 1}.`,
      }),
      "submitted",
    );
  }
  const snapshots = await waitForBackendState(
    () => readSnapshots(backend, conversations, workspaceId),
    (current) =>
      current.every(
        (snapshot) =>
          snapshot.conversation.status === "idle" &&
          snapshot.conversation.lastTrajectorySequence > eventsPerConversation,
      ),
    workflowTimeoutMs,
  );
  await waitForPerformanceState(context.client, (snapshot) =>
    snapshot.surfaces.some(
      (surface) =>
        surface.conversationId === conversations.at(-1)?.id &&
        surface.eventCursorSequence > eventsPerConversation &&
        surface.projectionStatus === "ready" &&
        surface.state === "complete",
    ),
  );
  const stopped = await context.client.driver("topicConversationPerformanceStop");
  if (!stopped.ok) {
    throw new Error(`topic conversation profiler did not stop: ${JSON.stringify(stopped)}`);
  }
  const traceResult = trace ? await trace.stop() : null;
  trace = null;
  const profiledPanes = await readProfiledPanes(context.client, conversations);
  assertProfiledSnapshots(snapshots);
  assertProfiledPanes(profiledPanes, snapshots);
  const cursorDelta = snapshotCursorTotal(snapshots) - snapshotCursorTotal(initialSnapshots);
  const throughputEventsPerSecond = cursorDelta / (stopped.sample.durationMs / 1000);
  await captureScreenshot(context.client, join(artifactDir, "multiple-panes-after-stream.png"));
  performanceResult = {
    artifactDir,
    conversationCount,
    cursorDelta,
    eventsPerConversation,
    final: stopped.final,
    frameBudget: frameBudgetSummary(stopped.sample),
    initial: ready,
    panes: profiledPanes,
    sample: stopped.sample,
    snapshots: snapshots.map(snapshotSummary),
    status: "measured",
    throughputEventsPerSecond,
    trace: traceResult,
    viewport,
    workspaceId,
    workspaceName: basename(fixture.workspaceRoot),
  };
  await writeJson(join(artifactDir, "summary.json"), performanceResult);
  assertBatchedProjectionMutations(stopped.sample, cursorDelta);
  assertSmoothFrameSample(stopped.sample, "large topic conversation streams", {
    minFrameCount: 30,
  });
  performanceResult.status = "passed";
  await writeJson(join(artifactDir, "summary.json"), performanceResult);
  console.log(
    `Electron topic conversation performance passed: ${artifactDir} events=${cursorDelta} p95=${stopped.sample.p95FrameDeltaMs.toFixed(2)}ms`,
  );
} catch (error) {
  if (trace) {
    await trace.stop().catch(() => {});
  }
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
  }
  await writeJson(join(artifactDir, "summary.json"), {
    ...performanceResult,
    artifactDir,
    error: error instanceof Error ? error.message : String(error),
    status: "failed",
  });
  throw error;
} finally {
  await stopElectronCdpContext(context);
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

function waitForPerformanceState(client, ready) {
  return waitForState(
    client,
    driverCallExpression("topicConversationPerformanceSnapshot"),
    ready,
    workflowTimeoutMs,
  );
}

function readSnapshots(backend, conversations, workspaceId) {
  return Promise.all(
    conversations.map((conversation) =>
      backend.post("/conversations/snapshot/read", {
        conversationId: conversation.id,
        workspaceId,
      }),
    ),
  );
}

async function readProfiledPanes(client, conversations) {
  const panes = [];
  for (const conversation of conversations) {
    assertDriverAction(
      await client.driver("topicConversationPresentFromNavigator", {
        conversationId: conversation.id,
      }),
      "clicked",
    );
    const snapshot = await waitForPerformanceState(client, (current) =>
      current.surfaces.some(
        (surface) =>
          surface.conversationId === conversation.id &&
          surface.eventCursorSequence > eventsPerConversation &&
          surface.projectionStatus === "ready" &&
          surface.runtimeState === "live" &&
          surface.state === "complete",
      ),
    );
    const pane = snapshot.surfaces.find((surface) => surface.conversationId === conversation.id);
    if (!pane) {
      throw new Error(`profiled pane disappeared: ${conversation.id}`);
    }
    panes.push(pane);
  }
  return panes;
}

function representedPaneCount(snapshot) {
  return snapshot.surfaces.length + snapshot.snapshotTextureCount;
}

function assertBatchedProjectionMutations(sample, cursorDelta) {
  const maximumMutationCallbacks = Math.floor(cursorDelta / 2);
  if (sample.mutations.callbackCount >= maximumMutationCallbacks) {
    throw new Error(
      `conversation projection mutations were not frame-batched: ${JSON.stringify({ maximumMutationCallbacks, mutations: sample.mutations })}`,
    );
  }
}

function assertProfiledSnapshots(snapshots) {
  for (const snapshot of snapshots) {
    if (
      snapshot.conversation.lastTrajectorySequence <= eventsPerConversation ||
      snapshot.trajectory.events.length <= 0 ||
      snapshot.trajectory.events.length >= eventsPerConversation ||
      !snapshot.trajectory.hasEarlier
    ) {
      throw new Error(
        `profiled snapshot is not a bounded latest window: ${JSON.stringify(snapshot)}`,
      );
    }
  }
}

function assertProfiledPanes(panes, snapshots) {
  const snapshotsByConversationId = new Map(
    snapshots.map((snapshot) => [snapshot.conversation.id, snapshot]),
  );
  for (const surface of panes) {
    const snapshot = snapshotsByConversationId.get(surface.conversationId);
    if (
      !snapshot ||
      surface.descendantCount > 160 ||
      !profiledRuntimeStates.has(surface.runtimeState) ||
      !surface.visible ||
      surface.trajectoryEventCount !== snapshot.trajectory.events.length ||
      surface.trajectoryHasEarlier !== snapshot.trajectory.hasEarlier
    ) {
      throw new Error(`profiled pane escaped its DOM/runtime budget: ${JSON.stringify(surface)}`);
    }
  }
}

function snapshotCursorTotal(snapshots) {
  return snapshots.reduce((total, snapshot) => total + snapshot.eventCursor.sequence, 0);
}

function snapshotSummary(snapshot) {
  return {
    conversationId: snapshot.conversation.id,
    eventCursorSequence: snapshot.eventCursor.sequence,
    lastTrajectorySequence: snapshot.conversation.lastTrajectorySequence,
    narrationEventCount: snapshot.narration.events.length,
    trajectoryEventCount: snapshot.trajectory.events.length,
    trajectoryHasEarlier: snapshot.trajectory.hasEarlier,
    turnCount: snapshot.turns.turns.length,
  };
}
