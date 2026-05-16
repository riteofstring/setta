import { vi } from "vitest";
import type { HtmlInCanvasCanvas } from "../htmlInCanvasTypes";
import { HtmlSurfaceTextureManager } from "./textures";

export function createHtmlInCanvasCanvas(): HtmlInCanvasCanvas {
  const canvas = document.createElement("canvas") as HtmlInCanvasCanvas;
  canvas.layoutSubtree = true;
  canvas.onpaint = null;
  canvas.requestPaint = vi.fn();
  return canvas;
}

export function createGpuTextureMock() {
  const textures: Array<GPUTexture & { destroy: ReturnType<typeof vi.fn> }> =
    [];
  const copyElementImageToTexture = vi.fn();
  const createTexture = vi.fn((descriptor: GPUTextureDescriptor) => {
    const texture = {
      createView: vi.fn(() => ({}) as GPUTextureView),
      destroy: vi.fn(),
      descriptor,
    } as unknown as GPUTexture & { destroy: ReturnType<typeof vi.fn> };
    textures.push(texture);
    return texture;
  });
  const createSampler = vi.fn(() => ({}) as GPUSampler);
  const device = {
    createSampler,
    createTexture,
    destroy: vi.fn(),
    limits: {
      maxTextureDimension2D: 4096,
    },
    queue: {
      copyElementImageToTexture,
    },
  } as unknown as GPUDevice;

  return {
    copyElementImageToTexture,
    createSampler,
    createTexture,
    device,
    textures,
  };
}

export function installTextureUsage() {
  vi.stubGlobal("GPUTextureUsage", {
    COPY_DST: 2,
    RENDER_ATTACHMENT: 4,
    TEXTURE_BINDING: 1,
  });
}

export function registerNode(
  manager: HtmlSurfaceTextureManager,
  surfaceId: string,
  priority: "interactive" | "visible" | "prefetch",
  overrides: Partial<{
    readonly cssHeight: number;
    readonly cssWidth: number;
    readonly devicePixelRatio: number;
    readonly frame: number;
    readonly zoom: number;
  }> = {},
) {
  manager.registerSurfaceTexture({
    cssHeight: overrides.cssHeight ?? 10,
    cssWidth: overrides.cssWidth ?? 10,
    devicePixelRatio: overrides.devicePixelRatio ?? 1,
    element: document.createElement("div"),
    ...(overrides.frame === undefined ? {} : { frame: overrides.frame }),
    priority,
    surfaceId,
    zoom: overrides.zoom ?? 1,
  });
}
