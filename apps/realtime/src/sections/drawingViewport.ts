export const DRAWING_VIEWPORT_MINIMUM_SCALE = 0.1;
export const DRAWING_VIEWPORT_MAXIMUM_SCALE = 10;
const DRAWING_VIEWPORT_ZOOM_STEP = 1.2;

export type DrawingViewportSize = Readonly<{
  height: number;
  width: number;
}>;

export type DrawingViewportPoint = Readonly<{
  x: number;
  y: number;
}>;

type DrawingViewportMode = "custom" | "fit";

export type DrawingViewportSnapshot = Readonly<{
  logicalSize: DrawingViewportSize;
  mode: DrawingViewportMode;
  pan: DrawingViewportPoint;
  scale: number;
  stageSize: DrawingViewportSize;
}>;

export type DrawingViewportPresentation = Readonly<{
  canZoomIn: boolean;
  canZoomOut: boolean;
  displayHeight: number;
  displayWidth: number;
  maximumPanX: number;
  maximumPanY: number;
  mode: DrawingViewportMode;
  panX: number;
  panY: number;
  scale: number;
  zoomPercent: number;
}>;

type DrawingViewportZoomDirection = "in" | "out";

const DRAWING_VIEWPORT_NUMBER_PRECISION = 1_000_000;

function normalizeNumber(value: number): number {
  const normalized =
    Math.round(value * DRAWING_VIEWPORT_NUMBER_PRECISION) /
    DRAWING_VIEWPORT_NUMBER_PRECISION;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function requireLogicalSize(size: DrawingViewportSize): DrawingViewportSize {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width <= 0 ||
    size.height <= 0
  ) {
    throw new RangeError(
      "Drawing viewport logical dimensions must be positive.",
    );
  }
  return Object.freeze({
    height: normalizeNumber(size.height),
    width: normalizeNumber(size.width),
  });
}

function requireStageSize(size: DrawingViewportSize): DrawingViewportSize {
  if (
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width < 0 ||
    size.height < 0
  ) {
    throw new RangeError(
      "Drawing viewport stage dimensions must be non-negative.",
    );
  }
  return Object.freeze({
    height: normalizeNumber(size.height),
    width: normalizeNumber(size.width),
  });
}

function requireFinitePoint(point: DrawingViewportPoint): DrawingViewportPoint {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError("Drawing viewport pan values must be finite.");
  }
  return Object.freeze({
    x: normalizeNumber(point.x),
    y: normalizeNumber(point.y),
  });
}

function requireScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new RangeError("Drawing viewport scale must be positive and finite.");
  }
  return normalizeNumber(scale);
}

function fitScale(
  logicalSize: DrawingViewportSize,
  stageSize: DrawingViewportSize,
): number {
  if (stageSize.width === 0 || stageSize.height === 0) {
    return 0;
  }
  return Math.min(
    stageSize.width / logicalSize.width,
    stageSize.height / logicalSize.height,
  );
}

