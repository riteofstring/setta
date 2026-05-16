import type { NodeTexturePriority } from "./dirtyTracking";
import type {
  HtmlSurfaceFlatVisual,
  HtmlSurfaceSolidRoundedRectVisual,
} from "./htmlSurfaces/visualScene";
import type { RetainedFidelityState } from "./retainedContentLifecycle";
import type { GpuRetainedContentScene } from "./retainedContentScene";
import type { GpuRetainedContentSwitchAnimationStore } from "./retainedContentSwitchAnimation";
import type { RetainedContentTexturePageTextLikeSnapshot } from "./retainedContentTexturePageTextLikeSnapshots";
import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
import type { RetainedTextureBudget } from "./retainedTextureBudget";
import type {
  RetainedTexturePageCacheSnapshot,
  RetainedTexturePageDescriptor,
  RetainedTexturePageEvictionResult,
  RetainedTexturePageRejectedCoverage,
} from "./retainedTexturePages";
import type { RetainedTexturePageSurfaceLayout } from "./retainedTexturePageVisuals";
import type {
  RetainedTextureUploadSchedulerBudget,
  RetainedTextureUploadSchedulerDiagnostic,
} from "./retainedTextureUploadScheduler";
import type {
  RetainedDrawRegion,
  RetainedReplacementRequest,
  RetainedVisibleCoveragePlan,
  RetainedVisibleRegionTarget,
} from "./retainedVisibleCoveragePlanner";
import type { RetainedVisualEpoch } from "./retainedVisualEpochs";
import type { GpuRect } from "./viewportMath";

export type RetainedContentTexturePageFrameSurface = {
  readonly contentBoundsCss: GpuRect;
  readonly contentSegments?: readonly RetainedContentTexturePageContentSegment[];
  readonly contentVersion: number;
  readonly layout: RetainedTexturePageSurfaceLayout;
  readonly rasterScene: GpuRetainedContentScene;
  readonly sourceKey: string;
  readonly sourceVersion: number;
  readonly sourceWindowCss: GpuRect;
  readonly surfaceId: string;
  readonly textLikeSnapshots?: readonly RetainedContentTexturePageTextLikeSnapshot[];
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
  readonly switchAnimations?: GpuRetainedContentSwitchAnimationStore;
  readonly viewportInteractionActive?: boolean | undefined;
  readonly viewportZoomBucket: number;
};

type RetainedContentTexturePageFrameResult = {
  readonly budgetExhausted: boolean;
  readonly coverageCandidateCount: number;
  readonly diagnostics: readonly RetainedTextureUploadSchedulerDiagnostic[];
  readonly drawQuadCount: number;
  readonly evicted: RetainedTexturePageEvictionResult;
  readonly compatibleDrawQuadCount: number;
  readonly fidelityState: RetainedFidelityState;
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly memory: RetainedTexturePageCacheSnapshot;
  readonly refinementPageCount: number;
  readonly needsFollowUpFrame: boolean;
  readonly mergedDrawQuadCount: number;
  readonly trueHoleVisuals: readonly HtmlSurfaceSolidRoundedRectVisual[];
  readonly rasterMs: number;
  readonly rejectedStaleRectCount: number;
  readonly targetDescriptorCount: number;
  readonly trueHoleRectCount: number;
  readonly uploadedBytes: number;
  readonly uploadedDrawCommandCount: number;
  readonly uploadCount: number;
  readonly uploadMs: number;
};

export type RetainedContentTexturePageReplacementDescriptor = {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly replacementRequest: RetainedReplacementRequest;
  readonly snapshotBlockSequence: number | null;
  readonly snapshotRequired: boolean;
};

export type RetainedContentTexturePagePreparedFrame = {
  readonly coveragePlan: RetainedVisibleCoveragePlan<RetainedContentTextureResources>;
  readonly coverageCandidateCount: number;
  readonly drawRegions: readonly RetainedDrawRegion<RetainedContentTextureResources>[];
  readonly drawQuadCount: number;
  readonly compatibleDrawQuadCount: number;
  readonly fidelityState: RetainedFidelityState;
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly frame: number;
  readonly refinementPageCount: number;
  readonly mergedDrawQuadCount: number;
  readonly trueHoleVisuals: readonly HtmlSurfaceSolidRoundedRectVisual[];
  readonly protectedPageKeys: readonly string[];
  readonly rejectedStaleRects: readonly RetainedTexturePageRejectedCoverage[];
  readonly replacementDescriptors: readonly RetainedContentTexturePageReplacementDescriptor[];
  readonly replacementRequests: readonly RetainedReplacementRequest[];
  readonly refinementDescriptors: readonly RetainedTexturePageDescriptor[];
  readonly rejectedStaleRectCount: number;
  readonly trueHoleRectsCss: readonly GpuRect[];
  readonly trueHoleRectCount: number;
  readonly visibleRegionTargets: readonly RetainedVisibleRegionTarget[];
  readonly visualEpochs: readonly RetainedVisualEpoch[];
};

export type RetainedContentTexturePageMaintenanceInput = {
  readonly darkMode?: boolean | undefined;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly publishedProtectedPageKeys?: readonly string[] | undefined;
  readonly preserveFirstVisibleSourceRects?: boolean | undefined;
  readonly refreshFirstVisiblePages?: boolean | undefined;
  readonly switchAnimations?: GpuRetainedContentSwitchAnimationStore;
  readonly textLikeSnapshotElementById?: ReadonlyMap<string, HTMLElement>;
  readonly viewportInteractionActive?: boolean | undefined;
};

export type RetainedContentTexturePageMaintenanceResult = Omit<
  RetainedContentTexturePageFrameResult,
  "flatSurfaces" | "refinementPageCount"
> & {
  readonly coverageCandidateCount: number;
  readonly drawQuadCount: number;
  readonly executedItemCount: number;
  readonly compatibleDrawQuadCount: number;
  readonly fidelityState: RetainedFidelityState;
  readonly mergedDrawQuadCount: number;
  readonly refinementPageCount: number;
  readonly needsFollowUpFrame: boolean;
  readonly postMaintenanceRefinementPageCount: number;
  readonly queuedWorkCount: number;
  readonly queuedWorkCountBeforeUpload: number;
  readonly repairedPreparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly remainingUploadableWorkCount: number;
  readonly skippedItemCount: number;
  readonly rejectedStaleRectCount: number;
  readonly targetDescriptorCount: number;
  readonly trueHoleRectCount: number;
};

export type RetainedContentTexturePageManagerOptions = {
  readonly budget?: Partial<RetainedTextureUploadSchedulerBudget> | undefined;
  readonly format?: GPUTextureFormat | undefined;
  readonly maxPagePixelSize?: number | undefined;
  readonly scratchCanvas?: HTMLCanvasElement | undefined;
  readonly textureBudget?: Partial<RetainedTextureBudget> | undefined;
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
