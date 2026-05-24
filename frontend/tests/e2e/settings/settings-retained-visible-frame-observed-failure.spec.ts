import { expect, test, type Page, type TestInfo } from "@playwright/test";

import {
  SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  captureRetainedCompositorEvidenceScreenshot,
  centerRetainedCompositorSurface,
  expectRetainedCompositorGestureWithinBudget,
  measureRetainedCompositorControlCadence,
  measureRetainedCompositorGesture,
  openAllSettingsForRetainedCompositor,
  readRetainedCompositorScrollSignature,
  resolveRetainedCompositorCadenceBudget,
  resolveRetainedCompositorTarget,
  runNativeRetainedCompositorWheelBurst,
  warmRetainedCompositorNativeWheelTarget,
  type RetainedCompositorGestureResult,
} from "./settings-retained-compositor-helpers";
import {
  analyzeHorizontalPlaceholderBands,
  analyzeRetainedLabelTextInkBounds,
  compareScreenshotSimilarity,
  type Rect,
} from "./settings-retained-visual-analysis";

const MIN_HEADER_NONBLANK_RATIO = 0.002;
const MIN_HEADER_TEXT_INK_PIXELS = 12;
const MIN_CONTENT_NONBLANK_RATIO = 0.02;
const MIN_SECTION_NONBLANK_RATIO = 0.015;
const MIN_SCROLL_CHANGED_PIXEL_RATIO = 0.004;
const MIN_SCROLL_MEAN_DELTA = 1;
const MIN_SCROLL_P95_DELTA = 4;
const MAX_FLICKER_BASELINE_DROP_RATIO = 0.65;
const STANDARD_REFRESH_P50_MAX_MS = 18.5;
const STANDARD_REFRESH_P95_MAX_MS = 24;
const STANDARD_REFRESH_MAX_FRAME_GAP_MS = 50;
const STANDARD_REFRESH_MAX_LONG_TASK_MS = 50;

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("All Settings first render keeps section header and retained content visible", async ({
  page,
}, testInfo) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const target = await resolveRetainedCompositorTarget(page);
  const headerClip = await resolveRetainedSectionHeaderClip(
    page,
    target.surfaceId,
  );
  const sectionClip = mergeScreenshotClips(headerClip, target.clip);

  const headerScreenshot = await captureRetainedCompositorEvidenceScreenshot(
    page,
    {
      clip: headerClip,
      path: testInfo.outputPath("first-render-section-header.png"),
    },
  );
  const contentScreenshot = await captureRetainedCompositorEvidenceScreenshot(
    page,
    {
      clip: target.clip,
      path: testInfo.outputPath("first-render-retained-content.png"),
    },
  );
  const sectionScreenshot = await captureRetainedCompositorEvidenceScreenshot(
    page,
    {
      clip: sectionClip,
      path: testInfo.outputPath("first-render-visible-section.png"),
    },
  );
  const headerInk = await analyzeRetainedLabelTextInkBounds(page, {
    clip: headerClip,
    screenshot: headerScreenshot,
    searchRect: headerClip,
  });
  const headerBands = await analyzeHorizontalPlaceholderBands(page, {
    screenshot: headerScreenshot,
  });
  const contentBands = await analyzeHorizontalPlaceholderBands(page, {
    screenshot: contentScreenshot,
  });
  const sectionBands = await analyzeHorizontalPlaceholderBands(page, {
    screenshot: sectionScreenshot,
  });
  const diagnostics = await attachVisibleFrameDiagnostics(
    page,
    testInfo,
    "first-render-visible-frame-diagnostics.json",
  );
  const details = JSON.stringify(
    {
      contentBands,
      diagnostics,
      headerBands,
      headerClip,
      headerInk,
      sectionBands,
      sectionClip,
      target,
    },
    null,
    2,
  );

  expect(headerInk, details).not.toBeNull();
  expect(headerInk?.pixelCount ?? 0, details).toBeGreaterThan(
    MIN_HEADER_TEXT_INK_PIXELS,
  );
  expect(headerBands.nonblankRatio, details).toBeGreaterThan(
    MIN_HEADER_NONBLANK_RATIO,
  );
  expect(contentBands.nonblankRatio, details).toBeGreaterThan(
    MIN_CONTENT_NONBLANK_RATIO,
  );
  expect(sectionBands.nonblankRatio, details).toBeGreaterThan(
    MIN_SECTION_NONBLANK_RATIO,
  );
  expect(contentBands.highConfidencePlaceholder, details).toBe(false);
});

