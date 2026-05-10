import { describe, expect, it } from "vitest";

import type { HtmlSurfaceTextureResources } from "./htmlSurfaces/textureTiles";
import { createRetainedTexturePageFlatVisuals } from "./retainedTexturePageVisuals";
import {
  retainedTexturePageLodLevel,
  retainedTexturePageScaleKey,
  type CommittedRetainedTexturePage,
  type RetainedTexturePageDescriptor,
} from "./retainedTexturePages";

const RESOURCE = {
  sampler: {} as GPUSampler,
  texture: {} as GPUTexture,
  textureView: {} as GPUTextureView,
} satisfies HtmlSurfaceTextureResources;

describe("createRetainedTexturePageFlatVisuals", () => {
  it("maps page source rects into flow-space quads with page UVs", () => {
    const page = createCommittedPage({
      sourceRectCss: { height: 100, width: 100, x: 0, y: 0 },
    });

    const visuals = createRetainedTexturePageFlatVisuals({
      drawQuads: [
        {
          desiredDescriptor: page.descriptor,
          page,
          sampleRectCss: { height: 10, width: 20, x: 70, y: 40 },
        },
      ],
      layout: {
        height: 50,
        surfaceId: "surface-a",
        textureSourceRect: { height: 50, width: 100, x: 20, y: 30 },
        width: 100,
        x: 200,
        y: 300,
        zIndex: 5,
      },
    });

    expect(visuals).toHaveLength(1);
    expect(visuals[0]).toMatchObject({
      height: 10,
      kind: "flat",
      surfaceId: page.key,
      textureCoordinates: { u0: 0.7, u1: 0.9, v0: 0.4, v1: 0.5 },
      width: 20,
      x: 250,
      y: 310,
      zIndex: 5,
    });
  });

  it("clips page visuals to the visible source rect", () => {
    const page = createCommittedPage({
      sourceRectCss: { height: 100, width: 100, x: 0, y: 0 },
    });

    const visuals = createRetainedTexturePageFlatVisuals({
      drawQuads: [
        {
          desiredDescriptor: page.descriptor,
          page,
          sampleRectCss: { height: 20, width: 40, x: 0, y: 0 },
        },
      ],
      layout: {
        height: 40,
        surfaceId: "surface-a",
        textureSourceRect: { height: 40, width: 40, x: 20, y: 10 },
        width: 40,
        x: 100,
        y: 200,
      },
    });

    expect(visuals).toHaveLength(1);
    expect(visuals[0]).toMatchObject({
      height: 10,
      textureCoordinates: { u0: 0.2, u1: 0.4, v0: 0.1, v1: 0.2 },
      width: 20,
      x: 100,
      y: 200,
    });
  });

  it("omits page visuals outside the visible source rect", () => {
    const page = createCommittedPage({
      sourceRectCss: { height: 100, width: 100, x: 0, y: 0 },
    });

    const visuals = createRetainedTexturePageFlatVisuals({
      drawQuads: [
        {
          desiredDescriptor: page.descriptor,
          page,
          sampleRectCss: { height: 10, width: 10, x: 0, y: 0 },
        },
      ],
      layout: {
        height: 40,
        surfaceId: "surface-a",
        textureSourceRect: { height: 40, width: 40, x: 20, y: 10 },
        width: 40,
        x: 100,
        y: 200,
      },
    });

    expect(visuals).toEqual([]);
  });
});

function createCommittedPage(
  descriptorUpdates: Partial<RetainedTexturePageDescriptor>,
): CommittedRetainedTexturePage<HtmlSurfaceTextureResources> {
  const descriptor: RetainedTexturePageDescriptor = {
    contentVersion: 1,
    lodLevel: retainedTexturePageLodLevel(2),
    lodScale: 2,
    pixelHeight: 200,
    pixelWidth: 200,
    scaleKey: retainedTexturePageScaleKey(2),
    sourceRectCss: { height: 100, width: 100, x: 0, y: 0 },
    sourceWindowCss: { height: 100, width: 100, x: 0, y: 0 },
    surfaceId: "surface-a",
    tileColumn: 0,
    tileRow: 0,
    ...descriptorUpdates,
  };
  return {
    byteSize: descriptor.pixelHeight * descriptor.pixelWidth * 4,
    committedFrame: 10,
    descriptor,
    key: "surface-a:page",
    lastUsedFrame: 11,
    resource: RESOURCE,
  };
}
