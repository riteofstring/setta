import type { GpuViewportInput } from "../viewportMath";
import {
  createHtmlSurfaceHitSceneFromVisualScene,
  resolveHtmlSurfaceHitAtClientPoint,
  type HtmlSurfaceHitProjection,
} from "./hitScene";
import type { CommittedHtmlSurfaceTextureSnapshot } from "./textures";
import {
  createHtmlSurfaceVisualScene,
  type FlowRect,
  type HtmlSurfaceMeshVisual,
  type HtmlSurfaceVisualScene,
  type SurfaceVertex,
} from "./visualScene";

export const HTML_SURFACE_WARPED_MESH_FIXTURE_ID =
  "html-surface-warped-mesh-fixture";

export const HTML_SURFACE_WARPED_MESH_FIXTURE_VIEWPORT: GpuViewportInput = [
  72, 56, 1,
];

export const HTML_SURFACE_WARPED_MESH_FIXTURE_RECT: FlowRect = {
  height: 236,
  width: 360,
  x: 64,
  y: 48,
};

export function createHtmlSurfaceWarpedMeshFixtureScene({
  texture,
}: {
  readonly texture: CommittedHtmlSurfaceTextureSnapshot;
}): HtmlSurfaceVisualScene {
  return createHtmlSurfaceVisualScene({
    meshSurfaces: [
      createHtmlSurfaceWarpedMeshVisual({
        rect: HTML_SURFACE_WARPED_MESH_FIXTURE_RECT,
        surfaceId: HTML_SURFACE_WARPED_MESH_FIXTURE_ID,
        texture,
      }),
    ],
  });
}

export function createHtmlSurfaceWarpedMeshVisual({
  columns = 8,
  rect,
  rows = 5,
  surfaceId,
  texture,
  warpPx = 22,
}: {
  readonly columns?: number | undefined;
  readonly rect: FlowRect;
  readonly rows?: number | undefined;
  readonly surfaceId: string;
  readonly texture: CommittedHtmlSurfaceTextureSnapshot;
  readonly warpPx?: number | undefined;
}): HtmlSurfaceMeshVisual {
  const vertices = createWarpedMeshVertices({ columns, rect, rows, warpPx });
  return {
    bounds: resolveVertexBounds(vertices),
    indices: createWarpedMeshIndices({ columns, rows }),
    kind: "mesh",
    surfaceId,
    texture,
    vertices,
    zIndex: 0,
  };
}

export function resolveHtmlSurfaceWarpedMeshFixtureHit({
  clientX,
  clientY,
  surfaceElement,
  texture,
}: {
  readonly clientX: number;
  readonly clientY: number;
  readonly surfaceElement: HTMLElement;
  readonly texture: CommittedHtmlSurfaceTextureSnapshot;
}): HtmlSurfaceHitProjection | null {
  const scene = createHtmlSurfaceWarpedMeshFixtureScene({ texture });
  return resolveHtmlSurfaceHitAtClientPoint({
    clientX,
    clientY,
    scene: createHtmlSurfaceHitSceneFromVisualScene(scene),
    surfaceElement,
    viewport: HTML_SURFACE_WARPED_MESH_FIXTURE_VIEWPORT,
  });
}

function createWarpedMeshVertices({
  columns,
  rect,
  rows,
  warpPx,
}: {
  readonly columns: number;
  readonly rect: FlowRect;
  readonly rows: number;
  readonly warpPx: number;
}): readonly SurfaceVertex[] {
  const vertices: SurfaceVertex[] = [];
  for (let row = 0; row <= rows; row += 1) {
    const v = row / rows;
    for (let column = 0; column <= columns; column += 1) {
      const u = column / columns;
      const wave = Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI) * warpPx;
      const sag = Math.sin(v * Math.PI) * warpPx * 0.35;
      vertices.push({
        u,
        v,
        x: rect.x + u * rect.width + wave,
        y: rect.y + v * rect.height + sag,
      });
    }
  }
  return vertices;
}

function createWarpedMeshIndices({
  columns,
  rows,
}: {
  readonly columns: number;
  readonly rows: number;
}): Uint32Array {
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
  return indices;
}

function resolveVertexBounds(vertices: readonly SurfaceVertex[]): FlowRect {
  if (vertices.length === 0) {
    throw new Error("Setta warped mesh fixture requires at least one vertex.");
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
