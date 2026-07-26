#!/usr/bin/env node
/* global console, URL */

import { basename, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
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
import { driverCallExpression } from "./cdp-client.mjs";
import { assertSmoothFrameSample, frameBudgetSummary } from "./performance-frame-budget.mjs";
import { configure4kViewport } from "./workspace-overview-performance-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "pane-drag-drop-benchmark-performance";
const workflowTimeoutMs = 35_000;
const minimumVisibleBenchmarkHosts = 32;

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
let context = null;
let trace = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_E2E_NIRI_SCENE: "benchmark",
    },
    fixture,
    visible: options.visible,
  });
  await configure4kViewport(context.client);
  await navigateToBenchmarkSceneWithoutAutoFocus(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const initialSnapshot = await waitForBenchmarkPaneHosts(context.client);
  const warmupMetrics = await waitForSnapshotWarmup(context.client);
  await captureScreenshot(context.client, join(artifactDir, "benchmark-normal-before.png"));

  if (options.trace) {
    trace = await startChromiumTrace(context.client, join(artifactDir, "chromium-trace.json"));
  }

  const normalRowDrop = await performBenchmarkNormalRowDrop(context.client);
  await captureScreenshot(context.client, join(artifactDir, "benchmark-normal-row-drop.png"));

  const overviewDrag = await performBenchmarkOverviewDrag(context.client);
  await captureScreenshot(context.client, join(artifactDir, "benchmark-overview-drag.png"));

  const traceResult = trace ? await trace.stop() : null;
  trace = null;
  const summary = {
    artifactDir,
    initialSnapshot,
    normalRowDrop,
    overviewDrag,
    frameBudgets: {
      normalRowDrop: frameBudgetSummary(normalRowDrop.frameSample),
      overviewDrag: frameBudgetSummary(overviewDrag.frameSample),
    },
    status: "passed",
    trace: traceResult,
    viewport: "4k",
    warmupMetrics,
    workspaceName: basename(fixture.workspaceRoot),
  };
  await writeJson(join(artifactDir, "summary.json"), summary);
  console.log(`Electron pane drag/drop benchmark performance passed: ${artifactDir}`);
} catch (error) {
  if (trace) {
    await trace.stop().catch(() => {});
  }
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      frameMetrics: await safeFrameMetricsSnapshot(context.client),
      paneSnapshot: await safePaneSnapshot(context.client),
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

async function navigateToBenchmarkSceneWithoutAutoFocus(client) {
  const currentURL = await client.evaluate("location.href");
  const nextURL = new URL(currentURL);
  nextURL.searchParams.set("workspaceScene", "benchmark");
  nextURL.searchParams.set("workspaceAuto", "false");
  if (nextURL.toString() === currentURL) {
    return;
  }
  await client.call("Page.navigate", { url: nextURL.toString() });
  await waitForState(
    client,
    `(() => ({
      loaded: document.readyState !== "loading",
      search: location.search,
    }))()`,
    (state) =>
      state.loaded &&
      state.search.includes("workspaceScene=benchmark") &&
      state.search.includes("workspaceAuto=false"),
    workflowTimeoutMs,
  );
}

async function performBenchmarkNormalRowDrop(client) {
  await ensureNormalMode(client);
  const before = await waitForBenchmarkPaneHosts(client);
  const { sourceHost, targetHost } = selectTopRowColumnDragHosts(before);
  const canonicalTargetHost = nextVisibleHostInColumn(before, targetHost) ?? targetHost;
  const observation = await measureDragGesture(client, {
    expectedDropAxis: "vertical",
    expectedDropTarget: canonicalTargetHost.paneId === targetHost.paneId ? "after" : "before",
    label: "benchmark normal row drop",
    sourcePaneId: sourceHost.paneId,
    targetPaneId: canonicalTargetHost.paneId,
    to: {
      x: targetHost.rect.left + targetHost.rect.width / 2,
      y: targetHost.rect.top + targetHost.rect.height * 0.75,
    },
  });
  return {
    ...observation,
    sourcePaneId: sourceHost.paneId,
    targetPaneId: canonicalTargetHost.paneId,
  };
}

async function performBenchmarkOverviewDrag(client) {
  await toggleOverviewByShortcut(client);
  await waitForState(
    client,
    driverCallExpression("paneDragDropPaneSnapshot"),
    (snapshot) =>
      snapshot.mode === "overview" &&
      snapshot.workspaceMode === "benchmark" &&
      snapshot.visibleHosts.length >= minimumVisibleBenchmarkHosts &&
      snapshot.visibleHosts.every((host) => hostInsideStage(snapshot, host)),
    workflowTimeoutMs,
  );
  await delay(500);
  const overview = await waitForState(
    client,
    driverCallExpression("paneDragDropPaneSnapshot"),
    (snapshot) =>
      snapshot.mode === "overview" &&
      snapshot.workspaceMode === "benchmark" &&
      snapshot.visibleHosts.length >= minimumVisibleBenchmarkHosts &&
      snapshot.visibleHosts.every((host) => hostInsideStage(snapshot, host)),
    workflowTimeoutMs,
  );
  const sourceHost = selectCenteredOverviewDragSource(overview);
  const sourcePoint = hostCenterPoint(sourceHost);
  const to = overviewDragMoveTarget(overview, sourcePoint);

  await dispatchMousePress(client, sourcePoint);
  await dispatchMouseMove(client, to, { buttons: 1, from: sourcePoint, steps: 2 });
  await waitForState(
    client,
    driverCallExpression("paneDragDropOverviewState", { sourcePaneId: sourceHost.paneId }),
    (state) => state.overviewDragging === "true" && state.sourceDragSource === true,
    workflowTimeoutMs,
  );
  await settleDragSampler(client);
  await startBrowserFrameSampler(client);
  await delay(360);
  const frameSample = await stopBrowserFrameSampler(client);
  const duringMetrics = await readFrameMetrics(client);
  assertPaneDragDuringPerformance(duringMetrics, frameSample, "benchmark overview drag");
  const during = await client.driver("paneDragDropPaneSnapshot");
  await dispatchMouseRelease(client, to);
  const after = await waitForState(
    client,
    driverCallExpression("paneDragDropPaneSnapshot"),
    (snapshot) => {
      const source = snapshot.visibleHosts.find((host) => host.paneId === sourceHost.paneId);
      return (
        snapshot.overviewDragging === "" &&
        source !== undefined &&
        !source.dragSource &&
        snapshot.ghost === null
      );
    },
    workflowTimeoutMs,
  );
  const finalMetrics = await readFrameMetrics(client);
  assertPaneDragFinalMetrics(finalMetrics, "benchmark overview drag");
  return {
    after,
    duringMetrics,
    finalMetrics,
    frameSample,
    during,
    sourcePaneId: sourceHost.paneId,
    targetPaneId: null,
  };
}

async function measureDragGesture(
  client,
  { expectedDropAxis, expectedDropTarget, label, sourcePaneId, targetPaneId, to },
) {
  const sourcePoint = await dragHandleCenter(client, sourcePaneId);
  await dispatchMousePress(client, sourcePoint);
  await dispatchMouseMove(client, to, { buttons: 1, from: sourcePoint, steps: 1 });
  await waitForState(
    client,
    driverCallExpression("paneDragDropTargetState", { sourcePaneId, targetPaneId }),
    (state) =>
      state.paneDragging === "true" &&
      state.sourceDragSource === true &&
      state.targetDropAxis === expectedDropAxis &&
      state.targetDropTarget === expectedDropTarget,
    workflowTimeoutMs,
  );
  await settleDragSampler(client);
  await startBrowserFrameSampler(client);
  await delay(360);
  const frameSample = await stopBrowserFrameSampler(client);
  const duringMetrics = await readFrameMetrics(client);
  assertPaneDragDuringPerformance(duringMetrics, frameSample, label);
  const during = await client.driver("paneDragDropPaneSnapshot");
  await dispatchMouseRelease(client, to);
  const after = await waitForState(
    client,
    driverCallExpression("paneDragDropPaneSnapshot"),
    (snapshot) => {
      const source = snapshot.visibleHosts.find((host) => host.paneId === sourcePaneId);
      const target = snapshot.visibleHosts.find((host) => host.paneId === targetPaneId);
      return (
        snapshot.focusedPaneId === sourcePaneId &&
        source !== undefined &&
        !source.dragSource &&
        !target?.dropAxis &&
        !target?.dropTarget
      );
    },
    workflowTimeoutMs,
  );
  const finalMetrics = await readFrameMetrics(client);
  assertPaneDragFinalMetrics(finalMetrics, label);
  return { after, during, duringMetrics, finalMetrics, frameSample };
}

async function waitForBenchmarkPaneHosts(client) {
  return waitForState(
    client,
    driverCallExpression("paneDragDropPaneSnapshot"),
    (snapshot) =>
      snapshot.mode === "normal" &&
      snapshot.workspaceMode === "benchmark" &&
      snapshot.totalPanes === 500 &&
      snapshot.visibleHosts.length >= minimumVisibleBenchmarkHosts,
    workflowTimeoutMs,
  );
}

async function waitForSnapshotWarmup(client) {
  return waitForState(
    client,
    driverCallExpression("paneDragDropFrameMetrics"),
    (metrics) =>
      metrics !== null &&
      metrics.visiblePaneCount >= minimumVisibleBenchmarkHosts &&
      metrics.snapshotBitmapCaptureRequests > 0,
    workflowTimeoutMs,
  ).then(async () => {
    let previous = await readFrameMetrics(client);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await delay(150);
      const current = await readFrameMetrics(client);
      if (
        current.snapshotBitmapCaptureRequests === previous.snapshotBitmapCaptureRequests &&
        current.snapshotTextureCaptureRequests === previous.snapshotTextureCaptureRequests
      ) {
        return current;
      }
      previous = current;
    }
    return previous;
  });
}

