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
  startChromiumTrace,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  backendProbe,
  createChat,
  openWorkspace,
  submitComposer,
  waitForRunStatus,
  waitForRunWithPrompt,
} from "./chat-workflow-harness.mjs";
import { assertSmoothFrameSample, frameBudgetSummary } from "./performance-frame-budget.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const chatPerformanceTimeoutMs = 35_000;
const chatStreamMaxFrameDeltaMs = 100;
const chatStreamMaxSlowFramesOver50Ms = 2;
const completionMarker = "Performance stream complete.";
const prompt = "chat performance stream";
const streamWarmupMarker = "stream chunk 010";
const settleAfterCompletionMs = 350;
const viewport = {
  deviceScaleFactor: 1,
  height: 2160,
  mobile: false,
  width: 3840,
};

if (options.help) {
  console.log(
    "Usage: node desktop/tests/electron/chat-stream-performance.test.mjs [--skip-build] [--trace] [--visible] [--keep-artifacts] [--artifact-dir <dir>]",
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("chat-stream-performance");
await writeLatestRecordingPointer("chat-stream-performance", artifactDir);
const fixture = await createElectronFixture("chat-stream-performance");
let context = null;
let traceSession = null;

try {
  context = await launchElectronCdpContext({
    artifactDir,
    extraEnv: {
      SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
      SETTA_E2E_WINDOW_HEIGHT: String(viewport.height),
      SETTA_E2E_WINDOW_WIDTH: String(viewport.width),
    },
    fixture,
    visible: options.visible,
  });
  await context.client.call("Emulation.setDeviceMetricsOverride", viewport);
  await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
  const backend = await backendProbe(artifactDir);
  const workspaceId = await openWorkspace(context.client, fixture.workspaceRoot, backend);
  const conversationId = await createChat(context.client, backend, workspaceId);
  await waitForSelector(context.client, '[data-testid="chat-detail-pane"]');
  await waitForSelector(context.client, '[data-testid="chat-transcript-scroller"]');
  await waitForOptionalWorkflowGraphSettled(context.client);
  await captureScreenshot(context.client, join(artifactDir, "before-stream.png"));
  if (options.trace) {
    traceSession = await startChromiumTrace(context.client, join(artifactDir, "trace.json"));
  }

  await submitComposer(context.client, prompt, "Send message");
  const run = await waitForRunWithPrompt(backend, workspaceId, conversationId, prompt, null);
  await waitForChatStreamWarmup(context.client);
  const started = await context.client.driver("chatStreamPerformanceStart", {
    completionMarker,
    settleAfterCompletionMs,
  });
  if (!started.ok) {
    throw new Error(`chat performance measurement did not start: ${JSON.stringify(started)}`);
  }
  await waitForRunStatus(backend, workspaceId, conversationId, run.id, {
    status: "completed",
    timeoutMs: chatPerformanceTimeoutMs,
  });
  const measurement = await waitForMeasurementSettled(context.client);
  assertSmoothFrameSample(measurement, "chat stream performance", {
    maxFrameDeltaMs: chatStreamMaxFrameDeltaMs,
    maxSlowFramesOver50Ms: chatStreamMaxSlowFramesOver50Ms,
    minFrameCount: 30,
  });
  const trace = traceSession ? await stopTraceSession() : null;
  await captureScreenshot(context.client, join(artifactDir, "after-stream.png"));

  const summary = {
    artifactDir,
    conversationId,
    frameBudget: frameBudgetSummary(measurement),
    measurement,
    prompt,
    runId: run.id,
    status: "passed",
    trace,
    viewport,
    workspaceName: basename(fixture.workspaceRoot),
  };
  await writeJson(join(artifactDir, "summary.json"), summary);
  await writeJson(join(artifactDir, "frame-samples.json"), {
    framesMs: measurement.framesMs,
    longTasks: measurement.longTasks,
  });
  if (trace) {
    await writeJson(join(artifactDir, "trace-summary.json"), trace.summary);
  }
  console.log(
    [
      `Electron chat stream performance captured: ${artifactDir}`,
      `p95=${measurement.p95FrameDeltaMs.toFixed(2)}ms`,
      `p99=${measurement.p99FrameDeltaMs.toFixed(2)}ms`,
      `max=${measurement.maxFrameDeltaMs.toFixed(2)}ms`,
      `longTasks=${measurement.longTaskCount}`,
    ].join(" "),
  );
} catch (error) {
  if (traceSession) {
    await stopTraceSession().catch(() => {});
  }
  if (context) {
    await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
    await writeJson(join(artifactDir, "failure-measurement.json"), {
      measurement: await safeMeasurementSnapshot(context.client),
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

async function stopTraceSession() {
  if (!traceSession) {
    return null;
  }
  const result = await traceSession.stop();
  traceSession = null;
  return result;
}

async function waitForMeasurementSettled(client) {
  const startedAt = Date.now();
  let lastValue = null;
  while (Date.now() - startedAt < chatPerformanceTimeoutMs) {
    lastValue = await client.driver("chatStreamPerformanceSnapshot");
    if (lastValue?.ok && lastValue.settled) {
      if (lastValue.frameCount < 10) {
        throw new Error(`chat performance measurement had too few frames: ${lastValue.frameCount}`);
      }
      return lastValue;
    }
    await delay(100);
  }
  throw new Error(
    `timed out waiting for chat performance measurement: ${JSON.stringify(lastValue)}`,
  );
}

async function safeMeasurementSnapshot(client) {
  try {
    return await client.driver("chatStreamPerformanceSnapshot");
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function waitForOptionalWorkflowGraphSettled(client) {
  await waitForState(client, workflowGraphSettledExpression(), (value) => value.ready, 5_000).catch(
    () => {},
  );
}

async function waitForChatStreamWarmup(client) {
  await waitForState(
    client,
    `(() => ({
      ready: document.body.textContent?.includes(${JSON.stringify(streamWarmupMarker)}) === true,
    }))()`,
    (value) => value.ready,
    chatPerformanceTimeoutMs,
  );
}

function workflowGraphSettledExpression() {
  return `(() => {
    const api = window.__settaWorkflowGraphDebug;
    if (!api?.getSurfaceIds || !api?.getSnapshot) {
      return { ready: true, skipped: "missing-debug-api" };
    }
    const surfaceIds = api.getSurfaceIds();
    const surfaceId = surfaceIds.includes("workspace_surface_2")
      ? "workspace_surface_2"
      : surfaceIds[0] ?? null;
    if (surfaceId === null) {
      return { ready: true, skipped: "missing-debug-surface" };
    }
    let snapshot = null;
    try {
      snapshot = api.getSnapshot(surfaceId, { includeVisual: false });
    } catch (error) {
      return {
        ready: false,
        reason: error instanceof Error ? error.message : String(error),
        surfaceId,
      };
    }
    const frameCount = snapshot?.render?.frameCount ?? 0;
    const now = performance.now();
    const previous = window.__settaChatStreamGraphSettle;
    if (
      !previous ||
      previous.surfaceId !== surfaceId ||
      previous.frameCount !== frameCount
    ) {
      window.__settaChatStreamGraphSettle = { frameCount, stableSince: now, surfaceId };
      return { frameCount, ready: false, stableMs: 0, surfaceId };
    }
    const stableMs = now - previous.stableSince;
    return { frameCount, ready: stableMs >= 120, stableMs, surfaceId };
  })()`;
}
