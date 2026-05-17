import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { ensureAppReady } from "../helpers";
import {
  analyzeSwitchThumbMotion,
  compareScreenshots,
  type Point,
  type Rect,
  type RetainedRowDebugEntry,
  type SwitchFrame,
} from "./settings-retained-visual-analysis";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".setta-gpu-flow__pane";
const GUI_SECTION_ID = "settings-section__gui";
const GUI_CONTENT_SURFACE_ID = `${GUI_SECTION_ID}:param-content:unpinned`;
const SWITCH_LABEL = "Left Side Pane Shifts Map";
const SWITCH_CLIP_HEIGHT = 88;
const SWITCH_CLIP_WIDTH = 240;
const SWITCH_TRACK_CENTER_OFFSET_X = 31;
const SWITCH_TRACK_CENTER_OFFSET_Y = 14;

test.use({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
  viewport: { height: 672, width: 1200 },
});

test("retained switch does not flash its previous state while zooming before backend confirmation", async ({
  page,
}, testInfo) => {
  await openSettings(page);
  const zoomTarget = await resolveVisibleGuiRow(page, SWITCH_LABEL);
  await performCloseZoom(page, zoomTarget.labelClientPoint);
  const row = await bringVisibleGuiRowControlIntoView(page, SWITCH_LABEL);
  if (!row.controlClientPoint || !row.controlClientRect) {
    throw new Error(`Missing switch control geometry for ${SWITCH_LABEL}`);
  }
  const controlRect = row.controlClientRect;
  const clickPoint = resolveRenderedSwitchClickPoint(controlRect);
  const clip = await resolveSwitchClipFromControlRect(page, controlRect);
  await waitForStableScreenshotClip(page, clip);
  await page.mouse.click(clickPoint.x, clickPoint.y);
  await page.waitForTimeout(500);
  await waitForStableScreenshotClip(page, clip);
  const visualInitialChecked = await captureSwitchTrackChecked({
    name: "visual-switch-latency-initial.png",
    page,
    rect: clip,
    testInfo,
  });
  const initialChecked = Boolean(
    await readGuiSetting(page, "leftSidePaneShiftsMap"),
  );
  const targetChecked = !initialChecked;

  let releaseBackendConfirmation!: () => void;
  const backendConfirmationReleased = new Promise<void>((resolve) => {
    releaseBackendConfirmation = resolve;
  });
  let delayedBackendRequests = 0;
  let backendConfirmationReleasedForZoom = false;
  await page.route("**/setParamEnteredValue", async (route) => {
    delayedBackendRequests += 1;
    await backendConfirmationReleased;
    await route.continue();
  });

  try {
    const delayedClickPoint = await clickSwitchUntilBackendRequest({
      label: SWITCH_LABEL,
      page,
      readRequestCount: () => delayedBackendRequests,
    });
    await waitForAnimationFrame(page);
    const zoomFrames = await captureSwitchFramesWhileZooming({
      label: SWITCH_LABEL,
      page,
      point: delayedClickPoint,
      testInfo,
    });
    backendConfirmationReleasedForZoom = true;
    releaseBackendConfirmation();
    const zoomStats = await analyzeSwitchThumbMotion(page, zoomFrames);
    const firstTargetStateIndex = zoomStats.findIndex(
      (stats) => stats.trackChecked === targetChecked,
    );
    const missingTrackFrames = zoomStats.filter(
      (stats) => stats.trackChecked === null,
    );
    const flashedOldStateFrames = zoomStats
      .slice(Math.max(0, firstTargetStateIndex + 1))
      .filter((stats) => stats.trackChecked === initialChecked);
    const debugState = await readSwitchDebugState(page, SWITCH_LABEL);
    const failureDetails = JSON.stringify(
      {
        debugState,
        delayedBackendRequests,
        flashedOldStateFrames,
        firstTargetStateIndex,
        initialChecked,
        missingTrackFrames,
        targetChecked,
        visualInitialChecked,
        zoomStats,
      },
      null,
      2,
    );
    expect(delayedBackendRequests, failureDetails).toBeGreaterThan(0);
    expect(firstTargetStateIndex, failureDetails).toBeGreaterThanOrEqual(0);
    expect(flashedOldStateFrames, failureDetails).toHaveLength(0);
  } finally {
    if (!backendConfirmationReleasedForZoom) {
      releaseBackendConfirmation();
    }
    if (delayedBackendRequests > 0) {
      await expect
        .poll(
          async () =>
            Boolean(await readGuiSetting(page, "leftSidePaneShiftsMap")),
          {
            timeout: 5_000,
          },
        )
        .toBe(targetChecked);
    }
    await waitForViewportIdle(page);
    await page.unroute("**/setParamEnteredValue");
  }
});

