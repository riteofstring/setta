import { describe, expect, it, vi } from "vitest";

import { HtmlSurfaceFlatPass } from "./rendererFlat";
import type { HtmlSurfaceFlatVisual } from "./visualScene";

describe("HtmlSurfaceFlatPass batching", () => {
  it("draws consecutive quads with a shared texture bind group as one range", () => {
    const atlasBindGroup = {} as GPUBindGroup;
    const renderPass = {
      draw: vi.fn(),
      setBindGroup: vi.fn(),
      setPipeline: vi.fn(),
      setVertexBuffer: vi.fn(),
    } as unknown as GPURenderPassEncoder & {
      draw: ReturnType<typeof vi.fn>;
      setBindGroup: ReturnType<typeof vi.fn>;
    };
    const flatPass = new HtmlSurfaceFlatPass({
      getCameraBindGroupLayout: () => {
        throw new Error("Pipeline creation is not needed for draw batching.");
      },
      getTextureBindGroup: () => atlasBindGroup,
      getTextureBindGroupLayout: () => {
        throw new Error("Pipeline creation is not needed for draw batching.");
      },
      runtime: {} as never,
    });

    flatPass.draw({
      cameraBindGroup: {} as GPUBindGroup,
      flatSurfaceDraw: {
        pipeline: {} as GPURenderPipeline,
        vertexBuffer: {} as GPUBuffer,
      },
      flatSurfaces: [flatSurface("page-a", 0), flatSurface("page-b", 100)],
      pass: renderPass,
    });

    expect(renderPass.setBindGroup).toHaveBeenCalledTimes(2);
    expect(renderPass.setBindGroup).toHaveBeenLastCalledWith(1, atlasBindGroup);
    expect(renderPass.draw).toHaveBeenCalledOnce();
    expect(renderPass.draw).toHaveBeenCalledWith(12, 1, 0, 0);
  });
});

function flatSurface(surfaceId: string, x: number): HtmlSurfaceFlatVisual {
  return {
    height: 50,
    kind: "flat",
    surfaceId,
    texture: {
      sampler: {} as GPUSampler,
      surfaceId,
      texture: {} as GPUTexture,
      textureBytes: 0,
      textureContentKey: "retained-atlas",
      textureView: {} as GPUTextureView,
    },
    width: 100,
    x,
    y: 0,
    zIndex: 0,
  };
}
