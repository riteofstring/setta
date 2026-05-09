import { parseGpuHexColor } from "../gpuColors";

import type {
  HtmlSurfaceFlatVisual,
  HtmlSurfaceMeshVisual,
} from "../htmlSurfaces/visualScene";

import {
  CachedFlatSurfaceGeometry,
  CachedMeshSurfaceGeometry,
  FLOATS_PER_VERTEX,
  FlatSurfaceVertexCache,
  GpuEdgePaletteInput,
  GpuGridInput,
  GpuGridVariant,
  MeshSurfaceDrawRange,
  MeshSurfaceVertexCache,
  VERTICES_PER_QUAD,
} from "./pipelineTypes";

export function buildFlatSurfaceVertexData(
  surfaces: readonly Pick<
    HtmlSurfaceFlatVisual,
    "height" | "width" | "x" | "y"
  >[],
): Float32Array {
  const data = new Float32Array(
    surfaces.length * VERTICES_PER_QUAD * FLOATS_PER_VERTEX,
  );
  let offset = 0;
  for (const surface of surfaces) {
    const left = surface.x;
    const top = surface.y;
    const right = surface.x + surface.width;
    const bottom = surface.y + surface.height;
    offset = writeFlatSurfaceVertex(data, offset, {
      u: 0,
      v: 0,
      x: left,
      y: top,
    });
    offset = writeFlatSurfaceVertex(data, offset, {
      u: 1,
      v: 0,
      x: right,
      y: top,
    });
    offset = writeFlatSurfaceVertex(data, offset, {
      u: 0,
      v: 1,
      x: left,
      y: bottom,
    });
    offset = writeFlatSurfaceVertex(data, offset, {
      u: 0,
      v: 1,
      x: left,
      y: bottom,
    });
    offset = writeFlatSurfaceVertex(data, offset, {
      u: 1,
      v: 0,
      x: right,
      y: top,
    });
    offset = writeFlatSurfaceVertex(data, offset, {
      u: 1,
      v: 1,
      x: right,
      y: bottom,
    });
  }
  return data;
}

export function buildMeshSurfaceVertexCache(
  surfaces: readonly HtmlSurfaceMeshVisual[],
): MeshSurfaceVertexCache {
  const indexCount = surfaces.reduce(
    (count, surface) => count + surface.indices.length,
    0,
  );
  const vertexData = new Float32Array(indexCount * FLOATS_PER_VERTEX);
  const indexData = new Uint32Array(indexCount);
  const ranges: MeshSurfaceDrawRange[] = [];
  let vertexCount = 0;
  let vertexDataOffset = 0;
  let indexOffset = 0;

  for (const surface of surfaces) {
    const firstVertex = vertexCount;
    for (const index of surface.indices) {
      const vertex = surface.vertices[index];
      if (!vertex) {
        throw new Error(
          `Setta HTML surface mesh "${surface.surfaceId}" references missing vertex ${index}.`,
        );
      }
      vertexDataOffset = writeFlatSurfaceVertex(
        vertexData,
        vertexDataOffset,
        vertex,
      );
      indexData[indexOffset] = index;
      indexOffset += 1;
      vertexCount += 1;
    }
    ranges.push({
      firstVertex,
      surfaceId: surface.surfaceId,
      vertexCount: surface.indices.length,
    });
  }

  return {
    geometry: captureMeshSurfaceGeometry(surfaces),
    indexData,
    ranges,
    vertexCount,
    vertexData,
  };
}

export function isFlatSurfaceVertexCacheValid(
  cache: FlatSurfaceVertexCache | null,
  surfaces: readonly CachedFlatSurfaceGeometry[],
): cache is FlatSurfaceVertexCache {
  if (!cache || cache.geometry.length !== surfaces.length) {
    return false;
  }
  for (let index = 0; index < surfaces.length; index += 1) {
    const cached = cache.geometry[index];
    const surface = surfaces[index];
    if (
      !cached ||
      !surface ||
      !isCachedFlatSurfaceGeometryEqual(cached, surface)
    ) {
      return false;
    }
  }
  return true;
}

