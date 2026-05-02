import type { HtmlSurfaceTextureRecord } from "./textures";
import type {
  FlowRect,
  HtmlSurfaceMeshVisual,
  SurfaceVertex,
} from "./visualScene";

const CLOTH_COLUMNS = 14;
const CLOTH_ROWS = 9;
const CLOTH_FRAME_MS = 1000 / 60;

const clothIndexCache = new Map<string, Uint32Array>();

export type HtmlSurfaceClothMeshInput = {
  readonly rect: FlowRect;
  readonly surfaceId: string;
  readonly texture: HtmlSurfaceTextureRecord;
  readonly timeMs?: number | undefined;
  readonly zIndex: number;
};

export function createHtmlSurfaceClothMeshVisual({
  rect,
  surfaceId,
  texture,
  timeMs = 0,
  zIndex,
}: HtmlSurfaceClothMeshInput): HtmlSurfaceMeshVisual {
  const phase = hashSurfacePhase(surfaceId);
  const vertices = createClothMeshVertices({
    columns: CLOTH_COLUMNS,
    phase,
    rect,
    rows: CLOTH_ROWS,
    timeMs,
  });
  return {
    bounds: resolveClothVertexBounds(vertices),
    indices: getClothMeshIndices(CLOTH_COLUMNS, CLOTH_ROWS),
    kind: "mesh",
    surfaceId,
    texture,
    vertices,
    zIndex,
  };
}

export function clothTimeMsFromFrame(frame: number): number {
  return Math.max(0, frame) * CLOTH_FRAME_MS;
}

function createClothMeshVertices({
  columns,
  phase,
  rect,
  rows,
  timeMs,
}: {
  readonly columns: number;
  readonly phase: number;
  readonly rect: FlowRect;
  readonly rows: number;
  readonly timeMs: number;
}): readonly SurfaceVertex[] {
  const vertices: SurfaceVertex[] = [];
  const seconds = timeMs / 1000;
  const minDimension = Math.max(1, Math.min(rect.width, rect.height));
  const horizontalAmplitude = clamp(minDimension * 0.085, 10, 38);
  const verticalAmplitude = clamp(minDimension * 0.045, 5, 22);
  const bottomLift = clamp(rect.height * 0.018, 2, 12);

  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    const pinnedFalloff = Math.pow(v, 0.9);
    const belly = Math.sin(v * Math.PI);
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const centerDistance = Math.abs(u - 0.5) * 2;
      const edgeFlutter = 0.55 + centerDistance * 0.45;
      const gust =
        Math.sin(seconds * 1.7 + u * 5.8 + v * 1.9 + phase) *
        belly *
        horizontalAmplitude;
      const ripple =
        Math.sin(seconds * 4.4 + u * 13.0 + v * 5.6 + phase * 0.7) *
        pinnedFalloff *
        edgeFlutter *
        horizontalAmplitude *
        0.32;
      const lift =
        Math.sin(seconds * 2.5 + u * 8.4 + phase * 1.3) *
        pinnedFalloff *
        verticalAmplitude;
      const sag = belly * verticalAmplitude * 0.48 + v * v * bottomLift;

      vertices.push({
        u,
        v,
        x: rect.x + u * rect.width + (gust + ripple) * pinnedFalloff,
        y: rect.y + v * rect.height + lift + sag,
      });
    }
  }

  return vertices;
}

function getClothMeshIndices(columns: number, rows: number): Uint32Array {
  const cacheKey = `${columns}:${rows}`;
  const cached = clothIndexCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const indices = new Uint32Array(columns * rows * 6);
  let offset = 0;
  const stride = columns + 1;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const topLeft = row * stride + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + stride;
      const bottomRight = bottomLeft + 1;
      indices[offset++] = topLeft;
      indices[offset++] = topRight;
      indices[offset++] = bottomLeft;
      indices[offset++] = bottomLeft;
      indices[offset++] = topRight;
      indices[offset++] = bottomRight;
    }
  }
  clothIndexCache.set(cacheKey, indices);
  return indices;
}

function resolveClothVertexBounds(
  vertices: readonly SurfaceVertex[],
): FlowRect {
  if (vertices.length === 0) {
    throw new Error("Setta cloth mesh requires at least one vertex.");
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    minY = Math.min(minY, vertex.y);
    maxX = Math.max(maxX, vertex.x);
    maxY = Math.max(maxY, vertex.y);
  }
  return {
    height: maxY - minY,
    width: maxX - minX,
    x: minX,
    y: minY,
  };
}

function hashSurfacePhase(surfaceId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < surfaceId.length; index += 1) {
    hash ^= surfaceId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * Math.PI * 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
