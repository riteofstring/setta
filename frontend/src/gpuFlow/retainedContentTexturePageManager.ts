import type { NodeTexturePriority } from "./dirtyTracking";
import { startGpuFlowPerformanceMeasure } from "./gpuFlowPerformanceMarks";
import { getHtmlSurfaceTextureUsage } from "./htmlSurfaces/textureManagerHelpers";
import {
  getGpuRetainedContentCanvasPalette,
  type GpuRetainedContentCanvasPalette,
} from "./retainedContentCanvasTheme";
import type { GpuRetainedContentSwitchAnimationStore } from "./retainedContentSwitchAnimation";
import {
  normalizeRetainedContentTexturePageBudget,
  normalizeRetainedContentTexturePageLodScale,
  resolveRetainedContentTexturePageTextureBudget,
} from "./retainedContentTexturePageBudget";
import { isCommittedRetainedPageCompatibleWithReplacementTarget } from "./retainedContentTexturePageCompatibility";
import { RetainedTexturePageContentIdentityResolver } from "./retainedContentTexturePageContentIdentity";
import {
  createRetainedContentTexturePageVisibleCoverageFrame,
  type RetainedContentTexturePageVisibleCoverageFrame,
} from "./retainedContentTexturePageCoverageFrame";
import {
  createDeferredRetainedContentTexturePageMaintenanceResult,
  createRetainedContentTexturePageMaintenanceResult,
} from "./retainedContentTexturePageMaintenanceResult";
import {
  rectsEqual,
  resolveRetainedPageEvictionProtectedKeys,
  shouldRefreshCommittedPage,
} from "./retainedContentTexturePageManagerHelpers";
import type {
  RetainedContentTexturePageFrameInput,
  RetainedContentTexturePageFrameSurface,
  RetainedContentTexturePageFreshnessQuery,
  RetainedContentTexturePageInvalidation,
  RetainedContentTexturePageMaintenanceInput,
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePageManagerOptions,
  RetainedContentTexturePagePreparedFrame,
  RetainedContentTexturePageReplacementDescriptor,
} from "./retainedContentTexturePageManagerTypes";
import {
  RetainedTexturePageWorkCostEstimator,
  createRetainedTextureProjectionHorizonSignature,
  isRetainedTextureWorkStaleForProjectionHorizon,
  retainedFirstVisibleSurfaceEpochKey,
  retainedTextureDescriptorSourceRectCoalescing,
  retainedTextureWorkProjectionHorizonGeneration,
  shouldResolveRetainedTextureWorkItemForSurface,
  sortReplacementDescriptorsForRepair,
} from "./retainedContentTexturePageManagerWork";
import { uploadRetainedContentTexturePage } from "./retainedContentTexturePageUploader";
import {
  RetainedContentTextureAtlasStore,
  destroyRetainedContentTextureResources,
  type RetainedContentTextureResources,
} from "./retainedContentTextureResources";
import {
  executeRetainedContentTextureWorkItem,
  type RetainedTextureWorkExecutionResult,
} from "./retainedContentTextureWorkItemExecutor";
import type { RetainedTextureBudget } from "./retainedTextureBudget";
import { createRetainedTexturePageDescriptors } from "./retainedTexturePageGrid";
import {
  RetainedTexturePageCache,
  retainedTexturePageKey,
  type RetainedTexturePageDescriptor,
} from "./retainedTexturePages";
import {
  runRetainedTextureUploadScheduler,
  type RetainedTextureUploadSchedulerBudget,
} from "./retainedTextureUploadScheduler";
import {
  RetainedTextureWorkQueue,
  type RetainedTextureWorkItem,
} from "./retainedTextureWorkQueue";
import { createRetainedVisibleRegionTargets } from "./retainedVisibleCoveragePlanner";
import { chooseStableZoomBucket } from "./textureResolution";
import type { GpuRect } from "./viewportMath";

export type {
  RetainedContentTexturePageContentSegment,
  RetainedContentTexturePageFrameSurface,
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePagePreparedFrame,
} from "./retainedContentTexturePageManagerTypes";

