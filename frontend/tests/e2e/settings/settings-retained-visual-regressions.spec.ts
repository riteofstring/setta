import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { installGpuFlowPerformanceProbeForCurrentPage } from "../gpuFlowPerformanceProbe";
import { ensureAppReady, postBackend } from "../helpers";
import { waitForGuiRowHoverState } from "./settings-retained-row-hover-helpers";
import { readVisibleRetainedContentScrollMarker } from "./settings-retained-scroll-marker";
import {
  analyzeHoverBands,
  analyzeHoverContrast,
  analyzeVerticalScrollbar,
  assertSwitchTransitionFrames,
  compareScreenshots,
  type HoverBandStats,
  type Point,
  type Rect,
  type RetainedRowDebugEntry,
  type SwitchFrame,
} from "./settings-retained-visual-analysis";
import {
  clampScreenshotClip,
  clampScreenshotClipToViewport,
  screenshotClip,
  waitForAnimationFrame,
  waitForStableScreenshotClip,
} from "./settings-retained-visual-regression-helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const GUI_SECTION_ID = "settings-section__gui";
const GUI_CONTENT_SURFACE_ID = `${GUI_SECTION_ID}:param-content:unpinned`;
const LEFT_PANE_SHIFT_LABEL = "Left Side Pane Shifts Map";
const BUNDLE_SWITCH_LABEL = LEFT_PANE_SHIFT_LABEL;
const BUNDLE_SWITCH_SETTING_KEY = "leftSidePaneShiftsMap";
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

test("retained gui hover switch and scroll stay visually coherent", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await resetGuiContentScrollToTop(page);
  const hoverRow = await resolveVisibleGuiRow(page, "Max Zoom");
  await moveAwayFromRetainedRows(page);
  await waitForGuiRowHoverState(page, GUI_CONTENT_SURFACE_ID, null);
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
    { steps: 4 },
  );
  await waitForGuiRowHoverState(
    page,
    GUI_CONTENT_SURFACE_ID,
    hoverRow.rowLabel,
  );
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
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

  const switchRow = await resolveVisibleGuiRow(page, BUNDLE_SWITCH_LABEL);
  if (!switchRow.controlClientPoint) {
    throw new Error(`Missing switch control point for ${BUNDLE_SWITCH_LABEL}`);
  }
  if (!switchRow.controlClientRect) {
    throw new Error(`Missing switch control rect for ${BUNDLE_SWITCH_LABEL}`);
  }
  const switchClip = await resolveSwitchClipFromControlRect(
    page,
    switchRow.controlClientRect,
  );
  const beforeSwitch = await screenshotClip({
    name: "visual-bundle-before-switch.png",
    page,
    rect: switchClip,
    testInfo,
  });
  const switchInitialChecked = Boolean(
    await readGuiSetting(page, BUNDLE_SWITCH_SETTING_KEY),
  );
  const switchClickPoint = await resolveVisibleGuiRowSwitchInteractionPoint(
    page,
    switchRow,
  );
  if (!switchClickPoint) {
    throw new Error(`Missing switch click point for ${BUNDLE_SWITCH_LABEL}`);
  }
  await page.mouse.click(switchClickPoint.x, switchClickPoint.y);
  await expect
    .poll(async () =>
      Boolean(await readGuiSetting(page, BUNDLE_SWITCH_SETTING_KEY)),
    )
    .toBe(!switchInitialChecked);
  await expect
    .poll(
      async () => {
        await waitForAnimationFrame(page);
        const current = await page.screenshot({ clip: switchClip });
        return (await compareScreenshots(page, beforeSwitch, current))
          .meanDelta;
      },
      {
        intervals: [80, 120, 180, 240, 320],
        timeout: 2_000,
      },
    )
    .toBeGreaterThan(0.4);
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

