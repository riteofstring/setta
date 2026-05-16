import type { NodeTexturePriority } from "./dirtyTracking";
import { getHtmlSurfaceTextureUsage } from "./htmlSurfaces/textureManagerHelpers";
import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
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
  combineRetainedContentTexturePageFidelityState,
  didRetainedPageVisualCoverageChange,
  isRetainedTextureWorkItemCompleteAfterPageUpload,
  rectsEqual,
  resolveRetainedPageEvictionProtectedKeys,
  shouldEnqueueRemainingRefreshDescriptors,
  shouldRefreshCommittedPage,
  shouldUploadRetainedTexturePage,
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
} from "./retainedContentTexturePageManagerTypes";
import {
  EMPTY_TEXT_LIKE_SNAPSHOT_ELEMENTS,
  areRetainedContentTexturePageTextLikeSnapshotsReady,
} from "./retainedContentTexturePageTextLikeSnapshots";
import { uploadRetainedContentTexturePage } from "./retainedContentTexturePageUploader";
import {
  RetainedContentTextureAtlasStore,
  destroyRetainedContentTextureResources,
  type RetainedContentTextureResources,
} from "./retainedContentTextureResources";
import type { RetainedTextureBudget } from "./retainedTextureBudget";
import {
  createRetainedTexturePageDescriptors,
  resolveRetainedTexturePageCoverage,
  type RetainedTexturePageDrawQuad,
} from "./retainedTexturePageGrid";
import {
  RetainedTexturePageCache,
  estimatePageByteSize,
  retainedTexturePageKey,
  type RetainedTexturePageDescriptor,
  type RetainedTexturePageRejectedCoverage,
} from "./retainedTexturePages";
import {
  createRetainedTexturePageFlatVisuals,
  createRetainedTexturePageTrueHoleVisuals,
} from "./retainedTexturePageVisuals";
import {
  runRetainedTextureUploadScheduler,
  type RetainedTextureUploadSchedulerBudget,
} from "./retainedTextureUploadScheduler";
import {
  RetainedTextureWorkQueue,
  type RetainedTextureWorkItem,
} from "./retainedTextureWorkQueue";
import { chooseStableZoomBucket } from "./textureResolution";
import type { GpuRect } from "./viewportMath";