const DEFAULT_RETAINED_PAGE_BUDGET: RetainedTextureUploadSchedulerBudget = {
  maxFrameRasterMs: 4,
  maxFrameUploadMs: 4,
  maxFrameUploadedBytes: 4 * 1024 * 1024,
  maxTextureMemoryBytes: 192 * 1024 * 1024,
  maxUploads: 1,
};
const DEFAULT_RETAINED_CONTENT_MAX_PAGE_PIXEL_SIZE = 1024;

export class RetainedContentTexturePageManager {
  private readonly budget: RetainedTextureUploadSchedulerBudget;
  private readonly cache: RetainedTexturePageCache<RetainedContentTextureResources>;
  private readonly device: GPUDevice;
  private readonly format: GPUTextureFormat;
  private readonly maxPagePixelSize: number;
  private readonly scratchCanvas: HTMLCanvasElement;
  private readonly textureBudget: RetainedTextureBudget;
  private readonly textureAtlasStore: RetainedContentTextureAtlasStore;
  private readonly textureUsage: GPUTextureUsageFlags;
  private readonly workQueue = new RetainedTextureWorkQueue();
  private readonly workCostEstimator =
    new RetainedTexturePageWorkCostEstimator();
  private readonly contentIdentityResolver =
    new RetainedTexturePageContentIdentityResolver();
  private drawableRevision = 0;
  private maintenanceUploadedDrawCommandCount = 0;
  private retiredResourceDrainRequestedFrame = Number.NEGATIVE_INFINITY;
  private retiredResourceDrainScheduled = false;
  private frameSurfaceById = new Map<
    string,
    RetainedContentTexturePageFrameSurface
  >();
  private devicePixelRatioBucket = 1;
  private projectionHorizonGeneration = 0;
  private projectionHorizonSignature = "";
  private viewportZoomBucket: number | null = null;
  private targetLodScale = 1;

  constructor(
    device: GPUDevice,
    ownerDocument: Document,
    options: RetainedContentTexturePageManagerOptions = {},
  ) {
    this.textureBudget = resolveRetainedContentTexturePageTextureBudget({
      defaultMaxTextureMemoryBytes:
        DEFAULT_RETAINED_PAGE_BUDGET.maxTextureMemoryBytes,
      schedulerBudget: options.budget,
      textureBudget: options.textureBudget,
    });
    this.budget = normalizeRetainedContentTexturePageBudget({
      ...DEFAULT_RETAINED_PAGE_BUDGET,
      ...options.budget,
      maxTextureMemoryBytes: this.textureBudget.hardMaxBytes,
    });
    this.cache = new RetainedTexturePageCache({
      destroyResource: destroyRetainedContentTextureResources,
    });
    this.device = device;
    this.format = options.format ?? "rgba8unorm";
    this.maxPagePixelSize =
      options.maxPagePixelSize ??
      Math.min(
        DEFAULT_RETAINED_CONTENT_MAX_PAGE_PIXEL_SIZE,
        device.limits?.maxTextureDimension2D ??
          DEFAULT_RETAINED_CONTENT_MAX_PAGE_PIXEL_SIZE,
      );
    this.scratchCanvas =
      options.scratchCanvas ?? ownerDocument.createElement("canvas");
    this.textureUsage = options.textureUsage ?? getHtmlSurfaceTextureUsage();
    this.textureAtlasStore = createRetainedContentTextureAtlasStore({
      device,
      format: this.format,
      maxPagePixelSize: this.maxPagePixelSize,
      textureUsage: this.textureUsage,
    });
  }

  destroy() {
    this.cache.clear();
    this.textureAtlasStore.destroy();
    this.workQueue.clear();
    this.workCostEstimator.clear();
    this.frameSurfaceById.clear();
    this.contentIdentityResolver.clear();
    this.drawableRevision += 1;
    this.devicePixelRatioBucket = 1;
    this.projectionHorizonGeneration = 0;
    this.projectionHorizonSignature = "";
    this.viewportZoomBucket = null;
    this.targetLodScale = 1;
    this.retiredResourceDrainRequestedFrame = Number.NEGATIVE_INFINITY;
    this.retiredResourceDrainScheduled = false;
  }

  getDrawableRevision(): number {
    return this.drawableRevision;
  }

