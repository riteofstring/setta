/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HtmlSurfaceTextureManager } from "./textures";
import {
  createGpuTextureMock,
  createHtmlInCanvasCanvas,
  emptyDirtyWorkCounts,
  installTextureUsage,
  registerNode,
  requireCommittedSurfaceTexture,
} from "./textures.test-helper";

describe("HtmlSurfaceTextureManager", () => {
  beforeEach(() => {
    installTextureUsage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a DPR-aware texture and uploads the element with the native WebGPU API", () => {
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
    expect(requireCommittedSurfaceTexture(manager, "node-a")).toMatchObject({
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

  it("tiles oversized surfaces and uploads each source subrect into its own texture", () => {
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureTileDimension2D: 128,
    });
    const element = document.createElement("div");

    const record = manager.registerSurfaceTexture({
      cssHeight: 200,
      cssWidth: 300,
      devicePixelRatio: 1,
      element,
      frame: 1,
      surfaceId: "large-node",
      zoom: 1,
    });
    const result = manager.uploadDirtySurfaceTextures({ frame: 2 });

    expect(record.textureLayout).toEqual({
      columns: 3,
      kind: "tiled",
      maxTilePixelHeight: 128,
      maxTilePixelWidth: 128,
      rows: 2,
      tileCount: 6,
    });
    expect(record.textureBytes).toBe(300 * 200 * 4);
    expect(record.tiles.map((tile) => tile.tileId)).toEqual([
      "large-node:0:0",
      "large-node:1:0",
      "large-node:2:0",
      "large-node:0:1",
      "large-node:1:1",
      "large-node:2:1",
    ]);
    expect(record.tiles.map((tile) => [tile.cssX, tile.cssY])).toEqual([
      [0, 0],
      [128, 0],
      [256, 0],
      [0, 128],
      [128, 128],
      [256, 128],
    ]);
    expect(gpu.createTexture).toHaveBeenCalledTimes(6);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(6);
    expect(gpu.copyElementImageToTexture).toHaveBeenNthCalledWith(
      1,
      element,
      0,
      0,
      128,
      128,
      128,
      128,
      { texture: record.tiles[0]?.texture },
    );
    expect(gpu.copyElementImageToTexture).toHaveBeenNthCalledWith(
      6,
      element,
      256,
      128,
      44,
      72,
      44,
      72,
      { texture: record.tiles[5]?.texture },
    );
    expect(result).toMatchObject({
      skippedUploadBytes: 0,
      uploadedBytes: 300 * 200 * 4,
    });
    expect(
      requireCommittedSurfaceTexture(manager, "large-node").tiles.every(
        (tile) => tile.lastUploadFrame === 2,
      ),
    ).toBe(true);
  });

  it("uploads single-texture dirty source rects into the existing texture origin", () => {
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);
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
    manager.uploadDirtySurfaceTextures({ frame: 2 });
    gpu.copyElementImageToTexture.mockClear();

    manager.markSurfaceTextureDirty({
      content: true,
      frame: 3,
      reason: "animation",
      sourceRect: {
        height: 10,
        width: 20,
        x: 10,
        y: 5,
      },
      surfaceId: "node-a",
    });

    expect(manager.getDirtySurfaces()).toMatchObject([
      {
        dirtyTileBytes: 40 * 20 * 4,
        dirtyTileIds: ["node-a:0:0"],
        surfaceId: "node-a",
      },
    ]);

    const result = manager.uploadDirtySurfaceTextures({ frame: 4 });

    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);
    expect(gpu.copyElementImageToTexture).toHaveBeenLastCalledWith(
      element,
      10,
      5,
      20,
      10,
      40,
      20,
      {
        origin: {
          x: 20,
          y: 10,
        },
        texture: record.texture,
      },
    );
    expect(result).toMatchObject({
      diagnostics: [
        expect.objectContaining({
          dirtySourceRect: {
            height: 10,
            width: 20,
            x: 10,
            y: 5,
          },
          dirtyTileBytes: 40 * 20 * 4,
          dirtyTileCount: 1,
          reasons: ["animation"],
          surfaceId: "node-a",
          uploadedBytes: 40 * 20 * 4,
        }),
      ],
      remainingDirtySurfaceIds: [],
      skippedUploadBytes: 0,
      uploadedBytes: 40 * 20 * 4,
    });
    expect(requireCommittedSurfaceTexture(manager, "node-a")).toMatchObject({
      dirtyContent: false,
      dirtyResolution: false,
      lastUploadFrame: 4,
    });
  });

  it("does not request paint or retain paint deferral when no dirty tile is queued", () => {
    const gpu = createGpuTextureMock();
    const canvas = createHtmlInCanvasCanvas();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      canvas,
      maxTextureTileDimension2D: 128,
    });

    manager.registerSurfaceTexture({
      cssHeight: 200,
      cssWidth: 300,
      devicePixelRatio: 1,
      element: document.createElement("div"),
      frame: 1,
      surfaceId: "node-a",
      zoom: 1,
    });
    manager.uploadDirtySurfaceTextures({ frame: 2 });
    vi.mocked(canvas.requestPaint).mockClear();

    const queued = manager.markSurfaceTextureDirty({
      content: true,
      deferUploadUntilPaint: true,
      frame: 3,
      reason: "content",
      sourceRect: {
        height: 10,
        width: 10,
        x: 500,
        y: 500,
      },
      surfaceId: "node-a",
    });

    expect(queued).toBe(false);
    expect(canvas.requestPaint).not.toHaveBeenCalled();
    expect(manager.getDirtySurfaces()).toEqual([]);
    expect(
      manager.uploadDirtySurfaceTextures({ frame: 4 }).workSummary,
    ).toEqual({
      deferredSurfaceCount: 0,
      initialDirtyWorkCounts: emptyDirtyWorkCounts(),
      initialDirtySurfaceCount: 0,
      noUploadReason: "no-dirty-surfaces",
      paintUnavailableSurfaceCount: 0,
      remainingDirtyWorkCounts: emptyDirtyWorkCounts(),
      remainingDirtySurfaceCount: 0,
      skippedSurfaceCount: 0,
      uploadableRemainingDirtyWorkCounts: emptyDirtyWorkCounts(),
      uploadableRemainingDirtySurfaceCount: 0,
      uploadedSurfaceCount: 0,
    });
  });

  it("marks and uploads only tiled source rect owners after the initial upload", () => {
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureTileDimension2D: 128,
    });
    const element = document.createElement("div");

    const record = manager.registerSurfaceTexture({
      cssHeight: 200,
      cssWidth: 300,
      devicePixelRatio: 1,
      element,
      frame: 1,
      surfaceId: "large-node",
      zoom: 1,
    });
    manager.uploadDirtySurfaceTextures({ frame: 2 });

    manager.markSurfaceTextureDirty({
      content: true,
      frame: 3,
      reason: "paint",
      sourceRect: {
        height: 20,
        width: 20,
        x: 130,
        y: 16,
      },
      surfaceId: "large-node",
    });

    expect(manager.getDirtySurfaces()).toMatchObject([
      {
        dirtyTileBytes: 20 * 20 * 4,
        dirtyTileIds: ["large-node:1:0"],
        surfaceId: "large-node",
      },
    ]);

    const result = manager.uploadDirtySurfaceTextures({ frame: 4 });

    expect(result).toMatchObject({
      diagnostics: [
        expect.objectContaining({
          dirtySourceRect: {
            height: 20,
            width: 20,
            x: 130,
            y: 16,
          },
          dirtyTileBytes: 20 * 20 * 4,
          dirtyTileCount: 1,
          reasons: ["paint"],
          surfaceId: "large-node",
          uploadedBytes: 20 * 20 * 4,
        }),
      ],
      remainingDirtySurfaceIds: [],
      skippedUploadBytes: 0,
      uploadedBytes: 20 * 20 * 4,
    });
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(7);
    expect(gpu.copyElementImageToTexture).toHaveBeenLastCalledWith(
      element,
      130,
      16,
      20,
      20,
      20,
      20,
      {
        origin: {
          x: 2,
          y: 16,
        },
        texture: record.tiles[1]?.texture,
      },
    );
    const committed = requireCommittedSurfaceTexture(manager, "large-node");
    expect(committed.tiles[1]).toMatchObject({
      dirtyContent: false,
      lastUploadFrame: 4,
    });
    expect(
      committed.tiles
        .filter((tile) => tile.tileId !== "large-node:1:0")
        .every((tile) => tile.lastUploadFrame === 2),
    ).toBe(true);
  });

  it("spends tiled full-surface dirtiness under the upload budget one tile at a time", () => {
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureTileDimension2D: 128,
    });
    const element = document.createElement("div");

    const record = manager.registerSurfaceTexture({
      cssHeight: 200,
      cssWidth: 300,
      devicePixelRatio: 1,
      element,
      frame: 1,
      surfaceId: "large-node",
      zoom: 1,
    });
    manager.uploadDirtySurfaceTextures({ frame: 2 });
    manager.markSurfaceTextureDirty({
      content: true,
      frame: 3,
      reason: "paint",
      surfaceId: "large-node",
    });

    const partial = manager.uploadDirtySurfaceTextures({
      frame: 4,
      maxUploads: 2,
    });

    expect(partial.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "large-node",
    ]);
    expect(partial).toMatchObject({
      budgetExhausted: true,
      remainingDirtySurfaceIds: ["large-node"],
      skippedUploadBytes: record.textureBytes - 2 * 128 * 128 * 4,
      uploadedBytes: 2 * 128 * 128 * 4,
    });
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(8);
    const partiallyUploaded = requireCommittedSurfaceTexture(
      manager,
      "large-node",
    );
    expect(partiallyUploaded.tiles.slice(0, 2)).toMatchObject([
      {
        dirtyContent: false,
        lastUploadFrame: 4,
      },
      {
        dirtyContent: false,
        lastUploadFrame: 4,
      },
    ]);
    expect(
      partiallyUploaded.tiles.slice(2).every((tile) => tile.dirtyContent),
    ).toBe(true);

    const remaining = manager.uploadDirtySurfaceTextures({ frame: 5 });

    expect(remaining).toMatchObject({
      budgetExhausted: false,
      remainingDirtySurfaceIds: [],
      skippedUploadBytes: 0,
      uploadedBytes: record.textureBytes - 2 * 128 * 128 * 4,
    });
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(12);
    expect(
      requireCommittedSurfaceTexture(manager, "large-node").tiles.every(
        (tile) => !tile.dirtyContent,
      ),
    ).toBe(true);
  });

  it("spends tiled first-visible uploads under the upload budget before exposing the record", () => {
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureTileDimension2D: 128,
    });
    const element = document.createElement("div");

    const record = manager.registerSurfaceTexture({
      cssHeight: 200,
      cssWidth: 300,
      devicePixelRatio: 1,
      element,
      frame: 1,
      surfaceId: "large-node",
      zoom: 1,
    });

    const partial = manager.uploadDirtySurfaceTextures({
      frame: 2,
      maxUploads: 2,
    });

    expect(partial).toMatchObject({
      budgetExhausted: true,
      remainingDirtySurfaceIds: ["large-node"],
      skippedUploadBytes: record.textureBytes - 2 * 128 * 128 * 4,
      uploadedBytes: 2 * 128 * 128 * 4,
    });
    const partiallyUploaded = requireCommittedSurfaceTexture(
      manager,
      "large-node",
    );
    expect(partiallyUploaded.lastUploadFrame).toBe(-1);
    expect(partiallyUploaded.tiles.slice(0, 2)).toMatchObject([
      {
        dirtyResolution: false,
        lastUploadFrame: 2,
      },
      {
        dirtyResolution: false,
        lastUploadFrame: 2,
      },
    ]);
    expect(
      partiallyUploaded.tiles.slice(2).every((tile) => tile.dirtyResolution),
    ).toBe(true);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(2);

    const complete = manager.uploadDirtySurfaceTextures({
      frame: 3,
      maxUploads: 4,
    });

    expect(complete).toMatchObject({
      budgetExhausted: false,
      remainingDirtySurfaceIds: [],
      skippedUploadBytes: 0,
      uploadedBytes: record.textureBytes - 2 * 128 * 128 * 4,
    });
    const committed = requireCommittedSurfaceTexture(manager, "large-node");
    expect(committed.lastUploadFrame).toBe(3);
    expect(committed.tiles.every((tile) => !tile.dirtyResolution)).toBe(true);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(6);
  });

  it("tiles default high-zoom surfaces with scaled source subrect uploads", () => {
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureDimension2D: 4096,
    });
    const element = document.createElement("div");

    const record = manager.registerSurfaceTexture({
      cssHeight: 256,
      cssWidth: 512,
      devicePixelRatio: 2,
      element,
      frame: 1,
      surfaceId: "zoomed-node",
      zoom: 4,
    });
    manager.uploadDirtySurfaceTextures({ frame: 2 });

    expect(record).toMatchObject({
      clampedByMaxTexture: false,
      pixelHeight: 2048,
      pixelWidth: 4096,
      resolutionScale: 8,
      textureLayout: {
        columns: 2,
        kind: "tiled",
        maxTilePixelHeight: 2048,
        maxTilePixelWidth: 2048,
        rows: 1,
        tileCount: 2,
      },
    });
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(2);
    expect(gpu.copyElementImageToTexture).toHaveBeenNthCalledWith(
      1,
      element,
      0,
      0,
      256,
      256,
      2048,
      2048,
      {
        texture: record.tiles[0]?.texture,
      },
    );
    expect(gpu.copyElementImageToTexture).toHaveBeenNthCalledWith(
      2,
      element,
      256,
      0,
      256,
      256,
      2048,
      2048,
      {
        texture: record.tiles[1]?.texture,
      },
    );
  });

  it("keeps the old texture until a resolution upgrade is uploaded", () => {
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
    const committed = requireCommittedSurfaceTexture(manager, "node-a");
    expect(committed).toMatchObject({
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
        texture: committed.texture,
      },
    );
  });

  it("defers zoom resolution upgrades while viewport interaction is active", () => {
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
    expect(requireCommittedSurfaceTexture(manager, "node-a")).toMatchObject({
      lastUploadFrame: 4,
      pixelHeight: 150,
      pixelWidth: 300,
      resolutionScale: 3,
    });
  });

  it("keeps zoom resolution stable inside the bucket hysteresis band", () => {
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);
    const element = document.createElement("div");

    const record = manager.registerSurfaceTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      surfaceId: "node-a",
      zoom: 1.4,
    });
    manager.uploadDirtySurfaceTextures({ frame: 1 });

    manager.registerSurfaceTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      frame: 2,
      surfaceId: "node-a",
      zoom: 1.55,
    });

    expect(record.zoomBucket).toBe(1.5);
    expect(manager.getDirtySurfaces()).toEqual([]);
    expect(gpu.createTexture).toHaveBeenCalledTimes(1);
  });

  it("keeps queued resolution-only uploads out of active viewport frames", () => {
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

  it("keeps queued interactive resolution-only uploads out of active viewport frames", () => {
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);
    const element = document.createElement("div");

    manager.registerSurfaceTexture({
      cssHeight: 50,
      cssWidth: 100,
      devicePixelRatio: 2,
      element,
      priority: "interactive",
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
      priority: "interactive",
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

  it("keeps passive first-visible uploads out of active viewport frames", () => {
    const gpu = createGpuTextureMock();
    const canvas = createHtmlInCanvasCanvas();
    const manager = new HtmlSurfaceTextureManager(gpu.device, { canvas });
    const element = document.createElement("div");

    manager.registerSurfaceTexture({
      cssHeight: 50,
      cssWidth: 100,
      deferResolution: true,
      devicePixelRatio: 2,
      element,
      frame: 1,
      surfaceId: "node-a",
      zoom: 1,
    });

    expect(canvas.requestPaint).not.toHaveBeenCalled();

    const deferred = manager.uploadDirtySurfaceTextures({
      deferPassiveUploads: true,
      frame: 2,
    });

    expect(deferred).toMatchObject({
      budgetExhausted: false,
      remainingDirtySurfaceIds: ["node-a"],
      uploaded: [],
    });
    expect(gpu.copyElementImageToTexture).not.toHaveBeenCalled();

    const uploaded = manager.uploadDirtySurfaceTextures({ frame: 3 });
    expect(uploaded.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "node-a",
    ]);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);
  });

  it("stages tiled resolution upgrades under budget before replacing the old texture", () => {
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureTileDimension2D: 128,
    });
    const element = document.createElement("div");

    const record = manager.registerSurfaceTexture({
      cssHeight: 100,
      cssWidth: 100,
      devicePixelRatio: 1,
      element,
      frame: 1,
      surfaceId: "node-a",
      zoom: 1,
    });
    manager.uploadDirtySurfaceTextures({ frame: 2 });
    const oldTexture = gpu.textures[0];

    manager.registerSurfaceTexture({
      cssHeight: 100,
      cssWidth: 100,
      devicePixelRatio: 1,
      element,
      frame: 3,
      surfaceId: "node-a",
      zoom: 2,
    });

    const partial = manager.uploadDirtySurfaceTextures({
      frame: 4,
      maxUploads: 2,
    });

    expect(partial).toMatchObject({
      budgetExhausted: true,
      remainingDirtySurfaceIds: ["node-a"],
      skippedUploadBytes: 128 * 72 * 4 + 72 * 72 * 4,
      uploadedBytes: 128 * 128 * 4 + 72 * 128 * 4,
    });
    expect(record.texture).toBe(oldTexture);
    expect(record.pixelWidth).toBe(100);
    expect(oldTexture?.destroy).not.toHaveBeenCalled();
    expect(manager.getDirtySurfaces()).toMatchObject([
      {
        dirtyTileIds: ["node-a:0:1", "node-a:1:1"],
        surfaceId: "node-a",
      },
    ]);
    expect(
      manager.getMemorySnapshot({ visibleSurfaceIds: ["node-a"] }),
    ).toEqual({
      allocatedBytes: 100 * 100 * 4 + 200 * 200 * 4,
      largestTextureBytes: 200 * 200 * 4,
      textureCount: 2,
      visibleBytes: 100 * 100 * 4 + 200 * 200 * 4,
      visibleTextureCount: 2,
    });

    const complete = manager.uploadDirtySurfaceTextures({
      frame: 5,
      maxUploads: 2,
    });

    expect(complete).toMatchObject({
      budgetExhausted: false,
      remainingDirtySurfaceIds: [],
      skippedUploadBytes: 0,
      uploadedBytes: 128 * 72 * 4 + 72 * 72 * 4,
    });
    const committed = requireCommittedSurfaceTexture(manager, "node-a");
    expect(committed.texture).not.toBe(oldTexture);
    expect(oldTexture?.destroy).toHaveBeenCalledTimes(1);
    expect(committed).toMatchObject({
      dirtyContent: false,
      dirtyResolution: false,
      lastUploadFrame: 5,
      pixelHeight: 200,
      pixelWidth: 200,
      resolutionScale: 2,
      textureLayout: {
        columns: 2,
        kind: "tiled",
        rows: 2,
        tileCount: 4,
      },
    });
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(5);
  });

  it("keeps the committed source rect while a source-window upload is pending", () => {
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureTileDimension2D: 128,
    });
    const element = document.createElement("div");
    const initialSourceRect = { height: 100, width: 100, x: 0, y: 0 };
    const nextSourceRect = { height: 100, width: 100, x: 0, y: 128 };

    manager.registerSurfaceTexture({
      cssHeight: 200,
      cssWidth: 300,
      devicePixelRatio: 1,
      element,
      frame: 1,
      surfaceId: "node-a",
      textureSourceRect: initialSourceRect,
      zoom: 1,
    });
    manager.uploadDirtySurfaceTextures({ frame: 2 });

    manager.registerSurfaceTexture({
      cssHeight: 200,
      cssWidth: 300,
      devicePixelRatio: 1,
      element,
      frame: 3,
      surfaceId: "node-a",
      textureSourceRect: nextSourceRect,
      zoom: 1,
    });

    const partial = manager.uploadDirtySurfaceTextures({
      frame: 4,
      maxUploads: 1,
    });

    expect(partial.budgetExhausted).toBe(true);
    expect(
      requireCommittedSurfaceTexture(manager, "node-a").textureSourceRect,
    ).toEqual(initialSourceRect);

    const complete = manager.uploadDirtySurfaceTextures({ frame: 5 });

    expect(complete.budgetExhausted).toBe(false);
    expect(
      requireCommittedSurfaceTexture(manager, "node-a").textureSourceRect,
    ).toEqual(nextSourceRect);
  });

  it("retargets a source rect without upload when the texture content key is unchanged", () => {
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);
    const element = document.createElement("div");
    const initialSourceRect = { height: 100, width: 100, x: 0, y: 0 };
    const nextSourceRect = { height: 100, width: 100, x: 0, y: 24 };

    manager.registerSurfaceTexture({
      cssHeight: 200,
      cssWidth: 300,
      devicePixelRatio: 1,
      element,
      frame: 1,
      surfaceId: "node-a",
      textureContentKey: "cache-a",
      textureSourceRect: initialSourceRect,
      zoom: 1,
    });
    manager.uploadDirtySurfaceTextures({ frame: 2 });
    gpu.copyElementImageToTexture.mockClear();

    manager.registerSurfaceTexture({
      cssHeight: 200,
      cssWidth: 300,
      devicePixelRatio: 1,
      element,
      frame: 3,
      surfaceId: "node-a",
      textureContentKey: "cache-a",
      textureSourceRect: nextSourceRect,
      zoom: 1,
    });

    expect(manager.getDirtySurfaces()).toEqual([]);
    expect(gpu.copyElementImageToTexture).not.toHaveBeenCalled();
    expect(
      requireCommittedSurfaceTexture(manager, "node-a").textureSourceRect,
    ).toEqual(nextSourceRect);
  });

  it("defers existing passive content uploads during active viewport frames", () => {
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
      workSummary: {
        deferredSurfaceCount: 1,
        initialDirtySurfaceCount: 1,
        noUploadReason: "all-work-deferred",
        paintUnavailableSurfaceCount: 0,
        remainingDirtySurfaceCount: 1,
        skippedSurfaceCount: 0,
        uploadableRemainingDirtySurfaceCount: 0,
        uploadedSurfaceCount: 0,
      },
    });
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);

    const uploaded = manager.uploadDirtySurfaceTextures({ frame: 4 });
    expect(uploaded.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "node-a",
    ]);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(2);
  });

  it("keeps dirty surfaces queued when Chromium has not cached a paint record yet", () => {
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
      workSummary: {
        initialDirtySurfaceCount: 1,
        noUploadReason: "paint-unavailable",
        paintUnavailableSurfaceCount: 1,
        remainingDirtySurfaceCount: 1,
        uploadedSurfaceCount: 0,
      },
    });
    expect(canvas.requestPaint).toHaveBeenCalledTimes(2);
    expect(manager.getCommittedSurfaceTexture("node-a")).toMatchObject({
      dirtyContent: true,
      dirtyResolution: true,
      lastUploadFrame: -1,
    });

    const uploaded = manager.uploadDirtySurfaceTextures({ frame: 3 });

    expect(uploaded.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "node-a",
    ]);
    expect(manager.getCommittedSurfaceTexture("node-a")).toMatchObject({
      dirtyContent: false,
      dirtyResolution: false,
      lastUploadFrame: 3,
    });
  });

  it("defers explicit nodes without reporting exhausted upload budget", () => {
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
});
