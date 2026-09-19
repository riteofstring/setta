export type NormalizedAnnotationPoint = Readonly<{
  x: number;
  y: number;
}>;

export type ArtifactAnnotationStroke = Readonly<{
  color?: string;
  id: string;
  points: readonly NormalizedAnnotationPoint[];
  width?: number;
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

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function validBounds(bounds: AnnotationBounds): boolean {
  return (
    Number.isFinite(bounds.left) &&
    Number.isFinite(bounds.top) &&
    positiveFinite(bounds.width) &&
    positiveFinite(bounds.height)
  );
}

function pointWithinBounds(
  clientX: number,
  clientY: number,
  bounds: AnnotationBounds,
): boolean {
  return (
    clientX >= bounds.left &&
    clientX <= bounds.left + bounds.width &&
    clientY >= bounds.top &&
    clientY <= bounds.top + bounds.height
  );
}

export function containedImageBounds(
  bounds: AnnotationBounds,
  naturalWidth: number,
  naturalHeight: number,
): AnnotationBounds | null {
  if (
    !validBounds(bounds) ||
    !positiveFinite(naturalWidth) ||
    !positiveFinite(naturalHeight)
  ) {
    return null;
  }
  const scale = Math.min(
    bounds.width / naturalWidth,
    bounds.height / naturalHeight,
  );
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    height,
    left: bounds.left + (bounds.width - width) / 2,
    top: bounds.top + (bounds.height - height) / 2,
    width,
  };
}

export function normalizeAnnotationPoint(
  clientX: number,
  clientY: number,
  bounds: AnnotationBounds,
): NormalizedAnnotationPoint | null {
  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY) ||
    !validBounds(bounds) ||
    !pointWithinBounds(clientX, clientY, bounds)
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
