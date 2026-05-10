import { expect, test, type Page, type TestInfo } from "@playwright/test";
import {
  ensureGpuFlowPerformanceQueueWrappers,
  installGpuFlowPerformanceProbe,
  readGpuFlowPerformanceSnapshot,
  resetGpuFlowPerformanceProbe,
} from "../gpuFlowPerformanceProbe";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const SETTINGS_PARAM_CONTENT_SUFFIX = ":param-content:unpinned";
const SETTINGS_SCROLL_TEST_SURFACE_ID = `settings-section__shortcuts${SETTINGS_PARAM_CONTENT_SUFFIX}`;
const RETAINED_SCROLLBAR_TEXTURE_SUFFIX = ":scrollbar";

type ScrollTarget = {
  readonly point: { readonly x: number; readonly y: number };
  readonly screenshotClip: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly surfaceId: string;
  readonly visibleCssArea: number;
};

type ScrollTargetDetails = {
  readonly screenshotClip: ScrollTarget["screenshotClip"];
  readonly surfaceId: string;
  readonly visibleCssArea: number;
};

type ScrollFrameSample = {
  readonly averageIntervalMs: number;
  readonly frameCount: number;
  readonly slowFrameCount: number;
  readonly worstIntervalMs: number;
};

type RetainedVisualStats = {
  readonly brightPixelRatio: number;
  readonly height: number;
  readonly textBandCount: number;
  readonly width: number;
};

type RetainedScrollSignature = {
  readonly firstRowId: string | null;
  readonly firstRowY: number | null;
  readonly lastRowId: string | null;
  readonly rowCount: number;
};

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
  const beforeVisualStats = await captureRetainedScrollTargetVisualStats({
    page,
    phase: "before-wheel",
    target,
    testInfo,
  });
  const retainedScrollbarSourceCount = await page
    .locator(
      `[data-gpu-flow-source-id$="${RETAINED_SCROLLBAR_TEXTURE_SUFFIX}"]`,
    )
    .count();
  await resetGpuFlowPerformanceProbe(page);
  const beforeScrollSignature = await readRetainedSurfaceScrollSignature(
    page,
    target.surfaceId,
  );
  await page.mouse.move(target.point.x, target.point.y);
  await startScrollFrameSampler(page);

  for (let index = 0; index < 12; index += 1) {
    await page.mouse.wheel(0, 44);
  }
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
  const failureDetails = formatScrollPerformanceDetails({
    frameSample,
    fullTargetRetainedUploadCount: fullTargetRetainedUploads.length,
    largestTargetUploadCssArea,
    maxDirtyBacklog,
    retainedUploadSurfaceIds,
    retainedScrollbarSourceCount,
    scrollbarUploadCount: scrollbarUploadCalls.length,
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
    targetSurfaceId: target.surfaceId,
    unexpectedRetainedUploads,
    visualStats: { after: afterVisualStats, before: beforeVisualStats },
    worstFrameIntervalMs,
  });

  expect(frameSample.frameCount, failureDetails).toBeGreaterThan(8);
  expect(beforeVisualStats.textBandCount, failureDetails).toBeLessThanOrEqual(
    maxRetainedVisualTextBandCount(beforeVisualStats),
  );
  expect(afterVisualStats.textBandCount, failureDetails).toBeLessThanOrEqual(
    maxRetainedVisualTextBandCount(afterVisualStats),
  );
  expect(retainedScrollbarSourceCount, failureDetails).toBe(0);
  expect(scrollbarUploadCalls, failureDetails).toEqual([]);
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
  expect(worstFrameIntervalMs, failureDetails).toBeLessThan(80);
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
    const flowTop =
      (minClientY - paneRect.top - transform.y) / transform.zoom;
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
    const rows = ((window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ??
      []) as readonly RetainedRow[])
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
            visibleRows.length >= 4 &&
            rect.height >= 120 &&
            rect.width >= 220,
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
          ...surfaceRows.map(
            (row) => row.clientRect.y + row.clientRect.height,
          ),
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
  const screenshot = await page.screenshot({
    clip: target.screenshotClip,
    path: testInfo.outputPath(`retained-scroll-${phase}.png`),
  });
  await testInfo.attach(`retained-scroll-${phase}.png`, {
    body: screenshot,
    contentType: "image/png",
  });
  return await analyzeRetainedVisualScreenshot(page, screenshot);
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
    const totalIntervalMs = intervals.reduce((sum, value) => sum + value, 0);
    return {
      averageIntervalMs:
        intervals.length === 0 ? 0 : totalIntervalMs / intervals.length,
      frameCount: intervals.length + 1,
      slowFrameCount: intervals.filter((intervalMs) => intervalMs >= 50).length,
      worstIntervalMs: Math.max(0, ...intervals),
    };
  });
}

function formatScrollPerformanceDetails({
  frameSample,
  fullTargetRetainedUploadCount,
  largestTargetUploadCssArea,
  maxDirtyBacklog,
  retainedUploadSurfaceIds,
  retainedScrollbarSourceCount,
  scrollbarUploadCount,
  scrollSignatures,
  snapshot,
  target,
  targetSurfaceId,
  unexpectedRetainedUploads,
  visualStats,
  worstFrameIntervalMs,
}: {
  readonly frameSample: ScrollFrameSample;
  readonly fullTargetRetainedUploadCount: number;
  readonly largestTargetUploadCssArea: number;
  readonly maxDirtyBacklog: number;
  readonly retainedUploadSurfaceIds: readonly string[];
  readonly retainedScrollbarSourceCount: number;
  readonly scrollbarUploadCount: number;
  readonly scrollSignatures: {
    readonly after: RetainedScrollSignature;
    readonly before: RetainedScrollSignature;
  };
  readonly snapshot: Awaited<ReturnType<typeof readGpuFlowPerformanceSnapshot>>;
  readonly target: ScrollTargetDetails;
  readonly targetSurfaceId: string;
  readonly unexpectedRetainedUploads: readonly string[];
  readonly visualStats: {
    readonly after: RetainedVisualStats;
    readonly before: RetainedVisualStats;
  };
  readonly worstFrameIntervalMs: number;
}): string {
  return JSON.stringify(
    {
      frameSample,
      fullTargetRetainedUploadCount,
      frameCount: snapshot.frameCount,
      largestTargetUploadCssArea,
      latestFrames: snapshot.nodeLayerFrames.slice(-8).map((frame) => ({
        remainingDirtyNodeCount: frame.remainingDirtyNodeCount,
        solidRoundedRectSurfaceCount: frame.solidRoundedRectSurfaceCount,
        uploadedNodeIds: frame.uploadedNodeIds.slice(0, 8),
      })),
      maxDirtyBacklog,
      retainedUploadSurfaceIds,
      retainedScrollbarSourceCount,
      scrollbarUploadCount,
      scrollSignatures,
      target,
      targetSurfaceId,
      textureUploadCount: snapshot.queueCalls.filter(
        (call) => call.method === "copyElementImageToTexture",
      ).length,
      unexpectedRetainedUploads,
      visualStats,
      worstFrameIntervalMs,
    },
    null,
    2,
  );
}