test("retained switch click animates the thumb monotonically", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  const zoomTarget = await resolveVisibleGuiRow(page, SWITCH_ANIMATION_LABEL);
  await performCloseZoom(
    page,
    zoomTarget.controlClientPoint ?? zoomTarget.labelClientPoint,
  );
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
  const originalChecked = initialChecked;
  let controlRect = row.controlClientRect;
  if (!controlRect) {
    throw new Error(
      `Missing switch control rect for ${SWITCH_ANIMATION_LABEL}`,
    );
  }
  let clickPoint = await resolveRenderedSwitchClickPoint(page, controlRect);
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
    clickPoint = await resolveRenderedSwitchClickPoint(page, controlRect);
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

  if (
    Boolean(await readGuiSetting(page, SWITCH_ANIMATION_SETTING_KEY)) !==
    originalChecked
  ) {
    const restoreRow = await bringVisibleGuiRowControlIntoView(
      page,
      SWITCH_ANIMATION_LABEL,
    );
    const restorePoint = await resolveVisibleGuiRowSwitchInteractionPoint(
      page,
      restoreRow,
    );
    if (!restorePoint) {
      throw new Error(
        `Missing switch restore point for ${SWITCH_ANIMATION_LABEL}`,
      );
    }
    await page.mouse.click(restorePoint.x, restorePoint.y);
    await expect
      .poll(async () =>
        Boolean(await readGuiSetting(page, SWITCH_ANIMATION_SETTING_KEY)),
      )
      .toBe(originalChecked);
    await page.waitForTimeout(180);
  }
  await page.getByRole("button", { name: "fit view" }).click();
  await waitForViewportIdle(page);
});

test("rapid row hover shows exactly one retained row highlight", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await installGpuFlowPerformanceProbeForCurrentPage(page);
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
  await waitForGuiRowHoverState(page, GUI_CONTENT_SURFACE_ID, null);

  const clip = rowsToClip(rows);
  const warmupRow = rows[0];
  if (warmupRow) {
    await page.mouse.move(
      warmupRow.labelClientPoint.x,
      warmupRow.labelClientPoint.y,
      { steps: 4 },
    );
    await waitForGuiRowHoverState(
      page,
      GUI_CONTENT_SURFACE_ID,
      warmupRow.rowLabel,
    );
    await waitForAnimationFrame(page);
    await waitForAnimationFrame(page);
    await moveAwayFromRetainedRows(page);
    await waitForGuiRowHoverState(page, GUI_CONTENT_SURFACE_ID, null);
  }
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
    await page.mouse.move(row.labelClientPoint.x, row.labelClientPoint.y, {
      steps: 4,
    });
    await waitForGuiRowHoverState(page, GUI_CONTENT_SURFACE_ID, row.rowLabel);
    await waitForAnimationFrame(page);
    await waitForAnimationFrame(page);
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
  const zoomTarget = await resolveVisibleGuiRow(page, SWITCH_ANIMATION_LABEL);
  await performCloseZoom(page, zoomTarget.labelClientPoint);
  const row = await bringVisibleGuiRowLabelIntoView(
    page,
    SWITCH_ANIMATION_LABEL,
  );
  await moveAwayFromRetainedRows(page);
  const labelSampleRect = resolveHoverContrastLabelSampleRect(row);
  const clip = clampScreenshotClip(labelSampleRect);
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
      rect: labelSampleRect,
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
    stats.beforeContrast * 0.65,
  );
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
  await waitForStableScreenshotClip(page, beforeClip);
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
  await waitForStableScreenshotClip(page, afterClip);
  const after = await screenshotClip({
    name: "visual-scroll-after-pan-zoom.png",
    page,
    rect: afterClip,
    testInfo,
  });

  const similarity = await compareScreenshots(page, before, after);
  const rowMotion = afterRows.map((row, index) => {
    const beforeRow = beforeRows[index];
    return {
      dx: beforeRow ? row.clientRect.x - beforeRow.clientRect.x : null,
      dy: beforeRow ? row.clientRect.y - beforeRow.clientRect.y : null,
      rowLabel: row.rowLabel,
    };
  });
  const failureDetails = JSON.stringify(
    { afterRows, beforeRows, rowMotion, similarity },
    null,
    2,
  );
  expect(
    afterRows.map((row) => row.rowLabel),
    failureDetails,
  ).toEqual(beforeRows.map((row) => row.rowLabel));
  expect(
    afterRows.map((row) => row.surfaceScrollOffset),
    failureDetails,
  ).toEqual(beforeRows.map((row) => row.surfaceScrollOffset));
  expect(
    rowMotion.every(
      (motion) =>
        motion.dx !== null &&
        motion.dy !== null &&
        Math.abs(motion.dx - (rowMotion[0]?.dx ?? motion.dx)) < 1 &&
        Math.abs(motion.dy - (rowMotion[0]?.dy ?? motion.dy)) < 1,
    ),
    failureDetails,
  ).toBe(true);
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