export function isMeshSurfaceVertexCacheValid(
  cache: MeshSurfaceVertexCache | null,
  surfaces: readonly HtmlSurfaceMeshVisual[],
): cache is MeshSurfaceVertexCache {
  if (!cache || cache.geometry.length !== surfaces.length) {
    return false;
  }
  for (let index = 0; index < surfaces.length; index += 1) {
    const cached = cache.geometry[index];
    const surface = surfaces[index];
    if (
      !cached ||
      !surface ||
      !isCachedMeshSurfaceGeometryEqual(cached, surface)
    ) {
      return false;
    }
  }
  return true;
}

function isCachedFlatSurfaceGeometryEqual(
  cached: CachedFlatSurfaceGeometry,
  surface: CachedFlatSurfaceGeometry,
): boolean {
  return (
    cached.surfaceId === surface.surfaceId &&
    cached.x === surface.x &&
    cached.y === surface.y &&
    cached.width === surface.width &&
    cached.height === surface.height &&
    cached.zIndex === surface.zIndex
  );
}

function isCachedMeshSurfaceGeometryEqual(
  cached: CachedMeshSurfaceGeometry,
  surface: HtmlSurfaceMeshVisual,
): boolean {
  if (
    cached.surfaceId !== surface.surfaceId ||
    cached.zIndex !== surface.zIndex ||
    cached.vertices.length !== surface.vertices.length ||
    cached.indices.length !== surface.indices.length
  ) {
    return false;
  }
  return (
    areCachedMeshVerticesEqual(cached, surface) &&
    areCachedMeshIndicesEqual(cached, surface)
  );
}

function areCachedMeshVerticesEqual(
  cached: CachedMeshSurfaceGeometry,
  surface: HtmlSurfaceMeshVisual,
): boolean {
  for (let index = 0; index < cached.vertices.length; index += 1) {
    const cachedVertex = cached.vertices[index];
    const vertex = surface.vertices[index];
    if (
      !cachedVertex ||
      !vertex ||
      !areMeshVerticesEqual(cachedVertex, vertex)
    ) {
      return false;
    }
  }
  return true;
}

function areCachedMeshIndicesEqual(
  cached: CachedMeshSurfaceGeometry,
  surface: HtmlSurfaceMeshVisual,
): boolean {
  for (let index = 0; index < cached.indices.length; index += 1) {
    if (cached.indices[index] !== surface.indices[index]) {
      return false;
    }
  }
  return true;
}

function areMeshVerticesEqual(
  left: CachedMeshSurfaceGeometry["vertices"][number],
  right: HtmlSurfaceMeshVisual["vertices"][number],
): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.u === right.u &&
    left.v === right.v
  );
}

export function captureFlatSurfaceGeometry(
  surfaces: readonly CachedFlatSurfaceGeometry[],
): readonly CachedFlatSurfaceGeometry[] {
  return surfaces.map((surface) => ({
    height: surface.height,
    surfaceId: surface.surfaceId,
    width: surface.width,
    x: surface.x,
    y: surface.y,
    zIndex: surface.zIndex,
  }));
}

function captureMeshSurfaceGeometry(
  surfaces: readonly HtmlSurfaceMeshVisual[],
): readonly CachedMeshSurfaceGeometry[] {
  return surfaces.map((surface) => ({
    indices: Array.from(surface.indices),
    surfaceId: surface.surfaceId,
    vertices: surface.vertices.map((vertex) => ({
      u: vertex.u,
      v: vertex.v,
      x: vertex.x,
      y: vertex.y,
    })),
    zIndex: surface.zIndex,
  }));
}

type FlatSurfaceVertex = {
  readonly u: number;
  readonly v: number;
  readonly x: number;
  readonly y: number;
};

