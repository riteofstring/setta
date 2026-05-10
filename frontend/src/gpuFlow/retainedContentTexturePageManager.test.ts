import { describe, expect, it, vi } from "vitest";

import {
  RetainedContentTexturePageManager,
  type RetainedContentTexturePageFrameSurface,
} from "./retainedContentTexturePageManager";
import type { GpuRetainedContentScene } from "./retainedContentScene";
import type { RetainedTextureUploadSchedulerBudget } from "./retainedTextureUploadScheduler";

describe("RetainedContentTexturePageManager", () => {
  it("uploads visible pages within the configured upload budget", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 1,
      },
      maxPagePixelSize: 50,
    });
    const surface = createFrameSurface();

    const firstFrame = fixture.manager.renderFrame({
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });

    expect(firstFrame.uploadCount).toBe(1);
    expect(firstFrame.budgetExhausted).toBe(true);
    expect(firstFrame.flatSurfaces).toHaveLength(1);
    expect(firstFrame.missingPageCount).toBe(3);
    expect(fixture.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);

    const secondFrame = fixture.manager.renderFrame({
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });

    expect(secondFrame.uploadCount).toBe(1);
    expect(secondFrame.flatSurfaces).toHaveLength(2);
    expect(secondFrame.missingPageCount).toBe(2);
    expect(fixture.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
  });

  it("pauses LOD uploads during viewport interaction", () => {
    const fixture = createManagerFixture({ maxPagePixelSize: 50 });
    const result = fixture.manager.renderFrame({
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [createFrameSurface()],
      viewportInteractionActive: true,
      viewportZoomBucket: 1,
    });

    expect(result.uploadCount).toBe(0);
    expect(result.budgetExhausted).toBe(false);
    expect(result.flatSurfaces).toEqual([]);
    expect(result.missingPageCount).toBe(4);
    expect(fixture.queue.copyExternalImageToTexture).not.toHaveBeenCalled();
  });

  it("draws lower-LOD committed pages while sharper pages are pending", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 4,
      },
      maxPagePixelSize: 100,
    });
    const surface = createFrameSurface();

    fixture.manager.renderFrame({
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    const zoomFrame = fixture.manager.renderFrame({
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [surface],
      viewportInteractionActive: true,
      viewportZoomBucket: 2,
    });

    expect(zoomFrame.uploadCount).toBe(0);
    expect(zoomFrame.flatSurfaces).toHaveLength(4);
    expect(zoomFrame.missingPageCount).toBe(0);
    expect(
      zoomFrame.flatSurfaces.map((surfaceVisual) => surfaceVisual.surfaceId),
    ).toEqual([
      "surface-a:1:0:0:100:100:1:100:100:0:0",
      "surface-a:1:0:0:100:100:1:100:100:0:0",
      "surface-a:1:0:0:100:100:1:100:100:0:0",
      "surface-a:1:0:0:100:100:1:100:100:0:0",
    ]);
  });
});

function createManagerFixture({
  budget,
  maxPagePixelSize = 100,
}: {
  readonly budget?: Partial<RetainedTextureUploadSchedulerBudget> | undefined;
  readonly maxPagePixelSize?: number | undefined;
} = {}) {
  const queue = {
    copyExternalImageToTexture: vi.fn(),
    submit: vi.fn(),
    writeBuffer: vi.fn(),
  };
  const device = {
    createSampler: vi.fn(() => ({} as GPUSampler)),
    createTexture: vi.fn(() => ({
      createView: vi.fn(() => ({} as GPUTextureView)),
      destroy: vi.fn(),
    })),
    queue,
  } as unknown as GPUDevice;
  const scratchCanvas = createScratchCanvas();
  const ownerDocument = {
    createElement: vi.fn(() => scratchCanvas),
  } as unknown as Document;
  const manager = new RetainedContentTexturePageManager(device, ownerDocument, {
    budget,
    maxPagePixelSize,
    scratchCanvas,
    textureUsage: 1,
  });
  return { manager, queue };
}

function createScratchCanvas(): HTMLCanvasElement {
  const context = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
  };
  return {
    getContext: vi.fn(() => context),
    height: 0,
    width: 0,
  } as unknown as HTMLCanvasElement;
}

function createFrameSurface(): RetainedContentTexturePageFrameSurface {
  return {
    contentBoundsCss: { height: 100, width: 100, x: 0, y: 0 },
    contentVersion: 1,
    layout: {
      height: 100,
      surfaceId: "surface-a",
      textureSourceRect: { height: 100, width: 100, x: 0, y: 0 },
      width: 100,
      x: 10,
      y: 20,
    },
    rasterScene: createRasterScene(),
    surfaceId: "surface-a",
    visibleSourceRectCss: { height: 100, width: 100, x: 0, y: 0 },
  };
}

function createRasterScene(): GpuRetainedContentScene {
  return {
    contentRect: { height: 100, width: 100, x: 0, y: 0 },
    drawCommands: [],
    hitRecords: [],
    id: "scene-a",
    ownerSectionId: "section-a",
    portAnchors: [],
    rowHeight: 20,
    rowOrder: [],
    rows: [],
    scrollOffset: { x: 0, y: 0 },
    viewportRect: { height: 100, width: 100, x: 0, y: 0 },
    visibleRange: { endIndex: 0, rowCount: 0, startIndex: 0 },
  };
}
