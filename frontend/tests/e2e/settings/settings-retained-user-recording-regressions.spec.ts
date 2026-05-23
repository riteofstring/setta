import {
  expect,
  test,
  type ConsoleMessage,
  type Page,
  type TestInfo,
} from "@playwright/test";

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
  compareScreenshotSimilarity,
  type Rect,
} from "./settings-retained-visual-analysis";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const SECTION_SIZING_SURFACE_ID =
  "settings-section__sectionSizingPolicy" + SETTINGS_PARAM_CONTENT_SUFFIX;
const SHORTCUTS_SURFACE_ID =
  "settings-section__shortcuts" + SETTINGS_PARAM_CONTENT_SUFFIX;
const MIN_RETAINED_CONTENT_NONBLANK_RATIO = 0.02;
const MAX_CHROME_REPRO_PARITY_CHANGED_PIXEL_RATIO = 0.12;
const MAX_CHROME_REPRO_PARITY_MEAN_DELTA = 18;
const MAX_CHROME_REPRO_PARITY_P95_DELTA = 54;
const HIGH_REFRESH_P95_FRAME_BUDGET_MS = 8.5;
const HIGH_REFRESH_TRANSITION_P95_SLACK_MS = 8;
const HIGH_REFRESH_TRANSITION_P95_TIMER_EPSILON_MS = 1;
const MAX_FRAME_GAP_MS = 50;
const MAX_FRAME_TIMER_JITTER_MS = 20;
const MAX_CAPPED_FRAME_TIMER_JITTER_MS = 35;
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
  const runtimeHealth = capturePageRuntimeHealth(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  const controlCadence = await measurePageRafCadence(page);

  await resetGpuFlowPerformanceProbe(page);
  await installLongAnimationFrameProbe(page);
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
      () => (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROW_COUNT__?.() ?? 0) > 50,
      undefined,
      { timeout: 10_000 },
    );
    await waitForAnimationFrame(page);
    await waitForAnimationFrame(page);

    snapshot = await readGpuFlowPerformanceSnapshot(page);
  } finally {
    await stopMeasurementRafHeartbeat(page);
  }
  const runtimeHealthSnapshot = runtimeHealth.stop();
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
  const longAnimationFrames = await readLongAnimationFrameProbe(page);
  const maxLongTaskMs = Math.max(
    0,
    ...snapshot.longTasks.map((task) => task.durationMs),
  );
  const highRefresh = isHighRefreshCadence(controlCadence);
  const domControlDiagnostics = await readDomControlDiagnostics(page);
  const p95FrameBudgetMs = highRefresh
    ? resolveHighRefreshTransitionP95FrameBudget(controlCadence)
    : null;
  const details = JSON.stringify(
    {
      controlCadence,
      frameStats,
      highRefresh,
      frameIntervalOutliers: snapshot.frameIntervalsMs
        .map((durationMs, index) => ({ durationMs, index }))
        .toSorted((left, right) => right.durationMs - left.durationMs)
        .slice(0, 8),
      longAnimationFrames,
      longTasks: snapshot.longTasks,
      domControlDiagnostics,
      domSourceDiagnostics: await readDomSourceDiagnostics(page),
      placeholderStats,
      p95FrameBudgetMs,
      performanceMeasureCount: snapshot.performanceMeasures.length,
      performanceMeasuresFirst: snapshot.performanceMeasures.slice(0, 12),
      performanceMeasuresLast: snapshot.performanceMeasures.slice(-12),
      performanceMeasuresTopDuration: snapshot.performanceMeasures
        .toSorted((left, right) => right.durationMs - left.durationMs)
        .slice(0, 12),
      reactProfilesTopDuration: snapshot.performanceMeasures
        .filter((measure) => measure.name.includes("react-profile"))
        .toSorted((left, right) => right.durationMs - left.durationMs)
        .slice(0, 24),
      queueCallsAroundLongTasks: snapshot.longTasks.flatMap((task) =>
        snapshot.queueCalls.filter(
          (call) =>
            Math.abs(call.timestampMs - task.startTimeMs) <= 100 ||
            (call.timestampMs >= task.startTimeMs &&
              call.timestampMs <= task.startTimeMs + task.durationMs + 100),
        ),
      ),
      queueCallsTopPixels: snapshot.queueCalls
        .filter((call) => call.method === "copyElementImageToTexture")
        .map((call) => ({
          ...call,
          pixels: (call.width ?? 0) * (call.height ?? 0),
        }))
        .toSorted((left, right) => right.pixels - left.pixels)
        .slice(0, 12),
      rafCallbacksTopDuration: snapshot.rafCallbacks
        .toSorted((left, right) => right.durationMs - left.durationMs)
        .slice(0, 12),
      rowCount: await readRetainedRowCount(page),
      runtimeHealth: runtimeHealthSnapshot,
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

  expect(placeholderStats.nonblankRatio, details).toBeGreaterThan(
    MIN_RETAINED_CONTENT_NONBLANK_RATIO,
  );
  expect(placeholderStats.highConfidencePlaceholder, details).toBe(false);
  expect(runtimeHealthSnapshot.reactRenderPhaseWarnings, details).toEqual([]);
  expect(runtimeHealthSnapshot.consoleErrors, details).toEqual([]);
  expect(runtimeHealthSnapshot.pageErrors, details).toEqual([]);
  expect(frameStats.maxMs, details).toBeLessThanOrEqual(
    MAX_FRAME_GAP_MS + resolveMaxFrameTimerJitterMs(controlCadence),
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
  const visualSimilarity = await compareScreenshotSimilarity(page, {
    actual: recorder.screenshot,
    expected: normal.screenshot,
  });
  const details = JSON.stringify(
    {
      normal: summarizeChromeReproParitySample(normal),
      recorder: summarizeChromeReproParitySample(recorder),
      visualSimilarity,
    },
    null,
    2,
  );

  expect(normal.chromeReproActive, details).toBe(false);
  expect(recorder.chromeReproActive, details).toBe(true);
  expect(normal.runtimeHealth.consoleErrors, details).toEqual([]);
  expect(normal.runtimeHealth.pageErrors, details).toEqual([]);
  expect(normal.runtimeHealth.reactRenderPhaseWarnings, details).toEqual([]);
  expect(recorder.runtimeHealth.consoleErrors, details).toEqual([]);
  expect(recorder.runtimeHealth.pageErrors, details).toEqual([]);
  expect(recorder.runtimeHealth.reactRenderPhaseWarnings, details).toEqual([]);
  expect(normal.placeholderStats.nonblankRatio, details).toBeGreaterThan(
    MIN_RETAINED_CONTENT_NONBLANK_RATIO,
  );
  expect(recorder.placeholderStats.nonblankRatio, details).toBeGreaterThan(
    MIN_RETAINED_CONTENT_NONBLANK_RATIO,
  );
  expect(normal.placeholderStats.highConfidencePlaceholder, details).toBe(
    false,
  );
  expect(recorder.placeholderStats.highConfidencePlaceholder, details).toBe(
    false,
  );
  expect(normal.committed?.publishabilityKind, details).toBe("publishable");
  expect(recorder.committed?.publishabilityKind, details).toBe("publishable");
  expect(normal.committed?.textActorTrueHoleCount, details).toBe(0);
  expect(recorder.committed?.textActorTrueHoleCount, details).toBe(0);
  expect(
    normal.committed?.textActorExactCoverageCount ?? 0,
    details,
  ).toBeGreaterThan(0);
  expect(
    recorder.committed?.textActorExactCoverageCount ?? 0,
    details,
  ).toBeGreaterThan(0);
  expect(
    normal.committed?.visibleNonemptyDomControlCount ?? 0,
    details,
  ).toBeGreaterThan(0);
  expect(
    recorder.committed?.visibleNonemptyDomControlCount ?? 0,
    details,
  ).toBeGreaterThan(0);
  expect(visualSimilarity.changedPixelRatio, details).toBeLessThanOrEqual(
    MAX_CHROME_REPRO_PARITY_CHANGED_PIXEL_RATIO,
  );
  expect(visualSimilarity.meanDelta, details).toBeLessThanOrEqual(
    MAX_CHROME_REPRO_PARITY_MEAN_DELTA,
  );
  expect(visualSimilarity.p95Delta, details).toBeLessThanOrEqual(
    MAX_CHROME_REPRO_PARITY_P95_DELTA,
  );
  expect(
    recorder.diagnostics?.visibleControlRectCount ?? 0,
    details,
  ).toBeGreaterThan(0);
  expect(
    normal.diagnostics?.visibleControlRectCount ?? 0,
    details,
  ).toBeGreaterThan(0);
  expect(recorder.diagnostics?.committedFrameId ?? 0, details).toBeGreaterThan(
    0,
  );
  expect(normal.diagnostics?.committedFrameId ?? 0, details).toBeGreaterThan(0);
  expect(recorder.diagnostics?.runtimeFrameId ?? 0, details).toBeGreaterThan(0);
  expect(normal.diagnostics?.runtimeFrameId ?? 0, details).toBeGreaterThan(0);
  expect(
    recorder.diagnostics?.mountedControlCount ?? 0,
    details,
  ).toBeGreaterThanOrEqual(recorder.diagnostics?.visibleControlRectCount ?? 0);
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

function capturePageRuntimeHealth(page: Page): {
  readonly stop: () => {
    readonly consoleErrors: readonly string[];
    readonly pageErrors: readonly string[];
    readonly reactRenderPhaseWarnings: readonly string[];
  };
} {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const reactRenderPhaseWarnings: string[] = [];
  const onConsole = (message: ConsoleMessage) => {
    if (message.type() !== "error") {
      return;
    }
    const text = message.text();
    consoleErrors.push(text);
    if (isReactRenderPhaseWarning(text)) {
      reactRenderPhaseWarnings.push(text);
    }
  };
  const onPageError = (error: Error) => {
    pageErrors.push(error instanceof Error ? error.message : String(error));
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  return {
    stop() {
      page.off("console", onConsole);
      page.off("pageerror", onPageError);
      return {
        consoleErrors,
        pageErrors,
        reactRenderPhaseWarnings,
      };
    },
  };
}

function isReactRenderPhaseWarning(text: string): boolean {
  return text.includes(
    "Cannot update a component while rendering a different component",
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
  return (
    Math.max(
      HIGH_REFRESH_P95_FRAME_BUDGET_MS,
      cadence.p95Ms + HIGH_REFRESH_TRANSITION_P95_SLACK_MS,
    ) + HIGH_REFRESH_TRANSITION_P95_TIMER_EPSILON_MS
  );
}

function resolveMaxFrameTimerJitterMs(cadence: PageRafCadence): number {
  return Math.max(
    MAX_FRAME_TIMER_JITTER_MS,
    Math.min(MAX_CAPPED_FRAME_TIMER_JITTER_MS, cadence.maxMs - 16.7),
  );
}

async function readRetainedRowCount(page: Page): Promise<number> {
  return await page.evaluate(
    () => window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROW_COUNT__?.() ?? 0,
  );
}

async function readDomControlDiagnostics(page: Page): Promise<unknown> {
  return await page.evaluate(
    () =>
      (
        window as typeof window & {
          __settaGpuFlowDomControlPlaneDiagnostics?: () => unknown;
        }
      ).__settaGpuFlowDomControlPlaneDiagnostics?.() ?? null,
  );
}

async function readDomSourceDiagnostics(page: Page): Promise<unknown> {
  return await page.evaluate(() => {
    const sources = [
      ...document.querySelectorAll<HTMLElement>(
        ".setta-gpu-flow__html-source",
      ),
    ];
    return {
      count: sources.length,
      topDescendantCounts: sources
        .map((source) => ({
          className: source.className,
          descendantCount: source.querySelectorAll("*").length,
          sourceId: source.getAttribute("data-gpu-flow-source-id"),
        }))
        .sort((left, right) => right.descendantCount - left.descendantCount)
        .slice(0, 16),
    };
  });
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
  const runtimeHealth = capturePageRuntimeHealth(page);
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page, SECTION_SIZING_SURFACE_ID);
  await waitForRetainedCompositorVisibleDomPublication(page);
  await waitForAnimationFrame(page);
  const target = await resolveRetainedCompositorTarget(
    page,
    SECTION_SIZING_SURFACE_ID,
  );
  await waitForRetainedCompositorNonblankClip(page, target.clip);
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
        (window as Window & { __SETTA_CHROME_REPRO_ACTIVE__?: boolean })
          .__SETTA_CHROME_REPRO_ACTIVE__ === true,
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
  const runtimeHealthSnapshot = runtimeHealth.stop();
  return {
    ...runtime,
    placeholderStats,
    runtimeHealth: runtimeHealthSnapshot,
    screenshot,
  };
}

function summarizeChromeReproParitySample(
  sample: Awaited<ReturnType<typeof captureChromeReproParitySample>>,
) {
  const { screenshot: _screenshot, ...summary } = sample;
  return summary;
}

async function waitForRetainedCompositorNonblankClip(
  page: Page,
  clip: Rect,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const screenshot = await page.screenshot({ clip });
        const placeholderStats = await analyzeHorizontalPlaceholderBands(page, {
          screenshot,
        });
        return placeholderStats.nonblankRatio;
      },
      {
        intervals: [50, 80, 120, 180],
        timeout: 10_000,
      },
    )
    .toBeGreaterThan(MIN_RETAINED_CONTENT_NONBLANK_RATIO);
}

async function waitForRetainedCompositorVisibleDomPublication(
  page: Page,
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const committed =
            window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().committedSurfaceFrame;
          return {
            publishabilityKind: committed?.publishabilityKind ?? null,
            visibleNonemptyDomControlCount:
              committed?.visibleNonemptyDomControlCount ?? 0,
          };
        }),
      { timeout: 10_000 },
    )
    .toEqual(
      expect.objectContaining({
        publishabilityKind: "publishable",
        visibleNonemptyDomControlCount: expect.any(Number),
      }),
    );
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().committedSurfaceFrame
              ?.visibleNonemptyDomControlCount ?? 0,
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
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

