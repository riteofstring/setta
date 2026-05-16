import { rasterizeGpuRetainedContentPage } from "./retainedContentPageRasterizer";
import type { GpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import type { GpuRetainedContentSwitchAnimationStore } from "./retainedContentSwitchAnimation";
import type { RetainedContentTexturePageFrameSurface } from "./retainedContentTexturePageManagerTypes";
import {
  resolveRetainedContentTexturePageTextLikeSnapshots,
  uploadRetainedContentTexturePageTextLikeSnapshots,
} from "./retainedContentTexturePageTextLikeSnapshots";
import {
  createRetainedContentTextureResources,
  destroyRetainedContentTextureResources,
  getRetainedContentTextureResourceRegion,
  type RetainedContentTextureAtlasStore,
  type RetainedContentTextureResources,
} from "./retainedContentTextureResources";
import {
  RetainedTexturePageCache,
  type RetainedTexturePageDescriptor,
} from "./retainedTexturePages";
import type { GpuRect } from "./viewportMath";

type RetainedContentTexturePageUploadResult = {
  readonly complete: boolean;
  readonly drawableChanged: boolean;
  readonly drawnCommandCount: number;
  readonly rasterMs: number;
  readonly uploadCount: number;
  readonly uploadedBytes: number;
  readonly uploadMs: number;
};

export function uploadRetainedContentTexturePage({
  cache,
  descriptor,
  device,
  elementByTextLikeSnapshotSourceId,
  format,
  frame,
  frameSurfaceById,
  palette,
  scratchCanvas,
  switchAnimations,
  textureAtlasStore,
  textureUsage,
}: {
  readonly cache: RetainedTexturePageCache<RetainedContentTextureResources>;
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly device: GPUDevice;
  readonly elementByTextLikeSnapshotSourceId: ReadonlyMap<string, HTMLElement>;
  readonly format: GPUTextureFormat;
  readonly frame: number;
  readonly frameSurfaceById: ReadonlyMap<
    string,
    RetainedContentTexturePageFrameSurface
  >;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly scratchCanvas: HTMLCanvasElement;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
  readonly textureAtlasStore: RetainedContentTextureAtlasStore;
  readonly textureUsage: GPUTextureUsageFlags;
}): RetainedContentTexturePageUploadResult {
  const surface = frameSurfaceById.get(descriptor.surfaceId);
  if (!surface) {
    return emptyRetainedContentTexturePageUploadResult(true);
  }
  const ctx = scratchCanvas.getContext("2d");
  if (!ctx) {
    throw new Error(
      "Setta retained content page rasterization requires a 2D canvas context.",
    );
  }
  const pending = cache.stagePendingPage({ descriptor, frame });
  const rasterStartedAt = performance.now();
  const rasterResult = rasterizeGpuRetainedContentPage({
    canvas: scratchCanvas,
    ctx,
    lodScale: descriptor.lodScale,
    palette,
    scene: surface.rasterScene,
    sourceRectCss: toRasterSourceRectCss({
      contentRectCss: descriptor.sourceRectCss,
      rasterViewportRectCss: surface.rasterScene.viewportRect,
      sourceWindowCss: surface.sourceWindowCss,
    }),
    surfaceId: descriptor.surfaceId,
    switchAnimations,
  });
  const rasterMs = performance.now() - rasterStartedAt;
  const resource = createRetainedContentTextureResources({
    atlasStore: textureAtlasStore,
    descriptor,
    device,
    format,
    textureUsage,
  });
  const textureRegion = getRetainedContentTextureResourceRegion(resource);
  const uploadStartedAt = performance.now();
  device.queue.copyExternalImageToTexture(
    { source: scratchCanvas },
    {
      origin: { x: textureRegion.x, y: textureRegion.y, z: 0 },
      texture: resource.texture,
    },
    {
      height: descriptor.pixelHeight,
      width: descriptor.pixelWidth,
    },
  );
  const textLikeSnapshotPaintAvailable =
    uploadRetainedContentTexturePageTextLikeSnapshots({
      descriptor,
      elementBySourceId: elementByTextLikeSnapshotSourceId,
      queue: device.queue,
      resource,
      snapshots: resolveRetainedContentTexturePageTextLikeSnapshots({
        descriptor,
        surface,
      }),
    });
  if (!textLikeSnapshotPaintAvailable) {
    destroyRetainedContentTextureResources(resource);
    cache.cancelPendingPage(pending.key);
    return {
      ...emptyRetainedContentTexturePageUploadResult(false),
      drawnCommandCount: rasterResult.drawnCommandCount,
      rasterMs,
      uploadMs: performance.now() - uploadStartedAt,
    };
  }
  const uploadMs = performance.now() - uploadStartedAt;
  cache.commitPendingPage({
    frame,
    key: pending.key,
    resource,
  });
  return {
    complete: true,
    drawableChanged: true,
    drawnCommandCount: rasterResult.drawnCommandCount,
    rasterMs,
    uploadCount: 1,
    uploadedBytes: pending.byteSize,
    uploadMs,
  };
}

function emptyRetainedContentTexturePageUploadResult(
  complete: boolean,
): RetainedContentTexturePageUploadResult {
  return {
    complete,
    drawableChanged: false,
    drawnCommandCount: 0,
    rasterMs: 0,
    uploadCount: 0,
    uploadedBytes: 0,
    uploadMs: 0,
  };
}

function toRasterSourceRectCss({
  contentRectCss,
  rasterViewportRectCss,
  sourceWindowCss,
}: {
  readonly contentRectCss: GpuRect;
  readonly rasterViewportRectCss: GpuRect;
  readonly sourceWindowCss: GpuRect;
}): GpuRect {
  return {
    height: contentRectCss.height,
    width: contentRectCss.width,
    x: contentRectCss.x - sourceWindowCss.x + rasterViewportRectCss.x,
    y: contentRectCss.y - sourceWindowCss.y + rasterViewportRectCss.y,
  };
}
