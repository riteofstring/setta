import { type Page } from "@playwright/test";

export type ScreenshotSimilarityStats = {
  readonly changedPixelRatio: number;
  readonly colorHistogramDistance: number;
  readonly comparedPixelCount: number;
  readonly meanDelta: number;
  readonly p95Delta: number;
};

export async function compareScreenshotSimilarity(
  page: Page,
  input: {
    readonly actual: Buffer;
    readonly expected: Buffer;
  },
): Promise<ScreenshotSimilarityStats> {
  return await page.evaluate(
    async ({ actualDataUrl, expectedDataUrl }) => {
      const [actualImage, expectedImage] = await Promise.all([
        loadImage(actualDataUrl),
        loadImage(expectedDataUrl),
      ]);
      const width = Math.min(
        actualImage.naturalWidth,
        expectedImage.naturalWidth,
      );
      const height = Math.min(
        actualImage.naturalHeight,
        expectedImage.naturalHeight,
      );
      const actual = imagePixels(actualImage, width, height);
      const expected = imagePixels(expectedImage, width, height);
      const deltas: number[] = [];
      const actualHistogram = new Array<number>(64).fill(0);
      const expectedHistogram = new Array<number>(64).fill(0);
      let changedPixels = 0;
      let deltaTotal = 0;
      let comparedPixelCount = 0;
      for (let index = 0; index < width * height; index += 1) {
        const pixelIndex = index * 4;
        const actualColor = {
          a: actual[pixelIndex + 3] ?? 0,
          b: actual[pixelIndex + 2] ?? 0,
          g: actual[pixelIndex + 1] ?? 0,
          r: actual[pixelIndex] ?? 0,
        };
        const expectedColor = {
          a: expected[pixelIndex + 3] ?? 0,
          b: expected[pixelIndex + 2] ?? 0,
          g: expected[pixelIndex + 1] ?? 0,
          r: expected[pixelIndex] ?? 0,
        };
        if (actualColor.a <= 4 && expectedColor.a <= 4) {
          continue;
        }
        const delta =
          Math.abs(actualColor.r - expectedColor.r) +
          Math.abs(actualColor.g - expectedColor.g) +
          Math.abs(actualColor.b - expectedColor.b);
        const meanPixelDelta = delta / 3;
        deltas.push(meanPixelDelta);
        deltaTotal += meanPixelDelta;
        comparedPixelCount += 1;
        if (meanPixelDelta >= 18) {
          changedPixels += 1;
        }
        if (isVisibleColor(actualColor)) {
          actualHistogram[colorBucket(actualColor)] += 1;
        }
        if (isVisibleColor(expectedColor)) {
          expectedHistogram[colorBucket(expectedColor)] += 1;
        }
      }
      const histogramTotal =
        Math.max(1, sum(actualHistogram)) + Math.max(1, sum(expectedHistogram));
      let histogramDistance = 0;
      for (let index = 0; index < actualHistogram.length; index += 1) {
        histogramDistance += Math.abs(
          actualHistogram[index] - expectedHistogram[index],
        );
      }
      return {
        changedPixelRatio:
          comparedPixelCount === 0 ? 0 : changedPixels / comparedPixelCount,
        colorHistogramDistance: histogramDistance / histogramTotal,
        comparedPixelCount,
        meanDelta:
          comparedPixelCount === 0 ? 0 : deltaTotal / comparedPixelCount,
        p95Delta: percentile(deltas, 0.95),
      };

      function colorBucket(color: {
        readonly a: number;
        readonly b: number;
        readonly g: number;
        readonly r: number;
      }): number {
        const red = Math.min(3, Math.floor(color.r / 64));
        const green = Math.min(3, Math.floor(color.g / 64));
        const blue = Math.min(3, Math.floor(color.b / 64));
        return red * 16 + green * 4 + blue;
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
          throw new Error("Missing screenshot similarity canvas context.");
        }
        ctx.drawImage(image, 0, 0, imageWidth, imageHeight);
        return ctx.getImageData(0, 0, imageWidth, imageHeight).data;
      }

      function isVisibleColor(color: {
        readonly a: number;
        readonly b: number;
        readonly g: number;
        readonly r: number;
      }): boolean {
        return color.a > 16 && luminance(color.r, color.g, color.b) > 28;
      }

      function loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () =>
            reject(new Error("Failed to decode screenshot similarity image."));
          image.src = url;
        });
      }

      function luminance(r: number, g: number, b: number): number {
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }

      function percentile(values: readonly number[], fraction: number): number {
        if (values.length === 0) {
          return 0;
        }
        const sorted = [...values].sort((left, right) => left - right);
        const index = Math.min(
          sorted.length - 1,
          Math.max(0, Math.round((sorted.length - 1) * fraction)),
        );
        return sorted[index] ?? 0;
      }

      function sum(values: readonly number[]): number {
        return values.reduce((total, value) => total + value, 0);
      }
    },
    {
      actualDataUrl: `data:image/png;base64,${input.actual.toString("base64")}`,
      expectedDataUrl: `data:image/png;base64,${input.expected.toString(
        "base64",
      )}`,
    },
  );
}
