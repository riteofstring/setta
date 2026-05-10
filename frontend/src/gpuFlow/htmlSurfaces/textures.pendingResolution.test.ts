/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { HtmlSurfaceTextureManager } from "./textures";
import {
  createGpuTextureMock,
  installTextureUsage,
} from "./textures.helpers.test";

describe("HtmlSurfaceTextureManager pending resolution uploads", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps staged upload progress across repeated registrations", () => {
    installTextureUsage();
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
    const oldTexture = record.texture;

    manager.registerSurfaceTexture({
      cssHeight: 100,
      cssWidth: 100,
      devicePixelRatio: 1,
      element,
      frame: 3,
      surfaceId: "node-a",
      zoom: 2,
    });

    manager.uploadDirtySurfaceTextures({ frame: 4, maxUploads: 2 });
    expect(manager.getDirtySurfaces()).toMatchObject([
      {
        dirtyTileIds: ["node-a:0:1", "node-a:1:1"],
        surfaceId: "node-a",
      },
    ]);

    manager.registerSurfaceTexture({
      cssHeight: 100,
      cssWidth: 100,
      devicePixelRatio: 1,
      element,
      frame: 5,
      surfaceId: "node-a",
      zoom: 2,
    });
    expect(manager.getDirtySurfaces()).toMatchObject([
      {
        dirtyTileIds: ["node-a:0:1", "node-a:1:1"],
        surfaceId: "node-a",
      },
    ]);

    const complete = manager.uploadDirtySurfaceTextures({
      frame: 6,
      maxUploads: 2,
    });

    expect(complete).toMatchObject({
      budgetExhausted: false,
      remainingDirtySurfaceIds: [],
    });
    expect(record.texture).not.toBe(oldTexture);
    expect(record).toMatchObject({
      dirtyContent: false,
      dirtyResolution: false,
      lastUploadFrame: 6,
      pixelHeight: 200,
      pixelWidth: 200,
      textureLayout: {
        columns: 2,
        kind: "tiled",
        rows: 2,
        tileCount: 4,
      },
    });
  });

  it("keeps content-dirty staged progress across repeated registrations", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device, {
      maxTextureTileDimension2D: 128,
    });
    const element = document.createElement("div");

    manager.registerSurfaceTexture({
      cssHeight: 100,
      cssWidth: 100,
      devicePixelRatio: 1,
      element,
      frame: 1,
      surfaceId: "node-a",
      zoom: 1,
    });
    manager.uploadDirtySurfaceTextures({ frame: 2 });
    manager.registerSurfaceTexture({
      cssHeight: 100,
      cssWidth: 100,
      devicePixelRatio: 1,
      element,
      frame: 3,
      surfaceId: "node-a",
      zoom: 2,
    });

    manager.markSurfaceTextureDirty({
      content: true,
      frame: 4,
      reason: "animation",
      surfaceId: "node-a",
    });
    manager.uploadDirtySurfaceTextures({ frame: 5, maxUploads: 1 });
    const dirtyBeforeRegister = manager.getDirtySurfaces()[0]?.dirtyTileIds;

    manager.registerSurfaceTexture({
      cssHeight: 100,
      cssWidth: 100,
      devicePixelRatio: 1,
      element,
      frame: 6,
      surfaceId: "node-a",
      zoom: 2,
    });

    expect(manager.getDirtySurfaces()[0]?.dirtyTileIds).toEqual(
      dirtyBeforeRegister,
    );

    const complete = manager.uploadDirtySurfaceTextures({
      frame: 7,
      maxUploads: 3,
    });
    expect(complete).toMatchObject({
      budgetExhausted: false,
      remainingDirtySurfaceIds: [],
    });
  });
});
