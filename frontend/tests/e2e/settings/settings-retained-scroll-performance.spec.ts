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

  expect(await ensureGpuFlowPerformanceQueueWrappers(page)).toBe(true);
  await waitForGpuTextureUploadQuiet(page);

  const target = await resolveScrollableSettingsRetainedTarget(page);
  const beforeVisualStats = await captureRetainedScrollTargetVisualStats({
    page,
    phase: "before-wheel",
    target,
    testInfo,
  });
  await resetGpuFlowPerformanceProbe(page);
  await page.mouse.move(target.point.x, target.point.y);
  await startScrollFrameSampler(page);

  for (let index = 0; index < 28; index += 1) {
    await page.mouse.wheel(0, 44);
  }
  await page.waitForTimeout(750);

  const frameSample = await stopScrollFrameSampler(page);
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
    snapshot,
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
  expect(maxDirtyBacklog, failureDetails).toBeLessThanOrEqual(3);
  expect(unexpectedRetainedUploads, failureDetails).toEqual([]);
  expect(fullTargetRetainedUploads, failureDetails).toEqual([]);
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

async function resolveScrollableSettingsRetainedTarget(
  page: Page,
): Promise<ScrollTarget> {
  return await page.evaluate((suffix) => {
    type RetainedRow = {
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

    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>(
        `[data-gpu-flow-retained-content-source="true"][data-gpu-flow-source-id$="${suffix}"]`,
      ),
    )
      .map((element) => {
        const surfaceId = element.getAttribute("data-gpu-flow-source-id") ?? "";
        const rect = element.getBoundingClientRect();
        const surfaceRows = rowsBySurfaceId.get(surfaceId) ?? [];
        const rowOverflow = surfaceRows.some(
          (row) => row.clientRect.y + row.clientRect.height > rect.bottom + 1,
        );
        const onscreen =
          rect.right > 0 &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.top < window.innerHeight;
        return {
          preferred: surfaceId === `settings-section__shortcuts${suffix}`,
          rect,
          rowCount: surfaceRows.length,
          rowOverflow,
          surfaceId,
          usable: onscreen && rect.width > 120 && rect.height > 48,
        };
      })
      .filter((candidate) => candidate.usable && candidate.rowCount >= 4)
      .sort((left, right) => {
        if (left.preferred !== right.preferred) {
          return left.preferred ? -1 : 1;
        }
        if (left.rowOverflow !== right.rowOverflow) {
          return left.rowOverflow ? -1 : 1;
        }
        return right.rowCount - left.rowCount;
      });

    const target = candidates[0];
    if (!target) {
      throw new Error("Missing scrollable retained settings param surface.");
    }
    const screenshotClip = clampScreenshotClip({
      height: Math.min(target.rect.height, 320),
      width: Math.min(target.rect.width, 680),
      x: target.rect.left,
      y: target.rect.top,
    });
    return {
      point: {
        x: screenshotClip.x + screenshotClip.width * 0.62,
        y: screenshotClip.y + Math.min(screenshotClip.height - 8, 42),
      },
      screenshotClip,
      surfaceId: target.surfaceId,
      visibleCssArea: screenshotClip.width * screenshotClip.height,
    };

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
  snapshot,
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
  readonly snapshot: Awaited<ReturnType<typeof readGpuFlowPerformanceSnapshot>>;
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
        uploadedNodeIds: frame.uploadedNodeIds.slice(0, 8),
      })),
      maxDirtyBacklog,
      retainedUploadSurfaceIds,
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
