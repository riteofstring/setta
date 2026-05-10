import {
  alignToFourBytes,
  buildFlatSurfaceVertexData,
  captureFlatSurfaceGeometry,
  isFlatSurfaceVertexCacheValid,
} from "../gpuPipelines/bufferAndShaders";
import {
  FLAT_SURFACE_VERTEX_BYTES,
  VERTICES_PER_QUAD,
  type FlatSurfaceDrawResources,
  type FlatSurfaceVertexCache,
  type HtmlSurfaceRenderRuntime,
} from "../gpuPipelines/pipelineTypes";
import { createHtmlSurfaceFlatPipeline } from "./rendererPipelineFactories";
import type { HtmlSurfaceFlatVisual } from "./visualScene";

type HtmlSurfaceFlatPassOptions = {
  readonly getCameraBindGroupLayout: () => GPUBindGroupLayout;
  readonly getTextureBindGroup: (
    surface: HtmlSurfaceFlatVisual,
  ) => GPUBindGroup;
  readonly getTextureBindGroupLayout: () => GPUBindGroupLayout;
  readonly runtime: HtmlSurfaceRenderRuntime;
};

export class HtmlSurfaceFlatPass {
  private readonly getCameraBindGroupLayout: () => GPUBindGroupLayout;
  private readonly getTextureBindGroup: (
    surface: HtmlSurfaceFlatVisual,
  ) => GPUBindGroup;
  private readonly getTextureBindGroupLayout: () => GPUBindGroupLayout;
  private readonly runtime: HtmlSurfaceRenderRuntime;
  private pipeline: GPURenderPipeline | null = null;
  private uploadedVertexCache: FlatSurfaceVertexCache | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private vertexBufferByteCapacity = 0;
  private vertexCache: FlatSurfaceVertexCache | null = null;

  constructor({
    getCameraBindGroupLayout,
    getTextureBindGroup,
    getTextureBindGroupLayout,
    runtime,
  }: HtmlSurfaceFlatPassOptions) {
    this.getCameraBindGroupLayout = getCameraBindGroupLayout;
    this.getTextureBindGroup = getTextureBindGroup;
    this.getTextureBindGroupLayout = getTextureBindGroupLayout;
    this.runtime = runtime;
  }

  destroy() {
    this.vertexBuffer?.destroy?.();
    this.pipeline = null;
    this.uploadedVertexCache = null;
    this.vertexBuffer = null;
    this.vertexBufferByteCapacity = 0;
    this.vertexCache = null;
  }

  prepare(
    flatSurfaces: readonly HtmlSurfaceFlatVisual[],
  ): FlatSurfaceDrawResources | null {
    if (flatSurfaces.length === 0) {
      return null;
    }
    const vertexCache = this.resolveVertexCache(flatSurfaces);
    return {
      pipeline: this.getPipeline(),
      vertexBuffer: this.ensureVertexBuffer(vertexCache.vertexData.byteLength),
    };
  }

  write(
    flatSurfaceDraw: FlatSurfaceDrawResources | null,
    flatSurfaces: readonly HtmlSurfaceFlatVisual[],
  ) {
    if (!flatSurfaceDraw) {
      this.uploadedVertexCache = null;
      return;
    }
    const vertexCache = this.resolveVertexCache(flatSurfaces);
    if (this.uploadedVertexCache === vertexCache) {
      return;
    }
    this.runtime.device.queue.writeBuffer(
      flatSurfaceDraw.vertexBuffer,
      0,
      vertexCache.vertexData,
    );
    this.uploadedVertexCache = vertexCache;
  }

  draw({
    cameraBindGroup,
    flatSurfaceDraw,
    flatSurfaces,
    pass,
  }: {
    readonly cameraBindGroup: GPUBindGroup;
    readonly flatSurfaceDraw: FlatSurfaceDrawResources | null;
    readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
    readonly pass: GPURenderPassEncoder;
  }) {
    this.drawRange({
      cameraBindGroup,
      count: flatSurfaces.length,
      flatSurfaceDraw,
      flatSurfaces,
      pass,
      start: 0,
    });
  }

  drawRange({
    cameraBindGroup,
    count,
    flatSurfaceDraw,
    flatSurfaces,
    pass,
    start,
  }: {
    readonly cameraBindGroup: GPUBindGroup;
    readonly count: number;
    readonly flatSurfaceDraw: FlatSurfaceDrawResources | null;
    readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
    readonly pass: GPURenderPassEncoder;
    readonly start: number;
  }) {
    if (!flatSurfaceDraw) {
      return;
    }
    pass.setPipeline(flatSurfaceDraw.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setVertexBuffer(0, flatSurfaceDraw.vertexBuffer);
    for (let index = start; index < start + count; index += 1) {
      const surface = flatSurfaces[index];
      if (!surface) {
        continue;
      }
      pass.setBindGroup(1, this.getTextureBindGroup(surface));
      pass.draw(VERTICES_PER_QUAD, 1, index * VERTICES_PER_QUAD, 0);
    }
  }

  getPipeline(): GPURenderPipeline {
    if (this.pipeline) {
      return this.pipeline;
    }
    this.pipeline = createHtmlSurfaceFlatPipeline({
      cameraBindGroupLayout: this.getCameraBindGroupLayout(),
      runtime: this.runtime,
      textureBindGroupLayout: this.getTextureBindGroupLayout(),
    });
    return this.pipeline;
  }

  getVertexCount(flatSurfaces: readonly HtmlSurfaceFlatVisual[]): number {
    return flatSurfaces.length * VERTICES_PER_QUAD;
  }

  private ensureVertexBuffer(byteLength: number): GPUBuffer {
    if (this.vertexBuffer && this.vertexBufferByteCapacity >= byteLength) {
      return this.vertexBuffer;
    }
    this.vertexBuffer?.destroy?.();
    const size = Math.max(
      FLAT_SURFACE_VERTEX_BYTES,
      alignToFourBytes(byteLength),
    );
    this.vertexBuffer = this.runtime.device.createBuffer({
      label: "setta-html-surface-flat-vertices",
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    });
    this.vertexBufferByteCapacity = size;
    this.uploadedVertexCache = null;
    return this.vertexBuffer;
  }

  private resolveVertexCache(
    flatSurfaces: readonly HtmlSurfaceFlatVisual[],
  ): FlatSurfaceVertexCache {
    if (isFlatSurfaceVertexCacheValid(this.vertexCache, flatSurfaces)) {
      return this.vertexCache;
    }
    const vertexCache = {
      geometry: captureFlatSurfaceGeometry(flatSurfaces),
      vertexData: buildFlatSurfaceVertexData(flatSurfaces),
    };
    this.vertexCache = vertexCache;
    return vertexCache;
  }
}
