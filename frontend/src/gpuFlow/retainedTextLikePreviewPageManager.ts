import type { NodeTexturePriority } from "./dirtyTracking";
import type { GpuQueueWithElementUpload } from "./htmlInCanvasTypes";
import { getHtmlSurfaceTextureUsage } from "./htmlSurfaces/textureManagerHelpers";
import type { HtmlSurfaceTextureResources } from "./htmlSurfaces/textureTiles";
import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
import type { RetainedTexturePageDrawQuad } from "./retainedTexturePageGrid";
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
import type { GpuRect } from "./viewportMath";

export type RetainedTextLikePreviewPageFrameSurface = {
  readonly contentBoundsCss: GpuRect;
  readonly layout: RetainedTexturePageSurfaceLayout;
  readonly sourceId: string;
  readonly sourceKey: string;
  readonly sourceWindowCss: GpuRect;
  readonly surfaceId: string;
  readonly visibleSourceRectCss: GpuRect;
};

export type RetainedTextLikePreviewPageFrameInput = {
  readonly baseDrawQuads: readonly RetainedTexturePageDrawQuad<HtmlSurfaceTextureResources>[];
  readonly baseTargetDescriptors: readonly RetainedTexturePageDescriptor[];
  readonly frame: number;
  readonly surfaces: readonly RetainedTextLikePreviewPageFrameSurface[];
};

export type RetainedTextLikePreviewPagePreparedFrame = {
  readonly baseDrawQuads: readonly RetainedTexturePageDrawQuad<HtmlSurfaceTextureResources>[];
  readonly committedPageRects: readonly RetainedTextLikePreviewPageCommittedRect[];
  readonly drawQuadCount: number;
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly frame: number;
  readonly missingPageCount: number;
  readonly omittedPreviewCount: number;
  readonly protectedPageKeys: readonly string[];
  readonly refinementDescriptors: readonly RetainedTexturePageDescriptor[];
  readonly sourceCount: number;
  readonly targetDescriptors: readonly RetainedTexturePageDescriptor[];
};

export type RetainedTextLikePreviewPageCommittedRect = {
  readonly contentVersion: number;
  readonly lodScale: number;
  readonly sourceId: string;
  readonly sourceRectCss: GpuRect;
  readonly tileColumn: number;
  readonly tileRow: number;
};

export type RetainedTextLikePreviewPageMaintenanceInput = {
  readonly elementBySourceId: ReadonlyMap<string, HTMLElement>;
  readonly preparedFrame: RetainedTextLikePreviewPagePreparedFrame;
  readonly viewportInteractionActive?: boolean | undefined;
};

export type RetainedTextLikePreviewPageMaintenanceResult = {
  readonly budgetExhausted: boolean;
  readonly diagnostics: readonly RetainedTextureUploadSchedulerDiagnostic[];
  readonly drawQuadCount: number;
  readonly evicted: RetainedTexturePageEvictionResult;
  readonly executedItemCount: number;
  readonly memory: RetainedTexturePageCacheSnapshot;
  readonly missingPageCount: number;
  readonly needsFollowUpFrame: boolean;
  readonly omittedPreviewCount: number;
  readonly postMaintenanceMissingPageCount: number;
  readonly queuedWorkCount: number;
  readonly queuedWorkCountBeforeUpload: number;
  readonly remainingUploadableWorkCount: number;
  readonly skippedItemCount: number;
  readonly sourceCount: number;
  readonly targetDescriptorCount: number;
  readonly uploadedBytes: number;
  readonly uploadCount: number;
  readonly uploadMs: number;
};

export type RetainedTextLikePreviewPageManagerOptions = {
  readonly budget?: Partial<RetainedTextureUploadSchedulerBudget> | undefined;
  readonly format?: GPUTextureFormat | undefined;
  readonly maxTextureMemoryBytes?: number | undefined;
  readonly textureUsage?: GPUTextureUsageFlags | undefined;
};

const DEFAULT_PREVIEW_PAGE_BUDGET: RetainedTextureUploadSchedulerBudget = {
  maxFrameRasterMs: 0,
  maxFrameUploadMs: 4,
  maxFrameUploadedBytes: 8 * 1024 * 1024,
  maxTextureMemoryBytes: 128 * 1024 * 1024,
  maxUploads: 4,
};
const DEFAULT_PREVIEW_PAGE_FORMAT: GPUTextureFormat = "rgba8unorm";

