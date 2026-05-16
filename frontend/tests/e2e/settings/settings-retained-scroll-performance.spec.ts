import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  ensureGpuFlowPerformanceQueueWrappers,
  installGpuFlowPerformanceProbe,
  readGpuFlowPerformanceSnapshot,
  resetGpuFlowPerformanceProbe,
} from "../gpuFlowPerformanceProbe";
import { ensureAppReady } from "../helpers";
import { measurePageRafCadence } from "./settings-retained-frame-helpers";
import {
  formatScrollPerformanceDetails,
  resolveCappedScrollP95FrameBudget,
  type NativeWheelBurstResult,
  type RetainedScrollbarVisualStats,
  type RetainedScrollSignature,
  type RetainedVisualStats,
  type ScrollFrameSample,
  type ScrollTarget,
} from "./settings-retained-scroll-performance-helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const SETTINGS_PARAM_CONTENT_SUFFIX = ":param-content:unpinned";
const SETTINGS_SCROLL_TEST_SURFACE_ID = `settings-section__shortcuts${SETTINGS_PARAM_CONTENT_SUFFIX}`;
const RETAINED_SCROLLBAR_TEXTURE_SUFFIX = ":scrollbar";
const SCROLL_P95_FRAME_BUDGET_MS = 20;
const CAPPED_SCROLL_P95_FRAME_BUDGET_SLACK_MS = 10;
const CAPPED_SCROLL_GESTURE_P95_FRAME_BUDGET_SLACK_MS = 4;
// Native wheel dispatch through Playwright/CDP can produce isolated scheduling
// gaps in capped headless browsers; keep p95 strict and cap only the max sample.
const SCROLL_MAX_FRAME_BUDGET_MS = 110;

