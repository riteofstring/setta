import { describe, expect, it, vi } from "vitest";

import type { HtmlInCanvasCanvas } from "./htmlInCanvasTypes";
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

  it("chunks common visible settings surfaces into bounded retained pages", () => {
    const fixture = createManagerFixture();
    const surface = createFrameSurface({
      contentBoundsCss: { height: 520, width: 680, x: 0, y: 0 },
      layout: {
        height: 520,
        surfaceId: "surface-a",
        textureSourceRect: { height: 520, width: 680, x: 0, y: 0 },
        width: 680,
        x: 10,
        y: 20,
      },
      sourceWindowCss: { height: 520, width: 680, x: 0, y: 0 },
      visibleSourceRectCss: { height: 520, width: 680, x: 0, y: 0 },
    });

    const firstPreparedFrame = fixture.manager.prepareFrame({
      devicePixelRatio: 2,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    const firstMaintenance = fixture.manager.runPostSubmitMaintenance({
      preparedFrame: firstPreparedFrame,
    });
    const secondPreparedFrame = fixture.manager.prepareFrame({
      devicePixelRatio: 2,
      frame: 2,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });

    expect(firstPreparedFrame.visibleRegionTargets).toHaveLength(1);
    expect(firstPreparedFrame.refinementDescriptors).toHaveLength(4);
    expect(firstMaintenance.uploadCount).toBe(1);
    expect(secondPreparedFrame.drawQuadCount).toBe(1);
    expect(secondPreparedFrame.flatSurfaces).toHaveLength(1);
  });

  it("packs retained pages into shared atlas textures for batched composition", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 4,
      },
      maxPagePixelSize: 100,
      maxTextureDimension2D: 204,
    });
    const surface = createFrameSurface({
      contentBoundsCss: { height: 100, width: 200, x: 0, y: 0 },
      layout: {
        height: 100,
        surfaceId: "surface-a",
        textureSourceRect: { height: 100, width: 200, x: 0, y: 0 },
        width: 200,
        x: 10,
        y: 20,
      },
      sourceWindowCss: { height: 100, width: 200, x: 0, y: 0 },
      visibleSourceRectCss: { height: 100, width: 200, x: 0, y: 0 },
    });

    renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    const preparedFrame = fixture.manager.prepareFrame({
      devicePixelRatio: 1,
      frame: 3,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });

    expect(fixture.textures).toHaveLength(1);
    expect(preparedFrame.drawQuadCount).toBe(2);
    expect(preparedFrame.flatSurfaces).toHaveLength(2);
    expect(
      new Set(
        preparedFrame.flatSurfaces.map(
          (surfaceVisual) => surfaceVisual.texture.texture,
        ),
      ).size,
    ).toBe(1);
    expect(
      new Set(
        preparedFrame.flatSurfaces.map(
          (surfaceVisual) => surfaceVisual.texture.textureContentKey,
        ),
      ).size,
    ).toBe(1);
    expect(
      preparedFrame.flatSurfaces.map(
        (surfaceVisual) => surfaceVisual.textureCoordinates,
      ),
    ).toEqual([
      {
        u0: 1 / 204,
        u1: 101 / 204,
        v0: 1 / 204,
        v1: 101 / 204,
      },
      {
        u0: 103 / 204,
        u1: 203 / 204,
        v0: 1 / 204,
        v1: 101 / 204,
      },
    ]);
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
    expect(firstFrame.refinementPageCount).toBe(4);
    expect(fixture.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);

    const secondFrame = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });

    expect(secondFrame.uploadCount).toBe(1);
    expect(secondFrame.flatSurfaces).toHaveLength(1);
    expect(secondFrame.refinementPageCount).toBe(3);
    expect(fixture.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(2);
  });

  it("uploads uncovered first-visible work during viewport interaction", () => {
    const fixture = createManagerFixture({ maxPagePixelSize: 50 });
    const result = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [createFrameSurface()],
      viewportInteractionActive: true,
      viewportZoomBucket: 1,
    });

    expect(result.uploadCount).toBe(1);
    expect(result.budgetExhausted).toBe(true);
    expect(result.flatSurfaces).toEqual([]);
    expect(result.refinementPageCount).toBe(4);
    expect(fixture.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
  });

  it("can defer retained page upload work while input frames compose committed coverage", () => {
    const fixture = createManagerFixture({ maxPagePixelSize: 50 });
    const preparedFrame = fixture.manager.prepareFrame({
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [createFrameSurface()],
      viewportZoomBucket: 1,
    });
    const deferred = fixture.manager.deferPostSubmitMaintenance({
      preparedFrame,
    });

    expect(deferred.uploadCount).toBe(0);
    expect(deferred.needsFollowUpFrame).toBe(false);
    expect(deferred.refinementPageCount).toBe(4);
    expect(fixture.queue.copyExternalImageToTexture).not.toHaveBeenCalled();

    const maintenance = fixture.manager.runPostSubmitMaintenance({
      preparedFrame,
    });
    expect(maintenance.uploadCount).toBe(1);
    expect(fixture.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
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

    expect(zoomFrame.uploadCount).toBe(1);
    expect(zoomFrame.flatSurfaces).toHaveLength(1);
    expect(zoomFrame.refinementPageCount).toBe(4);
    expect(
      zoomFrame.flatSurfaces.map((surfaceVisual) => surfaceVisual.surfaceId),
    ).toEqual([
      "surface-a:1:1:source-a:1:0:0:100:100:scale=1:0:100:100:0:0:1:1",
    ]);
  });

  it("queues bounded content invalidation without deleting committed compatible coverage", () => {
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
      "surface-a:1:1:source-a:1:0:0:100:100:scale=1:0:100:100:0:0:1:1",
    );
  });

  it("does not draw stale content pages while replacement content pages are pending", () => {
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

    expect(replacementFrame.uploadCount).toBe(1);
    expect(replacementFrame.flatSurfaces).toHaveLength(0);
    expect(replacementFrame.refinementPageCount).toBe(1);
    expect(replacementFrame.postMaintenanceRefinementPageCount).toBe(0);
    expect(replacementFrame.trueHoleRectCount).toBe(1);
  });

  it("protects the last published pages while a replacement frame is prepared", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 100 * 100 * 4,
        maxUploads: 4,
      },
      maxPagePixelSize: 100,
    });
    const surface = createFrameSurface({ contentVersion: 1 });
    const replacementSurface = createFrameSurface({
      contentVersion: 2,
      sourceKey: "source-b",
      sourceVersion: 2,
    });

    renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    const publishedFrame = fixture.manager.prepareFrame({
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    const replacementFrame = fixture.manager.prepareFrame({
      devicePixelRatio: 1,
      frame: 3,
      surfaces: [replacementSurface],
      viewportZoomBucket: 1,
    });
    const maintenance = fixture.manager.runPostSubmitMaintenance({
      preparedFrame: replacementFrame,
      publishedProtectedPageKeys: publishedFrame.protectedPageKeys,
    });

    expect(publishedFrame.protectedPageKeys).toHaveLength(1);
    expect(replacementFrame.refinementPageCount).toBe(1);
    expect(maintenance.uploadCount).toBe(1);
    expect(maintenance.evicted.evictedKeys).toHaveLength(0);
    expect(maintenance.memory.committedCount).toBe(2);
    expect(fixture.textures[0]?.destroy).not.toHaveBeenCalled();
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

    expect(replacementFrame.uploadCount).toBe(1);
    expect(replacementFrame.drawQuadCount).toBe(1);
    expect(replacementFrame.compatibleDrawQuadCount).toBe(0);
    expect(replacementFrame.rejectedStaleRectCount).toBe(1);
    expect(replacementFrame.refinementPageCount).toBe(1);
    expect(replacementFrame.postMaintenanceRefinementPageCount).toBe(0);
    expect(replacementFrame.trueHoleRectCount).toBe(1);
  });

  it("refreshes row content before reporting the row as fresh again", () => {
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
    ).toBe(true);

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
    expect(preparedFrame.refinementPageCount).toBe(1);
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
    expect(nextPreparedFrame.refinementPageCount).toBe(0);
  });

  it("increments drawable revision when committed retained pages change", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 4,
      },
      maxPagePixelSize: 100,
    });
    const surface = createFrameSurface();

    expect(fixture.manager.getDrawableRevision()).toBe(0);
    renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    expect(fixture.manager.getDrawableRevision()).toBe(1);

    renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    expect(fixture.manager.getDrawableRevision()).toBe(1);

    fixture.manager.markSurfaceContentDirty({
      frame: 3,
      sourceRect: { height: 20, width: 20, x: 0, y: 0 },
      surfaceId: "surface-a",
    });
    renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 3,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    expect(fixture.manager.getDrawableRevision()).toBe(2);
  });

  it("uploads current row-owned text-like snapshots into retained content pages", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 4,
      },
      maxPagePixelSize: 100,
    });
    const snapshotElement = createTextLikeSnapshotElement("snapshot-key");
    const surface = createFrameSurface({
      textLikeSnapshots: [
        {
          rectCss: { height: 20, width: 40, x: 10, y: 12 },
          rowId: "row-a",
          sourceId: "snapshot-a",
          sourceKey: "snapshot-key",
        },
      ],
    });

    const result = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      textLikeSnapshotElementById: new Map([["snapshot-a", snapshotElement]]),
      viewportZoomBucket: 1,
    });

    expect(result.uploadCount).toBe(1);
    expect(fixture.queue.copyExternalImageToTexture).toHaveBeenCalledTimes(1);
    expect(fixture.queue.copyElementImageToTexture.mock.contexts[0]).toBe(
      fixture.queue,
    );
    expect(fixture.queue.copyElementImageToTexture).toHaveBeenCalledWith(
      snapshotElement,
      0,
      0,
      40,
      20,
      40,
      20,
      {
        origin: { x: 10, y: 12, z: 0 },
        texture: fixture.textures[0],
      },
    );
  });

  it("reuploads a committed page when row-owned text-like snapshots become part of its content", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 4,
      },
      maxPagePixelSize: 100,
    });
    const surface = createFrameSurface();
    const snapshotElement = createTextLikeSnapshotElement("snapshot-key");

    renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      viewportZoomBucket: 1,
    });
    expect(fixture.queue.copyElementImageToTexture).not.toHaveBeenCalled();

    const result = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [
        createFrameSurface({
          textLikeSnapshots: [
            {
              rectCss: { height: 20, width: 40, x: 10, y: 12 },
              rowId: "row-a",
              sourceId: "snapshot-a",
              sourceKey: "snapshot-key",
            },
          ],
        }),
      ],
      textLikeSnapshotElementById: new Map([["snapshot-a", snapshotElement]]),
      viewportZoomBucket: 1,
    });

    expect(result.uploadCount).toBe(1);
    const copyCall = fixture.queue.copyElementImageToTexture.mock.calls[0];
    expect(copyCall?.slice(0, 7)).toEqual([
      snapshotElement,
      0,
      0,
      40,
      20,
      40,
      20,
    ]);
    const destination = copyCall?.[7] as
      | {
          readonly origin?: { readonly x?: number; readonly y?: number };
          readonly texture?: unknown;
        }
      | undefined;
    expect(destination?.origin).toEqual({ x: 10, y: 12, z: 0 });
    expect(fixture.textures).toContain(destination?.texture);
  });

  it("keeps text-like snapshot pages queued when Chromium has not cached a paint record yet", () => {
    const fixture = createManagerFixture({
      budget: {
        maxFrameUploadedBytes: 1_000_000,
        maxTextureMemoryBytes: 10_000_000,
        maxUploads: 4,
      },
      maxPagePixelSize: 100,
    });
    const requestPaint = vi.fn();
    const snapshotElement = createTextLikeSnapshotElement(
      "snapshot-key",
      requestPaint,
    );
    const surface = createFrameSurface({
      textLikeSnapshots: [
        {
          rectCss: { height: 20, width: 40, x: 10, y: 12 },
          rowId: "row-a",
          sourceId: "snapshot-a",
          sourceKey: "snapshot-key",
        },
      ],
    });
    fixture.queue.copyElementImageToTexture.mockImplementationOnce(() => {
      throw new DOMException(
        "No cached paint record for element.",
        "InvalidStateError",
      );
    });

    const firstResult = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 1,
      surfaces: [surface],
      textLikeSnapshotElementById: new Map([["snapshot-a", snapshotElement]]),
      viewportZoomBucket: 1,
    });

    expect(firstResult.uploadCount).toBe(0);
    expect(firstResult.uploadedBytes).toBe(0);
    expect(firstResult.budgetExhausted).toBe(true);
    expect(firstResult.needsFollowUpFrame).toBe(true);
    expect(firstResult.queuedWorkCount).toBe(1);
    expect(firstResult.memory.pendingCount).toBe(0);
    expect(requestPaint).toHaveBeenCalledTimes(1);
    expect(fixture.textures[0]?.destroy).toHaveBeenCalledTimes(1);

    const secondResult = renderFrame(fixture.manager, {
      devicePixelRatio: 1,
      frame: 2,
      surfaces: [surface],
      textLikeSnapshotElementById: new Map([["snapshot-a", snapshotElement]]),
      viewportZoomBucket: 1,
    });

    expect(secondResult.uploadCount).toBe(1);
    expect(secondResult.budgetExhausted).toBe(false);
    expect(secondResult.queuedWorkCount).toBe(0);
    expect(secondResult.memory.pendingCount).toBe(0);
    expect(fixture.queue.copyElementImageToTexture).toHaveBeenCalledTimes(2);
  });
});

