import { expect, type Page } from "@playwright/test";

export type Point = {
  readonly x: number;
  readonly y: number;
};

export type Rect = Point & {
  readonly height: number;
  readonly width: number;
};

export type RetainedRowDebugEntry = {
  readonly canvasCssSize: { readonly height: number; readonly width: number };
  readonly canvasSamplePoint: Point;
  readonly clientRect: Rect;
  readonly controlClientRect: Rect | null;
  readonly controlClientPoint: Point | null;
  readonly controlKind: string | null;
  readonly labelClientPoint: Point;
  readonly rowId: string;
  readonly rowLabel: string;
  readonly surfaceContentHeight: number;
  readonly surfaceId: string;
  readonly surfaceLogicalRowCount: number;
  readonly surfaceScrollOffset: Point;
  readonly surfaceViewportHeight: number;
};

export type RowBand = {
  readonly label: string;
  readonly rect: Rect;
};

export type HoverBandStats = {
  readonly changedPixelRatio: number;
  readonly label: string;
  readonly meanDelta: number;
};

export type HoverContrastStats = {
  readonly afterBackgroundLuma: number;
  readonly afterContrast: number;
  readonly afterTextLuma: number;
  readonly backgroundLumaDelta: number;
  readonly beforeBackgroundLuma: number;
  readonly beforeContrast: number;
  readonly beforeTextLuma: number;
  readonly changedPixelRatio: number;
  readonly label: string;
  readonly meanDelta: number;
};

export type SwitchFrame = {
  readonly name: string;
  readonly screenshot: Buffer;
};

export type SwitchThumbStats = {
  readonly name: string;
  readonly progress: number | null;
  readonly thumbCenterX: number | null;
  readonly trackBlueRatio: number | null;
  readonly trackChecked: boolean | null;
  readonly trackLeft: number | null;
  readonly trackRight: number | null;
};

export type ScrollbarStats = {
  readonly duplicateColumnCount: number;
  readonly maxColumnCoverage: number;
  readonly primaryColumnCoverage: number;
  readonly visibleColumnCount: number;
};

export type TextInkBounds = Rect & {
  readonly centerX: number;
  readonly centerY: number;
  readonly pixelCount: number;
};

export async function analyzeCodeMirrorTextInkBounds(
  page: Page,
  input: {
    readonly clip: Rect;
    readonly screenshot: Buffer;
    readonly searchRect: Rect;
  },
): Promise<TextInkBounds | null> {
  return await analyzeTextInkBounds(page, {
    ...input,
    pixelKind: "codemirror",
  });
}

export async function analyzeRetainedLabelTextInkBounds(
  page: Page,
  input: {
    readonly clip: Rect;
    readonly screenshot: Buffer;
    readonly searchRect: Rect;
  },
): Promise<TextInkBounds | null> {
  return await analyzeTextInkBounds(page, { ...input, pixelKind: "label" });
}

