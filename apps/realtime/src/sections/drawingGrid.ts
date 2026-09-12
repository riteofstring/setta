export const DRAWING_GRID_DEFAULT_SPACING = 16;
export const DRAWING_GRID_MAXIMUM_SPACING = 256;
export const DRAWING_GRID_MINIMUM_SPACING = 2;

export type DrawingGridPoint = Readonly<{
  x: number;
  y: number;
}>;

export function isDrawingGridSpacing(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= DRAWING_GRID_MINIMUM_SPACING &&
    value <= DRAWING_GRID_MAXIMUM_SPACING
  );
}

export function clampDrawingGridSpacing(spacing: number): number {
  if (!Number.isFinite(spacing)) {
    throw new RangeError("Drawing grid spacing must be finite.");
  }
  return Math.min(
    DRAWING_GRID_MAXIMUM_SPACING,
    Math.max(DRAWING_GRID_MINIMUM_SPACING, Math.round(spacing)),
  );
}

function requireFinitePoint(point: DrawingGridPoint): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError("Drawing grid points must be finite.");
  }
}

function nearestGridCoordinate(coordinate: number, spacing: number): number {
  const intervals = coordinate / spacing;
  const roundedIntervals =
    intervals < 0 ? -Math.round(-intervals) : Math.round(intervals);
  const snapped = roundedIntervals * spacing;
  return Object.is(snapped, -0) ? 0 : snapped;
}

export function snapDrawingPointToGrid(
  point: DrawingGridPoint,
  spacing = DRAWING_GRID_DEFAULT_SPACING,
): DrawingGridPoint {
  requireFinitePoint(point);
  const resolvedSpacing = clampDrawingGridSpacing(spacing);
  const x = nearestGridCoordinate(point.x, resolvedSpacing);
  const y = nearestGridCoordinate(point.y, resolvedSpacing);
  if (point.x === x && point.y === y) {
    return point;
  }
  return Object.freeze({ x, y });
}