export class RetainedTextLikePreviewPageManager {
  private readonly budget: RetainedTextureUploadSchedulerBudget;
  private readonly cache: RetainedTexturePageCache<HtmlSurfaceTextureResources>;
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly textureUsage: GPUTextureUsageFlags;
  private readonly workQueue = new RetainedTextureWorkQueue();
  private frameSurfaceByBaseId = new Map<
    string,
    RetainedTextLikePreviewPageFrameSurface
  >();
  private frameSurfaceBySourceId = new Map<
    string,
    RetainedTextLikePreviewPageFrameSurface
  >();
  private targetDescriptorByKey = new Map<
    string,
    RetainedTexturePageDescriptor
  >();
  private retiredResourceDrainRequestedFrame = Number.NEGATIVE_INFINITY;
  private retiredResourceDrainScheduled = false;

  constructor(
    device: GPUDevice,
    options: RetainedTextLikePreviewPageManagerOptions = {},
  ) {
    this.budget = normalizeBudget({
      ...DEFAULT_PREVIEW_PAGE_BUDGET,
      ...options.budget,
      ...(options.maxTextureMemoryBytes === undefined
        ? {}
        : { maxTextureMemoryBytes: options.maxTextureMemoryBytes }),
    });
    this.cache = new RetainedTexturePageCache({
      destroyResource: (resource) => resource.texture.destroy?.(),
    });
    this.device = device;
    this.format = options.format ?? DEFAULT_PREVIEW_PAGE_FORMAT;
    this.textureUsage = options.textureUsage ?? getHtmlSurfaceTextureUsage();
  }

  destroy() {
    this.cache.clear();
    this.workQueue.clear();
    this.frameSurfaceByBaseId.clear();
    this.frameSurfaceBySourceId.clear();
    this.targetDescriptorByKey.clear();
    this.retiredResourceDrainRequestedFrame = Number.NEGATIVE_INFINITY;
    this.retiredResourceDrainScheduled = false;
  }

  prepareFrame({
    baseDrawQuads,
    baseTargetDescriptors,
    frame,
    surfaces,
  }: RetainedTextLikePreviewPageFrameInput): RetainedTextLikePreviewPagePreparedFrame {
    this.frameSurfaceByBaseId = new Map(
      surfaces.map((surface) => [surface.surfaceId, surface]),
    );
    this.frameSurfaceBySourceId = new Map(
      surfaces.map((surface) => [surface.sourceId, surface]),
    );
    const targetDescriptors = baseTargetDescriptors.flatMap((descriptor) => {
      const surface = this.frameSurfaceByBaseId.get(descriptor.surfaceId);
      return surface ? [toPreviewDescriptor(descriptor, surface)] : [];
    });
    this.targetDescriptorByKey = new Map(
      targetDescriptors.map((descriptor) => [
        retainedTexturePageKey(descriptor),
        descriptor,
      ]),
    );
    return {
      ...this.createPageVisuals({
        baseDrawQuads,
        frame,
        targetDescriptors,
      }),
      baseDrawQuads,
      frame,
      sourceCount: surfaces.length,
      targetDescriptors,
    };
  }

  runPostSubmitMaintenance({
    elementBySourceId,
    preparedFrame,
    viewportInteractionActive = false,
  }: RetainedTextLikePreviewPageMaintenanceInput): RetainedTextLikePreviewPageMaintenanceResult {
    this.enqueueMissingPages(
      preparedFrame.refinementDescriptors,
      preparedFrame.frame,
    );
    const queuedWorkCountBeforeUpload = this.workQueue.size;
    const uploadResult = runRetainedTextureUploadScheduler({
      budget: this.budget,
      estimateWorkItem: (item) => this.estimateWorkItem(item),
      executeWorkItem: (item) =>
        this.executeWorkItem({
          elementBySourceId,
          frame: preparedFrame.frame,
          item,
        }),
      queue: this.workQueue,
      viewportInteractionActive,
    });
    const postMaintenanceVisuals = this.createPageVisuals({
      baseDrawQuads: preparedFrame.baseDrawQuads,
      frame: preparedFrame.frame,
      targetDescriptors: preparedFrame.targetDescriptors,
    });
    const evicted = this.cache.evictToBudget({
      frame: preparedFrame.frame,
      maxBytes: this.budget.maxTextureMemoryBytes,
      protectedPageKeys: [
        ...preparedFrame.protectedPageKeys,
        ...postMaintenanceVisuals.protectedPageKeys,
      ],
    });
    this.scheduleRetiredResourceDrain(preparedFrame.frame);
    const committedPreviewChangedDrawableCoverage =
      uploadResult.uploadCount > 0 &&
      didPreviewPageVisualCoverageChange({
        after: postMaintenanceVisuals,
        before: preparedFrame,
      });

    return {
      budgetExhausted: uploadResult.budgetExhausted,
      diagnostics: uploadResult.diagnostics,
      drawQuadCount: preparedFrame.drawQuadCount,
      evicted,
      executedItemCount: uploadResult.executedItems.length,
      memory: this.cache.snapshot(),
      missingPageCount: preparedFrame.missingPageCount,
      needsFollowUpFrame:
        uploadResult.budgetExhausted || committedPreviewChangedDrawableCoverage,
      omittedPreviewCount: preparedFrame.omittedPreviewCount,
      postMaintenanceMissingPageCount: postMaintenanceVisuals.missingPageCount,
      queuedWorkCount: this.workQueue.size,
      queuedWorkCountBeforeUpload,
      remainingUploadableWorkCount: uploadResult.remainingUploadableWorkCount,
      skippedItemCount: uploadResult.skippedItems.length,
      sourceCount: preparedFrame.sourceCount,
      targetDescriptorCount: preparedFrame.targetDescriptors.length,
      uploadedBytes: uploadResult.uploadedBytes,
      uploadCount: uploadResult.uploadCount,
      uploadMs: uploadResult.uploadMs,
    };
  }

