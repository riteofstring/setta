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
      lastVisibleFrame: 1,
      pixelHeight: 100,
      pixelWidth: 200,
      priority: "visible",
      resolutionScale: 2,
      textureBytes: 80_000,
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
      textureBytes: 180_000,
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

  it("defers zoom resolution upgrades while viewport interaction is active", () => {
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

    manager.registerNodeTexture({
      cssHeight: 50,
      cssWidth: 100,
      deferResolution: true,
      devicePixelRatio: 2,
      element,
      frame: 2,
      nodeId: "node-a",
      zoom: 1.4,
    });

    expect(manager.getDirtyNodes()).toEqual([]);
    expect(record.pixelWidth).toBe(200);
    expect(gpu.createTexture).toHaveBeenCalledTimes(1);

    manager.registerNodeTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      frame: 3,
      nodeId: "node-a",
      zoom: 1.4,
    });
    expect(manager.getDirtyNodes()).toMatchObject([
      {
        dirtyContent: false,
        dirtyResolution: true,
        nodeId: "node-a",
      },
    ]);

    manager.uploadDirtyNodeTextures({ frame: 4 });
    expect(record).toMatchObject({
      lastUploadFrame: 4,
      pixelHeight: 150,
      pixelWidth: 300,
      resolutionScale: 3,
    });
  });

  it("keeps queued resolution-only uploads out of active viewport frames", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new NodeTextureManager(gpu.device);
    const element = document.createElement("div");

    manager.registerNodeTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      nodeId: "node-a",
      zoom: 1,
    });
    manager.uploadDirtyNodeTextures({ frame: 1 });
    manager.registerNodeTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      frame: 2,
      nodeId: "node-a",
      zoom: 1.4,
    });

    const deferred = manager.uploadDirtyNodeTextures({
      deferResolutionOnly: true,
      frame: 3,
    });

    expect(deferred).toMatchObject({
      budgetExhausted: false,
      remainingDirtyNodeIds: ["node-a"],
      uploaded: [],
    });
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);

    const uploaded = manager.uploadDirtyNodeTextures({ frame: 4 });
    expect(uploaded.uploaded.map((node) => node.nodeId)).toEqual(["node-a"]);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(2);
  });

  it("defers existing passive content uploads during active viewport frames", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new NodeTextureManager(gpu.device);

    registerNode(manager, "node-a", "visible");
    manager.uploadDirtyNodeTextures({ frame: 1 });
    manager.markNodeTextureDirty({
      content: true,
      frame: 2,
      nodeId: "node-a",
      reason: "paint",
    });

    const deferred = manager.uploadDirtyNodeTextures({
      deferPassiveUploads: true,
      frame: 3,
    });

    expect(deferred).toMatchObject({
      budgetExhausted: false,
      remainingDirtyNodeIds: ["node-a"],
      uploaded: [],
    });
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);

    const uploaded = manager.uploadDirtyNodeTextures({ frame: 4 });
    expect(uploaded.uploaded.map((node) => node.nodeId)).toEqual(["node-a"]);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(2);
  });

  it("keeps dirty nodes queued when Chromium has not cached a paint record yet", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const canvas = createHtmlInCanvasCanvas();
    const manager = new NodeTextureManager(gpu.device, { canvas });
    const element = document.createElement("div");
    gpu.copyElementImageToTexture.mockImplementationOnce(() => {
      throw new DOMException(
        "No cached paint record for element.",
        "InvalidStateError",
      );
    });

    manager.registerNodeTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      frame: 1,
      nodeId: "node-a",
      zoom: 1,
    });
    const deferred = manager.uploadDirtyNodeTextures({ frame: 2 });

    expect(deferred).toMatchObject({
      budgetExhausted: false,
      remainingDirtyNodeIds: ["node-a"],
      uploaded: [],
    });
    expect(canvas.requestPaint).toHaveBeenCalledTimes(2);
    expect(manager.getNodeTexture("node-a")).toMatchObject({
      dirtyContent: true,
      dirtyResolution: true,
      lastUploadFrame: -1,
    });

    const uploaded = manager.uploadDirtyNodeTextures({ frame: 3 });

    expect(uploaded.uploaded.map((node) => node.nodeId)).toEqual(["node-a"]);
    expect(manager.getNodeTexture("node-a")).toMatchObject({
      dirtyContent: false,
      dirtyResolution: false,
      lastUploadFrame: 3,
    });
  });

  it("defers explicit nodes without reporting exhausted upload budget", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new NodeTextureManager(gpu.device);

    registerNode(manager, "live", "interactive");
    registerNode(manager, "visible", "visible");
    manager.uploadDirtyNodeTextures({ frame: 1 });
    manager.markNodeTextureDirty({
      content: true,
      frame: 2,
      nodeId: "live",
      priority: "interactive",
      reason: "input",
    });
    manager.markNodeTextureDirty({
      content: true,
      frame: 2,
      nodeId: "visible",
      priority: "visible",
      reason: "paint",
    });

    const deferred = manager.uploadDirtyNodeTextures({
      deferNodeIds: ["live"],
      frame: 3,
    });

    expect(deferred).toMatchObject({
      budgetExhausted: false,
      remainingDirtyNodeIds: ["live"],
    });
    expect(deferred.uploaded.map((node) => node.nodeId)).toEqual(["visible"]);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(3);

    const uploaded = manager.uploadDirtyNodeTextures({ frame: 4 });
    expect(uploaded.uploaded.map((node) => node.nodeId)).toEqual(["live"]);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(4);
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
      textureBytes: 2_097_152,
      zoomBucket: 4,
    });
  });

  it("reports allocated and visible texture memory from texture dimensions", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new NodeTextureManager(gpu.device);

    registerNode(manager, "small", "visible", {
      cssHeight: 10,
      cssWidth: 10,
      devicePixelRatio: 1,
    });
    registerNode(manager, "large", "visible", {
      cssHeight: 20,
      cssWidth: 30,
      devicePixelRatio: 2,
    });

    expect(
      manager.getTextureMemorySnapshot({ visibleNodeIds: ["large"] }),
    ).toEqual({
      allocatedBytes: 10 * 10 * 4 + 60 * 40 * 4,
      largestTextureBytes: 60 * 40 * 4,
      textureCount: 2,
      visibleBytes: 60 * 40 * 4,
      visibleTextureCount: 1,
    });
  });

  it("evicts offscreen textures by least recent visible frame", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new NodeTextureManager(gpu.device, {
      maxTextureBytes: 800,
    });

    registerNode(manager, "recent", "visible", { frame: 1 });
    registerNode(manager, "oldest", "visible", { frame: 2 });
    registerNode(manager, "recent", "visible", { frame: 3 });
    registerNode(manager, "newest", "visible", { frame: 4 });

    const result = manager.evictNodeTextures();

    expect(result).toMatchObject({
      budgetBytes: 800,
      evictedBytes: 400,
      evictedNodeIds: ["oldest"],
      overBudgetBytes: 0,
      reason: "memory-budget",
    });
    expect(result.memoryBefore).toMatchObject({
      allocatedBytes: 1_200,
      textureCount: 3,
    });
    expect(result.memory).toMatchObject({
      allocatedBytes: 800,
      textureCount: 2,
    });
    expect(manager.getNodeTexture("oldest")).toBeUndefined();
    expect(gpu.textures[1]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("protects visible, explicit, interactive, and dirty-interactive records while evicting", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new NodeTextureManager(gpu.device, {
      maxTextureBytes: 400,
    });

    registerNode(manager, "visible", "visible", { frame: 1 });
    registerNode(manager, "explicit", "visible", { frame: 2 });
    registerNode(manager, "interactive", "interactive", { frame: 3 });
    registerNode(manager, "dirty-interactive", "visible", { frame: 4 });
    registerNode(manager, "candidate", "visible", { frame: 5 });
    manager.markNodeTextureDirty({
      content: true,
      nodeId: "dirty-interactive",
      priority: "interactive",
      reason: "input",
    });

    const result = manager.evictNodeTextures({
      protectedNodeIds: ["explicit"],
      visibleNodeIds: ["visible"],
    });

    expect(result.evictedNodeIds).toEqual(["candidate"]);
    expect(result.memory).toMatchObject({
      allocatedBytes: 1_600,
      textureCount: 4,
      visibleBytes: 400,
      visibleTextureCount: 1,
    });
    expect(result.overBudgetBytes).toBe(1_200);
    expect(result.protectedNodeIds).toEqual([
      "dirty-interactive",
      "explicit",
      "interactive",
      "visible",
    ]);
    expect(manager.getNodeTexture("candidate")).toBeUndefined();
    expect(manager.getNodeTexture("visible")).toBeDefined();
    expect(manager.getNodeTexture("explicit")).toBeDefined();
    expect(manager.getNodeTexture("interactive")).toBeDefined();
    expect(manager.getNodeTexture("dirty-interactive")).toBeDefined();
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
  overrides: Partial<{
    readonly cssHeight: number;
    readonly cssWidth: number;
    readonly devicePixelRatio: number;
    readonly frame: number;
    readonly zoom: number;
  }> = {},
) {
  manager.registerNodeTexture({
    cssHeight: overrides.cssHeight ?? 10,
    cssWidth: overrides.cssWidth ?? 10,
    devicePixelRatio: overrides.devicePixelRatio ?? 1,
    element: document.createElement("div"),
    ...(overrides.frame === undefined ? {} : { frame: overrides.frame }),
    nodeId,
    priority,
    zoom: overrides.zoom ?? 1,
  });
}
