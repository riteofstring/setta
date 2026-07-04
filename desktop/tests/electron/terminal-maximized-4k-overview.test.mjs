#!/usr/bin/env node
/* global console */

import { Buffer } from "node:buffer";
import { join } from "node:path";
import process from "node:process";

import {
  assertBuildExists,
  captureScreenshot,
  clickEnabledButtonByAria,
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
import {
  focusTerminal,
  openTerminalFromShortcut,
  terminalScrollbackSearchExpression,
  terminalSnapshotExpression,
} from "./terminal-workflow-helpers.mjs";
import {
  assertNoTransitionCaptureBlocking,
  configure4kViewport,
  ensureNormalMode,
  measureOverviewTransition,
  overviewPerformanceTimeoutMs,
  readFrameMetrics,
  readPaneHostState,
  shortDelay,
  viewport4k,
  waitForPaneHostState,
} from "./workspace-overview-performance-helpers.mjs";

const terminalOutputCommand =
  'i=0; while [ "$i" -lt 200 ]; do printf "frozen-terminal-%03d\\n" "$i"; i=$((i+1)); sleep 0.01; done';
const options = parseElectronHarnessArgs(process.argv.slice(2));

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/terminal-maximized-4k-overview.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("terminal-4k-overview");
await writeLatestRecordingPointer("terminal-4k-overview", artifactDir);
const fixture = await createElectronFixture("terminal-4k-overview");
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
  await configure4kViewport(context.client);
  await waitForSelector(
    context.client,
    '[data-testid="workspace-layout-area"]',
    overviewPerformanceTimeoutMs,
  );
  await ensureWorkspaceOpen(context.client);
  await openTerminalFromShortcut(context.client, overviewPerformanceTimeoutMs);
  await focusTerminal(context.client, overviewPerformanceTimeoutMs);
  const maximized = await context.client.driver("maximizeTerminalPane");
  if (!maximized.ok) {
    throw new Error(`terminal maximize failed: ${JSON.stringify(maximized)}`);
  }
  await waitForState(
    context.client,
    terminalSnapshotExpression(),
    (snapshot) => snapshot.exists && snapshot.maximized && snapshot.visible && snapshot.xtermReady,
    overviewPerformanceTimeoutMs,
  );
  await ensureNormalMode(context.client);
  const normalHost = await readPaneHostState(context.client, { surfaceKind: "terminal" });
  await writeTerminalCommand(context.client, terminalOutputCommand);
  await waitForState(
    context.client,
    terminalScrollbackSearchExpression("frozen-terminal-020"),
    (snapshot) => snapshot.found,
    overviewPerformanceTimeoutMs,
  );
  await captureScreenshot(context.client, join(artifactDir, "terminal-normal-streaming-4k.png"));

  const enter = await measureOverviewTransition(context.client, {
    buttonLabel: "Enter overview",
    expectedMode: "overview",
    name: "terminal-enter-overview",
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
      state.surfaceKind === "terminal" &&
      state.visible,
    overviewPerformanceTimeoutMs,
  );
  const overviewTextureUseCount =
    enter.metricDelta.snapshotFreshTextureUses +
    enter.metricDelta.snapshotStaleTextureUses +
    enter.metricDelta.snapshotMissingTextureUses;
  const overviewMetrics = await readFrameMetrics(context.client);
  if (overviewMetrics.liveTerminalRendererCount !== 0) {
    throw new Error(
      `terminal renderer remained live in overview: ${JSON.stringify(overviewMetrics)}`,
    );
  }
  await captureScreenshot(context.client, join(artifactDir, "terminal-overview-4k.png"));

  const exit = await measureOverviewTransition(context.client, {
    buttonLabel: "Exit overview",
    expectedMode: "normal",
    name: "terminal-exit-overview",
  });
  assertNoTransitionCaptureBlocking(exit);
  const finalHost = await waitForPaneHostState(
    context.client,
    { paneId: normalHost.paneId },
    (state) =>
      state.ok &&
      state.presentationMode === "normal" &&
      state.runtimeState === "live" &&
      state.surfaceKind === "terminal" &&
      state.surfaceFrozen === "false" &&
      state.visible,
    overviewPerformanceTimeoutMs,
  );
  const finalScrollback = await waitForState(
    context.client,
    terminalScrollbackSearchExpression("frozen-terminal-199"),
    (snapshot) => snapshot.found,
    overviewPerformanceTimeoutMs,
  );
  await captureScreenshot(context.client, join(artifactDir, "terminal-normal-after-4k.png"));

  const summary = {
    artifactDir,
    hosts: {
      final: finalHost,
      normal: normalHost,
      overview: overviewHost,
    },
    metrics: {
      final: await readFrameMetrics(context.client),
      overview: overviewMetrics,
    },
    overviewTextureUseCount,
    samples: [transitionSummary(enter), transitionSummary(exit)],
    status: "passed",
    terminal: {
      finalScrollback: {
        found: finalScrollback.found,
        source: finalScrollback.source,
      },
    },
    viewport: viewport4k,
  };
  await writeJson(join(artifactDir, "summary.json"), summary);
  console.log(`Electron terminal 4K overview passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-summary.json"), {
      error: error instanceof Error ? error.message : String(error),
      metrics: await readFrameMetrics(context.client).catch(() => null),
      terminal: await context.client.evaluate(terminalSnapshotExpression()).catch(() => null),
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

async function writeTerminalCommand(client, command) {
  await focusTerminal(client, overviewPerformanceTimeoutMs);
  const snapshot = await waitForState(
    client,
    terminalSnapshotExpression(),
    (state) => state.sessionId.startsWith("terminal_"),
    overviewPerformanceTimeoutMs,
  );
  const dataBase64 = Buffer.from(`${command}\r`, "utf8").toString("base64");
  const result = await client.evaluate(`(async () => {
    const api = window.setta?.terminal;
    if (!api?.input) {
      return { ok: false, reason: "missing-terminal-input-api" };
    }
    await api.input({
      dataBase64: ${JSON.stringify(dataBase64)},
      sessionId: ${JSON.stringify(snapshot.sessionId)}
    });
    return { ok: true };
  })()`);
  if (!result.ok) {
    throw new Error(`terminal input failed: ${JSON.stringify(result)}`);
  }
  await shortDelay(100);
}

async function ensureWorkspaceOpen(client) {
  await clickEnabledButtonByAria(client, "Open project folder", overviewPerformanceTimeoutMs);
  await waitForState(
    client,
    `(() => {
      const area = document.querySelector('[data-testid="workspace-layout-area"]');
      return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
    })()`,
    (workspaceId) => workspaceId !== "" && workspaceId !== "empty",
    overviewPerformanceTimeoutMs,
  );
}

function transitionSummary(sample) {
  return {
    longTaskCount: sample.longTaskCount,
    maxFrameDeltaMs: sample.maxFrameDeltaMs,
    metricDelta: sample.metricDelta,
    name: sample.name,
    p95FrameDeltaMs: sample.p95FrameDeltaMs,
    p99FrameDeltaMs: sample.p99FrameDeltaMs,
    runtimeStates: sample.runtimeStates,
  };
}
