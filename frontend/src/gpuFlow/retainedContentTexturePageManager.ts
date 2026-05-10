import { getHtmlSurfaceTextureUsage } from "./htmlSurfaces/textureManagerHelpers";
import type { HtmlSurfaceTextureResources } from "./htmlSurfaces/textureTiles";
import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
import {
  getGpuRetainedContentCanvasPalette,
  type GpuRetainedContentCanvasPalette,
} from "./retainedContentCanvasTheme";
import { rasterizeGpuRetainedContentPage } from "./retainedContentPageRasterizer";
import type { GpuRetainedContentScene } from "./retainedContentScene";
import type { GpuRetainedContentSwitchAnimationStore } from "./retainedContentSwitchAnimation";
import {
  createRetainedTexturePageDescriptors,
  createRetainedTexturePageDrawQuads,
} from "./retainedTexturePageGrid";
import {
  createRetainedTexturePageFlatVisuals,
  type RetainedTexturePageSurfaceLayout,
} from "./retainedTexturePageVisuals";
import {
  RetainedTexturePageCache,
  estimatePageByteSize,
  retainedTexturePageKey,
  type RetainedTexturePageCacheSnapshot,
  type RetainedTexturePageDescriptor,
  type RetainedTexturePageEvictionResult,
} from "./retainedTexturePages";
import {
  runRetainedTextureUploadScheduler,
  type RetainedTextureUploadSchedulerBudget,
  type RetainedTextureUploadSchedulerDiagnostic,
} from "./retainedTextureUploadScheduler";
import {
  RetainedTextureWorkQueue,
  type RetainedTextureWorkItem,
} from "./retainedTextureWorkQueue";
import type { NodeTexturePriority } from "./dirtyTracking";
import type { GpuRect } from "./viewportMath";

export type RetainedContentTexturePageFrameSurface = {
  readonly contentBoundsCss: GpuRect;
  readonly contentVersion: number;
  readonly layout: RetainedTexturePageSurfaceLayout;
  readonly rasterScene: GpuRetainedContentScene;
  readonly surfaceId: string;
  readonly visibleSourceRectCss: GpuRect;
};

export type RetainedContentTexturePageFrameInput = {
  readonly darkMode?: boolean | undefined;
  readonly devicePixelRatio: number;
  readonly frame: number;
  readonly surfaces: readonly RetainedContentTexturePageFrameSurface[];
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
  readonly viewportInteractionActive?: boolean | undefined;
  readonly viewportZoomBucket: number;
};

export type RetainedContentTexturePageFrameResult = {
  readonly budgetExhausted: boolean;
  readonly diagnostics: readonly RetainedTextureUploadSchedulerDiagnostic[];
  readonly evicted: RetainedTexturePageEvictionResult;
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly memory: RetainedTexturePageCacheSnapshot;
  readonly missingPageCount: number;
  readonly uploadedBytes: number;
  readonly uploadCount: number;
};

export type RetainedContentTexturePageManagerOptions = {
  readonly budget?: Partial<RetainedTextureUploadSchedulerBudget> | undefined;
  readonly format?: GPUTextureFormat | undefined;
  readonly maxPagePixelSize?: number | undefined;
  readonly scratchCanvas?: HTMLCanvasElement | undefined;
  readonly textureUsage?: GPUTextureUsageFlags | undefined;
};

export type RetainedContentTexturePageInvalidation = {
  readonly frame: number;
  readonly priority?: NodeTexturePriority | undefined;
  readonly sourceRect?: GpuRect | undefined;
  readonly surfaceId: string;
};

const DEFAULT_RETAINED_PAGE_BUDGET: RetainedTextureUploadSchedulerBudget = {
  maxFrameRasterMs: 4,
  maxFrameUploadMs: 4,
  maxFrameUploadedBytes: 8 * 1024 * 1024,
  maxTextureMemoryBytes: 192 * 1024 * 1024,
  maxUploads: 4,
};
const DEFAULT_RETAINED_PAGE_FORMAT: GPUTextureFormat = "rgba8unorm";
const DEFAULT_RETAINED_PAGE_PIXEL_SIZE = 512;

export class RetainedContentTexturePageManager {
  private readonly budget: RetainedTextureUploadSchedulerBudget;
  private readonly cache: RetainedTexturePageCache<HtmlSurfaceTextureResources>;
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly maxPagePixelSize: number;
  private readonly scratchCanvas: HTMLCanvasElement;
  private readonly textureUsage: GPUTextureUsageFlags;
  private readonly workQueue = new RetainedTextureWorkQueue();
  private frameSurfaceById = new Map<
    string,
    RetainedContentTexturePageFrameSurface
  >();
  private targetLodScale = 1;

