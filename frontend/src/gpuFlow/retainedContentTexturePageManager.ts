import type { NodeTexturePriority } from "./dirtyTracking";
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
  normalizeRetainedContentTexturePageBudget,
  normalizeRetainedContentTexturePageLodScale,
} from "./retainedContentTexturePageBudget";
import {
  EMPTY_TEXT_LIKE_SNAPSHOT_ELEMENTS,
  areRetainedContentTexturePageTextLikeSnapshotsReady,
  resolveRetainedContentTexturePageTextLikeSnapshots,
  uploadRetainedContentTexturePageTextLikeSnapshots,
  type RetainedContentTexturePageTextLikeSnapshot,
} from "./retainedContentTexturePageTextLikeSnapshots";
import {
  createRetainedTexturePageDescriptors,
  resolveRetainedTexturePageCoverage,
  type RetainedTexturePageDrawQuad,
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
import { chooseStableZoomBucket } from "./textureResolution";
import type { GpuRect } from "./viewportMath";

export type RetainedContentTexturePageFrameSurface = {
  readonly contentBoundsCss: GpuRect;
  readonly contentSegments?:
    | readonly RetainedContentTexturePageContentSegment[]
    | undefined;
  readonly contentVersion: number;
  readonly layout: RetainedTexturePageSurfaceLayout;
  readonly rasterScene: GpuRetainedContentScene;
  readonly sourceWindowCss: GpuRect;
  readonly surfaceId: string;
  readonly textLikeSnapshots?:
    | readonly RetainedContentTexturePageTextLikeSnapshot[]
    | undefined;
  readonly visibleSourceRectCss: GpuRect;
};

export type RetainedContentTexturePageContentSegment = {
  readonly contentVersion: number;
  readonly id: string;
  readonly rectCss: GpuRect;
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
  readonly coverageCandidateCount: number;
  readonly diagnostics: readonly RetainedTextureUploadSchedulerDiagnostic[];
  readonly drawQuadCount: number;
  readonly evicted: RetainedTexturePageEvictionResult;
  readonly fallbackDrawQuadCount: number;
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly memory: RetainedTexturePageCacheSnapshot;
  readonly missingPageCount: number;
  readonly needsFollowUpFrame: boolean;
  readonly mergedDrawQuadCount: number;
  readonly rasterMs: number;
  readonly staleFallbackDrawQuadCount: number;
  readonly targetDescriptorCount: number;
  readonly uncoveredRectCount: number;
  readonly uploadedBytes: number;
  readonly uploadedDrawCommandCount: number;
  readonly uploadCount: number;
  readonly uploadMs: number;
};

export type RetainedContentTexturePagePreparedFrame = {
  readonly coverageCandidateCount: number;
  readonly drawQuadCount: number;
  readonly drawQuads: readonly RetainedTexturePageDrawQuad<HtmlSurfaceTextureResources>[];
  readonly fallbackDrawQuadCount: number;
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly frame: number;
  readonly missingPageCount: number;
  readonly mergedDrawQuadCount: number;
  readonly protectedPageKeys: readonly string[];
  readonly refinementDescriptors: readonly RetainedTexturePageDescriptor[];
  readonly staleFallbackDrawQuadCount: number;
  readonly targetDescriptors: readonly RetainedTexturePageDescriptor[];
  readonly uncoveredRectCount: number;
};

export type RetainedContentTexturePageMaintenanceInput = {
  readonly darkMode?: boolean | undefined;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
  readonly textLikeSnapshotElementById?: ReadonlyMap<string, HTMLElement>;
  readonly viewportInteractionActive?: boolean | undefined;
};

export type RetainedContentTexturePageMaintenanceResult = Omit<
  RetainedContentTexturePageFrameResult,
  "flatSurfaces" | "missingPageCount"
> & {
  readonly coverageCandidateCount: number;
  readonly drawQuadCount: number;
  readonly executedItemCount: number;
  readonly fallbackDrawQuadCount: number;
  readonly mergedDrawQuadCount: number;
  readonly missingPageCount: number;
  readonly needsFollowUpFrame: boolean;
  readonly postMaintenanceMissingPageCount: number;
  readonly queuedWorkCount: number;
  readonly queuedWorkCountBeforeUpload: number;
  readonly remainingUploadableWorkCount: number;
  readonly skippedItemCount: number;
  readonly staleFallbackDrawQuadCount: number;
  readonly targetDescriptorCount: number;
  readonly uncoveredRectCount: number;
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

export type RetainedContentTexturePageFreshnessQuery = {
  readonly sourceRect: GpuRect;
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
  private readonly pageContentVersions = new Map<string, number>();
  private maintenanceUploadedDrawCommandCount = 0;
  private nextPageContentVersion = 1;
  private retiredResourceDrainRequestedFrame = Number.NEGATIVE_INFINITY;
  private retiredResourceDrainScheduled = false;
  private frameSurfaceById = new Map<
    string,
    RetainedContentTexturePageFrameSurface
  >();
  private viewportZoomBucket: number | null = null;
  private targetLodScale = 1;

  constructor(
    device: GPUDevice,
    ownerDocument: Document,
    options: RetainedContentTexturePageManagerOptions = {},
  ) {
    this.budget = normalizeRetainedContentTexturePageBudget({
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
    this.pageContentVersions.clear();
    this.nextPageContentVersion = 1;
    this.viewportZoomBucket = null;
    this.targetLodScale = 1;
    this.retiredResourceDrainRequestedFrame = Number.NEGATIVE_INFINITY;
    this.retiredResourceDrainScheduled = false;
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
      queue: this.workQueue,
      viewportInteractionActive,
    });
    const postMaintenancePageVisualResult = this.createPageVisuals({
      desiredPages: preparedFrame.targetDescriptors,
      frame: preparedFrame.frame,
    });
    const evicted = this.cache.evictToBudget({
      frame: preparedFrame.frame,
      maxBytes: this.budget.maxTextureMemoryBytes,
      protectedPageKeys: [
        ...preparedFrame.protectedPageKeys,
        ...postMaintenancePageVisualResult.protectedPageKeys,
      ],
    });
    this.scheduleRetiredResourceDrain(preparedFrame.frame);
    const committedRefinementChangedDrawableCoverage =
      uploadResult.uploadCount > 0 &&
      didRetainedPageVisualCoverageChange({
        after: postMaintenancePageVisualResult,
        before: preparedFrame,
      });

    return {
      budgetExhausted: uploadResult.budgetExhausted,
      coverageCandidateCount: preparedFrame.coverageCandidateCount,
      diagnostics: uploadResult.diagnostics,
      evicted,
      executedItemCount: uploadResult.executedItems.length,
      memory: this.cache.snapshot(),
      missingPageCount: preparedFrame.missingPageCount,
      needsFollowUpFrame:
        uploadResult.budgetExhausted ||
        committedRefinementChangedDrawableCoverage,
      postMaintenanceMissingPageCount:
        postMaintenancePageVisualResult.missingPageCount,
      queuedWorkCount: this.workQueue.size,
      queuedWorkCountBeforeUpload,
      rasterMs: uploadResult.rasterMs,
      drawQuadCount: preparedFrame.drawQuadCount,
      fallbackDrawQuadCount: preparedFrame.fallbackDrawQuadCount,
      mergedDrawQuadCount: preparedFrame.mergedDrawQuadCount,
      remainingUploadableWorkCount: uploadResult.remainingUploadableWorkCount,
      skippedItemCount: uploadResult.skippedItems.length,
      staleFallbackDrawQuadCount: preparedFrame.staleFallbackDrawQuadCount,
      targetDescriptorCount: preparedFrame.targetDescriptors.length,
      uncoveredRectCount: preparedFrame.uncoveredRectCount,
      uploadedBytes: uploadResult.uploadedBytes,
      uploadedDrawCommandCount: this.maintenanceUploadedDrawCommandCount,
      uploadCount: uploadResult.uploadCount,
      uploadMs: uploadResult.uploadMs,
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
          lodScale: this.targetLodScale,
          maxPagePixelSize: this.maxPagePixelSize,
          sourceWindowCss: surface.sourceWindowCss,
          surfaceId: surface.surfaceId,
          visibleSourceRectCss: surface.visibleSourceRectCss,
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
    const segments = surface.contentSegments ?? [];
    if (segments.length === 0) {
      return descriptors;
    }
    return descriptors.map((descriptor) => ({
      ...descriptor,
      contentVersion: this.resolvePageContentVersion({
        descriptor,
        segments,
        surfaceContentVersion: surface.contentVersion,
      }),
    }));
  }

  private resolvePageContentVersion({
    descriptor,
    segments,
    surfaceContentVersion,
  }: {
    readonly descriptor: RetainedTexturePageDescriptor;
    readonly segments: readonly RetainedContentTexturePageContentSegment[];
    readonly surfaceContentVersion: number;
  }): number {
    const intersectingSegments = segments
      .filter((segment) =>
        rectsIntersect(segment.rectCss, descriptor.sourceRectCss),
      )
      .map((segment) => ({
        contentVersion: segment.contentVersion,
        id: segment.id,
        rectCss: segment.rectCss,
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
    if (intersectingSegments.length === 0) {
      return surfaceContentVersion;
    }
    return this.resolvePageContentVersionId({
      intersectingSegments,
      sourceRectCss: descriptor.sourceRectCss,
      surfaceContentVersion,
    });
  }

  private resolvePageContentVersionId(input: {
    readonly intersectingSegments: readonly {
      readonly contentVersion: number;
      readonly id: string;
      readonly rectCss: GpuRect;
    }[];
    readonly sourceRectCss: GpuRect;
    readonly surfaceContentVersion: number;
  }): number {
    const signature = JSON.stringify(input);
    const existing = this.pageContentVersions.get(signature);
    if (existing !== undefined) {
      return existing;
    }
    const version = this.nextPageContentVersion;
    this.nextPageContentVersion += 1;
    this.pageContentVersions.set(signature, version);
    return version;
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
        lodScale,
        maxPagePixelSize: this.maxPagePixelSize,
        sourceWindowCss: surface.sourceWindowCss,
        surfaceId: surface.surfaceId,
        visibleSourceRectCss: sourceRect,
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
      this.enqueueDescriptorWork({
        descriptors: [descriptor],
        frame,
        kind: "lod-refinement",
        priority: "visible",
        targetLod: descriptor.lodScale,
      });
    }
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
    readonly missingPageCount: number;
    readonly protectedPageKeys: readonly string[];
    readonly refinementDescriptors: readonly RetainedTexturePageDescriptor[];
    readonly drawQuads: readonly RetainedTexturePageDrawQuad<HtmlSurfaceTextureResources>[];
    readonly drawQuadCount: number;
    readonly fallbackDrawQuadCount: number;
    readonly coverageCandidateCount: number;
    readonly mergedDrawQuadCount: number;
    readonly staleFallbackDrawQuadCount: number;
    readonly uncoveredRectCount: number;
  } {
    const flatSurfaces: HtmlSurfaceFlatVisual[] = [];
    const drawQuads: RetainedTexturePageDrawQuad<HtmlSurfaceTextureResources>[] =
      [];
    const protectedPageKeys = new Set<string>();
    const refinementDescriptors: RetainedTexturePageDescriptor[] = [];
    let drawQuadCount = 0;
    let fallbackDrawQuadCount = 0;
    let coverageCandidateCount = 0;
    let mergedDrawQuadCount = 0;
    let missingPageCount = 0;
    let staleFallbackDrawQuadCount = 0;
    let uncoveredRectCount = 0;
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
      missingPageCount += coverage.refinementDescriptors.length;
      mergedDrawQuadCount += coverage.mergedDrawQuadCount;
      staleFallbackDrawQuadCount += coverage.staleFallbackDrawQuadCount;
      uncoveredRectCount += coverage.uncoveredRectsCss.length;
      drawQuads.push(...coverage.drawQuads);
      drawQuadCount += coverage.drawQuads.length;
      fallbackDrawQuadCount += coverage.drawQuads.filter(
        (drawQuad) => drawQuad.fallback,
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
    }
    return {
      coverageCandidateCount,
      drawQuadCount,
      drawQuads,
      fallbackDrawQuadCount,
      flatSurfaces,
      mergedDrawQuadCount,
      missingPageCount,
      protectedPageKeys: [...protectedPageKeys],
      refinementDescriptors,
      staleFallbackDrawQuadCount,
      uncoveredRectCount,
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
    if (
      shouldRefreshCommittedPage(item) ||
      !this.cache.getCommittedPage(retainedTexturePageKey(descriptor))
    ) {
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
      rasterMs = upload.rasterMs;
      uploadMs = upload.uploadMs;
      uploadedBytes = upload.uploadedBytes;
      uploadCount = 1;
    }
    if (shouldRefreshCommittedPage(item) && descriptors.length > 1) {
      this.enqueueDescriptorWork({
        descriptors: descriptors.slice(1),
        frame,
        kind: item.kind,
        priority: item.priority,
        ...(item.targetLod === undefined ? {} : { targetLod: item.targetLod }),
      });
    }
    return {
      complete: shouldRefreshCommittedPage(item) || descriptors.length <= 1,
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
    readonly rasterMs: number;
    readonly uploadedBytes: number;
    readonly uploadMs: number;
  } {
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
    const rasterResult = rasterizeGpuRetainedContentPage({
      canvas: this.scratchCanvas,
      ctx,
      lodScale: descriptor.lodScale,
      palette,
      scene: surface.rasterScene,
      sourceRectCss: descriptor.sourceRectCss,
      surfaceId: descriptor.surfaceId,
      switchAnimations,
    });
    this.maintenanceUploadedDrawCommandCount += rasterResult.drawnCommandCount;
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
    uploadRetainedContentTexturePageTextLikeSnapshots({
      descriptor,
      elementBySourceId: elementByTextLikeSnapshotSourceId,
      queue: this.device.queue,
      resource,
      snapshots: resolveRetainedContentTexturePageTextLikeSnapshots({
        descriptor,
        surface,
      }),
    });
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

function shouldRefreshCommittedPage(item: RetainedTextureWorkItem): boolean {
  return (
    item.kind === "animation-rect" ||
    item.kind === "content-rect" ||
    item.kind === "full-content" ||
    item.kind === "hover-rect"
  );
}

function didRetainedPageVisualCoverageChange({
  after,
  before,
}: {
  readonly after: Pick<
    RetainedContentTexturePagePreparedFrame,
    | "drawQuadCount"
    | "fallbackDrawQuadCount"
    | "missingPageCount"
    | "uncoveredRectCount"
  >;
  readonly before: Pick<
    RetainedContentTexturePagePreparedFrame,
    | "drawQuadCount"
    | "fallbackDrawQuadCount"
    | "missingPageCount"
    | "uncoveredRectCount"
  >;
}): boolean {
  return (
    after.drawQuadCount !== before.drawQuadCount ||
    after.fallbackDrawQuadCount !== before.fallbackDrawQuadCount ||
    after.missingPageCount !== before.missingPageCount ||
    after.uncoveredRectCount !== before.uncoveredRectCount
  );
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