test("retained section scroll moves visible pixels without blanking header or content", async ({
  page,
}, testInfo) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const target = await resolveRetainedCompositorTarget(page);
  const headerClip = await resolveRetainedSectionHeaderClip(
    page,
    target.surfaceId,
  );
  await warmRetainedCompositorNativeWheelTarget(page, target.point);
  const beforeScrollSignature = await readRetainedCompositorScrollSignature(
    page,
    target.surfaceId,
  );
  const before = await captureRetainedCompositorEvidenceScreenshot(page, {
    clip: target.clip,
    path: testInfo.outputPath("scroll-before-content.png"),
  });
  const headerBefore = await captureRetainedCompositorEvidenceScreenshot(page, {
    clip: headerClip,
    path: testInfo.outputPath("scroll-before-header.png"),
  });

  await runNativeRetainedCompositorWheelBurst(page, {
    deltaY: 46,
    eventCount: 4,
    point: target.point,
  });
  await page.waitForTimeout(60);
  const around60 = await captureRetainedCompositorEvidenceScreenshot(page, {
    clip: target.clip,
    path: testInfo.outputPath("scroll-around-60ms-content.png"),
  });
  const headerAround60 = await captureRetainedCompositorEvidenceScreenshot(
    page,
    {
      clip: headerClip,
      path: testInfo.outputPath("scroll-around-60ms-header.png"),
    },
  );
  await page.waitForTimeout(60);
  const around120 = await captureRetainedCompositorEvidenceScreenshot(page, {
    clip: target.clip,
    path: testInfo.outputPath("scroll-around-120ms-content.png"),
  });
  const headerAround120 = await captureRetainedCompositorEvidenceScreenshot(
    page,
    {
      clip: headerClip,
      path: testInfo.outputPath("scroll-around-120ms-header.png"),
    },
  );
  await page.waitForTimeout(180);
  const final = await captureRetainedCompositorEvidenceScreenshot(page, {
    clip: target.clip,
    path: testInfo.outputPath("scroll-final-content.png"),
  });
  const headerFinal = await captureRetainedCompositorEvidenceScreenshot(page, {
    clip: headerClip,
    path: testInfo.outputPath("scroll-final-header.png"),
  });
  const afterScrollSignature = await readRetainedCompositorScrollSignature(
    page,
    target.surfaceId,
  );

  const around60Similarity = await compareScreenshotSimilarity(page, {
    actual: around60,
    expected: before,
  });
  const around120Similarity = await compareScreenshotSimilarity(page, {
    actual: around120,
    expected: before,
  });
  const finalSimilarity = await compareScreenshotSimilarity(page, {
    actual: final,
    expected: before,
  });
  const headerBaseline = await analyzeHorizontalPlaceholderBands(page, {
    screenshot: headerBefore,
  });
  const headerDuring = await analyzeHorizontalPlaceholderBands(page, {
    screenshot: headerAround60,
  });
  const headerAt120 = await analyzeHorizontalPlaceholderBands(page, {
    screenshot: headerAround120,
  });
  const headerSettled = await analyzeHorizontalPlaceholderBands(page, {
    screenshot: headerFinal,
  });
  const contentDuring = await analyzeHorizontalPlaceholderBands(page, {
    screenshot: around120,
  });
  const contentSettled = await analyzeHorizontalPlaceholderBands(page, {
    screenshot: final,
  });
  const diagnostics = await attachVisibleFrameDiagnostics(
    page,
    testInfo,
    "scroll-visible-frame-diagnostics.json",
  );
  const details = JSON.stringify(
    {
      around60Similarity,
      around120Similarity,
      afterScrollSignature,
      beforeScrollSignature,
      contentDuring,
      contentSettled,
      diagnostics,
      finalSimilarity,
      headerAt120,
      headerBaseline,
      headerDuring,
      headerSettled,
      target,
    },
    null,
    2,
  );

  expect(
    [around60Similarity, around120Similarity, finalSimilarity].some(
      (sample) =>
        sample.changedPixelRatio >= MIN_SCROLL_CHANGED_PIXEL_RATIO ||
        sample.meanDelta >= MIN_SCROLL_MEAN_DELTA ||
        sample.p95Delta >= MIN_SCROLL_P95_DELTA,
    ),
    details,
  ).toBe(true);
  expect(afterScrollSignature, details).not.toEqual(beforeScrollSignature);
  expect(headerDuring.nonblankRatio, details).toBeGreaterThan(
    MIN_HEADER_NONBLANK_RATIO,
  );
  expect(headerAt120.nonblankRatio, details).toBeGreaterThan(
    MIN_HEADER_NONBLANK_RATIO,
  );
  expect(headerSettled.nonblankRatio, details).toBeGreaterThan(
    MIN_HEADER_NONBLANK_RATIO,
  );
  expect(contentDuring.nonblankRatio, details).toBeGreaterThan(
    MIN_CONTENT_NONBLANK_RATIO,
  );
  expect(contentSettled.nonblankRatio, details).toBeGreaterThan(
    MIN_CONTENT_NONBLANK_RATIO,
  );
  expect(contentDuring.highConfidencePlaceholder, details).toBe(false);
  expect(contentSettled.highConfidencePlaceholder, details).toBe(false);
});

