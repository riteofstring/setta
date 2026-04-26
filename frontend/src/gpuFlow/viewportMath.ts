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
