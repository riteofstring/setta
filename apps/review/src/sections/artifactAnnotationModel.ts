export type NormalizedAnnotationPoint = Readonly<{
  x: number;
  y: number;
}>;

export type ArtifactAnnotationStroke = Readonly<{
  id: string;
  points: readonly NormalizedAnnotationPoint[];
}>;

export type AnnotationBounds = Readonly<{
  height: number;
  left: number;
  top: number;
  width: number;
}>;

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function samePoint(
  first: NormalizedAnnotationPoint,
  second: NormalizedAnnotationPoint,
): boolean {
  return first.x === second.x && first.y === second.y;
}

export function normalizeAnnotationPoint(
  clientX: number,
  clientY: number,
  bounds: AnnotationBounds,
): NormalizedAnnotationPoint | null {
  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY) ||
    !Number.isFinite(bounds.left) ||
    !Number.isFinite(bounds.top) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return null;
  }
  return {
    x: clampUnit((clientX - bounds.left) / bounds.width),
    y: clampUnit((clientY - bounds.top) / bounds.height),
  };
}

export function appendDistinctAnnotationPoint(
  points: readonly NormalizedAnnotationPoint[],
  point: NormalizedAnnotationPoint,
): readonly NormalizedAnnotationPoint[] {
  const lastPoint = points.at(-1);
  return lastPoint && samePoint(lastPoint, point) ? points : [...points, point];
}

export function settleAnnotationStroke(
  points: readonly NormalizedAnnotationPoint[],
): readonly NormalizedAnnotationPoint[] | null {
  const settled: NormalizedAnnotationPoint[] = [];
  for (const point of points) {
    const lastPoint = settled.at(-1);
    if (!lastPoint || !samePoint(lastPoint, point)) {
      settled.push({ x: point.x, y: point.y });
    }
  }
  return settled.length >= 2 ? settled : null;
}

export function annotationPath(
  points: readonly NormalizedAnnotationPoint[],
): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}