test("retained scrollbar renders as one coherent vertical control", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  await wheelGuiContentDown(page);
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
  const scrollbarClip = await resolveVisibleGuiScrollbarClip(page);
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
  expect(stats.visibleColumnBandCount, failureDetails).toBeLessThanOrEqual(2);
});

async function openSettings(page: Page): Promise<void> {
  await ensureAppReady(page);
  await postBackend(page, "/setActiveViewMode", {
    activeViewModeId: "settings-core",
    projectConfigId: "settings",
  });
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await disableMinimapIfEnabled(page);
  await page.getByRole("button", { exact: true, name: "Core" }).click();
  await waitForCoreSettingsView(page);
  await page.getByRole("button", { name: "fit view" }).click();
  await waitForViewportIdle(page);
  await expect(
    page.locator(`.setta-gpu-flow__node[data-id="${GUI_SECTION_ID}"]`),
  ).toBeVisible();
  await waitForRetainedRows(page);
}

async function disableMinimapIfEnabled(page: Page): Promise<void> {
  const minimapToggle = page.getByRole("button", { name: "toggle minimap" });
  if ((await minimapToggle.count()) === 0) {
    return;
  }
  if ((await minimapToggle.first().getAttribute("aria-pressed")) !== "true") {
    return;
  }
  await minimapToggle.first().click();
  await waitForAnimationFrame(page);
}

async function waitForCoreSettingsView(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelectorAll(".setta-gpu-flow__node").length <= 10,
  );
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

async function resolveVisibleGuiScrollbarClip(page: Page): Promise<Rect> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    const rect = await readVisibleGuiScrollbarClip(page);
    if (rect) {
      return clampScreenshotClip(rect);
    }
    await page.evaluate(() => {
      window.__SETTA_GPU_FLOW_DEBUG_REQUEST_FRAME__?.("manual");
    });
    await page.waitForTimeout(50);
  }
  throw new Error("Missing visible GUI retained scrollbar track.");
}

async function readVisibleGuiScrollbarClip(page: Page): Promise<Rect | null> {
  return await page.evaluate((surfaceId) => {
    const scrollbarSurfaces = (
      window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__?.() ?? []
    )
      .filter(
        (surface) =>
          surface.kind === "solid-rounded-rect" &&
          surface.surfaceId.startsWith(`${surfaceId}:scrollbar:y:`) &&
          surface.clientRect.width > 2 &&
          surface.clientRect.height > 2 &&
          surface.clientRect.x + surface.clientRect.width > 0 &&
          surface.clientRect.y + surface.clientRect.height > 0 &&
          surface.clientRect.x < window.innerWidth &&
          surface.clientRect.y < window.innerHeight,
      )
      .map((surface) => ({
        clientRect: surface.clientRect,
        surfaceId: surface.surfaceId,
      }));
    const track = scrollbarSurfaces.find(
      (surface) => surface.surfaceId === `${surfaceId}:scrollbar:y:track`,
    );
    if (!track) {
      return null;
    }
    const x = track.clientRect.x - 5;
    return {
      height: track.clientRect.height,
      width: Math.max(18, track.clientRect.width + 10),
      x,
      y: track.clientRect.y,
    };
  }, GUI_CONTENT_SURFACE_ID);
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
  await waitForViewportIdle(page);
}

async function bringVisibleGuiRowControlIntoView(
  page: Page,
  label: string,
): Promise<RetainedRowDebugEntry> {
  let row = await resolveVisibleGuiRow(page, label);
  let controlPoint = await resolveVisibleGuiRowSwitchInteractionPoint(
    page,
    row,
  );
  if (!controlPoint) {
    return row;
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const viewport = await page.evaluate(() => ({
      height: window.innerHeight,
      width: window.innerWidth,
    }));
    if (
      controlPoint.x > 96 &&
      controlPoint.x < viewport.width - 96 &&
      controlPoint.y > 96 &&
      controlPoint.y < viewport.height - 96
    ) {
      return row;
    }
    await translateViewportBy(page, viewport.width / 2 - controlPoint.x, 0);
    const nextRow = await resolveVisibleGuiRow(page, label);
    const nextControlPoint = await resolveVisibleGuiRowSwitchInteractionPoint(
      page,
      nextRow,
    );
    if (nextControlPoint) {
      row = nextRow;
      controlPoint = nextControlPoint;
    }
  }
  return row;
}

