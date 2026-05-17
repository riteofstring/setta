import { expect, type Page, type TestInfo } from "@playwright/test";

import {
  compareScreenshots,
  type Rect,
} from "./settings-retained-visual-analysis";

export function clampScreenshotClip(rect: Rect): Rect {
  return {
    height: Math.max(1, Math.floor(rect.height)),
    width: Math.max(1, Math.floor(rect.width)),
    x: Math.max(0, Math.floor(rect.x)),
    y: Math.max(0, Math.floor(rect.y)),
  };
}

export async function screenshotClip({
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

export async function waitForStableScreenshotClip(
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

export async function waitForAnimationFrame(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

export async function clampScreenshotClipToViewport(
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
