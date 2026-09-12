export type DrawingViewportSize = Readonly<{
  height: number;
  width: number;
}>;

export type DrawingViewportSnapshot = Readonly<{
  logicalSize: DrawingViewportSize;
  scale: number;
  stageSize: DrawingViewportSize;
}>;

export type DrawingViewportPresentation = Readonly<{
  displayHeight: number;
  displayWidth: number;
  scale: number;
}>;

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

function fitScale(
  logicalSize: DrawingViewportSize,
  stageSize: DrawingViewportSize,
): number {
  if (stageSize.width === 0 || stageSize.height === 0) {
    return 0;
  }
  return normalizeNumber(
    Math.min(
      stageSize.width / logicalSize.width,
      stageSize.height / logicalSize.height,
    ),
  );
}

function resolveSnapshot(
  logicalSizeInput: DrawingViewportSize,
  stageSizeInput: DrawingViewportSize,
): DrawingViewportSnapshot {
  const logicalSize = requireLogicalSize(logicalSizeInput);
  const stageSize = requireStageSize(stageSizeInput);
  return Object.freeze({
    logicalSize,
    scale: fitScale(logicalSize, stageSize),
    stageSize,
  });
}

function snapshotsMatch(
  left: DrawingViewportSnapshot,
  right: DrawingViewportSnapshot,
): boolean {
  return (
    left.logicalSize.width === right.logicalSize.width &&
    left.logicalSize.height === right.logicalSize.height &&
    left.scale === right.scale &&
    left.stageSize.width === right.stageSize.width &&
    left.stageSize.height === right.stageSize.height
  );
}

function updateSnapshot(
  snapshot: DrawingViewportSnapshot,
  logicalSize: DrawingViewportSize,
  stageSize: DrawingViewportSize,
): DrawingViewportSnapshot {
  const next = resolveSnapshot(logicalSize, stageSize);
  return snapshotsMatch(snapshot, next) ? snapshot : next;
}

export function createDrawingViewport(
  logicalSize: DrawingViewportSize,
  stageSize: DrawingViewportSize,
): DrawingViewportSnapshot {
  return resolveSnapshot(logicalSize, stageSize);
}

export function resizeDrawingViewportStage(
  snapshot: DrawingViewportSnapshot,
  stageSize: DrawingViewportSize,
): DrawingViewportSnapshot {
  return updateSnapshot(snapshot, snapshot.logicalSize, stageSize);
}

export function resizeDrawingViewportLogical(
  snapshot: DrawingViewportSnapshot,
  logicalSize: DrawingViewportSize,
): DrawingViewportSnapshot {
  return updateSnapshot(snapshot, logicalSize, snapshot.stageSize);
}

export function getDrawingViewportPresentation(
  snapshot: DrawingViewportSnapshot,
): DrawingViewportPresentation {
  return Object.freeze({
    displayHeight: normalizeNumber(
      snapshot.logicalSize.height * snapshot.scale,
    ),
    displayWidth: normalizeNumber(snapshot.logicalSize.width * snapshot.scale),
    scale: snapshot.scale,
  });
}