test("all-settings retained section wheel scrolling does not refill the texture backlog", async ({
  page,
}, testInfo) => {
  await installGpuFlowPerformanceProbe(page);
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allSettingsTab = page.getByRole("button", {
    exact: true,
    name: "All Settings",
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();
  await page.waitForFunction(
    () => document.querySelectorAll(".setta-gpu-flow__node").length > 30,
  );
  await expect
    .poll(() => readRetainedRowCount(page), { timeout: 10_000 })
    .toBeGreaterThan(50);
  await centerSettingsRetainedSurfaceForScrollTest(
    page,
    SETTINGS_SCROLL_TEST_SURFACE_ID,
  );
  await expect
    .poll(
      () =>
        readRetainedSurfaceVisibleCssArea(
          page,
          SETTINGS_SCROLL_TEST_SURFACE_ID,
        ),
      { timeout: 5_000 },
    )
    .toBeGreaterThan(60_000);

  expect(await ensureGpuFlowPerformanceQueueWrappers(page)).toBe(true);
  await waitForGpuTextureUploadQuiet(page);

  const target = await resolveScrollableSettingsRetainedTarget(page);
  const beforeVisualStats = await waitForRetainedScrollTargetVisualStats({
    page,
    phase: "before-wheel",
    target,
    testInfo,
  });
  await resetGpuFlowPerformanceProbe(page);
  const scrollbarVisualStats = await captureRetainedScrollbarWheelSequence({
    page,
    target,
    testInfo,
  });
  const visualSequenceSnapshot = await readGpuFlowPerformanceSnapshot(page);
  const visualScrollbarUploadCount = visualSequenceSnapshot.queueCalls.filter(
    (call) =>
      call.method === "copyElementImageToTexture" &&
      Boolean(call.sourceNodeId) &&
      call.sourceNodeId.endsWith(RETAINED_SCROLLBAR_TEXTURE_SUFFIX),
  ).length;
  const retainedScrollbarSourceCount = await page
    .locator(
      `[data-gpu-flow-source-id$="${RETAINED_SCROLLBAR_TEXTURE_SUFFIX}"]`,
    )
    .count();
  await restoreRetainedScrollbarWheelSequenceScrollPosition({ page, target });
  await drainPendingGpuTextureUploads(page);
  await resetGpuFlowPerformanceProbe(page);
  const beforeScrollSignature = await readRetainedSurfaceScrollSignature(
    page,
    target.surfaceId,
  );
  await page.mouse.move(target.point.x, target.point.y);
  const beforeScrollRafCadence = await measurePageRafCadence(page);
  await startScrollFrameSampler(page);

  const scrollGesture = await runNativeWheelBurst(page, {
    deltaY: 44,
    eventCount: 12,
    point: target.point,
  });
  await page.waitForTimeout(750);

  const frameSample = await stopScrollFrameSampler(page);
  const afterScrollSignature = await readRetainedSurfaceScrollSignature(
    page,
    target.surfaceId,
  );
  const afterVisualStats = await captureRetainedScrollTargetVisualStats({
    page,
    phase: "after-wheel",
    target,
    testInfo,
  });
  const snapshot = await readGpuFlowPerformanceSnapshot(page);
  const retainedUploadCalls = snapshot.queueCalls.filter(
    (call) =>
      call.method === "copyElementImageToTexture" &&
      Boolean(call.sourceNodeId) &&
      call.sourceNodeId.endsWith(SETTINGS_PARAM_CONTENT_SUFFIX),
  );
  const targetRetainedUploadCalls = retainedUploadCalls.filter(
    (call) => call.sourceNodeId === target.surfaceId,
  );
  const scrollbarUploadCalls = snapshot.queueCalls.filter(
    (call) =>
      call.method === "copyElementImageToTexture" &&
      Boolean(call.sourceNodeId) &&
      call.sourceNodeId.endsWith(RETAINED_SCROLLBAR_TEXTURE_SUFFIX),
  );
  const retainedUploadSurfaceIds = uniqueStrings(
    retainedUploadCalls
      .map((call) => call.sourceNodeId)
      .filter((surfaceId): surfaceId is string => Boolean(surfaceId)),
  );
  const unexpectedRetainedUploads = retainedUploadSurfaceIds.filter(
    (surfaceId) => surfaceId !== target.surfaceId,
  );
  const fullTargetRetainedUploads = targetRetainedUploadCalls.filter(
    (call) => call.sourceWidth === undefined || call.sourceHeight === undefined,
  );
  const largestTargetUploadCssArea = Math.max(
    0,
    ...targetRetainedUploadCalls.map(
      (call) => (call.sourceWidth ?? 0) * (call.sourceHeight ?? 0),
    ),
  );
  const maxDirtyBacklog = Math.max(
    0,
    ...snapshot.nodeLayerFrames.map((frame) => frame.remainingDirtyNodeCount),
  );
  const worstFrameIntervalMs = frameSample.worstIntervalMs;
  const scrollP95FrameBudgetMs = resolveCappedScrollP95FrameBudget({
    baseBudgetMs: SCROLL_P95_FRAME_BUDGET_MS,
    cadenceSlackMs: CAPPED_SCROLL_P95_FRAME_BUDGET_SLACK_MS,
    gesture: scrollGesture,
    gestureSlackMs: CAPPED_SCROLL_GESTURE_P95_FRAME_BUDGET_SLACK_MS,
    rafCadence: beforeScrollRafCadence,
  });
  const failureDetails = formatScrollPerformanceDetails({
    budgets: {
      scrollMaxFrameBudgetMs: SCROLL_MAX_FRAME_BUDGET_MS,
      scrollP95FrameBudgetMs,
    },
    frameSample,
    fullTargetRetainedUploadCount: fullTargetRetainedUploads.length,
    largestTargetUploadCssArea,
    maxDirtyBacklog,
    retainedUploadSurfaceIds,
    retainedScrollbarSourceCount,
    scrollbarUploadCount: scrollbarUploadCalls.length,
    scrollbarVisualStats,
    scrollSignatures: {
      after: afterScrollSignature,
      before: beforeScrollSignature,
    },
    snapshot,
    target: {
      screenshotClip: target.screenshotClip,
      surfaceId: target.surfaceId,
      visibleCssArea: target.visibleCssArea,
    },
    rafCadence: { beforeScroll: beforeScrollRafCadence },
    scrollGesture,
    targetSurfaceId: target.surfaceId,
    unexpectedRetainedUploads,
    visualStats: { after: afterVisualStats, before: beforeVisualStats },
    visualScrollbarUploadCount,
    worstFrameIntervalMs,
  });

  expect(frameSample.frameCount, failureDetails).toBeGreaterThan(8);
  expect(frameSample.p95IntervalMs, failureDetails).toBeLessThanOrEqual(
    scrollP95FrameBudgetMs,
  );
  expect(frameSample.slowFrameRatio, failureDetails).toBeLessThanOrEqual(0.08);
  expect(beforeVisualStats.brightPixelRatio, failureDetails).toBeGreaterThan(
    0.01,
  );
  expect(afterVisualStats.brightPixelRatio, failureDetails).toBeGreaterThan(
    Math.max(0.01, beforeVisualStats.brightPixelRatio * 0.55),
  );
  expect(beforeVisualStats.textBandCount, failureDetails).toBeGreaterThan(3);
  expect(afterVisualStats.textBandCount, failureDetails).toBeGreaterThan(
    Math.max(3, Math.floor(beforeVisualStats.textBandCount * 0.55)),
  );
  expect(beforeVisualStats.textBandCount, failureDetails).toBeLessThanOrEqual(
    maxRetainedVisualTextBandCount(beforeVisualStats),
  );
  expect(afterVisualStats.textBandCount, failureDetails).toBeLessThanOrEqual(
    maxRetainedVisualTextBandCount(afterVisualStats),
  );
  expect(scrollbarVisualStats.length, failureDetails).toBeGreaterThanOrEqual(4);
  expect(retainedScrollbarSourceCount, failureDetails).toBe(0);
  expect(visualScrollbarUploadCount, failureDetails).toBe(0);
  expect(scrollbarUploadCalls, failureDetails).toEqual([]);
  expect(
    scrollbarVisualStats.every((stats) => stats.topY !== null),
    failureDetails,
  ).toBe(true);
  expect(
    Math.max(...scrollbarVisualStats.map((stats) => stats.topY ?? Number.NaN)) -
      Math.min(
        ...scrollbarVisualStats.map((stats) => stats.topY ?? Number.NaN),
      ),
    failureDetails,
  ).toBeLessThanOrEqual(4);
  expect(
    scrollbarVisualStats.every(
      (stats) =>
        stats.bottomY !== null &&
        stats.detectedPixelCount >= stats.height * 0.72 &&
        stats.bottomY >= stats.height - 8 &&
        stats.longestRunHeight >= stats.height - 16,
    ),
    failureDetails,
  ).toBe(true);
  expect(
    scrollbarVisualStats.every((stats) => stats.thumbTopY !== null),
    failureDetails,
  ).toBe(true);
  expect(
    Math.max(
      ...scrollbarVisualStats.map((stats) => stats.thumbTopY ?? Number.NaN),
    ) -
      Math.min(
        ...scrollbarVisualStats.map((stats) => stats.thumbTopY ?? Number.NaN),
      ),
    failureDetails,
  ).toBeGreaterThanOrEqual(2);
  expect(afterScrollSignature, failureDetails).not.toEqual(
    beforeScrollSignature,
  );
  expect(maxDirtyBacklog, failureDetails).toBeLessThanOrEqual(3);
  expect(unexpectedRetainedUploads, failureDetails).toEqual([]);
  expect(targetRetainedUploadCalls.length, failureDetails).toBeLessThanOrEqual(
    1,
  );
  expect(fullTargetRetainedUploads.length, failureDetails).toBeLessThanOrEqual(
    1,
  );
  expect(largestTargetUploadCssArea, failureDetails).toBeLessThan(
    target.visibleCssArea * 0.25,
  );
  expect(worstFrameIntervalMs, failureDetails).toBeLessThanOrEqual(
    SCROLL_MAX_FRAME_BUDGET_MS,
  );
});

async function waitForGpuTextureUploadQuiet(page: Page): Promise<void> {
  let previousUploadCount: number | null = null;
  await expect
    .poll(
      async () => {
        const snapshot = await readGpuFlowPerformanceSnapshot(page);
        const currentUploadCount = snapshot.queueCalls.filter(
          (call) => call.method === "copyElementImageToTexture",
        ).length;
        const stable = currentUploadCount === previousUploadCount;
        previousUploadCount = currentUploadCount;
        return stable;
      },
      { intervals: [200, 200, 200, 200, 200], timeout: 2_500 },
    )
    .toBe(true);
}

async function drainPendingGpuTextureUploads(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await waitForGpuTextureUploadQuiet(page);
    await resetGpuFlowPerformanceProbe(page);
    await page.waitForTimeout(120);
    const snapshot = await readGpuFlowPerformanceSnapshot(page);
    const uploadCount = snapshot.queueCalls.filter(
      (call) => call.method === "copyElementImageToTexture",
    ).length;
    if (uploadCount === 0) {
      return;
    }
  }
  await waitForGpuTextureUploadQuiet(page);
}

async function readRetainedRowCount(page: Page): Promise<number> {
  return await page.evaluate(
    () => window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0,
  );
}

async function centerSettingsRetainedSurfaceForScrollTest(
  page: Page,
  surfaceId: string,
): Promise<void> {
  await page.evaluate(async (targetSurfaceId) => {
    type RetainedRow = {
      readonly canvasCssSize: {
        readonly height: number;
        readonly width: number;
      };
      readonly clientRect: {
        readonly height: number;
        readonly width: number;
        readonly x: number;
        readonly y: number;
      };
      readonly surfaceId: string;
    };
    const pane = document.querySelector<HTMLElement>(".setta-gpu-flow__pane");
    const snapshot = window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.();
    const transform = snapshot?.viewport.transform;
    const rows = (
      window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
    ).filter(
      (row): row is RetainedRow =>
        (row as RetainedRow).surfaceId === targetSurfaceId,
    );
    const firstRow = rows[0];
    if (!pane || !transform || !firstRow) {
      throw new Error(
        `Missing retained scroll setup data for ${targetSurfaceId}.`,
      );
    }
    const paneRect = pane.getBoundingClientRect();
    const minClientX = Math.min(...rows.map((row) => row.clientRect.x));
    const minClientY = Math.min(...rows.map((row) => row.clientRect.y));
    const maxClientY = Math.max(
      ...rows.map((row) => row.clientRect.y + row.clientRect.height),
    );
    const flowLeft =
      (minClientX - paneRect.left - transform.x) / transform.zoom;
    const flowTop = (minClientY - paneRect.top - transform.y) / transform.zoom;
    const visibleFlowHeight = Math.max(
      firstRow.canvasCssSize.height,
      (maxClientY - minClientY) / transform.zoom,
    );
    const flowCenter = {
      x: flowLeft + firstRow.canvasCssSize.width / 2,
      y: flowTop + visibleFlowHeight / 2,
    };
    const zoom = 1;
    const { gpuFlowViewportStore } = await import(
      "/src/gpuFlow/viewportStore.ts"
    );
    const viewportStore = gpuFlowViewportStore.getState();
    viewportStore.setTransform({
      x: paneRect.width * 0.5 - flowCenter.x * zoom,
      y: paneRect.height * 0.48 - flowCenter.y * zoom,
      zoom,
    });
    viewportStore.setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });
    window.settaGpuFlowZoom = zoom;
  }, surfaceId);
}