function writeFlatSurfaceVertex(
  data: Float32Array,
  offset: number,
  vertex: FlatSurfaceVertex,
): number {
  data[offset] = vertex.x;
  data[offset + 1] = vertex.y;
  data[offset + 2] = vertex.u;
  data[offset + 3] = vertex.v;
  return offset + FLOATS_PER_VERTEX;
}

export function encodeGpuGridUniform(grid: GpuGridInput): Float32Array {
  const [red, green, blue, alpha] = parseGpuGridColor(grid.color);
  return new Float32Array([
    red,
    green,
    blue,
    alpha,
    requirePositiveFiniteGpuGridValue(grid.snapGrid[0], "snapGrid[0]"),
    requirePositiveFiniteGpuGridValue(grid.snapGrid[1], "snapGrid[1]"),
    requirePositiveFiniteGpuGridValue(grid.patternSize, "patternSize"),
    encodeGpuGridVariant(grid.variant),
  ]);
}

export function encodeGpuEdgePaletteUniform(
  palette: GpuEdgePaletteInput,
): Float32Array {
  const [red, green, blue, alpha] = parseGpuEdgeColor(palette.color);
  return new Float32Array([red, green, blue, alpha]);
}

export function parseGpuGridColor(
  color: string,
): readonly [number, number, number, number] {
  return parseGpuHexColor(color, "grid");
}

function parseGpuEdgeColor(
  color: string,
): readonly [number, number, number, number] {
  return parseGpuHexColor(color, "edge palette");
}

function requirePositiveFiniteGpuGridValue(
  value: number,
  field: string,
): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Setta GPU grid requires a positive finite ${field}.`);
  }
  return value;
}

function encodeGpuGridVariant(variant: GpuGridVariant): number {
  switch (variant) {
    case "lines":
      return 0;
    case "dots":
      return 1;
    case "cross":
      return 2;
    default:
      throw new Error(
        `Setta GPU grid received unsupported variant ${JSON.stringify(
          variant,
        )}.`,
      );
  }
}

export function areFloat32ArraysEqual(
  left: Float32Array | null,
  right: Float32Array,
): boolean {
  if (!left || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

export function alignToFourBytes(value: number): number {
  return Math.ceil(value / 4) * 4;
}

export const GRID_SHADER = `
struct Camera {
  viewport: vec4<f32>,
  canvas: vec4<f32>,
};

struct Grid {
  color: vec4<f32>,
  settings: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(1) @binding(0) var<uniform> grid: Grid;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) screen: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  let clip = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  )[vertexIndex];
  var output: VertexOutput;
  output.position = vec4<f32>(clip, 0.0, 1.0);
  output.screen = vec2<f32>(
    (clip.x + 1.0) * 0.5 * camera.canvas.x,
    (1.0 - clip.y) * 0.5 * camera.canvas.y
  );
  return output;
}