async function analyzeTextInkBounds(
  page: Page,
  input: {
    readonly clip: Rect;
    readonly pixelKind: "codemirror" | "label";
    readonly screenshot: Buffer;
    readonly searchRect: Rect;
  },
): Promise<TextInkBounds | null> {
  return await page.evaluate(
    async ({ clip, pixelKind, screenshotDataUrl, searchRect }) => {
      const image = await loadImage(screenshotDataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Missing text ink analysis canvas context.");
      }
      ctx.drawImage(image, 0, 0);
      const { data, height, width } = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const left = Math.max(0, Math.floor(searchRect.x - clip.x));
      const right = Math.min(
        width,
        Math.ceil(searchRect.x + searchRect.width - clip.x),
      );
      const top = Math.max(0, Math.floor(searchRect.y - clip.y));
      const bottom = Math.min(
        height,
        Math.ceil(searchRect.y + searchRect.height - clip.y),
      );
      const candidateRows = new Map<number, number[]>();
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const index = (y * width + x) * 4;
          const r = data[index] ?? 0;
          const g = data[index + 1] ?? 0;
          const b = data[index + 2] ?? 0;
          if (!isTextPixel(r, g, b, pixelKind)) {
            continue;
          }
          const rowPixels = candidateRows.get(y);
          if (rowPixels) {
            rowPixels.push(x);
          } else {
            candidateRows.set(y, [x]);
          }
        }
      }
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let pixelCount = 0;
      const horizontalRuleThreshold = Math.max(24, (right - left) * 0.25);
      for (const [y, rowPixels] of candidateRows) {
        if (rowPixels.length >= horizontalRuleThreshold) {
          continue;
        }
        for (const x of rowPixels) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
          pixelCount += 1;
        }
      }
      if (pixelCount === 0) {
        return null;
      }
      const x = clip.x + minX;
      const y = clip.y + minY;
      const boundsWidth = maxX - minX + 1;
      const boundsHeight = maxY - minY + 1;
      return {
        centerX: x + boundsWidth / 2,
        centerY: y + boundsHeight / 2,
        height: boundsHeight,
        pixelCount,
        width: boundsWidth,
        x,
        y,
      };

      async function loadImage(url: string): Promise<HTMLImageElement> {
        const image = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("Failed to decode text ink screenshot."));
        });
        image.src = url;
        await loaded;
        return image;
      }

      function isTextPixel(
        r: number,
        g: number,
        b: number,
        kind: "codemirror" | "label",
      ): boolean {
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (luma < 70) {
          return false;
        }
        if (kind === "label") {
          const channelSpread = Math.max(r, g, b) - Math.min(r, g, b);
          return luma > 105 && channelSpread < 55;
        }
        const coolText = b > 95 && g > 75 && b - r > 18;
        const purpleText = r > 115 && b > 115 && b - g > 10;
        const warmText = r > 120 && r - g > 25 && r - b > 15;
        const neutralText =
          luma > 105 && Math.max(r, g, b) - Math.min(r, g, b) < 55;
        return coolText || purpleText || warmText || neutralText;
      }
    },
    {
      clip: input.clip,
      pixelKind: input.pixelKind,
      screenshotDataUrl: `data:image/png;base64,${input.screenshot.toString(
        "base64",
      )}`,
      searchRect: input.searchRect,
    },
  );
}

export async function analyzeHoverBands(
  page: Page,
  input: {
    readonly after: Buffer;
    readonly before: Buffer;
    readonly clip: Rect;
    readonly rows: readonly RowBand[];
  },
): Promise<readonly HoverBandStats[]> {
  return await page.evaluate(
    async ({ afterDataUrl, beforeDataUrl, clip, rows }) => {
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
      return rows.map((row) => {
        const top = Math.max(0, Math.floor(row.rect.y - clip.y));
        const bottom = Math.min(
          height,
          Math.ceil(row.rect.y + row.rect.height - clip.y),
        );
        const left = Math.max(0, Math.floor(row.rect.x - clip.x));
        const right = Math.min(
          width,
          Math.ceil(row.rect.x + row.rect.width - clip.x),
        );
        let changed = 0;
        let total = 0;
        let deltaTotal = 0;
        for (let y = top; y < bottom; y += 1) {
          for (let x = left; x < right; x += 1) {
            const index = (y * width + x) * 4;
            const delta =
              Math.abs((afterPixels[index] ?? 0) - (beforePixels[index] ?? 0)) +
              Math.abs(
                (afterPixels[index + 1] ?? 0) - (beforePixels[index + 1] ?? 0),
              ) +
              Math.abs(
                (afterPixels[index + 2] ?? 0) - (beforePixels[index + 2] ?? 0),
              );
            total += 1;
            deltaTotal += delta / 3;
            if (delta >= 18) {
              changed += 1;
            }
          }
        }
        return {
          changedPixelRatio: total === 0 ? 0 : changed / total,
          label: row.label,
          meanDelta: total === 0 ? 0 : deltaTotal / total,
        };
      });

      async function loadImage(url: string): Promise<HTMLImageElement> {
        const image = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("Failed to decode hover screenshot."));
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
          throw new Error("Missing hover analysis canvas context.");
        }
        ctx.drawImage(image, 0, 0, imageWidth, imageHeight);
        return ctx.getImageData(0, 0, imageWidth, imageHeight).data;
      }
    },
    {
      afterDataUrl: `data:image/png;base64,${input.after.toString("base64")}`,
      beforeDataUrl: `data:image/png;base64,${input.before.toString("base64")}`,
      clip: input.clip,
      rows: input.rows,
    },
  );
}