test("pan, zoom, and retained scroll keep cadence and avoid content disappearance", async ({
  page,
}, testInfo) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const target = await resolveRetainedCompositorTarget(page);
  const headerClip = await resolveRetainedSectionHeaderClip(
    page,
    target.surfaceId,
  );
  const sectionClip = mergeScreenshotClips(headerClip, target.clip);
  await warmRetainedCompositorNativeWheelTarget(page, target.point);
  const controlCadence = await measureRetainedCompositorControlCadence(page);
  const baseline = await captureRetainedCompositorEvidenceScreenshot(page, {
    clip: sectionClip,
    path: testInfo.outputPath("motion-baseline-section.png"),
  });
  const baselineBands = await analyzeHorizontalPlaceholderBands(page, {
    screenshot: baseline,
  });
  const motionSamples: Buffer[] = [];
  const gesture = await measureRetainedCompositorGesture(
    page,
    async () => {
      const eventSpacing = [
        ...(await runNativeRetainedCompositorWheelBurst(page, {
          deltaX: 26,
          deltaY: 18,
          eventCount: 4,
          point: target.point,
        })),
        ...(await runNativeRetainedCompositorWheelBurst(page, {
          ctrlKey: true,
          deltaY: -0.34,
          eventCount: 4,
          point: target.point,
        })),
        ...(await runNativeRetainedCompositorWheelBurst(page, {
          deltaY: 38,
          eventCount: 4,
          point: target.point,
        })),
      ];
      motionSamples.push(
        await captureRetainedCompositorEvidenceScreenshot(page, {
          clip: sectionClip,
          path: testInfo.outputPath("motion-sample-immediate.png"),
        }),
      );
      await page.waitForTimeout(60);
      motionSamples.push(
        await captureRetainedCompositorEvidenceScreenshot(page, {
          clip: sectionClip,
          path: testInfo.outputPath("motion-sample-60ms.png"),
        }),
      );
      await page.waitForTimeout(60);
      motionSamples.push(
        await captureRetainedCompositorEvidenceScreenshot(page, {
          clip: sectionClip,
          path: testInfo.outputPath("motion-sample-120ms.png"),
        }),
      );
      return eventSpacing;
    },
    { settleMs: 180 },
  );
  motionSamples.push(
    await captureRetainedCompositorEvidenceScreenshot(page, {
      clip: sectionClip,
      path: testInfo.outputPath("motion-sample-final.png"),
    }),
  );
  const sampleBands = await Promise.all(
    motionSamples.map((screenshot) =>
      analyzeHorizontalPlaceholderBands(page, { screenshot }),
    ),
  );
  const budget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: gesture.eventSpacing,
  });
  const diagnostics = await attachVisibleFrameDiagnostics(
    page,
    testInfo,
    "motion-visible-frame-diagnostics.json",
  );
  const details = JSON.stringify(
    {
      baselineBands,
      budget,
      controlCadence,
      diagnostics,
      gesture,
      sectionClip,
      sampleBands,
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
  expectStandardRefreshGestureWithinFixedBudget({
    controlCadence,
    details,
    gesture,
  });
  expect(baselineBands.nonblankRatio, details).toBeGreaterThan(
    MIN_SECTION_NONBLANK_RATIO,
  );
  for (const bands of sampleBands) {
    expect(bands.highConfidencePlaceholder, details).toBe(false);
    expect(bands.nonblankRatio, details).toBeGreaterThan(
      Math.max(
        MIN_SECTION_NONBLANK_RATIO,
        baselineBands.nonblankRatio * MAX_FLICKER_BASELINE_DROP_RATIO,
      ),
    );
  }
});