  resolveFrameViewportZoomBucket({
    viewportInteractionActive = false,
    zoom,
  }: {
    readonly viewportInteractionActive?: boolean | undefined;
    readonly zoom: number;
  }): number {
    if (this.viewportZoomBucket === null) {
      this.viewportZoomBucket = chooseStableZoomBucket(zoom);
      return this.viewportZoomBucket;
    }
    if (viewportInteractionActive) {
      return this.viewportZoomBucket;
    }
    this.viewportZoomBucket = chooseStableZoomBucket(zoom, {
      currentZoomBucket: this.viewportZoomBucket,
    });
    return this.viewportZoomBucket;
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
    const descriptors = this.resolvePageDescriptorsForSurfaceRect({
      sourceRect: sourceRect ?? surface.visibleSourceRectCss,
      surface,
    });
    this.enqueueDescriptorWork({
      descriptors,
      frame,
      kind: "content-rect",
      priority,
    });
    return descriptors.length > 0;
  }

  hasFreshSurfaceContentForRect({
    sourceRect,
    surfaceId,
  }: RetainedContentTexturePageFreshnessQuery): boolean {
    const surface = this.frameSurfaceById.get(surfaceId);
    if (!surface) {
      return false;
    }
    const descriptors = this.resolvePageDescriptorsForSurfaceRect({
      sourceRect,
      surface,
    });
    return (
      descriptors.length > 0 &&
      descriptors.every((descriptor) =>
        Boolean(
          this.cache.getCommittedPage(retainedTexturePageKey(descriptor)),
        ),
      )
    );
  }

  prepareFrame({
    devicePixelRatio,
    frame,
    surfaces,
    viewportZoomBucket,
  }: Pick<
    RetainedContentTexturePageFrameInput,
    "devicePixelRatio" | "frame" | "surfaces" | "viewportZoomBucket"
  >): RetainedContentTexturePagePreparedFrame {
    this.devicePixelRatioBucket = devicePixelRatio;
    this.viewportZoomBucket = viewportZoomBucket;
    this.frameSurfaceById = new Map(
      surfaces.map((surface) => [surface.surfaceId, surface]),
    );
    this.updateProjectionHorizonGeneration({
      devicePixelRatio,
      surfaces,
      viewportZoomBucket,
    });
    const nextTargetLodScale = normalizeRetainedContentTexturePageLodScale({
      devicePixelRatio,
      viewportZoomBucket,
    });
    if (nextTargetLodScale !== this.targetLodScale) {
      this.workQueue.cancelLodRefinement(
        (item) => item.targetLod !== nextTargetLodScale,
      );
      this.targetLodScale = nextTargetLodScale;
    }

    const finishVisibleTargetMeasure = startGpuFlowPerformanceMeasure(
      "retained-visible-targets",
      {
        frame,
        surfaceCount: surfaces.length,
        viewportZoomBucket,
      },
    );
    const visibleRegionTargets = createRetainedVisibleRegionTargets({
      devicePixelRatioBucket: this.devicePixelRatioBucket,
      lodScale: this.targetLodScale,
      surfaces,
      viewportZoomBucket: this.viewportZoomBucket ?? 0,
    });
    finishVisibleTargetMeasure();
    return {
      ...this.createVisibleCoverageFrame({
        frame,
        visibleRegionTargets,
      }),
      frame,
    };
  }

