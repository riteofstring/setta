#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
} from "./workflow-graph-layout-helpers.mjs";
import {
  assertAspectRatioStable,
  assertBackingStoreCap,
  assertNoTransitionCaptureBlocking,
  configure4kViewport,
  ensureNormalMode,
  measureOverviewTransition,
  overviewPerformanceTimeoutMs,
  readFrameMetrics,
  readPaneHostState,
  readWorkflowGraphSnapshot,
  viewport4k,
  waitForFrameMetrics,
  waitForPaneHostState,
  waitForWorkflowGraphSnapshot,
} from "./workspace-overview-performance-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/workflow-graph-maximized-4k-overview.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("workflow-graph-4k-overview");
await writeLatestRecordingPointer("workflow-graph-4k-overview", artifactDir);
const fixture = await createElectronFixture("workflow-graph-4k-overview");
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_WORKFLOW_GRAPH_DEBUG: "1",
      SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE: "1",
      SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT: "2500",
    },
    fixture,
    visible: options.visible,
  });
  await configure4kViewport(context.client);
  await waitForSelector(
    context.client,
    '[data-testid="workspace-layout-area"]',
    overviewPerformanceTimeoutMs,
  );
  await openWorkflowGraphPane(context.client, { timeoutMs: overviewPerformanceTimeoutMs });
  await waitForSelector(
    context.client,
    '[data-testid="workflow-graph"]',
    overviewPerformanceTimeoutMs,
  );
  const surfaceId = await maximizeWorkflowGraphPane(context.client, {
    timeoutMs: overviewPerformanceTimeoutMs,
  });
  await ensureNormalMode(context.client);
  const initialGraphSnapshot = await waitForWorkflowGraphSnapshot(
    context.client,
    surfaceId,
    (snapshot) =>
      snapshot.canvas.clientWidth > 0 &&
      snapshot.canvas.clientHeight > 0 &&
      snapshot.graph.nodeCount === 2500,
  );
  assertBackingStoreCap(initialGraphSnapshot, "maximized workflow graph");
  await waitForFrameMetrics(
    context.client,
    (metrics) => metrics !== null && metrics.canvasBackingStorePixels !== null,
    overviewPerformanceTimeoutMs,
  );
  const normalHost = await readPaneHostState(context.client, { surfaceId });
  await captureScreenshot(context.client, join(artifactDir, "normal-maximized-4k.png"));

  const enter = await measureOverviewTransition(context.client, {
    buttonLabel: "Enter overview",
    expectedMode: "overview",
    name: "workflow-graph-enter-overview",
  });
  assertNoTransitionCaptureBlocking(enter);
  const overviewHost = await waitForPaneHostState(
    context.client,
    { paneId: normalHost.paneId },
    (state) =>
      state.ok &&
      state.presentationMode === "overview" &&
      state.runtimeState === "live-throttled" &&
      state.surfaceFrozen === "true" &&
      state.surfaceKind === "workflow-graph" &&
      state.visible,
    overviewPerformanceTimeoutMs,
  );
  assertAspectRatioStable(normalHost, overviewHost, "workflow graph maximized overview");
  const overviewGraphSnapshot = await readWorkflowGraphSnapshot(context.client, surfaceId);
  if (!overviewGraphSnapshot.render.frozen) {
    throw new Error(
      `workflow graph did not freeze during overview: ${JSON.stringify(overviewGraphSnapshot.render)}`,
    );
  }
  const overviewMetrics = await readFrameMetrics(context.client);
  if (overviewMetrics.liveCanvasPaneCount !== 0) {
    throw new Error(
      `workflow graph remained live during overview: ${JSON.stringify(overviewMetrics)}`,
    );
  }
  await captureScreenshot(context.client, join(artifactDir, "overview-4k.png"));

  const exit = await measureOverviewTransition(context.client, {
    buttonLabel: "Exit overview",
    expectedMode: "normal",
    name: "workflow-graph-exit-overview",
  });
  assertNoTransitionCaptureBlocking(exit);
  const finalHost = await waitForPaneHostState(
    context.client,
    { paneId: normalHost.paneId },
    (state) =>
      state.ok &&
      state.presentationMode === "normal" &&
      state.runtimeState === "live" &&
      state.surfaceKind === "workflow-graph" &&
      state.surfaceFrozen === "false" &&
      state.visible,
    overviewPerformanceTimeoutMs,
  );
  assertAspectRatioStable(normalHost, finalHost, "workflow graph normal resume");
  const finalGraphSnapshot = await readWorkflowGraphSnapshot(context.client, surfaceId);
  if (finalGraphSnapshot.render.frozen) {
    throw new Error(
      `workflow graph stayed frozen after overview exit: ${JSON.stringify(finalGraphSnapshot.render)}`,
    );
  }
  assertBackingStoreCap(finalGraphSnapshot, "resumed workflow graph");
  await captureScreenshot(context.client, join(artifactDir, "normal-after-4k.png"));

  const summary = {
    artifactDir,
    graph: {
      final: graphSummary(finalGraphSnapshot),
      initial: graphSummary(initialGraphSnapshot),
      overview: graphSummary(overviewGraphSnapshot),
    },
    hosts: {
      final: finalHost,
      normal: normalHost,
      overview: overviewHost,
    },
    metrics: {
      final: await readFrameMetrics(context.client),
      overview: overviewMetrics,
    },
    samples: [transitionSummary(enter), transitionSummary(exit)],
    status: "passed",
    viewport: viewport4k,
    workspaceName: basename(fixture.workspaceRoot),
  };
  await writeJson(join(artifactDir, "summary.json"), summary);
  console.log(`Electron workflow graph 4K overview passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-summary.json"), {
      error: error instanceof Error ? error.message : String(error),
      metrics: await readFrameMetrics(context.client).catch(() => null),
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

function graphSummary(snapshot) {
  return {
    backingStorePixels: snapshot.canvas.width * snapshot.canvas.height,
    canvas: snapshot.canvas,
    frozen: snapshot.render.frozen,
    frameCount: snapshot.render.frameCount,
    nodeCount: snapshot.graph.nodeCount,
    rendererResizeCount: snapshot.render.rendererResizeCount,
    tickerFramesWhileFrozen: snapshot.render.tickerFramesWhileFrozen,
  };
}

function transitionSummary(sample) {
  return {
    averageFps: sample.averageFps,
    frameCount: sample.frameCount,
    longTaskCount: sample.longTaskCount,
    maxFrameDeltaMs: sample.maxFrameDeltaMs,
    metricDelta: sample.metricDelta,
    name: sample.name,
    p95FrameDeltaMs: sample.p95FrameDeltaMs,
    p99FrameDeltaMs: sample.p99FrameDeltaMs,
    runtimeStates: sample.runtimeStates,
  };
}
