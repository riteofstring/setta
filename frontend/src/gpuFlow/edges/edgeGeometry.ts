import { type GpuPoint, type GpuRect } from "../viewportMath";

export type GpuEdgeSide = "bottom" | "left" | "right" | "top";

type GpuEdgeKind = "bezier" | "straight";

type GpuEdgeLabelGeometry = GpuPoint & {
  readonly offsetX: number;
  readonly offsetY: number;
};

type GpuStraightEdgeGeometry = {
  readonly bounds: GpuRect;
  readonly edgeId: string;
  readonly kind: "straight";
  readonly label: GpuEdgeLabelGeometry;
  readonly source: GpuPoint;
  readonly target: GpuPoint;
};

type GpuBezierEdgeGeometry = {
  readonly bounds: GpuRect;
  readonly curvature: number;
  readonly edgeId: string;
  readonly kind: "bezier";
  readonly label: GpuEdgeLabelGeometry;
  readonly source: GpuPoint;
  readonly sourceControl: GpuPoint;
  readonly sourceSide: GpuEdgeSide;
  readonly target: GpuPoint;
  readonly targetControl: GpuPoint;
  readonly targetSide: GpuEdgeSide;
};

export type GpuEdgeGeometry = GpuBezierEdgeGeometry | GpuStraightEdgeGeometry;

type GpuEdgeGeometryInput = {
  readonly curvature?: number | undefined;
  readonly edgeId: string;
  readonly source: GpuPoint;
  readonly sourceSide?: string | null | undefined;
  readonly target: GpuPoint;
  readonly targetSide?: string | null | undefined;
  readonly type?: string | null | undefined;
};

export type GpuEdgeHitTestInput = {
  readonly edgeId: string;
  readonly geometry: GpuEdgeGeometry;
  readonly selectable?: boolean | undefined;
  readonly zIndex?: number | undefined;
};

export type GpuEdgeHitTestResult = {
  readonly distance: number;
  readonly edgeId: string;
  readonly zIndex: number;
};

const DEFAULT_BEZIER_CURVATURE = 0.25;
const DEFAULT_BEZIER_SEGMENTS = 24;
const MIN_BEZIER_SEGMENTS = 1;

export function buildGpuEdgeGeometry(
  input: GpuEdgeGeometryInput,
): GpuEdgeGeometry {
  if (resolveGpuEdgeKind(input.type) === "straight") {
    return getGpuStraightEdgeGeometry(input);
  }
  return getGpuBezierEdgeGeometry(input);
}

export function getGpuStraightEdgeGeometry({
  edgeId,
  source,
  target,
}: Pick<
  GpuEdgeGeometryInput,
  "edgeId" | "source" | "target"
>): GpuStraightEdgeGeometry {
  const normalizedSource = normalizeGpuPoint("source", source);
  const normalizedTarget = normalizeGpuPoint("target", target);
  return {
    bounds: getBoundsForPoints([normalizedSource, normalizedTarget]),
    edgeId,
    kind: "straight",
    label: getStraightEdgeLabel(normalizedSource, normalizedTarget),
    source: normalizedSource,
    target: normalizedTarget,
  };
}

export function getGpuBezierEdgeGeometry({
  curvature = DEFAULT_BEZIER_CURVATURE,
  edgeId,
  source,
  sourceSide,
  target,
  targetSide,
}: Omit<GpuEdgeGeometryInput, "type">): GpuBezierEdgeGeometry {
  assertFiniteNumber("bezier curvature", curvature);
  const normalizedSource = normalizeGpuPoint("source", source);
  const normalizedTarget = normalizeGpuPoint("target", target);
  const normalizedSourceSide = normalizeGpuEdgeSide(sourceSide, "bottom");
  const normalizedTargetSide = normalizeGpuEdgeSide(targetSide, "top");
  const sourceControl = getGpuBezierControlPoint({
    curvature,
    point: normalizedSource,
    side: normalizedSourceSide,
    toward: normalizedTarget,
  });
  const targetControl = getGpuBezierControlPoint({
    curvature,
    point: normalizedTarget,
    side: normalizedTargetSide,
    toward: normalizedSource,
  });
  return {
    bounds: getCubicBezierBounds({
      end: normalizedTarget,
      start: normalizedSource,
      startControl: sourceControl,
      targetControl,
    }),
    curvature,
    edgeId,
    kind: "bezier",
    label: getBezierEdgeLabel({
      source: normalizedSource,
      sourceControl,
      target: normalizedTarget,
      targetControl,
    }),
    source: normalizedSource,
    sourceControl,
    sourceSide: normalizedSourceSide,
    target: normalizedTarget,
    targetControl,
    targetSide: normalizedTargetSide,
  };
}

