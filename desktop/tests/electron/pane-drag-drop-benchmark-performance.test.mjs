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
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
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
    trace = null;
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
  const observation = await measureDragGesture(client, {
    expectedDropAxis: "vertical",
    expectedDropTarget: "after",
    label: "benchmark normal row drop",
    sourcePaneId: sourceHost.paneId,
    targetPaneId: targetHost.paneId,
    to: {
      x: targetHost.rect.left + targetHost.rect.width / 2,
      y: targetHost.rect.top + targetHost.rect.height * 0.75,
    },
  });
  return {
    ...observation,
    sourcePaneId: sourceHost.paneId,
    targetPaneId: targetHost.paneId,
  };
}

async function performBenchmarkOverviewDrag(client) {
  await toggleOverviewByShortcut(client);
  await waitForState(
    client,
    paneSnapshotExpression(),
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
    paneSnapshotExpression(),
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
  await resetFrameMetrics(client);
  await startBrowserFrameSampler(client);
  await dispatchMouseMove(client, to, { buttons: 1, from: sourcePoint, steps: 2 });
  const during = await waitForState(
    client,
    paneSnapshotExpression(),
    (snapshot) => {
      const source = snapshot.visibleHosts.find((host) => host.paneId === sourceHost.paneId);
      return snapshot.overviewDragging === "true" && source?.dragSource === true;
    },
    workflowTimeoutMs,
  );
  const duringMetrics = await readFrameMetrics(client);
  const frameSample = await stopBrowserFrameSampler(client);
  assertPaneDragDuringPerformance(
    duringMetrics,
    frameSample,
    "benchmark overview drag",
  );
  await dispatchMouseRelease(client, to);
  const after = await waitForState(
    client,
    paneSnapshotExpression(),
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
  await resetFrameMetrics(client);
  await startBrowserFrameSampler(client);
  await dispatchMouseMove(client, to, { buttons: 1, from: sourcePoint, steps: 1 });
  const during = await waitForState(
    client,
    paneSnapshotExpression(),
    (snapshot) => {
      const source = snapshot.visibleHosts.find((host) => host.paneId === sourcePaneId);
      const target = snapshot.visibleHosts.find((host) => host.paneId === targetPaneId);
      return (
        snapshot.paneDragging === "true" &&
        source?.dragSource === true &&
        target?.dropAxis === expectedDropAxis &&
        target?.dropTarget === expectedDropTarget
      );
    },
    workflowTimeoutMs,
  );
  const duringMetrics = await readFrameMetrics(client);
  const frameSample = await stopBrowserFrameSampler(client);
  assertPaneDragDuringPerformance(duringMetrics, frameSample, label);
  await dispatchMouseRelease(client, to);
  const after = await waitForState(
    client,
    paneSnapshotExpression(),
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
    paneSnapshotExpression(),
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
    frameMetricsExpression(),
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

async function ensureNormalMode(client) {
  const mode = await client.evaluate(workspacePresentationModeExpression());
  if (mode === "normal") {
    return;
  }
  await toggleOverviewByShortcut(client);
  await waitForState(
    client,
    workspacePresentationModeExpression(),
    (currentMode) => currentMode === "normal",
    workflowTimeoutMs,
  );
}

async function toggleOverviewByShortcut(client) {
  const toggled = await client.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "o",
      metaKey: true,
    }));
    return { ok: true };
  })()`);
  if (!toggled.ok) {
    throw new Error(`overview shortcut failed: ${JSON.stringify(toggled)}`);
  }
}

async function dragHandleCenter(client, paneId) {
  const center = await client.evaluate(`(() => {
    const host = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"][data-visible="true"]'))
      .find((candidate) => candidate instanceof HTMLElement && candidate.dataset.paneId === ${JSON.stringify(paneId)});
    const handle = host?.querySelector('[data-workspace-pane-drag-handle="true"]');
    const hostRect = host instanceof HTMLElement ? host.getBoundingClientRect() : null;
    const handleRect = handle instanceof HTMLElement ? handle.getBoundingClientRect() : null;
    const handleCenter = handleRect
      ? { x: handleRect.left + handleRect.width / 2, y: handleRect.top + handleRect.height / 2 }
      : null;
    const handleInsideHost = Boolean(
      hostRect &&
        handleCenter &&
        handleCenter.x >= hostRect.left &&
        handleCenter.x <= hostRect.right &&
        handleCenter.y >= hostRect.top &&
        handleCenter.y <= hostRect.bottom,
    );
    const target = handleRect && handleRect.width > 0 && handleRect.height > 0 && handleInsideHost
      ? handle
      : host;
    if (!(target instanceof HTMLElement)) {
      return { ok: false, reason: "missing-target" };
    }
    const rect = target.getBoundingClientRect();
    return {
      ok: true,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  })()`);
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
  const started = await client.evaluate(`(() => {
    if (window.__settaWorkspaceDragPerfStop) {
      return false;
    }
    const startedAt = performance.now();
    const longTasks = [];
    let previousTimestamp = startedAt;
    let running = true;
    let observer = null;
    const frameDeltas = [];
    if (
      "PerformanceObserver" in window &&
      PerformanceObserver.supportedEntryTypes.includes("longtask")
    ) {
      observer = new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          longTasks.push({ duration: entry.duration, startTime: entry.startTime });
        }
      });
      observer.observe({ type: "longtask" });
    }
    function recordFrame(timestamp) {
      if (!running) {
        return;
      }
      frameDeltas.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      requestAnimationFrame(recordFrame);
    }
    requestAnimationFrame(recordFrame);
    window.__settaWorkspaceDragPerfStop = () => {
      running = false;
      observer?.disconnect();
      window.__settaWorkspaceDragPerfStop = null;
      const samples = frameDeltas.slice(1).filter((value) => Number.isFinite(value) && value >= 0);
      const sorted = [...samples].sort((left, right) => left - right);
      const quantile = (percentile) => {
        if (sorted.length === 0) {
          return 0;
        }
        const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile));
        return sorted[index];
      };
      const sum = samples.reduce((total, value) => total + value, 0);
      const averageFrameDeltaMs = samples.length > 0 ? sum / samples.length : 0;
      const gestureLongTasks = longTasks.filter((entry) => entry.startTime >= startedAt);
      return {
        averageFps: averageFrameDeltaMs > 0 ? 1000 / averageFrameDeltaMs : 0,
        averageFrameDeltaMs,
        durationMs: performance.now() - startedAt,
        frameCount: samples.length,
        longTaskCount: gestureLongTasks.length,
        longTaskTotalMs: gestureLongTasks.reduce((total, entry) => total + entry.duration, 0),
        maxFrameDeltaMs: sorted.at(-1) ?? 0,
        p95FrameDeltaMs: quantile(0.95),
        p99FrameDeltaMs: quantile(0.99),
        slowFramesOver16Ms: samples.filter((value) => value > 16.67).length,
        slowFramesOver32Ms: samples.filter((value) => value > 32).length,
        slowFramesOver50Ms: samples.filter((value) => value > 50).length,
      };
    };
    return true;
  })()`);
  if (!started) {
    throw new Error("workspace drag frame sampler was already running");
  }
}

async function stopBrowserFrameSampler(client) {
  const result = await client.evaluate(`(() => {
    if (!window.__settaWorkspaceDragPerfStop) {
      return { ok: false, reason: "missing-sampler" };
    }
    return { ok: true, sample: window.__settaWorkspaceDragPerfStop() };
  })()`);
  if (!result.ok) {
    throw new Error(`workspace drag frame sampler could not stop: ${JSON.stringify(result)}`);
  }
  return result.sample;
}

async function readFrameMetrics(client) {
  const metrics = await client.evaluate(frameMetricsExpression());
  if (!metrics) {
    throw new Error("workspace frame metrics hook was not installed");
  }
  return metrics;
}

async function resetFrameMetrics(client) {
  const reset = await client.evaluate(frameMetricsResetExpression());
  if (!reset) {
    throw new Error("workspace frame metrics reset hook was not installed");
  }
}

async function safePaneSnapshot(client) {
  try {
    return await client.evaluate(paneSnapshotExpression());
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

function workspacePresentationModeExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.presentationMode ?? "" : "";
  })()`;
}