async function readRetainedSurfaceVisibleCssArea(
  page: Page,
  surfaceId: string,
): Promise<number> {
  return await page.evaluate((targetSurfaceId) => {
    type RetainedRow = {
      readonly clientRect: {
        readonly height: number;
        readonly width: number;
        readonly x: number;
        readonly y: number;
      };
      readonly surfaceId: string;
    };
    const rows = (
      window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
    ).filter(
      (row): row is RetainedRow =>
        (row as RetainedRow).surfaceId === targetSurfaceId,
    );
    if (rows.length === 0) {
      return 0;
    }
    const visibleRows = rows.filter((row) => {
      const bottom = row.clientRect.y + row.clientRect.height;
      const right = row.clientRect.x + row.clientRect.width;
      return (
        bottom > 0 &&
        right > 0 &&
        row.clientRect.y < window.innerHeight &&
        row.clientRect.x < window.innerWidth
      );
    });
    if (visibleRows.length === 0) {
      return 0;
    }
    const left = Math.min(...visibleRows.map((row) => row.clientRect.x));
    const top = Math.max(
      0,
      Math.min(...visibleRows.map((row) => row.clientRect.y)),
    );
    const right = Math.min(
      window.innerWidth,
      Math.max(
        ...visibleRows.map((row) => row.clientRect.x + row.clientRect.width),
      ),
    );
    const bottom = Math.min(
      window.innerHeight,
      Math.max(
        ...visibleRows.map((row) => row.clientRect.y + row.clientRect.height),
      ),
    );
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }, surfaceId);
}

