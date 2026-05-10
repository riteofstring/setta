import { describe, expect, it, vi } from "vitest";

import type { GpuRetainedContentScene } from "./retainedContentScene";
import {
  RetainedContentTexturePageManager,
  type RetainedContentTexturePageFrameSurface,
} from "./retainedContentTexturePageManager";
import type { RetainedTextureUploadSchedulerBudget } from "./retainedTextureUploadScheduler";

describe("RetainedContentTexturePageManager", () => {
  it("keeps the current LOD bucket stable while the viewport is moving", () => {
    const fixture = createManagerFixture();

    expect(
      fixture.manager.resolveFrameViewportZoomBucket({
        viewportInteractionActive: false,
        zoom: 0.6,
      }),
    ).toBe(0.75);
    expect(
      fixture.manager.resolveFrameViewportZoomBucket({
        viewportInteractionActive: true,
        zoom: 3,
      }),
    ).toBe(0.75);
    expect(
      fixture.manager.resolveFrameViewportZoomBucket({
        viewportInteractionActive: false,
        zoom: 3,
      }),
    ).toBe(3);
  });

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

    const firstFrame = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });

    expect(firstFrame.uploadCount).toBe(1);
    expect(firstFrame.budgetExhausted).toBe(true);
    expect(firstFrame.flatSurfaces).toHaveLength(0);
    expect(firstFrame.missingPageCount).toBe(4);
    expect(fixture.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);

    const secondFrame = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });

    expect(secondFrame.uploadCount).toBe(1);
    expect(secondFrame.flatSurfaces).toHaveLength(1);
    expect(secondFrame.missingPageCount).toBe(3);
    expect(fixture.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
  });

  it("pauses LOD uploads during viewport interaction", () => {
    const fixture = createManagerFixture({ maxPagePixelSize: 50 });
    const result = renderFrame(fixture.manager, {
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

  it("requests a follow-up frame for committed coverage without reporting budget pressure", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 4,
      },
      maxPagePixelSize: 100,
    });

    const result = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [createFrameSurface()],
      viewportZoomBucket: 1,
    });

    expect(result.uploadCount).toBe(1);
    expect(result.budgetExhausted).toBe(false);
    expect(result.needsFollowUpFrame).toBe(true);
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

    renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    const zoomFrame = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [surface],
      viewportInteractionActive: true,
      viewportZoomBucket: 2,
    });

    expect(zoomFrame.uploadCount).toBe(0);
    expect(zoomFrame.flatSurfaces).toHaveLength(2);
    expect(zoomFrame.missingPageCount).toBe(4);
    expect(
      zoomFrame.flatSurfaces.map((surfaceVisual) => surfaceVisual.surfaceId),
    ).toEqual([
      "surface-a:1:0:0:100:100:0:0:100:100:scale=1:0:100:100:0:0",
      "surface-a:1:0:0:100:100:0:0:100:100:scale=1:0:100:100:0:0",
    ]);
  });

  it("queues bounded content invalidation without deleting committed fallback", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 4,
      },
      maxPagePixelSize: 100,
    });
    const surface = createFrameSurface();

    renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    const queued = fixture.manager.markSurfaceContentDirty({
      frame: 2,
      sourceRect: { height: 20, width: 20, x: 0, y: 0 },
      surfaceId: "surface-a",
    });
    const result = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [surface],
      viewportInteractionActive: true,
      viewportZoomBucket: 1,
    });

    expect(queued).toBe(true);
    expect(result.uploadCount).toBe(1);
    expect(result.flatSurfaces).toHaveLength(1);
    expect(result.flatSurfaces[0]?.surfaceId).toBe(
      "surface-a:1:0:0:100:100:0:0:100:100:scale=1:0:100:100:0:0",
    );
  });

  it("draws stale content pages while replacement content pages are pending", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 4,
      },
      maxPagePixelSize: 100,
    });
    const surface = createFrameSurface({ contentVersion: 1 });
    const replacementSurface = createFrameSurface({ contentVersion: 2 });

    renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    const replacementFrame = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [replacementSurface],
      viewportInteractionActive: true,
      viewportZoomBucket: 1,
    });

    expect(replacementFrame.uploadCount).toBe(0);
    expect(replacementFrame.flatSurfaces).toHaveLength(1);
    expect(replacementFrame.flatSurfaces[0]?.surfaceId).toBe(
      "surface-a:1:0:0:100:100:0:0:100:100:scale=1:0:100:100:0:0",
    );
    expect(replacementFrame.missingPageCount).toBe(1);
    expect(replacementFrame.uncoveredRectCount).toBe(0);
  });

  it("keeps unchanged row-segment pages exact when a neighboring row changes", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 4,
      },
      maxPagePixelSize: 24,
    });
    const surface = createFrameSurface({
      contentBoundsCss: { height: 48, width: 24, x: 0, y: 0 },
      contentSegments: [
        {
          contentVersion: 101,
          id: "row-a",
          rectCss: { height: 24, width: 24, x: 0, y: 0 },
        },
        {
          contentVersion: 202,
          id: "row-b",
          rectCss: { height: 24, width: 24, x: 0, y: 24 },
        },
      ],
      layout: {
        height: 48,
        surfaceId: "surface-a",
        textureSourceRect: { height: 48, width: 24, x: 0, y: 0 },
        width: 24,
        x: 10,
        y: 20,
      },
      sourceWindowCss: { height: 48, width: 24, x: 0, y: 0 },
      visibleSourceRectCss: { height: 48, width: 24, x: 0, y: 0 },
    });
    const changedSurface = createFrameSurface({
      ...surface,
      contentSegments: [
        {
          contentVersion: 303,
          id: "row-a",
          rectCss: { height: 24, width: 24, x: 0, y: 0 },
        },
        {
          contentVersion: 202,
          id: "row-b",
          rectCss: { height: 24, width: 24, x: 0, y: 24 },
        },
      ],
    });

    renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    const replacementFrame = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [changedSurface],
      viewportInteractionActive: true,
      viewportZoomBucket: 1,
    });

    expect(replacementFrame.uploadCount).toBe(0);
    expect(replacementFrame.drawQuadCount).toBe(2);
    expect(replacementFrame.fallbackDrawQuadCount).toBe(1);
    expect(replacementFrame.staleFallbackDrawQuadCount).toBe(1);
    expect(replacementFrame.missingPageCount).toBe(1);
    expect(replacementFrame.uncoveredRectCount).toBe(0);
  });

  it("reports row content as stale until the current row page is committed", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 4,
      },
      maxPagePixelSize: 24,
    });
    const rowRect = { height: 24, width: 24, x: 0, y: 0 };
    const surface = createFrameSurface({
      contentBoundsCss: { height: 48, width: 24, x: 0, y: 0 },
      contentSegments: [
        {
          contentVersion: 101,
          id: "row-a",
          rectCss: rowRect,
        },
        {
          contentVersion: 202,
          id: "row-b",
          rectCss: { height: 24, width: 24, x: 0, y: 24 },
        },
      ],
      layout: {
        height: 48,
        surfaceId: "surface-a",
        textureSourceRect: { height: 48, width: 24, x: 0, y: 0 },
        width: 24,
        x: 10,
        y: 20,
      },
      sourceWindowCss: { height: 48, width: 24, x: 0, y: 0 },
      visibleSourceRectCss: { height: 48, width: 24, x: 0, y: 0 },
    });
    const changedSurface = createFrameSurface({
      ...surface,
      contentSegments: [
        {
          contentVersion: 303,
          id: "row-a",
          rectCss: rowRect,
        },
        {
          contentVersion: 202,
          id: "row-b",
          rectCss: { height: 24, width: 24, x: 0, y: 24 },
        },
      ],
    });

    renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    expect(
      fixture.manager.hasFreshSurfaceContentForRect({
        sourceRect: rowRect,
        surfaceId: "surface-a",
      }),
    ).toBe(true);

    renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [changedSurface],
      viewportInteractionActive: true,
      viewportZoomBucket: 1,
    });
    expect(
      fixture.manager.hasFreshSurfaceContentForRect({
        sourceRect: rowRect,
        surfaceId: "surface-a",
      }),
    ).toBe(false);

    fixture.manager.markSurfaceContentDirty({
      frame: 3,
      priority: "interactive",
      sourceRect: rowRect,
      surfaceId: "surface-a",
    });
    const refreshedFrame = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 3,
      surfaces: [changedSurface],
      viewportInteractionActive: true,
      viewportZoomBucket: 1,
    });

    expect(refreshedFrame.uploadCount).toBe(1);
    expect(
      fixture.manager.hasFreshSurfaceContentForRect({
        sourceRect: rowRect,
        surfaceId: "surface-a",
      }),
    ).toBe(true);
  });

  it("retires replaced page resources until submitted GPU work completes", async () => {
    const submittedWork = createDeferred<void>();
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 4,
      },
      maxPagePixelSize: 100,
      onSubmittedWorkDone: vi.fn(() => submittedWork.promise),
    });
    const surface = createFrameSurface();

    renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    fixture.manager.markSurfaceContentDirty({
      frame: 2,
      sourceRect: { height: 20, width: 20, x: 0, y: 0 },
      surfaceId: "surface-a",
    });
    const result = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });

    expect(result.memory.retiredCount).toBe(1);
    expect(result.memory.retiredBytes).toBe(100 * 100 * 4);
    expect(fixture.textures[0]?.destroy).not.toHaveBeenCalled();
    expect(fixture.queue.onSubmittedWorkDone).toHaveBeenCalledTimes(1);

    submittedWork.resolve();
    await submittedWork.promise;
    await Promise.resolve();

    expect(fixture.textures[0]?.destroy).toHaveBeenCalledTimes(1);
    expect(fixture.textures[1]?.destroy).not.toHaveBeenCalled();
  });

  it("plans the submitted frame before uploading refinements", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 4,
      },
      maxPagePixelSize: 100,
    });
    const surface = createFrameSurface();

    const preparedFrame = fixture.manager.prepareFrame({
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    const maintenance = fixture.manager.runPostSubmitMaintenance({
      preparedFrame,
    });

    expect(preparedFrame.flatSurfaces).toHaveLength(0);
    expect(preparedFrame.missingPageCount).toBe(1);
    expect(maintenance.uploadCount).toBe(1);
    expect(maintenance.budgetExhausted).toBe(false);
    expect(maintenance.needsFollowUpFrame).toBe(true);

    const nextPreparedFrame = fixture.manager.prepareFrame({
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    expect(nextPreparedFrame.flatSurfaces).toHaveLength(1);
    expect(nextPreparedFrame.missingPageCount).toBe(0);
  });

  it("uploads retained content pages without waiting for row text source elements", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 4,
      },
      maxPagePixelSize: 100,
    });

    const result = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [createFrameSurface()],
      viewportZoomBucket: 1,
    });

    expect(result.uploadCount).toBe(1);
    expect(fixture.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
    expect(fixture.queue.copyElementImageToTexture).not.toHaveBeenCalled();
  });
});

