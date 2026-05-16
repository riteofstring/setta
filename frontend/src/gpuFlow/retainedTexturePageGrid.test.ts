import { describe, expect, it } from "vitest";

import {
  createRetainedTexturePageDescriptors,
  createRetainedTexturePageDrawQuads,
  resolveRetainedTexturePageCoverage,
} from "./retainedTexturePageGrid";
import {
  RetainedTexturePageCache,
  retainedTexturePageLodLevel,
  retainedTexturePageScaleKey,
  type RetainedTexturePageDescriptor,
} from "./retainedTexturePages";

const SOURCE_WINDOW = { height: 256, width: 256, x: 0, y: 0 };
const PAGE_IDENTITY = {
  devicePixelRatioBucket: 1,
  sourceKey: "source-a",
  sourceVersion: 1,
  viewportZoomBucket: 1,
};

function page(
  overrides: Partial<RetainedTexturePageDescriptor> = {},
): RetainedTexturePageDescriptor {
  const lodScale = overrides.lodScale ?? 1;
  return {
    contentVersion: 1,
    devicePixelRatioBucket: 1,
    lodLevel: retainedTexturePageLodLevel(lodScale),
    lodScale,
    pixelHeight: 128,
    pixelWidth: 128,
    scaleKey: retainedTexturePageScaleKey(lodScale),
    sourceKey: "source-a",
    sourceRectCss: { height: 128, width: 128, x: 0, y: 0 },
    sourceVersion: 1,
    sourceWindowCss: SOURCE_WINDOW,
    surfaceId: "surface",
    tileColumn: 0,
    tileRow: 0,
    viewportZoomBucket: 1,
    ...overrides,
  };
}

