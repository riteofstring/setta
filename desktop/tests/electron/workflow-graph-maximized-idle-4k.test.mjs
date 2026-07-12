#!/usr/bin/env node
/* global console */

import { join } from "node:path";
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
  assertBackingStoreCap,
  assertNoTransitionCaptureBlocking,
  configure4kViewport,
  ensureNormalMode,
  measureOverviewTransition,
  overviewPerformanceTimeoutMs,
  readFrameMetrics,
  readWorkflowGraphSnapshot,
  shortDelay,
  viewport4k,
  waitForWorkflowGraphSnapshot,
} from "./workspace-overview-performance-helpers.mjs";

const idleSampleMs = 700;
const frozenSampleMs = 700;
const options = parseElectronHarnessArgs(process.argv.slice(2));

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/workflow-graph-maximized-idle-4k.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("workflow-graph-idle-4k");
await writeLatestRecordingPointer("workflow-graph-idle-4k", artifactDir);
const fixture = await createElectronFixture("workflow-graph-idle-4k");
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

  const initial = await waitForWorkflowGraphSnapshot(
    context.client,
    surfaceId,
    (snapshot) =>
      snapshot.canvas.clientWidth > 0 &&
      snapshot.canvas.clientHeight > 0 &&
      snapshot.graph.nodeCount === 2500,
  );
  assertBackingStoreCap(initial, "initial idle workflow graph");
  await shortDelay(idleSampleMs);
  const afterIdle = await readWorkflowGraphSnapshot(context.client, surfaceId);
  assertBackingStoreCap(afterIdle, "idle workflow graph");

  const enter = await measureOverviewTransition(context.client, {
    buttonLabel: "Enter overview",
    expectedMode: "overview",
    name: "workflow-graph-idle-enter-overview",
  });
  assertNoTransitionCaptureBlocking(enter);
  const frozenStart = await readWorkflowGraphSnapshot(context.client, surfaceId);
  if (!frozenStart.render.frozen) {
    throw new Error(
      `workflow graph was not frozen in overview: ${JSON.stringify(frozenStart.render)}`,
    );
  }
  await shortDelay(frozenSampleMs);
  const frozenEnd = await readWorkflowGraphSnapshot(context.client, surfaceId);
  if (!frozenEnd.render.frozen) {
    throw new Error(`workflow graph thawed during overview: ${JSON.stringify(frozenEnd.render)}`);
  }
  if (frozenEnd.render.tickerFramesWhileFrozen !== frozenStart.render.tickerFramesWhileFrozen) {
    throw new Error(
      `workflow graph ticker advanced while frozen: before=${frozenStart.render.tickerFramesWhileFrozen} after=${frozenEnd.render.tickerFramesWhileFrozen}`,
    );
  }
  if (frozenEnd.render.frameCount !== frozenStart.render.frameCount) {
    throw new Error(
      `workflow graph rendered frames while frozen: before=${frozenStart.render.frameCount} after=${frozenEnd.render.frameCount}`,
    );
  }
  if (frozenEnd.render.rendererResizeCount !== frozenStart.render.rendererResizeCount) {
    throw new Error(
      `workflow graph resized while frozen: before=${frozenStart.render.rendererResizeCount} after=${frozenEnd.render.rendererResizeCount}`,
    );
  }
  await captureScreenshot(context.client, join(artifactDir, "overview-frozen-4k.png"));

  const exit = await measureOverviewTransition(context.client, {
    buttonLabel: "Exit overview",
    expectedMode: "normal",
    name: "workflow-graph-idle-exit-overview",
  });
  assertNoTransitionCaptureBlocking(exit);
  const resumed = await waitForWorkflowGraphSnapshot(
    context.client,
    surfaceId,
    (snapshot) => !snapshot.render.frozen && snapshot.canvas.clientWidth > 0,
  );
  assertBackingStoreCap(resumed, "resumed idle workflow graph");
  await captureScreenshot(context.client, join(artifactDir, "normal-resumed-4k.png"));

  const summary = {
    artifactDir,
    frameMetrics: await readFrameMetrics(context.client),
    graph: {
      afterIdle: graphSummary(afterIdle),
      frozenEnd: graphSummary(frozenEnd),
      frozenStart: graphSummary(frozenStart),
      initial: graphSummary(initial),
      resumed: graphSummary(resumed),
    },
    idleSampleMs,
    samples: [transitionSummary(enter), transitionSummary(exit)],
    status: "passed",
    viewport: viewport4k,
  };
  await writeJson(join(artifactDir, "summary.json"), summary);
  console.log(`Electron workflow graph idle 4K passed: ${artifactDir}`);
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
    rendererResizeCount: snapshot.render.rendererResizeCount,
    tickerFramesWhileFrozen: snapshot.render.tickerFramesWhileFrozen,
  };
}

function transitionSummary(sample) {
  return {
    longTaskCount: sample.longTaskCount,
    maxFrameDeltaMs: sample.maxFrameDeltaMs,
    metricDelta: sample.metricDelta,
    name: sample.name,
    p95FrameDeltaMs: sample.p95FrameDeltaMs,
    p99FrameDeltaMs: sample.p99FrameDeltaMs,
  };
}
