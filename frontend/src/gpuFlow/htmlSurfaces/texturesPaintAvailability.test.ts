/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isMissingElementPaintRecordError } from "./textureManagerHelpers";
import { HtmlSurfaceTextureManager } from "./textures";
import {
  createGpuTextureMock,
  createHtmlInCanvasCanvas,
  installTextureUsage,
} from "./textures.test-helper";

describe("HtmlSurfaceTextureManager paint availability", () => {
  beforeEach(() => {
    installTextureUsage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps dirty surfaces queued when Chromium rejects a not-yet-paintable layoutsubtree child", () => {
    const gpu = createGpuTextureMock();
    const canvas = createHtmlInCanvasCanvas();
    const manager = new HtmlSurfaceTextureManager(gpu.device, { canvas });
    const element = document.createElement("div");
    gpu.copyElementImageToTexture.mockImplementationOnce(() => {
      throw new DOMException(
        "Only immediate children of the <canvas> element can be passed to copyElementImageToTexture().",
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

    expect(deferred.workSummary).toEqual(
      expect.objectContaining({
        noUploadReason: "paint-unavailable",
        paintUnavailableSurfaceCount: 1,
      }),
    );
    expect(deferred.uploaded).toEqual([]);
    expect(canvas.requestPaint).toHaveBeenCalledTimes(2);

    const waitingForPaint = manager.uploadDirtySurfaceTextures({ frame: 3 });
    expect(waitingForPaint.workSummary).toEqual(
      expect.objectContaining({
        noUploadReason: "all-work-deferred",
      }),
    );
    expect(waitingForPaint.uploaded).toEqual([]);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(1);

    manager.markSurfacesPainted(["node-a"]);
    const uploaded = manager.uploadDirtySurfaceTextures({ frame: 4 });
    expect(uploaded.uploaded.map((surface) => surface.surfaceId)).toEqual([
      "node-a",
    ]);
    expect(gpu.copyElementImageToTexture).toHaveBeenCalledTimes(2);
  });

  it("recognizes cross-realm Chromium paint-record errors", () => {
    expect(
      isMissingElementPaintRecordError({
        message:
          "Only immediate children of the <canvas> element can be passed to copyElementImageToTexture().",
        name: "InvalidStateError",
      }),
    ).toBe(true);
    expect(
      isMissingElementPaintRecordError({
        message:
          "Failed to execute 'copyElementImageToTexture' on 'GPUQueue': Only immediate children of the <canvas> element can be passed to copyElementImageToTexture().",
        name: "TypeError",
      }),
    ).toBe(true);
  });
});
