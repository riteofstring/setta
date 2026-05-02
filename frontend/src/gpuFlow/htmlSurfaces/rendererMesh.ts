import {
  FLAT_SURFACE_VERTEX_BYTES,
  type HtmlSurfaceRenderRuntime,
  type MeshSurfaceDrawResources,
  type MeshSurfaceVertexCache,
} from "../gpuPipelines/pipelineTypes";

import {
  FLAT_SURFACE_SHADER,
  alignToFourBytes,
  buildMeshSurfaceVertexCache,
  isMeshSurfaceVertexCacheValid,
} from "../gpuPipelines/bufferAndShaders";

import type { HtmlSurfaceMeshVisual } from "./visualScene";

export type HtmlSurfaceMeshPassOptions = {
  readonly getCameraBindGroupLayout: () => GPUBindGroupLayout;
  readonly getTextureBindGroup: (
    surface: HtmlSurfaceMeshVisual,
  ) => GPUBindGroup;
  readonly getTextureBindGroupLayout: () => GPUBindGroupLayout;
  readonly runtime: HtmlSurfaceRenderRuntime;
};

export class HtmlSurfaceMeshPass {
  private readonly getCameraBindGroupLayout: () => GPUBindGroupLayout;
  private readonly getTextureBindGroup: (
    surface: HtmlSurfaceMeshVisual,
  ) => GPUBindGroup;
  private readonly getTextureBindGroupLayout: () => GPUBindGroupLayout;
  private readonly runtime: HtmlSurfaceRenderRuntime;
  private pipeline: GPURenderPipeline | null = null;
  private uploadedVertexCache: MeshSurfaceVertexCache | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private vertexBufferByteCapacity = 0;
  private vertexCache: MeshSurfaceVertexCache | null = null;

  constructor({
    getCameraBindGroupLayout,
    getTextureBindGroup,
    getTextureBindGroupLayout,
    runtime,
  }: HtmlSurfaceMeshPassOptions) {
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
    meshSurfaces: readonly HtmlSurfaceMeshVisual[],
  ): MeshSurfaceDrawResources | null {
    if (meshSurfaces.length === 0) {
      return null;
    }
    const cache = this.resolveVertexCache(meshSurfaces);
    return {
      pipeline: this.ensurePipeline(),
      vertexBuffer: this.ensureVertexBuffer(cache.vertexData.byteLength),
    };
  }

  write(
    meshSurfaceDraw: MeshSurfaceDrawResources | null,
    meshSurfaces: readonly HtmlSurfaceMeshVisual[],
  ) {
    if (!meshSurfaceDraw) {
      this.uploadedVertexCache = null;
      return;
    }
    const vertexCache = this.resolveVertexCache(meshSurfaces);
    if (this.uploadedVertexCache === vertexCache) {
      return;
    }
    this.runtime.device.queue.writeBuffer(
      meshSurfaceDraw.vertexBuffer,
      0,
      vertexCache.vertexData,
    );
    this.uploadedVertexCache = vertexCache;
  }

  draw({
    cameraBindGroup,
    meshSurfaceDraw,
    meshSurfaces,
    pass,
  }: {
    readonly cameraBindGroup: GPUBindGroup;
    readonly meshSurfaceDraw: MeshSurfaceDrawResources | null;
    readonly meshSurfaces: readonly HtmlSurfaceMeshVisual[];
    readonly pass: GPURenderPassEncoder;
  }) {
    if (!meshSurfaceDraw) {
      return;
    }
    const vertexCache = this.resolveVertexCache(meshSurfaces);
    pass.setPipeline(meshSurfaceDraw.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setVertexBuffer(0, meshSurfaceDraw.vertexBuffer);
    meshSurfaces.forEach((surface, index) => {
      const range = vertexCache.ranges[index];
      if (!range || range.vertexCount === 0) {
        return;
      }
      pass.setBindGroup(1, this.getTextureBindGroup(surface));
      pass.draw(range.vertexCount, 1, range.firstVertex, 0);
    });
  }

  getVertexCount(meshSurfaces: readonly HtmlSurfaceMeshVisual[]): number {
    if (meshSurfaces.length === 0) {
      return 0;
    }
    return this.resolveVertexCache(meshSurfaces).vertexCount;
  }

  private ensurePipeline(): GPURenderPipeline {
    if (this.pipeline) {
      return this.pipeline;
    }
    const device = this.runtime.device;
    const shaderModule = device.createShaderModule({
      code: FLAT_SURFACE_SHADER,
      label: "setta-html-surface-mesh-shader",
    });
    this.pipeline = device.createRenderPipeline({
      fragment: {
        entryPoint: "fs_main",
        module: shaderModule,
        targets: [
          {
            blend: {
              alpha: {
                dstFactor: "one-minus-src-alpha",
                operation: "add",
                srcFactor: "one",
              },
              color: {
                dstFactor: "one-minus-src-alpha",
                operation: "add",
                srcFactor: "src-alpha",
              },
            },
            format: this.runtime.format,
          },
        ],
      },
      label: "setta-html-surface-mesh-pipeline",
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          this.getCameraBindGroupLayout(),
          this.getTextureBindGroupLayout(),
        ],
        label: "setta-html-surface-mesh-pipeline-layout",
      }),
      primitive: {
        topology: "triangle-list",
      },
      vertex: {
        buffers: [
          {
            arrayStride: FLAT_SURFACE_VERTEX_BYTES,
            attributes: [
              {
                format: "float32x2",
                offset: 0,
                shaderLocation: 0,
              },
              {
                format: "float32x2",
                offset: Float32Array.BYTES_PER_ELEMENT * 2,
                shaderLocation: 1,
              },
            ],
          },
        ],
        entryPoint: "vs_main",
        module: shaderModule,
      },
    });
    return this.pipeline;
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
      label: "setta-html-surface-mesh-vertices",
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    });
    this.vertexBufferByteCapacity = size;
    this.uploadedVertexCache = null;
    return this.vertexBuffer;
  }

  private resolveVertexCache(
    meshSurfaces: readonly HtmlSurfaceMeshVisual[],
  ): MeshSurfaceVertexCache {
    if (isMeshSurfaceVertexCacheValid(this.vertexCache, meshSurfaces)) {
      return this.vertexCache;
    }
    const vertexCache = buildMeshSurfaceVertexCache(meshSurfaces);
    this.vertexCache = vertexCache;
    return vertexCache;
  }
}