async function settleDragSampler(client) {
  await resetFrameMetrics(client);
  await delay(120);
  await resetFrameMetrics(client);
}

async function ensureNormalMode(client) {
  const mode = await client.driver("paneDragDropWorkspacePresentationMode");
  if (mode === "normal") {
    return;
  }
  await toggleOverviewByShortcut(client);
  await waitForState(
    client,
    driverCallExpression("paneDragDropWorkspacePresentationMode"),
    (currentMode) => currentMode === "normal",
    workflowTimeoutMs,
  );
}

async function toggleOverviewByShortcut(client) {
  const toggled = await client.driver("paneDragDropToggleOverview");
  if (!toggled.ok) {
    throw new Error(`overview shortcut failed: ${JSON.stringify(toggled)}`);
  }
}

async function dragHandleCenter(client, paneId) {
  const center = await client.driver("paneDragDropHandleCenter", { paneId });
  if (!center.ok) {
    throw new Error(`drag handle was not found for ${paneId}: ${JSON.stringify(center)}`);
  }
  return { x: center.x, y: center.y };
}

async function dispatchMousePress(client, point) {
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: point.x,
    y: point.y,
  });
  await delay(16);
}

async function dispatchMouseMove(client, to, { buttons, from, steps }) {
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    const point = {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    };
    await client.call("Input.dispatchMouseEvent", {
      button: "left",
      buttons,
      type: "mouseMoved",
      x: point.x,
      y: point.y,
    });
    await delay(16);
  }
  await delay(80);
}

