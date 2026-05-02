/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { HtmlInCanvasCanvas } from "../htmlInCanvasTypes";
import { HtmlSurfaceTextureManager } from "./textures";

describe("HtmlSurfaceTextureManager", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a DPR-aware texture and uploads the element with the native WebGPU API", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const canvas = createHtmlInCanvasCanvas();
    const manager = new HtmlSurfaceTextureManager(gpu.device, { canvas });
    const element = document.createElement("div");

    const record = manager.registerSurfaceTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      frame: 1,
      surfaceId: "node-a",
      zoom: 1,
    });
    const result = manager.uploadDirtySurfaceTextures({ frame: 2 });

    expect(canvas.requestPaint).toHaveBeenCalledTimes(1);
    expect(gpu.createTexture).toHaveBeenCalledWith({
      format: "rgba8unorm",
      label: "setta-html-surface-node-a",
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
    expect(result.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "node-a",
    ]);
    expect(result).toMatchObject({
      skippedUploadBytes: 0,
      uploadedBytes: 80_000,
    });
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
      textureLayout: { kind: "single", tileCount: 1 },
      tiles: [
        {
          cssHeight: 50,
          cssWidth: 100,
          cssX: 0,
          cssY: 0,
          lastUploadFrame: 2,
          surfaceId: "node-a",
          textureBytes: 80_000,
          tileId: "node-a:0:0",
          u0: 0,
          u1: 1,
          v0: 0,
          v1: 1,
        },
      ],
    });
  });

  it("keeps the old texture until a resolution upgrade is uploaded", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);
    const element = document.createElement("div");

    const record = manager.registerSurfaceTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      surfaceId: "node-a",
      zoom: 1,
    });
    manager.uploadDirtySurfaceTextures({ frame: 1 });
    const oldTexture = gpu.textures[0];

    manager.registerSurfaceTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      frame: 2,
      surfaceId: "node-a",
      zoom: 1.4,
    });

    expect(record.pixelWidth).toBe(200);
    expect(oldTexture?.destroy).not.toHaveBeenCalled();

    manager.uploadDirtySurfaceTextures({ frame: 3 });

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
    const manager = new HtmlSurfaceTextureManager(gpu.device);
    const element = document.createElement("div");

    const record = manager.registerSurfaceTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      surfaceId: "node-a",
      zoom: 1,
    });
    manager.uploadDirtySurfaceTextures({ frame: 1 });

    manager.registerSurfaceTexture({
      cssHeight: 50,
      cssWidth: 100,
      deferResolution: true,
      devicePixelRatio: 2,
      element,
      frame: 2,
      surfaceId: "node-a",
      zoom: 1.4,
    });

    expect(manager.getDirtySurfaces()).toEqual([]);
    expect(record.pixelWidth).toBe(200);
    expect(gpu.createTexture).toHaveBeenCalledTimes(1);

    manager.registerSurfaceTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      frame: 3,
      surfaceId: "node-a",
      zoom: 1.4,
    });
    expect(manager.getDirtySurfaces()).toMatchObject([
      {
        dirtyContent: false,
        dirtyResolution: true,
        surfaceId: "node-a",
      },
    ]);

    manager.uploadDirtySurfaceTextures({ frame: 4 });
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
    const manager = new HtmlSurfaceTextureManager(gpu.device);
    const element = document.createElement("div");

    manager.registerSurfaceTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      surfaceId: "node-a",
      zoom: 1,
    });
    manager.uploadDirtySurfaceTextures({ frame: 1 });
    manager.registerSurfaceTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      frame: 2,
      surfaceId: "node-a",
      zoom: 1.4,
    });

    const deferred = manager.uploadDirtySurfaceTextures({
      deferResolutionOnly: true,
      frame: 3,
    });

    expect(deferred).toMatchObject({
      budgetExhausted: false,
      remainingDirtySurfaceIds: ["node-a"],
      uploaded: [],
    });
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);

    const uploaded = manager.uploadDirtySurfaceTextures({ frame: 4 });
    expect(uploaded.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "node-a",
    ]);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(2);
  });

  it("defers existing passive content uploads during active viewport frames", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    registerNode(manager, "node-a", "visible");
    manager.uploadDirtySurfaceTextures({ frame: 1 });
    manager.markSurfaceTextureDirty({
      content: true,
      frame: 2,
      surfaceId: "node-a",
      reason: "paint",
    });

    const deferred = manager.uploadDirtySurfaceTextures({
      deferPassiveUploads: true,
      frame: 3,
    });

    expect(deferred).toMatchObject({
      budgetExhausted: false,
      remainingDirtySurfaceIds: ["node-a"],
      uploaded: [],
    });
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);

    const uploaded = manager.uploadDirtySurfaceTextures({ frame: 4 });
    expect(uploaded.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "node-a",
    ]);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(2);
  });

  it("keeps dirty surfaces queued when Chromium has not cached a paint record yet", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const canvas = createHtmlInCanvasCanvas();
    const manager = new HtmlSurfaceTextureManager(gpu.device, { canvas });
    const element = document.createElement("div");
    gpu.copyElementImageToTexture.mockImplementationOnce(() => {
      throw new DOMException(
        "No cached paint record for element.",
        "InvalidStateError",
      );
    });

    manager.registerSurfaceTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      frame: 1,
      surfaceId: "node-a",
      zoom: 1,
    });
    const deferred = manager.uploadDirtySurfaceTextures({ frame: 2 });

    expect(deferred).toMatchObject({
      budgetExhausted: false,
      remainingDirtySurfaceIds: ["node-a"],
      uploaded: [],
    });
    expect(canvas.requestPaint).toHaveBeenCalledTimes(2);
    expect(manager.getSurfaceTexture("node-a")).toMatchObject({
      dirtyContent: true,
      dirtyResolution: true,
      lastUploadFrame: -1,
    });

    const uploaded = manager.uploadDirtySurfaceTextures({ frame: 3 });

    expect(uploaded.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "node-a",
    ]);
    expect(manager.getSurfaceTexture("node-a")).toMatchObject({
      dirtyContent: false,
      dirtyResolution: false,
      lastUploadFrame: 3,
    });
  });

  it("defers explicit nodes without reporting exhausted upload budget", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    registerNode(manager, "live", "interactive");
    registerNode(manager, "visible", "visible");
    manager.uploadDirtySurfaceTextures({ frame: 1 });
    manager.markSurfaceTextureDirty({
      content: true,
      frame: 2,
      surfaceId: "live",
      priority: "interactive",
      reason: "input",
    });
    manager.markSurfaceTextureDirty({
      content: true,
      frame: 2,
      surfaceId: "visible",
      priority: "visible",
      reason: "paint",
    });

    const deferred = manager.uploadDirtySurfaceTextures({
      deferSurfaceIds: ["live"],
      frame: 3,
    });

    expect(deferred).toMatchObject({
      budgetExhausted: false,
      remainingDirtySurfaceIds: ["live"],
    });
    expect(deferred.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "visible",
    ]);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(3);

    const uploaded = manager.uploadDirtySurfaceTextures({ frame: 4 });
    expect(uploaded.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "live",
    ]);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(4);
  });

  it("uploads dirty surfaces by interactive priority within the upload budget", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    registerNode(manager, "prefetch", "prefetch");
    registerNode(manager, "visible", "visible");
    registerNode(manager, "interactive", "interactive");

    const result = manager.uploadDirtySurfaceTextures({
      frame: 4,
      maxUploads: 2,
    });

    expect(result.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "interactive",
      "visible",
    ]);
    expect(result.remainingDirtySurfaceIds).toEqual(["prefetch"]);
    expect(result.budgetExhausted).toBe(true);
  });

  it("reports upload and skipped bytes when the byte budget leaves dirty surfaces queued", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    registerNode(manager, "first", "visible");
    registerNode(manager, "second", "visible");

    const result = manager.uploadDirtySurfaceTextures({
      frame: 4,
      maxBytes: 400,
    });

    expect(result.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "first",
    ]);
    expect(result.remainingDirtySurfaceIds).toEqual(["second"]);
    expect(result.uploadedBytes).toBe(400);
    expect(result.skippedUploadBytes).toBe(400);
    expect(result.budgetExhausted).toBe(true);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);
  });

  it("records texture dimension clamps on the surface texture record", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureDimension2D: 1024,
    });

    const record = manager.registerSurfaceTexture({
      cssHeight: 500,
      cssWidth: 1000,
      devicePixelRatio: 2,
      element: document.createElement("div"),
      surfaceId: "node-a",
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
    const manager = new HtmlSurfaceTextureManager(gpu.device);

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

    expect(manager.getMemorySnapshot({ visibleSurfaceIds: ["large"] })).toEqual(
      {
        allocatedBytes: 10 * 10 * 4 + 60 * 40 * 4,
        largestTextureBytes: 60 * 40 * 4,
        textureCount: 2,
        visibleBytes: 60 * 40 * 4,
        visibleTextureCount: 1,
      },
    );
  });

  it("evicts offscreen textures by least recent visible frame", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureBytes: 800,
    });

    registerNode(manager, "recent", "visible", { frame: 1 });
    registerNode(manager, "oldest", "visible", { frame: 2 });
    registerNode(manager, "recent", "visible", { frame: 3 });
    registerNode(manager, "newest", "visible", { frame: 4 });

    const result = manager.evictSurfaceTextures();

    expect(result).toMatchObject({
      budgetBytes: 800,
      evictedBytes: 400,
      evictedSurfaceIds: ["oldest"],
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
    expect(manager.getSurfaceTexture("oldest")).toBeUndefined();
    expect(gpu.textures[1]?.destroy).toHaveBeenCalledTimes(1);
  });

  it("protects visible, explicit, interactive, and dirty-interactive records while evicting", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureBytes: 400,
    });

    registerNode(manager, "visible", "visible", { frame: 1 });
    registerNode(manager, "explicit", "visible", { frame: 2 });
    registerNode(manager, "interactive", "interactive", { frame: 3 });
    registerNode(manager, "dirty-interactive", "visible", { frame: 4 });
    registerNode(manager, "candidate", "visible", { frame: 5 });
    manager.markSurfaceTextureDirty({
      content: true,
      surfaceId: "dirty-interactive",
      priority: "interactive",
      reason: "input",
    });

    const result = manager.evictSurfaceTextures({
      protectedSurfaceIds: ["explicit"],
      visibleSurfaceIds: ["visible"],
    });

    expect(result.evictedSurfaceIds).toEqual(["candidate"]);
    expect(result.memory).toMatchObject({
      allocatedBytes: 1_600,
      textureCount: 4,
      visibleBytes: 400,
      visibleTextureCount: 1,
    });
    expect(result.overBudgetBytes).toBe(1_200);
    expect(result.protectedSurfaceIds).toEqual([
      "dirty-interactive",
      "explicit",
      "interactive",
      "visible",
    ]);
    expect(manager.getSurfaceTexture("candidate")).toBeUndefined();
    expect(manager.getSurfaceTexture("visible")).toBeDefined();
    expect(manager.getSurfaceTexture("explicit")).toBeDefined();
    expect(manager.getSurfaceTexture("interactive")).toBeDefined();
    expect(manager.getSurfaceTexture("dirty-interactive")).toBeDefined();
  });

  it("destroys individual and retained surface textures", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    registerNode(manager, "node-a", "visible");
    registerNode(manager, "node-b", "visible");

    manager.destroySurfaceTexture("node-a");
    expect(gpu.textures[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(manager.getSurfaceTexture("node-a")).toBeUndefined();

    manager.destroy();
    expect(gpu.textures[1]?.destroy).toHaveBeenCalledTimes(1);
    expect(manager.getDirtySurfaces()).toEqual([]);
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