function getGpuBezierControlPoint({
  curvature,
  point,
  side,
  toward,
}: {
  readonly curvature: number;
  readonly point: GpuPoint;
  readonly side: GpuEdgeSide;
  readonly toward: GpuPoint;
}): GpuPoint {
  switch (side) {
    case "left":
      return {
        x:
          point.x - calculateBezierControlOffset(point.x - toward.x, curvature),
        y: point.y,
      };
    case "right":
      return {
        x:
          point.x + calculateBezierControlOffset(toward.x - point.x, curvature),
        y: point.y,
      };
    case "top":
      return {
        x: point.x,
        y:
          point.y - calculateBezierControlOffset(point.y - toward.y, curvature),
      };
    case "bottom":
      return {
        x: point.x,
        y:
          point.y + calculateBezierControlOffset(toward.y - point.y, curvature),
      };
  }
}

export function sampleGpuEdgeGeometry(
  geometry: GpuEdgeGeometry,
  options: { readonly bezierSegments?: number | undefined } = {},
): GpuPoint[] {
  if (geometry.kind === "straight") {
    return [geometry.source, geometry.target];
  }
  const segments = normalizeBezierSegmentCount(options.bezierSegments);
  const points: GpuPoint[] = [];
  for (let index = 0; index <= segments; index += 1) {
    points.push(getCubicBezierPoint(geometry, index / segments));
  }
  return points;
}

export function getDistanceToGpuEdgeGeometry({
  bezierSegments,
  geometry,
  point,
}: {
  readonly bezierSegments?: number | undefined;
  readonly geometry: GpuEdgeGeometry;
  readonly point: GpuPoint;
}): number {
  const normalizedPoint = normalizeGpuPoint("hit test point", point);
  const points = sampleGpuEdgeGeometry(geometry, { bezierSegments });
  let closestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    const source = points[index];
    const target = points[index + 1];
    if (!source || !target) {
      continue;
    }
    closestDistance = Math.min(
      closestDistance,
      getDistanceToSegment(normalizedPoint, source, target),
    );
  }
  return closestDistance;
}

export function hitTestGpuEdges({
  bezierSegments,
  edges,
  point,
  tolerance,
}: {
  readonly bezierSegments?: number | undefined;
  readonly edges: readonly GpuEdgeHitTestInput[];
  readonly point: GpuPoint;
  readonly tolerance: number;
}): GpuEdgeHitTestResult | null {
  assertFiniteNonNegative("edge hit tolerance", tolerance);
  let closest: GpuEdgeHitTestResult | null = null;
  for (const edge of edges) {
    if (edge.selectable === false) {
      continue;
    }
    const distance = getDistanceToGpuEdgeGeometry({
      bezierSegments,
      geometry: edge.geometry,
      point,
    });
    if (distance > tolerance) {
      continue;
    }
    const candidate = {
      distance,
      edgeId: edge.edgeId,
      zIndex: edge.zIndex ?? 0,
    };
    if (!closest || compareEdgeHitCandidate(candidate, closest) < 0) {
      closest = candidate;
    }
  }
  return closest;
}

export function normalizeGpuEdgeSide(
  side: string | null | undefined,
  fallback: GpuEdgeSide,
): GpuEdgeSide {
  if (side === undefined || side === null) {
    return fallback;
  }
  if (isGpuEdgeSide(side)) {
    return side;
  }
  throw new Error(`Unsupported GPU edge side "${side}".`);
}

export function resolveGpuEdgeKind(
  type: string | null | undefined,
): GpuEdgeKind {
  if (!type || type === "default" || type === "bezier") {
    return "bezier";
  }
  if (type === "straight") {
    return "straight";
  }
  throw new Error(`Unsupported GPU edge type "${type}".`);
}

function getStraightEdgeLabel(
  source: GpuPoint,
  target: GpuPoint,
): GpuEdgeLabelGeometry {
  const offsetX = Math.abs(target.x - source.x) / 2;
  const offsetY = Math.abs(target.y - source.y) / 2;
  return {
    offsetX,
    offsetY,
    x: target.x < source.x ? target.x + offsetX : target.x - offsetX,
    y: target.y < source.y ? target.y + offsetY : target.y - offsetY,
  };
}

function getBezierEdgeLabel({
  source,
  sourceControl,
  target,
  targetControl,
}: {
  readonly source: GpuPoint;
  readonly sourceControl: GpuPoint;
  readonly target: GpuPoint;
  readonly targetControl: GpuPoint;
}): GpuEdgeLabelGeometry {
  const x =
    source.x * 0.125 +
    sourceControl.x * 0.375 +
    targetControl.x * 0.375 +
    target.x * 0.125;
  const y =
    source.y * 0.125 +
    sourceControl.y * 0.375 +
    targetControl.y * 0.375 +
    target.y * 0.125;
  return {
    offsetX: Math.abs(x - source.x),
    offsetY: Math.abs(y - source.y),
    x,
    y,
  };
}

function calculateBezierControlOffset(
  distance: number,
  curvature: number,
): number {
  if (distance >= 0) {
    return 0.5 * distance;
  }
  return curvature * 25 * Math.sqrt(-distance);
}