  constructor(
    device: GPUDevice,
    ownerDocument: Document,
    options: RetainedContentTexturePageManagerOptions = {},
  ) {
    this.budget = normalizeBudget({
      ...DEFAULT_RETAINED_PAGE_BUDGET,
      ...options.budget,
    });
    this.cache = new RetainedTexturePageCache({
      destroyResource: (resource) => resource.texture.destroy?.(),
    });
    this.device = device;
    this.format = options.format ?? DEFAULT_RETAINED_PAGE_FORMAT;
    this.maxPagePixelSize =
      options.maxPagePixelSize ?? DEFAULT_RETAINED_PAGE_PIXEL_SIZE;
    this.scratchCanvas =
      options.scratchCanvas ?? ownerDocument.createElement("canvas");
    this.textureUsage = options.textureUsage ?? getHtmlSurfaceTextureUsage();
  }

  destroy() {
    this.cache.clear();
    this.workQueue.clear();
    this.frameSurfaceById.clear();
  }

  markSurfaceContentDirty({
    frame,
    priority = "visible",
    sourceRect,
    surfaceId,
  }: RetainedContentTexturePageInvalidation): boolean {
    const surface = this.frameSurfaceById.get(surfaceId);
    if (!surface) {
      return false;
    }
    this.workQueue.enqueue({
      contentVersion: surface.contentVersion,
      createdFrame: frame,
      kind: "content-rect",
      priority,
      sourceRect: sourceRect ?? surface.visibleSourceRectCss,
      surfaceId,
    });
    return true;
  }

  renderFrame({
    darkMode = false,
    devicePixelRatio,
    frame,
    surfaces,
    switchAnimations,
    viewportInteractionActive = false,
    viewportZoomBucket,
  }: RetainedContentTexturePageFrameInput): RetainedContentTexturePageFrameResult {
    this.frameSurfaceById = new Map(
      surfaces.map((surface) => [surface.surfaceId, surface]),
    );
    this.targetLodScale = normalizeLodScale({
      devicePixelRatio,
      viewportZoomBucket,
    });

    const desiredPages = this.resolveDesiredPages(surfaces);
    this.enqueueMissingPages(desiredPages, frame);
    const palette = getGpuRetainedContentCanvasPalette(darkMode);
    const uploadResult = runRetainedTextureUploadScheduler({
      budget: this.budget,
      estimateWorkItem: (item) => this.estimateWorkItem(item),
      executeWorkItem: (item) =>
        this.executeWorkItem({
          frame,
          item,
          palette,
          switchAnimations,
        }),
      queue: this.workQueue,
      viewportInteractionActive,
    });
    const pageVisualResult = this.createPageVisuals({ desiredPages, frame });
    const evicted = this.cache.evictToBudget({
      maxBytes: this.budget.maxTextureMemoryBytes,
      protectedPageKeys: pageVisualResult.protectedPageKeys,
    });

    return {
      budgetExhausted: uploadResult.budgetExhausted,
      diagnostics: uploadResult.diagnostics,
      evicted,
      flatSurfaces: pageVisualResult.flatSurfaces,
      memory: this.cache.snapshot(),
      missingPageCount: pageVisualResult.missingPageCount,
      uploadedBytes: uploadResult.uploadedBytes,
      uploadCount: uploadResult.uploadCount,
    };
  }

  private resolveDesiredPages(
    surfaces: readonly RetainedContentTexturePageFrameSurface[],
  ): readonly RetainedTexturePageDescriptor[] {
    return surfaces.flatMap((surface) =>
      createRetainedTexturePageDescriptors({
        contentBoundsCss: surface.contentBoundsCss,
        contentVersion: surface.contentVersion,
        lodScale: this.targetLodScale,
        maxPagePixelSize: this.maxPagePixelSize,
        surfaceId: surface.surfaceId,
        visibleSourceRectCss: surface.visibleSourceRectCss,
      }),
    );
  }

  private enqueueMissingPages(
    desiredPages: readonly RetainedTexturePageDescriptor[],
    frame: number,
  ) {
    for (const descriptor of desiredPages) {
      if (this.cache.getCommittedPage(retainedTexturePageKey(descriptor))) {
        continue;
      }
      this.workQueue.enqueue({
        contentVersion: descriptor.contentVersion,
        createdFrame: frame,
        kind: "lod-refinement",
        priority: "visible",
        sourceRect: descriptor.sourceRectCss,
        sourceWindow: descriptor.sourceRectCss,
        surfaceId: descriptor.surfaceId,
        targetLod: descriptor.lodScale,
      });
    }
  }

