import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { ensureAppReady } from "../helpers";
import {
  analyzeCodeMirrorTextInkBounds,
  analyzeRetainedLabelTextInkBounds,
  compareScreenshots,
  type Rect,
  type RetainedRowDebugEntry,
  type TextInkBounds,
} from "./settings-retained-visual-analysis";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const GUI_SECTION_ID = "settings-section__gui";
const GUI_CONTENT_SURFACE_ID = `${GUI_SECTION_ID}:param-content:unpinned`;
const SCROLL_TEXT_PREVIEW_LABEL = "Pan On Scroll Speed";
const GUI_SCROLL_LABEL_ORDER = [
  "Default Zoom Level",
  "Grid Color",
  "Grid Color Dark Mode",
  "Grid Pattern",
  "Grid Pattern Size",
  "Left Side Pane Shifts Map",
  "Max Zoom",
  "Min Zoom",
  "Pan On Drag",
  "Pan On Scroll",
  "Pan On Scroll Mode",
  "Pan On Scroll Speed",
  "Section Tag Color Choices",
  "Selection Mode",
  "Show Grid Lines",
] as const;

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("retained passive text editor previews stay attached during section scroll", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await resetGuiContentScrollToTop(page);
  const row = await resolveVisibleGuiRow(page, "Grid Pattern Size");
  await page.mouse.move(row.labelClientPoint.x, row.labelClientPoint.y);
  const surfaceClip = await resolveVisibleGuiSurfaceClip(page);
  const contentClip = clampScreenshotClip({
    height: surfaceClip.height,
    width: Math.max(160, surfaceClip.width - 36),
    x: surfaceClip.x,
    y: surfaceClip.y,
  });
  await waitForStableScreenshotClip(page, contentClip);

  const frames = [
    await captureTextPreviewScrollFrame({
      name: "initial",
      page,
      rect: contentClip,
      testInfo,
    }),
  ];
  for (let index = 0; index < 8; index += 1) {
    await page.mouse.wheel(0, 48);
    await page.waitForTimeout(18);
    frames.push(
      await captureTextPreviewScrollFrame({
        name: `wheel-${index}`,
        page,
        rect: contentClip,
        testInfo,
      }),
    );
  }

  const failures = frames.flatMap((frame) =>
    frame.textRows
      .filter((row) => row.visibleTextPixelCount < row.minimumTextPixelCount)
      .map((row) => ({
        frame: frame.name,
        row,
      })),
  );
  const frameDetails = frames.map((frame) => ({
    name: frame.name,
    textRows: frame.textRows,
  }));
  const failureDetails = JSON.stringify(
    { contentClip, failures, frames: frameDetails, surfaceClip },
    null,
    2,
  );
  expect(failures, failureDetails).toHaveLength(0);
});

test("retained passive text editor previews stay visible at close zoom", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await resetGuiContentScrollToTop(page);
  const zoomTarget = await resolveVisibleGuiRow(page, "Max Zoom");
  if (!zoomTarget.controlClientPoint) {
    throw new Error("Missing Max Zoom control point for close zoom test.");
  }
  await performCloseZoom(page, zoomTarget.controlClientPoint);
  await waitForViewportIdle(page);
  const surfaceClip = await resolveVisibleGuiSurfaceClip(page);
  const contentClip = clampScreenshotClip({
    height: surfaceClip.height,
    width: Math.max(160, surfaceClip.width - 36),
    x: surfaceClip.x,
    y: surfaceClip.y,
  });
  await waitForStableScreenshotClip(page, contentClip);
  const frame = await captureTextPreviewScrollFrame({
    name: "close-zoom",
    page,
    rect: contentClip,
    testInfo,
  });
  const visibleTrackedLabels = new Set(frame.textRows.map((row) => row.label));
  const maxZoomTextRow = frame.textRows.find((row) => row.label === "Max Zoom");
  const failureDetails = JSON.stringify(
    {
      contentClip,
      maxZoomTextRow,
      textRows: frame.textRows,
      visibleTrackedLabels: [...visibleTrackedLabels],
      zoom: await readViewportZoom(page),
    },
    null,
    2,
  );

  expect(visibleTrackedLabels.has("Max Zoom"), failureDetails).toBe(true);
  expect(
    maxZoomTextRow?.visibleTextPixelCount ?? 0,
    failureDetails,
  ).toBeGreaterThanOrEqual(maxZoomTextRow?.minimumTextPixelCount ?? 1);
});

