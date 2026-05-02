import { BackgroundVariantEnum, type ObjectValues } from "utils/generatedTypes";

import {
  GPU_EDGE_VERTEX_FLOATS,
  type GpuEdgeBufferInput,
} from "../edges/edgeGpuBuffers";

import type { GpuFlowRuntime } from "../gpuDevice";

import type { GpuCanvasSize } from "../gpuRenderer";

import { type GpuViewportInput } from "../viewportMath";

export type HtmlSurfaceRenderRuntime = Pick<
  GpuFlowRuntime,
  "context" | "device" | "format"
>;

export type GpuGridVariant = ObjectValues<typeof BackgroundVariantEnum>;

export type GpuGridInput = {
  readonly color: string;
  readonly patternSize: number;
  readonly snapGrid: readonly [number, number];
  readonly variant: GpuGridVariant;
};

export type GpuEdgePaletteInput = {
  readonly color: string;
};

export type RenderHtmlSurfaceSceneBaseInput = {
  readonly canvasSize: Pick<GpuCanvasSize, "cssHeight" | "cssWidth">;
  readonly clearColor?: GPUColorDict | undefined;
  readonly edgePalette?: GpuEdgePaletteInput | undefined;
  readonly edges?: readonly GpuEdgeBufferInput[] | undefined;
  readonly grid?: GpuGridInput | undefined;
  readonly viewport: GpuViewportInput;
};

export type RenderHtmlSurfaceSceneResult = {
  readonly drawnEdgeIds: readonly string[];
  readonly drawnSurfaceIds: readonly string[];
  readonly edgeVertexCount: number;
  readonly vertexCount: number;
};

export type EdgeDrawResources = {
  readonly bindGroup: GPUBindGroup;
  readonly pipeline: GPURenderPipeline;
  readonly vertexBuffer: GPUBuffer;
};

export type FlatSurfaceDrawResources = {
  readonly pipeline: GPURenderPipeline;
  readonly vertexBuffer: GPUBuffer;
};

export type MeshSurfaceDrawResources = {
  readonly pipeline: GPURenderPipeline;
  readonly vertexBuffer: GPUBuffer;
};

export type CachedFlatSurfaceGeometry = {
  readonly height: number;
  readonly surfaceId: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

export type FlatSurfaceVertexCache = {
  readonly geometry: readonly CachedFlatSurfaceGeometry[];
  readonly vertexData: Float32Array;
};

export type CachedMeshSurfaceGeometry = {
  readonly indices: readonly number[];
  readonly surfaceId: string;
  readonly vertices: readonly {
    readonly u: number;
    readonly v: number;
    readonly x: number;
    readonly y: number;
  }[];
  readonly zIndex: number;
};

export type MeshSurfaceDrawRange = {
  readonly firstVertex: number;
  readonly surfaceId: string;
  readonly vertexCount: number;
};

export type MeshSurfaceVertexCache = {
  readonly geometry: readonly CachedMeshSurfaceGeometry[];
  readonly indexData: Uint32Array;
  readonly ranges: readonly MeshSurfaceDrawRange[];
  readonly vertexData: Float32Array;
  readonly vertexCount: number;
};

export type GridDrawResources = {
  readonly bindGroup: GPUBindGroup;
  readonly pipeline: GPURenderPipeline;
};

export const CAMERA_UNIFORM_BYTES = 32;

export const EDGE_PALETTE_UNIFORM_BYTES = 16;

export const GRID_UNIFORM_BYTES = 32;

export const FLOATS_PER_VERTEX = 4;

export const VERTICES_PER_QUAD = 6;

export const EDGE_VERTEX_BYTES =
  Float32Array.BYTES_PER_ELEMENT * GPU_EDGE_VERTEX_FLOATS;

export const FLAT_SURFACE_VERTEX_BYTES =
  Float32Array.BYTES_PER_ELEMENT * FLOATS_PER_VERTEX;

export const DEFAULT_CLEAR_COLOR: GPUColorDict = { a: 0, b: 0, g: 0, r: 0 };

export const DEFAULT_EDGE_PALETTE_INPUT: GpuEdgePaletteInput = {
  color: "#545e70c7",
};

export const EMPTY_EDGE_BUFFER_INPUTS: readonly GpuEdgeBufferInput[] = [];
