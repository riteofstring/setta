import { roundChromeReproMs } from "state/actions/chromeRepro";

export type ProjectGpuChromeReproCanvasProbe = {
  readonly alphaNonZeroRatio?: number | undefined;
  readonly available: boolean;
  readonly backingRect?: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly canvasRect?: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly centerPixel?: {
    readonly a: number;
    readonly b: number;
    readonly g: number;
    readonly r: number;
  };
  readonly colorBucketCount?: number | undefined;
  readonly errorMessage?: string | undefined;
  readonly lumaMean?: number | undefined;
  readonly lumaStdDev?: number | undefined;
  readonly nonUniformPixelRatio?: number | undefined;
  readonly reason?: string | undefined;
  readonly sampleRectCss?: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly totalPixels?: number | undefined;
};

export function createProjectGpuCanvasInkProbeAtClientPoint({
  clientPoint,
  radiusCssPx = 12,
  target,
}: {
  readonly clientPoint: { readonly x: number; readonly y: number };
  readonly radiusCssPx?: number | undefined;
  readonly target?: EventTarget | null | undefined;
}): ProjectGpuChromeReproCanvasProbe {
  const canvas = findProjectGpuCanvas(target);
  if (!canvas) {
    return { available: false, reason: "missing-canvas" };
  }
  const canvasRect = canvas.getBoundingClientRect();
  const roundedCanvasRect = roundProjectGpuChromeReproRect({
    height: canvasRect.height,
    width: canvasRect.width,
    x: canvasRect.x,
    y: canvasRect.y,
  });
  if (
    canvasRect.width <= 0 ||
    canvasRect.height <= 0 ||
    canvas.width <= 0 ||
    canvas.height <= 0
  ) {
    return {
      available: false,
      canvasRect: roundedCanvasRect,
      reason: "empty-canvas",
    };
  }

  const pointCssX = clientPoint.x - canvasRect.left;
  const pointCssY = clientPoint.y - canvasRect.top;
  if (
    pointCssX < 0 ||
    pointCssY < 0 ||
    pointCssX >= canvasRect.width ||
    pointCssY >= canvasRect.height
  ) {
    return {
      available: false,
      canvasRect: roundedCanvasRect,
      reason: "point-outside-canvas",
    };
  }

  const sampleRectCss = {
    height: Math.min(radiusCssPx * 2, canvasRect.height),
    width: Math.min(radiusCssPx * 2, canvasRect.width),
    x: clampNumber(pointCssX - radiusCssPx, 0, canvasRect.width),
    y: clampNumber(pointCssY - radiusCssPx, 0, canvasRect.height),
  };
  sampleRectCss.width = Math.min(
    sampleRectCss.width,
    canvasRect.width - sampleRectCss.x,
  );
  sampleRectCss.height = Math.min(
    sampleRectCss.height,
    canvasRect.height - sampleRectCss.y,
  );

  const scaleX = canvas.width / canvasRect.width;
  const scaleY = canvas.height / canvasRect.height;
  const sourceX = Math.floor(sampleRectCss.x * scaleX);
  const sourceY = Math.floor(sampleRectCss.y * scaleY);
  const sourceWidth = Math.max(1, Math.ceil(sampleRectCss.width * scaleX));
  const sourceHeight = Math.max(1, Math.ceil(sampleRectCss.height * scaleY));
  const tempCanvas = canvas.ownerDocument.createElement("canvas");
  tempCanvas.width = sourceWidth;
  tempCanvas.height = sourceHeight;
  const context = tempCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return {
      available: false,
      canvasRect: roundedCanvasRect,
      reason: "missing-2d-context",
    };
  }

  try {
    context.drawImage(
      canvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight,
    );
    return summarizeProjectGpuCanvasProbePixels({
      backingRect: {
        height: sourceHeight,
        width: sourceWidth,
        x: sourceX,
        y: sourceY,
      },
      canvasRect: roundedCanvasRect,
      imageData: context.getImageData(0, 0, sourceWidth, sourceHeight),
      sampleRectCss,
    });
  } catch (error) {
    return {
      available: false,
      canvasRect: roundedCanvasRect,
      errorMessage: getProjectGpuCanvasProbeErrorMessage(error),
      reason: "read-failed",
    };
  }
}

