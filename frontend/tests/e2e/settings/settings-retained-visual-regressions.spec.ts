import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const GUI_SECTION_ID = "settings-section__gui";
const GUI_CONTENT_SURFACE_ID = `${GUI_SECTION_ID}:param-content:unpinned`;
const LEFT_PANE_SHIFT_LABEL = "Left Side Pane Shifts Map";

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

type Point = {
  readonly x: number;
  readonly y: number;
};

type Rect = Point & {
  readonly height: number;
  readonly width: number;
};

type RetainedRowDebugEntry = {
  readonly clientRect: Rect;
  readonly controlClientPoint: Point | null;
  readonly controlKind: string | null;
  readonly labelClientPoint: Point;
  readonly rowId: string;
  readonly rowLabel: string;
  readonly surfaceId: string;
};

type RowBand = {
  readonly label: string;
  readonly rect: Rect;
};

type HoverBandStats = {
  readonly changedPixelRatio: number;
  readonly label: string;
  readonly meanDelta: number;
};

type SwitchFrame = {
  readonly name: string;
  readonly screenshot: Buffer;
};

type ScrollbarStats = {
  readonly duplicateColumnCount: number;
  readonly maxColumnCoverage: number;
  readonly primaryColumnCoverage: number;
  readonly visibleColumnCount: number;
};

test("rapid row hover shows exactly one retained row highlight", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  const zoomTarget = await resolveVisibleGuiRow(page, "Max Zoom");
  await performCloseZoom(page, zoomTarget.labelClientPoint);
  const rows = await resolveVisibleGuiRows(page, [
    "Left Side Pane Shifts Map",
    "Max Zoom",
    "Min Zoom",
    "Pan On Drag",
    "Pan On Scroll",
  ]);
  await moveAwayFromRetainedRows(page);

  const clip = rowsToClip(rows);
  await waitForStableScreenshotClip(page, clip);
  const before = await screenshotClip({
    name: "visual-hover-before.png",
    page,
    rect: clip,
    testInfo,
  });
  const violations: Array<{
    readonly bandStats: readonly HoverBandStats[];
    readonly highlightedLabels: readonly string[];
    readonly targetLabel: string;
  }> = [];
  for (const [index, row] of rows.entries()) {
    await page.mouse.move(row.labelClientPoint.x, row.labelClientPoint.y);
    await page.waitForTimeout(8);
    const sample = await screenshotClip({
      name: `visual-hover-fast-move-${index}.png`,
      page,
      rect: clip,
      testInfo,
    });
    const bandStats = await analyzeHoverBands(page, {
      after: sample,
      before,
      clip,
      rows: rows.map((candidate) => ({
        label: candidate.rowLabel,
        rect: candidate.clientRect,
      })),
    });
    const highlightedLabels = bandStats
      .filter((stats) => stats.changedPixelRatio > 0.12 && stats.meanDelta > 5)
      .map((stats) => stats.label);
    if (
      highlightedLabels.length !== 1 ||
      highlightedLabels[0] !== row.rowLabel
    ) {
      violations.push({
        bandStats,
        highlightedLabels,
        targetLabel: row.rowLabel,
      });
    }
  }
  const failureDetails = JSON.stringify({ rows, violations }, null, 2);
  expect(violations, failureDetails).toHaveLength(0);
});