  private createPageVisuals({
    baseDrawQuads,
    frame,
    targetDescriptors,
  }: {
    readonly baseDrawQuads: readonly RetainedTexturePageDrawQuad<HtmlSurfaceTextureResources>[];
    readonly frame: number;
    readonly targetDescriptors: readonly RetainedTexturePageDescriptor[];
  }): Omit<
    RetainedTextLikePreviewPagePreparedFrame,
    "baseDrawQuads" | "frame" | "sourceCount" | "targetDescriptors"
  > {
    const flatSurfaces: HtmlSurfaceFlatVisual[] = [];
    const committedPageRects: RetainedTextLikePreviewPageCommittedRect[] = [];
    const protectedPageKeys = new Set<string>();
    const drawQuadsBySourceId = new Map<
      string,
      RetainedTexturePageDrawQuad<HtmlSurfaceTextureResources>[]
    >();
    let omittedPreviewCount = 0;

    for (const baseDrawQuad of baseDrawQuads) {
      const surface = this.frameSurfaceByBaseId.get(
        baseDrawQuad.page.descriptor.surfaceId,
      );
      if (!surface) {
        continue;
      }
      const descriptor = toPreviewDescriptor(
        baseDrawQuad.page.descriptor,
        surface,
      );
      const page = this.cache.getCommittedPage(
        retainedTexturePageKey(descriptor),
      );
      if (!page) {
        omittedPreviewCount += 1;
        continue;
      }
      const usedPage =
        this.cache.markCommittedPageUsed(page.key, frame) ?? page;
      protectedPageKeys.add(usedPage.key);
      committedPageRects.push({
        contentVersion: usedPage.descriptor.contentVersion,
        lodScale: usedPage.descriptor.lodScale,
        sourceId: surface.sourceId,
        sourceRectCss: usedPage.descriptor.sourceRectCss,
        tileColumn: usedPage.descriptor.tileColumn,
        tileRow: usedPage.descriptor.tileRow,
      });
      const drawQuads = drawQuadsBySourceId.get(surface.sourceId) ?? [];
      drawQuads.push({
        desiredDescriptor: toPreviewDescriptor(
          baseDrawQuad.desiredDescriptor,
          surface,
        ),
        fallback: baseDrawQuad.fallback,
        page: usedPage,
        sampleRectCss: baseDrawQuad.sampleRectCss,
        staleContent: baseDrawQuad.staleContent,
      });
      drawQuadsBySourceId.set(surface.sourceId, drawQuads);
    }

    for (const [sourceId, drawQuads] of drawQuadsBySourceId) {
      const surface = this.frameSurfaceBySourceId.get(sourceId);
      if (!surface) {
        continue;
      }
      flatSurfaces.push(
        ...createRetainedTexturePageFlatVisuals({
          drawQuads,
          layout: surface.layout,
        }),
      );
    }

    const refinementDescriptors = targetDescriptors.filter(
      (descriptor) =>
        !this.cache.getCommittedPage(retainedTexturePageKey(descriptor)),
    );
    return {
      committedPageRects,
      drawQuadCount: [...drawQuadsBySourceId.values()].reduce(
        (count, drawQuads) => count + drawQuads.length,
        0,
      ),
      flatSurfaces,
      missingPageCount: refinementDescriptors.length,
      omittedPreviewCount,
      protectedPageKeys: [...protectedPageKeys],
      refinementDescriptors,
    };
  }