export function roundProjectGpuChromeReproRect(rect: {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}) {
  return {
    height: roundChromeReproMs(rect.height),
    width: roundChromeReproMs(rect.width),
    x: roundChromeReproMs(rect.x),
    y: roundChromeReproMs(rect.y),
  };
}

function findProjectGpuCanvas(
  target: EventTarget | null | undefined,
): HTMLCanvasElement | null {
  if (target instanceof HTMLCanvasElement) {
    return target;
  }
  if (target instanceof Element) {
    const root = target.closest(".setta-gpu-flow");
    const canvas = root?.querySelector("canvas.setta-gpu-flow__canvas");
    if (canvas instanceof HTMLCanvasElement) {
      return canvas;
    }
  }
  const fallbackCanvas = document.querySelector(
    "canvas.setta-gpu-flow__canvas",
  );
  return fallbackCanvas instanceof HTMLCanvasElement ? fallbackCanvas : null;
}

function summarizeProjectGpuCanvasProbePixels({
  backingRect,
  canvasRect,
  imageData,
  sampleRectCss,
}: {
  readonly backingRect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly canvasRect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
  readonly imageData: ImageData;
  readonly sampleRectCss: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  };
}): ProjectGpuChromeReproCanvasProbe {
  const data = imageData.data;
  const totalPixels = Math.floor(data.length / 4);
  if (totalPixels <= 0) {
    return {
      available: false,
      backingRect,
      canvasRect,
      reason: "empty-sample",
      sampleRectCss: roundProjectGpuChromeReproRect(sampleRectCss),
    };
  }

  const firstR = data[0] ?? 0;
  const firstG = data[1] ?? 0;
  const firstB = data[2] ?? 0;
  const firstA = data[3] ?? 0;
  let alphaNonZeroCount = 0;
  let lumaSum = 0;
  let lumaSquareSum = 0;
  let nonUniformPixelCount = 0;
  const colorBuckets = new Set<number>();
  for (let offset = 0; offset < data.length; offset += 4) {
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const a = data[offset + 3] ?? 0;
    if (a > 0) {
      alphaNonZeroCount += 1;
    }
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma;
    lumaSquareSum += luma * luma;
    if (
      Math.abs(r - firstR) +
        Math.abs(g - firstG) +
        Math.abs(b - firstB) +
        Math.abs(a - firstA) >
      8
    ) {
      nonUniformPixelCount += 1;
    }
    colorBuckets.add(
      ((r >> 5) << 15) | ((g >> 5) << 10) | ((b >> 5) << 5) | (a >> 5),
    );
  }
  const lumaMean = lumaSum / totalPixels;
  const lumaVariance = Math.max(
    0,
    lumaSquareSum / totalPixels - lumaMean * lumaMean,
  );
  const centerOffset =
    (Math.floor(imageData.height / 2) * imageData.width +
      Math.floor(imageData.width / 2)) *
    4;
  return {
    alphaNonZeroRatio: roundProjectGpuChromeReproRatio(
      alphaNonZeroCount / totalPixels,
    ),
    available: true,
    backingRect,
    canvasRect,
    centerPixel: {
      a: data[centerOffset + 3] ?? 0,
      b: data[centerOffset + 2] ?? 0,
      g: data[centerOffset + 1] ?? 0,
      r: data[centerOffset] ?? 0,
    },
    colorBucketCount: colorBuckets.size,
    lumaMean: roundChromeReproMs(lumaMean),
    lumaStdDev: roundChromeReproMs(Math.sqrt(lumaVariance)),
    nonUniformPixelRatio: roundProjectGpuChromeReproRatio(
      nonUniformPixelCount / totalPixels,
    ),
    sampleRectCss: roundProjectGpuChromeReproRect(sampleRectCss),
    totalPixels,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundProjectGpuChromeReproRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function getProjectGpuCanvasProbeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
