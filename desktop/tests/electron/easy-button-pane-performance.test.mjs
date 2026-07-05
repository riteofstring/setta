#!/usr/bin/env node
/* global console */

import { basename, join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

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
import { driverCallExpression } from "./cdp-client.mjs";
import { assertSmoothFrameSample, frameBudgetSummary } from "./performance-frame-budget.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "easy-button-pane-performance";
const workflowTimeoutMs = 25_000;
const sampleDurationMs = 1200;

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/easy-button-pane-performance.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
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
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
    },
    fixture,
    visible: options.visible,
  });
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  await context.client.installDriver();
  await ensureWorkspaceOpen(context.client);
  await openEasyButtonFromShortcut(context.client);
  const pane = await waitForEasyButtonPane(context.client);
  await captureScreenshot(context.client, join(artifactDir, "easy-button-performance-idle.png"));

  const idle = await sampleEasyButton(context.client, "idle");
  assertSmoothFrameSample(idle.frameSample, "easy button idle", { minFrameCount: 20 });

  await forceEasyButtonFrozenAttribute(context.client);
  const frozenState = await waitForEasyButtonFrozen(context.client);
  const frozen = await sampleEasyButton(context.client, "frozen");
  assertSmoothFrameSample(frozen.frameSample, "easy button frozen", { minFrameCount: 20 });
  if (frozenState.buttonAnimationPlayState !== "paused") {
    throw new Error(`easy button frozen animation did not pause: ${JSON.stringify(frozenState)}`);
  }
  await captureScreenshot(context.client, join(artifactDir, "easy-button-performance-frozen.png"));

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    frameBudgets: {
      frozen: frameBudgetSummary(frozen.frameSample),
      idle: frameBudgetSummary(idle.frameSample),
    },
    frozen,
    frozenState,
    idle,
    pane,
    sampleDurationMs,
    status: "passed",
    workspaceName: basename(fixture.workspaceRoot),
  });
  console.log(`Electron easy button pane performance passed: ${artifactDir}`);
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      easyButton: await safeEasyButtonState(context.client),
      frameMetrics: await safeFrameMetricsSnapshot(context.client),
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
  if (currentWorkspaceId && currentWorkspaceId !== "empty") {
    return;
  }
  await clickEnabledButtonByAria(client, "Open project folder", workflowTimeoutMs);
  await waitForState(
    client,
    workspaceIdExpression(),
    (workspaceId) => workspaceId !== "" && workspaceId !== "empty",
    workflowTimeoutMs,
  );
}

async function openEasyButtonFromShortcut(client) {
  await client.driver("easyButtonPaneOpenShortcut");
}

async function sampleEasyButton(client, label) {
  await resetFrameMetrics(client);
  await startBrowserFrameSampler(client);
  await delay(sampleDurationMs);
  const frameSample = await stopBrowserFrameSampler(client);
  const frameMetrics = await readFrameMetrics(client);
  return {
    frameMetrics,
    frameSample,
    label,
  };
}

async function startBrowserFrameSampler(client) {
  const started = await client.driver("paneDragDropStartFrameSampler");
  if (!started) {
    throw new Error("easy button performance frame sampler was already running");
  }
}

async function stopBrowserFrameSampler(client) {
  const result = await client.driver("paneDragDropStopFrameSampler");
  if (!result.ok) {
    throw new Error(
      `easy button performance frame sampler could not stop: ${JSON.stringify(result)}`,
    );
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

async function forceEasyButtonFrozenAttribute(client) {
  const frozen = await client.driver("easyButtonPaneForceFrozen");
  if (!frozen) {
    throw new Error("easy button pane host was not available for frozen CSS verification");
  }
}

async function waitForEasyButtonPane(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "idle" &&
      state.buttonVisible,
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonFrozen(client) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) => state.exists && state.hostFrozen === "true",
    workflowTimeoutMs,
  );
}

async function safeEasyButtonState(client) {
  try {
    return await client.evaluate(easyButtonStateExpression());
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

function workspaceIdExpression() {
  return `(() => {
    const area = document.querySelector('[data-testid="workspace-layout-area"]');
    return area instanceof HTMLElement ? area.dataset.workspaceId ?? "" : "";
  })()`;
}

function easyButtonStateExpression() {
  return driverCallExpression("easyButtonPaneState");
}
