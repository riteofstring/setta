import type { HtmlSurfaceRenderRuntime } from "../gpuPipelines/pipelineTypes";
import { HtmlSurfaceFlatPass } from "./rendererFlat";
import type { HtmlSurfaceFlatVisual } from "./visualScene";

export type PreparedFlatSurfaceDraw = ReturnType<HtmlSurfaceFlatPass["prepare"]>;

type HtmlSurfaceFlatLayerPassesOptions = {
  readonly getCameraBindGroupLayout: () => GPUBindGroupLayout;
  readonly getTextureBindGroup: (surface: HtmlSurfaceFlatVisual) => GPUBindGroup;
  readonly getTextureBindGroupLayout: () => GPUBindGroupLayout;
  readonly runtime: HtmlSurfaceRenderRuntime;
};

type HtmlSurfaceFlatLayerDrawInput = {
  readonly cameraBindGroup: GPUBindGroup;
  readonly flatSurfaceDraw: PreparedFlatSurfaceDraw;
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly pass: GPURenderPassEncoder;
};

export class HtmlSurfaceFlatLayerPasses {
  private readonly options: HtmlSurfaceFlatLayerPassesOptions;
  private flatSurfacePass: HtmlSurfaceFlatPass | null = null;
  private lateFlatSurfacePass: HtmlSurfaceFlatPass | null = null;

  constructor(options: HtmlSurfaceFlatLayerPassesOptions) {
    this.options = options;
  }

  destroy() {
    this.flatSurfacePass?.destroy();
    this.lateFlatSurfacePass?.destroy();
    this.flatSurfacePass = null;
    this.lateFlatSurfacePass = null;
  }

  getFlatPipeline(): GPURenderPipeline {
    return this.ensureFlatSurfacePass().getPipeline();
  }

  getFlatVertexCount(flatSurfaces: readonly HtmlSurfaceFlatVisual[]): number {
    return this.flatSurfacePass?.getVertexCount(flatSurfaces) ?? 0;
  }

  getLateFlatVertexCount(
    lateFlatSurfaces: readonly HtmlSurfaceFlatVisual[],
  ): number {
    return this.lateFlatSurfacePass?.getVertexCount(lateFlatSurfaces) ?? 0;
  }

  prepareFlat(
    flatSurfaces: readonly HtmlSurfaceFlatVisual[],
  ): PreparedFlatSurfaceDraw {
    if (flatSurfaces.length === 0) {
      return null;
    }
    return this.ensureFlatSurfacePass().prepare(flatSurfaces);
  }

  prepareLateFlat(
    lateFlatSurfaces: readonly HtmlSurfaceFlatVisual[],
  ): PreparedFlatSurfaceDraw {
    if (lateFlatSurfaces.length === 0) {
      return null;
    }
    return this.ensureLateFlatSurfacePass().prepare(lateFlatSurfaces);
  }

  writeFlat(
    flatSurfaceDraw: PreparedFlatSurfaceDraw,
    flatSurfaces: readonly HtmlSurfaceFlatVisual[],
  ) {
    this.flatSurfacePass?.write(flatSurfaceDraw, flatSurfaces);
  }

  writeLateFlat(
    lateFlatSurfaceDraw: PreparedFlatSurfaceDraw,
    lateFlatSurfaces: readonly HtmlSurfaceFlatVisual[],
  ) {
    this.lateFlatSurfacePass?.write(lateFlatSurfaceDraw, lateFlatSurfaces);
  }

  drawFlat(input: HtmlSurfaceFlatLayerDrawInput) {
    this.flatSurfacePass?.draw(input);
  }

  drawLateFlat(input: HtmlSurfaceFlatLayerDrawInput) {
    this.lateFlatSurfacePass?.draw(input);
  }

  private ensureFlatSurfacePass(): HtmlSurfaceFlatPass {
    if (!this.flatSurfacePass) {
      this.flatSurfacePass = this.createFlatSurfacePass();
    }
    return this.flatSurfacePass;
  }

  private ensureLateFlatSurfacePass(): HtmlSurfaceFlatPass {
    if (!this.lateFlatSurfacePass) {
      this.lateFlatSurfacePass = this.createFlatSurfacePass();
    }
    return this.lateFlatSurfacePass;
  }

  private createFlatSurfacePass(): HtmlSurfaceFlatPass {
    return new HtmlSurfaceFlatPass({
      getCameraBindGroupLayout: this.options.getCameraBindGroupLayout,
      getTextureBindGroup: this.options.getTextureBindGroup,
      getTextureBindGroupLayout: this.options.getTextureBindGroupLayout,
      runtime: this.options.runtime,
    });
  }
}