test("retained switch click shows a visible intermediate animation frame", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  const row = await resolveVisibleGuiRow(page, LEFT_PANE_SHIFT_LABEL);
  if (!row.controlClientPoint) {
    throw new Error(`Missing switch control point for ${LEFT_PANE_SHIFT_LABEL}`);
  }
  const clip = clampScreenshotClip({
    height: 40,
    width: Math.min(180, row.clientRect.width * 0.5),
    x: row.clientRect.x + row.clientRect.width * 0.45,
    y: row.controlClientPoint.y - 20,
  });
  const before = await captureSwitchFrame({
    name: "visual-switch-before.png",
    page,
    rect: clip,
    testInfo,
  });

  await page.mouse.click(row.controlClientPoint.x, row.controlClientPoint.y);
  const samples: SwitchFrame[] = [];
  for (const delay of [12, 24, 36, 60]) {
    await page.waitForTimeout(delay);
    samples.push(
      await captureSwitchFrame({
        name: `visual-switch-${delay}ms.png`,
        page,
        rect: clip,
        testInfo,
      }),
    );
  }
  await page.waitForTimeout(180);
  const settled = await captureSwitchFrame({
    name: "visual-switch-settled.png",
    page,
    rect: clip,
    testInfo,
  });

  const beforeToSettled = await compareScreenshots(
    page,
    before.screenshot,
    settled.screenshot,
  );
  const sampleDeltas = [];
  for (const sample of samples) {
    sampleDeltas.push({
      fromBefore: await compareScreenshots(
        page,
        before.screenshot,
        sample.screenshot,
      ),
      fromSettled: await compareScreenshots(
        page,
        sample.screenshot,
        settled.screenshot,
      ),
      name: sample.name,
    });
  }
  const intermediateSamples = sampleDeltas.filter(
    (sample) =>
      sample.fromBefore.meanDelta > beforeToSettled.meanDelta * 0.25 &&
      sample.fromSettled.meanDelta > beforeToSettled.meanDelta * 0.25,
  );
  const failureDetails = JSON.stringify(
    { beforeToSettled, intermediateSamples, sampleDeltas },
    null,
    2,
  );
  expect(beforeToSettled.meanDelta, failureDetails).toBeGreaterThan(0.5);
  expect(intermediateSamples.length, failureDetails).toBeGreaterThan(0);
});

test("retained section scroll position survives viewport pan and zoom", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await wheelGuiContentDown(page);
  await moveAwayFromRetainedRows(page);
  const beforeRows = await resolveVisibleGuiRows(page, [
    "Pan On Scroll Mode",
    "Pan On Scroll Speed",
    "Section Tag Color Choices",
  ]);
  const beforeClip = rowsToClip(beforeRows);
  const before = await screenshotClip({
    name: "visual-scroll-before-pan-zoom.png",
    page,
    rect: beforeClip,
    testInfo,
  });

  await panViewport(page);
  await roundTripZoomViewport(
    page,
    beforeRows[0]?.labelClientPoint ?? {
      x: beforeClip.x + beforeClip.width / 2,
      y: beforeClip.y + beforeClip.height / 2,
    },
  );
  await waitForViewportIdle(page);
  await moveAwayFromRetainedRows(page);
  const afterRows = await resolveVisibleGuiRows(page, [
    "Pan On Scroll Mode",
    "Pan On Scroll Speed",
    "Section Tag Color Choices",
  ]);
  const afterClip = rowsToClip(afterRows);
  const after = await screenshotClip({
    name: "visual-scroll-after-pan-zoom.png",
    page,
    rect: afterClip,
    testInfo,
  });

  const similarity = await compareScreenshots(page, before, after);
  const failureDetails = JSON.stringify(
    { afterRows, beforeRows, similarity },
    null,
    2,
  );
  expect(similarity.meanDelta, failureDetails).toBeLessThan(14);
  expect(similarity.changedPixelRatio, failureDetails).toBeLessThan(0.4);
});

test("retained scrollbar renders as one coherent vertical control", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await dragGuiScrollbarDown(page);
  const rows = await resolveVisibleGuiRows(page, [
    "Pan On Scroll Mode",
    "Pan On Scroll Speed",
    "Section Tag Color Choices",
  ]);
  await page.mouse.move(
    rows[0]?.labelClientPoint.x ?? 800,
    rows[0]?.labelClientPoint.y ?? 360,
  );
  await page.waitForTimeout(60);
  const surfaceClip = await resolveVisibleGuiSurfaceClip(page);
  const scrollbarClip = clampScreenshotClip({
    height: surfaceClip.height,
    width: 18,
    x: surfaceClip.x + surfaceClip.width - 20,
    y: surfaceClip.y,
  });
  const screenshot = await screenshotClip({
    name: "visual-scrollbar-coherent.png",
    page,
    rect: scrollbarClip,
    testInfo,
  });

  const stats = await analyzeVerticalScrollbar(page, screenshot);
  const failureDetails = JSON.stringify(
    { scrollbarClip, stats, surfaceClip },
    null,
    2,
  );
  expect(stats.visibleColumnCount, failureDetails).toBeGreaterThan(2);
  expect(stats.maxColumnCoverage, failureDetails).toBeGreaterThan(0.82);
  expect(stats.duplicateColumnCount, failureDetails).toBeLessThanOrEqual(4);
});

