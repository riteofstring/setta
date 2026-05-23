import { expect, test, type Page } from "@playwright/test";

import {
  SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  centerRetainedCompositorSurface,
  dispatchRetainedCompositorWheelBurst,
  expectRetainedCompositorGestureWithinBudget,
  installOptionalRetainedCompositorFrameProbe,
  measureRetainedCompositorControlCadence,
  measureRetainedCompositorGesture,
  openAllSettingsForRetainedCompositor,
  readOptionalRetainedCompositorFrameProbe,
  resolveRetainedCompositorCadenceBudget,
  resolveRetainedCompositorTarget,
  runNativeRetainedCompositorWheelBurst,
  warmRetainedCompositorNativeWheelTarget,
} from "./settings-retained-compositor-helpers";
import {
  analyzeHorizontalPlaceholderBands,
  compareScreenshotSimilarity,
} from "./settings-retained-visual-analysis";

const MIN_RETAINED_CONTENT_NONBLANK_RATIO = 0.02;
const MIN_VISIBLE_PROGRESS_CHANGED_PIXEL_RATIO = 0.0015;
const MIN_VISIBLE_PROGRESS_MEAN_DELTA = 0.5;
const MIN_FINAL_CHANGED_PIXEL_RATIO = 0.004;
const MIN_FINAL_MEAN_DELTA = 1;

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("retained scroll and hover zoom make visible progress within the held-frame budget", async ({
  page,
}, testInfo) => {
  await installOptionalRetainedCompositorFrameProbe(page);
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const target = await resolveRetainedCompositorTarget(page);
  await warmRetainedCompositorNativeWheelTarget(page, target.point);
  const controlCadence = await measureRetainedCompositorControlCadence(page);
  const before = await page.screenshot({
    clip: target.clip,
    path: testInfo.outputPath("visible-progress-before.png"),
  });
  let sampleAround60Ms: Buffer | null = null;
  let sampleAround120Ms: Buffer | null = null;

  const gesture = await measureRetainedCompositorGesture(
    page,
    async () => {
      const scrollSpacing = await runNativeRetainedCompositorWheelBurst(page, {
        deltaY: 40,
        eventCount: 4,
        point: target.point,
      });
      const zoomSpacing = await dispatchRetainedCompositorWheelBurst(page, {
        ctrlKey: true,
        deltaY: -0.35,
        eventCount: 4,
        point: target.point,
      });
      sampleAround60Ms = await page.screenshot({
        clip: target.clip,
        path: testInfo.outputPath("visible-progress-around-60ms.png"),
      });
      await page.waitForTimeout(56);
      sampleAround120Ms = await page.screenshot({
        clip: target.clip,
        path: testInfo.outputPath("visible-progress-around-120ms.png"),
      });
      return [...scrollSpacing, ...zoomSpacing];
    },
    { settleMs: 160 },
  );

  const final = await page.screenshot({
    clip: target.clip,
    path: testInfo.outputPath("visible-progress-final.png"),
  });
  if (!sampleAround60Ms || !sampleAround120Ms) {
    throw new Error("Missing retained visible progress samples.");
  }
  const around60Similarity = await compareScreenshotSimilarity(page, {
    actual: sampleAround60Ms,
    expected: before,
  });
  const around120Similarity = await compareScreenshotSimilarity(page, {
    actual: sampleAround120Ms,
    expected: before,
  });
  const finalSimilarity = await compareScreenshotSimilarity(page, {
    actual: final,
    expected: before,
  });
  const bands = {
    around120: await analyzeHorizontalPlaceholderBands(page, {
      screenshot: sampleAround120Ms,
    }),
    before: await analyzeHorizontalPlaceholderBands(page, {
      screenshot: before,
    }),
    final: await analyzeHorizontalPlaceholderBands(page, { screenshot: final }),
  };
  const budget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: gesture.eventSpacing,
  });
  const retainedFrameProbe =
    await readOptionalRetainedCompositorFrameProbe(page);
  const blockedEvents = await readBlockedVisiblePublicationEvents(page);
  const details = JSON.stringify(
    {
      around60Similarity,
      around120Similarity,
      bands,
      blockedEvents,
      budget,
      controlCadence,
      finalSimilarity,
      gesture,
      retainedFrameProbe,
      target,
    },
    null,
    2,
  );

  expectRetainedCompositorGestureWithinBudget({
    budget,
    details,
    gesture,
  });
  expect(bands.before.nonblankRatio, details).toBeGreaterThan(
    MIN_RETAINED_CONTENT_NONBLANK_RATIO,
  );
  expect(bands.around120.nonblankRatio, details).toBeGreaterThan(
    MIN_RETAINED_CONTENT_NONBLANK_RATIO,
  );
  expect(bands.final.nonblankRatio, details).toBeGreaterThan(
    MIN_RETAINED_CONTENT_NONBLANK_RATIO,
  );
  expect(bands.around120.highConfidencePlaceholder, details).toBe(false);
  expect(bands.final.highConfidencePlaceholder, details).toBe(false);
  expect(
    hasVisibleProgress(around60Similarity, around120Similarity),
    details,
  ).toBe(true);
  expect(
    finalSimilarity.changedPixelRatio >= MIN_FINAL_CHANGED_PIXEL_RATIO ||
      finalSimilarity.meanDelta >= MIN_FINAL_MEAN_DELTA,
    details,
  ).toBe(true);
});

function hasVisibleProgress(
  around60Similarity: {
    readonly changedPixelRatio: number;
    readonly meanDelta: number;
  },
  around120Similarity: {
    readonly changedPixelRatio: number;
    readonly meanDelta: number;
  },
): boolean {
  return [around60Similarity, around120Similarity].some(
    (sample) =>
      sample.changedPixelRatio >= MIN_VISIBLE_PROGRESS_CHANGED_PIXEL_RATIO ||
      sample.meanDelta >= MIN_VISIBLE_PROGRESS_MEAN_DELTA,
  );
}

async function readBlockedVisiblePublicationEvents(
  page: Page,
): Promise<readonly unknown[]> {
  return await page.evaluate(
    () =>
      (
        window as typeof window & {
          readonly __SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__?: readonly unknown[];
        }
      ).__SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__ ?? [],
  );
}
