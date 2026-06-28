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
import { assertSmoothFrameSample, frameBudgetSummary } from "./performance-frame-budget.mjs";

const options = parseElectronHarnessArgs(process.argv.slice(2));
const workflowName = "chat-long-transcript-performance";
const workflowTimeoutMs = 45_000;
const targetEarliestTurn = 50;
const minimumScrollHeightAfterPagination = 100_000;
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
      state.scrollHeight > state.clientHeight &&
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
      state.scrollHeight > state.clientHeight &&
      state.hasOlderButton,
    workflowTimeoutMs,
  );
}

async function clickPerformanceConversation(client) {
  const clicked = await client.evaluate(`(() => {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], a'));
    const target = candidates.find((element) =>
      (element.textContent || '').includes('Performance Long Chat')
    );
    if (!target) {
      return { ok: false, reason: "missing-conversation" };
    }
    target.click();
    return { ok: true };
  })()`);
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
  if (state.topTurn !== null && state.topTurn <= targetEarliestTurn) {
    return "target-earliest-turn";
  }
  if (state.scrollHeight >= minimumScrollHeightAfterPagination) {
    return "target-scroll-height";
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
  if (!olderTranscriptTargetReached(final)) {
    throw new Error(`older transcript pages did not reach target: ${JSON.stringify(snapshots)}`);
  }
  return { completed: true, reason: "max-page-loads", snapshots };
}

function olderTranscriptTargetReached(state) {
  return (
    state.scrollHeight >= minimumScrollHeightAfterPagination ||
    state.topTurn === null ||
    state.topTurn <= targetEarliestTurn ||
    !state.hasOlderButton
  );
}

async function clickOlderButtonAtTranscriptTop(client) {
  const clicked = await client.evaluate(`(async () => {
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    if (!(scroller instanceof HTMLElement)) {
      return { ok: false, reason: "missing-scroller" };
    }
    scroller.scrollTop = 0;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const button = Array.from(document.querySelectorAll("button")).find(
      (candidate) => candidate.textContent?.trim() === "Older",
    );
    if (!(button instanceof HTMLButtonElement) || button.disabled) {
      return { ok: false, reason: "missing-older-button" };
    }
    button.click();
    return { ok: true };
  })()`);
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
  const point = await client.evaluate(`(() => {
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    if (!(scroller instanceof HTMLElement)) {
      return { ok: false, reason: "missing-scroller" };
    }
    scroller.scrollTop = ${JSON.stringify(start)} === "bottom"
      ? Math.max(0, scroller.scrollHeight - scroller.clientHeight)
      : 0;
    scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
    const rect = scroller.getBoundingClientRect();
    return {
      ok: true,
      startScrollTop: scroller.scrollTop,
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
  })()`);
  if (!point.ok) {
    throw new Error(`transcript scroll start failed: ${JSON.stringify(point)}`);
  }
  await delay(120);
  return point;
}

async function startSampler(client) {
  const started = await client.evaluate(startSamplerExpression());
  if (!started.ok) {
    throw new Error(`frame sampler did not start: ${JSON.stringify(started)}`);
  }
}

async function stopSampler(client) {
  const result = await client.evaluate(stopSamplerExpression());
  if (!result.ok) {
    throw new Error(`frame sampler did not stop: ${JSON.stringify(result)}`);
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

async function transcriptState(client) {
  return client.evaluate(transcriptStateExpression());
}

async function transcriptTopState(client) {
  return client.evaluate(transcriptTopStateExpression());
}

async function safeTranscriptState(client) {
  try {
    return await transcriptState(client);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function bodyTextExpression() {
  return `document.body.innerText`;
}

function transcriptTopStateExpression() {
  return `(async () => {
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    if (scroller instanceof HTMLElement) {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll", { bubbles: true }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    return (${transcriptStateSnapshotSource()})();
  })()`;
}

function transcriptStateExpression() {
  return `(${transcriptStateSnapshotSource()})()`;
}

function transcriptStateSnapshotSource() {
  return `() => {
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    const detailPane = document.querySelector('[data-testid="chat-detail-pane"]');
    const messageIds = Array.from(document.querySelectorAll('[data-chat-message="true"]'))
      .map((row) => row instanceof HTMLElement ? row.dataset.messageId ?? "" : "")
      .filter((id) => id !== "");
    const turnIndexes = messageIds
      .map((id) => {
        const match = id.match(/message_performance_(?:user|assistant|steering)_(\\d+)/);
        return match ? Number(match[1]) : null;
      })
      .filter((value) => Number.isFinite(value));
    const olderButton = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Older",
    );
    return {
      atBottom: scroller instanceof HTMLElement
        ? Math.abs(scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight) <= 2
        : false,
      bodyTextLength: document.body.textContent?.length ?? 0,
      clientHeight: scroller instanceof HTMLElement ? scroller.clientHeight : 0,
      hasOlderButton: olderButton instanceof HTMLButtonElement && !olderButton.disabled,
      maxVisibleTurn: turnIndexes.length > 0 ? Math.max(...turnIndexes) : null,
      messageRows: messageIds.length,
      ready: scroller instanceof HTMLElement,
      scrollHeight: scroller instanceof HTMLElement ? scroller.scrollHeight : 0,
      scrollTop: scroller instanceof HTMLElement ? scroller.scrollTop : 0,
      selectedConversationId:
        detailPane instanceof HTMLElement ? detailPane.dataset.conversationId ?? "" : "",
      topTurn: turnIndexes.length > 0 ? Math.min(...turnIndexes) : null,
      turnRows: document.querySelectorAll('[data-testid="chat-transcript-turn"]').length,
      visibleActivityRows: document.querySelectorAll('[data-testid="run-activity-row"]').length,
    };
  }`;
}

function startSamplerExpression() {
  return `(() => {
    window.__settaLongTranscriptPerfStop?.();
    const startedAt = performance.now();
    const frames = [];
    const longTasks = [];
    let mutationCount = 0;
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
    const scroller = document.querySelector('[data-testid="chat-transcript-scroller"]');
    if (!(scroller instanceof HTMLElement)) {
      return { ok: false, reason: "missing-scroller" };
    }
    const mutationObserver = new MutationObserver((records) => {
      mutationCount += records.length;
    });
    mutationObserver.observe(scroller, {
      characterData: true,
      childList: true,
      subtree: true,
    });
    function recordFrame(timestamp) {
      if (!running) {
        return;
      }
      frames.push(timestamp - previousTimestamp);
      previousTimestamp = timestamp;
      requestAnimationFrame(recordFrame);
    }
    requestAnimationFrame(recordFrame);
    window.__settaLongTranscriptPerfStop = () => {
      running = false;
      observer?.disconnect();
      mutationObserver.disconnect();
      window.__settaLongTranscriptPerfStop = null;
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
        longTasks: sampledLongTasks.map((entry) => ({
          duration: Number(entry.duration.toFixed(3)),
          startTime: Number((entry.startTime - startedAt).toFixed(3)),
        })),
        maxFrameDeltaMs: sorted.at(-1) ?? 0,
        mutationCount,
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
    if (!window.__settaLongTranscriptPerfStop) {
      return { ok: false, reason: "missing-sampler" };
    }
    return { ok: true, sample: window.__settaLongTranscriptPerfStop() };
  })()`;
}