async function readRetainedSurfaceScrollSignature(
  page: Page,
  surfaceId: string,
): Promise<RetainedScrollSignature> {
  return await page.evaluate((targetSurfaceId) => {
    type RetainedRow = {
      readonly clientRect: {
        readonly y: number;
      };
      readonly rowId: string;
      readonly surfaceId: string;
    };
    const rows = (
      (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ??
        []) as readonly RetainedRow[]
    )
      .filter((row) => row.surfaceId === targetSurfaceId)
      .sort((left, right) => left.clientRect.y - right.clientRect.y);
    return {
      firstRowId: rows[0]?.rowId ?? null,
      firstRowY: rows[0] ? Math.round(rows[0].clientRect.y * 10) / 10 : null,
      lastRowId: rows.at(-1)?.rowId ?? null,
      rowCount: rows.length,
    };
  }, surfaceId);
}

async function resolveScrollableSettingsRetainedTarget(
  page: Page,
): Promise<ScrollTarget> {
  return await page.evaluate((suffix) => {
    type RetainedRow = {
      readonly canvasCssSize: {
        readonly height: number;
        readonly width: number;
      };
      readonly clientRect: {
        readonly height: number;
        readonly width: number;
        readonly x: number;
        readonly y: number;
      };
      readonly surfaceId: string;
    };
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ??
      []) as readonly RetainedRow[];
    const rowsBySurfaceId = new Map<string, RetainedRow[]>();
    for (const row of rows) {
      if (!row.surfaceId.endsWith(suffix)) {
        continue;
      }
      const group = rowsBySurfaceId.get(row.surfaceId) ?? [];
      group.push(row);
      rowsBySurfaceId.set(row.surfaceId, group);
    }

    const candidates = Array.from(rowsBySurfaceId.entries())
      .map(([surfaceId, surfaceRows]) => {
        const visibleRows = surfaceRows.filter((row) => {
          const bottom = row.clientRect.y + row.clientRect.height;
          const right = row.clientRect.x + row.clientRect.width;
          return (
            bottom > 0 &&
            right > 0 &&
            row.clientRect.y < window.innerHeight &&
            row.clientRect.x < window.innerWidth
          );
        });
        const rect = surfaceRowsToClientRect(visibleRows);
        const visibleCssArea = rect.width * rect.height;
        return {
          debug: {
            rect,
            rowCount: surfaceRows.length,
            surfaceId,
            visibleCssArea,
            visibleRowCount: visibleRows.length,
          },
          preferred: surfaceId === `settings-section__shortcuts${suffix}`,
          rect,
          rowCount: surfaceRows.length,
          scrollRow: visibleRows[Math.floor(visibleRows.length / 2)] ?? null,
          surfaceId,
          usable:
            visibleRows.length >= 4 && rect.height >= 120 && rect.width >= 220,
          visibleCssArea,
        };
      })
      .filter((candidate) => candidate.usable)
      .sort((left, right) => {
        const preferredLeft = left.preferred && left.visibleCssArea >= 60_000;
        const preferredRight =
          right.preferred && right.visibleCssArea >= 60_000;
        if (preferredLeft !== preferredRight) {
          return preferredLeft ? -1 : 1;
        }
        if (right.visibleCssArea !== left.visibleCssArea) {
          return right.visibleCssArea - left.visibleCssArea;
        }
        return right.rowCount - left.rowCount;
      });

    const target = candidates[0];
    if (!target) {
      throw new Error(
        `Missing scrollable retained settings param surface. ${JSON.stringify(
          Array.from(rowsBySurfaceId.entries()).map(
            ([surfaceId, surfaceRows]) => {
              const visibleRows = surfaceRows.filter((row) => {
                const bottom = row.clientRect.y + row.clientRect.height;
                const right = row.clientRect.x + row.clientRect.width;
                return (
                  bottom > 0 &&
                  right > 0 &&
                  row.clientRect.y < window.innerHeight &&
                  row.clientRect.x < window.innerWidth
                );
              });
              const rect = surfaceRowsToClientRect(visibleRows);
              return {
                rect,
                rowCount: surfaceRows.length,
                surfaceId,
                visibleCssArea: rect.width * rect.height,
                visibleRowCount: visibleRows.length,
              };
            },
          ),
        )}`,
      );
    }
    const scrollRow = target.scrollRow;
    if (!scrollRow) {
      throw new Error("Missing visible retained settings row.");
    }
    const screenshotClip = clampScreenshotClip({
      height: Math.min(target.rect.height, 520),
      width: Math.min(target.rect.width, 680),
      x: target.rect.left,
      y: target.rect.top,
    });
    return {
      point: {
        x: scrollRow.clientRect.x + scrollRow.clientRect.width * 0.62,
        y: scrollRow.clientRect.y + scrollRow.clientRect.height / 2,
      },
      screenshotClip,
      scrollbarScreenshotClip: clampScreenshotClip({
        height: screenshotClip.height,
        width: Math.min(28, screenshotClip.width),
        x: screenshotClip.x + Math.max(0, screenshotClip.width - 28),
        y: screenshotClip.y,
      }),
      surfaceId: target.surfaceId,
      visibleCssArea: screenshotClip.width * screenshotClip.height,
    };

    function surfaceRowsToClientRect(surfaceRows: readonly RetainedRow[]) {
      if (surfaceRows.length === 0) {
        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
        };
      }
      const left = Math.min(...surfaceRows.map((row) => row.clientRect.x));
      const top = Math.max(
        0,
        Math.min(...surfaceRows.map((row) => row.clientRect.y)),
      );
      const right = Math.max(
        ...surfaceRows.map((row) => row.clientRect.x + row.clientRect.width),
      );
      const bottom = Math.min(
        window.innerHeight,
        Math.max(
          ...surfaceRows.map((row) => row.clientRect.y + row.clientRect.height),
        ),
      );
      return {
        bottom,
        height: Math.max(0, bottom - top),
        left,
        right,
        top,
        width: Math.max(0, right - left),
      };
    }

    function clampScreenshotClip(clip: {
      readonly height: number;
      readonly width: number;
      readonly x: number;
      readonly y: number;
    }) {
      const x = Math.max(0, Math.min(window.innerWidth - 1, clip.x));
      const y = Math.max(0, Math.min(window.innerHeight - 1, clip.y));
      return {
        height: Math.max(1, Math.min(clip.height, window.innerHeight - y)),
        width: Math.max(1, Math.min(clip.width, window.innerWidth - x)),
        x,
        y,
      };
    }
  }, SETTINGS_PARAM_CONTENT_SUFFIX);
}

