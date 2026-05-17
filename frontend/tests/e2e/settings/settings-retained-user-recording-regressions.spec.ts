import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  installGpuFlowPerformanceProbe,
  readGpuFlowPerformanceSnapshot,
  resetGpuFlowPerformanceProbe,
  type GpuFlowNodeLayerFrameProbeSummary,
} from "../gpuFlowPerformanceProbe";
import { ensureAppReady } from "../helpers";
import {
  SETTINGS_PARAM_CONTENT_SUFFIX,
  centerRetainedCompositorSurface,
  dispatchRetainedCompositorWheelBurst,
  openAllSettingsForRetainedCompositor,
  recordRetainedCompositorPerfSample,
  resolveRetainedCompositorTarget,
} from "./settings-retained-compositor-helpers";
import {
  measurePageRafCadence,
  percentile,
  waitForAnimationFrame,
  type PageRafCadence,
} from "./settings-retained-frame-helpers";
import {
  analyzeHorizontalPlaceholderBands,
  type Rect,
} from "./settings-retained-visual-analysis";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const SECTION_SIZING_SURFACE_ID =
  "settings-section__sectionSizingPolicy" + SETTINGS_PARAM_CONTENT_SUFFIX;
const SHORTCUTS_SURFACE_ID =
  "settings-section__shortcuts" + SETTINGS_PARAM_CONTENT_SUFFIX;
const HIGH_REFRESH_P95_FRAME_BUDGET_MS = 8.5;
const HIGH_REFRESH_TRANSITION_P95_SLACK_MS = 8;
const MAX_FRAME_GAP_MS = 50;
const MAX_FRAME_TIMER_JITTER_MS = 5;
const MAX_LONG_TASK_MS = 50;

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("all-settings transition preserves RAF cadence and avoids long tasks", async ({
  page,
}, testInfo) => {
  await installGpuFlowPerformanceProbe(page);
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  const controlCadence = await measurePageRafCadence(page);

  await resetGpuFlowPerformanceProbe(page);
  await startMeasurementRafHeartbeat(page);
  let snapshot: Awaited<
    ReturnType<typeof readGpuFlowPerformanceSnapshot>
  > | null = null;
  try {
    for (let index = 0; index < 8; index += 1) {
      await waitForAnimationFrame(page);
    }
    await page
      .getByRole("button", { exact: true, name: "All Settings" })
      .click();
    await page.waitForFunction(
      () => (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0) > 50,
      undefined,
      { timeout: 10_000 },
    );
    await waitForAnimationFrame(page);
    await waitForAnimationFrame(page);

    snapshot = await readGpuFlowPerformanceSnapshot(page);
  } finally {
    await stopMeasurementRafHeartbeat(page);
  }
  if (!snapshot) {
    throw new Error("Missing GPU Flow performance snapshot.");
  }
  const canvasClip = await resolveCanvasClip(page);
  const screenshot = await page.screenshot({
    clip: canvasClip,
    path: testInfo.outputPath("all-settings-transition-final.png"),
  });
  const placeholderStats = await analyzeHorizontalPlaceholderBands(page, {
    screenshot,
  });
  const frameStats = summarizeIntervals(snapshot.frameIntervalsMs.slice(2));
  const maxLongTaskMs = Math.max(
    0,
    ...snapshot.longTasks.map((task) => task.durationMs),
  );
  const highRefresh = isHighRefreshCadence(controlCadence);
  const p95FrameBudgetMs = highRefresh
    ? resolveHighRefreshTransitionP95FrameBudget(controlCadence)
    : null;
  const details = JSON.stringify(
    {
      controlCadence,
      frameStats,
      highRefresh,
      longTasks: snapshot.longTasks,
      placeholderStats,
      p95FrameBudgetMs,
      rowCount: await readRetainedRowCount(page),
      snapshotSummary: {
        frameCount: snapshot.frameCount,
        nodeLayerFrameCount: snapshot.nodeLayerFrames.length,
      },
    },
    null,
    2,
  );
  recordRetainedCompositorPerfSample({
    name: "all-settings transition content publish",
    sample: JSON.parse(details),
  });

  expect(placeholderStats.nonblankRatio, details).toBeGreaterThan(0.02);
  expect(placeholderStats.highConfidencePlaceholder, details).toBe(false);
  expect(frameStats.maxMs, details).toBeLessThanOrEqual(
    MAX_FRAME_GAP_MS + MAX_FRAME_TIMER_JITTER_MS,
  );
  expect(maxLongTaskMs, details).toBeLessThanOrEqual(MAX_LONG_TASK_MS);
  if (p95FrameBudgetMs !== null) {
    expect(frameStats.p95Ms, details).toBeLessThanOrEqual(p95FrameBudgetMs);
  }
});