test("consecutive interaction frames do not flicker between present and absent content", async ({
  page,
}, testInfo) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const target = await resolveRetainedCompositorTarget(page);
  const headerClip = await resolveRetainedSectionHeaderClip(
    page,
    target.surfaceId,
  );
  const sectionClip = mergeScreenshotClips(headerClip, target.clip);
  await warmRetainedCompositorNativeWheelTarget(page, target.point);
  const baseline = await captureRetainedCompositorEvidenceScreenshot(page, {
    clip: sectionClip,
    path: testInfo.outputPath("flicker-baseline-section.png"),
  });
  const baselineBands = await analyzeHorizontalPlaceholderBands(page, {
    screenshot: baseline,
  });

  await runNativeRetainedCompositorWheelBurst(page, {
    deltaX: 20,
    deltaY: 14,
    eventCount: 3,
    point: target.point,
  });
  await runNativeRetainedCompositorWheelBurst(page, {
    ctrlKey: true,
    deltaY: -0.28,
    eventCount: 3,
    point: target.point,
  });
  await runNativeRetainedCompositorWheelBurst(page, {
    deltaY: 34,
    eventCount: 3,
    point: target.point,
  });
  const frameScreenshots = await captureConsecutiveFrameScreenshots(page, {
    clip: sectionClip,
    count: 6,
    outputPrefix: "flicker-frame",
    testInfo,
  });
  const frameBands = await Promise.all(
    frameScreenshots.map((screenshot) =>
      analyzeHorizontalPlaceholderBands(page, { screenshot }),
    ),
  );
  const diagnostics = await attachVisibleFrameDiagnostics(
    page,
    testInfo,
    "flicker-visible-frame-diagnostics.json",
  );
  const presenceFloor = Math.max(
    MIN_SECTION_NONBLANK_RATIO,
    baselineBands.nonblankRatio * MAX_FLICKER_BASELINE_DROP_RATIO,
  );
  const presence = frameBands.map(
    (bands) =>
      !bands.highConfidencePlaceholder && bands.nonblankRatio >= presenceFloor,
  );
  const details = JSON.stringify(
    { baselineBands, diagnostics, frameBands, presence, sectionClip, target },
    null,
    2,
  );

  expect(presence.every(Boolean), details).toBe(true);
  expect(hasPresenceOscillation(presence), details).toBe(false);
});

