import {
  alignToFourBytes,
  buildSolidRoundedRectVertexData,
  captureSolidRoundedRectGeometry,
  isSolidRoundedRectVertexCacheValid,
} from "../gpuPipelines/bufferAndShaders";
import {
  SOLID_ROUNDED_RECT_VERTEX_BYTES,
  VERTICES_PER_QUAD,
  type HtmlSurfaceRenderRuntime,
  type SolidRoundedRectDrawResources,
  type SolidRoundedRectVertexCache,
} from "../gpuPipelines/pipelineTypes";
import { createHtmlSurfaceSolidRoundedRectPipeline } from "./rendererPipelineFactories";
import type { HtmlSurfaceSolidRoundedRectVisual } from "./visualScene";

type HtmlSurfaceSolidRoundedRectPassOptions = {
  readonly getCameraBindGroupLayout: () => GPUBindGroupLayout;
  readonly runtime: HtmlSurfaceRenderRuntime;
};

export class HtmlSurfaceSolidRoundedRectPass {
  private readonly getCameraBindGroupLayout: () => GPUBindGroupLayout;
  private readonly runtime: HtmlSurfaceRenderRuntime;
  private pipeline: GPURenderPipeline | null = null;
  private uploadedVertexCache: SolidRoundedRectVertexCache | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private vertexBufferByteCapacity = 0;
  private vertexCache: SolidRoundedRectVertexCache | null = null;

  constructor({
    getCameraBindGroupLayout,
    runtime,
  }: HtmlSurfaceSolidRoundedRectPassOptions) {
    this.getCameraBindGroupLayout = getCameraBindGroupLayout;
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
    solidRoundedRectSurfaces: readonly HtmlSurfaceSolidRoundedRectVisual[],
  ): SolidRoundedRectDrawResources | null {
    if (solidRoundedRectSurfaces.length === 0) {
      return null;
    }
    const vertexCache = this.resolveVertexCache(solidRoundedRectSurfaces);
    return {
      pipeline: this.ensurePipeline(),
      vertexBuffer: this.ensureVertexBuffer(vertexCache.vertexData.byteLength),
    };
  }

  write(
    solidRoundedRectSurfaceDraw: SolidRoundedRectDrawResources | null,
    solidRoundedRectSurfaces: readonly HtmlSurfaceSolidRoundedRectVisual[],
  ) {
    if (!solidRoundedRectSurfaceDraw) {
      this.uploadedVertexCache = null;
      return;
    }
    const vertexCache = this.resolveVertexCache(solidRoundedRectSurfaces);
    if (this.uploadedVertexCache === vertexCache) {
      return;
    }
    this.runtime.device.queue.writeBuffer(
      solidRoundedRectSurfaceDraw.vertexBuffer,
      0,
      vertexCache.vertexData,
    );
    this.uploadedVertexCache = vertexCache;
  }

  draw({
    cameraBindGroup,
    pass,
    solidRoundedRectSurfaceDraw,
    solidRoundedRectSurfaces,
  }: {
    readonly cameraBindGroup: GPUBindGroup;
    readonly pass: GPURenderPassEncoder;
    readonly solidRoundedRectSurfaceDraw: SolidRoundedRectDrawResources | null;
    readonly solidRoundedRectSurfaces: readonly HtmlSurfaceSolidRoundedRectVisual[];
  }) {
    if (!solidRoundedRectSurfaceDraw) {
      return;
    }
    pass.setPipeline(solidRoundedRectSurfaceDraw.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setVertexBuffer(0, solidRoundedRectSurfaceDraw.vertexBuffer);
    pass.draw(
      solidRoundedRectSurfaces.length * VERTICES_PER_QUAD,
      1,
      0,
      0,
    );
  }

  getVertexCount(
    solidRoundedRectSurfaces: readonly HtmlSurfaceSolidRoundedRectVisual[],
  ): number {
    return solidRoundedRectSurfaces.length * VERTICES_PER_QUAD;
  }

  private ensurePipeline(): GPURenderPipeline {
    if (this.pipeline) {
      return this.pipeline;
    }
    this.pipeline = createHtmlSurfaceSolidRoundedRectPipeline({
      cameraBindGroupLayout: this.getCameraBindGroupLayout(),
      runtime: this.runtime,
    });
    return this.pipeline;
  }

  private ensureVertexBuffer(byteLength: number): GPUBuffer {
    if (this.vertexBuffer && this.vertexBufferByteCapacity >= byteLength) {
      return this.vertexBuffer;
    }
    this.vertexBuffer?.destroy?.();
    const size = Math.max(
      SOLID_ROUNDED_RECT_VERTEX_BYTES,
      alignToFourBytes(byteLength),
    );
    this.vertexBuffer = this.runtime.device.createBuffer({
      label: "setta-html-surface-solid-rounded-rect-vertices",
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    });
    this.vertexBufferByteCapacity = size;
    this.uploadedVertexCache = null;
    return this.vertexBuffer;
  }

  private resolveVertexCache(
    solidRoundedRectSurfaces: readonly HtmlSurfaceSolidRoundedRectVisual[],
  ): SolidRoundedRectVertexCache {
    if (
      isSolidRoundedRectVertexCacheValid(
        this.vertexCache,
        solidRoundedRectSurfaces,
      )
    ) {
      return this.vertexCache;
    }
    const vertexCache = {
      geometry: captureSolidRoundedRectGeometry(solidRoundedRectSurfaces),
      vertexData: buildSolidRoundedRectVertexData(solidRoundedRectSurfaces),
    };
    this.vertexCache = vertexCache;
    return vertexCache;
  }
}
