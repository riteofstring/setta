export type GpuViewport = {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
};

export type GpuViewportTuple = readonly [x: number, y: number, zoom: number];

export type GpuPoint = {
  readonly x: number;
  readonly y: number;
};

export type GpuRect = GpuPoint & {
  readonly height: number;
  readonly width: number;
};

export type GpuViewportInput = GpuViewport | GpuViewportTuple;

type GpuZoomBounds = {
  readonly maxZoom: number;
  readonly minZoom: number;
};

type GpuFitBoundsOptions = GpuZoomBounds & {
  readonly canvasHeight: number;
  readonly canvasWidth: number;
  readonly keepCurrentZoomIfPossible?: boolean | undefined;
  readonly overviewWidth?: number | undefined;
  readonly padding?: number | undefined;
  readonly viewport?: GpuViewportInput | undefined;
};

export function normalizeGpuViewport(viewport: GpuViewportInput): GpuViewport {
  if (Array.isArray(viewport)) {
    const [x, y, zoom] = viewport as GpuViewportTuple;
    assertFiniteNumber("viewport x", x);
    assertFiniteNumber("viewport y", y);
    assertFinitePositive("viewport zoom", zoom);
    return { x, y, zoom };
  }

  const normalizedViewport = viewport as GpuViewport;
  assertFiniteNumber("viewport x", normalizedViewport.x);
  assertFiniteNumber("viewport y", normalizedViewport.y);
  assertFinitePositive("viewport zoom", normalizedViewport.zoom);
  return normalizedViewport;
}

export function gpuViewportToTuple(
  viewportInput: GpuViewportInput,
): GpuViewportTuple {
  const viewport = normalizeGpuViewport(viewportInput);
  return [viewport.x, viewport.y, viewport.zoom];
}

export function flowToScreenPosition(
  point: GpuPoint,
  viewportInput: GpuViewportInput,
): GpuPoint {
  const viewport = normalizeGpuViewport(viewportInput);
  return {
    x: viewport.x + point.x * viewport.zoom,
    y: viewport.y + point.y * viewport.zoom,
  };
}

export function screenToFlowPosition(
  point: GpuPoint,
  viewportInput: GpuViewportInput,
): GpuPoint {
  const viewport = normalizeGpuViewport(viewportInput);
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function panGpuViewportBy(
  viewportInput: GpuViewportInput,
  delta: GpuPoint,
): GpuViewport {
  assertFiniteNumber("pan delta x", delta.x);
  assertFiniteNumber("pan delta y", delta.y);
  const viewport = normalizeGpuViewport(viewportInput);
  return {
    x: viewport.x + delta.x,
    y: viewport.y + delta.y,
    zoom: viewport.zoom,
  };
}

export function clampGpuZoom(
  zoom: number,
  { maxZoom, minZoom }: GpuZoomBounds,
): number {
  assertFinitePositive("zoom", zoom);
  assertFinitePositive("minimum zoom", minZoom);
  assertFinitePositive("maximum zoom", maxZoom);
  if (minZoom > maxZoom) {
    throw new Error("minimum zoom must be less than or equal to maximum zoom.");
  }
  return Math.max(minZoom, Math.min(zoom, maxZoom));
}

export function zoomGpuViewportAtScreenPoint({
  maxZoom,
  minZoom,
  point,
  viewport,
  zoom,
}: GpuZoomBounds & {
  readonly point: GpuPoint;
  readonly viewport: GpuViewportInput;
  readonly zoom: number;
}): GpuViewport {
  assertFiniteNumber("zoom point x", point.x);
  assertFiniteNumber("zoom point y", point.y);
  const normalizedViewport = normalizeGpuViewport(viewport);
  const nextZoom = clampGpuZoom(zoom, { maxZoom, minZoom });
  const flowPoint = screenToFlowPosition(point, normalizedViewport);
  return {
    x: point.x - flowPoint.x * nextZoom,
    y: point.y - flowPoint.y * nextZoom,
    zoom: nextZoom,
  };
}

export function zoomGpuViewportBy({
  factor,
  maxZoom,
  minZoom,
  point,
  viewport,
}: GpuZoomBounds & {
  readonly factor: number;
  readonly point: GpuPoint;
  readonly viewport: GpuViewportInput;
}): GpuViewport {
  assertFinitePositive("zoom factor", factor);
  const normalizedViewport = normalizeGpuViewport(viewport);
  return zoomGpuViewportAtScreenPoint({
    maxZoom,
    minZoom,
    point,
    viewport: normalizedViewport,
    zoom: normalizedViewport.zoom * factor,
  });
}

export function centerGpuViewportOnPoint({
  canvasHeight,
  canvasWidth,
  point,
  zoom,
}: {
  readonly canvasHeight: number;
  readonly canvasWidth: number;
  readonly point: GpuPoint;
  readonly zoom: number;
}): GpuViewport {
  assertFiniteNonNegative("canvas width", canvasWidth);
  assertFiniteNonNegative("canvas height", canvasHeight);
  assertFiniteNumber("center point x", point.x);
  assertFiniteNumber("center point y", point.y);
  assertFinitePositive("center zoom", zoom);
  return {
    x: canvasWidth / 2 - point.x * zoom,
    y: canvasHeight / 2 - point.y * zoom,
    zoom,
  };
}

export function getGpuViewportForBounds(
  bounds: GpuRect,
  options: GpuFitBoundsOptions,
): GpuViewport {
  const padding = validateGpuFitBoundsInput(bounds, options);

  if (hasZeroGpuFitDimension(bounds, options)) {
    return getZeroDimensionGpuFitViewport(bounds, options);
  }

  const xZoom = options.canvasWidth / (bounds.width * (1 + padding));
  const yZoom = options.canvasHeight / (bounds.height * (1 + padding));
  const unclampedZoom = Math.min(xZoom, yZoom);
  const zoom = resolveGpuFitBoundsZoom(unclampedZoom, options);
  const boundsCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };

  return {
    x:
      options.canvasWidth / 2 -
      boundsCenter.x * zoom +
      (options.overviewWidth ?? 0),
    y: options.canvasHeight / 2 - boundsCenter.y * zoom,
    zoom,
  };
}