export async function analyzeHoverContrast(
  page: Page,
  input: {
    readonly after: Buffer;
    readonly before: Buffer;
    readonly clip: Rect;
    readonly row: RowBand;
  },
): Promise<HoverContrastStats> {
  return await page.evaluate(
    async ({ afterDataUrl, beforeDataUrl, clip, row }) => {
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
      const top = Math.max(0, Math.floor(row.rect.y - clip.y));
      const bottom = Math.min(
        height,
        Math.ceil(row.rect.y + row.rect.height - clip.y),
      );
      const left = Math.max(0, Math.floor(row.rect.x - clip.x));
      const right = Math.min(
        width,
        Math.ceil(
          row.rect.x +
            Math.min(row.rect.width * 0.35, Math.max(120, 360)) -
            clip.x,
        ),
      );
      const beforeLumas: number[] = [];
      const afterLumas: number[] = [];
      let changed = 0;
      let deltaTotal = 0;
      let total = 0;
      for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
          const index = (y * width + x) * 4;
          const beforeColor = {
            b: beforePixels[index + 2] ?? 0,
            g: beforePixels[index + 1] ?? 0,
            r: beforePixels[index] ?? 0,
          };
          const afterColor = {
            b: afterPixels[index + 2] ?? 0,
            g: afterPixels[index + 1] ?? 0,
            r: afterPixels[index] ?? 0,
          };
          const beforeLuma = luminance(beforeColor);
          const afterLuma = luminance(afterColor);
          const delta =
            Math.abs(afterColor.r - beforeColor.r) +
            Math.abs(afterColor.g - beforeColor.g) +
            Math.abs(afterColor.b - beforeColor.b);
          beforeLumas.push(beforeLuma);
          afterLumas.push(afterLuma);
          deltaTotal += delta / 3;
          total += 1;
          if (delta >= 18) {
            changed += 1;
          }
        }
      }
      const beforeBackgroundLuma = percentile(beforeLumas, 0.5);
      const afterBackgroundLuma = percentile(afterLumas, 0.5);
      const beforeTextLuma = percentile(beforeLumas, 0.98);
      const afterTextLuma = percentile(afterLumas, 0.98);
      return {
        afterBackgroundLuma,
        afterContrast: afterTextLuma - afterBackgroundLuma,
        afterTextLuma,
        backgroundLumaDelta: afterBackgroundLuma - beforeBackgroundLuma,
        beforeBackgroundLuma,
        beforeContrast: beforeTextLuma - beforeBackgroundLuma,
        beforeTextLuma,
        changedPixelRatio: total === 0 ? 0 : changed / total,
        label: row.label,
        meanDelta: total === 0 ? 0 : deltaTotal / total,
      };

      async function loadImage(url: string): Promise<HTMLImageElement> {
        const image = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("Failed to decode hover contrast screenshot."));
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
          throw new Error("Missing hover contrast analysis canvas context.");
        }
        ctx.drawImage(image, 0, 0, imageWidth, imageHeight);
        return ctx.getImageData(0, 0, imageWidth, imageHeight).data;
      }

      function luminance(color: {
        readonly b: number;
        readonly g: number;
        readonly r: number;
      }): number {
        return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
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
    },
    {
      afterDataUrl: `data:image/png;base64,${input.after.toString("base64")}`,
      beforeDataUrl: `data:image/png;base64,${input.before.toString("base64")}`,
      clip: input.clip,
      row: input.row,
    },
  );
}