async function installLongAnimationFrameProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as Window & {
      __settaRetainedSettingsLongAnimationFrames__?: unknown[];
      __settaRetainedSettingsLongAnimationFrameObserver__?: PerformanceObserver;
    };
    win.__settaRetainedSettingsLongAnimationFrames__ = [];
    win.__settaRetainedSettingsLongAnimationFrameObserver__?.disconnect();
    if (
      typeof PerformanceObserver !== "function" ||
      !PerformanceObserver.supportedEntryTypes.includes(
        "long-animation-frame",
      )
    ) {
      return;
    }
    const observer = new PerformanceObserver((list) => {
      const samples = win.__settaRetainedSettingsLongAnimationFrames__;
      if (!samples) {
        return;
      }
      for (const entry of list.getEntries()) {
        const record = entry as PerformanceEntry & {
          blockingDuration?: number;
          renderStart?: number;
          scripts?: Array<{
            duration?: number;
            forcedStyleAndLayoutDuration?: number;
            invoker?: string;
            invokerType?: string;
            pauseDuration?: number;
            sourceFunctionName?: string;
            sourceURL?: string;
            sourceCharPosition?: number;
            startTime?: number;
            styleAndLayoutStart?: number;
            windowAttribution?: string;
          }>;
        };
        samples.push({
          blockingDuration: record.blockingDuration ?? 0,
          duration: record.duration,
          name: record.name,
          renderStart: record.renderStart ?? null,
          scripts: (record.scripts ?? [])
            .map((script) => ({
              duration: script.duration ?? 0,
              forcedStyleAndLayoutDuration:
                script.forcedStyleAndLayoutDuration ?? 0,
              invoker: script.invoker ?? "",
              invokerType: script.invokerType ?? "",
              pauseDuration: script.pauseDuration ?? 0,
              sourceFunctionName: script.sourceFunctionName ?? "",
              sourceURL: script.sourceURL ?? "",
              startTime: script.startTime ?? 0,
              styleAndLayoutStart: script.styleAndLayoutStart ?? 0,
              windowAttribution: script.windowAttribution ?? "",
            }))
            .sort((left, right) => right.duration - left.duration)
            .slice(0, 5),
          startTime: record.startTime,
        });
      }
      if (samples.length > 16) {
        samples.splice(0, samples.length - 16);
      }
    });
    observer.observe({ type: "long-animation-frame", buffered: true });
    win.__settaRetainedSettingsLongAnimationFrameObserver__ = observer;
  });
}

async function readLongAnimationFrameProbe(page: Page): Promise<unknown[]> {
  return await page.evaluate(() => {
    const win = window as Window & {
      __settaRetainedSettingsLongAnimationFrames__?: unknown[];
      __settaRetainedSettingsLongAnimationFrameObserver__?: PerformanceObserver;
    };
    win.__settaRetainedSettingsLongAnimationFrameObserver__?.disconnect();
    return win.__settaRetainedSettingsLongAnimationFrames__ ?? [];
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
