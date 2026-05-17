import type { Page } from "@playwright/test";

export type HoverCoverageStats = {
  readonly bandCount: number;
  readonly changedPixelRatioByBand: readonly number[];
  readonly meanDeltaByBand: readonly number[];
};

export type ScreenshotContentStats = {
  readonly contrastPixelRatio: number;
  readonly height: number;
  readonly luminanceRange: number;
  readonly meanContrast: number;
  readonly width: number;
};

export async function analyzeHoverCoverage(
  page: Page,
  before: Buffer,
  after: Buffer,
): Promise<HoverCoverageStats> {
  return await page.evaluate(
    async ({ afterDataUrl, beforeDataUrl }) => {
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
      const bandCount = 4;
      const changedCounts = Array.from({ length: bandCount }, () => 0);
      const totalCounts = Array.from({ length: bandCount }, () => 0);
      const deltaTotals = Array.from({ length: bandCount }, () => 0);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const band = Math.min(
            bandCount - 1,
            Math.floor((x / Math.max(1, width)) * bandCount),
          );
          const index = (y * width + x) * 4;
          const delta =
            Math.abs((afterPixels[index] ?? 0) - (beforePixels[index] ?? 0)) +
            Math.abs(
              (afterPixels[index + 1] ?? 0) - (beforePixels[index + 1] ?? 0),
            ) +
            Math.abs(
              (afterPixels[index + 2] ?? 0) - (beforePixels[index + 2] ?? 0),
            );
          totalCounts[band] += 1;
          deltaTotals[band] += delta / 3;
          if (delta >= 18) {
            changedCounts[band] += 1;
          }
        }
      }
      return {
        bandCount,
        changedPixelRatioByBand: changedCounts.map((count, index) =>
          totalCounts[index] === 0 ? 0 : count / totalCounts[index],
        ),
        meanDeltaByBand: deltaTotals.map((total, index) =>
          totalCounts[index] === 0 ? 0 : total / totalCounts[index],
        ),
      };

      async function loadImage(url: string): Promise<HTMLImageElement> {
        const image = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("Failed to decode screenshot."));
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
          throw new Error("Missing screenshot diff canvas context.");
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

export async function analyzeScreenshotContent(
  page: Page,
  screenshot: Buffer,
): Promise<ScreenshotContentStats> {
  const dataUrl = `data:image/png;base64,${screenshot.toString("base64")}`;
  return await page.evaluate(async (url) => {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Failed to decode screenshot."));
    });
    image.src = url;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Missing screenshot analysis context.");
    }
    ctx.drawImage(image, 0, 0);
    const { data, height, width } = ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const luminances: number[] = [];
    for (let index = 0; index < data.length; index += 4) {
      const a = data[index + 3] ?? 0;
      if (a < 64) {
        continue;
      }
      const r = data[index] ?? 0;
      const g = data[index + 1] ?? 0;
      const b = data[index + 2] ?? 0;
      luminances.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
    if (luminances.length === 0) {
      return {
        contrastPixelRatio: 0,
        height,
        luminanceRange: 0,
        meanContrast: 0,
        width,
      };
    }
    const sorted = [...luminances].sort((left, right) => left - right);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    let contrastPixels = 0;
    let contrastTotal = 0;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const luminance of luminances) {
      const contrast = Math.abs(luminance - median);
      if (contrast >= 24) {
        contrastPixels += 1;
      }
      contrastTotal += contrast;
      min = Math.min(min, luminance);
      max = Math.max(max, luminance);
    }
    return {
      contrastPixelRatio: contrastPixels / Math.max(1, width * height),
      height,
      luminanceRange: max - min,
      meanContrast: contrastTotal / luminances.length,
      width,
    };
  }, dataUrl);
}
