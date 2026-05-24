/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HtmlSurfaceTextureManager } from "./textures";
import {
  createGpuTextureMock,
  installTextureUsage,
} from "./textures.test-helper";

describe("HtmlSurfaceTextureManager source rect dirtying", () => {
  beforeEach(() => {
    installTextureUsage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not queue single-texture dirty source rects outside the texture", () => {
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);
    const element = document.createElement("div");

    manager.registerSurfaceTexture({
      cssHeight: 1,
      cssWidth: 1,
      devicePixelRatio: 1,
      element,
      frame: 1,
      surfaceId: "compact-node",
      textureContentKey: "compact-shell",
      zoom: 1,
    });
    manager.uploadDirtySurfaceTextures({ frame: 2 });
    gpu.copyElementImageToTexture.mockClear();

    const queued = manager.markSurfaceTextureDirty({
      content: true,
      frame: 3,
      reason: "paint",
      sourceRect: {
        height: 24,
        width: 120,
        x: 32,
        y: 40,
      },
      surfaceId: "compact-node",
    });

    expect(queued).toBe(false);
    expect(manager.getDirtySurfaces()).toEqual([]);
    expect(manager.uploadDirtySurfaceTextures({ frame: 4 })).toMatchObject({
      remainingDirtySurfaceIds: [],
      uploaded: [],
      uploadedBytes: 0,
    });
    expect(gpu.copyElementImageToTexture).not.toHaveBeenCalled();
  });

  it("keeps an already-queued full single-texture upload when a later dirty source rect misses the texture", () => {
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);
    const element = document.createElement("div");

    const record = manager.registerSurfaceTexture({
      cssHeight: 1,
      cssWidth: 1,
      devicePixelRatio: 1,
      element,
      frame: 1,
      surfaceId: "compact-node",
      textureContentKey: "compact-shell",
      zoom: 1,
    });

    const queued = manager.markSurfaceTextureDirty({
      content: true,
      frame: 2,
      reason: "paint",
      sourceRect: {
        height: 24,
        width: 120,
        x: 32,
        y: 40,
      },
      surfaceId: "compact-node",
    });

    expect(queued).toBe(false);
    expect(manager.getDirtySurfaces()).toMatchObject([
      {
        dirtyTileBytes: 4,
        dirtyTileIds: ["compact-node:0:0"],
        surfaceId: "compact-node",
      },
    ]);

    const result = manager.uploadDirtySurfaceTextures({ frame: 3 });

    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);
    expect(gpu.copyElementImageToTexture).toHaveBeenLastCalledWith(
      element,
      1,
      1,
      {
        texture: record.texture,
      },
    );
    expect(result).toMatchObject({
      diagnostics: [
        expect.objectContaining({
          dirtyTileBytes: 4,
          dirtyTileCount: 1,
          reasons: ["first-visible"],
          surfaceId: "compact-node",
          uploadedBytes: 4,
        }),
      ],
      remainingDirtySurfaceIds: [],
      uploadedBytes: 4,
    });
  });
});
