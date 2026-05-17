import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  SETTINGS_PARAM_CONTENT_SUFFIX,
  centerRetainedCompositorSurface,
  dispatchRetainedCompositorWheelBurst,
  expectRetainedCompositorGestureWithinBudget,
  measureRetainedCompositorControlCadence,
  measureRetainedCompositorGesture,
  openAllSettingsForRetainedCompositor,
  resolveRetainedCompositorCadenceBudget,
  resolveRetainedCompositorTarget,
  waitForRetainedCompositorGestureIdle,
} from "./settings-retained-compositor-helpers";
import { waitForAnimationFrame } from "./settings-retained-frame-helpers";
import {
  analyzeHorizontalPlaceholderBands,
  type HorizontalPlaceholderBandStats,
  type Rect,
  type RetainedRowDebugEntry,
} from "./settings-retained-visual-analysis";

const SECTION_SURFACE_IDS = [
  "settings-section__shortcuts",
  "settings-section__gui",
  "settings-section__chatWindowing",
  "settings-section__sectionSizingPolicy",
].map((sectionId) => sectionId + SETTINGS_PARAM_CONTENT_SUFFIX);

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("retained section zoom does not show repeated horizontal placeholder bands", async ({
  page,
}, testInfo) => {
  await openAllSettingsForRetainedCompositor(page);

  const results: Array<{
    readonly clip: Rect;
    readonly frameName: string;
    readonly stats: HorizontalPlaceholderBandStats;
    readonly surfaceId: string;
  }> = [];
  for (const surfaceId of SECTION_SURFACE_IDS) {
    await centerRetainedCompositorSurface(page, surfaceId);
    const target = await resolveRetainedCompositorTarget(page, surfaceId);
    for (let frameIndex = 0; frameIndex < 6; frameIndex += 1) {
      await dispatchRetainedCompositorWheelBurst(page, {
        ctrlKey: true,
        deltaY: frameIndex % 2 === 0 ? -0.32 : 0.26,
        eventCount: 6,
        point: target.point,
      });
      await waitForAnimationFrame(page);
      const frameName = `${surfaceId.replaceAll(/[^a-zA-Z0-9_-]/g, "_")}-${frameIndex}.png`;
      const screenshot = await page.screenshot({
        clip: target.clip,
        path: testInfo.outputPath(frameName),
      });
      await attachScreenshot(testInfo, frameName, screenshot);
      results.push({
        clip: target.clip,
        frameName,
        stats: await analyzeHorizontalPlaceholderBands(page, { screenshot }),
        surfaceId,
      });
    }
  }

  const details = JSON.stringify(results, null, 2);
  expect(
    results.some((result) => result.stats.nonblankRatio > 0.01),
    details,
  ).toBe(true);
  expect(
    results.filter((result) => result.stats.highConfidencePlaceholder),
    details,
  ).toEqual([]);
});

test("retained text-like row click does not stripe unrelated section content", async ({
  page,
}, testInfo) => {
  const surfaceId =
    "settings-section__sectionSizingPolicy" + SETTINGS_PARAM_CONTENT_SUFFIX;
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page, surfaceId);
  const row = await resolveVisibleTextLikeRow(page, surfaceId);
  const target = await resolveRetainedCompositorTarget(page, surfaceId);
  const before = await captureAnalyzedFrame({
    clip: target.clip,
    name: "section-sizing-before-click.png",
    page,
    testInfo,
  });

  await page.mouse.click(row.controlClientPoint.x, row.controlClientPoint.y);
  await waitForAnimationFrame(page);
  const during = await captureAnalyzedFrame({
    clip: target.clip,
    name: "section-sizing-during-click.png",
    page,
    testInfo,
  });
  await page.waitForTimeout(120);
  const after = await captureAnalyzedFrame({
    clip: target.clip,
    name: "section-sizing-after-click.png",
    page,
    testInfo,
  });

  const details = JSON.stringify({ after, before, during, row }, null, 2);
  expect(before.stats.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(
    [before, during, after].filter(
      (sample) => sample.stats.highConfidencePlaceholder,
    ),
    details,
  ).toEqual([]);
});

test("rapid retained zoom plus text-like row click remains visually continuous", async ({
  page,
}, testInfo) => {
  const surfaceId =
    "settings-section__sectionSizingPolicy" + SETTINGS_PARAM_CONTENT_SUFFIX;
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(page, surfaceId);
  let row = await resolveVisibleTextLikeRow(page, surfaceId);
  await page.mouse.click(row.controlClientPoint.x, row.controlClientPoint.y);
  await waitForRetainedCompositorGestureIdle(page);
  const target = await resolveRetainedCompositorTarget(page, surfaceId);
  const controlCadence = await measureRetainedCompositorControlCadence(page);

  const gesture = await measureRetainedCompositorGesture(page, async () => {
    const eventSpacing = await dispatchRetainedCompositorWheelBurst(page, {
      ctrlKey: true,
      deltaY: -0.3,
      eventCount: 42,
      point: target.point,
    });
    row = await resolveVisibleTextLikeRow(page, surfaceId);
    await page.mouse.click(row.controlClientPoint.x, row.controlClientPoint.y);
    return eventSpacing;
  });
  await waitForAnimationFrame(page);
  const after = await captureAnalyzedFrame({
    clip: target.clip,
    name: "section-sizing-rapid-zoom-click.png",
    page,
    testInfo,
  });
  const budget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: gesture.eventSpacing,
  });
  const details = JSON.stringify({ after, budget, gesture, row }, null, 2);

  expect(after.stats.nonblankRatio, details).toBeGreaterThan(0.01);
  expect(after.stats.highConfidencePlaceholder, details).toBe(false);
  expectRetainedCompositorGestureWithinBudget({
    budget,
    details,
    gesture,
  });
});

async function captureAnalyzedFrame({
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
  await attachScreenshot(testInfo, name, screenshot);
  return {
    name,
    stats: await analyzeHorizontalPlaceholderBands(page, { screenshot }),
  };
}

async function resolveVisibleTextLikeRow(
  page: Page,
  surfaceId: string,
): Promise<
  RetainedRowDebugEntry & {
    readonly controlClientPoint: { readonly x: number; readonly y: number };
  }
> {
  const row = await page.evaluate((targetSurfaceId) => {
    const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
    return (
      rows.find(
        (
          candidate,
        ): candidate is RetainedRowDebugEntry & {
          readonly controlClientPoint: {
            readonly x: number;
            readonly y: number;
          };
        } =>
          candidate.surfaceId === targetSurfaceId &&
          candidate.controlKind === "text-like" &&
          candidate.controlClientPoint !== null &&
          candidate.controlClientRect !== null &&
          candidate.controlClientRect.width > 8 &&
          candidate.controlClientRect.height > 8 &&
          candidate.controlClientRect.x + candidate.controlClientRect.width >
            0 &&
          candidate.controlClientRect.y + candidate.controlClientRect.height >
            0 &&
          candidate.controlClientRect.x < window.innerWidth &&
          candidate.controlClientRect.y < window.innerHeight,
      ) ?? null
    );
  }, surfaceId);
  if (!row) {
    throw new Error(`Missing visible text-like row for ${surfaceId}.`);
  }
  return row;
}

async function attachScreenshot(
  testInfo: TestInfo,
  name: string,
  screenshot: Buffer,
): Promise<void> {
  await testInfo.attach(name, {
    body: screenshot,
    contentType: "image/png",
  });
}
