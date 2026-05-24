import { expect, test } from "@playwright/test";

import {
  SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  captureRetainedCompositorVisualStats,
  centerRetainedCompositorSurface,
  dispatchRetainedCompositorWheelBurst,
  expectRetainedCompositorGestureWithinBudget,
  installOptionalRetainedCompositorFrameProbe,
  measureRetainedCompositorControlCadence,
  measureRetainedCompositorGesture,
  openAllSettingsForRetainedCompositor,
  readNativePageScrollY,
  readOptionalRetainedCompositorFrameProbe,
  readRetainedCompositorScrollSignature,
  readRetainedCompositorViewport,
  recordRetainedCompositorPerfSample,
  resolveRetainedCompositorCadenceBudget,
  resolveRetainedCompositorTarget,
  resolveRetainedCompositorViewportPoint,
  runNativeRetainedCompositorWheelBurst,
  startRetainedCompositorGestureFrameSampler,
  stopRetainedCompositorGestureFrameSampler,
  summarizeRetainedCompositorIntervals,
  waitForRetainedCompositorGestureIdle,
  warmRetainedCompositorNativeWheelTarget,
  type RetainedCompositorPoint,
  type RetainedCompositorVisualStats,
} from "./settings-retained-compositor-helpers";
import {
  compareScreenshotSimilarity,
  type Rect,
  type ScreenshotSimilarityStats,
} from "./settings-retained-visual-analysis";

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("retained-hover zoom sustains the same compositor cadence class as viewport zoom", async ({
  page,
}) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page);
  const target = await resolveRetainedCompositorTarget(page);
  const viewportPoint = await resolveRetainedCompositorViewportPoint(page);
  const controlCadence = await measureRetainedCompositorControlCadence(page);
  const beforeViewport = await readRetainedCompositorViewport(page);
  const beforeVisual = await captureRetainedCompositorVisualStats(
    page,
    target.clip,
  );

  const viewportZoom = await measureRetainedCompositorGesture(page, () =>
    dispatchRetainedCompositorWheelBurst(page, {
      ctrlKey: true,
      deltaY: -0.25,
      eventCount: 96,
      point: viewportPoint,
    }),
  );
  const retainedHoverZoom = await measureRetainedCompositorGesture(page, () =>
    dispatchRetainedCompositorWheelBurst(page, {
      ctrlKey: true,
      deltaY: -0.25,
      eventCount: 96,
      point: target.point,
    }),
  );
  const afterViewport = await readRetainedCompositorViewport(page);
  const afterVisual = await captureRetainedCompositorVisualStats(
    page,
    target.clip,
  );
  const viewportZoomBudget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: viewportZoom.eventSpacing,
  });
  const retainedHoverZoomBudget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: retainedHoverZoom.eventSpacing,
  });
  const details = JSON.stringify(
    {
      budgets: { retainedHoverZoomBudget, viewportZoomBudget },
      controlCadence,
      retainedHoverZoom,
      surface: target,
      viewport: { after: afterViewport, before: beforeViewport },
      viewportPoint,
      viewportZoom,
      visual: { after: afterVisual, before: beforeVisual },
    },
    null,
    2,
  );
  recordRetainedCompositorPerfSample({
    name: "retained-hover zoom cadence",
    sample: JSON.parse(details),
  });

  expect(afterViewport.zoom, details).not.toBeCloseTo(beforeViewport.zoom, 3);
  expect(beforeVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(afterVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(target.visibleRowCount, details).toBeGreaterThan(3);
  expectRetainedCompositorGestureWithinBudget({
    budget: viewportZoomBudget,
    details,
    gesture: viewportZoom,
  });
  expectRetainedCompositorGestureWithinBudget({
    budget: retainedHoverZoomBudget,
    details,
    gesture: retainedHoverZoom,
  });
  expect(retainedHoverZoom.frame.p95Ms, details).toBeLessThanOrEqual(
    Math.max(
      retainedHoverZoomBudget.p95FrameBudgetMs,
      viewportZoom.frame.p95Ms + 8,
    ),
  );
});

