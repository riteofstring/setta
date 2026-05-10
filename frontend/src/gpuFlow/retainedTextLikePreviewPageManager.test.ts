import { describe, expect, it, vi } from "vitest";

import type { HtmlSurfaceTextureResources } from "./htmlSurfaces/textureTiles";
import {
  RetainedTextLikePreviewPageManager,
  type RetainedTextLikePreviewPageFrameSurface,
} from "./retainedTextLikePreviewPageManager";
import type { RetainedTexturePageDrawQuad } from "./retainedTexturePageGrid";
import {
  estimatePageByteSize,
  retainedTexturePageKey,
  retainedTexturePageLodLevel,
  retainedTexturePageScaleKey,
  type CommittedRetainedTexturePage,
  type RetainedTexturePageDescriptor,
} from "./retainedTexturePages";

describe("RetainedTextLikePreviewPageManager", () => {
  it("draws preview pixels only for the retained base page generation selected for the frame", () => {
    const fixture = createManagerFixture();
    const surface = createPreviewSurface();
    const baseDescriptor = createDescriptor({ surfaceId: "surface-a" });
    const baseDrawQuad = createBaseDrawQuad(baseDescriptor);
    const firstFrame = fixture.manager.prepareFrame({
      baseDrawQuads: [baseDrawQuad],
      baseTargetDescriptors: [baseDescriptor],
      frame: 1,
      surfaces: [surface],
    });

    expect(firstFrame.flatSurfaces).toEqual([]);
    expect(firstFrame.missingPageCount).toBe(1);
    expect(firstFrame.omittedPreviewCount).toBe(1);

    const maintenance = fixture.manager.runPostSubmitMaintenance({
      elementBySourceId: new Map([[surface.sourceId, createSourceElement()]]),
      preparedFrame: firstFrame,
    });
    expect(maintenance.uploadCount).toBe(1);
    expect(fixture.queue.copyElementImageToTexture).toHaveBeenCalledTimes(1);

    const currentFrame = fixture.manager.prepareFrame({
      baseDrawQuads: [baseDrawQuad],
      baseTargetDescriptors: [baseDescriptor],
      frame: 2,
      surfaces: [surface],
    });
    expect(currentFrame.flatSurfaces).toHaveLength(1);
    expect(currentFrame.missingPageCount).toBe(0);
    expect(currentFrame.omittedPreviewCount).toBe(0);

    const staleDescriptor = createDescriptor({
      sourceWindowCss: { height: 100, width: 100, x: 0, y: 60 },
      surfaceId: "surface-a",
    });
    const staleBaseDrawQuad = createBaseDrawQuad(staleDescriptor);
    const staleFrame = fixture.manager.prepareFrame({
      baseDrawQuads: [staleBaseDrawQuad],
      baseTargetDescriptors: [baseDescriptor],
      frame: 3,
      surfaces: [surface],
    });

    expect(staleFrame.flatSurfaces).toEqual([]);
    expect(staleFrame.missingPageCount).toBe(0);
    expect(staleFrame.omittedPreviewCount).toBe(1);
  });
});

function createManagerFixture() {
  const queue = {
    copyElementImageToTexture: vi.fn(),
    submit: vi.fn(),
    writeBuffer: vi.fn(),
  };
  const device = {
    createSampler: vi.fn(() => ({}) as GPUSampler),
    createTexture: vi.fn(
      () =>
        ({
          createView: vi.fn(() => ({}) as GPUTextureView),
          destroy: vi.fn(),
        }) as unknown as GPUTexture,
    ),
    queue,
  } as unknown as GPUDevice;
  const manager = new RetainedTextLikePreviewPageManager(device, {
    budget: {
      maxFrameUploadedBytes: 1_000_000,
      maxTextureMemoryBytes: 10_000_000,
      maxUploads: 4,
    },
    textureUsage: 1,
  });
  return { manager, queue };
}

function createPreviewSurface(): RetainedTextLikePreviewPageFrameSurface {
  return {
    contentBoundsCss: { height: 100, width: 100, x: 0, y: 0 },
    layout: {
      height: 100,
      surfaceId: "retained-text-like-preview-page:surface-a",
      textureSourceRect: { height: 100, width: 100, x: 0, y: 0 },
      width: 100,
      x: 10,
      y: 20,
      zIndex: 2,
    },
    sourceId: "retained-text-like-preview-page:surface-a",
    sourceKey: "preview-key",
    sourceWindowCss: { height: 100, width: 100, x: 0, y: 0 },
    surfaceId: "surface-a",
    visibleSourceRectCss: { height: 100, width: 100, x: 0, y: 0 },
  };
}

function createDescriptor(
  overrides: Partial<RetainedTexturePageDescriptor> = {},
): RetainedTexturePageDescriptor {
  const lodScale = overrides.lodScale ?? 1;
  return {
    contentVersion: 1,
    lodLevel: retainedTexturePageLodLevel(lodScale),
    lodScale,
    pixelHeight: 100,
    pixelWidth: 100,
    scaleKey: retainedTexturePageScaleKey(lodScale),
    sourceRectCss: { height: 100, width: 100, x: 0, y: 0 },
    sourceWindowCss: { height: 100, width: 100, x: 0, y: 0 },
    surfaceId: "surface-a",
    tileColumn: 0,
    tileRow: 0,
    ...overrides,
  };
}

function createBaseDrawQuad(
  descriptor: RetainedTexturePageDescriptor,
): RetainedTexturePageDrawQuad<HtmlSurfaceTextureResources> {
  const page: CommittedRetainedTexturePage<HtmlSurfaceTextureResources> = {
    byteSize: estimatePageByteSize(descriptor),
    committedFrame: 1,
    descriptor,
    key: retainedTexturePageKey(descriptor),
    lastUsedFrame: 1,
    resource: {
      sampler: {} as GPUSampler,
      texture: {} as GPUTexture,
      textureView: {} as GPUTextureView,
    },
  };
  return {
    desiredDescriptor: descriptor,
    fallback: false,
    page,
    sampleRectCss: descriptor.sourceRectCss,
    staleContent: false,
  };
}

function createSourceElement(): HTMLElement {
  return {
    dataset: {
      gpuFlowRetainedTextLikePreviewSourceKey: "preview-key",
    },
  } as unknown as HTMLElement;
}