test("Chrome repro capture flag does not change retained Settings visible publication", async ({
  page,
}, testInfo) => {
  const normal = await captureChromeReproParitySample({
    label: "normal",
    page,
    testInfo,
  });
  await page.addInitScript(() => {
    (
      window as Window & { __SETTA_CHROME_REPRO_ACTIVE__?: boolean }
    ).__SETTA_CHROME_REPRO_ACTIVE__ = true;
  });
  const recorder = await captureChromeReproParitySample({
    label: "recorder",
    page,
    testInfo,
  });
  const details = JSON.stringify({ normal, recorder }, null, 2);

  expect(normal.chromeReproActive, details).toBe(false);
  expect(recorder.chromeReproActive, details).toBe(true);
  expect(normal.placeholderStats.nonblankRatio, details).toBeGreaterThan(0.02);
  expect(recorder.placeholderStats.nonblankRatio, details).toBeGreaterThan(
    0.02,
  );
  expect(normal.placeholderStats.highConfidencePlaceholder, details).toBe(false);
  expect(recorder.placeholderStats.highConfidencePlaceholder, details).toBe(
    false,
  );
  expect(recorder.committed, details).toEqual(normal.committed);
  expect(recorder.diagnostics?.visibleControlRectCount, details).toBe(
    normal.diagnostics?.visibleControlRectCount,
  );
  expect(
    recorder.diagnostics?.mountedControlCount ?? 0,
    details,
  ).toBeGreaterThanOrEqual(
    recorder.diagnostics?.visibleControlRectCount ?? 0,
  );
  expect(
    normal.diagnostics?.mountedControlCount ?? 0,
    details,
  ).toBeGreaterThanOrEqual(normal.diagnostics?.visibleControlRectCount ?? 0);
});

test("viewport and retained-scroll gestures do not perform content work on projection frames", async ({
  page,
}) => {
  await installGpuFlowPerformanceProbe(page);
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page, SHORTCUTS_SURFACE_ID);
  await resetGpuFlowPerformanceProbe(page);

  const viewportPoint = await resolveCanvasGesturePoint(page);
  await page.mouse.move(viewportPoint.x, viewportPoint.y);
  for (let index = 0; index < 24; index += 1) {
    await page.mouse.wheel(0, 48);
  }
  await waitForAnimationFrame(page);

  await centerRetainedCompositorSurface(page, SECTION_SIZING_SURFACE_ID);
  const retainedTarget = await resolveRetainedCompositorTarget(
    page,
    SECTION_SIZING_SURFACE_ID,
  );
  await dispatchRetainedCompositorWheelBurst(page, {
    deltaY: 40,
    eventCount: 12,
    point: retainedTarget.point,
  });
  await waitForAnimationFrame(page);

  const snapshot = await readGpuFlowPerformanceSnapshot(page);
  const projectionFrames = snapshot.nodeLayerFrames.filter((frame) =>
    isMotionProjectionFrame(frame),
  );
  const violatingFrames = projectionFrames.filter(
    hasProjectionFrameContentWork,
  );
  const missingProjectionDiagnostics = projectionFrames.filter(
    (frame) =>
      frame.projectionDiagnostics.committedFrameId === null ||
      frame.projectionDiagnostics.gestureOwner === null ||
      frame.projectionDiagnostics.lane !== "motion" ||
      frame.projectionDiagnostics.sampleId === null ||
      frame.projectionDiagnostics.transactionId === null ||
      frame.projectionDiagnostics.transactionKind === null,
  );
  const details = JSON.stringify(
    {
      missingProjectionDiagnostics,
      projectionFrames,
      projectionFrameCount: projectionFrames.length,
      violatingFrames,
    },
    null,
    2,
  );
  recordRetainedCompositorPerfSample({
    name: "projection frame content work guardrail",
    sample: JSON.parse(details),
  });

  expect(projectionFrames.length, details).toBeGreaterThan(0);
  expect(missingProjectionDiagnostics, details).toEqual([]);
  expect(violatingFrames, details).toEqual([]);
});

function hasProjectionFrameContentWork(
  frame: GpuFlowNodeLayerFrameProbeSummary,
): boolean {
  return (
    frame.phaseDiagnostics.frameMode !== "projection" ||
    frame.phaseDiagnostics.committedContentPublishMs > 0 ||
    frame.phaseDiagnostics.retainedDisplayTransactionMs > 0 ||
    frame.phaseDiagnostics.retainedPageFrameMs > 0 ||
    frame.phaseDiagnostics.retainedPageMaintenanceMs > 0 ||
    frame.phaseDiagnostics.retainedRuntimeFrameMs > 0 ||
    frame.retainedTexturePageCoverageCandidateCount > 0 ||
    frame.retainedTexturePageDrawQuadCount > 0 ||
    frame.retainedTexturePageRasterMs > 0 ||
    frame.retainedTexturePageTargetDescriptorCount > 0 ||
    frame.retainedTexturePageTransactionOutcome !== "none" ||
    frame.retainedTexturePageUploadCount > 0 ||
    frame.retainedTexturePageUploadMs > 0 ||
    frame.uploadedNodeIds.length > 0
  );
}

