#!/usr/bin/env node
/* global console, URL */

import { basename, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
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
import { assertSmoothFrameSample, frameBudgetSummary } from "./performance-frame-budget.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const benchmarkPaneCount = 9;
const benchmarkVisiblePaneCount = 9;
const nativeBrowserSnapshotMaxFrameDeltaMs = 75;
const nativeBrowserSnapshotMaxSlowFramesOver50Ms = 1;
const nativeBrowserRestoreFrameBudgetMs = 16.67;
const nativeBrowserRestoreMaxFrameDeltaMs = 150;
const nativeBrowserRestoreMaxLongTaskCount = 1;
const nativeBrowserRestoreMaxLongTaskTotalMs = 150;
const nativeBrowserRestoreMaxSlowFramesOver50Ms = 1;
const minimumBenchmarkBrowserPanes = 1;
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
  await navigateToBenchmarkSceneWithoutAutoFocus(context.client);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await waitForBenchmarkBrowserPaneHosts(context.client, minimumBenchmarkBrowserPanes);
  await ensureNormalMode(context.client);
  await waitForNativeBrowserLiveCount(context.client, minimumBenchmarkBrowserPanes);
  const normalSnapshots = await waitForBrowserSnapshotImages(
    context.client,
    minimumBenchmarkBrowserPanes,
  );
  await delay(500);
  const normalBeforeBrowserStats = await readNativeBrowserStats(context.client);
  await captureScreenshot(context.client, join(artifactDir, "normal-before.png"));

  const enter = await measureOverviewTransition(context.client, {
    buttonLabel: "Enter overview",
    expectedMode: "overview",
    name: "enter-overview",
    trigger: "shortcut",
  });
  assertSmoothFrameSample(enter, "enter overview transition", {
    maxFrameDeltaMs: nativeBrowserSnapshotMaxFrameDeltaMs,
    maxSlowFramesOver50Ms: nativeBrowserSnapshotMaxSlowFramesOver50Ms,
    minFrameCount: 30,
  });
  const overviewBrowserStats = await readNativeBrowserStats(context.client);
  assertNativeBrowsersHiddenForOverview(overviewBrowserStats, minimumBenchmarkBrowserPanes);
  const overviewSnapshots = await waitForBrowserSnapshotImages(
    context.client,
    minimumBenchmarkBrowserPanes,
  );
  assertOverviewSnapshotsUseNativeSize(overviewSnapshots);
  await captureScreenshot(context.client, join(artifactDir, "overview.png"));

  const exit = await measureOverviewTransition(context.client, {
    buttonLabel: "Exit overview",
    expectedMode: "normal",
    name: "exit-overview",
    trigger: "shortcut",
  });
  assertSmoothFrameSample(exit, "exit overview transition", {
    frameBudgetMs: nativeBrowserRestoreFrameBudgetMs,
    maxFrameDeltaMs: nativeBrowserRestoreMaxFrameDeltaMs,
    maxLongTaskCount: nativeBrowserRestoreMaxLongTaskCount,
    maxLongTaskTotalMs: nativeBrowserRestoreMaxLongTaskTotalMs,
    maxSlowFramesOver50Ms: nativeBrowserRestoreMaxSlowFramesOver50Ms,
    minFrameCount: 30,
  });
  await waitForNativeBrowserLiveCount(context.client, minimumBenchmarkBrowserPanes);
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
    frameBudgets: {
      enter: frameBudgetSummary(enter),
      exit: frameBudgetSummary(exit, { frameBudgetMs: nativeBrowserRestoreFrameBudgetMs }),
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

async function navigateToBenchmarkSceneWithoutAutoFocus(client) {
  const currentURL = await client.evaluate("location.href");
  const nextURL = new URL(currentURL);
  nextURL.searchParams.set("workspaceScene", "benchmark");
  nextURL.searchParams.set("workspaceAuto", "false");
  nextURL.searchParams.set("workspaceBenchmarkPaneCount", String(benchmarkPaneCount));
  nextURL.searchParams.set("workspaceBenchmarkVisiblePanes", String(benchmarkVisiblePaneCount));
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
      state.search.includes("workspaceAuto=false") &&
      state.search.includes(`workspaceBenchmarkPaneCount=${benchmarkPaneCount}`) &&
      state.search.includes(`workspaceBenchmarkVisiblePanes=${benchmarkVisiblePaneCount}`),
    overviewWorkflowTimeoutMs,
  );
}

async function waitForBenchmarkBrowserPaneHosts(client, minimumBrowserCount) {
  await waitForDriverState(
    client,
    "overviewWorkspaceSnapshot",
    {},
    (snapshot) =>
      snapshot.workspaceMode === "benchmark" &&
      snapshot.mode === "normal" &&
      snapshot.visibleBrowserHosts >= minimumBrowserCount,
    overviewWorkflowTimeoutMs,
  );
}

async function waitForNativeBrowserLiveCount(client, minimumCount) {
  await waitForDriverState(
    client,
    "overviewNativeBrowserStats",
    {},
    (stats) => stats !== null && stats.live >= minimumCount,
    overviewWorkflowTimeoutMs,
  );
}

async function waitForBrowserSnapshotImages(client, minimumCount) {
  return waitForDriverState(
    client,
    "overviewBrowserSnapshotImages",
    {},
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
  const stats = await client.driver("overviewNativeBrowserStats");
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
  const mode = await client.driver("overviewPresentationMode");
  if (mode === "normal") {
    return;
  }
  await clickOverviewButton(client, "Exit overview");
  await delay(transitionSampleMs);
  await waitForDriverState(
    client,
    "overviewPresentationMode",
    {},
    (currentMode) => currentMode === "normal",
    overviewWorkflowTimeoutMs,
  );
}

async function clickOverviewButton(client, buttonLabel) {
  const result = await client.driver("overviewClickButton", { buttonLabel });
  if (!result.ok) {
    throw new Error(`overview toggle failed: ${JSON.stringify(result)}`);
  }
}

async function measureOverviewTransition(client, { buttonLabel, expectedMode, name, trigger }) {
  const result = await client.driver("overviewMeasureTransition", {
    buttonLabel,
    includeNativeBrowserStats: true,
    name,
    sampleMs: transitionSampleMs,
    trigger,
  });
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
    return await client.driver("overviewWorkspaceSnapshot");
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function waitForDriverState(client, method, args, predicate, timeoutMs) {
  await client.installDriver();
  return waitForState(client, driverCallExpression(method, args), predicate, timeoutMs);
}
