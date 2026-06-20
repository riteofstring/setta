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

const options = parseElectronHarnessArgs(process.argv.slice(2));
const chatPerformanceTimeoutMs = 35_000;
const completionMarker = "Performance stream complete.";
const prompt = "chat performance stream";
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
  await captureScreenshot(context.client, join(artifactDir, "before-stream.png"));
  if (options.trace) {
    traceSession = await startChromiumTrace(context.client, join(artifactDir, "trace.json"));
  }

  const started = await context.client.evaluate(measurementStartExpression());
  if (!started.ok) {
    throw new Error(`chat performance measurement did not start: ${JSON.stringify(started)}`);
  }
  await submitComposer(context.client, prompt, "Send message");
  const run = await waitForRunWithPrompt(backend, workspaceId, conversationId, prompt, null);
  await waitForRunStatus(backend, workspaceId, conversationId, run.id, {
    status: "completed",
    timeoutMs: chatPerformanceTimeoutMs,
  });
  const measurement = await waitForMeasurementSettled(context.client);
  const trace = traceSession ? await stopTraceSession() : null;
  await captureScreenshot(context.client, join(artifactDir, "after-stream.png"));

  const summary = {
    artifactDir,
    conversationId,
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
    lastValue = await client.evaluate(measurementSnapshotExpression());
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
    return await client.evaluate(measurementSnapshotExpression());
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function measurementStartExpression() {
  return `(() => {
    const detailPane = document.querySelector('[data-testid="chat-detail-pane"]');
    if (!(detailPane instanceof HTMLElement)) {
      return { ok: false, reason: "missing-chat-detail-pane" };
    }
    window.__settaChatStreamPerformance?.stop?.();
    const completionMarker = ${JSON.stringify(completionMarker)};
    const frames = [];
    const longTasks = [];
    let mutationCount = 0;
    let completionAt = null;
    let running = true;
    let settledAt = null;
    const startedAt = performance.now();
    let previousFrameTimestamp = startedAt;
    let longTaskObserver = null;
    if (
      "PerformanceObserver" in window &&
      PerformanceObserver.supportedEntryTypes.includes("longtask")
    ) {
      longTaskObserver = new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          longTasks.push({ duration: entry.duration, startTime: entry.startTime });
        }
      });
      longTaskObserver.observe({ type: "longtask" });
    }
    const mutationObserver = new MutationObserver((records) => {
      mutationCount += records.length;
      markCompletionIfVisible();
    });
    mutationObserver.observe(detailPane, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    function recordFrame(timestamp) {
      if (!running) {
        return;
      }
      frames.push(timestamp - previousFrameTimestamp);
      previousFrameTimestamp = timestamp;
      requestAnimationFrame(recordFrame);
    }
    function markCompletionIfVisible() {
      if (completionAt !== null || !detailPane.textContent?.includes(completionMarker)) {
        return;
      }
      completionAt = performance.now();
      window.setTimeout(stop, ${settleAfterCompletionMs});
    }
    function stop() {
      if (!running) {
        return;
      }
      running = false;
      settledAt = performance.now();
      mutationObserver.disconnect();
      longTaskObserver?.disconnect();
    }
    function snapshot() {
      markCompletionIfVisible();
      const endedAt = settledAt ?? performance.now();
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
      const measurementLongTasks = longTasks.filter((entry) => entry.startTime >= startedAt);
      const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
      const scrollerState = scroller instanceof HTMLElement
        ? {
            atBottom:
              Math.abs(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight) <= 2,
            clientHeight: scroller.clientHeight,
            scrollHeight: scroller.scrollHeight,
            scrollTop: scroller.scrollTop,
          }
        : null;
      return {
        averageFps: averageFrameDeltaMs > 0 ? 1000 / averageFrameDeltaMs : 0,
        averageFrameDeltaMs,
        bodyTextLength: document.body.textContent?.length ?? 0,
        completionAtMs: completionAt === null ? null : completionAt - startedAt,
        completionVisible: completionAt !== null,
        durationMs: endedAt - startedAt,
        frameCount: samples.length,
        framesMs: samples.map((value) => Number(value.toFixed(3))),
        longTaskCount: measurementLongTasks.length,
        longTaskMaxMs: measurementLongTasks.reduce(
          (maxValue, entry) => Math.max(maxValue, entry.duration),
          0,
        ),
        longTaskTotalMs: measurementLongTasks.reduce(
          (total, entry) => total + entry.duration,
          0,
        ),
        longTasks: measurementLongTasks.map((entry) => ({
          duration: Number(entry.duration.toFixed(3)),
          startTime: Number((entry.startTime - startedAt).toFixed(3)),
        })),
        maxFrameDeltaMs: sorted.at(-1) ?? 0,
        mutationCount,
        observedFrameBudgetMs,
        ok: true,
        p50FrameDeltaMs: quantile(0.5),
        p95FrameDeltaMs: quantile(0.95),
        p99FrameDeltaMs: quantile(0.99),
        scroller: scrollerState,
        settled: !running && completionAt !== null,
        slowFramesOver120HzBudget: samples.filter((value) => value > 8.33).length,
        slowFramesOver16Ms: samples.filter((value) => value > 16.67).length,
        slowFramesOver24Ms: samples.filter((value) => value > 24).length,
        slowFramesOver32Ms: samples.filter((value) => value > 32).length,
        slowFramesOver50Ms: samples.filter((value) => value > 50).length,
        slowFramesOverDoubleObservedBudget: samples.filter(
          (value) => value > observedFrameBudgetMs * 2,
        ).length,
        transcriptMessageRowCount: document.querySelectorAll('[data-chat-message="true"]').length,
        transcriptTurnCount: document.querySelectorAll('[data-testid="chat-transcript-turn"]').length,
      };
    }
    window.__settaChatStreamPerformance = { snapshot, stop };
    requestAnimationFrame(recordFrame);
    return { ok: true };
  })()`;
}

function measurementSnapshotExpression() {
  return `(() => {
    if (!window.__settaChatStreamPerformance?.snapshot) {
      return { ok: false, reason: "missing-measurement" };
    }
    return window.__settaChatStreamPerformance.snapshot();
  })()`;
}