  runPostSubmitMaintenance({
    darkMode = false,
    preparedFrame,
    preserveFirstVisibleSourceRects = false,
    publishedProtectedPageKeys,
    refreshFirstVisiblePages = false,
    switchAnimations,
    viewportInteractionActive = false,
  }: RetainedContentTexturePageMaintenanceInput): RetainedContentTexturePageMaintenanceResult {
    const finishQueueMeasure = startGpuFlowPerformanceMeasure(
      "retained-work-queue-coalescing",
      {
        frame: preparedFrame.frame,
        replacementDescriptorCount: preparedFrame.replacementDescriptors.length,
      },
    );
    try {
      this.enqueueMissingReplacementPages(
        preparedFrame.replacementDescriptors,
        preparedFrame.frame,
        preserveFirstVisibleSourceRects,
        refreshFirstVisiblePages,
      );
    } finally {
      finishQueueMeasure();
    }
    this.maintenanceUploadedDrawCommandCount = 0;
    const queuedWorkCountBeforeUpload = this.workQueue.size;
    const palette = getGpuRetainedContentCanvasPalette(darkMode);
    const finishSchedulerMeasure = startGpuFlowPerformanceMeasure(
      "retained-work-scheduler",
      {
        frame: preparedFrame.frame,
        queuedWorkCount: queuedWorkCountBeforeUpload,
        viewportInteractionActive,
      },
    );
    const uploadResult = runRetainedTextureUploadScheduler({
      budget: this.budget,
      deadlineMs: this.budget.maxFrameRasterMs + this.budget.maxFrameUploadMs,
      estimateWorkItem: (item) => this.estimateWorkItem(item),
      executeWorkItem: (item) =>
        this.executeWorkItem({
          frame: preparedFrame.frame,
          item,
          palette,
          switchAnimations,
        }),
      pageWorkBudget: {
        activeIslandReserveBytes: this.textureBudget.activeIslandReserveBytes,
        interactionFrameMaxMs:
          this.budget.maxFrameRasterMs + this.budget.maxFrameUploadMs,
        prefetchMaxBytes: this.textureBudget.offscreenPrefetchMaxBytes,
        refinementMaxBytes: this.textureBudget.nearViewportReserveBytes,
        visibleCoverageReserveBytes: this.textureBudget.visibleReserveBytes,
        visibleEdgeMaxUploads: this.budget.maxUploads,
      },
      queue: this.workQueue,
      textureBudget: this.textureBudget,
      viewportInteractionActive,
    });
    finishSchedulerMeasure();
    const postMaintenancePageVisualResult =
      this.createPostMaintenanceCoverageFrame({
        preparedFrame,
        uploadCount: uploadResult.uploadCount,
      });
    const finishEvictionMeasure = startGpuFlowPerformanceMeasure(
      "retained-texture-eviction",
      {
        frame: preparedFrame.frame,
        maxBytes: this.textureBudget.hardMaxBytes,
      },
    );
    const evicted = this.cache.evictToBudget({
      frame: preparedFrame.frame,
      maxBytes: this.textureBudget.hardMaxBytes,
      protectedPageKeys: resolveRetainedPageEvictionProtectedKeys({
        postMaintenancePageVisualResult,
        preparedFrame,
        publishedProtectedPageKeys,
      }),
    });
    finishEvictionMeasure();
    if (evicted.evictedKeys.length > 0) {
      this.drawableRevision += 1;
    }
    this.scheduleRetiredResourceDrain(preparedFrame.frame);
    return createRetainedContentTexturePageMaintenanceResult({
      evicted,
      memory: this.cache.snapshot(),
      postMaintenancePageVisualResult,
      preparedFrame,
      queuedWorkCount: this.workQueue.size,
      queuedWorkCountBeforeUpload,
      uploadedDrawCommandCount: this.maintenanceUploadedDrawCommandCount,
      uploadResult,
    });
  }

  deferPostSubmitMaintenance({
    preparedFrame,
  }: {
    readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  }): RetainedContentTexturePageMaintenanceResult {
    return createDeferredRetainedContentTexturePageMaintenanceResult({
      memory: this.cache.snapshot(),
      preparedFrame,
      queuedWorkCount: this.workQueue.size,
    });
  }

  private resolveDescriptorContentVersions({
    descriptors,
    surface,
  }: {
    readonly descriptors: readonly RetainedTexturePageDescriptor[];
    readonly surface: RetainedContentTexturePageFrameSurface;
  }): readonly RetainedTexturePageDescriptor[] {
    return this.contentIdentityResolver.resolveDescriptors({
      descriptors,
      surface,
    });
  }

  private createPageDescriptors({
    lodScale = this.targetLodScale,
    sourceRect,
    surface,
    visualEpochKind = "base",
  }: {
    readonly lodScale?: number | undefined;
    readonly sourceRect: GpuRect;
    readonly surface: RetainedContentTexturePageFrameSurface;
    readonly visualEpochKind?:
      | RetainedTexturePageDescriptor["visualEpochKind"]
      | undefined;
  }): readonly RetainedTexturePageDescriptor[] {
    return this.resolveDescriptorContentVersions({
      descriptors: createRetainedTexturePageDescriptors({
        contentBoundsCss: surface.contentBoundsCss,
        contentVersion: surface.contentVersion,
        devicePixelRatioBucket: this.devicePixelRatioBucket,
        lodScale,
        maxPagePixelSize: this.maxPagePixelSize,
        sourceKey: surface.sourceKey,
        sourceVersion: surface.sourceVersion,
        sourceWindowCss: surface.sourceWindowCss,
        surfaceId: surface.surfaceId,
        visibleSourceRectCss: sourceRect,
        visualEpochKind,
        viewportZoomBucket: this.viewportZoomBucket ?? 0,
      }),
      surface,
    });
  }

