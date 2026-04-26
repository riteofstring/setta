/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { HtmlInCanvasCanvas } from "./htmlInCanvasTypes";
import { NodeTextureManager } from "./nodeTextures";

describe("NodeTextureManager", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a DPR-aware texture and uploads the element with the native WebGPU API", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const canvas = createHtmlInCanvasCanvas();
    const manager = new NodeTextureManager(gpu.device, { canvas });
    const element = document.createElement("div");

    const record = manager.registerNodeTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      frame: 1,
      nodeId: "node-a",
      zoom: 1,
    });
    const result = manager.uploadDirtyNodeTextures({ frame: 2 });

    expect(canvas.requestPaint).toHaveBeenCalledTimes(1);
    expect(gpu.createTexture).toHaveBeenCalledWith({
      format: "rgba8unorm",
      label: "setta-gpu-node-node-a",
      size: {
        height: 100,
        width: 200,
      },
      usage: 7,
    });
    expect(gpu.createSampler).toHaveBeenCalledWith({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
    });
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledWith(
      element,
      200,
      100,
      {
        texture: record.texture,
      },
    );
    expect(result.uploaded.map((node) => node.nodeId)).toEqual(["node-a"]);
    expect(record).toMatchObject({
      dirtyContent: false,
      dirtyResolution: false,
      lastUploadFrame: 2,
      pixelHeight: 100,
      pixelWidth: 200,
      priority: "visible",
      resolutionScale: 2,
    });
  });

  it("keeps the old texture until a resolution upgrade is uploaded", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new NodeTextureManager(gpu.device);
    const element = document.createElement("div");

    const record = manager.registerNodeTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      nodeId: "node-a",
      zoom: 1,
    });
    manager.uploadDirtyNodeTextures({ frame: 1 });
    const oldTexture = gpu.textures[0];

    manager.registerNodeTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      frame: 2,
      nodeId: "node-a",
      zoom: 1.4,
    });

    expect(record.pixelWidth).toBe(200);
    expect(oldTexture?.destroy).not.toHaveBeenCalled();

    manager.uploadDirtyNodeTextures({ frame: 3 });

    expect(gpu.createTexture).toHaveBeenCalledTimes(2);
    expect(oldTexture?.destroy).toHaveBeenCalledTimes(1);
    expect(record).toMatchObject({
      dirtyContent: false,
      dirtyResolution: false,
      lastUploadFrame: 3,
      pixelHeight: 150,
      pixelWidth: 300,
      resolutionScale: 3,
    });
    expect(gpu.copyElementImageToTexture).toHaveBeenLastCalledWith(
      element,
      300,
      150,
      {
        texture: record.texture,
      },
    );
  });

  it("uploads dirty nodes by interactive priority within the upload budget", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new NodeTextureManager(gpu.device);

    registerNode(manager, "prefetch", "prefetch");
    registerNode(manager, "visible", "visible");
    registerNode(manager, "interactive", "interactive");

    const result = manager.uploadDirtyNodeTextures({
      frame: 4,
      maxUploads: 2,
    });

    expect(result.uploaded.map((node) => node.nodeId)).toEqual([
      "interactive",
      "visible",
    ]);
    expect(result.remainingDirtyNodeIds).toEqual(["prefetch"]);
    expect(result.budgetExhausted).toBe(true);
  });

  it("records texture dimension clamps on the node texture record", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new NodeTextureManager(gpu.device, {
      maxTextureDimension2D: 1024,
    });

    const record = manager.registerNodeTexture({
      cssHeight: 500,
      cssWidth: 1000,
      devicePixelRatio: 2,
      element: document.createElement("div"),
      nodeId: "node-a",
      zoom: 4,
    });

    expect(record).toMatchObject({
      clampedByMaxTexture: true,
      maxTextureDimension2D: 1024,
      pixelHeight: 512,
      pixelWidth: 1024,
      requestedScale: 8,
      resolutionScale: 1.024,
      zoomBucket: 4,
    });
  });

  it("destroys individual and retained node textures", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new NodeTextureManager(gpu.device);

    registerNode(manager, "node-a", "visible");
    registerNode(manager, "node-b", "visible");

    manager.destroyNodeTexture("node-a");
    expect(gpu.textures[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(manager.getNodeTexture("node-a")).toBeUndefined();

    manager.destroy();
    expect(gpu.textures[1]?.destroy).toHaveBeenCalledTimes(1);
    expect(manager.getDirtyNodes()).toEqual([]);
  });
});

function createHtmlInCanvasCanvas(): HtmlInCanvasCanvas {
  const canvas = document.createElement("canvas") as HtmlInCanvasCanvas;
  canvas.layoutSubtree = true;
  canvas.onpaint = null;
  canvas.requestPaint = vi.fn();
  return canvas;
}

function createGpuTextureMock() {
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

function installTextureUsage() {
  vi.stubGlobal("GPUTextureUsage", {
    COPY_DST: 2,
    RENDER_ATTACHMENT: 4,
    TEXTURE_BINDING: 1,
  });
}

function registerNode(
  manager: NodeTextureManager,
  nodeId: string,
  priority: "interactive" | "visible" | "prefetch",
) {
  manager.registerNodeTexture({
    cssHeight: 20,
    cssWidth: 40,
    devicePixelRatio: 1,
    element: document.createElement("div"),
    nodeId,
    priority,
    zoom: 1,
  });
}
