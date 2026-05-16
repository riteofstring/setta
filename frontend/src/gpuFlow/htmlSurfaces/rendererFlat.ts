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
    if (!flatSurfaceDraw) {
      return;
    }
    pass.setPipeline(flatSurfaceDraw.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setVertexBuffer(0, flatSurfaceDraw.vertexBuffer);
    let runBindGroup: GPUBindGroup | null = null;
    let runStart = 0;
    for (let index = 0; index < flatSurfaces.length; index += 1) {
      const surface = flatSurfaces[index];
      if (!surface) {
        continue;
      }
      const bindGroup = this.getTextureBindGroup(surface);
      if (runBindGroup === null) {
        runBindGroup = bindGroup;
        runStart = index;
        continue;
      }
      if (bindGroup === runBindGroup) {
        continue;
      }
      this.drawRun({ bindGroup: runBindGroup, pass, runEnd: index, runStart });
      runBindGroup = bindGroup;
      runStart = index;
    }
    if (runBindGroup) {
      this.drawRun({
        bindGroup: runBindGroup,
        pass,
        runEnd: flatSurfaces.length,
        runStart,
      });
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

  private drawRun({
    bindGroup,
    pass,
    runEnd,
    runStart,
  }: {
    readonly bindGroup: GPUBindGroup;
    readonly pass: GPURenderPassEncoder;
    readonly runEnd: number;
    readonly runStart: number;
  }) {
    const quadCount = runEnd - runStart;
    if (quadCount <= 0) {
      return;
    }
    pass.setBindGroup(1, bindGroup);
    pass.draw(
      VERTICES_PER_QUAD * quadCount,
      1,
      runStart * VERTICES_PER_QUAD,
      0,
    );
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
