import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const SETTINGS_PARAM_CONTENT_SUFFIX = ":param-content:unpinned";
const SETTINGS_SCROLL_TEST_SURFACE_ID = `settings-section__shortcuts${SETTINGS_PARAM_CONTENT_SUFFIX}`;

type NativeScrollTarget = {
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

type NativeScrollSourceMetrics = {
  readonly clientHeight: number;
  readonly clientWidth: number;
  readonly rect: {
    readonly height: number;
    readonly left: number;
    readonly top: number;
    readonly width: number;
  };
  readonly scrollHeight: number;
  readonly scrollTop: number;
};

type NativeRetainedScrollProbeSnapshot = {
  readonly frameSamples: readonly {
    readonly scrollTop: number;
    readonly t: number;
  }[];
  readonly initialPageScrollY: number;
  readonly longTasks: readonly {
    readonly duration: number;
    readonly startTime: number;
  }[];
  readonly pageScrollLeaked: boolean;
  readonly scrollSamples: readonly {
    readonly scrollLeft: number;
    readonly scrollTop: number;
    readonly t: number;
  }[];
  readonly source: NativeScrollSourceMetrics & {
    readonly scrollLeft: number;
    readonly scrollWidth: number;
    readonly surfaceId: string;
  };
};

type NativeRetainedScrollProbeAnalysis = {
  readonly frameCount: number;
  readonly hasUnexplainedCatchUpJump: boolean;
  readonly longTaskOver50Count: number;
  readonly maxFrameIntervalMs: number;
  readonly monotonicExceptRawReversal: boolean;
  readonly p50FrameIntervalMs: number;
  readonly p95FrameIntervalMs: number;
  readonly visualDeltaMax: number;
  readonly visualDeltaMedian: number;
};

type RetainedVisualCapture = {
  readonly screenshot: Buffer;
  readonly stats: RetainedVisualStats;
};

type RetainedVisualStats = {
  readonly brightPixelRatio: number;
  readonly height: number;
  readonly textBandCount: number;
  readonly width: number;
};

type RetainedVisualScrollSignature = {
  readonly firstRowId: string | null;
  readonly firstRowY: number | null;
  readonly rowCount: number;
  readonly sourceScrollTop: number;
};

declare global {
  interface Window {
    __SETTA_RETAINED_NATIVE_SCROLL_PROBE__?:
      | {
          readonly stop: () => NativeRetainedScrollProbeSnapshot;
        }
      | undefined;
  }
}

test("all-settings retained section scrolls from the native source with stable visual cadence", async ({
  page,
}, testInfo) => {
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
      async () =>
        (
          await readNativeScrollSourceMetrics(
            page,
            SETTINGS_SCROLL_TEST_SURFACE_ID,
          )
        )?.clientHeight ?? 0,
      { timeout: 5_000 },
    )
    .toBeGreaterThan(120);

  const target = await resolveNativeScrollTarget(
    page,
    SETTINGS_SCROLL_TEST_SURFACE_ID,
  );
  await runWarmupNativeScrollBurst(page, target.surfaceId);
  await installNativeRetainedScrollProbe(page, target.surfaceId);
  const before = await captureRetainedNativeScrollVisualStats({
    page,
    phase: "before",
    target,
    testInfo,
  });
  const beforeSignature = await readRetainedVisualScrollSignature(
    page,
    target.surfaceId,
  );

  const inputDeltas = [12, 24, 48, 96, 160, 220, 180, 96, 48, 24, 12];
  await page.mouse.move(target.point.x, target.point.y);
  for (let index = 0; index < inputDeltas.length; index += 1) {
    await page.mouse.wheel(0, inputDeltas[index] ?? 0);
    if (index === 4) {
      await page.waitForTimeout(80);
    }
  }
  const during = await captureRetainedNativeScrollVisualStats({
    page,
    phase: "during",
    target,
    testInfo,
  });
  const duringSignature = await readRetainedVisualScrollSignature(
    page,
    target.surfaceId,
  );
  await page.waitForTimeout(450);
  const after = await captureRetainedNativeScrollVisualStats({
    page,
    phase: "after",
    target,
    testInfo,
  });
  const afterSignature = await readRetainedVisualScrollSignature(
    page,
    target.surfaceId,
  );
  const probe = await readNativeRetainedScrollProbe(page);
  const analysis = analyzeNativeRetainedScrollProbe({ inputDeltas, probe });
  const failureDetails = JSON.stringify(
    {
      analysis,
      afterStats: after.stats,
      afterSignature,
      beforeStats: before.stats,
      beforeSignature,
      duringSignature,
      duringStats: during.stats,
      inputDeltas,
      probe,
      target,
    },
    null,
    2,
  );

  expect(probe.source.scrollHeight, failureDetails).toBeGreaterThan(
    probe.source.clientHeight,
  );
  expect(probe.source.scrollTop, failureDetails).toBeGreaterThan(24);
  expect(probe.scrollSamples.length, failureDetails).toBeGreaterThanOrEqual(3);
  expect(probe.pageScrollLeaked, failureDetails).toBe(false);
  expect(analysis.frameCount, failureDetails).toBeGreaterThan(8);
  expect(analysis.longTaskOver50Count, failureDetails).toBeLessThanOrEqual(1);
  expect(analysis.maxFrameIntervalMs, failureDetails).toBeLessThan(120);
  expect(analysis.p95FrameIntervalMs, failureDetails).toBeLessThan(80);
  expect(analysis.monotonicExceptRawReversal, failureDetails).toBe(true);
  expect(analysis.hasUnexplainedCatchUpJump, failureDetails).toBe(false);
  expect(before.stats.width, failureDetails).toBeGreaterThan(0);
  expect(during.stats.width, failureDetails).toBe(before.stats.width);
  expect(after.stats.width, failureDetails).toBe(before.stats.width);
  expect(beforeSignature.rowCount, failureDetails).toBeGreaterThan(3);
  expect(duringSignature.firstRowId, failureDetails).not.toBe(
    beforeSignature.firstRowId,
  );
  expect(afterSignature.firstRowId, failureDetails).not.toBe(
    beforeSignature.firstRowId,
  );
  expect(afterSignature.sourceScrollTop, failureDetails).toBe(
    probe.source.scrollTop,
  );
});

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
        `Missing retained native scroll setup data for ${targetSurfaceId}.`,
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