function frameMetricsExpression() {
  return `(() => window.__settaWorkspaceReadFrameMetrics?.() ?? null)()`;
}

function frameMetricsResetExpression() {
  return `(() => {
    if (!window.__settaWorkspaceResetFrameMetrics) {
      return false;
    }
    window.__settaWorkspaceResetFrameMetrics();
    return true;
  })()`;
}

function paneSnapshotExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const stage = document.querySelector('[data-testid="workspace-presentation-engine"]');
    const stageRect = stage instanceof HTMLElement
      ? stage.getBoundingClientRect()
      : { left: 0, top: 0, width: 0, height: 0 };
    const ghost = document.querySelector('[data-workspace-overview-ghost]');
    const ghostHost = ghost instanceof HTMLElement
      ? (() => {
          const rect = ghost.getBoundingClientRect();
          return {
            placement: ghost.dataset.overviewGhostPlacement ?? "",
            paneId: ghost.dataset.overviewGhostPaneId ?? "",
            rect: { height: rect.height, left: rect.left, top: rect.top, width: rect.width },
          };
        })()
      : null;
    const visibleHosts = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'))
      .filter((host) => host instanceof HTMLElement && host.dataset.visible === "true")
      .map((host) => {
        const rect = host.getBoundingClientRect();
        return {
          dragSource: host.dataset.dragSource === "true",
          dropAxis: host.dataset.dropAxis ?? "",
          dropTarget: host.dataset.dropTarget ?? "",
          focused: host.dataset.focused === "true",
          paneId: host.dataset.paneId ?? "",
          presentationMode: host.dataset.presentationMode ?? "",
          rect: {
            height: rect.height,
            left: rect.left,
            top: rect.top,
            width: rect.width,
          },
        };
      });
    return {
      focusedPaneId: visibleHosts.find((host) => host.focused)?.paneId ?? "",
      ghost: ghostHost,
      mode: area instanceof HTMLElement ? area.dataset.presentationMode ?? "" : "",
      overviewDragging: area instanceof HTMLElement ? area.dataset.overviewDragging ?? "" : "",
      paneDragging: area instanceof HTMLElement ? area.dataset.paneDragging ?? "" : "",
      stageRect: {
        height: stageRect.height,
        left: stageRect.left,
        top: stageRect.top,
        width: stageRect.width,
      },
      totalPanes: area instanceof HTMLElement ? Number(area.dataset.paneCount ?? "0") : 0,
      visibleHosts,
      workspaceId: area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "",
      workspaceMode: area instanceof HTMLElement ? area.dataset.workspaceMode ?? "" : "",
    };
  })()`;
}
