import { expect, test, type Page, type TestInfo } from "@playwright/test";

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
  readRetainedCompositorSceneSummary,
  readRetainedCompositorScrollSignature,
  readRetainedCompositorViewport,
  recordRetainedCompositorPerfSample,
  resolveRetainedCompositorCadenceBudget,
  resolveRetainedCompositorTarget,
  resolveRetainedCompositorViewportPoint,
  runNativeRetainedCompositorWheelBurst,
  warmRetainedCompositorNativeWheelTarget,
  waitForRetainedCompositorGestureIdle,
} from "./settings-retained-compositor-helpers";
import {
  analyzeHorizontalPlaceholderBands,
  type HorizontalPlaceholderBandStats,
  type Rect,
} from "./settings-retained-visual-analysis";

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("all-settings retained compositor gestures stay within the measured cadence cap", async ({
  page,
}, testInfo) => {
  await installOptionalRetainedCompositorFrameProbe(page);
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const scene = await readRetainedCompositorSceneSummary(page);
  const target = await resolveRetainedCompositorTarget(page);
  const viewportPoint = await resolveRetainedCompositorViewportPoint(page);
  const controlCadence = await measureRetainedCompositorControlCadence(page);
  const beforeViewport = await readRetainedCompositorViewport(page);
  const beforeScrollSignature = await readRetainedCompositorScrollSignature(
    page,
    target.surfaceId,
  );
  const beforePageScrollY = await readNativePageScrollY(page);
  const beforeVisual = await captureRetainedCompositorVisualStats(
    page,
    target.clip,
  );
  const bandStats: Array<{
    readonly name: string;
    readonly stats: HorizontalPlaceholderBandStats;
  }> = [];
  bandStats.push(
    await captureRetainedCompositorBandStats({
      clip: target.clip,
      name: "large-scene-before.png",
      page,
      testInfo,
    }),
  );

  await waitForRetainedCompositorGestureIdle(page);
  const pan = await measureRetainedCompositorGesture(page, () =>
    dispatchRetainedCompositorWheelBurst(page, {
      deltaY: 1,
      eventCount: 96,
      point: viewportPoint,
    }),
  );
  const afterPanViewport = await readRetainedCompositorViewport(page);
  bandStats.push(
    await captureRetainedCompositorBandStats({
      clip: target.clip,
      name: "large-scene-after-pan.png",
      page,
      testInfo,
    }),
  );
  await waitForRetainedCompositorGestureIdle(page);
  const zoom = await measureRetainedCompositorGesture(page, () =>
    dispatchRetainedCompositorWheelBurst(page, {
      ctrlKey: true,
      deltaY: -0.25,
      eventCount: 96,
      point: viewportPoint,
    }),
  );
  bandStats.push(
    await captureRetainedCompositorBandStats({
      clip: target.clip,
      name: "large-scene-after-zoom.png",
      page,
      testInfo,
    }),
  );
  await waitForRetainedCompositorGestureIdle(page);
  const retainedHoverZoom = await measureRetainedCompositorGesture(page, () =>
    dispatchRetainedCompositorWheelBurst(page, {
      ctrlKey: true,
      deltaY: -0.25,
      eventCount: 96,
      point: target.point,
    }),
  );
  bandStats.push(
    await captureRetainedCompositorBandStats({
      clip: target.clip,
      name: "large-scene-after-retained-hover-zoom.png",
      page,
      testInfo,
    }),
  );
  await waitForRetainedCompositorGestureIdle(page);
  const retainedScroll = await measureRetainedCompositorGesture(page, () =>
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
  bandStats.push(
    await captureRetainedCompositorBandStats({
      clip: target.clip,
      name: "large-scene-after-retained-scroll.png",
      page,
      testInfo,
    }),
  );
  await waitForRetainedCompositorGestureIdle(page);
  await warmRetainedCompositorNativeWheelTarget(page, target.point);
  const scrollThenRetainedHoverZoom = await measureRetainedCompositorGesture(
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
  bandStats.push(
    await captureRetainedCompositorBandStats({
      clip: target.clip,
      name: "large-scene-after-mixed.png",
      page,
      testInfo,
    }),
  );
  const gestures = {
    pan,
    retainedHoverZoom,
    retainedScroll,
    scrollThenRetainedHoverZoom,
    zoom,
  };
  const retainedFrameProbe =
    await readOptionalRetainedCompositorFrameProbe(page);
  const budgets = {
    pan: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: pan.eventSpacing,
    }),
    retainedHoverZoom: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: retainedHoverZoom.eventSpacing,
    }),
    retainedScroll: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: retainedScroll.eventSpacing,
    }),
    scrollThenRetainedHoverZoom: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: scrollThenRetainedHoverZoom.eventSpacing,
    }),
    zoom: resolveRetainedCompositorCadenceBudget({
      controlCadence,
      eventSpacing: zoom.eventSpacing,
    }),
  };
  const holdStats = summarizeRetainedTransactionHoldProbe(retainedFrameProbe);
  const maxMeasuredFrameBudgetMs = Math.max(
    ...Object.values(budgets).map((budget) => budget.p99FrameBudgetMs),
  );
  const details = JSON.stringify(
    {
      budgets,
      bandStats,
      controlCadence,
      gestures,
      holdStats,
      pageScroll: { after: afterPageScrollY, before: beforePageScrollY },
      retainedFrameProbe,
      scene,
      scrollSignatures: {
        afterScroll: afterScrollSignature,
        before: beforeScrollSignature,
      },
      surface: target,
      viewport: {
        after: afterViewport,
        afterPan: afterPanViewport,
        before: beforeViewport,
      },
      viewportPoint,
      visual: { after: afterVisual, before: beforeVisual },
    },
    null,
    2,
  );
  recordRetainedCompositorPerfSample({
    name: "all-settings retained compositor large scene",
    sample: JSON.parse(details),
  });

  expect(scene.nodeCount, details).toBeGreaterThan(30);
  expect(scene.retainedRowCount, details).toBeGreaterThan(400);
  expect(scene.surfaceCount, details).toBeGreaterThan(4);
  expect(scene.controlKinds, details).toEqual(
    expect.arrayContaining([
      "color-picker",
      "dropdown",
      "nested",
      "switch",
      "text-like",
    ]),
  );
  expect(
    Math.abs(afterPanViewport.y - beforeViewport.y),
    details,
  ).toBeGreaterThan(8);
  expect(afterViewport.zoom, details).not.toBeCloseTo(beforeViewport.zoom, 3);
  expect(afterScrollSignature, details).not.toEqual(beforeScrollSignature);
  expect(afterPageScrollY, details).toBe(beforePageScrollY);
  expect(beforeVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(afterVisual.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(
    bandStats.filter((sample) => sample.stats.highConfidencePlaceholder),
    details,
  ).toEqual([]);
  expect(holdStats.maxDivergedHeldMotionAgeMs, details).toBeLessThanOrEqual(
    maxMeasuredFrameBudgetMs,
  );
  expect(holdStats.repeatedDivergedHoldCount, details).toBe(0);
  expect(retainedHoverZoom.frame.p95Ms, details).toBeLessThanOrEqual(
    Math.max(budgets.retainedHoverZoom.p95FrameBudgetMs, zoom.frame.p95Ms + 8),
  );
  await test.step("large complex scene panning stays within the interaction frame budget", async () => {
    expectRetainedCompositorGestureWithinBudget({
      budget: budgets.pan,
      details,
      gesture: pan,
    });
  });
  await test.step("large complex scene zooming stays within the interaction frame budget", async () => {
    expectRetainedCompositorGestureWithinBudget({
      budget: budgets.zoom,
      details,
      gesture: zoom,
    });
    expectRetainedCompositorGestureWithinBudget({
      budget: budgets.retainedHoverZoom,
      details,
      gesture: retainedHoverZoom,
    });
  });
  await test.step("large complex retained section scrolling stays within the interaction frame budget", async () => {
    expectRetainedCompositorGestureWithinBudget({
      budget: budgets.retainedScroll,
      details,
      gesture: retainedScroll,
    });
  });
  expectRetainedCompositorGestureWithinBudget({
    budget: budgets.scrollThenRetainedHoverZoom,
    details,
    gesture: scrollThenRetainedHoverZoom,
  });
});