fn axis_alpha(distance: f32, halfWidth: f32) -> f32 {
  return 1.0 - smoothstep(halfWidth, halfWidth + 1.0, distance);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let zoom = max(camera.viewport.z, 0.0001);
  let snap = max(grid.settings.xy, vec2<f32>(0.0001, 0.0001));
  let patternSize = max(grid.settings.z, 0.0001) * zoom;
  let variant = grid.settings.w;
  let flow = (input.screen - camera.viewport.xy) / zoom;
  let nearest = abs(fract(flow / snap + vec2<f32>(0.5, 0.5)) - vec2<f32>(0.5, 0.5));
  let distance = nearest * snap * zoom;
  let halfWidth = max(0.5, patternSize * 0.5);
  let halfLength = max(0.5, patternSize * 0.5);
  var alpha = 0.0;
  if (variant >= 1.5) {
    let vertical = axis_alpha(distance.x, halfWidth) * axis_alpha(distance.y, halfLength);
    let horizontal = axis_alpha(distance.y, halfWidth) * axis_alpha(distance.x, halfLength);
    alpha = max(vertical, horizontal);
  } else if (variant >= 0.5) {
    alpha = 1.0 - smoothstep(halfWidth, halfWidth + 1.0, length(distance));
  } else {
    alpha = max(axis_alpha(distance.x, halfWidth), axis_alpha(distance.y, halfWidth));
  }
  return vec4<f32>(grid.color.rgb, grid.color.a * alpha);
}
`;

export const FLAT_SURFACE_SHADER = `
struct Camera {
  viewport: vec4<f32>,
  canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: Camera;
@group(1) @binding(0) var nodeSampler: sampler;
@group(1) @binding(1) var nodeTexture: texture_2d<f32>;

struct VertexInput {
  @location(0) flowPosition: vec2<f32>,
  @location(1) uv: vec2<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  let screen = camera.viewport.xy + input.flowPosition * camera.viewport.z;
  let clip = vec2<f32>(
    (screen.x / camera.canvas.x) * 2.0 - 1.0,
    1.0 - (screen.y / camera.canvas.y) * 2.0
  );
  var output: VertexOutput;
  output.position = vec4<f32>(clip, 0.0, 1.0);
  output.uv = input.uv;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  return textureSample(nodeTexture, nodeSampler, input.uv);
}
`;

export const EDGE_LINE_SHADER = `
struct Camera {
  viewport: vec4<f32>,
  canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> camera: Camera;

struct EdgePalette {
  base: vec4<f32>,
};

@group(1) @binding(0) var<uniform> edgePalette: EdgePalette;

struct VertexInput {
  @location(0) flowPosition: vec2<f32>,
  @location(1) edgeMeta: vec2<f32>,
  @location(2) edgeColor: vec4<f32>,
};

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) flags: f32,
  @location(1) edgeColor: vec4<f32>,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  let screen = camera.viewport.xy + input.flowPosition * camera.viewport.z;
  let clip = vec2<f32>(
    (screen.x / camera.canvas.x) * 2.0 - 1.0,
    1.0 - (screen.y / camera.canvas.y) * 2.0
  );
  var output: VertexOutput;
  output.position = vec4<f32>(clip, 0.0, 1.0);
  output.flags = input.edgeMeta.y;
  output.edgeColor = input.edgeColor;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  let flags = u32(input.flags);
  if ((flags & 8u) != 0u) {
    return vec4<f32>(0.92, 0.18, 0.18, 0.95);
  }
  if ((flags & 4u) != 0u) {
    return vec4<f32>(0.12, 0.62, 0.32, 0.95);
  }
  if ((flags & 64u) != 0u) {
    return vec4<f32>(0.94, 0.27, 0.27, 0.95);
  }
  if (((flags & 1u) != 0u) && ((flags & 128u) != 0u)) {
    return vec4<f32>(0.92, 0.35, 0.05, 0.95);
  }
  if ((flags & 1u) != 0u) {
    return vec4<f32>(0.15, 0.39, 0.92, 0.95);
  }
  if (((flags & 2u) != 0u) && ((flags & 32u) != 0u)) {
    return vec4<f32>(0.15, 0.39, 0.92, 0.95);
  }
  if ((flags & 2u) != 0u) {
    return vec4<f32>(0.92, 0.35, 0.05, 0.95);
  }
  if ((flags & 16u) != 0u) {
    return input.edgeColor;
  }
  if ((flags & 256u) != 0u) {
    return vec4<f32>(0.22, 0.74, 0.97, 0.9);
  }
  if ((flags & 128u) != 0u) {
    return vec4<f32>(0.96, 0.62, 0.04, 0.95);
  }
  if ((flags & 32u) != 0u) {
    return vec4<f32>(0.38, 0.65, 0.98, 0.95);
  }
  return edgePalette.base;
}
`;