function renderFrame(
  manager: RetainedContentTexturePageManager,
  {
    darkMode = false,
    devicePixelRatio,
    frame,
    surfaces,
    viewportInteractionActive = false,
    viewportZoomBucket,
  }: {
    readonly darkMode?: boolean | undefined;
    readonly devicePixelRatio: number;
    readonly frame: number;
    readonly surfaces: readonly RetainedContentTexturePageFrameSurface[];
    readonly viewportInteractionActive?: boolean | undefined;
    readonly viewportZoomBucket: number;
  },
) {
  const preparedFrame = manager.prepareFrame({
    devicePixelRatio,
    frame,
    surfaces,
    viewportZoomBucket,
  });
  const maintenanceInput = {
    darkMode,
    preparedFrame,
    viewportInteractionActive,
  };
  const maintenance = manager.runPostSubmitMaintenance(maintenanceInput);
  return {
    ...maintenance,
    flatSurfaces: preparedFrame.flatSurfaces,
    missingPageCount: preparedFrame.missingPageCount,
  };
}

function createManagerFixture({
  budget,
  maxPagePixelSize = 100,
  onSubmittedWorkDone,
}: {
  readonly budget?: Partial<RetainedTextureUploadSchedulerBudget> | undefined;
  readonly maxPagePixelSize?: number | undefined;
  readonly onSubmittedWorkDone?: (() => Promise<void>) | undefined;
} = {}) {
  const textures: Array<{
    readonly createView: ReturnType<typeof vi.fn>;
    readonly destroy: ReturnType<typeof vi.fn>;
  }> = [];
  const queue = {
    copyElementImageToTexture: vi.fn(),
    copyExternalImageToTexture: vi.fn(),
    ...(onSubmittedWorkDone === undefined ? {} : { onSubmittedWorkDone }),
    submit: vi.fn(),
    writeBuffer: vi.fn(),
  };
  const device = {
    createSampler: vi.fn(() => ({}) as GPUSampler),
    createTexture: vi.fn(() => {
      const texture = {
        createView: vi.fn(() => ({}) as GPUTextureView),
        destroy: vi.fn(),
      };
      textures.push(texture);
      return texture;
    }),
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
  return { manager, queue, textures };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
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

function createFrameSurface(
  overrides: Partial<RetainedContentTexturePageFrameSurface> = {},
): RetainedContentTexturePageFrameSurface {
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
    sourceWindowCss: { height: 100, width: 100, x: 0, y: 0 },
    surfaceId: "surface-a",
    visibleSourceRectCss: { height: 100, width: 100, x: 0, y: 0 },
    ...overrides,
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