test("retained section scroll and immediate retained-hover zoom preserve scroll ownership and content", async ({
  page,
}) => {
  await installOptionalRetainedCompositorFrameProbe(page);
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page);
  const target = await resolveRetainedCompositorTarget(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const controlCadence = await measureRetainedCompositorControlCadence(page);
  const beforeScrollSignature = await readRetainedCompositorScrollSignature(
    page,
    target.surfaceId,
  );
  const beforeViewport = await readRetainedCompositorViewport(page);
  const beforePageScrollY = await readNativePageScrollY(page);
  await waitForRetainedCompositorGestureIdle(page);
  const beforeVisual = await captureRetainedCompositorVisualStats(
    page,
    target.clip,
  );

  const scrollGesture = await measureRetainedCompositorGesture(page, () =>
    runNativeRetainedCompositorWheelBurst(page, {
      deltaY: 44,
      eventCount: 18,
      point: target.point,
    }),
  );
  const afterScrollSignature = await readRetainedCompositorScrollSignature(
    page,
    target.surfaceId,
  );
  const afterScrollVisual = await captureRetainedCompositorVisualStats(
    page,
    target.clip,
  );
  await waitForRetainedCompositorGestureIdle(page);
  await warmRetainedCompositorNativeWheelTarget(page, target.point);
  const scrollThenZoom = await measureRetainedCompositorGesture(
    page,
    async () => {
      const scrollSpacing = await runNativeRetainedCompositorWheelBurst(page, {
        deltaY: 36,
        eventCount: 10,
        point: target.point,
      });
      const zoomSpacing = await dispatchRetainedCompositorWheelBurst(page, {
        ctrlKey: true,
        deltaY: -0.25,
        eventCount: 48,
        point: target.point,
      });
      return [...scrollSpacing, ...zoomSpacing];
    },
  );
  const afterViewport = await readRetainedCompositorViewport(page);
  const afterPageScrollY = await readNativePageScrollY(page);
  const afterVisual = await captureRetainedCompositorVisualStats(
    page,
    target.clip,
  );
  const retainedFrameProbe =
    await readOptionalRetainedCompositorFrameProbe(page);
  const scrollBudget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: scrollGesture.eventSpacing,
  });
  const scrollThenZoomBudget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: scrollThenZoom.eventSpacing,
  });
  const details = JSON.stringify(
    {
      budgets: { scrollBudget, scrollThenZoomBudget },
      controlCadence,
      pageScroll: { after: afterPageScrollY, before: beforePageScrollY },
      retainedFrameProbe,
      scrollGesture,
      scrollSignatures: {
        afterScroll: afterScrollSignature,
        before: beforeScrollSignature,
      },
      scrollThenZoom,
      surface: target,
      viewport: { after: afterViewport, before: beforeViewport },
      visual: {
        after: afterVisual,
        afterScroll: afterScrollVisual,
        before: beforeVisual,
      },
    },
    null,
    2,
  );
  recordRetainedCompositorPerfSample({
    name: "retained section scroll then retained-hover zoom",
    sample: JSON.parse(details),
  });

  expect(afterScrollSignature, details).not.toEqual(beforeScrollSignature);
  expect(afterViewport.zoom, details).not.toBeCloseTo(beforeViewport.zoom, 3);
  expect(afterPageScrollY, details).toBe(beforePageScrollY);
  expect(beforeVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(afterScrollVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(afterVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expectRetainedCompositorGestureWithinBudget({
    budget: scrollBudget,
    details,
    gesture: scrollGesture,
  });
  expectRetainedCompositorGestureWithinBudget({
    budget: scrollThenZoomBudget,
    details,
    gesture: scrollThenZoom,
  });
});

test("retained scroll plus zoom makes visible progress within 120 ms", async ({
  page,
}) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page);
  const target = await resolveRetainedCompositorTarget(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const controlCadence = await measureRetainedCompositorControlCadence(page);
  await waitForRetainedCompositorGestureIdle(page);
  const before = await captureRetainedCompositorTimelineFrame(
    page,
    target.clip,
  );
  const beforeProjection = await readRetainedCompositorProjectionProgress(page);

  await startRetainedCompositorGestureFrameSampler(page);
  await startRetainedScrollThenZoomTimelineGesture(page, target.point);
  await page.waitForTimeout(60);
  const at60ms = await captureRetainedCompositorTimelineFrame(
    page,
    target.clip,
  );
  const projectionAt60ms = await readRetainedCompositorProjectionProgress(page);
  await page.waitForTimeout(60);
  const at120ms = await captureRetainedCompositorTimelineFrame(
    page,
    target.clip,
  );
  const projectionAt120ms =
    await readRetainedCompositorProjectionProgress(page);
  const eventSpacingMs =
    await readRetainedScrollThenZoomTimelineGestureResult(page);
  const frameSample = await stopRetainedCompositorGestureFrameSampler(page);
  await waitForRetainedCompositorGestureIdle(page);
  const final = await captureRetainedCompositorTimelineFrame(page, target.clip);
  const gesture = {
    eventSpacing: summarizeRetainedCompositorIntervals(eventSpacingMs),
    frame: summarizeRetainedCompositorIntervals(frameSample.intervalsMs),
    longTasks: {
      count: frameSample.longTasks.length,
      entries: frameSample.longTasks,
      maxDurationMs: Math.max(
        0,
        ...frameSample.longTasks.map((task) => task.durationMs),
      ),
    },
  };
  const budget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: gesture.eventSpacing,
  });
  const changeAt60ms = await compareScreenshotSimilarity(page, {
    actual: at60ms.screenshot,
    expected: before.screenshot,
  });
  const changeAt120ms = await compareScreenshotSimilarity(page, {
    actual: at120ms.screenshot,
    expected: before.screenshot,
  });
  const finalChange = await compareScreenshotSimilarity(page, {
    actual: final.screenshot,
    expected: before.screenshot,
  });
  const visibleChangedWithin120ms =
    hasMeaningfulRetainedCompositorVisibleChange(changeAt60ms) ||
    hasMeaningfulRetainedCompositorVisibleChange(changeAt120ms);
  const projectionAdvancedWithin120ms =
    projectionAt120ms.projectionSampleId !==
      beforeProjection.projectionSampleId &&
    projectionAt120ms.blockedPublicationEventCount ===
      beforeProjection.blockedPublicationEventCount;
  const details = JSON.stringify(
    {
      budget,
      controlCadence,
      gesture,
      projection: {
        at60ms: projectionAt60ms,
        at120ms: projectionAt120ms,
        before: beforeProjection,
      },
      target,
      visual: {
        at60ms: at60ms.visualStats,
        at120ms: at120ms.visualStats,
        before: before.visualStats,
        changeAt60ms,
        changeAt120ms,
        final: final.visualStats,
        finalChange,
      },
      visibleChangedWithin120ms,
      projectionAdvancedWithin120ms,
    },
    null,
    2,
  );
  recordRetainedCompositorPerfSample({
    name: "retained scroll plus zoom visible progress within 120ms",
    sample: JSON.parse(details),
  });

  expect(before.visualStats.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(at60ms.visualStats.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(at120ms.visualStats.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(final.visualStats.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(
    visibleChangedWithin120ms || projectionAdvancedWithin120ms,
    details,
  ).toBe(true);
  expect(
    hasMeaningfulRetainedCompositorVisibleChange(finalChange),
    details,
  ).toBe(true);
  expectRetainedCompositorGestureWithinBudget({
    budget,
    details,
    gesture,
  });
});

type RetainedCompositorTimelineFrame = {
  readonly screenshot: Buffer;
  readonly visualStats: RetainedCompositorVisualStats;
};

type RetainedCompositorProjectionProgress = {
  readonly blockedPublicationEventCount: number;
  readonly committedFrameId: number | null;
  readonly projectionSampleId: number | null;
  readonly projectionTransactionId: string | null;
  readonly visiblePublication: unknown;
};

async function captureRetainedCompositorTimelineFrame(
  page: Parameters<typeof compareScreenshotSimilarity>[0],
  clip: Rect,
): Promise<RetainedCompositorTimelineFrame> {
  return {
    screenshot: await page.screenshot({ clip }),
    visualStats: await captureRetainedCompositorVisualStats(page, clip),
  };
}

async function startRetainedScrollThenZoomTimelineGesture(
  page: Parameters<typeof compareScreenshotSimilarity>[0],
  point: RetainedCompositorPoint,
): Promise<void> {
  await page.evaluate((gesturePoint) => {
    const win = window as typeof window & {
      __settaRetainedScrollThenZoomTimelineGesture?: Promise<readonly number[]>;
    };
    win.__settaRetainedScrollThenZoomTimelineGesture = runGesture();

    async function runGesture(): Promise<readonly number[]> {
      const timestamps: number[] = [];
      await dispatchWheelFrames({ ctrlKey: false, deltaY: 36, eventCount: 10 });
      await dispatchWheelFrames({
        ctrlKey: true,
        deltaY: -0.25,
        eventCount: 18,
      });
      return timestamps.slice(1).map((timestamp, index) => {
        const previous = timestamps[index] ?? timestamp;
        return timestamp - previous;
      });

      async function dispatchWheelFrames({
        ctrlKey,
        deltaY,
        eventCount,
      }: {
        readonly ctrlKey: boolean;
        readonly deltaY: number;
        readonly eventCount: number;
      }): Promise<void> {
        for (let index = 0; index < eventCount; index += 1) {
          const target = document.elementFromPoint(
            gesturePoint.x,
            gesturePoint.y,
          );
          if (!target) {
            throw new Error(
              `Missing retained timeline gesture target at ${gesturePoint.x.toFixed(
                1,
              )}, ${gesturePoint.y.toFixed(1)}.`,
            );
          }
          timestamps.push(performance.now());
          target.dispatchEvent(
            new WheelEvent("wheel", {
              bubbles: true,
              cancelable: true,
              clientX: gesturePoint.x,
              clientY: gesturePoint.y,
              ctrlKey,
              deltaMode: WheelEvent.DOM_DELTA_PIXEL,
              deltaY,
              view: window,
            }),
          );
          await new Promise<void>((resolve) => setTimeout(resolve, 8));
        }
      }
    }
  }, point);
}

async function readRetainedScrollThenZoomTimelineGestureResult(
  page: Parameters<typeof compareScreenshotSimilarity>[0],
): Promise<readonly number[]> {
  return await page.evaluate(async () => {
    const win = window as typeof window & {
      __settaRetainedScrollThenZoomTimelineGesture?: Promise<readonly number[]>;
    };
    const result = await win.__settaRetainedScrollThenZoomTimelineGesture;
    delete win.__settaRetainedScrollThenZoomTimelineGesture;
    if (!result) {
      throw new Error("Missing retained scroll plus zoom timeline gesture.");
    }
    return result;
  });
}

async function readRetainedCompositorProjectionProgress(
  page: Parameters<typeof compareScreenshotSimilarity>[0],
): Promise<RetainedCompositorProjectionProgress> {
  return await page.evaluate(() => {
    const canvas = document.querySelector<HTMLElement>(
      "[data-gpu-flow-surface='true']",
    );
    const blockedEvents =
      (
        window as typeof window & {
          readonly __SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__?: readonly unknown[];
        }
      ).__SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__ ?? [];
    return {
      blockedPublicationEventCount: blockedEvents.length,
      committedFrameId: parseOptionalNumber(
        canvas?.dataset.gpuFlowCommittedFrameId,
      ),
      projectionSampleId: parseOptionalNumber(
        canvas?.dataset.gpuFlowProjectionSampleId,
      ),
      projectionTransactionId:
        canvas?.dataset.gpuFlowProjectionTransactionId ?? null,
      visiblePublication:
        window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().visiblePublication ?? null,
    };

    function parseOptionalNumber(value: string | undefined): number | null {
      if (value === undefined) {
        return null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
  });
}

function hasMeaningfulRetainedCompositorVisibleChange(
  change: ScreenshotSimilarityStats,
): boolean {
  return (
    change.changedPixelRatio >= 0.01 ||
    change.colorHistogramDistance >= 0.015 ||
    change.meanDelta >= 2
  );
}
