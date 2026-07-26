#!/usr/bin/env node
/* global console, URL */

import { basename, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  dispatchWheel,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { assertSmoothFrameSample, frameBudgetSummary } from "./performance-frame-budget.mjs";
import {
  configure4kViewport,
  measureOverviewTransition,
} from "./workspace-overview-performance-helpers.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "niri-navigation-performance";
const workflowTimeoutMs = 45_000;
const minimumVisibleBenchmarkHosts = 32;

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
let context = null;

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
  await captureScreenshot(context.client, join(artifactDir, "normal-before.png"));

  const focusSwitching = await measureFocusSwitching(context.client);
  await captureScreenshot(context.client, join(artifactDir, "normal-after-focus-switching.png"));

  const enterOverview = await measureOverviewTransition(context.client, {
    buttonLabel: "Enter overview",
    expectedMode: "overview",
    name: "niri-enter-overview",
  });
  assertSmoothFrameSample(enterOverview, "niri enter overview", { minFrameCount: 30 });
  const overviewPan = await measureOverviewWheelPan(context.client);
  await captureScreenshot(context.client, join(artifactDir, "overview-after-pan.png"));

  const exitOverview = await measureOverviewTransition(context.client, {
    buttonLabel: "Exit overview",
    expectedMode: "normal",
    name: "niri-exit-overview",
  });
  assertSmoothFrameSample(exitOverview, "niri exit overview", { minFrameCount: 30 });
  const finalSnapshot = await waitForBenchmarkPaneHosts(context.client);
  await captureScreenshot(context.client, join(artifactDir, "normal-after.png"));

  const summary = {
    artifactDir,
    finalSnapshot,
    frameBudgets: {
      enterOverview: frameBudgetSummary(enterOverview),
      exitOverview: frameBudgetSummary(exitOverview),
      focusSwitching: frameBudgetSummary(focusSwitching),
      overviewPan: frameBudgetSummary(overviewPan),
    },
    initialSnapshot,
    samples: {
      enterOverview,
      exitOverview,
      focusSwitching,
      overviewPan,
    },
    status: "passed",
    viewport: "4k",
    workspaceName: basename(fixture.workspaceRoot),
  };
  await writeJson(join(artifactDir, "summary.json"), summary);
  console.log(
    [
      `Electron niri navigation performance passed: ${artifactDir}`,
      `focusP95=${focusSwitching.p95FrameDeltaMs.toFixed(2)}ms`,
      `overviewPanP95=${overviewPan.p95FrameDeltaMs.toFixed(2)}ms`,
    ].join(" "),
  );
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      sampler: await safeStopSampler(context.client),
      snapshot: await safePaneSnapshot(context.client),
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

async function measureFocusSwitching(client) {
  await warmUpFocusSwitching(client);
  const before = await client.evaluate(paneSnapshotExpression());
  await startSampler(client);
  const keys = [
    "ArrowRight",
    "ArrowRight",
    "ArrowDown",
    "ArrowLeft",
    "ArrowUp",
    "ArrowRight",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowLeft",
  ];
  for (const key of keys) {
    await dispatchWorkspaceShortcut(client, { altKey: true, key, metaKey: true });
    await delay(24);
  }
  await delay(240);
  const sample = await stopSampler(client);
  const after = await client.evaluate(paneSnapshotExpression());
  const result = { ...sample, after, before };
  assertSmoothFrameSample(result, "niri focus switching", { minFrameCount: 20 });
  if (before.focusedPaneId === after.focusedPaneId) {
    throw new Error(`focus switching did not change focus: ${JSON.stringify({ after, before })}`);
  }
  return result;
}

async function warmUpFocusSwitching(client) {
  await dispatchWorkspaceShortcut(client, { altKey: true, key: "ArrowRight", metaKey: true });
  await delay(240);
  await dispatchWorkspaceShortcut(client, { altKey: true, key: "ArrowLeft", metaKey: true });
  await delay(320);
}

async function measureOverviewWheelPan(client) {
  await waitForState(
    client,
    paneSnapshotExpression(),
    (snapshot) =>
      snapshot.mode === "overview" &&
      snapshot.workspaceMode === "benchmark" &&
      snapshot.visibleHosts.length >= minimumVisibleBenchmarkHosts,
    workflowTimeoutMs,
  );
  const point = await stageCenterPoint(client);
  await startSampler(client);
  for (let index = 0; index < 80; index += 1) {
    await dispatchWheel(client, { deltaX: 240, deltaY: 180, x: point.x, y: point.y });
    await delay(8);
  }
  await delay(240);
  const sample = await stopSampler(client);
  const after = await client.evaluate(paneSnapshotExpression());
  const result = { ...sample, after };
  assertSmoothFrameSample(result, "niri overview wheel pan", { minFrameCount: 30 });
  return result;
}

async function dispatchWorkspaceShortcut(client, { altKey, key, metaKey }) {
  const result = await client.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      altKey: ${JSON.stringify(altKey)},
      bubbles: true,
      cancelable: true,
      key: ${JSON.stringify(key)},
      metaKey: ${JSON.stringify(metaKey)},
    }));
    return { ok: true };
  })()`);
  if (!result.ok) {
    throw new Error(`workspace shortcut failed: ${JSON.stringify(result)}`);
  }
}

async function stageCenterPoint(client) {
  const point = await client.evaluate(`(() => {
    const stage = document.querySelector('[data-testid="workspace-presentation-engine"]');
    if (!(stage instanceof HTMLElement)) {
      return { ok: false, reason: "missing-stage" };
    }
    const rect = stage.getBoundingClientRect();
    return {
      ok: true,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
  })()`);
  if (!point.ok) {
    throw new Error(`workspace stage point unavailable: ${JSON.stringify(point)}`);
  }
  return point;
}

async function startSampler(client) {
  const started = await client.evaluate(startSamplerExpression());
  if (!started.ok) {
    throw new Error(`workspace sampler did not start: ${JSON.stringify(started)}`);
  }
}

async function stopSampler(client) {
  const result = await client.evaluate(stopSamplerExpression());
  if (!result.ok) {
    throw new Error(`workspace sampler did not stop: ${JSON.stringify(result)}`);
  }
  return result.sample;
}

async function safeStopSampler(client) {
  try {
    return await client.evaluate(stopSamplerExpression());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function safePaneSnapshot(client) {
  try {
    return await client.evaluate(paneSnapshotExpression());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function startSamplerExpression() {
  return `(() => {
    window.__settaNiriNavigationPerfStop?.();
    const startedAt = performance.now();
    const frames = [];
    const longTasks = [];
    let previousTimestamp = startedAt;
    let running = true;
    let observer = null;
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
      frames.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      requestAnimationFrame(recordFrame);
    }
    requestAnimationFrame(recordFrame);
    window.__settaNiriNavigationPerfStop = () => {
      running = false;
      observer?.disconnect();
      window.__settaNiriNavigationPerfStop = null;
      const samples = frames.slice(1).filter((value) => Number.isFinite(value) && value >= 0);
      const sorted = [...samples].sort((left, right) => left - right);
      const quantile = (percentile) => {
        if (sorted.length === 0) {
          return 0;
        }
        const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile));
        return sorted[index];
      };
      const averageFrameDeltaMs =
        samples.length > 0
          ? samples.reduce((total, value) => total + value, 0) / samples.length
          : 0;
      const observedFrameBudgetMs = quantile(0.5) <= 10 ? 8.33 : 16.67;
      const sampledLongTasks = longTasks.filter((entry) => entry.startTime >= startedAt);
      return {
        averageFps: averageFrameDeltaMs > 0 ? 1000 / averageFrameDeltaMs : 0,
        averageFrameDeltaMs,
        durationMs: performance.now() - startedAt,
        frameCount: samples.length,
        framesMs: samples.map((value) => Number(value.toFixed(3))),
        longTaskCount: sampledLongTasks.length,
        longTaskMaxMs: sampledLongTasks.reduce(
          (maxValue, entry) => Math.max(maxValue, entry.duration),
          0,
        ),
        longTaskTotalMs: sampledLongTasks.reduce(
          (total, entry) => total + entry.duration,
          0,
        ),
        maxFrameDeltaMs: sorted.at(-1) ?? 0,
        observedFrameBudgetMs,
        p50FrameDeltaMs: quantile(0.5),
        p95FrameDeltaMs: quantile(0.95),
        p99FrameDeltaMs: quantile(0.99),
        slowFramesOver120HzBudget: samples.filter((value) => value > 8.33).length,
        slowFramesOver16Ms: samples.filter((value) => value > 16.67).length,
        slowFramesOver32Ms: samples.filter((value) => value > 32).length,
        slowFramesOver50Ms: samples.filter((value) => value > 50).length,
      };
    };
    return { ok: true };
  })()`;
}

function stopSamplerExpression() {
  return `(() => {
    if (!window.__settaNiriNavigationPerfStop) {
      return { ok: false, reason: "missing-sampler" };
    }
    return { ok: true, sample: window.__settaNiriNavigationPerfStop() };
  })()`;
}

function paneSnapshotExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    const stage = document.querySelector('[data-testid="workspace-presentation-engine"]');
    const stageRect = stage instanceof HTMLElement
      ? stage.getBoundingClientRect()
      : { left: 0, top: 0, width: 0, height: 0 };
    const visibleHosts = Array.from(document.querySelectorAll('[data-testid="workspace-pane-host"]'))
      .filter((host) => host instanceof HTMLElement && host.dataset.visible === "true")
      .map((host) => {
        const rect = host.getBoundingClientRect();
        return {
          focused: host.dataset.focused === "true",
          paneId: host.dataset.paneId ?? "",
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
      mode: area instanceof HTMLElement ? area.dataset.presentationMode ?? "" : "",
      stageRect: {
        height: stageRect.height,
        left: stageRect.left,
        top: stageRect.top,
        width: stageRect.width,
      },
      totalPanes: area instanceof HTMLElement ? Number(area.dataset.paneCount ?? "0") : 0,
      visibleHosts,
      workspaceMode: area instanceof HTMLElement ? area.dataset.workspaceMode ?? "" : "",
    };
  })()`;
}