async function readNativeScrollSourceMetrics(
  page: Page,
  surfaceId: string,
): Promise<NativeScrollSourceMetrics | null> {
  return await page.evaluate((targetSurfaceId) => {
    const source = document.querySelector<HTMLElement>(
      `[data-gpu-flow-retained-scroll-source-id="${targetSurfaceId}"]`,
    );
    if (!source) {
      return null;
    }
    const rect = source.getBoundingClientRect();
    return {
      clientHeight: source.clientHeight,
      clientWidth: source.clientWidth,
      rect: {
        height: rect.height,
        left: rect.left,
        top: rect.top,
        width: rect.width,
      },
      scrollHeight: source.scrollHeight,
      scrollTop: source.scrollTop,
    };
  }, surfaceId);
}

async function resolveNativeScrollTarget(
  page: Page,
  surfaceId: string,
): Promise<NativeScrollTarget> {
  const metrics = await readNativeScrollSourceMetrics(page, surfaceId);
  if (!metrics) {
    throw new Error(`Missing retained native scroll source ${surfaceId}.`);
  }
  if (metrics.scrollHeight <= metrics.clientHeight) {
    throw new Error(
      `Retained native scroll source ${surfaceId} cannot scroll.`,
    );
  }
  const screenshotClip = await page.evaluate((rect) => {
    const x = Math.max(0, Math.min(window.innerWidth - 1, rect.left));
    const y = Math.max(0, Math.min(window.innerHeight - 1, rect.top));
    return {
      height: Math.max(1, Math.min(520, rect.height, window.innerHeight - y)),
      width: Math.max(1, Math.min(680, rect.width, window.innerWidth - x)),
      x,
      y,
    };
  }, metrics.rect);
  return {
    point: {
      x: screenshotClip.x + screenshotClip.width * 0.58,
      y: screenshotClip.y + screenshotClip.height * 0.5,
    },
    screenshotClip,
    surfaceId,
    visibleCssArea: screenshotClip.width * screenshotClip.height,
  };
}

async function runWarmupNativeScrollBurst(
  page: Page,
  surfaceId: string,
): Promise<void> {
  await page.evaluate((targetSurfaceId) => {
    const source = document.querySelector<HTMLElement>(
      `[data-gpu-flow-retained-scroll-source-id="${targetSurfaceId}"]`,
    );
    if (!source) {
      throw new Error(
        `Missing retained native scroll source ${targetSurfaceId}.`,
      );
    }
    source.scrollTop = 24;
  }, surfaceId);
  await page.waitForTimeout(120);
}