function isMotionProjectionFrame(
  frame: GpuFlowNodeLayerFrameProbeSummary,
): boolean {
  return (
    frame.phaseDiagnostics.frameMode === "projection" &&
    frame.frameReasons.length > 0 &&
    frame.frameReasons.some(
      (reason) => reason === "viewport" || reason === "retained-scroll",
    )
  );
}

function isHighRefreshCadence(cadence: PageRafCadence): boolean {
  return cadence.p50Ms <= 8.5 && cadence.p95Ms <= 10;
}

function resolveHighRefreshTransitionP95FrameBudget(
  cadence: PageRafCadence,
): number {
  return Math.max(
    HIGH_REFRESH_P95_FRAME_BUDGET_MS,
    cadence.p95Ms + HIGH_REFRESH_TRANSITION_P95_SLACK_MS,
  );
}

async function readRetainedRowCount(page: Page): Promise<number> {
  return await page.evaluate(
    () => window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0,
  );
}

async function captureChromeReproParitySample({
  label,
  page,
  testInfo,
}: {
  readonly label: string;
  readonly page: Page;
  readonly testInfo: TestInfo;
}) {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page, SECTION_SIZING_SURFACE_ID);
  await waitForAnimationFrame(page);
  const target = await resolveRetainedCompositorTarget(
    page,
    SECTION_SIZING_SURFACE_ID,
  );
  const screenshot = await page.screenshot({
    clip: target.clip,
    path: testInfo.outputPath(`chrome-repro-parity-${label}.png`),
  });
  const placeholderStats = await analyzeHorizontalPlaceholderBands(page, {
    screenshot,
  });
  const runtime = await page.evaluate(() => {
    const snapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.();
    const committed = snapshot?.committedSurfaceFrame ?? null;
    const diagnostics =
      (
        window as typeof window & {
          __settaGpuFlowDomControlPlaneDiagnostics?: () => {
            readonly committedFrameId: number;
            readonly mountedControlCount: number;
            readonly runtimeFrameId: number;
            readonly visibleControlRectCount: number;
          };
        }
      ).__settaGpuFlowDomControlPlaneDiagnostics?.() ?? null;
    return {
      chromeReproActive:
        (
          window as Window & { __SETTA_CHROME_REPRO_ACTIVE__?: boolean }
        ).__SETTA_CHROME_REPRO_ACTIVE__ === true,
      committed: committed
        ? {
            domControlActorCount: committed.domControlActorCount,
            projectedVisibleNonemptyDomControlCount:
              committed.projectedVisibleNonemptyDomControlCount,
            publishabilityKind: committed.publishabilityKind,
            publishabilityReason: committed.publishabilityReason,
            textActorBlockedAwaitingBrowserVisualCount:
              committed.projectionHorizon
                .textActorBlockedAwaitingBrowserVisualCount,
            textActorExactCoverageCount:
              committed.projectionHorizon.textActorExactCoverageCount,
            textActorTrueHoleCount:
              committed.projectionHorizon.textActorTrueHoleCount,
            visibleNonemptyDomControlCount:
              committed.visibleNonemptyDomControlCount,
          }
        : null,
      diagnostics,
    };
  });
  return {
    ...runtime,
    placeholderStats,
  };
}

async function resolveCanvasClip(page: Page): Promise<Rect> {
  return await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(
      ".setta-gpu-flow__canvas",
    );
    if (!canvas) {
      throw new Error("Missing GPU Flow canvas.");
    }
    const rect = canvas.getBoundingClientRect();
    return {
      height: Math.max(1, Math.min(rect.height, window.innerHeight - rect.y)),
      width: Math.max(1, Math.min(rect.width, window.innerWidth - rect.x)),
      x: Math.max(0, rect.x),
      y: Math.max(0, rect.y),
    };
  });
}

async function resolveCanvasGesturePoint(page: Page): Promise<{
  readonly x: number;
  readonly y: number;
}> {
  return await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(
      ".setta-gpu-flow__canvas",
    );
    if (!canvas) {
      throw new Error("Missing GPU Flow canvas.");
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.x + rect.width * 0.54,
      y: rect.y + rect.height * 0.52,
    };
  });
}

async function startMeasurementRafHeartbeat(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as Window & {
      __settaRetainedSettingsRafHeartbeatActive?: boolean;
    };
    win.__settaRetainedSettingsRafHeartbeatActive = true;
    const tick = () => {
      if (win.__settaRetainedSettingsRafHeartbeatActive) {
        requestAnimationFrame(tick);
      }
    };
    requestAnimationFrame(tick);
  });
}

async function stopMeasurementRafHeartbeat(page: Page): Promise<void> {
  await page.evaluate(() => {
    (
      window as Window & {
        __settaRetainedSettingsRafHeartbeatActive?: boolean;
      }
    ).__settaRetainedSettingsRafHeartbeatActive = false;
  });
}

function summarizeIntervals(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    count: values.length,
    maxMs: Math.max(0, ...values),
    p95Ms: percentile(sorted, 0.95),
  };
}