async function captureRetainedScrollTargetVisualStats({
  attach = true,
  page,
  phase,
  target,
  testInfo,
}: {
  readonly attach?: boolean | undefined;
  readonly page: Page;
  readonly phase: string;
  readonly target: ScrollTarget;
  readonly testInfo: TestInfo;
}): Promise<RetainedVisualStats> {
  const screenshot = await page.screenshot({
    clip: target.screenshotClip,
    ...(attach
      ? { path: testInfo.outputPath(`retained-scroll-${phase}.png`) }
      : {}),
  });
  if (attach) {
    await testInfo.attach(`retained-scroll-${phase}.png`, {
      body: screenshot,
      contentType: "image/png",
    });
  }
  return await analyzeRetainedVisualScreenshot(page, screenshot);
}

async function waitForRetainedScrollTargetVisualStats({
  page,
  phase,
  target,
  testInfo,
}: {
  readonly page: Page;
  readonly phase: string;
  readonly target: ScrollTarget;
  readonly testInfo: TestInfo;
}): Promise<RetainedVisualStats> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const stats = await captureRetainedScrollTargetVisualStats({
      attach: false,
      page,
      phase,
      target,
      testInfo,
    });
    if (stats.brightPixelRatio > 0.01 && stats.textBandCount > 3) {
      break;
    }
    await page.waitForTimeout(120);
  }
  return await captureRetainedScrollTargetVisualStats({
    page,
    phase,
    target,
    testInfo,
  });
}

