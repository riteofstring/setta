import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { ensureAppReady } from "../helpers";
import {
  analyzeHoverBands,
  analyzeHoverContrast,
  analyzeSwitchThumbMotion,
  analyzeVerticalScrollbar,
  compareScreenshots,
  type HoverBandStats,
  type Point,
  type Rect,
  type RetainedRowDebugEntry,
  type SwitchFrame,
  type SwitchThumbStats,
} from "./settings-retained-visual-analysis";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const GUI_SECTION_ID = "settings-section__gui";
const GUI_CONTENT_SURFACE_ID = `${GUI_SECTION_ID}:param-content:unpinned`;
const LEFT_PANE_SHIFT_LABEL = "Left Side Pane Shifts Map";
const SWITCH_ANIMATION_LABEL = LEFT_PANE_SHIFT_LABEL;
const SWITCH_ANIMATION_SETTING_KEY = "leftSidePaneShiftsMap";
const SWITCH_ANIMATION_CLIP_HEIGHT = 88;
const SWITCH_ANIMATION_CLIP_WIDTH = 240;
const SWITCH_RENDERED_TRACK_CENTER_OFFSET_X = 31;
const SWITCH_RENDERED_TRACK_CENTER_OFFSET_Y = 14;
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

type ScrollFrame = {
  readonly marker: number;
  readonly name: string;
  readonly screenshot: Buffer;
  readonly visibleRows: readonly {
    readonly label: string;
    readonly y: number;
  }[];
};

type GuiSettingKey = "leftSidePaneShiftsMap" | "panOnScroll";

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

test("retained row hover highlight remains subtle and readable in dark mode", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  const row = await resolveVisibleGuiRow(page, "Max Zoom");
  await moveAwayFromRetainedRows(page);
  const clip = rowsToClip([row]);
  await waitForStableScreenshotClip(page, clip);
  const before = await screenshotClip({
    name: "visual-hover-contrast-before.png",
    page,
    rect: clip,
    testInfo,
  });

  await page.mouse.move(row.labelClientPoint.x, row.labelClientPoint.y);
  await page.waitForTimeout(120);
  const after = await screenshotClip({
    name: "visual-hover-contrast-after.png",
    page,
    rect: clip,
    testInfo,
  });
  const afterRow = await resolveVisibleGuiRow(page, "Max Zoom");

  const stats = await analyzeHoverContrast(page, {
    after,
    before,
    clip,
    row: {
      label: row.rowLabel,
      rect: row.clientRect,
    },
  });
  const failureDetails = JSON.stringify(
    { afterRow, clip, row, stats },
    null,
    2,
  );
  expect(stats.changedPixelRatio, failureDetails).toBeGreaterThan(0.08);
  expect(stats.meanDelta, failureDetails).toBeGreaterThan(2.5);
  expect(Math.abs(stats.backgroundLumaDelta), failureDetails).toBeLessThan(10);
  expect(stats.afterContrast, failureDetails).toBeGreaterThanOrEqual(
    stats.beforeContrast * 0.95,
  );
});

