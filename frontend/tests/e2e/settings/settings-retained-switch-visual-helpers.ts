import { expect, type Page, type TestInfo } from "@playwright/test";

import {
  analyzeSwitchThumbMotion,
  type Point,
  type Rect,
  type SwitchFrame,
} from "./settings-retained-visual-analysis";
import {
  clampScreenshotClipToViewport,
  screenshotClip,
} from "./settings-retained-visual-regression-helpers";

const SWITCH_ANIMATION_CLIP_HEIGHT = 88;
const SWITCH_ANIMATION_CLIP_WIDTH = 240;
const SWITCH_RENDERED_TRACK_CENTER_OFFSET_X = 31;
const SWITCH_RENDERED_TRACK_CENTER_OFFSET_Y = 14;

export async function captureSwitchFrame({
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

export async function waitForRenderedSwitchThumb(
  page: Page,
  rect: Rect,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const screenshot = await page.screenshot({ clip: rect });
        const [stats] = await analyzeSwitchThumbMotion(page, [
          { name: "switch-render-probe", screenshot },
        ]);
        return Boolean(
          stats && stats.thumbCenterX !== null && stats.trackChecked !== null,
        );
      },
      {
        intervals: [80, 120, 180, 240],
        timeout: 3_000,
      },
    )
    .toBe(true);
}

export async function resolveSwitchClipFromControlRect(
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

export async function resolveRenderedSwitchClickPoint(
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

async function readViewportZoom(page: Page): Promise<number> {
  return await page.evaluate(
    () => window.__SETTA_GPU_FLOW_DEBUG_SNAPSHOT__?.().viewport.zoom ?? 1,
  );
}