async function dispatchMouseRelease(client, point) {
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: point.x,
    y: point.y,
  });
  await delay(80);
}

async function startBrowserFrameSampler(client) {
  const started = await client.driver("paneDragDropStartFrameSampler");
  if (!started) {
    throw new Error("workspace drag frame sampler was already running");
  }
}

async function stopBrowserFrameSampler(client) {
  const result = await client.driver("paneDragDropStopFrameSampler");
  if (!result.ok) {
    throw new Error(`workspace drag frame sampler could not stop: ${JSON.stringify(result)}`);
  }
  return result.sample;
}

async function readFrameMetrics(client) {
  const metrics = await client.driver("paneDragDropFrameMetrics");
  if (!metrics) {
    throw new Error("workspace frame metrics hook was not installed");
  }
  return metrics;
}

async function resetFrameMetrics(client) {
  const reset = await client.driver("paneDragDropResetFrameMetrics");
  if (!reset) {
    throw new Error("workspace frame metrics reset hook was not installed");
  }
}

async function safePaneSnapshot(client) {
  try {
    return await client.driver("paneDragDropPaneSnapshot");
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function safeFrameMetricsSnapshot(client) {
  try {
    return await readFrameMetrics(client);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function assertPaneDragDuringPerformance(metrics, frameSample, label) {
  if (metrics.paneDragPreviewUpdates > 1 || metrics.paneDragPreviewClears !== 0) {
    throw new Error(
      `unexpected active pane drag preview metrics for ${label}: ${JSON.stringify(metrics)}`,
    );
  }
  if (metrics.reactCommitsDuringMovement !== 0) {
    throw new Error(`React committed during ${label}: ${JSON.stringify(metrics)}`);
  }
  if (metrics.snapshotCaptureRequests !== 0) {
    throw new Error(`snapshot capture occurred during ${label}: ${JSON.stringify(metrics)}`);
  }
  if (frameSample.longTaskCount !== 0) {
    throw new Error(
      `sampled long tasks occurred during ${label}: ${JSON.stringify({ frameSample, metrics })}`,
    );
  }
  assertSmoothFrameSample(frameSample, label, { minFrameCount: 10 });
}

function assertPaneDragFinalMetrics(metrics, label) {
  if (metrics.reactCommitsDuringMovement !== 0) {
    throw new Error(`React committed during ${label}: ${JSON.stringify(metrics)}`);
  }
}

function hostInsideStage(snapshot, host) {
  return (
    host.rect.left >= snapshot.stageRect.left &&
    host.rect.left + host.rect.width <= snapshot.stageRect.left + snapshot.stageRect.width &&
    host.rect.top >= snapshot.stageRect.top &&
    host.rect.top + host.rect.height <= snapshot.stageRect.top + snapshot.stageRect.height
  );
}

function selectTopRowColumnDragHosts(snapshot) {
  const fullyVisibleHosts = snapshot.visibleHosts.filter((host) => hostInsideStage(snapshot, host));
  const minTop = Math.min(...fullyVisibleHosts.map((host) => host.rect.top));
  const topRowHosts = fullyVisibleHosts
    .filter((host) => Math.abs(host.rect.top - minTop) < 2)
    .toSorted((left, right) => left.rect.left - right.rect.left);
  const sourceHost = topRowHosts[0];
  const targetHost = topRowHosts.at(-1);
  if (!sourceHost || !targetHost || sourceHost.paneId === targetHost.paneId) {
    throw new Error(`benchmark column drag target unavailable: ${JSON.stringify(snapshot)}`);
  }
  return { sourceHost, targetHost };
}

function nextVisibleHostInColumn(snapshot, host) {
  const sameColumnHosts = snapshot.visibleHosts
    .filter((candidate) => Math.abs(candidate.rect.left - host.rect.left) < 2)
    .toSorted((left, right) => left.rect.top - right.rect.top);
  const index = sameColumnHosts.findIndex((candidate) => candidate.paneId === host.paneId);
  return index >= 0 ? sameColumnHosts[index + 1] : null;
}

function selectCenteredOverviewDragSource(snapshot) {
  const stageCenter = {
    x: snapshot.stageRect.left + snapshot.stageRect.width / 2,
    y: snapshot.stageRect.top + snapshot.stageRect.height / 2,
  };
  const sourceHost = snapshot.visibleHosts
    .filter((host) => hostInsideStage(snapshot, host))
    .filter((host) => host.rect.width > 32 && host.rect.height > 32)
    .toSorted(
      (left, right) =>
        distanceSquared(hostCenterPoint(left), stageCenter) -
        distanceSquared(hostCenterPoint(right), stageCenter),
    )[0];
  if (!sourceHost) {
    throw new Error(`benchmark overview drag source unavailable: ${JSON.stringify(snapshot)}`);
  }
  return sourceHost;
}

function hostCenterPoint(host) {
  return {
    x: host.rect.left + host.rect.width / 2,
    y: host.rect.top + host.rect.height / 2,
  };
}

function overviewDragMoveTarget(snapshot, sourcePoint) {
  const marginPx = 8;
  const minX = snapshot.stageRect.left + marginPx;
  const maxX = snapshot.stageRect.left + snapshot.stageRect.width - marginPx;
  const minY = snapshot.stageRect.top + marginPx;
  const maxY = snapshot.stageRect.top + snapshot.stageRect.height - marginPx;
  const xDelta = sourcePoint.x + 90 <= maxX ? 90 : -90;
  const yDelta = sourcePoint.y + 24 <= maxY ? 24 : -24;
  return {
    x: clamp(sourcePoint.x + xDelta, minX, maxX),
    y: clamp(sourcePoint.y + yDelta, minY, maxY),
  };
}

function distanceSquared(left, right) {
  return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
