import {
  alignToFourBytes,
  buildFlatSurfaceVertexData,
  captureFlatSurfaceGeometry,
  isFlatSurfaceVertexCacheValid,
} from "../gpuPipelines/bufferAndShaders";
import {
  FLAT_SURFACE_VERTEX_BYTES,
  VERTICES_PER_QUAD,
  type FlatSurfaceVertexCache,
  type HtmlSurfaceRenderRuntime,
} from "../gpuPipelines/pipelineTypes";
import {
  assertHtmlSurfaceShaderEffectSupported,
  createHtmlSurfaceShaderEffectShader,
} from "./shaderEffects";
import type { HtmlSurfaceEffectVisual } from "./visualScene";

type EffectSurfaceDrawQuad = {
  readonly height: number;
  readonly surfaceId: string;
  readonly width: number;
  readonly x: number;
  readonly y: number;
  readonly zIndex: number;
};

type EffectSurfaceDrawResources = {
  readonly vertexBuffer: GPUBuffer;
};

export type HtmlSurfaceEffectPassOptions = {
  readonly getCameraBindGroupLayout: () => GPUBindGroupLayout;
  readonly getTextureBindGroup: (
    surface: HtmlSurfaceEffectVisual,
  ) => GPUBindGroup;
  readonly getTextureBindGroupLayout: () => GPUBindGroupLayout;
  readonly runtime: HtmlSurfaceRenderRuntime;
};

export class HtmlSurfaceEffectPass {
  private readonly getCameraBindGroupLayout: () => GPUBindGroupLayout;
  private readonly getTextureBindGroup: (
    surface: HtmlSurfaceEffectVisual,
  ) => GPUBindGroup;
  private readonly getTextureBindGroupLayout: () => GPUBindGroupLayout;
  private readonly pipelines = new Map<string, GPURenderPipeline>();
  private readonly runtime: HtmlSurfaceRenderRuntime;
  private uploadedVertexCache: FlatSurfaceVertexCache | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private vertexBufferByteCapacity = 0;
  private vertexCache: FlatSurfaceVertexCache | null = null;

  constructor({
    getCameraBindGroupLayout,
    getTextureBindGroup,
    getTextureBindGroupLayout,
    runtime,
  }: HtmlSurfaceEffectPassOptions) {
    this.getCameraBindGroupLayout = getCameraBindGroupLayout;
    this.getTextureBindGroup = getTextureBindGroup;
    this.getTextureBindGroupLayout = getTextureBindGroupLayout;
    this.runtime = runtime;
  }

  destroy() {
    this.vertexBuffer?.destroy?.();
    this.pipelines.clear();
    this.uploadedVertexCache = null;
    this.vertexBuffer = null;
    this.vertexBufferByteCapacity = 0;
    this.vertexCache = null;
  }

  prepare(
    effectSurfaces: readonly HtmlSurfaceEffectVisual[],
  ): EffectSurfaceDrawResources | null {
    if (effectSurfaces.length === 0) {
      return null;
    }
    for (const surface of effectSurfaces) {
      assertHtmlSurfaceShaderEffectSupported(surface);
      this.ensurePipeline(surface.effectId);
    }
    const cache = this.resolveVertexCache(effectSurfaces);
    return {
      vertexBuffer: this.ensureVertexBuffer(cache.vertexData.byteLength),
    };
  }

  write(
    effectSurfaceDraw: EffectSurfaceDrawResources | null,
    effectSurfaces: readonly HtmlSurfaceEffectVisual[],
  ) {
    if (!effectSurfaceDraw) {
      this.uploadedVertexCache = null;
      return;
    }
    const vertexCache = this.resolveVertexCache(effectSurfaces);
    if (this.uploadedVertexCache === vertexCache) {
      return;
    }
    this.runtime.device.queue.writeBuffer(
      effectSurfaceDraw.vertexBuffer,
      0,
      vertexCache.vertexData,
    );
    this.uploadedVertexCache = vertexCache;
  }

  draw({
    cameraBindGroup,
    effectSurfaceDraw,
    effectSurfaces,
    pass,
  }: {
    readonly cameraBindGroup: GPUBindGroup;
    readonly effectSurfaceDraw: EffectSurfaceDrawResources | null;
    readonly effectSurfaces: readonly HtmlSurfaceEffectVisual[];
    readonly pass: GPURenderPassEncoder;
  }) {
    if (!effectSurfaceDraw) {
      return;
    }
    pass.setBindGroup(0, cameraBindGroup);
    pass.setVertexBuffer(0, effectSurfaceDraw.vertexBuffer);
    effectSurfaces.forEach((surface, index) => {
      pass.setPipeline(this.ensurePipeline(surface.effectId));
      pass.setBindGroup(1, this.getTextureBindGroup(surface));
      pass.draw(VERTICES_PER_QUAD, 1, index * VERTICES_PER_QUAD, 0);
    });
  }

  getVertexCount(effectSurfaces: readonly HtmlSurfaceEffectVisual[]): number {
    return effectSurfaces.length * VERTICES_PER_QUAD;
  }

  private ensurePipeline(effectId: string): GPURenderPipeline {
    const cached = this.pipelines.get(effectId);
    if (cached) {
      return cached;
    }
    const device = this.runtime.device;
    const shaderModule = device.createShaderModule({
      code: createHtmlSurfaceShaderEffectShader(effectId),
      label: `setta-html-surface-effect-${effectId}-shader`,
    });
    const pipeline = device.createRenderPipeline({
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
      label: `setta-html-surface-effect-${effectId}-pipeline`,
      layout: device.createPipelineLayout({
        bindGroupLayouts: [
          this.getCameraBindGroupLayout(),
          this.getTextureBindGroupLayout(),
        ],
        label: `setta-html-surface-effect-${effectId}-pipeline-layout`,
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
    this.pipelines.set(effectId, pipeline);
    return pipeline;
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
      label: "setta-html-surface-effect-vertices",
      size,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    });
    this.vertexBufferByteCapacity = size;
    this.uploadedVertexCache = null;
    return this.vertexBuffer;
  }

  private resolveVertexCache(
    effectSurfaces: readonly HtmlSurfaceEffectVisual[],
  ): FlatSurfaceVertexCache {
    const quads = createEffectSurfaceDrawQuads(effectSurfaces);
    if (isFlatSurfaceVertexCacheValid(this.vertexCache, quads)) {
      return this.vertexCache;
    }
    const vertexCache = {
      geometry: captureFlatSurfaceGeometry(quads),
      vertexData: buildFlatSurfaceVertexData(quads),
    };
    this.vertexCache = vertexCache;
    return vertexCache;
  }
}

function createEffectSurfaceDrawQuads(
  effectSurfaces: readonly HtmlSurfaceEffectVisual[],
): readonly EffectSurfaceDrawQuad[] {
  return effectSurfaces.map((surface) => ({
    height: surface.bounds.height,
    surfaceId: surface.surfaceId,
    width: surface.bounds.width,
    x: surface.bounds.x,
    y: surface.bounds.y,
    zIndex: surface.zIndex,
  }));
}