test("latest Chrome recording parity sequence keeps pixels, diagnostics, and cadence coherent", async ({
  page,
}, testInfo) => {
  await openAllSettingsForRetainedCompositor(page);
  await centerRetainedCompositorSurface(
    page,
    SETTINGS_RETAINED_COMPOSITOR_SURFACE_ID,
  );
  const target = await resolveRetainedCompositorTarget(page);
  const headerClip = await resolveRetainedSectionHeaderClip(
    page,
    target.surfaceId,
  );
  const sectionClip = mergeScreenshotClips(headerClip, target.clip);
  await warmRetainedCompositorNativeWheelTarget(page, target.point);
  const controlCadence = await measureRetainedCompositorControlCadence(page);
  const screenshots: Buffer[] = [];
  const gesture = await measureRetainedCompositorGesture(
    page,
    async () => {
      const eventSpacing = [
        ...(await runNativeRetainedCompositorWheelBurst(page, {
          deltaX: 30,
          deltaY: 20,
          eventCount: 5,
          point: target.point,
        })),
        ...(await runNativeRetainedCompositorWheelBurst(page, {
          deltaX: -18,
          deltaY: 16,
          eventCount: 3,
          point: target.point,
        })),
        ...(await runNativeRetainedCompositorWheelBurst(page, {
          ctrlKey: true,
          deltaY: -0.42,
          eventCount: 5,
          point: target.point,
        })),
        ...(await runNativeRetainedCompositorWheelBurst(page, {
          deltaY: 42,
          eventCount: 5,
          point: target.point,
        })),
      ];
      screenshots.push(
        await captureRetainedCompositorEvidenceScreenshot(page, {
          clip: sectionClip,
          path: testInfo.outputPath("latest-parity-immediate.png"),
        }),
      );
      await page.waitForTimeout(60);
      screenshots.push(
        await captureRetainedCompositorEvidenceScreenshot(page, {
          clip: sectionClip,
          path: testInfo.outputPath("latest-parity-60ms.png"),
        }),
      );
      await page.waitForTimeout(60);
      screenshots.push(
        await captureRetainedCompositorEvidenceScreenshot(page, {
          clip: sectionClip,
          path: testInfo.outputPath("latest-parity-120ms.png"),
        }),
      );
      return eventSpacing;
    },
    { settleMs: 220 },
  );
  screenshots.push(
    await captureRetainedCompositorEvidenceScreenshot(page, {
      clip: sectionClip,
      path: testInfo.outputPath("latest-parity-final.png"),
    }),
  );
  const sampleBands = await Promise.all(
    screenshots.map((screenshot) =>
      analyzeHorizontalPlaceholderBands(page, { screenshot }),
    ),
  );
  const budget = resolveRetainedCompositorCadenceBudget({
    controlCadence,
    eventSpacing: gesture.eventSpacing,
  });
  const diagnostics = await attachVisibleFrameDiagnostics(
    page,
    testInfo,
    "latest-parity-visible-frame-diagnostics.json",
  );
  await testInfo.attach("latest-parity-performance.json", {
    body: JSON.stringify({ budget, controlCadence, gesture }, null, 2),
    contentType: "application/json",
  });
  const details = JSON.stringify(
    {
      budget,
      controlCadence,
      diagnostics,
      gesture,
      sampleBands,
      sectionClip,
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
  expectStandardRefreshGestureWithinFixedBudget({
    controlCadence,
    details,
    gesture,
  });
  for (const bands of sampleBands) {
    expect(bands.highConfidencePlaceholder, details).toBe(false);
    expect(bands.nonblankRatio, details).toBeGreaterThan(
      MIN_SECTION_NONBLANK_RATIO,
    );
  }
  expect(diagnostics.requiredActorsByFamily, details).not.toBeNull();
  expect(diagnostics.readyActorsByFamily, details).not.toBeNull();
  expect(diagnostics.compatibleActorsByFamily, details).not.toBeNull();
  expect(diagnostics.missingActorsByFamily, details).not.toBeNull();
  expect(diagnostics.scrollHorizonCoverage, details).not.toBeNull();
  expect(diagnostics.visibleOutcome, details).not.toBe("blocked");
});

function mergeScreenshotClips(first: Rect, second: Rect): Rect {
  const left = Math.min(first.x, second.x);
  const top = Math.min(first.y, second.y);
  const right = Math.max(first.x + first.width, second.x + second.width);
  const bottom = Math.max(first.y + first.height, second.y + second.height);
  return {
    height: Math.max(1, bottom - top),
    width: Math.max(1, right - left),
    x: left,
    y: top,
  };
}

function expectStandardRefreshGestureWithinFixedBudget({
  controlCadence,
  details,
  gesture,
}: {
  readonly controlCadence: {
    readonly p50Ms: number;
    readonly p95Ms: number;
  };
  readonly details: string;
  readonly gesture: RetainedCompositorGestureResult;
}) {
  if (
    controlCadence.p50Ms > STANDARD_REFRESH_P50_MAX_MS ||
    controlCadence.p95Ms > STANDARD_REFRESH_P95_MAX_MS
  ) {
    return;
  }
  expect(gesture.frame.maxMs, details).toBeLessThanOrEqual(
    STANDARD_REFRESH_MAX_FRAME_GAP_MS,
  );
  expect(gesture.longTasks.maxDurationMs, details).toBeLessThanOrEqual(
    STANDARD_REFRESH_MAX_LONG_TASK_MS,
  );
}

async function resolveRetainedSectionHeaderClip(
  page: Page,
  surfaceId: string,
): Promise<Rect> {
  return await page.evaluate((targetSurfaceId) => {
    const rows =
      window
        .__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.()
        .filter(
          (row) =>
            row.surfaceId === targetSurfaceId && isVisibleRect(row.clientRect),
        ) ?? [];
    if (rows.length === 0) {
      throw new Error(`Missing visible retained rows for ${targetSurfaceId}.`);
    }
    const left = Math.max(0, Math.min(...rows.map((row) => row.clientRect.x)));
    const right = Math.min(
      window.innerWidth,
      Math.max(...rows.map((row) => row.clientRect.x + row.clientRect.width)),
    );
    const top = Math.min(...rows.map((row) => row.clientRect.y));
    const headerHeight = 34;
    const y = Math.max(0, top - headerHeight - 4);
    return {
      height: Math.max(1, Math.min(headerHeight, window.innerHeight - y)),
      width: Math.max(1, Math.min(right - left, window.innerWidth - left)),
      x: left,
      y,
    };

    function isVisibleRect(rect: Rect): boolean {
      return (
        rect.width > 20 &&
        rect.height > 8 &&
        rect.x + rect.width > 0 &&
        rect.y + rect.height > 0 &&
        rect.x < window.innerWidth &&
        rect.y < window.innerHeight
      );
    }
  }, surfaceId);
}

async function captureConsecutiveFrameScreenshots(
  page: Page,
  {
    clip,
    count,
    outputPrefix,
    testInfo,
  }: {
    readonly clip: Rect;
    readonly count: number;
    readonly outputPrefix: string;
    readonly testInfo: TestInfo;
  },
): Promise<Buffer[]> {
  const screenshots: Buffer[] = [];
  for (let index = 0; index < count; index += 1) {
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(resolve)),
    );
    screenshots.push(
      await captureRetainedCompositorEvidenceScreenshot(page, {
        clip,
        path: testInfo.outputPath(`${outputPrefix}-${index}.png`),
      }),
    );
  }
  return screenshots;
}

