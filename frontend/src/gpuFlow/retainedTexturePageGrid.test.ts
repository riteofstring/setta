import { describe, expect, it } from "vitest";

import {
  createRetainedTexturePageDescriptors,
  createRetainedTexturePageDrawQuads,
} from "./retainedTexturePageGrid";
import { RetainedTexturePageCache } from "./retainedTexturePages";

describe("createRetainedTexturePageDescriptors", () => {
  it("creates stable page descriptors covering the visible CSS source rect", () => {
    const descriptors = createRetainedTexturePageDescriptors({
      contentBoundsCss: { height: 256, width: 256, x: 0, y: 0 },
      contentVersion: 2,
      lodScale: 2,
      maxPagePixelSize: 128,
      surfaceId: "surface",
      visibleSourceRectCss: { height: 80, width: 96, x: 48, y: 56 },
    });

    expect(descriptors).toEqual([
      expect.objectContaining({
        pixelHeight: 128,
        pixelWidth: 128,
        sourceRectCss: { height: 64, width: 64, x: 0, y: 0 },
        tileColumn: 0,
        tileRow: 0,
      }),
      expect.objectContaining({
        sourceRectCss: { height: 64, width: 64, x: 64, y: 0 },
        tileColumn: 1,
        tileRow: 0,
      }),
      expect.objectContaining({
        sourceRectCss: { height: 64, width: 64, x: 128, y: 0 },
        tileColumn: 2,
        tileRow: 0,
      }),
      expect.objectContaining({
        sourceRectCss: { height: 64, width: 64, x: 0, y: 64 },
        tileColumn: 0,
        tileRow: 1,
      }),
      expect.objectContaining({
        sourceRectCss: { height: 64, width: 64, x: 64, y: 64 },
        tileColumn: 1,
        tileRow: 1,
      }),
      expect.objectContaining({
        sourceRectCss: { height: 64, width: 64, x: 128, y: 64 },
        tileColumn: 2,
        tileRow: 1,
      }),
      expect.objectContaining({
        sourceRectCss: { height: 64, width: 64, x: 0, y: 128 },
        tileColumn: 0,
        tileRow: 2,
      }),
      expect.objectContaining({
        sourceRectCss: { height: 64, width: 64, x: 64, y: 128 },
        tileColumn: 1,
        tileRow: 2,
      }),
      expect.objectContaining({
        sourceRectCss: { height: 64, width: 64, x: 128, y: 128 },
        tileColumn: 2,
        tileRow: 2,
      }),
    ]);
  });

  it("clips edge pages to content bounds", () => {
    expect(
      createRetainedTexturePageDescriptors({
        contentBoundsCss: { height: 150, width: 150, x: 0, y: 0 },
        contentVersion: 1,
        lodScale: 2,
        maxPagePixelSize: 128,
        surfaceId: "surface",
        visibleSourceRectCss: { height: 40, width: 40, x: 140, y: 140 },
      }),
    ).toEqual([
      expect.objectContaining({
        pixelHeight: 44,
        pixelWidth: 44,
        sourceRectCss: { height: 22, width: 22, x: 128, y: 128 },
        tileColumn: 2,
        tileRow: 2,
      }),
    ]);
  });

  it("returns no descriptors when the visible rect is outside content bounds", () => {
    expect(
      createRetainedTexturePageDescriptors({
        contentBoundsCss: { height: 100, width: 100, x: 0, y: 0 },
        contentVersion: 1,
        lodScale: 1,
        maxPagePixelSize: 64,
        surfaceId: "surface",
        visibleSourceRectCss: { height: 10, width: 10, x: 150, y: 150 },
      }),
    ).toEqual([]);
  });
});

describe("createRetainedTexturePageDrawQuads", () => {
  it("uses lower LOD committed pages as fallback for desired high LOD pages", () => {
    const cache = new RetainedTexturePageCache<string>();
    cache.commitPage({
      descriptor: {
        contentVersion: 1,
        lodScale: 1,
        pixelHeight: 256,
        pixelWidth: 256,
        sourceRectCss: { height: 256, width: 256, x: 0, y: 0 },
        surfaceId: "surface",
        tileColumn: 0,
        tileRow: 0,
      },
      resource: "fallback",
    });
    const desiredPages = createRetainedTexturePageDescriptors({
      contentBoundsCss: { height: 256, width: 256, x: 0, y: 0 },
      contentVersion: 1,
      lodScale: 4,
      maxPagePixelSize: 128,
      surfaceId: "surface",
      visibleSourceRectCss: { height: 32, width: 32, x: 64, y: 64 },
    });

    expect(
      createRetainedTexturePageDrawQuads({
        cache,
        desiredPages,
        usedFrame: 10,
      }),
    ).toEqual([
      expect.objectContaining({
        page: expect.objectContaining({
          lastUsedFrame: 10,
          resource: "fallback",
        }),
        sampleRectCss: { height: 32, width: 32, x: 64, y: 64 },
      }),
    ]);
  });

  it("omits desired pages without a committed fallback", () => {
    const desiredPages = createRetainedTexturePageDescriptors({
      contentBoundsCss: { height: 128, width: 128, x: 0, y: 0 },
      contentVersion: 1,
      lodScale: 2,
      maxPagePixelSize: 128,
      surfaceId: "surface",
      visibleSourceRectCss: { height: 64, width: 64, x: 0, y: 0 },
    });

    expect(
      createRetainedTexturePageDrawQuads({
        cache: new RetainedTexturePageCache<string>(),
        desiredPages,
      }),
    ).toEqual([]);
  });
});