async function analyzeRetainedVisualScreenshot(
  page: Page,
  screenshot: Buffer,
): Promise<RetainedVisualStats> {
  const dataUrl = `data:image/png;base64,${screenshot.toString("base64")}`;
  return await page.evaluate(async (url) => {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Failed to decode retained visual screenshot."));
    });
    image.src = url;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Missing screenshot analysis canvas context.");
    }
    ctx.drawImage(image, 0, 0);
    const { data, height, width } = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const scanLeft = Math.floor(width * 0.04);
    const scanRight = Math.floor(width * 0.92);
    const minBrightPixels = Math.max(
      4,
      Math.floor((scanRight - scanLeft) * 0.012),
    );
    const activeRows: boolean[] = [];
    let brightPixelCount = 0;
    let scannedPixelCount = 0;

    for (let y = 0; y < height; y += 1) {
      let brightPixelsInRow = 0;
      for (let x = scanLeft; x < scanRight; x += 1) {
        const index = (y * width + x) * 4;
        const r = data[index] ?? 0;
        const g = data[index + 1] ?? 0;
        const b = data[index + 2] ?? 0;
        const a = data[index + 3] ?? 0;
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        scannedPixelCount += 1;
        if (a > 160 && luminance > 95) {
          brightPixelsInRow += 1;
          brightPixelCount += 1;
        }
      }
      activeRows.push(brightPixelsInRow >= minBrightPixels);
    }

    let textBandCount = 0;
    let inactiveGap = Number.POSITIVE_INFINITY;
    for (const active of activeRows) {
      if (active) {
        if (inactiveGap > 2) {
          textBandCount += 1;
        }
        inactiveGap = 0;
        continue;
      }
      inactiveGap += 1;
    }

    return {
      brightPixelRatio:
        scannedPixelCount === 0 ? 0 : brightPixelCount / scannedPixelCount,
      height,
      textBandCount,
      width,
    };
  }, dataUrl);
}

async function captureRetainedScrollbarWheelSequence({
  page,
  target,
  testInfo,
}: {
  readonly page: Page;
  readonly target: ScrollTarget;
  readonly testInfo: TestInfo;
}): Promise<RetainedScrollbarVisualStats[]> {
  const stats: RetainedScrollbarVisualStats[] = [];
  await page.mouse.move(target.point.x, target.point.y);
  for (let index = 0; index < 5; index += 1) {
    await page.mouse.wheel(0, 36);
    const screenshot = await page.screenshot({
      clip: target.scrollbarScreenshotClip,
      path: testInfo.outputPath(`retained-scrollbar-wheel-${index}.png`),
    });
    await testInfo.attach(`retained-scrollbar-wheel-${index}.png`, {
      body: screenshot,
      contentType: "image/png",
    });
    stats.push(await analyzeRetainedScrollbarScreenshot(page, screenshot));
  }
  return stats;
}

async function restoreRetainedScrollbarWheelSequenceScrollPosition({
  page,
  target,
}: {
  readonly page: Page;
  readonly target: ScrollTarget;
}): Promise<void> {
  await page.mouse.move(target.point.x, target.point.y);
  for (let index = 0; index < 5; index += 1) {
    await page.mouse.wheel(0, -36);
  }
  await page.waitForTimeout(150);
}