export type {
  RetainedContentTexturePageContentSegment,
  RetainedContentTexturePageFrameInput,
  RetainedContentTexturePageFrameSurface,
  RetainedContentTexturePageFreshnessQuery,
  RetainedContentTexturePageInvalidation,
  RetainedContentTexturePageMaintenanceInput,
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePageManagerOptions,
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

    const desiredPages = this.resolveDesiredPages(surfaces);
    return {
      ...this.createPageVisuals({ desiredPages, frame }),
      frame,
      targetDescriptors: desiredPages,
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
    this.enqueueMissingPages(
      preparedFrame.refinementDescriptors,
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
        visibleEdgeMaxUploads: this.budget.maxUploads,
      },
      queue: this.workQueue,
      textureBudget: this.textureBudget,
      viewportInteractionActive,
    });
    const postMaintenancePageVisualResult = this.createPageVisuals({
      desiredPages: preparedFrame.targetDescriptors,
      frame: preparedFrame.frame,
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
    const committedRefinementChangedDrawableCoverage =
      uploadResult.uploadCount > 0 &&
      didRetainedPageVisualCoverageChange({
        after: postMaintenancePageVisualResult,
        before: preparedFrame,
      });
    const committedMissingPageCoverage =
      preparedFrame.refinementPageCount > 0 && uploadResult.uploadCount > 0;

    return {
      budgetExhausted: uploadResult.budgetExhausted,
      coverageCandidateCount: preparedFrame.coverageCandidateCount,
      diagnostics: uploadResult.diagnostics,
      evicted,
      executedItemCount: uploadResult.executedItems.length,
      memory: this.cache.snapshot(),
      refinementPageCount: preparedFrame.refinementPageCount,
      needsFollowUpFrame:
        uploadResult.budgetExhausted ||
        committedRefinementChangedDrawableCoverage ||
        committedMissingPageCoverage,
      trueHoleVisuals: preparedFrame.trueHoleVisuals,
      postMaintenanceRefinementPageCount:
        postMaintenancePageVisualResult.refinementPageCount,
      queuedWorkCount: this.workQueue.size,
      queuedWorkCountBeforeUpload,
      rasterMs: uploadResult.rasterMs,
      drawQuadCount: preparedFrame.drawQuadCount,
      compatibleDrawQuadCount: preparedFrame.compatibleDrawQuadCount,
      fidelityState: preparedFrame.fidelityState,
      mergedDrawQuadCount: preparedFrame.mergedDrawQuadCount,
      remainingUploadableWorkCount: uploadResult.remainingUploadableWorkCount,
      skippedItemCount: uploadResult.skippedItems.length,
      rejectedStaleRectCount: preparedFrame.rejectedStaleRectCount,
      targetDescriptorCount: preparedFrame.targetDescriptors.length,
      trueHoleRectCount: preparedFrame.trueHoleRectCount,
      uploadedBytes: uploadResult.uploadedBytes,
      uploadedDrawCommandCount: this.maintenanceUploadedDrawCommandCount,
      uploadCount: uploadResult.uploadCount,
      uploadMs: uploadResult.uploadMs,
    };
  }

  deferPostSubmitMaintenance({
    preparedFrame,
  }: {
    readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  }): RetainedContentTexturePageMaintenanceResult {
    return {
      budgetExhausted: false,
      coverageCandidateCount: preparedFrame.coverageCandidateCount,
      diagnostics: [],
      drawQuadCount: preparedFrame.drawQuadCount,
      evicted: {
        evictedBytes: 0,
        evictedKeys: [],
        remainingBytes: this.cache.snapshot().committedBytes,
      },
      executedItemCount: 0,
      compatibleDrawQuadCount: preparedFrame.compatibleDrawQuadCount,
      fidelityState: preparedFrame.fidelityState,
      memory: this.cache.snapshot(),
      mergedDrawQuadCount: preparedFrame.mergedDrawQuadCount,
      refinementPageCount: preparedFrame.refinementPageCount,
      needsFollowUpFrame: false,
      trueHoleVisuals: preparedFrame.trueHoleVisuals,
      postMaintenanceRefinementPageCount: preparedFrame.refinementPageCount,
      queuedWorkCount: this.workQueue.size,
      queuedWorkCountBeforeUpload: this.workQueue.size,
      rasterMs: 0,
      remainingUploadableWorkCount: 0,
      skippedItemCount: 0,
      rejectedStaleRectCount: preparedFrame.rejectedStaleRectCount,
      targetDescriptorCount: preparedFrame.targetDescriptors.length,
      trueHoleRectCount: preparedFrame.trueHoleRectCount,
      uploadedBytes: 0,
      uploadedDrawCommandCount: 0,
      uploadCount: 0,
      uploadMs: 0,
    };
  }

  private resolveDesiredPages(
    surfaces: readonly RetainedContentTexturePageFrameSurface[],
  ): readonly RetainedTexturePageDescriptor[] {
    return surfaces.flatMap((surface) =>
      this.resolveDescriptorContentVersions({
        descriptors: createRetainedTexturePageDescriptors({
          contentBoundsCss: surface.contentBoundsCss,
          contentVersion: surface.contentVersion,
          devicePixelRatioBucket: this.devicePixelRatioBucket,
          lodScale: this.targetLodScale,
          maxPagePixelSize: this.maxPagePixelSize,
          sourceKey: surface.sourceKey,
          sourceVersion: surface.sourceVersion,
          sourceWindowCss: surface.sourceWindowCss,
          surfaceId: surface.surfaceId,
          visibleSourceRectCss: surface.visibleSourceRectCss,
          viewportZoomBucket: this.viewportZoomBucket ?? 0,
        }),
        surface,
      }),
    );
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
  }: {
    readonly lodScale?: number | undefined;
    readonly sourceRect: GpuRect;
    readonly surface: RetainedContentTexturePageFrameSurface;
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
        viewportZoomBucket: this.viewportZoomBucket ?? 0,
      }),
      surface,
    });
  }

  private enqueueMissingPages(
    desiredPages: readonly RetainedTexturePageDescriptor[],
    frame: number,
  ) {
    for (const descriptor of desiredPages) {
      if (this.cache.getCommittedPage(retainedTexturePageKey(descriptor))) {
        continue;
      }
      const hasDrawableCompatibleCoverage =
        this.hasCommittedCompatibleCoverage(descriptor);
      this.enqueueDescriptorWork({
        descriptors: [descriptor],
        frame,
        kind: hasDrawableCompatibleCoverage
          ? "lod-refinement"
          : "first-visible",
        priority: "visible",
        ...(hasDrawableCompatibleCoverage
          ? { targetLod: descriptor.lodScale }
          : {}),
      });
    }
  }

  private hasCommittedCompatibleCoverage(
    descriptor: RetainedTexturePageDescriptor,
  ): boolean {
    const coverage = resolveRetainedTexturePageCoverage({
      cache: this.cache,
      desiredPages: [descriptor],
    });
    return (
      coverage.drawQuads.length > 0 && coverage.trueHoleRectsCss.length === 0
    );
  }

  private enqueueDescriptorWork({
    descriptors,
    frame,
    kind,
    priority,
    targetLod,
  }: {
    readonly descriptors: readonly RetainedTexturePageDescriptor[];
    readonly frame: number;
    readonly kind: RetainedTextureWorkItem["kind"];
    readonly priority: NodeTexturePriority;
    readonly targetLod?: number | undefined;
  }) {
    for (const descriptor of descriptors) {
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
  }

  private createPageVisuals({
    desiredPages,
    frame,
  }: {
    readonly desiredPages: readonly RetainedTexturePageDescriptor[];
    readonly frame: number;
  }): {
    readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
    readonly refinementPageCount: number;
    readonly trueHoleVisuals: RetainedContentTexturePagePreparedFrame["trueHoleVisuals"];
    readonly protectedPageKeys: readonly string[];
    readonly rejectedStaleRects: readonly RetainedTexturePageRejectedCoverage[];
    readonly refinementDescriptors: readonly RetainedTexturePageDescriptor[];
    readonly drawQuads: readonly RetainedTexturePageDrawQuad<RetainedContentTextureResources>[];
    readonly drawQuadCount: number;
    readonly compatibleDrawQuadCount: number;
    readonly fidelityState: RetainedContentTexturePagePreparedFrame["fidelityState"];
    readonly coverageCandidateCount: number;
    readonly mergedDrawQuadCount: number;
    readonly rejectedStaleRectCount: number;
    readonly trueHoleRectsCss: readonly GpuRect[];
    readonly trueHoleRectCount: number;
  } {
    const flatSurfaces: HtmlSurfaceFlatVisual[] = [];
    const trueHoleVisuals: RetainedContentTexturePagePreparedFrame["trueHoleVisuals"][number][] =
      [];
    const drawQuads: RetainedTexturePageDrawQuad<RetainedContentTextureResources>[] =
      [];
    const protectedPageKeys = new Set<string>();
    const rejectedStaleRects: RetainedTexturePageRejectedCoverage[] = [];
    const refinementDescriptors: RetainedTexturePageDescriptor[] = [];
    const trueHoleRectsCss: GpuRect[] = [];
    let drawQuadCount = 0;
    let compatibleDrawQuadCount = 0;
    let fidelityState: RetainedContentTexturePagePreparedFrame["fidelityState"] =
      "target";
    let coverageCandidateCount = 0;
    let mergedDrawQuadCount = 0;
    let refinementPageCount = 0;
    let rejectedStaleRectCount = 0;
    let trueHoleRectCount = 0;
    for (const surface of this.frameSurfaceById.values()) {
      const surfaceDesiredPages = desiredPages.filter(
        (page) => page.surfaceId === surface.surfaceId,
      );
      const coverage = resolveRetainedTexturePageCoverage({
        cache: this.cache,
        desiredPages: surfaceDesiredPages,
        usedFrame: frame,
      });
      coverageCandidateCount += coverage.coverageCandidateCount;
      refinementPageCount += coverage.refinementDescriptors.length;
      mergedDrawQuadCount += coverage.mergedDrawQuadCount;
      rejectedStaleRectCount += coverage.rejectedStaleRectCount;
      rejectedStaleRects.push(...coverage.rejectedStaleRects);
      fidelityState = combineRetainedContentTexturePageFidelityState(
        fidelityState,
        coverage.fidelityState,
      );
      trueHoleRectCount += coverage.trueHoleRectsCss.length;
      trueHoleRectsCss.push(...coverage.trueHoleRectsCss);
      drawQuads.push(...coverage.drawQuads);
      drawQuadCount += coverage.drawQuads.length;
      compatibleDrawQuadCount += coverage.drawQuads.filter(
        (drawQuad) => drawQuad.coverageKind === "compatible",
      ).length;
      refinementDescriptors.push(...coverage.refinementDescriptors);
      for (const pageKey of coverage.protectedPageKeys) {
        protectedPageKeys.add(pageKey);
      }
      flatSurfaces.push(
        ...createRetainedTexturePageFlatVisuals({
          drawQuads: coverage.drawQuads,
          layout: surface.layout,
        }),
      );
      trueHoleVisuals.push(
        ...createRetainedTexturePageTrueHoleVisuals({
          layout: surface.layout,
          trueHoleRects: coverage.trueHoleRects,
        }),
      );
    }
    return {
      coverageCandidateCount,
      drawQuadCount,
      drawQuads,
      compatibleDrawQuadCount,
      fidelityState,
      flatSurfaces,
      mergedDrawQuadCount,
      refinementPageCount,
      trueHoleVisuals,
      protectedPageKeys: [...protectedPageKeys],
      rejectedStaleRects,
      refinementDescriptors,
      rejectedStaleRectCount,
      trueHoleRectsCss,
      trueHoleRectCount,
    };
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
    let rasterMs = 0;
    let uploadMs = 0;
    let uploadedBytes = 0;
    let uploadCount = 0;
    let pageUploadComplete = true;
    const committedPagePresent = Boolean(
      this.cache.getCommittedPage(retainedTexturePageKey(descriptor)),
    );
    if (shouldUploadRetainedTexturePage({ committedPagePresent, item })) {
      if (
        !areRetainedContentTexturePageTextLikeSnapshotsReady({
          descriptor,
          elementBySourceId: textLikeSnapshotElementById,
          surface: this.frameSurfaceById.get(descriptor.surfaceId),
        })
      ) {
        return {
          complete: false,
          rasterMs: 0,
          uploadCount: 0,
          uploadedBytes: 0,
          uploadMs: 0,
        };
      }
      const upload = this.uploadPage({
        descriptor,
        elementByTextLikeSnapshotSourceId: textLikeSnapshotElementById,
        frame,
        palette,
        switchAnimations,
      });
      pageUploadComplete = upload.complete;
      rasterMs = upload.rasterMs;
      uploadMs = upload.uploadMs;
      uploadedBytes = upload.uploadedBytes;
      uploadCount = upload.uploadCount;
    }
    if (
      shouldEnqueueRemainingRefreshDescriptors({
        descriptorCount: descriptors.length,
        item,
        pageUploadComplete,
      })
    ) {
      this.enqueueDescriptorWork({
        descriptors: descriptors.slice(1),
        frame,
        kind: item.kind,
        priority: item.priority,
        ...(item.targetLod === undefined ? {} : { targetLod: item.targetLod }),
      });
    }
    return {
      complete: isRetainedTextureWorkItemCompleteAfterPageUpload({
        descriptorCount: descriptors.length,
        item,
        pageUploadComplete,
      }),
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
  }: {
    readonly lodScale?: number | undefined;
    readonly sourceRect: GpuRect;
    readonly surface: RetainedContentTexturePageFrameSurface;
  }): readonly RetainedTexturePageDescriptor[] {
    return this.createPageDescriptors({
      lodScale,
      sourceRect,
      surface,
    });
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
