import type { Page } from "@playwright/test";

import type {
  Rect,
  RetainedRowDebugEntry,
} from "./settings-retained-visual-analysis";

export async function viewportScreenshotClip(page: Page): Promise<Rect> {
  return await page.evaluate(() => ({
    height: window.innerHeight,
    width: window.innerWidth,
    x: 0,
    y: 0,
  }));
}

export function resolveValueInkSearchRect(rect: Rect): Rect {
  return {
    height: rect.height,
    width: Math.min(rect.width, 220),
    x: rect.x,
    y: rect.y,
  };
}

export function resolveLabelInkSearchRect(
  row: RetainedRowDebugEntry & { readonly controlClientRect: Rect },
): Rect {
  return {
    height: row.clientRect.height,
    width: Math.max(1, row.controlClientRect.x - row.clientRect.x - 8),
    x: row.clientRect.x,
    y: row.clientRect.y,
  };
}

export function resolveVisibleLabelInkSearchRect(
  row: RetainedRowDebugEntry,
): Rect {
  return {
    height: row.clientRect.height,
    width: Math.max(
      1,
      (row.controlClientRect?.x ?? row.clientRect.x + row.clientRect.width) -
        row.clientRect.x -
        8,
    ),
    x: row.clientRect.x,
    y: row.clientRect.y,
  };
}