async function openSettings(page: Page): Promise<void> {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await page.getByRole("button", { name: "fit view" }).click();
  await waitForViewportIdle(page);
  await expect(
    page.locator(`.setta-gpu-flow__node[data-id="${GUI_SECTION_ID}"]`),
  ).toBeVisible();
  await waitForRetainedRows(page);
}

async function waitForRetainedRows(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        await page.evaluate(
          () => window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.().length ?? 0,
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThan(10);
}

async function resolveVisibleGuiRow(
  page: Page,
  label: string,
): Promise<RetainedRowDebugEntry> {
  const rows = await resolveVisibleGuiRows(page, [label]);
  const row = rows.find((candidate) => candidate.rowLabel === label);
  if (!row) {
    throw new Error(`Missing visible retained GUI row ${label}`);
  }
  return row;
}

async function resolveVisibleGuiRows(
  page: Page,
  labels: readonly string[],
): Promise<readonly RetainedRowDebugEntry[]> {
  return await page.evaluate(
    ({ labels, surfaceId }) => {
      const labelSet = new Set(labels);
      const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
        .filter(
          (row): row is RetainedRowDebugEntry =>
            row.surfaceId === surfaceId &&
            labelSet.has(row.rowLabel) &&
            row.clientRect.width > 16 &&
            row.clientRect.height > 8 &&
            row.clientRect.y < window.innerHeight &&
            row.clientRect.y + row.clientRect.height > 0,
        )
        .sort((left, right) => left.clientRect.y - right.clientRect.y);
      if (rows.length !== labels.length) {
        throw new Error(
          `Missing visible GUI rows. Requested ${JSON.stringify(
            labels,
          )}, found ${JSON.stringify(rows.map((row) => row.rowLabel))}`,
        );
      }
      return rows;
    },
    {
      labels,
      surfaceId: GUI_CONTENT_SURFACE_ID,
    },
  );
}

async function resolveVisibleGuiSurfaceClip(page: Page): Promise<Rect> {
  return await page.evaluate((surfaceId) => {
    const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
      .filter((row) => row.surfaceId === surfaceId)
      .map((row) => row.clientRect)
      .filter(
        (rect) =>
          rect.width > 16 &&
          rect.height > 8 &&
          rect.y < window.innerHeight &&
          rect.y + rect.height > 0,
      );
    if (rows.length === 0) {
      throw new Error("Missing visible GUI retained surface.");
    }
    const left = Math.max(0, Math.min(...rows.map((rect) => rect.x)));
    const top = Math.max(0, Math.min(...rows.map((rect) => rect.y)));
    const right = Math.min(
      window.innerWidth,
      Math.max(...rows.map((rect) => rect.x + rect.width)),
    );
    const bottom = Math.min(
      window.innerHeight,
      Math.max(...rows.map((rect) => rect.y + rect.height)),
    );
    return {
      height: Math.max(1, bottom - top),
      width: Math.max(1, right - left),
      x: left,
      y: top,
    };
  }, GUI_CONTENT_SURFACE_ID);
}

async function moveAwayFromRetainedRows(page: Page): Promise<void> {
  const pane = page.locator(READY_SELECTOR).first();
  const box = await pane.boundingBox();
  if (!box) {
    throw new Error("Missing GPU pane bounds.");
  }
  await page.mouse.move(box.x + Math.max(6, box.width - 12), box.y + 8);
  await page.waitForTimeout(100);
}

async function dragGuiScrollbarDown(page: Page): Promise<void> {
  const surfaceClip = await resolveVisibleGuiSurfaceClip(page);
  const start = {
    x: surfaceClip.x + surfaceClip.width - 8,
    y: surfaceClip.y + Math.min(84, surfaceClip.height * 0.35),
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(
    start.x,
    start.y + Math.min(140, surfaceClip.height * 0.45),
    {
      steps: 8,
    },
  );
  await page.mouse.up();
  await page.waitForTimeout(120);
  await expect
    .poll(async () => {
      const rows = await page.evaluate((surfaceId) => {
        return (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
          .filter(
            (row): row is RetainedRowDebugEntry =>
              row.surfaceId === surfaceId &&
              row.rowLabel === "Section Tag Color Choices" &&
              row.clientRect.y > 0 &&
              row.clientRect.y < window.innerHeight,
          )
          .length;
      }, GUI_CONTENT_SURFACE_ID);
      return rows;
    })
    .toBeGreaterThan(0);
}

async function wheelGuiContentDown(page: Page): Promise<void> {
  const row = await resolveVisibleGuiRow(page, "Pan On Scroll Mode");
  await page.mouse.move(row.labelClientPoint.x, row.labelClientPoint.y);
  for (let index = 0; index < 24; index += 1) {
    await page.mouse.wheel(0, 48);
    await page.waitForTimeout(6);
  }
  await page.waitForTimeout(260);
  for (const deltaY of [0.3, 0.6, 0.62, 0.39, 1.01]) {
    await page.mouse.wheel(0, deltaY);
    await page.waitForTimeout(8);
  }
  await page.waitForTimeout(120);
  await expect
    .poll(async () => {
      const rows = await page.evaluate((surfaceId) => {
        return (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
          .filter(
            (candidate): candidate is RetainedRowDebugEntry =>
              candidate.surfaceId === surfaceId &&
              candidate.rowLabel === "Section Tag Color Choices" &&
              candidate.clientRect.y > 0 &&
              candidate.clientRect.y < window.innerHeight,
          )
          .length;
      }, GUI_CONTENT_SURFACE_ID);
      return rows;
    })
    .toBeGreaterThan(0);
}

async function performCloseZoom(page: Page, point: Point): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.keyboard.down("Control");
  try {
    for (let index = 0; index < 260; index += 1) {
      await page.mouse.wheel(0, -5);
      if (index % 10 === 0) {
        await page.waitForTimeout(6);
      }
      if (index % 5 === 0 && (await readViewportZoom(page)) >= 3.6) {
        break;
      }
    }
  } finally {
    await page.keyboard.up("Control");
  }
  await expect.poll(() => readViewportZoom(page)).toBeGreaterThan(3.4);
}

async function readViewportZoom(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const transform =
      window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport.transform;
    if (!transform) {
      throw new Error("Missing GPU flow debug transform.");
    }
    return transform.zoom;
  });
}

async function panViewport(page: Page): Promise<void> {
  const canvas = page.locator(".setta-gpu-flow__canvas").first();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Missing GPU flow canvas bounds.");
  }
  await page.mouse.move(box.x + box.width - 80, box.y + box.height - 80);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 45, {
    steps: 6,
  });
  await page.mouse.up();
  await page.waitForTimeout(80);
}