async function runNativeWheelBurst(
  page: Page,
  input: {
    readonly deltaY: number;
    readonly eventCount: number;
    readonly point: { readonly x: number; readonly y: number };
  },
): Promise<NativeWheelBurstResult> {
  const timestamps: number[] = [];
  const startedAt = performance.now();
  await page.mouse.move(input.point.x, input.point.y);
  for (let index = 0; index < input.eventCount; index += 1) {
    timestamps.push(performance.now());
    await page.mouse.wheel(0, input.deltaY);
  }
  const finishedAt = performance.now();
  return {
    durationMs: finishedAt - startedAt,
    eventCount: input.eventCount,
    eventSpacingMs: timestamps.slice(1).map((timestamp, index) => {
      const previous = timestamps[index] ?? timestamp;
      return timestamp - previous;
    }),
  };
}

async function analyzeRetainedScrollbarScreenshot(
  page: Page,
  screenshot: Buffer,
): Promise<RetainedScrollbarVisualStats> {
  const dataUrl = `data:image/png;base64,${screenshot.toString("base64")}`;
  return await page.evaluate(async (url) => {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Failed to decode retained scrollbar screenshot."));
    });
    image.src = url;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Missing scrollbar screenshot analysis canvas context.");
    }
    ctx.drawImage(image, 0, 0);
    const { data, height, width } = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const columnScores = Array.from({ length: width }, () => 0);
    const columnContrasts = Array.from({ length: width }, () => 0);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (isScrollbarPixel(data, width, x, y)) {
          columnScores[x] += 1;
        }
      }
    }
    for (let x = 0; x < width; x += 1) {
      const luminances: number[] = [];
      for (let y = 0; y < height; y += 1) {
        if (isScrollbarPixel(data, width, x, y)) {
          luminances.push(pixelLuminance(data, width, x, y));
        }
      }
      columnContrasts[x] =
        Math.max(0, ...luminances) - percentile(luminances, 0.5);
    }
    const bestColumn =
      columnScores
        .map((score, x) => ({
          contrast: columnContrasts[x] ?? 0,
          score,
          x,
        }))
        .filter((column) => column.score >= height * 0.55)
        .sort((left, right) => {
          if (right.contrast !== left.contrast) {
            return right.contrast - left.contrast;
          }
          return right.score - left.score;
        })[0]?.x ?? 0;
    const scanLeft = Math.max(0, bestColumn - 3);
    const scanRight = Math.min(width - 1, bestColumn + 3);
    const rowLuminanceSums = Array.from({ length: height }, () => 0);
    const rowLuminanceCounts = Array.from({ length: height }, () => 0);
    const activeRows = Array.from({ length: height }, (_, y) => {
      let activePixels = 0;
      for (let x = scanLeft; x <= scanRight; x += 1) {
        if (isScrollbarPixel(data, width, x, y)) {
          activePixels += 1;
          rowLuminanceSums[y] += pixelLuminance(data, width, x, y);
          rowLuminanceCounts[y] += 1;
        }
      }
      return activePixels >= 2;
    });
    const longestRun = findLongestRun(activeRows, 2);
    const activeLuminances = rowLuminanceSums.flatMap((sum, y) => {
      const count = rowLuminanceCounts[y] ?? 0;
      return activeRows[y] && count > 0 ? [sum / count] : [];
    });
    const medianLuminance = percentile(activeLuminances, 0.5);
    const maxLuminance = Math.max(0, ...activeLuminances);
    const thumbThreshold =
      medianLuminance + Math.max(4, (maxLuminance - medianLuminance) * 0.35);
    const thumbRows = Array.from({ length: height }, (_, y) => {
      const count = rowLuminanceCounts[y] ?? 0;
      return (
        activeRows[y] &&
        count > 0 &&
        rowLuminanceSums[y] / count >= thumbThreshold
      );
    });
    const thumbRun = findLongestRun(thumbRows, 1);
    return {
      bottomY: longestRun ? longestRun.endY : null,
      detectedPixelCount: columnScores[bestColumn] ?? 0,
      height,
      longestRunHeight: longestRun
        ? longestRun.endY - longestRun.startY + 1
        : 0,
      thumbContrast: maxLuminance - medianLuminance,
      thumbHeight: thumbRun ? thumbRun.endY - thumbRun.startY + 1 : 0,
      thumbTopY: thumbRun ? thumbRun.startY : null,
      topY: longestRun ? longestRun.startY : null,
      width,
    };

    function isScrollbarPixel(
      pixels: Uint8ClampedArray,
      imageWidth: number,
      x: number,
      y: number,
    ): boolean {
      const index = (y * imageWidth + x) * 4;
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      const a = pixels[index + 3] ?? 0;
      return a > 160 && r >= 22 && g >= 26 && b >= 32 && b >= r + 4;
    }

    function pixelLuminance(
      pixels: Uint8ClampedArray,
      imageWidth: number,
      x: number,
      y: number,
    ): number {
      const index = (y * imageWidth + x) * 4;
      const r = pixels[index] ?? 0;
      const g = pixels[index + 1] ?? 0;
      const b = pixels[index + 2] ?? 0;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    function percentile(values: readonly number[], quantile: number): number {
      if (values.length === 0) {
        return 0;
      }
      const sorted = [...values].sort((left, right) => left - right);
      return sorted[Math.floor((sorted.length - 1) * quantile)] ?? 0;
    }

    function findLongestRun(
      activeRowsInput: readonly boolean[],
      toleratedGap: number,
    ): { readonly endY: number; readonly startY: number } | null {
      let best: { endY: number; startY: number } | null = null;
      let currentStart: number | null = null;
      let currentEnd = 0;
      let gap = 0;
      activeRowsInput.forEach((active, y) => {
        if (active) {
          if (currentStart === null) {
            currentStart = y;
          }
          currentEnd = y;
          gap = 0;
          return;
        }
        if (currentStart === null) {
          return;
        }
        gap += 1;
        if (gap <= toleratedGap) {
          return;
        }
        const endY = currentEnd;
        if (!best || endY - currentStart > best.endY - best.startY) {
          best = { endY, startY: currentStart };
        }
        currentStart = null;
        gap = 0;
      });
      if (currentStart !== null) {
        const endY = currentEnd;
        if (!best || endY - currentStart > best.endY - best.startY) {
          best = { endY, startY: currentStart };
        }
      }
      return best;
    }
  }, dataUrl);
}

