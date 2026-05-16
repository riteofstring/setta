/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { HtmlSurfaceTextureManager } from "./textures";
import {
  createGpuTextureMock,
  installTextureUsage,
} from "./textures.test-helper";

function requireCommittedSurfaceTexture(
  manager: HtmlSurfaceTextureManager,
  surfaceId: string,
) {
  const record = manager.getCommittedSurfaceTexture(surfaceId);
  expect(record).toBeDefined();
  return record!;
}

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
    const committed = requireCommittedSurfaceTexture(manager, "node-a");
    expect(committed.texture).not.toBe(oldTexture);
    expect(committed).toMatchObject({
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

  it("reports committed and pending resolution descriptors separately", () => {
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

    expect(manager.getSurfaceTextureLifecycleDiagnostics(["node-a"])).toEqual([
      expect.objectContaining({
        committed: expect.objectContaining({
          pixelHeight: 100,
          pixelWidth: 100,
          resolutionScale: 1,
        }),
        pending: null,
        pendingResolution: expect.objectContaining({
          pixelHeight: 200,
          pixelWidth: 200,
          resolutionScale: 2,
        }),
        surfaceId: "node-a",
      }),
    ]);

    manager.uploadDirtySurfaceTextures({ frame: 4, maxUploads: 1 });

    expect(manager.getSurfaceTextureLifecycleDiagnostics(["node-a"])).toEqual([
      expect.objectContaining({
        committed: expect.objectContaining({
          pixelHeight: 100,
          pixelWidth: 100,
        }),
        pending: expect.objectContaining({
          dirtyResolution: true,
          pixelHeight: 200,
          pixelWidth: 200,
          tileCount: 4,
        }),
        pendingResolution: expect.objectContaining({
          pixelHeight: 200,
          pixelWidth: 200,
        }),
      }),
    ]);

    manager.uploadDirtySurfaceTextures({ frame: 5, maxUploads: 3 });

    expect(manager.getSurfaceTextureLifecycleDiagnostics(["node-a"])).toEqual([
      expect.objectContaining({
        committed: expect.objectContaining({
          dirtyContent: false,
          dirtyResolution: false,
          lastUploadFrame: 5,
          pixelHeight: 200,
          pixelWidth: 200,
          tileCount: 4,
        }),
        pending: null,
        pendingResolution: null,
      }),
    ]);
  });

  it("keeps committed dimensions stable while a resized descriptor is pending", () => {
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

    manager.registerSurfaceTexture({
      cssHeight: 120,
      cssWidth: 100,
      devicePixelRatio: 1,
      element,
      frame: 3,
      surfaceId: "node-a",
      zoom: 1,
    });

    expect(record).toMatchObject({
      cssHeight: 100,
      cssWidth: 100,
      pixelHeight: 100,
      pixelWidth: 100,
    });
    expect(manager.getSurfaceTextureLifecycleDiagnostics(["node-a"])).toEqual([
      expect.objectContaining({
        committed: expect.objectContaining({
          cssHeight: 100,
          cssWidth: 100,
          pixelHeight: 100,
          pixelWidth: 100,
        }),
        pending: null,
        pendingResolution: expect.objectContaining({
          cssHeight: 120,
          cssWidth: 100,
          pixelHeight: 120,
          pixelWidth: 100,
        }),
      }),
    ]);

    manager.uploadDirtySurfaceTextures({ frame: 4, maxUploads: 1 });
    expect(requireCommittedSurfaceTexture(manager, "node-a")).toMatchObject({
      cssHeight: 120,
      cssWidth: 100,
      lastUploadFrame: 4,
      pixelHeight: 120,
      pixelWidth: 100,
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
