#!/usr/bin/env node
/* global console */

import { mkdir } from "node:fs/promises";
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
  reloadPage,
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
import {
  assertDriverAction,
  createTopic,
  listTopics,
} from "./topic-conversation-fork-workflow.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "topic-conversation-performance";
const workflowTimeoutMs = 60_000;
const conversationCount = 4;
const eventsPerConversation = 640;
const navigatorConversationCountPerWorkspace = 120;
const navigatorPageLimit = 80;
const navigatorRenderedItemBudget = 40;
const navigatorRowHeight = 36;
const navigatorSeedBatchSize = 8;
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
  const initialConversationCount = (
    await waitForBackendState(
      () => listTopics(backend, workspaceId),
      (page) => page.items.length > 0,
      workflowTimeoutMs,
    )
  ).items.length;
  const navigatorWorkspaces = await seedNavigatorWorkspaces({
    backend,
    fixture,
    primaryWorkspaceId: workspaceId,
  });
  await reloadPage(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  await waitForState(
    context.client,
    driverCallExpression("topicConversationWorkspaceOpenState", { workspaceId }),
    (state) => state.workspaceId === workspaceId,
    workflowTimeoutMs,
  );
  const conversations = [];
  for (let index = 0; index < conversationCount; index += 1) {
    conversations.push(
      await createTopic(
        context.client,
        backend,
        workspaceId,
        `Performance topic ${index + 1}`,
        workflowTimeoutMs,
        { allowCatalogExhaustion: true },
      ),
    );
  }
  await expandNavigatorWorkspaces(context.client, navigatorWorkspaces, workspaceId);
  const beforeExistingFocus = await waitForPerformanceState(
    context.client,
    (snapshot) => snapshot.paneCount === conversationCount + initialConversationCount,
  );
  assertDriverAction(
    await context.client.driver("topicConversationOpenBoundPane", {
      conversationId: conversations[0].id,
    }),
    "requested",
  );
  await waitForPerformanceState(
    context.client,
    (snapshot) => snapshot.paneCount === beforeExistingFocus.paneCount,
  );
  const existingPaneResult = await waitForSingleConversationPaneLayout(
    backend,
    workspaceId,
    conversations[0].id,
    conversationCount + initialConversationCount,
  );
  const navigatorResult = await profileLargeNavigator({
    client: context.client,
    conversations,
    expectedConversationCount:
      navigatorConversationCountPerWorkspace * navigatorWorkspaces.length +
      conversations.length +
      initialConversationCount,
    expectedWorkspaceCount: navigatorWorkspaces.length,
  });
  await captureScreenshot(context.client, join(artifactDir, "large-conversation-navigator.png"));
  await waitForNavigatorState(context.client, (snapshot) => snapshot.clientHeight > 0);
  await scrollNavigator(context.client, 0);
  await waitForNavigatorState(context.client, (snapshot) =>
    conversations.every((conversation) =>
      snapshot.renderedConversationIds.includes(conversation.id),
    ),
  );
  const ready = await waitForPerformanceState(
    context.client,
    (snapshot) =>
      snapshot.paneCount === beforeExistingFocus.paneCount &&
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
    await waitForNavigatorConversationStatus(context.client, conversation.id, "Working");
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
  await waitForNavigatorState(context.client, (snapshot) =>
    conversations.every((conversation) =>
      snapshot.renderedConversations.some(
        (rendered) => rendered.id === conversation.id && rendered.label.includes(", Idle"),
      ),
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
    existingConversationPane: existingPaneResult,
    eventsPerConversation,
    final: stopped.final,
    frameBudget: frameBudgetSummary(stopped.sample),
    initial: ready,
    navigator: navigatorResult,
    panes: profiledPanes,
    sample: stopped.sample,
    snapshots: snapshots.map(snapshotSummary),
    status: "measured",
    throughputEventsPerSecond,
    trace: traceResult,
    viewport,
    workspaceId,
    workspaceIds: navigatorWorkspaces.map((workspace) => workspace.id),
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

async function expandNavigatorWorkspaces(client, workspaces, primaryWorkspaceId) {
  for (const workspace of workspaces) {
    if (workspace.id === primaryWorkspaceId) {
      continue;
    }
    await scrollNavigator(client, 1);
    assertDriverAction(
      await client.driver("topicConversationNavigatorActivateWorkspace", {
        workspaceId: workspace.id,
      }),
      "clicked",
    );
    await waitForSelectedWorkspace(client, workspace.id);
  }
  await scrollNavigator(client, 0);
  assertDriverAction(
    await client.driver("topicConversationNavigatorActivateWorkspace", {
      workspaceId: primaryWorkspaceId,
    }),
    "clicked",
  );
  await waitForSelectedWorkspace(client, primaryWorkspaceId);
  await scrollNavigator(client, 0);
}

async function waitForSelectedWorkspace(client, workspaceId) {
  await waitForState(
    client,
    `(async () => {
      const session = await window.setta.workspace.session();
      const area = document.querySelector('[data-testid="workspace-layout-area"]');
      return {
        layoutWorkspaceId: area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "",
        selectedWorkspaceId: session.selectedWorkspaceId
      };
    })()`,
    (state) => state.selectedWorkspaceId === workspaceId && state.layoutWorkspaceId === workspaceId,
    workflowTimeoutMs,
  );
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

async function seedNavigatorWorkspaces({ backend, fixture, primaryWorkspaceId }) {
  const secondaryRoot = join(fixture.tempRoot, "navigator-secondary-workspace");
  await mkdir(secondaryRoot, { recursive: true });
  const openedSecondary = await backend.post("/workspaces/open", { rootPath: secondaryRoot });
  const secondaryWorkspaceId = openedSecondary.workspace?.id ?? "";
  if (!validWorkspaceId(secondaryWorkspaceId) || secondaryWorkspaceId === primaryWorkspaceId) {
    throw new Error(
      `secondary navigator workspace was not opened: ${JSON.stringify(openedSecondary)}`,
    );
  }
  const workspaces = [
    { id: primaryWorkspaceId, name: basename(fixture.workspaceRoot) },
    { id: secondaryWorkspaceId, name: basename(secondaryRoot) },
  ];
  const seeds = workspaces.flatMap((workspace, workspaceIndex) =>
    Array.from({ length: navigatorConversationCountPerWorkspace }, (_, index) => ({
      title: `Navigator topic ${workspaceIndex + 1}-${String(index + 1).padStart(3, "0")}`,
      workspaceId: workspace.id,
    })),
  );
  for (let index = 0; index < seeds.length; index += navigatorSeedBatchSize) {
    await Promise.all(
      seeds.slice(index, index + navigatorSeedBatchSize).map(async (seed) => {
        const snapshot = await backend.post("/conversations/create", seed);
        if (
          snapshot.conversation?.workspaceId !== seed.workspaceId ||
          snapshot.conversation?.title !== seed.title
        ) {
          throw new Error(
            `navigator seed conversation did not match its request: ${JSON.stringify({ seed, snapshot })}`,
          );
        }
      }),
    );
  }
  const selected = await backend.post("/workspaces/select", { id: primaryWorkspaceId });
  if (selected.selectedWorkspaceId !== primaryWorkspaceId) {
    throw new Error(`primary navigator workspace was not reselected: ${JSON.stringify(selected)}`);
  }
  return workspaces;
}

async function profileLargeNavigator({
  client,
  conversations,
  expectedConversationCount,
  expectedWorkspaceCount,
}) {
  const initialExpectedRows = expectedWorkspaceCount * (1 + navigatorPageLimit + 1);
  const initial = await waitForNavigatorState(
    client,
    (snapshot) =>
      snapshot.clientHeight > 0 &&
      snapshot.scrollHeight >= (initialExpectedRows - 2) * navigatorRowHeight,
  );
  const started = await client.driver("topicConversationPerformanceStart");
  if (!started.ok) {
    throw new Error(`navigator profiler did not start: ${JSON.stringify(started)}`);
  }
  const states = [initial];
  states.push(await scrollNavigator(client, 0.5));
  await waitForNavigatorState(client, (snapshot) => snapshot.renderedLoadMoreCount > 0);
  assertDriverAction(await client.driver("topicConversationNavigatorLoadMore"), "clicked");
  const afterFirstPage = await waitForNavigatorState(
    client,
    (snapshot) =>
      snapshot.scrollHeight >= initial.scrollHeight + navigatorRowHeight * 20 &&
      !snapshot.renderedConversationIds.some((conversationId) => conversationId === ""),
  );
  states.push(afterFirstPage);
  states.push(await scrollNavigator(client, 1));
  await waitForNavigatorState(client, (snapshot) => snapshot.renderedLoadMoreCount > 0);
  assertDriverAction(await client.driver("topicConversationNavigatorLoadMore"), "clicked");
  const finalExpectedRows = expectedConversationCount + expectedWorkspaceCount;
  const afterSecondPage = await waitForNavigatorState(
    client,
    (snapshot) =>
      snapshot.scrollHeight >= (finalExpectedRows - 2) * navigatorRowHeight &&
      snapshot.renderedLoadMoreCount === 0,
  );
  states.push(afterSecondPage);
  for (const ratio of [0, 0.2, 0.4, 0.6, 0.8, 1, 0]) {
    states.push(await scrollNavigator(client, ratio));
  }
  const stopped = await client.driver("topicConversationPerformanceStop");
  if (!stopped.ok) {
    throw new Error(`navigator profiler did not stop: ${JSON.stringify(stopped)}`);
  }
  const maxRenderedItemCount = Math.max(...states.map((state) => state.renderedItemCount));
  if (maxRenderedItemCount > navigatorRenderedItemBudget) {
    throw new Error(
      `large navigator escaped its rendered-row budget: ${JSON.stringify({ maxRenderedItemCount, navigatorRenderedItemBudget, states })}`,
    );
  }
  if (
    conversations.some((conversation) =>
      states.every((state) => !state.renderedConversationIds.includes(conversation.id)),
    )
  ) {
    throw new Error(
      `profiled conversations were not addressable in the large navigator: ${JSON.stringify({ conversations, states })}`,
    );
  }
  assertSmoothFrameSample(stopped.sample, "large paged conversation navigator", {
    minFrameCount: 30,
  });
  return {
    afterFirstPage,
    afterSecondPage,
    conversationCount: expectedConversationCount,
    initial,
    maxRenderedItemCount,
    renderedItemBudget: navigatorRenderedItemBudget,
    sample: stopped.sample,
    status: "passed",
    workspaceCount: expectedWorkspaceCount,
  };
}

function waitForNavigatorState(client, ready) {
  return waitForState(
    client,
    driverCallExpression("topicConversationNavigatorSnapshot"),
    ready,
    workflowTimeoutMs,
  );
}

function waitForNavigatorConversationStatus(client, conversationId, status) {
  return waitForNavigatorState(client, (snapshot) =>
    snapshot.renderedConversations.some(
      (conversation) =>
        conversation.id === conversationId && conversation.label.includes(`, ${status}`),
    ),
  );
}

async function scrollNavigator(client, ratio) {
  const result = await client.driver("topicConversationNavigatorScroll", { ratio });
  if (!result.ok) {
    throw new Error(`conversation navigator did not scroll: ${JSON.stringify(result)}`);
  }
  return result.snapshot;
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

async function waitForSingleConversationPaneLayout(
  backend,
  workspaceId,
  conversationId,
  expectedPaneCount,
) {
  void workspaceId;
  const result = await waitForBackendState(
    () => backend.get("/app/panes/layout"),
    (current) => {
      const panes = current.layout?.panes ?? [];
      return (
        panes.filter((pane) => pane.conversationConfig !== null).length === expectedPaneCount &&
        panes.filter((pane) => pane.conversationConfig?.conversationId === conversationId)
          .length === 1
      );
    },
    workflowTimeoutMs,
  );
  const panes = result.layout?.panes ?? [];
  return {
    conversationId,
    easyButtonPaneCount: panes.filter((pane) => pane.conversationConfig !== null).length,
    matchingPaneCount: panes.filter(
      (pane) => pane.conversationConfig?.conversationId === conversationId,
    ).length,
  };
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