function hasPresenceOscillation(presence: readonly boolean[]): boolean {
  let transitions = 0;
  for (let index = 1; index < presence.length; index += 1) {
    if (presence[index] !== presence[index - 1]) {
      transitions += 1;
    }
  }
  return transitions > 1;
}

async function attachVisibleFrameDiagnostics(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<ObservedVisibleFrameDiagnostics> {
  const diagnostics = await readVisibleFrameDiagnostics(page);
  await testInfo.attach(name, {
    body: JSON.stringify(diagnostics, null, 2),
    contentType: "application/json",
  });
  return diagnostics;
}

async function readVisibleFrameDiagnostics(
  page: Page,
): Promise<ObservedVisibleFrameDiagnostics> {
  return await page.evaluate(() => {
    const debugSnapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.() ?? null;
    const committedSurfaceFrame = debugSnapshot?.committedSurfaceFrame ?? null;
    const blockedEvents =
      (
        window as typeof window & {
          readonly __SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__?: readonly {
            readonly actorManifest?: ObservedVisibleFrameActorManifest | null;
            readonly blockedReasons?: readonly unknown[];
          }[];
        }
      ).__SETTA_GPU_FLOW_BLOCKED_VISIBLE_PUBLICATION_EVENTS__ ?? [];
    const lastBlockedEvent = blockedEvents.at(-1) ?? null;
    const actorManifest =
      (committedSurfaceFrame?.actorManifest as
        | ObservedVisibleFrameActorManifest
        | null
        | undefined) ??
      lastBlockedEvent?.actorManifest ??
      null;
    return {
      blockedDebt: actorManifest?.blockedDebt ?? null,
      blockedEventCount: blockedEvents.length,
      blockedReasons: lastBlockedEvent?.blockedReasons ?? [],
      compatibleActorsByFamily: actorManifest?.compatibleActorsByFamily ?? null,
      missingActorsByFamily: actorManifest?.missingActorsByFamily ?? null,
      presentationId: committedSurfaceFrame?.presentationId ?? null,
      readyActorsByFamily: actorManifest?.readyActorsByFamily ?? null,
      requiredActorsByFamily: actorManifest?.requiredActorsByFamily ?? null,
      scrollHorizonCoverage: actorManifest?.scrollHorizonCoverage ?? null,
      visibleOutcome: actorManifest?.visibleOutcome ?? null,
    };
  });
}

type ObservedVisibleFrameActorManifest = {
  readonly blockedDebt: Record<string, boolean> | null;
  readonly compatibleActorsByFamily: Record<string, number>;
  readonly missingActorsByFamily: Record<string, number>;
  readonly readyActorsByFamily: Record<string, number>;
  readonly requiredActorsByFamily: Record<string, number>;
  readonly scrollHorizonCoverage: unknown;
  readonly visibleOutcome: string | null;
};

type ObservedVisibleFrameDiagnostics = {
  readonly blockedDebt: Record<string, boolean> | null;
  readonly blockedEventCount: number;
  readonly blockedReasons: readonly unknown[];
  readonly compatibleActorsByFamily: Record<string, number> | null;
  readonly missingActorsByFamily: Record<string, number> | null;
  readonly presentationId: string | null;
  readonly readyActorsByFamily: Record<string, number> | null;
  readonly requiredActorsByFamily: Record<string, number> | null;
  readonly scrollHorizonCoverage: unknown;
  readonly visibleOutcome: string | null;
};