function validateGpuFitBoundsInput(
  bounds: GpuRect,
  options: GpuFitBoundsOptions,
): number {
  assertFiniteNumber("bounds x", bounds.x);
  assertFiniteNumber("bounds y", bounds.y);
  assertFiniteNonNegative("bounds width", bounds.width);
  assertFiniteNonNegative("bounds height", bounds.height);
  assertFiniteNonNegative("canvas width", options.canvasWidth);
  assertFiniteNonNegative("canvas height", options.canvasHeight);
  const padding = options.padding ?? 0.1;
  assertFiniteNonNegative("fit view padding", padding);
  return padding;
}

function hasZeroGpuFitDimension(
  bounds: GpuRect,
  options: Pick<GpuFitBoundsOptions, "canvasHeight" | "canvasWidth">,
): boolean {
  return (
    bounds.width === 0 ||
    bounds.height === 0 ||
    options.canvasWidth === 0 ||
    options.canvasHeight === 0
  );
}

function getZeroDimensionGpuFitViewport(
  bounds: GpuRect,
  options: GpuFitBoundsOptions,
): GpuViewport {
  const zoom = clampGpuZoom(
    normalizeGpuViewport(options.viewport ?? [0, 0, 1]).zoom,
    options,
  );
  return centerGpuViewportOnPoint({
    canvasHeight: options.canvasHeight,
    canvasWidth: options.canvasWidth,
    point: bounds,
    zoom,
  });
}

function resolveGpuFitBoundsZoom(
  unclampedZoom: number,
  options: GpuFitBoundsOptions,
): number {
  const clampedZoom = clampGpuZoom(unclampedZoom, options);
  const currentZoom = options.viewport
    ? normalizeGpuViewport(options.viewport).zoom
    : clampedZoom;
  if (
    options.keepCurrentZoomIfPossible &&
    unclampedZoom >= currentZoom &&
    clampedZoom <= currentZoom
  ) {
    return currentZoom;
  }
  return clampedZoom;
}

export function getVisibleFlowRect({
  canvasHeight,
  canvasWidth,
  marginCssPx = 0,
  viewport,
}: {
  readonly canvasHeight: number;
  readonly canvasWidth: number;
  readonly marginCssPx?: number | undefined;
  readonly viewport: GpuViewportInput;
}): GpuRect {
  assertFiniteNonNegative("canvas width", canvasWidth);
  assertFiniteNonNegative("canvas height", canvasHeight);
  assertFiniteNonNegative("viewport margin", marginCssPx);

  const topLeft = screenToFlowPosition(
    {
      x: -marginCssPx,
      y: -marginCssPx,
    },
    viewport,
  );
  const bottomRight = screenToFlowPosition(
    {
      x: canvasWidth + marginCssPx,
      y: canvasHeight + marginCssPx,
    },
    viewport,
  );

  return {
    height: bottomRight.y - topLeft.y,
    width: bottomRight.x - topLeft.x,
    x: topLeft.x,
    y: topLeft.y,
  };
}

export function rectsIntersect(left: GpuRect, right: GpuRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function assertFiniteNonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}

function assertFinitePositive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
}

function assertFiniteNumber(name: string, value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
}