async function installNativeRetainedScrollProbe(
  page: Page,
  surfaceId: string,
): Promise<void> {
  await page.evaluate((targetSurfaceId) => {
    const source = document.querySelector<HTMLElement>(
      `[data-gpu-flow-retained-scroll-source-id="${targetSurfaceId}"]`,
    );
    if (!source) {
      throw new Error(
        `Missing retained native scroll source ${targetSurfaceId}.`,
      );
    }
    const frameSamples: { scrollTop: number; t: number }[] = [];
    const longTasks: { duration: number; startTime: number }[] = [];
    const scrollSamples: {
      scrollLeft: number;
      scrollTop: number;
      t: number;
    }[] = [];
    const initialPageScrollY = window.scrollY;
    let animationFrameId: number | null = null;
    let observer: PerformanceObserver | null = null;
    const onScroll = () => {
      scrollSamples.push({
        scrollLeft: source.scrollLeft,
        scrollTop: source.scrollTop,
        t: performance.now(),
      });
    };
    source.addEventListener("scroll", onScroll, { passive: true });
    const sampleFrame = () => {
      frameSamples.push({ scrollTop: source.scrollTop, t: performance.now() });
      animationFrameId = requestAnimationFrame(sampleFrame);
    };
    animationFrameId = requestAnimationFrame(sampleFrame);
    if ("PerformanceObserver" in window) {
      try {
        observer = new PerformanceObserver((entries) => {
          for (const entry of entries.getEntries()) {
            longTasks.push({
              duration: entry.duration,
              startTime: entry.startTime,
            });
          }
        });
        observer.observe({ entryTypes: ["longtask"] });
      } catch {
        observer = null;
      }
    }
    window.__SETTA_RETAINED_NATIVE_SCROLL_PROBE__ = {
      stop() {
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        source.removeEventListener("scroll", onScroll);
        observer?.disconnect();
        const rect = source.getBoundingClientRect();
        return {
          frameSamples,
          initialPageScrollY,
          longTasks,
          pageScrollLeaked: window.scrollY !== initialPageScrollY,
          scrollSamples,
          source: {
            clientHeight: source.clientHeight,
            clientWidth: source.clientWidth,
            rect: {
              height: rect.height,
              left: rect.left,
              top: rect.top,
              width: rect.width,
            },
            scrollHeight: source.scrollHeight,
            scrollLeft: source.scrollLeft,
            scrollTop: source.scrollTop,
            scrollWidth: source.scrollWidth,
            surfaceId: targetSurfaceId,
          },
        };
      },
    };
  }, surfaceId);
}

async function readNativeRetainedScrollProbe(
  page: Page,
): Promise<NativeRetainedScrollProbeSnapshot> {
  return await page.evaluate(() => {
    const probe = window.__SETTA_RETAINED_NATIVE_SCROLL_PROBE__;
    if (!probe) {
      throw new Error("Missing retained native scroll probe.");
    }
    const snapshot = probe.stop();
    delete window.__SETTA_RETAINED_NATIVE_SCROLL_PROBE__;
    return snapshot;
  });
}

function analyzeNativeRetainedScrollProbe({
  inputDeltas,
  probe,
}: {
  readonly inputDeltas: readonly number[];
  readonly probe: NativeRetainedScrollProbeSnapshot;
}): NativeRetainedScrollProbeAnalysis {
  const frameIntervals = probe.frameSamples
    .slice(1)
    .map(
      (sample, index) => sample.t - (probe.frameSamples[index]?.t ?? sample.t),
    );
  const visualDeltas = probe.frameSamples
    .slice(1)
    .map(
      (sample, index) =>
        sample.scrollTop -
        (probe.frameSamples[index]?.scrollTop ?? sample.scrollTop),
    )
    .filter((delta) => delta !== 0);
  const absoluteVisualDeltas = visualDeltas
    .map((delta) => Math.abs(delta))
    .sort((left, right) => left - right);
  const rawMaxDelta = Math.max(
    0,
    ...inputDeltas.map((delta) => Math.abs(delta)),
  );
  const visualDeltaMedian = percentile(absoluteVisualDeltas, 0.5);
  const visualDeltaMax = Math.max(0, ...absoluteVisualDeltas);
  const reversalCount = countSignReversals(inputDeltas);
  const visualReversalCount = countSignReversals(visualDeltas);
  return {
    frameCount: probe.frameSamples.length,
    hasUnexplainedCatchUpJump:
      visualDeltaMedian > 0 &&
      visualDeltaMax > Math.max(rawMaxDelta * 1.5, visualDeltaMedian * 10),
    longTaskOver50Count: probe.longTasks.filter((task) => task.duration > 50)
      .length,
    maxFrameIntervalMs: Math.max(0, ...frameIntervals),
    monotonicExceptRawReversal: visualReversalCount <= reversalCount + 1,
    p50FrameIntervalMs: percentile(frameIntervals, 0.5),
    p95FrameIntervalMs: percentile(frameIntervals, 0.95),
    visualDeltaMedian,
    visualDeltaMax,
  };
}

