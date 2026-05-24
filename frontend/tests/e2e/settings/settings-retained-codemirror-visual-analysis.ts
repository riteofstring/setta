import type { Page } from "@playwright/test";

export async function analyzeTextPreviewValueColumnPixelCount(
  page: Page,
  input: {
    readonly screenshot: Buffer;
  },
): Promise<number> {
  return await page.evaluate(
    async ({ screenshotDataUrl }) => {
      const image = await loadImage(screenshotDataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Missing text preview column analysis context.");
      }
      ctx.drawImage(image, 0, 0);
      const { data, height, width } = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const left = Math.floor(width * 0.45);
      let pixelCount = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = left; x < width; x += 1) {
          const index = (y * width + x) * 4;
          const r = data[index] ?? 0;
          const g = data[index + 1] ?? 0;
          const b = data[index + 2] ?? 0;
          if (isCodeMirrorTextPixel(r, g, b)) {
            pixelCount += 1;
          }
        }
      }
      return pixelCount;

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
        const slateCanvasText =
          luma >= 35 && luma < 95 && g - r > 8 && b - g > 8 && b - r > 20;
        const darkCanvasText =
          luma >= 15 && luma < 70 && g >= r && b > g && b - r > 14;
        if (slateCanvasText || darkCanvasText) {
          return true;
        }
        if (luma < 70) {
          return false;
        }
        const coolText = b > 95 && g > 75 && b - r > 18;
        const purpleText = r > 115 && b > 115 && b - g > 10;
        const warmText = r > 120 && r - g > 25 && r - b > 15;
        return coolText || purpleText || warmText;
      }
    },
    {
      screenshotDataUrl: `data:image/png;base64,${input.screenshot.toString(
        "base64",
      )}`,
    },
  );
}