async function roundTripZoomViewport(page: Page, point: Point): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.keyboard.down("Control");
  try {
    for (let index = 0; index < 18; index += 1) {
      await page.mouse.wheel(0, -7);
      await page.waitForTimeout(4);
    }
    for (let index = 0; index < 18; index += 1) {
      await page.mouse.wheel(0, 7);
      await page.waitForTimeout(4);
    }
  } finally {
    await page.keyboard.up("Control");
  }
}

async function waitForViewportIdle(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        await page.evaluate(() => {
          const viewport =
            window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport ?? null;
          return Boolean(
            viewport &&
              !viewport.viewportInteractionActive &&
              !viewport.wheelZooming &&
              !viewport.viewportAnimating,
          );
        }),
      { timeout: 5_000 },
    )
    .toBe(true);
}

async function captureSwitchFrame({
  name,
  page,
  rect,
  testInfo,
}: {
  readonly name: string;
  readonly page: Page;
  readonly rect: Rect;
  readonly testInfo: TestInfo;
}): Promise<SwitchFrame> {
  const screenshot = await screenshotClip({ name, page, rect, testInfo });
  return {
    name,
    screenshot,
  };
}

async function screenshotClip({
  name,
  page,
  rect,
  testInfo,
}: {
  readonly name: string;
  readonly page: Page;
  readonly rect: Rect;
  readonly testInfo: TestInfo;
}): Promise<Buffer> {
  const screenshot = await page.screenshot({
    clip: rect,
    path: testInfo.outputPath(name),
  });
  await testInfo.attach(name, {
    body: screenshot,
    contentType: "image/png",
  });
  return screenshot;
}