test("retained switch click animates the thumb monotonically", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  const zoomTarget = await resolveVisibleGuiRow(page, SWITCH_ANIMATION_LABEL);
  await performCloseZoom(page, zoomTarget.labelClientPoint);
  const row = await bringVisibleGuiRowControlIntoView(
    page,
    SWITCH_ANIMATION_LABEL,
  );
  if (!row.controlClientPoint) {
    throw new Error(
      `Missing switch control point for ${SWITCH_ANIMATION_LABEL}`,
    );
  }
  let initialChecked = Boolean(
    await readGuiSetting(page, SWITCH_ANIMATION_SETTING_KEY),
  );
  let controlRect = row.controlClientRect;
  if (!controlRect) {
    throw new Error(`Missing switch control rect for ${SWITCH_ANIMATION_LABEL}`);
  }
  let clickPoint = resolveRenderedSwitchClickPoint(controlRect);
  if (initialChecked) {
    await page.mouse.click(clickPoint.x, clickPoint.y);
    await page.waitForTimeout(320);
    const uncheckedRow = await bringVisibleGuiRowControlIntoView(
      page,
      SWITCH_ANIMATION_LABEL,
    );
    if (!uncheckedRow.controlClientPoint) {
      throw new Error(
        `Missing switch control point for ${SWITCH_ANIMATION_LABEL}`,
      );
    }
    controlRect = uncheckedRow.controlClientRect;
    if (!controlRect) {
      throw new Error(
        `Missing unchecked switch control rect for ${SWITCH_ANIMATION_LABEL}`,
      );
    }
    clickPoint = resolveRenderedSwitchClickPoint(controlRect);
    initialChecked = false;
  }
  const clip = await resolveSwitchClipFromControlRect(page, controlRect);
  await waitForStableScreenshotClip(page, clip);
  const before = await captureSwitchFrame({
    name: "visual-switch-before.png",
    page,
    rect: clip,
    testInfo,
  });

  await page.mouse.move(clickPoint.x, clickPoint.y);
  await page.mouse.down();
  await page.mouse.up();
  const samples: SwitchFrame[] = [
    await captureSwitchFrame({
      name: "visual-switch-immediate.png",
      page,
      rect: clip,
      testInfo,
    }),
  ];
  for (let frameIndex = 0; frameIndex < 14; frameIndex += 1) {
    await waitForAnimationFrame(page);
    samples.push(
      await captureSwitchFrame({
        name: `visual-switch-raf-${frameIndex}.png`,
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

  await assertSwitchTransitionFrames({
    frames: [before, ...samples, settled],
    initialChecked,
    page,
  });
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

test("retained section wheel scrolling moves visibly in one direction", async ({
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
  const frames: ScrollFrame[] = [
    await captureScrollContentFrame({
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
      await captureScrollContentFrame({
        name: `wheel-${index}`,
        page,
        rect: contentClip,
        testInfo,
      }),
    );
  }

  const deltas = frames.slice(1).map((frame, index) => ({
    delta: frame.marker - (frames[index]?.marker ?? frame.marker),
    from: frames[index]?.name ?? "missing",
    to: frame.name,
  }));
  const activeDeltas = deltas.filter((delta) => Math.abs(delta.delta) > 2);
  const forwardTravel =
    (frames[frames.length - 1]?.marker ?? 0) - (frames[0]?.marker ?? 0);
  const reversals = activeDeltas.filter((delta) => delta.delta < -2);
  const frameDetails = frames.map((frame) => ({
    marker: frame.marker,
    name: frame.name,
    visibleRows: frame.visibleRows,
  }));
  const failureDetails = JSON.stringify(
    {
      activeDeltas,
      contentClip,
      deltas,
      frames: frameDetails,
      forwardTravel,
      reversals,
      surfaceClip,
    },
    null,
    2,
  );
  expect(activeDeltas.length, failureDetails).toBeGreaterThanOrEqual(4);
  expect(forwardTravel, failureDetails).toBeGreaterThan(30);
  expect(reversals, failureDetails).toHaveLength(0);
});

test("retained gui hover switch and scroll stay visually coherent", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await resetGuiContentScrollToTop(page);
  const hoverRow = await resolveVisibleGuiRow(page, "Max Zoom");
  const switchRow = await resolveVisibleGuiRow(page, LEFT_PANE_SHIFT_LABEL);
  if (!switchRow.controlClientPoint) {
    throw new Error(
      `Missing switch control point for ${LEFT_PANE_SHIFT_LABEL}`,
    );
  }
  const hoverClip = rowsToClip([hoverRow]);
  await waitForStableScreenshotClip(page, hoverClip);
  const beforeHover = await screenshotClip({
    name: "visual-bundle-before-hover.png",
    page,
    rect: hoverClip,
    testInfo,
  });

  await page.mouse.move(
    hoverRow.labelClientPoint.x,
    hoverRow.labelClientPoint.y,
  );
  await page.waitForTimeout(80);
  const afterHover = await screenshotClip({
    name: "visual-bundle-after-hover.png",
    page,
    rect: hoverClip,
    testInfo,
  });
  const hoverStats = await analyzeHoverBands(page, {
    after: afterHover,
    before: beforeHover,
    clip: hoverClip,
    rows: [{ label: hoverRow.rowLabel, rect: hoverRow.clientRect }],
  });

  const switchClip = rowsToClip([switchRow]);
  const beforeSwitch = await screenshotClip({
    name: "visual-bundle-before-switch.png",
    page,
    rect: switchClip,
    testInfo,
  });
  await page.mouse.click(
    switchRow.controlClientPoint.x,
    switchRow.controlClientPoint.y,
  );
  await page.waitForTimeout(180);
  const afterSwitch = await screenshotClip({
    name: "visual-bundle-after-switch.png",
    page,
    rect: switchClip,
    testInfo,
  });
  const switchDelta = await compareScreenshots(page, beforeSwitch, afterSwitch);

  const scrollRow = await resolveVisibleGuiRow(page, "Grid Pattern Size");
  await page.mouse.move(
    scrollRow.labelClientPoint.x,
    scrollRow.labelClientPoint.y,
  );
  const surfaceClip = await resolveVisibleGuiSurfaceClip(page);
  const contentClip = clampScreenshotClip({
    height: surfaceClip.height,
    width: Math.max(160, surfaceClip.width - 36),
    x: surfaceClip.x,
    y: surfaceClip.y,
  });
  const firstScrollFrame = await captureScrollContentFrame({
    name: "bundle-scroll-initial",
    page,
    rect: contentClip,
    testInfo,
  });
  for (let index = 0; index < 4; index += 1) {
    await page.mouse.wheel(0, 48);
    await page.waitForTimeout(18);
  }
  const finalScrollFrame = await captureScrollContentFrame({
    name: "bundle-scroll-final",
    page,
    rect: contentClip,
    testInfo,
  });
  const forwardTravel = finalScrollFrame.marker - firstScrollFrame.marker;
  const failureDetails = JSON.stringify(
    {
      finalScrollFrame: {
        marker: finalScrollFrame.marker,
        visibleRows: finalScrollFrame.visibleRows,
      },
      firstScrollFrame: {
        marker: firstScrollFrame.marker,
        visibleRows: firstScrollFrame.visibleRows,
      },
      forwardTravel,
      hoverStats,
      switchDelta,
    },
    null,
    2,
  );
  expect(hoverStats[0]?.changedPixelRatio ?? 0, failureDetails).toBeGreaterThan(
    0.08,
  );
  expect(switchDelta.meanDelta, failureDetails).toBeGreaterThan(0.4);
  expect(forwardTravel, failureDetails).toBeGreaterThan(20);
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
        return (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).filter(
          (row): row is RetainedRowDebugEntry =>
            row.surfaceId === surfaceId &&
            row.rowLabel === "Section Tag Color Choices" &&
            row.clientRect.y > 0 &&
            row.clientRect.y < window.innerHeight,
        ).length;
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
        return (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []).filter(
          (candidate): candidate is RetainedRowDebugEntry =>
            candidate.surfaceId === surfaceId &&
            candidate.rowLabel === "Section Tag Color Choices" &&
            candidate.clientRect.y > 0 &&
            candidate.clientRect.y < window.innerHeight,
        ).length;
      }, GUI_CONTENT_SURFACE_ID);
      return rows;
    })
    .toBeGreaterThan(0);
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

async function bringVisibleGuiRowControlIntoView(
  page: Page,
  label: string,
): Promise<RetainedRowDebugEntry> {
  let row = await resolveVisibleGuiRow(page, label);
  if (!row.controlClientPoint) {
    return row;
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const viewport = await page.evaluate(() => ({
      height: window.innerHeight,
      width: window.innerWidth,
    }));
    if (
      row.controlClientPoint.x > 96 &&
      row.controlClientPoint.x < viewport.width - 96 &&
      row.controlClientPoint.y > 96 &&
      row.controlClientPoint.y < viewport.height - 96
    ) {
      return row;
    }
    const beforeDistance = Math.abs(
      row.controlClientPoint.x - viewport.width / 2,
    );
    const primaryDx =
      row.controlClientPoint.x > viewport.width - 96 ? -320 : 320;
    await panViewportBy(page, primaryDx, 0);
    let nextRow = await resolveVisibleGuiRow(page, label);
    if (nextRow.controlClientPoint) {
      const afterDistance = Math.abs(
        nextRow.controlClientPoint.x - viewport.width / 2,
      );
      if (afterDistance <= beforeDistance) {
        row = nextRow;
        continue;
      }
    }
    await panViewportBy(page, -primaryDx * 2, 0);
    nextRow = await resolveVisibleGuiRow(page, label);
    if (nextRow.controlClientPoint) {
      row = nextRow;
    }
  }
  return row;
}

async function panViewportBy(
  page: Page,
  dx: number,
  dy: number,
): Promise<void> {
  const canvas = page.locator(".setta-gpu-flow__canvas").first();
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Missing GPU flow canvas bounds.");
  }
  const start = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(100);
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

async function readGuiSetting(
  page: Page,
  key: GuiSettingKey,
): Promise<unknown> {
  return await page.evaluate(async (settingKey) => {
    const { useSettings } = await import("/src/state/definitions.ts");
    return (useSettings.getState().gui as Record<string, unknown>)[settingKey];
  }, key);
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

async function waitForAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
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

async function assertSwitchTransitionFrames({
  frames,
  initialChecked,
  page,
}: {
  readonly frames: readonly SwitchFrame[];
  readonly initialChecked: boolean;
  readonly page: Page;
}): Promise<void> {
  const thumbStats = await analyzeSwitchThumbMotion(page, frames);
  const detectedStats = thumbStats.filter(
    (stats): stats is SwitchThumbStats & { readonly progress: number } =>
      stats.progress !== null,
  );
  const backtracks = [];
  let maxProgress = Number.NEGATIVE_INFINITY;
  for (const stats of detectedStats) {
    if (stats.progress < maxProgress - 0.08) {
      backtracks.push({
        name: stats.name,
        previousMaxProgress: maxProgress,
        progress: stats.progress,
      });
    }
    maxProgress = Math.max(maxProgress, stats.progress);
  }
  const distinctPositions = new Set(
    detectedStats.map((stats) =>
      stats.thumbCenterX === null
        ? "missing"
        : String(Math.round(stats.thumbCenterX)),
    ),
  );
  const intermediateSamples = detectedStats.filter(
    (stats) => stats.progress > 0.12 && stats.progress < 0.88,
  );
  const missingTrackStates = detectedStats.filter(
    (stats) => stats.trackChecked === null,
  );
  const contradictoryTrackStates = detectedStats.filter((stats) => {
    if (stats.trackChecked === null) {
      return true;
    }
    if (stats.progress <= 0.02) {
      return stats.trackChecked !== initialChecked;
    }
    if (stats.progress >= 0.6) {
      return stats.trackChecked !== !initialChecked;
    }
    return false;
  });
  const failureDetails = JSON.stringify(
    {
      backtracks,
      contradictoryTrackStates,
      distinctPositions: [...distinctPositions],
      initialChecked,
      missingTrackStates,
      thumbStats,
    },
    null,
    2,
  );
  expect(detectedStats.length, failureDetails).toBe(frames.length);
  expect(distinctPositions.size, failureDetails).toBeGreaterThanOrEqual(4);
  expect(intermediateSamples.length, failureDetails).toBeGreaterThan(0);
  expect(backtracks, failureDetails).toHaveLength(0);
  expect(missingTrackStates, failureDetails).toHaveLength(0);
  expect(contradictoryTrackStates, failureDetails).toHaveLength(0);
}

async function captureScrollContentFrame({
  name,
  page,
  rect,
  testInfo,
}: {
  readonly name: string;
  readonly page: Page;
  readonly rect: Rect;
  readonly testInfo: TestInfo;
}): Promise<ScrollFrame> {
  const screenshot = await screenshotClip({
    name: `visual-scroll-monotonic-${name}.png`,
    page,
    rect,
    testInfo,
  });
  const marker = await readVisibleGuiContentScrollMarker(page);
  return {
    marker: marker.marker,
    name,
    screenshot,
    visibleRows: marker.visibleRows,
  };
}

async function readVisibleGuiContentScrollMarker(page: Page): Promise<{
  readonly marker: number;
  readonly visibleRows: readonly {
    readonly label: string;
    readonly y: number;
  }[];
}> {
  return await page.evaluate(
    ({ labelOrder, surfaceId }) => {
      const orderByLabel = new Map(
        labelOrder.map((label, index) => [label, index]),
      );
      const rows = (window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [])
        .filter(
          (row): row is RetainedRowDebugEntry =>
            row.surfaceId === surfaceId &&
            orderByLabel.has(row.rowLabel) &&
            row.clientRect.width > 16 &&
            row.clientRect.height > 8 &&
            row.clientRect.y < window.innerHeight &&
            row.clientRect.y + row.clientRect.height > 0,
        )
        .sort((left, right) => left.clientRect.y - right.clientRect.y);
      if (rows.length < 3) {
        throw new Error(
          `Missing enough visible GUI rows for scroll marker: ${JSON.stringify(
            rows.map((row) => row.rowLabel),
          )}`,
        );
      }
      const rowHeight = median(rows.map((row) => row.clientRect.height));
      const markers = rows.map((row) => {
        const order = orderByLabel.get(row.rowLabel);
        if (order === undefined) {
          throw new Error(`Missing retained row order for ${row.rowLabel}.`);
        }
        return order * rowHeight - row.clientRect.y;
      });
      return {
        marker: median(markers),
        visibleRows: rows.map((row) => ({
          label: row.rowLabel,
          y: row.clientRect.y,
        })),
      };

      function median(values: readonly number[]): number {
        if (values.length === 0) {
          return 0;
        }
        const sorted = [...values].sort((left, right) => left - right);
        return sorted[Math.floor(sorted.length / 2)] ?? 0;
      }
    },
    {
      labelOrder: GUI_SCROLL_LABEL_ORDER,
      surfaceId: GUI_CONTENT_SURFACE_ID,
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

async function resolveSwitchClipFromControlRect(
  page: Page,
  rect: Rect,
): Promise<Rect> {
  const height = Math.min(
    SWITCH_ANIMATION_CLIP_HEIGHT,
    Math.max(1, rect.height),
  );
  const width = Math.min(
    SWITCH_ANIMATION_CLIP_WIDTH,
    Math.max(1, rect.width),
  );
  return await clampScreenshotClipToViewport(page, {
    height,
    width,
    x: rect.x,
    y: rect.y + rect.height / 2 - height / 2,
  });
}

function resolveRenderedSwitchClickPoint(rect: Rect): Point {
  return {
    x: rect.x + Math.min(rect.width / 2, SWITCH_RENDERED_TRACK_CENTER_OFFSET_X),
    y: rect.y + Math.min(rect.height / 2, SWITCH_RENDERED_TRACK_CENTER_OFFSET_Y),
  };
}

async function clampScreenshotClipToViewport(
  page: Page,
  rect: Rect,
): Promise<Rect> {
  return await page.evaluate((input) => {
    const width = Math.min(
      Math.max(1, Math.floor(input.width)),
      Math.max(1, window.innerWidth - 1),
    );
    const height = Math.min(
      Math.max(1, Math.floor(input.height)),
      Math.max(1, window.innerHeight - 1),
    );
    const x = Math.min(
      Math.max(0, Math.floor(input.x)),
      Math.max(0, window.innerWidth - width),
    );
    const y = Math.min(
      Math.max(0, Math.floor(input.y)),
      Math.max(0, window.innerHeight - height),
    );
    return { height, width, x, y };
  }, rect);
}
