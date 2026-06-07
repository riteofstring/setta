#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
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

const options = parseElectronHarnessArgs(process.argv.slice(2));
const overviewWorkflowTimeoutMs = 25_000;
const transitionSampleMs = 1400;
const viewport = {
  deviceScaleFactor: 1,
  height: 900,
  mobile: false,
  width: 1440,
};

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/overview-zoom-performance.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("overview-zoom-performance");
await writeLatestRecordingPointer("overview-zoom-performance", artifactDir);
const fixture = await createElectronFixture("overview-zoom-performance");
let context = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    },
    fixture,
    visible: options.visible,
  });
  await context.client.call("Emulation.setDeviceMetricsOverride", viewport);
  await waitForSelector(context.client, '[data-testid="niri-workspace-area"]');
  await ensureWorkspaceOpen(context.client);
  await waitForWorkspacePaneHosts(context.client);
  await ensureVisibleBrowserPaneCount(context.client, 2);
  await ensureNormalMode(context.client);
  await waitForNativeBrowserLiveCount(context.client, 2);
  const normalSnapshots = await waitForBrowserSnapshotImages(context.client, 2);
  await delay(500);
  const normalBeforeBrowserStats = await readNativeBrowserStats(context.client);
  await captureScreenshot(context.client, join(artifactDir, "normal-before.png"));

  const enter = await measureOverviewTransition(context.client, {
    buttonLabel: "Enter overview",
    expectedMode: "overview",
    name: "enter-overview",
  });
  const overviewBrowserStats = await readNativeBrowserStats(context.client);
  assertNativeBrowsersHiddenForOverview(overviewBrowserStats, 2);
  const overviewSnapshots = await waitForBrowserSnapshotImages(context.client, 2);
  assertOverviewSnapshotsUseNativeSize(overviewSnapshots);
  await captureScreenshot(context.client, join(artifactDir, "overview.png"));

  const exit = await measureOverviewTransition(context.client, {
    buttonLabel: "Exit overview",
    expectedMode: "normal",
    name: "exit-overview",
  });
  await waitForNativeBrowserLiveCount(context.client, 2);
  const normalAfterBrowserStats = await readNativeBrowserStats(context.client);
  await captureScreenshot(context.client, join(artifactDir, "normal-after.png"));

  const summary = {
    artifactDir,
    browserStats: {
      normalAfter: normalAfterBrowserStats,
      normalBefore: normalBeforeBrowserStats,
      overview: overviewBrowserStats,
    },
    browserSnapshots: {
      normal: normalSnapshots,
      overview: overviewSnapshots,
    },
    samples: [enter, exit],
    status: "passed",
    viewport,
    workspaceName: basename(fixture.workspaceRoot),
  };
  await writeJson(join(artifactDir, "summary.json"), summary);
  console.log(`Electron overview zoom performance passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      snapshot: await safeWorkspaceSnapshot(context.client),
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

async function ensureWorkspaceOpen(client) {
  const currentWorkspaceId = await client.evaluate(workspaceIdExpression());
  if (currentWorkspaceId && !currentWorkspaceId.endsWith(":empty")) {
    return;
  }
  const opened = await client.evaluate(`(() => {
    const button = document.querySelector('button[aria-label="Open project folder"]');
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-open-project-folder-button" };
    }
    if (button.disabled) {
      return { ok: false, reason: "disabled-open-project-folder-button" };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!opened.ok) {
    throw new Error(`workspace open failed: ${JSON.stringify(opened)}`);
  }
  await waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => workspaceId !== "" && !workspaceId.endsWith(":empty"),
    overviewWorkflowTimeoutMs,
  );
}

async function waitForWorkspacePaneHosts(client) {
  await waitForState(
    client,
    workspaceSnapshotExpression(),
    (snapshot) => snapshot.hosts.length >= 3 && snapshot.visibleHosts >= 3,
    overviewWorkflowTimeoutMs,
  );
}

async function ensureVisibleBrowserPaneCount(client, minimumCount) {
  for (let attempt = 0; attempt < minimumCount; attempt += 1) {
    const browserCount = await client.evaluate(visibleBrowserHostCountExpression());
    if (browserCount >= minimumCount) {
      return;
    }
    await openBrowserPane(client);
    await waitForState(
      client,
      visibleBrowserHostCountExpression(),
      (currentCount) => currentCount > browserCount,
      overviewWorkflowTimeoutMs,
    );
  }
  const finalCount = await client.evaluate(visibleBrowserHostCountExpression());
  if (finalCount < minimumCount) {
    throw new Error(`expected at least ${minimumCount} visible browser panes, found ${finalCount}`);
  }
}

async function openBrowserPane(client) {
  const result = await client.evaluate(`(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      altKey: true,
      bubbles: true,
      cancelable: true,
      key: "b",
      metaKey: true,
    }));
    return { ok: true };
  })()`);
  if (!result.ok) {
    throw new Error(`browser pane shortcut failed: ${JSON.stringify(result)}`);
  }
}