  private enqueueMissingReplacementPages(
    replacementDescriptors: readonly RetainedContentTexturePageReplacementDescriptor[],
    frame: number,
    preserveFirstVisibleSourceRects: boolean,
    refreshFirstVisiblePages: boolean,
  ) {
    this.cancelStaleFirstVisibleReplacementWork(replacementDescriptors);
    for (const replacementDescriptor of sortReplacementDescriptorsForRepair(
      replacementDescriptors,
    )) {
      this.enqueueMissingReplacementPage(
        replacementDescriptor,
        frame,
        preserveFirstVisibleSourceRects,
        refreshFirstVisiblePages,
      );
    }
  }

  private enqueueMissingReplacementPage(
    {
      descriptor,
      replacementRequest,
    }: RetainedContentTexturePageReplacementDescriptor,
    frame: number,
    preserveFirstVisibleSourceRects: boolean,
    refreshFirstVisiblePages: boolean,
  ) {
    const isVisibleRefinement =
      replacementRequest.priority === "visible-refinement";
    if (refreshFirstVisiblePages && !isVisibleRefinement) {
      this.enqueueDescriptorWorkForReplacement({
        descriptor,
        frame,
        isVisibleRefinement,
        preserveFirstVisibleSourceRects,
        refreshCommittedPage: true,
      });
      return;
    }
    const committedPage = this.cache.getCommittedPage(
      retainedTexturePageKey(descriptor),
    );
    if (!committedPage) {
      this.enqueueDescriptorWorkForReplacement({
        descriptor,
        frame,
        isVisibleRefinement,
        preserveFirstVisibleSourceRects,
      });
      return;
    }
    if (
      !rectsEqual(
        committedPage.descriptor.sourceWindowCss,
        descriptor.sourceWindowCss,
      )
    ) {
      this.enqueueDescriptorWorkForReplacement({
        descriptor,
        frame,
        isVisibleRefinement,
        preserveFirstVisibleSourceRects,
        refreshCommittedPage: true,
      });
      return;
    }
    if (
      !isCommittedRetainedPageCompatibleWithReplacementTarget({
        committedPage,
        replacementDescriptor: { descriptor, replacementRequest },
      })
    ) {
      this.enqueueDescriptorWorkForReplacement({
        descriptor,
        frame,
        isVisibleRefinement,
        preserveFirstVisibleSourceRects,
        refreshCommittedPage: true,
      });
      return;
    }
    if (isVisibleRefinement) {
      return;
    }
  }

  private enqueueDescriptorWorkForReplacement({
    descriptor,
    frame,
    isVisibleRefinement,
    preserveFirstVisibleSourceRects,
    refreshCommittedPage = false,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly frame: number;
    readonly isVisibleRefinement: boolean;
    readonly preserveFirstVisibleSourceRects: boolean;
    readonly refreshCommittedPage?: boolean | undefined;
  }) {
    this.enqueueDescriptorWork({
      descriptors: [descriptor],
      frame,
      kind: isVisibleRefinement ? "lod-refinement" : "first-visible",
      preserveFirstVisibleSourceRects,
      priority: "visible",
      refreshCommittedPage,
      ...(isVisibleRefinement ? { targetLod: descriptor.lodScale } : {}),
    });
  }

  private cancelStaleFirstVisibleReplacementWork(
    replacementDescriptors: readonly RetainedContentTexturePageReplacementDescriptor[],
  ) {
    const visibleHoleSurfaceEpochKeys = new Set(
      replacementDescriptors
        .filter(
          ({ replacementRequest }) =>
            replacementRequest.priority === "visible-hole",
        )
        .map(({ descriptor }) =>
          retainedFirstVisibleSurfaceEpochKey(descriptor),
        ),
    );
    if (visibleHoleSurfaceEpochKeys.size === 0) {
      return;
    }
    this.workQueue.cancelFirstVisible((item) =>
      visibleHoleSurfaceEpochKeys.has(
        retainedFirstVisibleSurfaceEpochKey(item),
      ),
    );
  }