async function waitForStableScreenshotClip(
  page: Page,
  rect: Rect,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const first = await page.screenshot({ clip: rect });
        await page.waitForTimeout(80);
        const second = await page.screenshot({ clip: rect });
        return (await compareScreenshots(page, first, second)).meanDelta;
      },
      {
        intervals: [80, 120, 180, 240],
        timeout: 2_000,
      },
    )
    .toBeLessThan(1);
}

async function analyzeHoverBands(
  page: Page,
  input: {
    readonly after: Buffer;
    readonly before: Buffer;
    readonly clip: Rect;
    readonly rows: readonly RowBand[];
  },
): Promise<readonly HoverBandStats[]> {
  return await page.evaluate(
    async ({ afterDataUrl, beforeDataUrl, clip, rows }) => {
      const [beforeImage, afterImage] = await Promise.all([
        loadImage(beforeDataUrl),
        loadImage(afterDataUrl),
      ]);
      const width = Math.min(beforeImage.naturalWidth, afterImage.naturalWidth);
      const height = Math.min(
        beforeImage.naturalHeight,
        afterImage.naturalHeight,
      );
      const beforePixels = imagePixels(beforeImage, width, height);
      const afterPixels = imagePixels(afterImage, width, height);
      return rows.map((row) => {
        const top = Math.max(0, Math.floor(row.rect.y - clip.y));
        const bottom = Math.min(
          height,
          Math.ceil(row.rect.y + row.rect.height - clip.y),
        );
        const left = Math.max(0, Math.floor(row.rect.x - clip.x));
        const right = Math.min(
          width,
          Math.ceil(row.rect.x + row.rect.width - clip.x),
        );
        let changed = 0;
        let total = 0;
        let deltaTotal = 0;
        for (let y = top; y < bottom; y += 1) {
          for (let x = left; x < right; x += 1) {
            const index = (y * width + x) * 4;
            const delta =
              Math.abs((afterPixels[index] ?? 0) - (beforePixels[index] ?? 0)) +
              Math.abs(
                (afterPixels[index + 1] ?? 0) -
                  (beforePixels[index + 1] ?? 0),
              ) +
              Math.abs(
                (afterPixels[index + 2] ?? 0) -
                  (beforePixels[index + 2] ?? 0),
              );
            total += 1;
            deltaTotal += delta / 3;
            if (delta >= 18) {
              changed += 1;
            }
          }
        }
        return {
          changedPixelRatio: total === 0 ? 0 : changed / total,
          label: row.label,
          meanDelta: total === 0 ? 0 : deltaTotal / total,
        };
      });

      async function loadImage(url: string): Promise<HTMLImageElement> {
        const image = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("Failed to decode hover screenshot."));
        });
        image.src = url;
        await loaded;
        return image;
      }

      function imagePixels(
        image: HTMLImageElement,
        imageWidth: number,
        imageHeight: number,
      ): Uint8ClampedArray {
        const canvas = document.createElement("canvas");
        canvas.width = imageWidth;
        canvas.height = imageHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          throw new Error("Missing hover analysis canvas context.");
        }
        ctx.drawImage(image, 0, 0, imageWidth, imageHeight);
        return ctx.getImageData(0, 0, imageWidth, imageHeight).data;
      }
    },
    {
      afterDataUrl: `data:image/png;base64,${input.after.toString("base64")}`,
      beforeDataUrl: `data:image/png;base64,${input.before.toString(
        "base64",
      )}`,
      clip: input.clip,
      rows: input.rows,
    },
  );
}