function zoomBounds(
  logicalSize: DrawingViewportSize,
  stageSize: DrawingViewportSize,
): { maximum: number; minimum: number } {
  const fittedScale = fitScale(logicalSize, stageSize);
  if (fittedScale === 0) {
    return {
      maximum: DRAWING_VIEWPORT_MAXIMUM_SCALE,
      minimum: DRAWING_VIEWPORT_MINIMUM_SCALE,
    };
  }
  return {
    maximum: Math.max(DRAWING_VIEWPORT_MAXIMUM_SCALE, fittedScale),
    minimum: Math.min(DRAWING_VIEWPORT_MINIMUM_SCALE, fittedScale),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function maximumPan(
  logicalLength: number,
  stageLength: number,
  scale: number,
): number {
  if (stageLength === 0 || scale === 0) {
    return 0;
  }
  return normalizeNumber(
    Math.max(0, (logicalLength * scale - stageLength) / 2),
  );
}

function resolvePan(
  logicalSize: DrawingViewportSize,
  stageSize: DrawingViewportSize,
  scale: number,
  pan: DrawingViewportPoint,
): DrawingViewportPoint {
  const maximumX = maximumPan(logicalSize.width, stageSize.width, scale);
  const maximumY = maximumPan(logicalSize.height, stageSize.height, scale);
  return Object.freeze({
    x: normalizeNumber(clamp(pan.x, -maximumX, maximumX)),
    y: normalizeNumber(clamp(pan.y, -maximumY, maximumY)),
  });
}

function snapshotsMatch(
  left: DrawingViewportSnapshot,
  right: DrawingViewportSnapshot,
): boolean {
  return (
    left.logicalSize.width === right.logicalSize.width &&
    left.logicalSize.height === right.logicalSize.height &&
    left.mode === right.mode &&
    left.pan.x === right.pan.x &&
    left.pan.y === right.pan.y &&
    left.scale === right.scale &&
    left.stageSize.width === right.stageSize.width &&
    left.stageSize.height === right.stageSize.height
  );
}

function resolveSnapshot(
  logicalSizeInput: DrawingViewportSize,
  stageSizeInput: DrawingViewportSize,
  mode: DrawingViewportMode,
  requestedScale: number,
  panInput: DrawingViewportPoint,
): DrawingViewportSnapshot {
  const logicalSize = requireLogicalSize(logicalSizeInput);
  const stageSize = requireStageSize(stageSizeInput);
  const pan = requireFinitePoint(panInput);
  const bounds = zoomBounds(logicalSize, stageSize);
  const scale =
    mode === "fit"
      ? fitScale(logicalSize, stageSize)
      : normalizeNumber(
          clamp(requireScale(requestedScale), bounds.minimum, bounds.maximum),
        );
  return Object.freeze({
    logicalSize,
    mode,
    pan: resolvePan(logicalSize, stageSize, scale, pan),
    scale,
    stageSize,
  });
}

function updateSnapshot(
  snapshot: DrawingViewportSnapshot,
  values: Readonly<{
    logicalSize?: DrawingViewportSize;
    mode?: DrawingViewportMode;
    pan?: DrawingViewportPoint;
    scale?: number;
    stageSize?: DrawingViewportSize;
  }>,
): DrawingViewportSnapshot {
  const next = resolveSnapshot(
    values.logicalSize ?? snapshot.logicalSize,
    values.stageSize ?? snapshot.stageSize,
    values.mode ?? snapshot.mode,
    values.scale ?? snapshot.scale,
    values.pan ?? snapshot.pan,
  );
  return snapshotsMatch(snapshot, next) ? snapshot : next;
}

export function createDrawingViewport(
  logicalSize: DrawingViewportSize,
  stageSize: DrawingViewportSize,
): DrawingViewportSnapshot {
  return resolveSnapshot(logicalSize, stageSize, "fit", 1, { x: 0, y: 0 });
}

export function fitDrawingViewport(
  snapshot: DrawingViewportSnapshot,
): DrawingViewportSnapshot {
  return updateSnapshot(snapshot, { mode: "fit", pan: { x: 0, y: 0 } });
}

export function actualSizeDrawingViewport(
  snapshot: DrawingViewportSnapshot,
): DrawingViewportSnapshot {
  return updateSnapshot(snapshot, { mode: "custom", scale: 1 });
}

export function setDrawingViewportZoom(
  snapshot: DrawingViewportSnapshot,
  scale: number,
): DrawingViewportSnapshot {
  return updateSnapshot(snapshot, {
    mode: "custom",
    scale: requireScale(scale),
  });
}

export function stepDrawingViewportZoom(
  snapshot: DrawingViewportSnapshot,
  direction: DrawingViewportZoomDirection,
): DrawingViewportSnapshot {
  const bounds = zoomBounds(snapshot.logicalSize, snapshot.stageSize);
  if (direction === "out" && snapshot.scale <= bounds.minimum) {
    return snapshot;
  }
  if (direction === "in" && snapshot.scale >= bounds.maximum) {
    return snapshot;
  }
  const scale =
    snapshot.scale === 0
      ? bounds.minimum
      : snapshot.scale *
        (direction === "in"
          ? DRAWING_VIEWPORT_ZOOM_STEP
          : 1 / DRAWING_VIEWPORT_ZOOM_STEP);
  return setDrawingViewportZoom(snapshot, scale);
}

export function panDrawingViewport(
  snapshot: DrawingViewportSnapshot,
  delta: DrawingViewportPoint,
): DrawingViewportSnapshot {
  const resolvedDelta = requireFinitePoint(delta);
  return updateSnapshot(snapshot, {
    pan: {
      x: snapshot.pan.x + resolvedDelta.x,
      y: snapshot.pan.y + resolvedDelta.y,
    },
  });
}

export function resizeDrawingViewportStage(
  snapshot: DrawingViewportSnapshot,
  stageSize: DrawingViewportSize,
): DrawingViewportSnapshot {
  return updateSnapshot(snapshot, { stageSize });
}

export function resizeDrawingViewportLogical(
  snapshot: DrawingViewportSnapshot,
  logicalSize: DrawingViewportSize,
): DrawingViewportSnapshot {
  return updateSnapshot(snapshot, { logicalSize });
}

export function getDrawingViewportPresentation(
  snapshot: DrawingViewportSnapshot,
): DrawingViewportPresentation {
  const bounds = zoomBounds(snapshot.logicalSize, snapshot.stageSize);
  return Object.freeze({
    canZoomIn: snapshot.scale < bounds.maximum,
    canZoomOut: snapshot.scale > bounds.minimum,
    displayHeight: normalizeNumber(
      snapshot.logicalSize.height * snapshot.scale,
    ),
    displayWidth: normalizeNumber(snapshot.logicalSize.width * snapshot.scale),
    maximumPanX: maximumPan(
      snapshot.logicalSize.width,
      snapshot.stageSize.width,
      snapshot.scale,
    ),
    maximumPanY: maximumPan(
      snapshot.logicalSize.height,
      snapshot.stageSize.height,
      snapshot.scale,
    ),
    mode: snapshot.mode,
    panX: snapshot.pan.x,
    panY: snapshot.pan.y,
    scale: snapshot.scale,
    zoomPercent: normalizeNumber(snapshot.scale * 100),
  });
}