function maxRetainedVisualTextBandCount(stats: RetainedVisualStats): number {
  return Math.ceil(stats.height / 9);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

async function startScrollFrameSampler(page: Page): Promise<void> {
  await page.evaluate(() => {
    type FrameSamplerWindow = Window & {
      __SETTA_SETTINGS_SCROLL_FRAME_SAMPLER__?: {
        readonly intervals: number[];
        running: boolean;
      };
    };
    const win = window as FrameSamplerWindow;
    const sampler = {
      intervals: [] as number[],
      running: true,
    };
    let lastTimestampMs: number | null = null;
    const sampleFrame = (timestampMs: number) => {
      if (!sampler.running) {
        return;
      }
      if (lastTimestampMs !== null) {
        sampler.intervals.push(timestampMs - lastTimestampMs);
      }
      lastTimestampMs = timestampMs;
      window.requestAnimationFrame(sampleFrame);
    };
    win.__SETTA_SETTINGS_SCROLL_FRAME_SAMPLER__ = sampler;
    window.requestAnimationFrame(sampleFrame);
  });
}

async function stopScrollFrameSampler(page: Page): Promise<ScrollFrameSample> {
  return await page.evaluate(() => {
    type FrameSamplerWindow = Window & {
      __SETTA_SETTINGS_SCROLL_FRAME_SAMPLER__?: {
        readonly intervals: number[];
        running: boolean;
      };
    };
    const sampler = (window as FrameSamplerWindow)
      .__SETTA_SETTINGS_SCROLL_FRAME_SAMPLER__;
    if (!sampler) {
      throw new Error("Scroll frame sampler was not started.");
    }
    sampler.running = false;
    const intervals = sampler.intervals;
    const sortedIntervals = [...intervals].sort((left, right) => left - right);
    const totalIntervalMs = intervals.reduce((sum, value) => sum + value, 0);
    const slowFrameCount = intervals.filter(
      (intervalMs) => intervalMs >= 50,
    ).length;
    return {
      averageIntervalMs:
        intervals.length === 0 ? 0 : totalIntervalMs / intervals.length,
      frameCount: intervals.length + 1,
      p50IntervalMs: framePercentile(sortedIntervals, 0.5),
      p95IntervalMs: framePercentile(sortedIntervals, 0.95),
      slowFrameCount,
      slowFrameRatio:
        intervals.length === 0 ? 0 : slowFrameCount / intervals.length,
      worstIntervalMs: Math.max(0, ...intervals),
    };

    function framePercentile(
      sortedValues: readonly number[],
      quantile: number,
    ): number {
      if (sortedValues.length === 0) {
        return 0;
      }
      const index = Math.min(
        sortedValues.length - 1,
        Math.max(0, Math.ceil(sortedValues.length * quantile) - 1),
      );
      return sortedValues[index] ?? 0;
    }
  });
}