  private enqueueDescriptorWork({
    descriptors,
    frame,
    kind,
    priority,
    refreshCommittedPage,
    targetLod,
  }: {
    readonly descriptors: readonly RetainedTexturePageDescriptor[];
    readonly frame: number;
    readonly kind: RetainedTextureWorkItem["kind"];
    readonly preserveFirstVisibleSourceRects?: boolean | undefined;
    readonly priority: NodeTexturePriority;
    readonly refreshCommittedPage?: boolean | undefined;
    readonly targetLod?: number | undefined;
  }) {
    for (const descriptor of descriptors) {
      this.workQueue.enqueue({
        contentVersion: descriptor.contentVersion,
        createdFrame: frame,
        kind,
        priority,
        projectionHorizonGeneration:
          retainedTextureWorkProjectionHorizonGeneration({
            generation: this.projectionHorizonGeneration,
            kind,
          }),
        refreshCommittedPage,
        sourceRect: descriptor.sourceRectCss,
        sourceRectCoalescing:
          retainedTextureDescriptorSourceRectCoalescing(kind),
        sourceWindow: descriptor.sourceWindowCss,
        surfaceId: descriptor.surfaceId,
        visualEpochKind: descriptor.visualEpochKind ?? "base",
        ...(targetLod === undefined ? {} : { targetLod }),
      });
    }
  }

  private createVisibleCoverageFrame({
    frame,
    visibleRegionTargets,
  }: {
    readonly frame: number;
    readonly visibleRegionTargets: RetainedContentTexturePagePreparedFrame["visibleRegionTargets"];
  }): RetainedContentTexturePageVisibleCoverageFrame {
    const finishMeasure = startGpuFlowPerformanceMeasure(
      "retained-visible-coverage-planning",
      {
        frame,
        targetCount: visibleRegionTargets.length,
      },
    );
    try {
      return createRetainedContentTexturePageVisibleCoverageFrame({
        cache: this.cache,
        createPageDescriptors: (input) => this.createPageDescriptors(input),
        frame,
        frameSurfaceById: this.frameSurfaceById,
        visibleRegionTargets,
      });
    } finally {
      finishMeasure();
    }
  }

  private updateProjectionHorizonGeneration({
    devicePixelRatio,
    surfaces,
    viewportZoomBucket,
  }: {
    readonly devicePixelRatio: number;
    readonly surfaces: readonly RetainedContentTexturePageFrameSurface[];
    readonly viewportZoomBucket: number;
  }) {
    const nextSignature = createRetainedTextureProjectionHorizonSignature({
      devicePixelRatio,
      surfaces,
      viewportZoomBucket,
    });
    if (nextSignature === this.projectionHorizonSignature) {
      return;
    }
    this.projectionHorizonSignature = nextSignature;
    this.projectionHorizonGeneration += 1;
    const currentGeneration = this.projectionHorizonGeneration;
    this.workQueue.cancelWork((item) =>
      isRetainedTextureWorkStaleForProjectionHorizon({
        currentGeneration,
        item,
        surfaces,
      }),
    );
  }

  private createPostMaintenanceCoverageFrame({
    preparedFrame,
    uploadCount,
  }: {
    readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
    readonly uploadCount: number;
  }): RetainedContentTexturePagePreparedFrame {
    if (uploadCount === 0) {
      return preparedFrame;
    }
    return {
      ...this.createVisibleCoverageFrame({
        frame: preparedFrame.frame,
        visibleRegionTargets: preparedFrame.visibleRegionTargets,
      }),
      frame: preparedFrame.frame,
    };
  }