  private createPageVisuals({
    desiredPages,
    frame,
  }: {
    readonly desiredPages: readonly RetainedTexturePageDescriptor[];
    readonly frame: number;
  }): {
    readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
    readonly missingPageCount: number;
    readonly protectedPageKeys: readonly string[];
  } {
    const flatSurfaces: HtmlSurfaceFlatVisual[] = [];
    const protectedPageKeys = new Set<string>();
    let missingPageCount = 0;
    for (const surface of this.frameSurfaceById.values()) {
      const surfaceDesiredPages = desiredPages.filter(
        (page) => page.surfaceId === surface.surfaceId,
      );
      const drawQuads = createRetainedTexturePageDrawQuads({
        cache: this.cache,
        desiredPages: surfaceDesiredPages,
        usedFrame: frame,
      });
      missingPageCount += Math.max(
        0,
        surfaceDesiredPages.length - drawQuads.length,
      );
      for (const drawQuad of drawQuads) {
        protectedPageKeys.add(drawQuad.page.key);
      }
      flatSurfaces.push(
        ...createRetainedTexturePageFlatVisuals({
          drawQuads,
          layout: surface.layout,
        }),
      );
    }
    return {
      flatSurfaces,
      missingPageCount,
      protectedPageKeys: [...protectedPageKeys],
    };
  }

  private estimateWorkItem(
    item: RetainedTextureWorkItem,
  ): {
    readonly rasterMs: number;
    readonly uploadMs: number;
    readonly uploadedBytes: number;
    readonly uploadCount: number;
  } {
    const descriptors = this.resolveWorkItemDescriptors(item);
    return {
      rasterMs: 0,
      uploadMs: 0,
      uploadedBytes: descriptors.reduce(
        (total, descriptor) => total + estimatePageByteSize(descriptor),
        0,
      ),
      uploadCount: descriptors.length,
    };
  }

  private executeWorkItem({
    frame,
    item,
    palette,
    switchAnimations,
  }: {
    readonly frame: number;
    readonly item: RetainedTextureWorkItem;
    readonly palette: GpuRetainedContentCanvasPalette;
    readonly switchAnimations?:
      | GpuRetainedContentSwitchAnimationStore
      | undefined;
  }) {
    const descriptors = this.resolveWorkItemDescriptors(item);
    let rasterMs = 0;
    let uploadMs = 0;
    let uploadedBytes = 0;
    let uploadCount = 0;
    for (const descriptor of descriptors) {
      if (
        !shouldRefreshCommittedPage(item) &&
        this.cache.getCommittedPage(retainedTexturePageKey(descriptor))
      ) {
        continue;
      }
      const upload = this.uploadPage({
        descriptor,
        frame,
        palette,
        switchAnimations,
      });
      rasterMs += upload.rasterMs;
      uploadMs += upload.uploadMs;
      uploadedBytes += upload.uploadedBytes;
      uploadCount += 1;
    }
    return {
      complete: true,
      rasterMs,
      uploadCount,
      uploadedBytes,
      uploadMs,
    };
  }

  private resolveWorkItemDescriptors(
    item: RetainedTextureWorkItem,
  ): readonly RetainedTexturePageDescriptor[] {
    const surface = this.frameSurfaceById.get(item.surfaceId);
    if (!surface || item.contentVersion !== surface.contentVersion) {
      return [];
    }
    const visibleSourceRectCss = item.sourceRect ?? surface.visibleSourceRectCss;
    return createRetainedTexturePageDescriptors({
      contentBoundsCss: surface.contentBoundsCss,
      contentVersion: surface.contentVersion,
      lodScale: item.targetLod ?? this.targetLodScale,
      maxPagePixelSize: this.maxPagePixelSize,
      surfaceId: surface.surfaceId,
      visibleSourceRectCss,
    }).filter(
      (descriptor) =>
        shouldRefreshCommittedPage(item) ||
        !this.cache.getCommittedPage(retainedTexturePageKey(descriptor)),
    );
  }