  private enqueueMissingPages(
    descriptors: readonly RetainedTexturePageDescriptor[],
    frame: number,
  ) {
    for (const descriptor of descriptors) {
      if (this.cache.getCommittedPage(retainedTexturePageKey(descriptor))) {
        continue;
      }
      this.enqueueDescriptorWork({
        descriptor,
        frame,
        kind: "lod-refinement",
        priority: "visible",
        targetLod: descriptor.lodScale,
      });
    }
  }

  private enqueueDescriptorWork({
    descriptor,
    frame,
    kind,
    priority,
    targetLod,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly frame: number;
    readonly kind: RetainedTextureWorkItem["kind"];
    readonly priority: NodeTexturePriority;
    readonly targetLod?: number | undefined;
  }) {
    this.workQueue.enqueue({
      contentVersion: descriptor.contentVersion,
      createdFrame: frame,
      kind,
      priority,
      sourceRect: descriptor.sourceRectCss,
      sourceWindow: descriptor.sourceWindowCss,
      surfaceId: descriptor.surfaceId,
      ...(targetLod === undefined ? {} : { targetLod }),
    });
  }

  private estimateWorkItem(item: RetainedTextureWorkItem): {
    readonly rasterMs: number;
    readonly uploadMs: number;
    readonly uploadedBytes: number;
    readonly uploadCount: number;
  } {
    const descriptor = this.resolveWorkItemDescriptors(item)[0];
    return {
      rasterMs: 0,
      uploadMs: 0,
      uploadedBytes: descriptor ? estimatePageByteSize(descriptor) : 0,
      uploadCount: descriptor ? 1 : 0,
    };
  }

  private executeWorkItem({
    elementBySourceId,
    frame,
    item,
  }: {
    readonly elementBySourceId: ReadonlyMap<string, HTMLElement>;
    readonly frame: number;
    readonly item: RetainedTextureWorkItem;
  }) {
    const descriptors = this.resolveWorkItemDescriptors(item);
    const descriptor = descriptors[0];
    if (!descriptor) {
      return {
        complete: true,
        rasterMs: 0,
        uploadCount: 0,
        uploadedBytes: 0,
        uploadMs: 0,
      };
    }
    if (this.cache.getCommittedPage(retainedTexturePageKey(descriptor))) {
      return {
        complete: true,
        rasterMs: 0,
        uploadCount: 0,
        uploadedBytes: 0,
        uploadMs: 0,
      };
    }
    const element = elementBySourceId.get(descriptor.surfaceId);
    const surface = this.frameSurfaceBySourceId.get(descriptor.surfaceId);
    if (
      !element ||
      !surface ||
      element.dataset.gpuFlowRetainedTextLikePreviewSourceKey !==
        surface.sourceKey
    ) {
      return {
        complete: false,
        rasterMs: 0,
        uploadCount: 0,
        uploadedBytes: 0,
        uploadMs: 0,
      };
    }
    const upload = this.uploadPage({ descriptor, element, frame });
    return {
      complete: descriptors.length <= 1,
      rasterMs: 0,
      uploadCount: 1,
      uploadedBytes: upload.uploadedBytes,
      uploadMs: upload.uploadMs,
    };
  }

  private resolveWorkItemDescriptors(
    item: RetainedTextureWorkItem,
  ): readonly RetainedTexturePageDescriptor[] {
    const surface = this.frameSurfaceBySourceId.get(item.surfaceId);
    if (!surface || !item.sourceRect) {
      return [];
    }
    const sourceRect = item.sourceRect;
    if (
      item.sourceWindow &&
      !rectsEqual(item.sourceWindow, surface.sourceWindowCss)
    ) {
      return [];
    }
    return [...this.targetDescriptorByKey.values()].filter(
      (candidate) =>
        candidate.surfaceId === item.surfaceId &&
        candidate.contentVersion === item.contentVersion &&
        (item.targetLod === undefined ||
          candidate.lodScale === item.targetLod) &&
        rectsIntersect(candidate.sourceRectCss, sourceRect) &&
        rectsEqual(
          candidate.sourceWindowCss,
          item.sourceWindow ?? surface.sourceWindowCss,
        ) &&
        !this.cache.getCommittedPage(retainedTexturePageKey(candidate)),
    );
  }