async function captureRetainedCompositorBandStats({
  clip,
  name,
  page,
  testInfo,
}: {
  readonly clip: Rect;
  readonly name: string;
  readonly page: Page;
  readonly testInfo: TestInfo;
}): Promise<{
  readonly name: string;
  readonly stats: HorizontalPlaceholderBandStats;
}> {
  const screenshot = await page.screenshot({
    clip,
    path: testInfo.outputPath(name),
  });
  await testInfo.attach(name, {
    body: screenshot,
    contentType: "image/png",
  });
  return {
    name,
    stats: await analyzeHorizontalPlaceholderBands(page, { screenshot }),
  };
}

function summarizeRetainedTransactionHoldProbe(probe: unknown): {
  readonly maxDivergedHeldMotionAgeMs: number;
  readonly repeatedDivergedHoldCount: number;
} {
  if (!Array.isArray(probe)) {
    return { maxDivergedHeldMotionAgeMs: 0, repeatedDivergedHoldCount: 0 };
  }
  let maxDivergedHeldMotionAgeMs = 0;
  let consecutiveDivergedHolds = 0;
  let repeatedDivergedHoldCount = 0;
  for (const sample of probe) {
    const entry = isRecord(sample) ? sample : {};
    const heldCount = numericValue(
      entry.retainedTexturePageTransactionHeldTransactionCount,
    );
    const heldAge = numericValue(
      entry.retainedTexturePageTransactionMaxHeldMotionAgeMs,
    );
    const diverged =
      heldCount > 0 &&
      (numericValue(entry.retainedTexturePageTransactionDesiredScrollOffset) !==
        numericValue(
          entry.retainedTexturePageTransactionPublishedScrollOffset,
        ) ||
        !viewportsEqual(
          entry.retainedTexturePageTransactionDesiredViewport,
          entry.retainedTexturePageTransactionPublishedViewport,
        ));
    if (diverged) {
      maxDivergedHeldMotionAgeMs = Math.max(
        maxDivergedHeldMotionAgeMs,
        heldAge,
      );
    }
    consecutiveDivergedHolds = diverged ? consecutiveDivergedHolds + 1 : 0;
    if (consecutiveDivergedHolds > 1) {
      repeatedDivergedHoldCount += 1;
    }
  }
  return { maxDivergedHeldMotionAgeMs, repeatedDivergedHoldCount };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function numericValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function viewportsEqual(left: unknown, right: unknown): boolean {
  if (!isRecord(left) || !isRecord(right)) {
    return true;
  }
  return (
    numericValue(left.x) === numericValue(right.x) &&
    numericValue(left.y) === numericValue(right.y) &&
    numericValue(left.zoom) === numericValue(right.zoom)
  );
}