export async function analyzeSwitchThumbMotion(
  page: Page,
  frames: readonly SwitchFrame[],
): Promise<readonly SwitchThumbStats[]> {
  return await page.evaluate(
    async (frameInputs) => {
      const rawStats = await Promise.all(
        frameInputs.map(async (frame) => {
          const image = await loadImage(frame.dataUrl);
          const canvas = document.createElement("canvas");
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) {
            throw new Error("Missing switch analysis canvas context.");
          }
          ctx.drawImage(image, 0, 0);
          const { data, height, width } = ctx.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          );
          const visiblePixels: Array<{
            readonly luma: number;
            readonly x: number;
            readonly y: number;
          }> = [];
          for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
              const index = (y * width + x) * 4;
              const r = data[index] ?? 0;
              const g = data[index + 1] ?? 0;
              const b = data[index + 2] ?? 0;
              const luma = luminance(r, g, b);
              if (luma > 18 && b > 35 && g > 20 && b - r > 10) {
                visiblePixels.push({ luma, x, y });
              }
            }
          }
          if (visiblePixels.length < 20) {
            return missing(frame.name);
          }
          const trackLeft = Math.min(...visiblePixels.map((pixel) => pixel.x));
          const trackRight = Math.max(...visiblePixels.map((pixel) => pixel.x));
          const trackTop = Math.min(...visiblePixels.map((pixel) => pixel.y));
          const trackBottom = Math.max(
            ...visiblePixels.map((pixel) => pixel.y),
          );
          const trackReferenceLuma = percentile(
            visiblePixels.map((pixel) => pixel.luma),
            0.85,
          );
          const columnWeights = new Map<number, number>();
          for (let y = trackTop + 2; y <= trackBottom - 2; y += 1) {
            for (let x = trackLeft; x <= trackRight; x += 1) {
              const index = (y * width + x) * 4;
              const r = data[index] ?? 0;
              const g = data[index + 1] ?? 0;
              const b = data[index + 2] ?? 0;
              const luma = luminance(r, g, b);
              if (luma < trackReferenceLuma - 10 && luma > 8) {
                columnWeights.set(x, (columnWeights.get(x) ?? 0) + 1);
              }
            }
          }
          let weightedX = 0;
          let totalWeight = 0;
          for (const [x, weight] of columnWeights) {
            weightedX += x * weight;
            totalWeight += weight;
          }
          if (totalWeight < 6) {
            return missing(frame.name);
          }
          const trackSample = classifySwitchTrack({
            data,
            height,
            trackBottom,
            trackLeft,
            trackRight,
            trackTop,
            width,
          });
          return {
            name: frame.name,
            progress: null,
            thumbCenterX: weightedX / totalWeight,
            trackBlueRatio: trackSample.blueRatio,
            trackChecked: trackSample.checked,
            trackLeft,
            trackRight,
          };
        }),
      );
      const first = rawStats[0]?.thumbCenterX;
      const last = rawStats[rawStats.length - 1]?.thumbCenterX;
      if (
        first === null ||
        first === undefined ||
        last === null ||
        last === undefined
      ) {
        return rawStats;
      }
      const detectedThumbCenters = rawStats
        .map((stats) => stats.thumbCenterX)
        .filter((center): center is number => center !== null);
      const minThumbCenter = Math.min(...detectedThumbCenters);
      const maxThumbCenter = Math.max(...detectedThumbCenters);
      const travel = maxThumbCenter - minThumbCenter;
      if (travel < 4) {
        return rawStats;
      }
      const increasing = last >= first;
      return rawStats.map((stats) => ({
        ...stats,
        progress:
          stats.thumbCenterX === null
            ? null
            : increasing
              ? (stats.thumbCenterX - minThumbCenter) / travel
              : (maxThumbCenter - stats.thumbCenterX) / travel,
      }));

      async function loadImage(url: string): Promise<HTMLImageElement> {
        const image = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("Failed to decode switch screenshot."));
        });
        image.src = url;
        await loaded;
        return image;
      }

      function missing(name: string) {
        return {
          name,
          progress: null,
          thumbCenterX: null,
          trackBlueRatio: null,
          trackChecked: null,
          trackLeft: null,
          trackRight: null,
        };
      }

      function classifySwitchTrack({
        data,
        height,
        trackBottom,
        trackLeft,
        trackRight,
        trackTop,
        width,
      }: {
        readonly data: Uint8ClampedArray;
        readonly height: number;
        readonly trackBottom: number;
        readonly trackLeft: number;
        readonly trackRight: number;
        readonly trackTop: number;
        readonly width: number;
      }): { readonly blueRatio: number; readonly checked: boolean } {
        let blue = 0;
        let sampled = 0;
        for (
          let y = Math.max(0, trackTop + 1);
          y <= Math.min(height - 1, trackBottom - 1);
          y += 1
        ) {
          for (
            let x = Math.max(0, trackLeft + 1);
            x <= Math.min(width - 1, trackRight - 1);
            x += 1
          ) {
            const index = (y * width + x) * 4;
            const r = data[index] ?? 0;
            const g = data[index + 1] ?? 0;
            const b = data[index + 2] ?? 0;
            const luma = luminance(r, g, b);
            if (luma <= 18 || b <= 35 || g <= 20 || b - r <= 10) {
              continue;
            }
            sampled += 1;
            if (r < 90 && g > 45 && g < 140 && b > 120 && b - r > 70) {
              blue += 1;
            }
          }
        }
        const blueRatio = sampled === 0 ? 0 : blue / sampled;
        return {
          blueRatio,
          checked: blueRatio > 0.32,
        };
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
    },
    frames.map((frame) => ({
      dataUrl: `data:image/png;base64,${frame.screenshot.toString("base64")}`,
      name: frame.name,
    })),
  );
}

