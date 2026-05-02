import { BackgroundVariantEnum, type ObjectValues } from "utils/generatedTypes";

import {
  GPU_EDGE_VERTEX_FLOATS,
  type GpuEdgeBufferInput,
} from "../edges/edgeGpuBuffers";

import type { GpuFlowRuntime } from "../gpuDevice";

import type { GpuTexturedNodeQuad } from "../GpuNodeLayer";

import type { GpuCanvasSize } from "../gpuRenderer";

import { type GpuViewportInput } from "../viewportMath";

export type NodeQuadRenderRuntime = Pick<
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

export type RenderNodeTextureQuadsInput = {
  readonly canvasSize: Pick<GpuCanvasSize, "cssHeight" | "cssWidth">;
  readonly clearColor?: GPUColorDict | undefined;
  readonly edgePalette?: GpuEdgePaletteInput | undefined;
  readonly edges?: readonly GpuEdgeBufferInput[] | undefined;
  readonly grid?: GpuGridInput | undefined;
  readonly quads: readonly GpuTexturedNodeQuad[];
  readonly viewport: GpuViewportInput;
};

export type RenderNodeTextureQuadsResult = {
  readonly drawnEdgeIds: readonly string[];
  readonly drawnNodeIds: readonly string[];
  readonly edgeVertexCount: number;
  readonly vertexCount: number;
};

export type EdgeDrawResources = {
  readonly bindGroup: GPUBindGroup;
  readonly pipeline: GPURenderPipeline;
  readonly vertexBuffer: GPUBuffer;
};

export type NodeDrawResources = {
  readonly pipeline: GPURenderPipeline;
  readonly vertexBuffer: GPUBuffer;
};

export type CachedNodeQuadGeometry = {
  readonly height: number;
  readonly nodeId: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

export type NodeQuadVertexCache = {
  readonly geometry: readonly CachedNodeQuadGeometry[];
  readonly vertexData: Float32Array;
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

export const NODE_QUAD_VERTEX_BYTES =
  Float32Array.BYTES_PER_ELEMENT * FLOATS_PER_VERTEX;

export const DEFAULT_CLEAR_COLOR: GPUColorDict = { a: 0, b: 0, g: 0, r: 0 };

export const DEFAULT_EDGE_PALETTE_INPUT: GpuEdgePaletteInput = {
  color: "#545e70c7",
};

export const EMPTY_EDGE_BUFFER_INPUTS: readonly GpuEdgeBufferInput[] = [];