function renderFrame(
  manager: RetainedContentTexturePageManager,
  {
    darkMode = false,
    devicePixelRatio,
    frame,
    surfaces,
    textLikeSnapshotElementById,
    viewportInteractionActive = false,
    viewportZoomBucket,
  }: {
    readonly darkMode?: boolean | undefined;
    readonly devicePixelRatio: number;
    readonly frame: number;
    readonly surfaces: readonly RetainedContentTexturePageFrameSurface[];
    readonly textLikeSnapshotElementById?:
      | ReadonlyMap<string, HTMLElement>
      | undefined;
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
  const maintenance = manager.runPostSubmitMaintenance(
    textLikeSnapshotElementById === undefined
      ? maintenanceInput
      : {
          ...maintenanceInput,
          textLikeSnapshotElementById,
        },
  );
  return {
    ...maintenance,
    flatSurfaces: preparedFrame.flatSurfaces,
    refinementPageCount: preparedFrame.refinementPageCount,
  };
}

function createManagerFixture({
  budget,
  maxTextureDimension2D,
  maxPagePixelSize,
  onSubmittedWorkDone,
}: {
  readonly budget?: Partial<RetainedTextureUploadSchedulerBudget> | undefined;
  readonly maxTextureDimension2D?: number | undefined;
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
    ...(maxTextureDimension2D === undefined
      ? {}
      : { limits: { maxTextureDimension2D } }),
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

function createTextLikeSnapshotElement(
  sourceKey: string,
  requestPaint?: (() => void) | undefined,
): HTMLElement {
  const paintCanvas = requestPaint
    ? ({ requestPaint } as Partial<HtmlInCanvasCanvas>)
    : null;
  return {
    closest: vi.fn(() => null),
    dataset: {
      gpuFlowRetainedTextLikeRowSnapshotReadyKey: sourceKey,
      gpuFlowRetainedTextLikeRowSnapshotSourceKey: sourceKey,
    },
    ownerDocument: {
      querySelector: vi.fn((selector: string) =>
        selector === "canvas[data-gpu-flow-surface='true']"
          ? paintCanvas
          : null,
      ),
    },
  } as unknown as HTMLElement;
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
  const contentVersion = overrides.contentVersion ?? 1;
  return {
    contentBoundsCss: { height: 100, width: 100, x: 0, y: 0 },
    contentVersion,
    layout: {
      height: 100,
      surfaceId: "surface-a",
      textureSourceRect: { height: 100, width: 100, x: 0, y: 0 },
      width: 100,
      x: 10,
      y: 20,
    },
    rasterScene: createRasterScene(),
    sourceKey: `source-a:${contentVersion}`,
    sourceVersion: contentVersion,
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