async function bringVisibleGuiRowLabelIntoView(
  page: Page,
  label: string,
): Promise<RetainedRowDebugEntry> {
  let row = await resolveVisibleGuiRow(page, label);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const viewport = await page.evaluate(() => ({
      height: window.innerHeight,
      width: window.innerWidth,
    }));
    if (
      row.labelClientPoint.x > 96 &&
      row.labelClientPoint.x < viewport.width - 96 &&
      row.labelClientPoint.y > 96 &&
      row.labelClientPoint.y < viewport.height - 96
    ) {
      return row;
    }
    await translateViewportBy(
      page,
      row.labelClientPoint.x > viewport.width - 96 ||
        row.labelClientPoint.x < 96
        ? viewport.width / 2 - row.labelClientPoint.x
        : 0,
      row.labelClientPoint.y > viewport.height - 96 ||
        row.labelClientPoint.y < 96
        ? viewport.height / 2 - row.labelClientPoint.y
        : 0,
    );
    row = await resolveVisibleGuiRow(page, label);
  }
  return row;
}

async function resolveVisibleGuiRowSwitchInteractionPoint(
  page: Page,
  row: RetainedRowDebugEntry,
): Promise<Point | null> {
  return row.controlClientRect
    ? await resolveRenderedSwitchClickPoint(page, row.controlClientRect)
    : row.controlClientPoint;
}

async function translateViewportBy(
  page: Page,
  dx: number,
  dy: number,
): Promise<void> {
  await page.evaluate(
    async (delta) => {
      const [{ panGpuViewport }, { gpuFlowViewportStore }] = await Promise.all([
        import("/src/gpuFlow/viewportActions.ts"),
        import("/src/gpuFlow/viewportStore.ts"),
      ]);
      panGpuViewport(delta, { store: gpuFlowViewportStore });
    },
    { x: dx, y: dy },
  );
  await waitForAnimationFrame(page);
  await waitForAnimationFrame(page);
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
              !viewport.viewportAnimating &&
              !viewport.zoomActivationKeyPressed,
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
  const marker = await readVisibleRetainedContentScrollMarker(page, {
    labelOrder: GUI_SCROLL_LABEL_ORDER,
    surfaceId: GUI_CONTENT_SURFACE_ID,
  });
  return {
    marker: marker.marker,
    name,
    screenshot,
    visibleRows: marker.visibleRows,
  };
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

function resolveHoverContrastLabelSampleRect(row: RetainedRowDebugEntry): Rect {
  const labelLeft = Math.max(row.clientRect.x, row.labelClientPoint.x - 80);
  const labelRightLimit = Math.min(
    row.clientRect.x + row.clientRect.width,
    row.controlClientRect?.x ?? row.clientRect.x + row.clientRect.width,
  );
  const labelRight = Math.min(labelRightLimit, row.labelClientPoint.x + 160);
  return {
    height: row.clientRect.height,
    width: Math.max(48, labelRight - labelLeft),
    x: labelLeft,
    y: row.clientRect.y,
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
  const width = Math.min(SWITCH_ANIMATION_CLIP_WIDTH, Math.max(1, rect.width));
  return await clampScreenshotClipToViewport(page, {
    height,
    width,
    x: rect.x,
    y: rect.y + rect.height / 2 - height / 2,
  });
}

async function resolveRenderedSwitchClickPoint(
  page: Page,
  rect: Rect,
): Promise<Point> {
  const zoom = await readViewportZoom(page);
  return {
    x:
      rect.x +
      Math.min(rect.width / 2, SWITCH_RENDERED_TRACK_CENTER_OFFSET_X * zoom),
    y:
      rect.y +
      Math.min(rect.height / 2, SWITCH_RENDERED_TRACK_CENTER_OFFSET_Y * zoom),
  };
}