  private uploadPage({
    descriptor,
    element,
    frame,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly element: HTMLElement;
    readonly frame: number;
  }): {
    readonly uploadedBytes: number;
    readonly uploadMs: number;
  } {
    const queue = this.device.queue as GpuQueueWithElementUpload;
    if (typeof queue.copyElementImageToTexture !== "function") {
      throw new Error(
        "Setta GPU flow requires GPUQueue.copyElementImageToTexture for retained text-like preview upload.",
      );
    }
    const pending = this.cache.stagePendingPage({ descriptor, frame });
    const resource = this.createTextureResources(descriptor);
    const uploadStartedAt = performance.now();
    queue.copyElementImageToTexture(
      element,
      descriptor.sourceRectCss.x,
      descriptor.sourceRectCss.y,
      descriptor.sourceRectCss.width,
      descriptor.sourceRectCss.height,
      descriptor.pixelWidth,
      descriptor.pixelHeight,
      { texture: resource.texture },
    );
    const uploadMs = performance.now() - uploadStartedAt;
    this.cache.commitPendingPage({
      frame,
      key: pending.key,
      resource,
    });
    return {
      uploadedBytes: pending.byteSize,
      uploadMs,
    };
  }

  private createTextureResources(
    descriptor: RetainedTexturePageDescriptor,
  ): HtmlSurfaceTextureResources {
    const texture = this.device.createTexture({
      format: this.format,
      label: `setta-retained-text-like-preview-page-${descriptor.surfaceId}-${descriptor.tileColumn}-${descriptor.tileRow}-${descriptor.lodScale}`,
      size: {
        height: descriptor.pixelHeight,
        width: descriptor.pixelWidth,
      },
      usage: this.textureUsage,
    });
    const textureView = texture.createView({
      label: `setta-retained-text-like-preview-page-${descriptor.surfaceId}-${descriptor.tileColumn}-${descriptor.tileRow}-${descriptor.lodScale}-view`,
    });
    const sampler = this.device.createSampler({
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
      magFilter: "linear",
      minFilter: "linear",
    });
    return { sampler, texture, textureView };
  }

  private scheduleRetiredResourceDrain(frame: number) {
    if (this.cache.snapshot().retiredCount === 0) {
      return;
    }
    this.retiredResourceDrainRequestedFrame = Math.max(
      this.retiredResourceDrainRequestedFrame,
      frame,
    );
    if (this.retiredResourceDrainScheduled) {
      return;
    }
    this.retiredResourceDrainScheduled = true;
    const scheduledFrame = this.retiredResourceDrainRequestedFrame;
    const queue = this.device.queue as GPUQueue & {
      readonly onSubmittedWorkDone?: () => Promise<void>;
    };
    const onSubmittedWorkDone = queue.onSubmittedWorkDone;
    if (typeof onSubmittedWorkDone === "function") {
      void onSubmittedWorkDone.call(queue).then(
        () => this.drainRetiredResources(scheduledFrame),
        () => this.drainRetiredResources(scheduledFrame),
      );
      return;
    }
    queueMicrotask(() => this.drainRetiredResources(scheduledFrame));
  }

  private drainRetiredResources(retiredFrameThrough: number) {
    this.retiredResourceDrainScheduled = false;
    this.cache.destroyRetiredPages({ retiredFrameThrough });
    const retiredCount = this.cache.snapshot().retiredCount;
    if (
      retiredCount > 0 &&
      this.retiredResourceDrainRequestedFrame > retiredFrameThrough
    ) {
      this.scheduleRetiredResourceDrain(
        this.retiredResourceDrainRequestedFrame,
      );
      return;
    }
    if (retiredCount === 0) {
      this.retiredResourceDrainRequestedFrame = Number.NEGATIVE_INFINITY;
    }
  }
}

function toPreviewDescriptor(
  descriptor: RetainedTexturePageDescriptor,
  surface: RetainedTextLikePreviewPageFrameSurface,
): RetainedTexturePageDescriptor {
  return {
    ...descriptor,
    surfaceId: surface.sourceId,
  };
}

function didPreviewPageVisualCoverageChange({
  after,
  before,
}: {
  readonly after: Pick<
    RetainedTextLikePreviewPagePreparedFrame,
    "drawQuadCount" | "missingPageCount" | "omittedPreviewCount"
  >;
  readonly before: Pick<
    RetainedTextLikePreviewPagePreparedFrame,
    "drawQuadCount" | "missingPageCount" | "omittedPreviewCount"
  >;
}): boolean {
  return (
    after.drawQuadCount !== before.drawQuadCount ||
    after.missingPageCount !== before.missingPageCount ||
    after.omittedPreviewCount !== before.omittedPreviewCount
  );
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

function rectsEqual(left: GpuRect, right: GpuRect): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function rectsIntersect(left: GpuRect, right: GpuRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function normalizeFiniteNonNegativeNumber(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(
      `Retained text-like preview page manager ${name} must be finite and non-negative.`,
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
      `Retained text-like preview page manager ${name} must be an integer.`,
    );
  }
  return normalized;
}