describe("createRetainedTexturePageDescriptors", () => {
  it("creates stable page descriptors covering the visible CSS source rect", () => {
    const descriptors = createRetainedTexturePageDescriptors({
      contentBoundsCss: { height: 256, width: 256, x: 0, y: 0 },
      contentVersion: 2,
      ...PAGE_IDENTITY,
      lodScale: 2,
      maxPagePixelSize: 128,
      sourceWindowCss: SOURCE_WINDOW,
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
        ...PAGE_IDENTITY,
        lodScale: 2,
        maxPagePixelSize: 128,
        sourceWindowCss: SOURCE_WINDOW,
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
        ...PAGE_IDENTITY,
        lodScale: 1,
        maxPagePixelSize: 64,
        sourceWindowCss: SOURCE_WINDOW,
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
      descriptor: page({
        lodScale: 1,
        lodLevel: retainedTexturePageLodLevel(1),
        pixelHeight: 256,
        pixelWidth: 256,
        scaleKey: retainedTexturePageScaleKey(1),
        sourceRectCss: { height: 256, width: 256, x: 0, y: 0 },
      }),
      resource: "fallback",
    });
    const desiredPages = createRetainedTexturePageDescriptors({
      contentBoundsCss: { height: 256, width: 256, x: 0, y: 0 },
      contentVersion: 1,
      ...PAGE_IDENTITY,
      lodScale: 4,
      maxPagePixelSize: 128,
      sourceWindowCss: SOURCE_WINDOW,
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

  it("does not use stale content pages as fallback while current content pages are pending", () => {
    const cache = new RetainedTexturePageCache<string>();
    cache.commitPage({
      descriptor: page({
        contentVersion: 1,
        lodScale: 1,
        lodLevel: retainedTexturePageLodLevel(1),
        pixelHeight: 256,
        pixelWidth: 256,
        scaleKey: retainedTexturePageScaleKey(1),
        sourceRectCss: { height: 256, width: 256, x: 0, y: 0 },
      }),
      resource: "previous-content",
    });
    const desiredPages = createRetainedTexturePageDescriptors({
      contentBoundsCss: { height: 256, width: 256, x: 0, y: 0 },
      contentVersion: 2,
      ...PAGE_IDENTITY,
      lodScale: 2,
      maxPagePixelSize: 128,
      sourceWindowCss: SOURCE_WINDOW,
      surfaceId: "surface",
      visibleSourceRectCss: { height: 64, width: 64, x: 64, y: 64 },
    });

    expect(
      resolveRetainedTexturePageCoverage({
        cache,
        desiredPages,
        usedFrame: 12,
      }),
    ).toEqual(
      expect.objectContaining({
        drawQuads: [],
        refinementDescriptors: desiredPages,
        uncoveredRectsCss: [{ height: 64, width: 64, x: 64, y: 64 }],
      }),
    );
  });

  it("uses committed same-surface content pages from previous scroll windows as fallback", () => {
    const cache = new RetainedTexturePageCache<string>();
    cache.commitPage({
      descriptor: page({
        sourceRectCss: { height: 256, width: 256, x: 0, y: 0 },
        sourceWindowCss: { height: 256, width: 256, x: 0, y: 0 },
      }),
      resource: "previous-scroll-window",
    });
    const desiredPages = createRetainedTexturePageDescriptors({
      contentBoundsCss: { height: 256, width: 256, x: 0, y: 0 },
      contentVersion: 1,
      ...PAGE_IDENTITY,
      lodScale: 2,
      maxPagePixelSize: 128,
      sourceWindowCss: { height: 256, width: 256, x: 0, y: 48 },
      surfaceId: "surface",
      visibleSourceRectCss: { height: 64, width: 64, x: 64, y: 64 },
    });

    expect(
      resolveRetainedTexturePageCoverage({
        cache,
        desiredPages,
      }),
    ).toEqual(
      expect.objectContaining({
        drawQuads: [
          expect.objectContaining({
            fallback: true,
            page: expect.objectContaining({
              resource: "previous-scroll-window",
            }),
            sampleRectCss: { height: 64, width: 64, x: 64, y: 64 },
          }),
        ],
        uncoveredRectsCss: [],
      }),
    );
  });

  it("uses committed content pages as fallback when zoom changes the source window size", () => {
    const cache = new RetainedTexturePageCache<string>();
    cache.commitPage({
      descriptor: page({
        lodScale: 1,
        lodLevel: retainedTexturePageLodLevel(1),
        pixelHeight: 256,
        pixelWidth: 256,
        scaleKey: retainedTexturePageScaleKey(1),
        sourceRectCss: { height: 256, width: 256, x: 0, y: 0 },
        sourceWindowCss: { height: 512, width: 512, x: 0, y: 0 },
      }),
      resource: "compatible-content",
    });
    const desiredPages = createRetainedTexturePageDescriptors({
      contentBoundsCss: { height: 256, width: 256, x: 0, y: 0 },
      contentVersion: 1,
      ...PAGE_IDENTITY,
      lodScale: 2,
      maxPagePixelSize: 128,
      sourceWindowCss: { height: 256, width: 256, x: 0, y: 0 },
      surfaceId: "surface",
      visibleSourceRectCss: { height: 64, width: 64, x: 64, y: 64 },
    });

    expect(
      resolveRetainedTexturePageCoverage({
        cache,
        desiredPages,
      }),
    ).toEqual(
      expect.objectContaining({
        drawQuads: [
          expect.objectContaining({
            fallback: true,
            page: expect.objectContaining({ resource: "compatible-content" }),
            sampleRectCss: { height: 64, width: 64, x: 64, y: 64 },
          }),
        ],
        uncoveredRectsCss: [],
      }),
    );
  });

  it("merges adjacent fallback quads that sample the same committed page", () => {
    const cache = new RetainedTexturePageCache<string>();
    cache.commitPage({
      descriptor: page({
        lodScale: 1,
        pixelHeight: 64,
        pixelWidth: 256,
        sourceRectCss: { height: 64, width: 256, x: 0, y: 0 },
      }),
      resource: "wide-page",
    });
    const desiredPages = createRetainedTexturePageDescriptors({
      contentBoundsCss: { height: 64, width: 256, x: 0, y: 0 },
      contentVersion: 1,
      ...PAGE_IDENTITY,
      lodScale: 2,
      maxPagePixelSize: 128,
      sourceWindowCss: SOURCE_WINDOW,
      surfaceId: "surface",
      visibleSourceRectCss: { height: 64, width: 128, x: 0, y: 0 },
    });

    expect(
      resolveRetainedTexturePageCoverage({
        cache,
        desiredPages,
      }),
    ).toEqual(
      expect.objectContaining({
        drawQuads: [
          expect.objectContaining({
            fallback: true,
            page: expect.objectContaining({ resource: "wide-page" }),
            sampleRectCss: { height: 64, width: 128, x: 0, y: 0 },
          }),
        ],
        mergedDrawQuadCount: 1,
        uncoveredRectsCss: [],
      }),
    );
  });

  it("uses higher LOD committed pages as fallback for desired low LOD pages", () => {
    const cache = new RetainedTexturePageCache<string>();
    const highLodPages = [
      {
        sourceRectCss: { height: 128, width: 128, x: 0, y: 0 },
        tileColumn: 0,
        tileRow: 0,
        resource: "top-left",
      },
      {
        sourceRectCss: { height: 128, width: 128, x: 128, y: 0 },
        tileColumn: 1,
        tileRow: 0,
        resource: "top-right",
      },
      {
        sourceRectCss: { height: 128, width: 128, x: 0, y: 128 },
        tileColumn: 0,
        tileRow: 1,
        resource: "bottom-left",
      },
      {
        sourceRectCss: { height: 128, width: 128, x: 128, y: 128 },
        tileColumn: 1,
        tileRow: 1,
        resource: "bottom-right",
      },
    ] as const;
    for (const highLodPage of highLodPages) {
      cache.commitPage({
        descriptor: page({
          lodScale: 1,
          pixelHeight: 128,
          pixelWidth: 128,
          sourceRectCss: highLodPage.sourceRectCss,
          tileColumn: highLodPage.tileColumn,
          tileRow: highLodPage.tileRow,
        }),
        resource: highLodPage.resource,
      });
    }
    const desiredPages = createRetainedTexturePageDescriptors({
      contentBoundsCss: { height: 256, width: 256, x: 0, y: 0 },
      contentVersion: 1,
      ...PAGE_IDENTITY,
      lodScale: 0.5,
      maxPagePixelSize: 128,
      sourceWindowCss: SOURCE_WINDOW,
      surfaceId: "surface",
      visibleSourceRectCss: { height: 128, width: 128, x: 64, y: 64 },
    });

    expect(
      resolveRetainedTexturePageCoverage({
        cache,
        desiredPages,
        usedFrame: 10,
      }),
    ).toEqual(
      expect.objectContaining({
        drawQuads: [
          expect.objectContaining({
            page: expect.objectContaining({ resource: "top-left" }),
          }),
          expect.objectContaining({
            page: expect.objectContaining({ resource: "top-right" }),
          }),
          expect.objectContaining({
            page: expect.objectContaining({ resource: "bottom-left" }),
          }),
          expect.objectContaining({
            page: expect.objectContaining({ resource: "bottom-right" }),
          }),
        ],
        uncoveredRectsCss: [],
      }),
    );
  });

  it("omits desired pages without a committed fallback", () => {
    const desiredPages = createRetainedTexturePageDescriptors({
      contentBoundsCss: { height: 128, width: 128, x: 0, y: 0 },
      contentVersion: 1,
      ...PAGE_IDENTITY,
      lodScale: 2,
      maxPagePixelSize: 128,
      sourceWindowCss: SOURCE_WINDOW,
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

  it("covers one target page from multiple committed fallback pages", () => {
    const cache = new RetainedTexturePageCache<string>();
    cache.commitPage({
      descriptor: page({
        sourceRectCss: { height: 64, width: 32, x: 0, y: 0 },
        tileColumn: 0,
      }),
      resource: "left",
    });
    cache.commitPage({
      descriptor: page({
        sourceRectCss: { height: 64, width: 32, x: 32, y: 0 },
        tileColumn: 1,
      }),
      resource: "right",
    });
    const desiredPages = createRetainedTexturePageDescriptors({
      contentBoundsCss: { height: 64, width: 64, x: 0, y: 0 },
      contentVersion: 1,
      ...PAGE_IDENTITY,
      lodScale: 2,
      maxPagePixelSize: 128,
      sourceWindowCss: SOURCE_WINDOW,
      surfaceId: "surface",
      visibleSourceRectCss: { height: 64, width: 64, x: 0, y: 0 },
    });

    expect(
      resolveRetainedTexturePageCoverage({
        cache,
        desiredPages,
        usedFrame: 8,
      }),
    ).toEqual(
      expect.objectContaining({
        drawQuads: [
          expect.objectContaining({
            page: expect.objectContaining({
              lastUsedFrame: 8,
              resource: "left",
            }),
            sampleRectCss: { height: 64, width: 32, x: 0, y: 0 },
          }),
          expect.objectContaining({
            page: expect.objectContaining({
              lastUsedFrame: 8,
              resource: "right",
            }),
            sampleRectCss: { height: 64, width: 32, x: 32, y: 0 },
          }),
        ],
        refinementDescriptors: desiredPages,
        uncoveredRectsCss: [],
      }),
    );
  });

  it("does not use committed pages from a different surface as fallback", () => {
    const cache = new RetainedTexturePageCache<string>();
    cache.commitPage({
      descriptor: page({
        sourceRectCss: { height: 64, width: 64, x: 0, y: 0 },
        sourceWindowCss: { height: 256, width: 256, x: 0, y: 128 },
        surfaceId: "other-surface",
      }),
      resource: "other-surface-window",
    });
    const desiredPages = createRetainedTexturePageDescriptors({
      contentBoundsCss: { height: 64, width: 64, x: 0, y: 0 },
      contentVersion: 1,
      ...PAGE_IDENTITY,
      lodScale: 2,
      maxPagePixelSize: 128,
      sourceWindowCss: SOURCE_WINDOW,
      surfaceId: "surface",
      visibleSourceRectCss: { height: 64, width: 64, x: 0, y: 0 },
    });

    expect(
      resolveRetainedTexturePageCoverage({
        cache,
        desiredPages,
      }),
    ).toEqual(
      expect.objectContaining({
        drawQuads: [],
        refinementDescriptors: desiredPages,
        uncoveredRectsCss: [{ height: 64, width: 64, x: 0, y: 0 }],
      }),
    );
  });
});