function getCubicBezierPoint(
  geometry: GpuBezierEdgeGeometry,
  t: number,
): GpuPoint {
  const inverseT = 1 - t;
  const inverseT2 = inverseT * inverseT;
  const t2 = t * t;
  return {
    x:
      inverseT2 * inverseT * geometry.source.x +
      3 * inverseT2 * t * geometry.sourceControl.x +
      3 * inverseT * t2 * geometry.targetControl.x +
      t2 * t * geometry.target.x,
    y:
      inverseT2 * inverseT * geometry.source.y +
      3 * inverseT2 * t * geometry.sourceControl.y +
      3 * inverseT * t2 * geometry.targetControl.y +
      t2 * t * geometry.target.y,
  };
}

function getCubicBezierBounds({
  end,
  start,
  startControl,
  targetControl,
}: {
  readonly end: GpuPoint;
  readonly start: GpuPoint;
  readonly startControl: GpuPoint;
  readonly targetControl: GpuPoint;
}): GpuRect {
  const tValues = new Set([0, 1]);
  addCubicExtremaValues(
    tValues,
    start.x,
    startControl.x,
    targetControl.x,
    end.x,
  );
  addCubicExtremaValues(
    tValues,
    start.y,
    startControl.y,
    targetControl.y,
    end.y,
  );
  const points = [...tValues].map((t) =>
    getCubicBezierPoint(
      {
        bounds: { height: 0, width: 0, x: 0, y: 0 },
        curvature: DEFAULT_BEZIER_CURVATURE,
        edgeId: "",
        kind: "bezier",
        label: { offsetX: 0, offsetY: 0, x: 0, y: 0 },
        source: start,
        sourceControl: startControl,
        sourceSide: "bottom",
        target: end,
        targetControl,
        targetSide: "top",
      },
      t,
    ),
  );
  return getBoundsForPoints(points);
}

function addCubicExtremaValues(
  tValues: Set<number>,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 3 * p0 - 6 * p1 + 3 * p2;
  const c = -3 * p0 + 3 * p1;
  const quadraticA = 3 * a;
  const quadraticB = 2 * b;
  addQuadraticRootsInUnitRange(tValues, quadraticA, quadraticB, c);
}

function addQuadraticRootsInUnitRange(
  tValues: Set<number>,
  a: number,
  b: number,
  c: number,
) {
  if (Math.abs(a) < Number.EPSILON) {
    addLinearRootInUnitRange(tValues, b, c);
    return;
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return;
  }
  const root = Math.sqrt(discriminant);
  addUnitRangeValue(tValues, (-b + root) / (2 * a));
  addUnitRangeValue(tValues, (-b - root) / (2 * a));
}

function addLinearRootInUnitRange(tValues: Set<number>, b: number, c: number) {
  if (Math.abs(b) < Number.EPSILON) {
    return;
  }
  addUnitRangeValue(tValues, -c / b);
}

function addUnitRangeValue(tValues: Set<number>, value: number) {
  if (value > 0 && value < 1) {
    tValues.add(value);
  }
}

function getBoundsForPoints(points: readonly GpuPoint[]): GpuRect {
  if (points.length === 0) {
    throw new Error("GPU edge bounds require at least one point.");
  }
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
  };
}

function getDistanceToSegment(
  point: GpuPoint,
  source: GpuPoint,
  target: GpuPoint,
): number {
  const segmentX = target.x - source.x;
  const segmentY = target.y - source.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - source.x, point.y - source.y);
  }
  const t = Math.max(
    0,
    Math.min(
      1,
      ((point.x - source.x) * segmentX + (point.y - source.y) * segmentY) /
        lengthSquared,
    ),
  );
  const projected = {
    x: source.x + t * segmentX,
    y: source.y + t * segmentY,
  };
  return Math.hypot(point.x - projected.x, point.y - projected.y);
}

function compareEdgeHitCandidate(
  left: GpuEdgeHitTestResult,
  right: GpuEdgeHitTestResult,
): number {
  if (left.zIndex !== right.zIndex) {
    return right.zIndex - left.zIndex;
  }
  if (left.distance !== right.distance) {
    return left.distance - right.distance;
  }
  return left.edgeId.localeCompare(right.edgeId);
}

function normalizeBezierSegmentCount(value: number | undefined): number {
  if (value === undefined) {
    return DEFAULT_BEZIER_SEGMENTS;
  }
  assertFiniteNonNegative("bezier segment count", value);
  return Math.max(MIN_BEZIER_SEGMENTS, Math.ceil(value));
}

function normalizeGpuPoint(name: string, point: GpuPoint): GpuPoint {
  assertFiniteNumber(`${name} x`, point.x);
  assertFiniteNumber(`${name} y`, point.y);
  return {
    x: point.x,
    y: point.y,
  };
}

function isGpuEdgeSide(side: string): side is GpuEdgeSide {
  return (
    side === "bottom" || side === "left" || side === "right" || side === "top"
  );
}

function assertFiniteNonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}

function assertFiniteNumber(name: string, value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
}