test("retained passive text editor preview ink moves with its retained row during section scroll", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await resetGuiContentScrollToTop(page);
  await centerGuiRowControlAtZoom(page, SCROLL_TEXT_PREVIEW_LABEL, 1.5);
  const initialRow = await resolveVisibleGuiRow(
    page,
    SCROLL_TEXT_PREVIEW_LABEL,
  );
  if (!initialRow.controlClientRect) {
    throw new Error(
      `Missing ${SCROLL_TEXT_PREVIEW_LABEL} control rect before scroll.`,
    );
  }
  const initialFrame = await captureTextInkAlignmentFrame({
    name: "scroll-ink-initial",
    page,
    row: initialRow,
    testInfo,
  });
  if (!initialFrame.labelInk || !initialFrame.valueInk) {
    throw new Error(
      `Missing initial Max Zoom text ink: ${JSON.stringify(initialFrame)}`,
    );
  }
  const initialInkOffsetY =
    initialFrame.valueInk.centerY - initialFrame.labelInk.centerY;
  const frames = [initialFrame];

  await page.mouse.move(
    initialRow.labelClientPoint.x,
    initialRow.labelClientPoint.y,
  );
  for (let index = 0; index < 6; index += 1) {
    await page.mouse.wheel(0, 24);
    frames.push(
      await captureTextInkAlignmentFrameForLabel({
        label: SCROLL_TEXT_PREVIEW_LABEL,
        name: `scroll-ink-wheel-${index}`,
        page,
        testInfo,
      }),
    );
  }

  const failures = frames.slice(1).flatMap((frame) => {
    if (!frame.labelInk || !frame.valueInk) {
      return [{ frame: frame.name, reason: "missing-text-ink" }];
    }
    const offsetY = frame.valueInk.centerY - frame.labelInk.centerY;
    const offsetDeltaY = offsetY - initialInkOffsetY;
    return Math.abs(offsetDeltaY) > 2
      ? [
          {
            frame: frame.name,
            labelInk: frame.labelInk,
            offsetDeltaY,
            offsetY,
            row: frame.row,
            valueInk: frame.valueInk,
          },
        ]
      : [];
  });
  const failureDetails = JSON.stringify(
    {
      failures,
      frames: frames.map((frame) => ({
        labelInk: frame.labelInk,
        name: frame.name,
        row: frame.row,
        valueInk: frame.valueInk,
      })),
      initialInkOffsetY,
    },
    null,
    2,
  );
  expect(failures, failureDetails).toHaveLength(0);
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
  const rows = await page.evaluate(
    ({ label, surfaceId }) => {
      return (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId === surfaceId &&
          row.rowLabel === label &&
          row.clientRect.width > 16 &&
          row.clientRect.height > 8 &&
          row.clientRect.y < window.innerHeight &&
          row.clientRect.y + row.clientRect.height > 0,
      );
    },
    { label, surfaceId: GUI_CONTENT_SURFACE_ID },
  );
  const row = rows[0];
  if (!row) {
    throw new Error(`Missing visible retained GUI row ${label}`);
  }
  return row;
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

async function resetGuiContentScrollToTop(page: Page): Promise<void> {
  const row = await resolveVisibleGuiRow(page, "Pan On Scroll Mode");
  await page.mouse.move(row.labelClientPoint.x, row.labelClientPoint.y);
  for (let index = 0; index < 12; index += 1) {
    await page.mouse.wheel(0, -96);
    await page.waitForTimeout(12);
  }
  await expect
    .poll(async () => {
      return await page.evaluate((surfaceId) => {
        return (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).filter(
          (candidate): candidate is RetainedRowDebugEntry =>
            candidate.surfaceId === surfaceId &&
            candidate.rowLabel === "Grid Pattern Size" &&
            candidate.clientRect.y > 0 &&
            candidate.clientRect.y < window.innerHeight,
        ).length;
      }, GUI_CONTENT_SURFACE_ID);
    })
    .toBeGreaterThan(0);
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

async function centerGuiRowControlAtZoom(
  page: Page,
  label: string,
  zoom: number,
): Promise<void> {
  await page.evaluate(
    async ({ label, surfaceId, zoom }) => {
      const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
      const row = rows.find(
        (candidate): candidate is RetainedRowDebugEntry =>
          candidate.surfaceId === surfaceId &&
          candidate.rowLabel === label &&
          candidate.controlClientPoint !== null,
      );
      const pane = document.querySelector(".setta-gpu-flow__pane");
      const transform =
        window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport.transform;
      if (!row || !pane || !transform || !row.controlClientPoint) {
        throw new Error(`Missing retained row zoom target for ${label}.`);
      }
      const paneRect = pane.getBoundingClientRect();
      const flowCenter = {
        x:
          (row.controlClientPoint.x - paneRect.left - transform.x) /
          transform.zoom,
        y:
          (row.controlClientPoint.y - paneRect.top - transform.y) /
          transform.zoom,
      };
      const { gpuFlowViewportStore } = await import(
        "/src/gpuFlow/viewportStore.ts"
      );
      gpuFlowViewportStore.getState().setTransform({
        x: paneRect.width * 0.9 - flowCenter.x * zoom,
        y: paneRect.height * 0.46 - flowCenter.y * zoom,
        zoom,
      });
    },
    { label, surfaceId: GUI_CONTENT_SURFACE_ID, zoom },
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

async function performCloseZoom(
  page: Page,
  point: { readonly x: number; readonly y: number },
): Promise<void> {
  await page.mouse.move(point.x, point.y);
  await page.keyboard.down("Control");
  try {
    for (let index = 0; index < 320; index += 1) {
      await page.mouse.wheel(0, -5);
      if (index % 12 === 0) {
        await page.waitForTimeout(8);
      }
      if (index % 6 === 0 && (await readViewportZoom(page)) >= 4.2) {
        break;
      }
    }
  } finally {
    await page.keyboard.up("Control");
  }
  await expect.poll(() => readViewportZoom(page)).toBeGreaterThan(4);
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

async function captureTextPreviewScrollFrame({
  name,
  page,
  rect,
  testInfo,
}: {
  readonly name: string;
  readonly page: Page;
  readonly rect: Rect;
  readonly testInfo: TestInfo;
}): Promise<{
  readonly name: string;
  readonly textRows: readonly TextPreviewRowStats[];
}> {
  const screenshot = await screenshotClip({
    name: `visual-scroll-text-preview-${name}.png`,
    page,
    rect,
    testInfo,
  });
  return {
    name,
    textRows: await analyzeVisibleTextPreviewRows(page, {
      clip: rect,
      screenshot,
    }),
  };
}

async function captureTextInkAlignmentFrame({
  name,
  page,
  row,
  testInfo,
}: {
  readonly name: string;
  readonly page: Page;
  readonly row: RetainedRowDebugEntry & { readonly controlClientRect: Rect };
  readonly testInfo: TestInfo;
}): Promise<{
  readonly labelInk: TextInkBounds | null;
  readonly name: string;
  readonly row: {
    readonly controlClientRect: Rect;
    readonly rowLabel: string;
    readonly rowY: number;
  };
  readonly valueInk: TextInkBounds | null;
}> {
  const clip = await viewportScreenshotClip(page);
  const screenshot = await screenshotClip({
    name: `visual-scroll-text-ink-${name}.png`,
    page,
    rect: clip,
    testInfo,
  });
  const [labelInk, valueInk] = await Promise.all([
    analyzeRetainedLabelTextInkBounds(page, {
      clip,
      screenshot,
      searchRect: resolveLabelInkSearchRect(row),
    }),
    analyzeCodeMirrorTextInkBounds(page, {
      clip,
      screenshot,
      searchRect: resolveValueInkSearchRect(row.controlClientRect),
    }),
  ]);
  return {
    labelInk,
    name,
    row: {
      controlClientRect: row.controlClientRect,
      rowLabel: row.rowLabel,
      rowY: row.clientRect.y,
    },
    valueInk,
  };
}

async function captureTextInkAlignmentFrameForLabel({
  label,
  name,
  page,
  testInfo,
}: {
  readonly label: string;
  readonly name: string;
  readonly page: Page;
  readonly testInfo: TestInfo;
}): Promise<{
  readonly labelInk: TextInkBounds | null;
  readonly name: string;
  readonly row: {
    readonly controlClientRect: Rect;
    readonly rowLabel: string;
    readonly rowY: number;
  };
  readonly valueInk: TextInkBounds | null;
}> {
  const clip = await viewportScreenshotClip(page);
  const screenshot = await screenshotClip({
    name: `visual-scroll-text-ink-${name}.png`,
    page,
    rect: clip,
    testInfo,
  });
  const row = await resolveVisibleGuiRow(page, label);
  if (!row.controlClientRect) {
    throw new Error(`Missing ${label} control rect for ${name}.`);
  }
  const [labelInk, valueInk] = await Promise.all([
    analyzeRetainedLabelTextInkBounds(page, {
      clip,
      screenshot,
      searchRect: resolveLabelInkSearchRect(row),
    }),
    analyzeCodeMirrorTextInkBounds(page, {
      clip,
      screenshot,
      searchRect: resolveValueInkSearchRect(row.controlClientRect),
    }),
  ]);
  return {
    labelInk,
    name,
    row: {
      controlClientRect: row.controlClientRect,
      rowLabel: row.rowLabel,
      rowY: row.clientRect.y,
    },
    valueInk,
  };
}

async function viewportScreenshotClip(page: Page): Promise<Rect> {
  return await page.evaluate(() => ({
    height: window.innerHeight,
    width: window.innerWidth,
    x: 0,
    y: 0,
  }));
}

function resolveValueInkSearchRect(rect: Rect): Rect {
  return {
    height: rect.height,
    width: Math.min(rect.width, 220),
    x: rect.x,
    y: rect.y,
  };
}

function resolveLabelInkSearchRect(
  row: RetainedRowDebugEntry & { readonly controlClientRect: Rect },
): Rect {
  return {
    height: row.clientRect.height,
    width: Math.max(1, row.controlClientRect.x - row.clientRect.x - 8),
    x: row.clientRect.x,
    y: row.clientRect.y,
  };
}

type TextPreviewRowStats = {
  readonly label: string;
  readonly minimumTextPixelCount: number;
  readonly rowY: number;
  readonly visibleTextPixelCount: number;
};

async function analyzeVisibleTextPreviewRows(
  page: Page,
  input: {
    readonly clip: Rect;
    readonly screenshot: Buffer;
  },
): Promise<readonly TextPreviewRowStats[]> {
  return await page.evaluate(
    async ({ clip, screenshotDataUrl, surfaceId, trackedLabels }) => {
      const trackedLabelSet = new Set(trackedLabels);
      const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
        .filter(
          (row): row is RetainedRowDebugEntry =>
            row.surfaceId === surfaceId &&
            trackedLabelSet.has(row.rowLabel) &&
            row.controlKind === "text-like" &&
            row.controlClientRect !== null &&
            row.clientRect.width > 16 &&
            row.clientRect.height > 8 &&
            row.controlClientRect.y >= clip.y + 1 &&
            row.controlClientRect.y + row.controlClientRect.height <=
              clip.y + clip.height - 1 &&
            row.clientRect.y < clip.y + clip.height &&
            row.clientRect.y + row.clientRect.height > clip.y,
        )
        .sort((left, right) => left.clientRect.y - right.clientRect.y);
      const image = await loadImage(screenshotDataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Missing text preview analysis canvas context.");
      }
      ctx.drawImage(image, 0, 0);
      const { data, height, width } = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      return rows.map((row) => {
        const controlRect = row.controlClientRect;
        if (!controlRect) {
          throw new Error(`Missing control rect for ${row.rowLabel}`);
        }
        const left = Math.max(0, Math.floor(controlRect.x - clip.x));
        const right = Math.min(
          width,
          Math.ceil(controlRect.x + Math.min(controlRect.width, 260) - clip.x),
        );
        const top = Math.max(0, Math.floor(controlRect.y - clip.y));
        const bottom = Math.min(
          height,
          Math.ceil(controlRect.y + controlRect.height - clip.y),
        );
        let visibleTextPixelCount = 0;
        for (let y = top; y < bottom; y += 1) {
          for (let x = left; x < right; x += 1) {
            const index = (y * width + x) * 4;
            const r = data[index] ?? 0;
            const g = data[index + 1] ?? 0;
            const b = data[index + 2] ?? 0;
            if (isCodeMirrorTextPixel(r, g, b)) {
              visibleTextPixelCount += 1;
            }
          }
        }
        return {
          label: row.rowLabel,
          minimumTextPixelCount: 1,
          rowY: row.clientRect.y,
          visibleTextPixelCount,
        };
      });

      async function loadImage(url: string): Promise<HTMLImageElement> {
        const image = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("Failed to decode text preview screenshot."));
        });
        image.src = url;
        await loaded;
        return image;
      }

      function isCodeMirrorTextPixel(r: number, g: number, b: number): boolean {
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luma < 70) {
          return false;
        }
        const coolText = b > 95 && g > 75 && b - r > 18;
        const purpleText = r > 115 && b > 115 && b - g > 10;
        return coolText || purpleText;
      }
    },
    {
      clip: input.clip,
      screenshotDataUrl: `data:image/png;base64,${input.screenshot.toString(
        "base64",
      )}`,
      surfaceId: GUI_CONTENT_SURFACE_ID,
      trackedLabels: GUI_SCROLL_LABEL_ORDER,
    },
  );
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

function clampScreenshotClip(rect: Rect): Rect {
  return {
    height: Math.max(1, Math.floor(rect.height)),
    width: Math.max(1, Math.floor(rect.width)),
    x: Math.max(0, Math.floor(rect.x)),
    y: Math.max(0, Math.floor(rect.y)),
  };
}
