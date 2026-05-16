import type { NodeTexturePriority } from "./dirtyTracking";
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
import { EMPTY_TEXT_LIKE_SNAPSHOT_ELEMENTS } from "./retainedContentTexturePageTextLikeSnapshots";
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
  estimatePageByteSize,
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
const SNAPSHOT_EXACT_UNAVAILABLE_ATTEMPT_LIMIT = 30;

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
  private readonly contentIdentityResolver =
    new RetainedTexturePageContentIdentityResolver();
  private readonly snapshotBlockedSurfaceSequenceById = new Map<
    string,
    number
  >();
  private readonly snapshotExactAttemptCountByPageKey = new Map<
    string,
    number
  >();
  private readonly snapshotUnavailablePageKeys = new Set<string>();
  private snapshotBlockedSequence = 0;
  private drawableRevision = 0;
  private maintenanceUploadedDrawCommandCount = 0;
  private retiredResourceDrainRequestedFrame = Number.NEGATIVE_INFINITY;
  private retiredResourceDrainScheduled = false;
  private frameSurfaceById = new Map<
    string,
    RetainedContentTexturePageFrameSurface
  >();
  private devicePixelRatioBucket = 1;
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
    this.snapshotBlockedSurfaceSequenceById.clear();
    this.snapshotExactAttemptCountByPageKey.clear();
    this.snapshotUnavailablePageKeys.clear();
    this.snapshotBlockedSequence = 0;
    this.frameSurfaceById.clear();
    this.contentIdentityResolver.clear();
    this.drawableRevision += 1;
    this.devicePixelRatioBucket = 1;
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

    const visibleRegionTargets = createRetainedVisibleRegionTargets({
      devicePixelRatioBucket: this.devicePixelRatioBucket,
      lodScale: this.targetLodScale,
      surfaces,
      viewportZoomBucket: this.viewportZoomBucket ?? 0,
    });
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
    publishedProtectedPageKeys,
    switchAnimations,
    textLikeSnapshotElementById = EMPTY_TEXT_LIKE_SNAPSHOT_ELEMENTS,
    viewportInteractionActive = false,
  }: RetainedContentTexturePageMaintenanceInput): RetainedContentTexturePageMaintenanceResult {
    this.enqueueMissingReplacementPages(
      preparedFrame.replacementDescriptors,
      preparedFrame.frame,
    );
    this.maintenanceUploadedDrawCommandCount = 0;
    const queuedWorkCountBeforeUpload = this.workQueue.size;
    const palette = getGpuRetainedContentCanvasPalette(darkMode);
    const uploadResult = runRetainedTextureUploadScheduler({
      budget: this.budget,
      estimateWorkItem: (item) => this.estimateWorkItem(item),
      executeWorkItem: (item) =>
        this.executeWorkItem({
          frame: preparedFrame.frame,
          item,
          palette,
          switchAnimations,
          textLikeSnapshotElementById,
        }),
      pageWorkBudget: {
        activeIslandReserveBytes: this.textureBudget.activeIslandReserveBytes,
        interactionFrameMaxMs:
          this.budget.maxFrameRasterMs + this.budget.maxFrameUploadMs,
        prefetchMaxBytes: this.textureBudget.offscreenPrefetchMaxBytes,
        refinementMaxBytes: this.textureBudget.nearViewportReserveBytes,
        visibleCoverageReserveBytes: this.textureBudget.visibleReserveBytes,
        visibleEdgeMaxUploads: Math.max(
          this.budget.maxUploads,
          Math.ceil(
            this.textureBudget.visibleReserveBytes /
              Math.max(1, this.budget.maxFrameUploadedBytes),
          ),
        ),
      },
      queue: this.workQueue,
      textureBudget: this.textureBudget,
      viewportInteractionActive,
    });
    const postMaintenancePageVisualResult =
      this.createPostMaintenanceCoverageFrame({
        preparedFrame,
        uploadCount: uploadResult.uploadCount,
      });
    const evicted = this.cache.evictToBudget({
      frame: preparedFrame.frame,
      maxBytes: this.textureBudget.hardMaxBytes,
      protectedPageKeys: resolveRetainedPageEvictionProtectedKeys({
        postMaintenancePageVisualResult,
        preparedFrame,
        publishedProtectedPageKeys,
      }),
    });
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
    const pageSurface =
      visualEpochKind === "base"
        ? ({
            ...surface,
            textLikeSnapshots: [],
          } satisfies RetainedContentTexturePageFrameSurface)
        : surface;
    return this.resolveDescriptorContentVersions({
      descriptors: createRetainedTexturePageDescriptors({
        contentBoundsCss: pageSurface.contentBoundsCss,
        contentVersion: pageSurface.contentVersion,
        devicePixelRatioBucket: this.devicePixelRatioBucket,
        lodScale,
        maxPagePixelSize: this.maxPagePixelSize,
        sourceKey: pageSurface.sourceKey,
        sourceVersion: pageSurface.sourceVersion,
        sourceWindowCss: pageSurface.sourceWindowCss,
        surfaceId: pageSurface.surfaceId,
        visibleSourceRectCss: sourceRect,
        visualEpochKind,
        viewportZoomBucket: this.viewportZoomBucket ?? 0,
      }),
      surface: pageSurface,
    });
  }

  private enqueueMissingReplacementPages(
    replacementDescriptors: readonly RetainedContentTexturePageReplacementDescriptor[],
    frame: number,
  ) {
    this.cancelStaleFirstVisibleReplacementWork(replacementDescriptors);
    for (const replacementDescriptor of replacementDescriptors) {
      this.enqueueMissingReplacementPage(replacementDescriptor, frame);
    }
  }

  private enqueueMissingReplacementPage(
    {
      descriptor,
      replacementRequest,
    }: RetainedContentTexturePageReplacementDescriptor,
    frame: number,
  ) {
    const isVisibleRefinement =
      replacementRequest.priority === "visible-refinement";
    const committedPage = this.cache.getCommittedPage(
      retainedTexturePageKey(descriptor),
    );
    if (!committedPage) {
      this.enqueueDescriptorWorkForReplacement({
        descriptor,
        frame,
        isVisibleRefinement,
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
        refreshCommittedPage: true,
      });
      return;
    }
    if (isVisibleRefinement) {
      return;
    }
    this.enqueueSnapshotExactDescriptorsForCommittedBaseReplacement({
      descriptor,
      frame,
    });
  }

  private enqueueDescriptorWorkForReplacement({
    descriptor,
    frame,
    isVisibleRefinement,
    refreshCommittedPage = false,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly frame: number;
    readonly isVisibleRefinement: boolean;
    readonly refreshCommittedPage?: boolean | undefined;
  }) {
    this.enqueueDescriptorWork({
      descriptors: [descriptor],
      frame,
      kind: isVisibleRefinement ? "lod-refinement" : "first-visible",
      priority: "visible",
      refreshCommittedPage,
      ...(isVisibleRefinement ? { targetLod: descriptor.lodScale } : {}),
    });
  }

  private enqueueSnapshotExactDescriptorsForCommittedBaseReplacement({
    descriptor,
    frame,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly frame: number;
  }) {
    const exactDescriptors =
      this.createSnapshotExactDescriptorsForCommittedBaseReplacement(
        descriptor,
      );
    if (exactDescriptors.length === 0) {
      return;
    }
    this.enqueueDescriptorWork({
      descriptors: exactDescriptors,
      frame,
      kind: "first-visible",
      priority: "visible",
    });
  }

  private createSnapshotExactDescriptorsForCommittedBaseReplacement(
    descriptor: RetainedTexturePageDescriptor,
  ): readonly RetainedTexturePageDescriptor[] {
    const surface = this.frameSurfaceById.get(descriptor.surfaceId);
    if (!surface?.textLikeSnapshots?.length) {
      return [];
    }
    return this.createPageDescriptors({
      lodScale: descriptor.lodScale,
      sourceRect: descriptor.sourceRectCss,
      surface,
      visualEpochKind: "snapshot-exact",
    }).filter(
      (exactDescriptor) =>
        !this.snapshotUnavailablePageKeys.has(
          retainedTexturePageKey(exactDescriptor),
        ),
    );
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
        refreshCommittedPage,
        sourceRect: descriptor.sourceRectCss,
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
    return createRetainedContentTexturePageVisibleCoverageFrame({
      cache: this.cache,
      createPageDescriptors: (input) => this.createPageDescriptors(input),
      frame,
      frameSurfaceById: this.frameSurfaceById,
      snapshotBlockedSurfaceSequenceById:
        this.snapshotBlockedSurfaceSequenceById,
      snapshotUnavailablePageKeys: this.snapshotUnavailablePageKeys,
      visibleRegionTargets,
    });
  }

  private createPostMaintenanceCoverageFrame({
    preparedFrame,
    uploadCount,
  }: {
    readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
    readonly uploadCount: number;
  }):
    | RetainedContentTexturePagePreparedFrame
    | ReturnType<
        RetainedContentTexturePageManager["createVisibleCoverageFrame"]
      > {
    if (uploadCount === 0) {
      return preparedFrame;
    }
    return this.createVisibleCoverageFrame({
      frame: preparedFrame.frame,
      visibleRegionTargets: preparedFrame.visibleRegionTargets,
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
    frame,
    item,
    palette,
    switchAnimations,
    textLikeSnapshotElementById,
  }: {
    readonly frame: number;
    readonly item: RetainedTextureWorkItem;
    readonly palette: GpuRetainedContentCanvasPalette;
    readonly switchAnimations?:
      | GpuRetainedContentSwitchAnimationStore
      | undefined;
    readonly textLikeSnapshotElementById: ReadonlyMap<string, HTMLElement>;
  }): RetainedTextureWorkExecutionResult {
    return executeRetainedContentTextureWorkItem({
      cache: this.cache,
      clearSnapshotExactUnavailableState: (input) =>
        this.clearSnapshotExactUnavailableState(input),
      enqueueDescriptorWork: (input) => this.enqueueDescriptorWork(input),
      frame,
      frameSurfaceById: this.frameSurfaceById,
      item,
      palette,
      resolveSnapshotExactUnavailableResult: (descriptor) =>
        this.resolveSnapshotExactUnavailableResult(descriptor),
      resolveWorkItemDescriptors: (workItem) =>
        this.resolveWorkItemDescriptors(workItem),
      snapshotUnavailablePageKeys: this.snapshotUnavailablePageKeys,
      switchAnimations,
      textLikeSnapshotElementById,
      uploadPage: (input) => this.uploadPage(input),
    });
  }

  private clearSnapshotExactUnavailableState({
    descriptor,
    descriptorKey,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly descriptorKey: string;
  }) {
    this.snapshotExactAttemptCountByPageKey.delete(descriptorKey);
    this.snapshotUnavailablePageKeys.delete(descriptorKey);
    this.snapshotBlockedSurfaceSequenceById.delete(descriptor.surfaceId);
  }

  private resolveWorkItemDescriptors(
    item: RetainedTextureWorkItem,
  ): readonly RetainedTexturePageDescriptor[] {
    const surface = this.frameSurfaceById.get(item.surfaceId);
    if (!surface) {
      return [];
    }
    if (
      item.sourceWindow &&
      !rectsEqual(item.sourceWindow, surface.sourceWindowCss)
    ) {
      return [];
    }
    const visibleSourceRectCss =
      item.sourceRect ?? surface.visibleSourceRectCss;
    return this.resolvePageDescriptorsForSurfaceRect({
      lodScale: item.targetLod ?? this.targetLodScale,
      sourceRect: visibleSourceRectCss,
      surface,
      visualEpochKind: item.visualEpochKind,
    }).filter(
      (descriptor) =>
        descriptor.contentVersion === item.contentVersion &&
        (shouldRefreshCommittedPage(item) ||
          !this.cache.getCommittedPage(retainedTexturePageKey(descriptor))),
    );
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

  private markSnapshotBlockedSurface(surfaceId: string) {
    this.snapshotBlockedSurfaceSequenceById.set(
      surfaceId,
      this.snapshotBlockedSequence,
    );
    this.snapshotBlockedSequence += 1;
  }

  private resolveSnapshotExactUnavailableResult(
    descriptor: RetainedTexturePageDescriptor,
  ): {
    readonly complete: boolean;
    readonly rasterMs: number;
    readonly uploadCount: number;
    readonly uploadedBytes: number;
    readonly uploadMs: number;
  } {
    const descriptorKey = retainedTexturePageKey(descriptor);
    const attemptCount =
      (this.snapshotExactAttemptCountByPageKey.get(descriptorKey) ?? 0) + 1;
    if (attemptCount >= SNAPSHOT_EXACT_UNAVAILABLE_ATTEMPT_LIMIT) {
      this.snapshotExactAttemptCountByPageKey.delete(descriptorKey);
      this.snapshotUnavailablePageKeys.add(descriptorKey);
      this.snapshotBlockedSurfaceSequenceById.delete(descriptor.surfaceId);
      return {
        complete: true,
        rasterMs: 0,
        uploadCount: 0,
        uploadedBytes: 0,
        uploadMs: 0,
      };
    }
    this.snapshotExactAttemptCountByPageKey.set(descriptorKey, attemptCount);
    this.markSnapshotBlockedSurface(descriptor.surfaceId);
    return {
      complete: false,
      rasterMs: 0,
      uploadCount: 0,
      uploadedBytes: 0,
      uploadMs: 0,
    };
  }

  private uploadPage({
    descriptor,
    elementByTextLikeSnapshotSourceId,
    frame,
    palette,
    switchAnimations,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly elementByTextLikeSnapshotSourceId: ReadonlyMap<
      string,
      HTMLElement
    >;
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
    const result = uploadRetainedContentTexturePage({
      cache: this.cache,
      descriptor,
      device: this.device,
      elementByTextLikeSnapshotSourceId,
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

function retainedFirstVisibleSurfaceEpochKey({
  surfaceId,
  visualEpochKind,
}: Pick<RetainedTextureWorkItem, "surfaceId" | "visualEpochKind">): string {
  return `${surfaceId}:${visualEpochKind ?? "base"}`;
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
