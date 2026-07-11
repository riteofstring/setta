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
const workingPerformancePrompt = "cancel active workflow";

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

  await submitEasyButtonRequest(context.client, workingPerformancePrompt);
  const workingState = await waitForEasyButtonWorking(context.client, workingPerformancePrompt);
  await captureScreenshot(context.client, join(artifactDir, "easy-button-performance-working.png"));
  const working = await sampleEasyButton(context.client, "working");
  assertSmoothFrameSample(working.frameSample, "easy button working", { minFrameCount: 20 });

  await forceEasyButtonFrozenAttribute(context.client);
  const frozenState = await waitForEasyButtonFrozen(context.client, workingPerformancePrompt);
  const frozen = await sampleEasyButton(context.client, "frozen");
  assertSmoothFrameSample(frozen.frameSample, "easy button frozen", { minFrameCount: 20 });
  assertEasyButtonAnimationsPaused(frozenState);
  await captureScreenshot(context.client, join(artifactDir, "easy-button-performance-frozen.png"));
  await clickEasyButtonStop(context.client);
  const stopped = await waitForEasyButtonTerminal(context.client, workingPerformancePrompt);
  if (!stopped.summaryText.includes("Stopped after")) {
    throw new Error(`easy button performance run did not stop cleanly: ${JSON.stringify(stopped)}`);
  }

  await writeJson(join(artifactDir, "summary.json"), {
    artifactDir,
    frameBudgets: {
      frozen: frameBudgetSummary(frozen.frameSample),
      idle: frameBudgetSummary(idle.frameSample),
      working: frameBudgetSummary(working.frameSample),
    },
    frozen,
    frozenState,
    idle,
    pane,
    sampleDurationMs,
    status: "passed",
    stopped,
    working,
    workingState,
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
  const dispatched = await client.driver("easyButtonPaneOpenShortcut");
  if (!dispatched) {
    throw new Error("easy button shortcut was not dispatched");
  }
}

async function submitEasyButtonRequest(client, requestText) {
  const submitted = await client.driver("easyButtonPaneSubmitRequest", requestText);
  if (!submitted) {
    throw new Error(`easy button request input was not submittable: ${requestText}`);
  }
}

async function clickEasyButtonStop(client) {
  const clicked = await client.driver("easyButtonPaneClickStop");
  if (!clicked) {
    throw new Error("easy button stop control was not clickable");
  }
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

function assertEasyButtonAnimationsPaused(state) {
  const animationFields = [
    "buttonAnimationPlayState",
    "controlRingAnimationPlayState",
    "spinnerAnimationPlayState",
  ];
  const unpaused = animationFields.filter(
    (field) => !animationPlayStateIncludesPaused(state[field]),
  );
  if (unpaused.length > 0) {
    throw new Error(
      `easy button frozen animations did not pause ${unpaused.join(", ")}: ${JSON.stringify(
        state,
      )}`,
    );
  }
}

function animationPlayStateIncludesPaused(value) {
  return String(value)
    .split(",")
    .map((part) => part.trim())
    .includes("paused");
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

async function waitForEasyButtonFrozen(client, requestText) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.hostFrozen === "true" &&
      state.easyState === "working" &&
      state.requestText === requestText,
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonWorking(client, requestText) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "working" &&
      state.requestText === requestText &&
      state.stopButtonVisible === true &&
      state.stopButtonDisabled === false,
    workflowTimeoutMs,
  );
}

async function waitForEasyButtonTerminal(client, requestText) {
  return waitForState(
    client,
    easyButtonStateExpression(),
    (state) =>
      state.exists &&
      state.surfaceKind === "easy-button" &&
      state.easyState === "complete" &&
      state.requestText === requestText,
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
