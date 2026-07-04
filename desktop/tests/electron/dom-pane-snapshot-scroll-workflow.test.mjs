#!/usr/bin/env node
/* global console */

import { spawnSync } from "node:child_process";
import { basename, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  repoRoot,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowTimeoutMs = 25_000;
const viewport = {
  deviceScaleFactor: 1,
  height: 900,
  mobile: false,
  width: 1440,
};

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/dom-pane-snapshot-scroll-workflow.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("dom-pane-snapshot-scroll");
await writeLatestRecordingPointer("dom-pane-snapshot-scroll", artifactDir);
const fixture = await createElectronFixture("dom-pane-snapshot-scroll");
seedShowcaseFixture(fixture);

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
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  await waitForState(
    context.client,
    bodyTextExpression(),
    (text) => text.includes("UI Showcase Chat"),
    workflowTimeoutMs,
  );
  await clickShowcaseConversation(context.client);
  await waitForState(
    context.client,
    bodyTextExpression(),
    (text) => text.includes("User input approval") && text.includes("Queued follow-up preview"),
    workflowTimeoutMs,
  );
  await scrollTranscriptToBottom(context.client);

  const liveScroller = await waitForState(
    context.client,
    liveScrollerExpression(),
    (value) => value.ready && value.atBottom,
    workflowTimeoutMs,
  );
  await captureScreenshot(context.client, join(artifactDir, "normal.png"));

  await clickEnterOverview(context.client);
  const overviewSnapshot = await waitForState(
    context.client,
    overviewSnapshotExpression(liveScroller.paneId),
    (value) => overviewSnapshotReady(value, liveScroller.scrollTop),
    workflowTimeoutMs,
  );
  await delay(400);
  await captureScreenshot(context.client, join(artifactDir, "overview.png"));
  const sidebarSnapshots = await toggleProjectSidebarInOverview(
    context.client,
    liveScroller.paneId,
    overviewSnapshot,
  );
  await captureScreenshot(context.client, join(artifactDir, "overview-after-sidebar-toggle.png"));

  await clickExitOverview(context.client);
  const restoreSamples = await sampleLiveScrollerAfterExit(context.client, liveScroller.paneId);
  assertNoLiveScrollReplay(restoreSamples, liveScroller.scrollTop);
  await captureScreenshot(context.client, join(artifactDir, "normal-after.png"));

  const summary = {
    artifactDir,
    liveScroller,
    overviewSnapshot,
    restoreSamples,
    sidebarSnapshots,
    status: "passed",
    viewport,
    workspaceName: basename(fixture.workspaceRoot),
  };
  await writeJson(join(artifactDir, "summary.json"), summary);
  console.log(`Electron DOM pane snapshot scroll workflow passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      snapshot: await safeSnapshot(context.client),
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

function seedShowcaseFixture(showcaseFixture) {
  const result = spawnSync(
    "./scripts/go.sh",
    [
      "run",
      "./cmd/seed-chat-showcase",
      "--app-data-dir",
      showcaseFixture.appDataDir,
      "--workspace-path",
      showcaseFixture.workspaceRoot,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(`seed chat showcase failed: ${result.stdout}\n${result.stderr}`);
  }
}

async function clickShowcaseConversation(client) {
  const clicked = await client.driver("clickShowcaseConversation");
  if (!clicked.ok) {
    throw new Error(`showcase conversation click failed: ${JSON.stringify(clicked)}`);
  }
}

async function scrollTranscriptToBottom(client) {
  const scrolled = await client.driver("scrollChatTranscriptToBottom");
  if (!scrolled.ok) {
    throw new Error(`transcript scroll failed: ${JSON.stringify(scrolled)}`);
  }
}

async function clickEnterOverview(client) {
  await clickOverviewButton(client, "Enter overview");
}

async function clickExitOverview(client) {
  await clickOverviewButton(client, "Exit overview");
}

async function toggleProjectSidebarInOverview(client, paneId, baselineSnapshot) {
  const afterFirstToggle = await toggleProjectSidebarAndWaitForStableSnapshot(
    client,
    paneId,
    baselineSnapshot,
  );
  const afterSecondToggle = await toggleProjectSidebarAndWaitForStableSnapshot(
    client,
    paneId,
    baselineSnapshot,
  );
  return { afterFirstToggle, afterSecondToggle };
}

async function toggleProjectSidebarAndWaitForStableSnapshot(client, paneId, baselineSnapshot) {
  const clicked = await client.driver("clickProjectSidebarToggle");
  if (!clicked.ok) {
    throw new Error(`project sidebar toggle failed: ${JSON.stringify(clicked)}`);
  }
  return waitForState(
    client,
    overviewSnapshotExpression(paneId),
    (value) => overviewSnapshotStableAfterSidebar(value, baselineSnapshot.scrollTop),
    workflowTimeoutMs,
  );
}

async function clickOverviewButton(client, label) {
  const clicked = await client.driver("clickOverviewButton", { label });
  if (!clicked.ok) {
    throw new Error(`${label} click failed: ${JSON.stringify(clicked)}`);
  }
}

function bodyTextExpression() {
  return driverCallExpression("bodyTextContent");
}

function liveScrollerExpression() {
  return driverCallExpression("liveChatScroller");
}

function overviewSnapshotExpression(paneId) {
  return driverCallExpression("overviewPaneSnapshot", { paneId });
}

function overviewSnapshotPreservesScroll(snapshot, expectedScrollTop) {
  if (snapshot.scrollerFound) {
    return Math.abs(snapshot.scrollTop - expectedScrollTop) <= 1;
  }
  return (
    snapshot.bitmapFound && snapshot.bitmapCaptureKey.includes(`${Math.round(expectedScrollTop)},`)
  );
}

function overviewSnapshotReady(snapshot, expectedScrollTop) {
  return (
    chatOverviewSnapshotReady(snapshot) &&
    snapshot.scrollerFound &&
    !snapshot.frozenVisualFound &&
    !snapshot.frozenScrollerFound &&
    snapshot.liveContentHidden !== "true" &&
    snapshot.centerHitLiveContent &&
    overviewSnapshotPreservesScroll(snapshot, expectedScrollTop) &&
    overviewSnapshotSourceSizeReady(snapshot) &&
    settingsOverviewSnapshotReady(snapshot)
  );
}

function overviewSnapshotStableAfterSidebar(snapshot, expectedScrollTop) {
  return (
    chatOverviewSnapshotReady(snapshot) &&
    overviewSnapshotPreservesScroll(snapshot, expectedScrollTop) &&
    settingsOverviewSnapshotReady(snapshot) &&
    overviewSnapshotSourceSizeReady(snapshot)
  );
}

function chatOverviewSnapshotReady(snapshot) {
  return (
    snapshot.chatHostFound &&
    snapshot.hostSurfaceKind === "chat-dom" &&
    snapshot.hostRuntimeState === "live" &&
    snapshot.hostSurfaceFrozen === "false"
  );
}

function settingsOverviewSnapshotReady(snapshot) {
  return (
    snapshot.settingsHostFound &&
    snapshot.settingsHostSurfaceKind === "settings-dom" &&
    snapshot.settingsHostRuntimeState === "live" &&
    snapshot.settingsHostSurfaceFrozen === "false" &&
    !snapshot.settingsSnapshotFound
  );
}

function overviewSnapshotSourceSizeReady(snapshot) {
  return snapshot.sourceHeight > 1 && snapshot.sourceWidth > 1;
}

async function sampleLiveScrollerAfterExit(client, paneId) {
  await waitForState(
    client,
    liveHostScrollerExpression(paneId),
    (sample) => sample.found && sample.hostRuntimeState === "live",
    workflowTimeoutMs,
  );
  return client.driver("sampleLiveScrollerAfterExit", { durationMs: 900, paneId });
}

function liveHostScrollerExpression(paneId) {
  return driverCallExpression("liveHostScroller", { paneId });
}

function assertNoLiveScrollReplay(samples, expectedScrollTop) {
  const liveSamples = samples.filter((sample) => sample.found);
  if (liveSamples.length === 0) {
    throw new Error(
      `no live chat scroller samples after exiting overview: ${JSON.stringify(samples)}`,
    );
  }
  const minimumScrollTop = Math.min(...liveSamples.map((sample) => sample.scrollTop));
  if (minimumScrollTop < expectedScrollTop - 8) {
    throw new Error(
      `live chat scroller replayed from the wrong offset: ${JSON.stringify({
        expectedScrollTop,
        minimumScrollTop,
        samples: liveSamples.slice(0, 20),
      })}`,
    );
  }
}

async function safeSnapshot(client) {
  try {
    return {
      bodyText: await client.driver("bodyTextContent"),
      liveScroller: await client.driver("liveChatScroller"),
      overviewSnapshot: await client.driver("overviewPaneSnapshot"),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