async function openSettings(page: Page): Promise<void> {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);
  await page.getByRole("button", { exact: true, name: "Core" }).click();
  await waitForCoreSettingsView(page);
  await page.getByRole("button", { name: "fit view" }).click();
  await waitForViewportIdle(page);
  await expect(
    page.locator(`.setta-gpu-flow__node[data-id="${GUI_SECTION_ID}"]`),
  ).toBeVisible();
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

async function waitForCoreSettingsView(page: Page): Promise<void> {
  await page.waitForFunction(
    () => document.querySelectorAll(".setta-gpu-flow__node").length <= 10,
  );
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
  for (let attempt = 0; attempt < 8 && row.controlClientPoint; attempt += 1) {
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
    await panViewportBy(
      page,
      row.controlClientPoint.x > viewport.width - 96
        ? -320
        : row.controlClientPoint.x < 96
          ? 320
          : 0,
      row.controlClientPoint.y > viewport.height - 96
        ? -180
        : row.controlClientPoint.y < 96
          ? 180
          : 0,
    );
    row = await resolveVisibleGuiRow(page, label);
  }
  return row;
}

async function clickSwitchUntilBackendRequest({
  label,
  page,
  readRequestCount,
}: {
  readonly label: string;
  readonly page: Page;
  readonly readRequestCount: () => number;
}): Promise<Point> {
  const row = await bringVisibleGuiRowControlIntoView(page, label);
  if (!row.controlClientRect) {
    throw new Error(`Missing switch control geometry for ${label}`);
  }
  const point = resolveRenderedSwitchClickPoint(row.controlClientRect);
  await page.mouse.click(point.x, point.y);
  await expect
    .poll(readRequestCount, { intervals: [10, 20, 40], timeout: 1_000 })
    .toBeGreaterThan(0);
  return point;
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
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
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

async function readGuiSetting(page: Page, key: string): Promise<unknown> {
  return await page.evaluate(async (settingKey) => {
    const { useSettings } = await import("/src/state/definitions.ts");
    return (useSettings.getState().gui as Record<string, unknown>)[settingKey];
  }, key);
}

async function waitForAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

async function captureSwitchTrackChecked({
  name,
  page,
  rect,
  testInfo,
}: {
  readonly name: string;
  readonly page: Page;
  readonly rect: Rect;
  readonly testInfo: TestInfo;
}): Promise<boolean> {
  const frame = await captureSwitchFrame({ name, page, rect, testInfo });
  const stats = await analyzeSwitchThumbMotion(page, [frame]);
  const checked = stats[0]?.trackChecked;
  if (checked === null || checked === undefined) {
    throw new Error(
      `Could not classify switch track state: ${JSON.stringify(stats)}`,
    );
  }
  return checked;
}

async function captureSwitchFramesWhileZooming({
  label,
  page,
  point,
  testInfo,
}: {
  readonly label: string;
  readonly page: Page;
  readonly point: Point;
  readonly testInfo: TestInfo;
}): Promise<SwitchFrame[]> {
  const frames: SwitchFrame[] = [];
  await page.mouse.move(point.x, point.y);
  await page.keyboard.down("Control");
  try {
    for (let index = 0; index < 10; index += 1) {
      await page.mouse.wheel(0, -7);
      await waitForAnimationFrame(page);
      await waitForAnimationFrame(page);
      const clip = await resolveSwitchClipForVisibleGuiRowControl(page, label);
      frames.push(
        await captureSwitchFrame({
          name: `visual-switch-latency-zoom-in-${index}.png`,
          page,
          rect: clip,
          testInfo,
        }),
      );
    }
    for (let index = 0; index < 10; index += 1) {
      await page.mouse.wheel(0, 7);
      await waitForAnimationFrame(page);
      await waitForAnimationFrame(page);
      const clip = await resolveSwitchClipForVisibleGuiRowControl(page, label);
      frames.push(
        await captureSwitchFrame({
          name: `visual-switch-latency-zoom-out-${index}.png`,
          page,
          rect: clip,
          testInfo,
        }),
      );
    }
  } finally {
    await page.keyboard.up("Control");
  }
  await waitForViewportIdle(page);
  return frames;
}

async function resolveSwitchClipForVisibleGuiRowControl(
  page: Page,
  label: string,
): Promise<Rect> {
  const row = await resolveVisibleGuiRow(page, label);
  const animationTrackClip = await resolveSwitchAnimationTrackClip(page, row);
  if (animationTrackClip) {
    return animationTrackClip;
  }
  if (!row.controlClientRect) {
    throw new Error(`Missing switch control geometry for ${label}`);
  }
  return await resolveSwitchClipFromControlRect(page, row.controlClientRect);
}

async function readSwitchDebugState(page: Page, label: string) {
  return await page.evaluate(
    ({ label, surfaceId }) => {
      const rows = (
        window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? []
      ).filter(
        (row): row is RetainedRowDebugEntry =>
          row.surfaceId === surfaceId && row.rowLabel === label,
      );
      const visuals = (
        window.__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__?.() ?? []
      ).filter((surface) => surface.surfaceId.includes("switch-animation"));
      const viewport =
        window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport ?? null;
      return {
        rows,
        viewport,
        visuals,
      };
    },
    { label, surfaceId: GUI_CONTENT_SURFACE_ID },
  );
}

async function resolveSwitchAnimationTrackClip(
  page: Page,
  row: RetainedRowDebugEntry,
): Promise<Rect | null> {
  const trackRect = await page.evaluate(
    ({ rowId, surfaceId }) => {
      const visualSurfaceId = `${surfaceId}:switch-animation:${rowId}:track`;
      const track = window
        .__SETTA_GPU_FLOW_DEBUG_VISUAL_SURFACES__?.()
        .find(
          (surface) =>
            surface.kind === "solid-rounded-rect" &&
            surface.surfaceId === visualSurfaceId,
        );
      return track?.clientRect ?? null;
    },
    { rowId: row.rowId, surfaceId: row.surfaceId },
  );
  if (!trackRect) {
    return null;
  }
  return await clampScreenshotClipToViewport(page, {
    height: SWITCH_CLIP_HEIGHT,
    width: SWITCH_CLIP_WIDTH,
    x: trackRect.x + trackRect.width / 2 - SWITCH_CLIP_WIDTH / 2,
    y: trackRect.y + trackRect.height / 2 - SWITCH_CLIP_HEIGHT / 2,
  });
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
  await waitForAnimationFrame(page);
  const screenshot = await page.screenshot({
    clip: rect,
    path: testInfo.outputPath(name),
  });
  await testInfo.attach(name, { body: screenshot, contentType: "image/png" });
  return { name, screenshot };
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
      { intervals: [80, 120, 180, 240], timeout: 2_000 },
    )
    .toBeLessThan(1);
}

async function resolveSwitchClipFromControlRect(
  page: Page,
  rect: Rect,
): Promise<Rect> {
  return await clampScreenshotClipToViewport(page, {
    height: Math.min(SWITCH_CLIP_HEIGHT, Math.max(1, rect.height)),
    width: Math.min(SWITCH_CLIP_WIDTH, Math.max(1, rect.width)),
    x: rect.x,
    y: rect.y + rect.height / 2 - Math.min(SWITCH_CLIP_HEIGHT, rect.height) / 2,
  });
}

function resolveRenderedSwitchClickPoint(rect: Rect): Point {
  return {
    x: rect.x + Math.min(rect.width / 2, SWITCH_TRACK_CENTER_OFFSET_X),
    y: rect.y + Math.min(rect.height / 2, SWITCH_TRACK_CENTER_OFFSET_Y),
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
