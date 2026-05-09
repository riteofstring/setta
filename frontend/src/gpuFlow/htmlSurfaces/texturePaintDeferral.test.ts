/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

import { HtmlSurfaceTextureManager } from "./textures";
import {
  createGpuTextureMock,
  installTextureUsage,
  registerNode,
} from "./textures.helpers.test";

describe("HTML surface texture paint deferral", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps paint-deferred dirty surfaces out of uploads until the source paints", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    registerNode(manager, "live", "visible");
    manager.uploadDirtySurfaceTextures({ frame: 1 });
    manager.markSurfaceTextureDirty({
      content: true,
      deferUploadUntilPaint: true,
      frame: 2,
      reason: "content",
      surfaceId: "live",
    });

    const deferred = manager.uploadDirtySurfaceTextures({ frame: 3 });
    expect(deferred).toMatchObject({
      budgetExhausted: false,
      remainingDirtySurfaceIds: ["live"],
      uploaded: [],
    });
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);

    const stillDeferred = manager.uploadDirtySurfaceTextures({ frame: 4 });
    expect(stillDeferred).toMatchObject({
      budgetExhausted: false,
      remainingDirtySurfaceIds: ["live"],
      uploaded: [],
    });
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);

    manager.markSurfacesPainted(["live"]);

    const uploaded = manager.uploadDirtySurfaceTextures({ frame: 5 });
    expect(uploaded.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "live",
    ]);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(2);
  });

  it("lets post-paint deferred dirty surfaces continue through the upload budget", () => {
    installTextureUsage();
    const gpu = createGpuTextureMock();
    const manager = new HtmlSurfaceTextureManager(gpu.device);

    registerNode(manager, "first", "visible");
    registerNode(manager, "second", "visible");
    manager.uploadDirtySurfaceTextures({ frame: 1 });
    manager.markSurfaceTextureDirty({
      content: true,
      deferUploadUntilPaint: true,
      frame: 2,
      reason: "content",
      surfaceId: "first",
    });
    manager.markSurfaceTextureDirty({
      content: true,
      deferUploadUntilPaint: true,
      frame: 2,
      reason: "content",
      surfaceId: "second",
    });
    manager.markSurfacesPainted(["first", "second"]);

    const firstUpload = manager.uploadDirtySurfaceTextures({
      frame: 3,
      maxUploads: 1,
    });
    expect(firstUpload.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "first",
    ]);

    const secondUpload = manager.uploadDirtySurfaceTextures({ frame: 4 });
    expect(secondUpload.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "second",
    ]);
  });
});