async function compareScreenshots(
  page: Page,
  before: Buffer,
  after: Buffer,
): Promise<{
  readonly changedPixelRatio: number;
  readonly meanDelta: number;
}> {
  return await page.evaluate(
    async ({ afterDataUrl, beforeDataUrl }) => {
      const [beforeImage, afterImage] = await Promise.all([
        loadImageForCompare(beforeDataUrl),
        loadImageForCompare(afterDataUrl),
      ]);
      const width = Math.min(beforeImage.naturalWidth, afterImage.naturalWidth);
      const height = Math.min(
        beforeImage.naturalHeight,
        afterImage.naturalHeight,
      );
      const beforePixels = imagePixels(beforeImage, width, height);
      const afterPixels = imagePixels(afterImage, width, height);
      let changed = 0;
      let deltaTotal = 0;
      const total = width * height;
      for (let index = 0; index < total * 4; index += 4) {
        const delta =
          Math.abs((afterPixels[index] ?? 0) - (beforePixels[index] ?? 0)) +
          Math.abs(
            (afterPixels[index + 1] ?? 0) - (beforePixels[index + 1] ?? 0),
          ) +
          Math.abs(
            (afterPixels[index + 2] ?? 0) - (beforePixels[index + 2] ?? 0),
          );
        deltaTotal += delta / 3;
        if (delta >= 24) {
          changed += 1;
        }
      }
      return {
        changedPixelRatio: total === 0 ? 1 : changed / total,
        meanDelta: total === 0 ? 255 : deltaTotal / total,
      };

      async function loadImageForCompare(
        url: string,
      ): Promise<HTMLImageElement> {
        const image = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("Failed to decode comparison screenshot."));
        });
        image.src = url;
        await loaded;
        return image;
      }

      function imagePixels(
        image: HTMLImageElement,
        imageWidth: number,
        imageHeight: number,
      ): Uint8ClampedArray {
        const canvas = document.createElement("canvas");
        canvas.width = imageWidth;
        canvas.height = imageHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          throw new Error("Missing comparison analysis canvas context.");
        }
        ctx.drawImage(image, 0, 0, imageWidth, imageHeight);
        return ctx.getImageData(0, 0, imageWidth, imageHeight).data;
      }
    },
    {
      afterDataUrl: `data:image/png;base64,${after.toString("base64")}`,
      beforeDataUrl: `data:image/png;base64,${before.toString("base64")}`,
    },
  );
}

async function analyzeVerticalScrollbar(
  page: Page,
  screenshot: Buffer,
): Promise<ScrollbarStats> {
  return await page.evaluate(async (dataUrl) => {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Failed to decode scrollbar screenshot."));
    });
    image.src = dataUrl;
    await loaded;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Missing scrollbar analysis canvas context.");
    }
    ctx.drawImage(image, 0, 0);
    const { data, height, width } = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const columnCoverage = Array.from({ length: width }, (_, x) => {
      let visible = 0;
      for (let y = 0; y < height; y += 1) {
        const index = (y * width + x) * 4;
        const r = data[index] ?? 0;
        const g = data[index + 1] ?? 0;
        const b = data[index + 2] ?? 0;
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (b > 40 && luminance > 20 && Math.abs(b - r) > 8) {
          visible += 1;
        }
      }
      return visible / Math.max(1, height);
    });
    const visibleColumns = columnCoverage.filter((coverage) => coverage > 0.25);
    const duplicateColumnCount = columnCoverage.filter(
      (coverage) => coverage > 0.72,
    ).length;
    const sorted = [...columnCoverage].sort((left, right) => right - left);
    return {
      duplicateColumnCount,
      maxColumnCoverage: sorted[0] ?? 0,
      primaryColumnCoverage: sorted.slice(0, 8).reduce(
        (total, coverage) => total + coverage,
        0,
      ) / 8,
      visibleColumnCount: visibleColumns.length,
    };
  }, `data:image/png;base64,${screenshot.toString("base64")}`);
}

function rowsToClip(rows: readonly RetainedRowDebugEntry[]): Rect {
  const left = Math.max(0, Math.min(...rows.map((row) => row.clientRect.x)));
  const top = Math.max(0, Math.min(...rows.map((row) => row.clientRect.y)));
  const right = Math.max(
    ...rows.map((row) => row.clientRect.x + row.clientRect.width),
  );
  const bottom = Math.max(
    ...rows.map((row) => row.clientRect.y + row.clientRect.height),
  );
  return clampScreenshotClip({
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  });
}

function clampScreenshotClip(rect: Rect): Rect {
  return {
    height: Math.max(1, Math.floor(rect.height)),
    width: Math.max(1, Math.floor(rect.width)),
    x: Math.max(0, Math.floor(rect.x)),
    y: Math.max(0, Math.floor(rect.y)),
  };
}
