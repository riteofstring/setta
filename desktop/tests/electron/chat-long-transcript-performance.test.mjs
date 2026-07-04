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
  dispatchWheel,
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
import { assertSmoothFrameSample, frameBudgetSummary } from "./performance-frame-budget.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "chat-long-transcript-performance";
const workflowTimeoutMs = 45_000;
const minimumOlderTurnProgress = 20;
const minimumScrollHeightIncreaseAfterPagination = 5_000;
const maxOlderPageLoads = 14;
const wheelEventCount = 90;
const viewport = {
  deviceScaleFactor: 1,
  height: 1200,
  mobile: false,
  width: 1600,
};

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
seedPerformanceFixture(fixture);

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
    (text) => text.includes("Performance Long Chat"),
    workflowTimeoutMs,
  );
  await waitForSelector(context.client, '[data-testid="chat-transcript-scroller"]');

  const selectMeasurement = await measureConversationSelection(context.client);
  await waitForTranscriptSelectionSettled(context.client);
  await captureScreenshot(context.client, join(artifactDir, "selected.png"));

  const pagination = await loadOlderTranscriptPages(context.client);
  await captureScreenshot(context.client, join(artifactDir, "loaded-older.png"));

  const scrollDown = await measureTranscriptWheelScroll(context.client, {
    deltaY: 420,
    label: "long transcript scroll down",
    start: "top",
  });
  const scrollUp = await measureTranscriptWheelScroll(context.client, {
    deltaY: -420,
    label: "long transcript scroll up",
    start: "bottom",
  });
  await captureScreenshot(context.client, join(artifactDir, "after-scroll.png"));

  const finalState = await transcriptState(context.client);
  const summary = {
    artifactDir,
    finalState,
    frameBudgets: {
      scrollDown: frameBudgetSummary(scrollDown),
      scrollUp: frameBudgetSummary(scrollUp),
      selectConversation: frameBudgetSummary(selectMeasurement),
    },
    pagination,
    samples: {
      scrollDown,
      scrollUp,
      selectConversation: selectMeasurement,
    },
    status: "passed",
    viewport,
    workspaceName: basename(fixture.workspaceRoot),
  };
  await writeJson(join(artifactDir, "summary.json"), summary);
  await writeJson(join(artifactDir, "frame-samples.json"), {
    scrollDown: scrollDown.framesMs,
    scrollUp: scrollUp.framesMs,
    selectConversation: selectMeasurement.framesMs,
  });
  console.log(
    [
      `Electron chat long transcript performance passed: ${artifactDir}`,
      `scrollDownP95=${scrollDown.p95FrameDeltaMs.toFixed(2)}ms`,
      `scrollUpP95=${scrollUp.p95FrameDeltaMs.toFixed(2)}ms`,
      `scrollHeight=${finalState.scrollHeight}`,
    ].join(" "),
  );
} catch (error) {
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-snapshot.json"), {
      sampler: await safeStopSampler(context.client),
      transcript: await safeTranscriptState(context.client),
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

function seedPerformanceFixture(performanceFixture) {
  const result = spawnSync(
    "./scripts/go.sh",
    [
      "run",
      "./cmd/seed-chat-performance",
      "--app-data-dir",
      performanceFixture.appDataDir,
      "--workspace-path",
      performanceFixture.workspaceRoot,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(`seed chat performance fixture failed: ${result.stdout}\n${result.stderr}`);
  }
}

async function measureConversationSelection(client) {
  await startSampler(client);
  await clickPerformanceConversation(client);
  await waitForState(
    client,
    transcriptStateExpression(),
    (state) =>
      state.ready &&
      state.selectedConversationId === "conversation_performance_long_transcript" &&
      state.hasOlderButton &&
      state.visibleActivityRows > 0,
    workflowTimeoutMs,
  );
  await delay(350);
  const sample = await stopSampler(client);
  assertSmoothFrameSample(sample, "long transcript conversation selection", { minFrameCount: 20 });
  return sample;
}

async function waitForTranscriptSelectionSettled(client) {
  await delay(5_000);
  await waitForState(
    client,
    transcriptStateExpression(),
    (state) =>
      state.ready &&
      state.selectedConversationId === "conversation_performance_long_transcript" &&
      state.visibleActivityRows > 0 &&
      state.hasOlderButton,
    workflowTimeoutMs,
  );
}

async function clickPerformanceConversation(client) {
  const clicked = await client.driver("chatLongTranscriptClickPerformanceConversation");
  if (!clicked.ok) {
    throw new Error(`performance conversation click failed: ${JSON.stringify(clicked)}`);
  }
}

async function loadOlderTranscriptPages(client) {
  const snapshots = [];
  for (let pageIndex = 0; pageIndex < maxOlderPageLoads; pageIndex += 1) {
    const result = await loadOlderTranscriptPage(client, snapshots, pageIndex);
    if (result.done) {
      return { completed: true, reason: result.reason, snapshots };
    }
  }
  return finishOlderTranscriptPagination(client, snapshots);
}

async function loadOlderTranscriptPage(client, snapshots, pageIndex) {
  const before = await transcriptTopState(client);
  snapshots.push({ before, pageIndex });
  const stopReason = olderTranscriptStopReason(before);
  if (stopReason !== "") {
    return { done: true, reason: stopReason };
  }
  const clicked = await clickOlderButtonAtTranscriptTop(client);
  if (!clicked.ok) {
    return { done: true, reason: clicked.reason };
  }
  await waitForOlderTranscriptPageProgress(client, before);
  return { done: false, reason: "" };
}

function olderTranscriptStopReason(state) {
  if (!state.hasOlderButton) {
    return "no-older-button";
  }
  return "";
}

async function waitForOlderTranscriptPageProgress(client, before) {
  await waitForState(
    client,
    transcriptTopStateExpression(),
    (state) => olderTranscriptPageProgressed(before, state),
    workflowTimeoutMs,
  );
}

function olderTranscriptPageProgressed(before, state) {
  return (
    !state.hasOlderButton ||
    state.scrollHeight > before.scrollHeight + 500 ||
    state.topTurn === null ||
    before.topTurn === null ||
    state.topTurn < before.topTurn
  );
}

async function finishOlderTranscriptPagination(client, snapshots) {
  const final = await transcriptTopState(client);
  snapshots.push({ final, pageIndex: maxOlderPageLoads });
  if (!olderTranscriptTargetReached(snapshots, final)) {
    throw new Error(`older transcript pages did not reach target: ${JSON.stringify(snapshots)}`);
  }
  return { completed: true, reason: "max-page-loads", snapshots };
}

function olderTranscriptTargetReached(snapshots, state) {
  if (!state.hasOlderButton || state.topTurn === null) {
    return true;
  }
  const initial = snapshots[0]?.before ?? null;
  if (!initial || initial.topTurn === null) {
    return false;
  }
  const loadedOlderTurns = initial.topTurn - state.topTurn;
  const scrollHeightIncrease = state.scrollHeight - initial.scrollHeight;
  return (
    loadedOlderTurns >= minimumOlderTurnProgress &&
    scrollHeightIncrease >= minimumScrollHeightIncreaseAfterPagination
  );
}

async function clickOlderButtonAtTranscriptTop(client) {
  const clicked = await client.driver("chatLongTranscriptClickOlderButtonAtTop");
  await delay(120);
  return clicked;
}

async function measureTranscriptWheelScroll(client, { deltaY, label, start }) {
  const point = await prepareTranscriptScrollStart(client, start);
  await startSampler(client);
  for (let index = 0; index < wheelEventCount; index += 1) {
    await dispatchWheel(client, { deltaY, x: point.x, y: point.y });
    await delay(8);
  }
  await delay(260);
  const sample = await stopSampler(client);
  const state = await transcriptState(client);
  const result = { ...sample, transcript: state };
  assertSmoothFrameSample(result, label, { minFrameCount: 30 });
  if (Math.abs(state.scrollTop - point.startScrollTop) < 500) {
    throw new Error(`${label} did not move the transcript enough: ${JSON.stringify(result)}`);
  }
  return result;
}

async function prepareTranscriptScrollStart(client, start) {
  const point = await client.driver("chatLongTranscriptPrepareScrollStart", { start });
  if (!point.ok) {
    throw new Error(`transcript scroll start failed: ${JSON.stringify(point)}`);
  }
  await delay(120);
  return point;
}

async function startSampler(client) {
  const started = await client.driver("chatLongTranscriptStartSampler");
  if (!started.ok) {
    throw new Error(`frame sampler did not start: ${JSON.stringify(started)}`);
  }
}

async function stopSampler(client) {
  const result = await client.driver("chatLongTranscriptStopSampler");
  if (!result.ok) {
    throw new Error(`frame sampler did not stop: ${JSON.stringify(result)}`);
  }
  return result.sample;
}

async function safeStopSampler(client) {
  try {
    return await client.driver("chatLongTranscriptStopSampler");
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function transcriptState(client) {
  return client.driver("chatLongTranscriptState");
}

async function transcriptTopState(client) {
  return client.driver("chatLongTranscriptTopState");
}

async function safeTranscriptState(client) {
  try {
    return await transcriptState(client);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function bodyTextExpression() {
  return driverCallExpression("chatLongTranscriptBodyText");
}

function transcriptTopStateExpression() {
  return driverCallExpression("chatLongTranscriptTopState");
}

function transcriptStateExpression() {
  return driverCallExpression("chatLongTranscriptState");
}