async function waitForNativeBrowserLiveCount(client, minimumCount) {
  await waitForState(
    client,
    nativeBrowserStatsExpression(),
    (stats) => stats !== null && stats.live >= minimumCount,
    overviewWorkflowTimeoutMs,
  );
}

async function waitForBrowserSnapshotImages(client, minimumCount) {
  return waitForState(
    client,
    browserSnapshotImagesExpression(),
    (snapshots) =>
      snapshots.ready.length >= minimumCount &&
      snapshots.ready.every(
        (snapshot) =>
          snapshot.imageWidth > 1 &&
          snapshot.imageHeight > 1 &&
          snapshot.naturalWidth > 1 &&
          snapshot.naturalHeight > 1,
      ),
    overviewWorkflowTimeoutMs,
  );
}

async function readNativeBrowserStats(client) {
  const stats = await client.evaluate(nativeBrowserStatsExpression());
  if (!stats) {
    throw new Error("native browser stats bridge is unavailable");
  }
  return stats;
}

function assertNativeBrowsersHiddenForOverview(stats, minimumCount) {
  if (stats.registered < minimumCount || stats.hidden < minimumCount || stats.live !== 0) {
    throw new Error(`native browsers were not hidden during overview: ${JSON.stringify(stats)}`);
  }
}

function assertOverviewSnapshotsUseNativeSize(snapshots) {
  const invalid = snapshots.ready.filter(
    (snapshot) =>
      snapshot.mode !== "overview" ||
      snapshot.runtimeState !== "snapshot" ||
      snapshot.imageHidden ||
      snapshot.imageWidth < Math.round(snapshot.hostStyleWidth) ||
      snapshot.imageHeight < Math.round(snapshot.hostStyleHeight - 30),
  );
  if (invalid.length > 0) {
    throw new Error(`overview browser snapshots were not native sized: ${JSON.stringify(invalid)}`);
  }
}

async function ensureNormalMode(client) {
  const mode = await client.evaluate(workspacePresentationModeExpression());
  if (mode === "normal") {
    return;
  }
  await clickOverviewButton(client, "Exit overview");
  await delay(transitionSampleMs);
  await waitForState(
    client,
    workspacePresentationModeExpression(),
    (currentMode) => currentMode === "normal",
    overviewWorkflowTimeoutMs,
  );
}

async function clickOverviewButton(client, buttonLabel) {
  const result = await client.evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(`button[aria-label="${buttonLabel}"]`)});
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-overview-button", buttonLabel: ${JSON.stringify(
        buttonLabel,
      )} };
    }
    if (button.disabled) {
      return { ok: false, reason: "disabled-overview-button", buttonLabel: ${JSON.stringify(
        buttonLabel,
      )} };
    }
    button.click();
    return { ok: true };
  })()`);
  if (!result.ok) {
    throw new Error(`overview toggle failed: ${JSON.stringify(result)}`);
  }
}

async function measureOverviewTransition(client, { buttonLabel, expectedMode, name }) {
  const result = await client.evaluate(`(async () => {
    const area = document.querySelector('[data-testid="niri-workspace-area"]');
    const button = document.querySelector(${JSON.stringify(`button[aria-label="${buttonLabel}"]`)});
    if (!(area instanceof HTMLElement)) {
      return { ok: false, reason: "missing-workspace-area" };
    }
    if (!(button instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-overview-button", buttonLabel: ${JSON.stringify(
        buttonLabel,
      )} };
    }
    const startedAt = performance.now();
    const longTasks = [];
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
    const frames = [];
    const nativeBrowserStats = [];
    const runtimeStateSamples = [];
    async function recordNativeBrowserStats(phase) {
      const api = window.setta?.niriNativeViews;
      if (!api?.readBrowserViewStats) {
        nativeBrowserStats.push({ phase, stats: null });
        return;
      }
      nativeBrowserStats.push({ phase, stats: await api.readBrowserViewStats() });
    }
    const initialMode = area.dataset.presentationMode ?? "";
    await recordNativeBrowserStats("before-click");
    let previousTimestamp = performance.now();
    let running = true;
    function recordFrame(timestamp) {
      if (!running) {
        return;
      }
      frames.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      runtimeStateSamples.push(runtimeStatesForPaneHosts());
      requestAnimationFrame(recordFrame);
    }
    requestAnimationFrame(recordFrame);
    button.click();
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    await recordNativeBrowserStats("after-click-80ms");
    await new Promise((resolve) => window.setTimeout(resolve, ${transitionSampleMs - 80}));
    running = false;
    observer?.disconnect();
    await recordNativeBrowserStats("after-transition");
    const samples = frames.slice(1).filter((value) => Number.isFinite(value) && value >= 0);
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
    const runtimeStates = runtimeStatesForPaneHosts();
    const maxRuntimeStatesDuringTransition = runtimeStateSamples.reduce((maxStates, states) => {
      for (const [state, count] of Object.entries(states)) {
        maxStates[state] = Math.max(maxStates[state] ?? 0, count);
      }
      return maxStates;
    }, {});
    return {
      averageFps: averageFrameDeltaMs > 0 ? 1000 / averageFrameDeltaMs : 0,
      averageFrameDeltaMs,
      durationMs: performance.now() - startedAt,
      finalMode: area.dataset.presentationMode ?? "",
      frameCount: samples.length,
      initialMode,
      longTaskCount: longTasks.filter((entry) => entry.startTime >= startedAt).length,
      longTaskTotalMs: longTasks
        .filter((entry) => entry.startTime >= startedAt)
        .reduce((total, entry) => total + entry.duration, 0),
      maxFrameDeltaMs: sorted.at(-1) ?? 0,
      maxRuntimeStatesDuringTransition,
      name: ${JSON.stringify(name)},
      nativeBrowserStats,
      ok: true,
      p95FrameDeltaMs: quantile(0.95),
      p99FrameDeltaMs: quantile(0.99),
      runtimeStates,
      slowFramesOver32Ms: samples.filter((value) => value > 32).length,
      slowFramesOver50Ms: samples.filter((value) => value > 50).length,
    };
    function runtimeStatesForPaneHosts() {
      return Array.from(document.querySelectorAll(".niri-pane-host")).reduce((states, host) => {
        const state =
          host instanceof HTMLElement ? host.dataset.runtimeState ?? "unknown" : "unknown";
        states[state] = (states[state] ?? 0) + 1;
        return states;
      }, {});
    }
  })()`);
  if (!result.ok) {
    throw new Error(`overview transition measurement failed: ${JSON.stringify(result)}`);
  }
  if (result.finalMode !== expectedMode) {
    throw new Error(
      `overview transition ended in ${result.finalMode}, want ${expectedMode}: ${JSON.stringify(
        result,
      )}`,
    );
  }
  return result;
}

async function safeWorkspaceSnapshot(client) {
  try {
    return await client.evaluate(workspaceSnapshotExpression());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="niri-workspace-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

function workspacePresentationModeExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="niri-workspace-area"]');
    return area instanceof HTMLElement ? area.dataset.presentationMode ?? "" : "";
  })()`;
}

function workspaceSnapshotExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="niri-workspace-area"]');
    const hosts = Array.from(document.querySelectorAll(".niri-pane-host")).map((host) => {
      if (!(host instanceof HTMLElement)) {
        return { visible: false };
      }
      return {
        surfaceKind: host.dataset.surfaceKind ?? "",
        focused: host.dataset.focused ?? "",
        paneId: host.dataset.paneId ?? "",
        presentationMode: host.dataset.presentationMode ?? "",
        runtimeState: host.dataset.runtimeState ?? "",
        visible: host.dataset.visible === "true",
      };
    });
    return {
      hosts,
      mode: area instanceof HTMLElement ? area.dataset.presentationMode ?? "" : "",
      visibleHosts: hosts.filter((host) => host.visible).length,
      workspaceId: area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "",
    };
  })()`;
}

function visibleBrowserHostCountExpression() {
  return `(() => Array.from(document.querySelectorAll(".niri-pane-host")).filter((host) => (
    host instanceof HTMLElement &&
    host.dataset.surfaceKind === "browser" &&
    host.dataset.visible === "true"
  )).length)()`;
}

function nativeBrowserStatsExpression() {
  return `(async () => {
    const api = window.setta?.niriNativeViews;
    if (!api?.readBrowserViewStats) {
      return null;
    }
    return await api.readBrowserViewStats();
  })()`;
}

function browserSnapshotImagesExpression() {
  return `(async () => {
    const area = document.querySelector('[data-testid="niri-workspace-area"]');
    const mode = area instanceof HTMLElement ? area.dataset.presentationMode ?? "" : "";
    const nativeStats = await window.setta?.niriNativeViews?.readBrowserViewStats?.() ?? null;
    const snapshots = Array.from(document.querySelectorAll(
      '.niri-pane-host[data-surface-kind="browser"][data-visible="true"]',
    )).map((host) => {
      const image = host.querySelector('[data-niri-browser-snapshot]');
      const hostRect = host.getBoundingClientRect();
      return {
        hostHeight: hostRect.height,
        hostStyleHeight: Number.parseFloat(host.style.height || "0"),
        hostStyleWidth: Number.parseFloat(host.style.width || "0"),
        hostWidth: hostRect.width,
        imageHeight: image instanceof HTMLImageElement ? image.height : 0,
        imageHidden: image instanceof HTMLImageElement ? image.hidden : true,
        imageWidth: image instanceof HTMLImageElement ? image.width : 0,
        mode,
        naturalHeight: image instanceof HTMLImageElement ? image.naturalHeight : 0,
        naturalWidth: image instanceof HTMLImageElement ? image.naturalWidth : 0,
        paneId: host instanceof HTMLElement ? host.dataset.paneId ?? "" : "",
        ready:
          image instanceof HTMLImageElement &&
          image.parentElement instanceof HTMLElement &&
          image.parentElement.dataset.browserSnapshotReady === "true",
        runtimeState: host instanceof HTMLElement ? host.dataset.runtimeState ?? "" : "",
      };
    });
    return {
      nativeStats,
      ready: snapshots.filter((snapshot) => snapshot.ready),
      snapshots,
    };
  })()`;
}