async function readRetainedVisualScrollSignature(
  page: Page,
  surfaceId: string,
): Promise<RetainedVisualScrollSignature> {
  return await page.evaluate((targetSurfaceId) => {
    type RetainedRow = {
      readonly clientRect: { readonly y: number };
      readonly rowId: string;
      readonly surfaceId: string;
    };
    const source = document.querySelector<HTMLElement>(
      `[data-gpu-flow-retained-scroll-source-id="${targetSurfaceId}"]`,
    );
    if (!source) {
      throw new Error(
        `Missing retained native scroll source ${targetSurfaceId}.`,
      );
    }
    const rows = (
      (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ??
        []) as readonly RetainedRow[]
    )
      .filter((row) => row.surfaceId === targetSurfaceId)
      .sort((left, right) => left.clientRect.y - right.clientRect.y);
    return {
      firstRowId: rows[0]?.rowId ?? null,
      firstRowY: rows[0] ? Math.round(rows[0].clientRect.y * 10) / 10 : null,
      rowCount: rows.length,
      sourceScrollTop: source.scrollTop,
    };
  }, surfaceId);
}

async function captureRetainedNativeScrollVisualStats({
  page,
  phase,
  target,
  testInfo,
}: {
  readonly page: Page;
  readonly phase: string;
  readonly target: NativeScrollTarget;
  readonly testInfo: TestInfo;
}): Promise<RetainedVisualCapture> {
  const screenshot = await page.screenshot({
    clip: target.screenshotClip,
    path: testInfo.outputPath(`retained-native-scroll-${phase}.png`),
  });
  await testInfo.attach(`retained-native-scroll-${phase}.png`, {
    body: screenshot,
    contentType: "image/png",
  });
  return {
    screenshot,
    stats: await analyzeRetainedVisualScreenshot(page, screenshot),
  };
}

async function analyzeRetainedVisualScreenshot(
  page: Page,
  screenshot: Buffer,
): Promise<RetainedVisualStats> {
  const dataUrl = `data:image/png;base64,${screenshot.toString("base64")}`;
  return await page.evaluate(async (url) => {
    async function decodeImage(urlInput: string): Promise<HTMLImageElement> {
      const image = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(new Error("Failed to decode retained visual screenshot."));
      });
      image.src = urlInput;
      await loaded;
      return image;
    }

    const image = await decodeImage(url);
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
        const luminance =
          0.2126 * (data[index] ?? 0) +
          0.7152 * (data[index + 1] ?? 0) +
          0.0722 * (data[index + 2] ?? 0);
        scannedPixelCount += 1;
        if ((data[index + 3] ?? 0) > 160 && luminance > 95) {
          brightPixelsInRow += 1;
          brightPixelCount += 1;
        }
      }
      activeRows.push(brightPixelsInRow >= minBrightPixels);
    }
    return {
      brightPixelRatio:
        scannedPixelCount === 0 ? 0 : brightPixelCount / scannedPixelCount,
      height,
      textBandCount: countTextBands(activeRows),
      width,
    };

    function countTextBands(activeRowsInput: readonly boolean[]): number {
      let textBandCount = 0;
      let inactiveGap = Number.POSITIVE_INFINITY;
      for (const active of activeRowsInput) {
        if (active) {
          if (inactiveGap > 2) {
            textBandCount += 1;
          }
          inactiveGap = 0;
        } else {
          inactiveGap += 1;
        }
      }
      return textBandCount;
    }
  }, dataUrl);
}

function countSignReversals(values: readonly number[]): number {
  return values.reduce(
    (count, value, index) =>
      index > 0 && Math.sign(value) !== Math.sign(values[index - 1] ?? value)
        ? count + 1
        : count,
    0,
  );
}

function percentile(
  values: readonly number[],
  percentileValue: number,
): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1),
  );
  return sorted[index] ?? 0;
}