export async function assertSwitchTransitionFrames({
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
  const progressSteps = detectedStats.slice(1).map((stats, index) => ({
    delta: stats.progress - (detectedStats[index]?.progress ?? stats.progress),
    from: detectedStats[index]?.name ?? "missing",
    to: stats.name,
  }));
  const missingTrackStates = detectedStats.filter(
    (stats) => stats.trackChecked === null,
  );
  const postClickTargetTrackStates = detectedStats
    .slice(1)
    .filter((stats) => stats.trackChecked === !initialChecked);
  const contradictoryTrackStates = detectedStats.slice(1).filter((stats) => {
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
      initialChecked,
      missingTrackStates,
      postClickTargetTrackStates,
      progressSteps,
      thumbStats,
    },
    null,
    2,
  );
  expect(detectedStats.length, failureDetails).toBe(frames.length);
  expect(postClickTargetTrackStates.length, failureDetails).toBeGreaterThan(0);
  expect(missingTrackStates, failureDetails).toHaveLength(0);
  expect(contradictoryTrackStates, failureDetails).toHaveLength(0);
}

export async function locateCheckedSwitchBounds(
  page: Page,
  screenshot: Buffer,
): Promise<Rect> {
  return await page.evaluate(
    async (dataUrl) => {
      const image = await loadImage(dataUrl);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Missing checked switch locator canvas context.");
      }
      ctx.drawImage(image, 0, 0);
      const { data, height, width } = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const pixels: Point[] = [];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = (y * width + x) * 4;
          const r = data[index] ?? 0;
          const g = data[index + 1] ?? 0;
          const b = data[index + 2] ?? 0;
          if (r < 80 && g > 45 && g < 130 && b > 120 && b - r > 70) {
            pixels.push({ x, y });
          }
        }
      }
      if (pixels.length < 12) {
        throw new Error(
          `Could not locate checked switch track pixels: ${JSON.stringify({
            height,
            matchedPixels: pixels.length,
            width,
          })}`,
        );
      }
      const left = Math.max(0, Math.min(...pixels.map((pixel) => pixel.x)) - 8);
      const right = Math.min(
        width,
        Math.max(...pixels.map((pixel) => pixel.x)) + 9,
      );
      const top = Math.max(0, Math.min(...pixels.map((pixel) => pixel.y)) - 8);
      const bottom = Math.min(
        height,
        Math.max(...pixels.map((pixel) => pixel.y)) + 9,
      );
      return {
        height: Math.max(1, bottom - top),
        width: Math.max(1, right - left),
        x: left,
        y: top,
      };

      async function loadImage(url: string): Promise<HTMLImageElement> {
        const loadedImage = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          loadedImage.onload = () => resolve();
          loadedImage.onerror = () =>
            reject(new Error("Failed to decode switch locator screenshot."));
        });
        loadedImage.src = url;
        await loaded;
        return loadedImage;
      }
    },
    `data:image/png;base64,${screenshot.toString("base64")}`,
  );
}