  private uploadPage({
    descriptor,
    frame,
    palette,
    switchAnimations,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly frame: number;
    readonly palette: GpuRetainedContentCanvasPalette;
    readonly switchAnimations?:
      | GpuRetainedContentSwitchAnimationStore
      | undefined;
  }): { readonly rasterMs: number; readonly uploadedBytes: number; readonly uploadMs: number } {
    const surface = this.frameSurfaceById.get(descriptor.surfaceId);
    if (!surface) {
      return { rasterMs: 0, uploadedBytes: 0, uploadMs: 0 };
    }
    const ctx = this.scratchCanvas.getContext("2d");
    if (!ctx) {
      throw new Error(
        "Setta retained content page rasterization requires a 2D canvas context.",
      );
    }
    const pending = this.cache.stagePendingPage({ descriptor, frame });
    const rasterStartedAt = performance.now();
    rasterizeGpuRetainedContentPage({
      canvas: this.scratchCanvas,
      ctx,
      lodScale: descriptor.lodScale,
      palette,
      scene: surface.rasterScene,
      sourceRectCss: descriptor.sourceRectCss,
      surfaceId: descriptor.surfaceId,
      switchAnimations,
    });
    const rasterMs = performance.now() - rasterStartedAt;
    const resource = this.createTextureResources(descriptor);
    const uploadStartedAt = performance.now();
    this.device.queue.copyExternalImageToTexture(
      { source: this.scratchCanvas },
      { texture: resource.texture },
      {
        height: descriptor.pixelHeight,
        width: descriptor.pixelWidth,
      },
    );
    const uploadMs = performance.now() - uploadStartedAt;
    this.cache.commitPendingPage({
      frame,
      key: pending.key,
      resource,
    });
    return {
      rasterMs,
      uploadedBytes: pending.byteSize,
      uploadMs,
    };
  }

  private createTextureResources(
    descriptor: RetainedTexturePageDescriptor,
  ): HtmlSurfaceTextureResources {
    const texture = this.device.createTexture({
      format: this.format,
      label: `setta-retained-content-page-${descriptor.surfaceId}-${descriptor.tileColumn}-${descriptor.tileRow}-${descriptor.lodScale}`,
      size: {
        height: descriptor.pixelHeight,
        width: descriptor.pixelWidth,
      },
      usage: this.textureUsage,
    });
    const textureView = texture.createView({
      label: `setta-retained-content-page-${descriptor.surfaceId}-${descriptor.tileColumn}-${descriptor.tileRow}-${descriptor.lodScale}-view`,
    });
    const sampler = this.device.createSampler({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
    });
    return { sampler, texture, textureView };
  }
}

function normalizeBudget(
  budget: RetainedTextureUploadSchedulerBudget,
): RetainedTextureUploadSchedulerBudget {
  return {
    maxFrameRasterMs: normalizeFiniteNonNegativeNumber(
      "maxFrameRasterMs",
      budget.maxFrameRasterMs,
    ),
    maxFrameUploadMs: normalizeFiniteNonNegativeNumber(
      "maxFrameUploadMs",
      budget.maxFrameUploadMs,
    ),
    maxFrameUploadedBytes: normalizeFiniteNonNegativeNumber(
      "maxFrameUploadedBytes",
      budget.maxFrameUploadedBytes,
    ),
    maxTextureMemoryBytes: normalizeFiniteNonNegativeNumber(
      "maxTextureMemoryBytes",
      budget.maxTextureMemoryBytes,
    ),
    maxUploads: normalizeFiniteNonNegativeInteger(
      "maxUploads",
      budget.maxUploads,
    ),
  };
}

function shouldRefreshCommittedPage(item: RetainedTextureWorkItem): boolean {
  return (
    item.kind === "animation-rect" ||
    item.kind === "content-rect" ||
    item.kind === "full-content" ||
    item.kind === "hover-rect"
  );
}

function normalizeLodScale({
  devicePixelRatio,
  viewportZoomBucket,
}: {
  readonly devicePixelRatio: number;
  readonly viewportZoomBucket: number;
}): number {
  return (
    normalizeFinitePositiveNumber("devicePixelRatio", devicePixelRatio) *
    normalizeFinitePositiveNumber("viewportZoomBucket", viewportZoomBucket)
  );
}

function normalizeFiniteNonNegativeNumber(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Retained content texture page manager ${name} must be finite and non-negative.`,
    );
  }
  return value;
}

function normalizeFinitePositiveNumber(name: string, value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(
      `Retained content texture page manager ${name} must be finite and positive.`,
    );
  }
  return value;
}

function normalizeFiniteNonNegativeInteger(
  name: string,
  value: number,
): number {
  const normalized = normalizeFiniteNonNegativeNumber(name, value);
  if (!Number.isInteger(normalized)) {
    throw new Error(
      `Retained content texture page manager ${name} must be an integer.`,
    );
  }
  return normalized;
}