  private estimateWorkItem(item: RetainedTextureWorkItem): {
    readonly rasterMs: number;
    readonly uploadMs: number;
    readonly uploadedBytes: number;
    readonly uploadCount: number;
  } {
    const descriptor = this.resolveWorkItemDescriptors(item)[0];
    const surface = descriptor
      ? this.frameSurfaceById.get(descriptor.surfaceId)
      : undefined;
    return descriptor && surface
      ? this.workCostEstimator.estimate({ descriptor, surface })
      : {
          rasterMs: 0,
          uploadMs: 0,
          uploadedBytes: 0,
          uploadCount: 0,
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
  }): RetainedTextureWorkExecutionResult {
    return executeRetainedContentTextureWorkItem({
      cache: this.cache,
      enqueueDescriptorWork: (input) => this.enqueueDescriptorWork(input),
      frame,
      item,
      palette,
      resolveWorkItemDescriptors: (workItem) =>
        this.resolveWorkItemDescriptors(workItem),
      switchAnimations,
      uploadPage: (input) => this.uploadPage(input),
    });
  }

  private resolveWorkItemDescriptors(
    item: RetainedTextureWorkItem,
  ): readonly RetainedTexturePageDescriptor[] {
    const surface = this.frameSurfaceById.get(item.surfaceId);
    if (!surface) {
      return [];
    }
    if (!shouldResolveRetainedTextureWorkItemForSurface({ item, surface })) {
      return [];
    }
    const visibleSourceRectCss =
      item.sourceRect ?? surface.visibleSourceRectCss;
    return this.resolvePageDescriptorsForSurfaceRect({
      lodScale: item.targetLod ?? this.targetLodScale,
      sourceRect: visibleSourceRectCss,
      surface,
      visualEpochKind: item.visualEpochKind,
    }).filter((descriptor) =>
      this.shouldUploadDescriptorForWorkItem({ descriptor, item }),
    );
  }

  private shouldUploadDescriptorForWorkItem({
    descriptor,
    item,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly item: RetainedTextureWorkItem;
  }): boolean {
    if (descriptor.contentVersion !== item.contentVersion) {
      return false;
    }
    if (shouldRefreshCommittedPage(item)) {
      return true;
    }
    return !this.cache.getCommittedPage(retainedTexturePageKey(descriptor));
  }

  private resolvePageDescriptorsForSurfaceRect({
    lodScale = this.targetLodScale,
    sourceRect,
    surface,
    visualEpochKind = "base",
  }: {
    readonly lodScale?: number | undefined;
    readonly sourceRect: GpuRect;
    readonly surface: RetainedContentTexturePageFrameSurface;
    readonly visualEpochKind?:
      | RetainedTexturePageDescriptor["visualEpochKind"]
      | undefined;
  }): readonly RetainedTexturePageDescriptor[] {
    return this.createPageDescriptors({
      lodScale,
      sourceRect,
      surface,
      visualEpochKind,
    });
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
  }): {
    readonly complete: boolean;
    readonly rasterMs: number;
    readonly uploadCount: number;
    readonly uploadedBytes: number;
    readonly uploadMs: number;
  } {
    const surface = this.frameSurfaceById.get(descriptor.surfaceId);
    const result = uploadRetainedContentTexturePage({
      cache: this.cache,
      descriptor,
      device: this.device,
      format: this.format,
      frame,
      frameSurfaceById: this.frameSurfaceById,
      palette,
      scratchCanvas: this.scratchCanvas,
      switchAnimations,
      textureAtlasStore: this.textureAtlasStore,
      textureUsage: this.textureUsage,
    });
    this.maintenanceUploadedDrawCommandCount += result.drawnCommandCount;
    if (result.drawableChanged) {
      this.drawableRevision += 1;
    }
    if (surface && result.uploadCount > 0) {
      this.workCostEstimator.record({
        descriptor,
        rasterMs: result.rasterMs,
        surface,
        uploadMs: result.uploadMs,
      });
    }
    return {
      complete: result.complete,
      rasterMs: result.rasterMs,
      uploadCount: result.uploadCount,
      uploadedBytes: result.uploadedBytes,
      uploadMs: result.uploadMs,
    };
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

function createRetainedContentTextureAtlasStore({
  device,
  format,
  maxPagePixelSize,
  textureUsage,
}: {
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  readonly maxPagePixelSize: number;
  readonly textureUsage: GPUTextureUsageFlags;
}): RetainedContentTextureAtlasStore {
  return new RetainedContentTextureAtlasStore({
    device,
    format,
    maxPagePixelSize,
    maxTextureDimension2D:
      device.limits?.maxTextureDimension2D ?? maxPagePixelSize,
    textureUsage,
  });
}