export async function compareScreenshots(
  page: Page,
  before: Buffer,
  after: Buffer,
): Promise<{
  readonly changedPixelRatio: number;
  readonly meanDelta: number;
}> {
  return await page.evaluate(
    async ({ afterDataUrl, beforeDataUrl }) => {
      const [beforeImage, afterImage] = await Promise.all([
        loadImageForCompare(beforeDataUrl),
        loadImageForCompare(afterDataUrl),
      ]);
      const width = Math.min(beforeImage.naturalWidth, afterImage.naturalWidth);
      const height = Math.min(
        beforeImage.naturalHeight,
        afterImage.naturalHeight,
      );
      const beforePixels = imagePixels(beforeImage, width, height);
      const afterPixels = imagePixels(afterImage, width, height);
      let changed = 0;
      let deltaTotal = 0;
      const total = width * height;
      for (let index = 0; index < total * 4; index += 4) {
        const delta =
          Math.abs((afterPixels[index] ?? 0) - (beforePixels[index] ?? 0)) +
          Math.abs(
            (afterPixels[index + 1] ?? 0) - (beforePixels[index + 1] ?? 0),
          ) +
          Math.abs(
            (afterPixels[index + 2] ?? 0) - (beforePixels[index + 2] ?? 0),
          );
        deltaTotal += delta / 3;
        if (delta >= 24) {
          changed += 1;
        }
      }
      return {
        changedPixelRatio: total === 0 ? 1 : changed / total,
        meanDelta: total === 0 ? 255 : deltaTotal / total,
      };

      async function loadImageForCompare(
        url: string,
      ): Promise<HTMLImageElement> {
        const image = new Image();
        const loaded = new Promise<void>((resolve, reject) => {
          image.onload = () => resolve();
          image.onerror = () =>
            reject(new Error("Failed to decode comparison screenshot."));
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
          throw new Error("Missing comparison analysis canvas context.");
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

export async function analyzeVerticalScrollbar(
  page: Page,
  screenshot: Buffer,
): Promise<ScrollbarStats> {
  return await page.evaluate(
    async (dataUrl) => {
      const image = new Image();
      const loaded = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(new Error("Failed to decode scrollbar screenshot."));
      });
      image.src = dataUrl;
      await loaded;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        throw new Error("Missing scrollbar analysis canvas context.");
      }
      ctx.drawImage(image, 0, 0);
      const { data, height, width } = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const columnCoverage = Array.from({ length: width }, (_, x) => {
        let visible = 0;
        for (let y = 0; y < height; y += 1) {
          const index = (y * width + x) * 4;
          const r = data[index] ?? 0;
          const g = data[index + 1] ?? 0;
          const b = data[index + 2] ?? 0;
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (b > 40 && luminance > 20 && Math.abs(b - r) > 8) {
            visible += 1;
          }
        }
        return visible / Math.max(1, height);
      });
      const visibleColumns = columnCoverage.filter(
        (coverage) => coverage > 0.25,
      );
      const duplicateColumnCount = columnCoverage.filter(
        (coverage) => coverage > 0.72,
      ).length;
      const sorted = [...columnCoverage].sort((left, right) => right - left);
      return {
        duplicateColumnCount,
        maxColumnCoverage: sorted[0] ?? 0,
        primaryColumnCoverage:
          sorted.slice(0, 8).reduce((total, coverage) => total + coverage, 0) /
          8,
        visibleColumnCount: visibleColumns.length,
      };
    },
    `data:image/png;base64,${screenshot.toString("base64")}`,
  );
}
