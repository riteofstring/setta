import type { Page, TestInfo } from "@playwright/test";

export type VisualContentStats = {
  readonly contrastPixelCount: number;
  readonly contrastPixelRatio: number;
  readonly height: number;
  readonly luminanceRange: number;
  readonly meanContrast: number;
  readonly pixelCount: number;
  readonly width: number;
};

export async function analyzeScreenshotContent(
  page: Page,
  screenshot: Buffer,
): Promise<VisualContentStats> {
  const dataUrl = `data:image/png;base64,${screenshot.toString("base64")}`;
  const sample = await page.evaluate(async (url) => {
    const image = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Failed to decode close-zoom screenshot."));
    });
    image.src = url;
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Missing close-zoom screenshot analysis context.");
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
    return { height, luminances, width };
  }, dataUrl);
  return summarizeLuminances(sample.luminances, {
    height: sample.height,
    width: sample.width,
  });
}

export async function attachScreenshot(
  testInfo: TestInfo,
  name: string,
  screenshot: Buffer,
): Promise<void> {
  await testInfo.attach(name, {
    body: screenshot,
    contentType: "image/png",
  });
}

function summarizeLuminances(
  luminances: readonly number[],
  size: { readonly height: number; readonly width: number },
): VisualContentStats {
  const pixelCount = size.height * size.width;
  if (luminances.length === 0) {
    return {
      contrastPixelCount: 0,
      contrastPixelRatio: 0,
      height: size.height,
      luminanceRange: 0,
      meanContrast: 0,
      pixelCount,
      width: size.width,
    };
  }
  const sorted = [...luminances].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  let contrastPixelCount = 0;
  let contrastTotal = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const luminance of luminances) {
    const contrast = Math.abs(luminance - median);
    contrastTotal += contrast;
    min = Math.min(min, luminance);
    max = Math.max(max, luminance);
    if (contrast >= 24) {
      contrastPixelCount += 1;
    }
  }
  return {
    contrastPixelCount,
    contrastPixelRatio:
      pixelCount === 0 ? 0 : contrastPixelCount / pixelCount,
    height: size.height,
    luminanceRange: max - min,
    meanContrast: contrastTotal / luminances.length,
    pixelCount,
    width: size.width,
  };
}
