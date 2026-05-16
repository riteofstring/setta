import type { NodeTexturePriority } from "./dirtyTracking";
import type { HtmlSurfaceFlatVisual } from "./htmlSurfaces/visualScene";
import type { GpuRetainedContentScene } from "./retainedContentScene";
import type { GpuRetainedContentSwitchAnimationStore } from "./retainedContentSwitchAnimation";
import type { RetainedContentTexturePageTextLikeSnapshot } from "./retainedContentTexturePageTextLikeSnapshots";
import type { RetainedContentTextureResources } from "./retainedContentTextureResources";
import type { RetainedTexturePageDrawQuad } from "./retainedTexturePageGrid";
import type { RetainedTexturePageSurfaceLayout } from "./retainedTexturePageVisuals";
import type {
  RetainedTexturePageCacheSnapshot,
  RetainedTexturePageDescriptor,
  RetainedTexturePageEvictionResult,
} from "./retainedTexturePages";
import type {
  RetainedTextureUploadSchedulerBudget,
  RetainedTextureUploadSchedulerDiagnostic,
} from "./retainedTextureUploadScheduler";
import type { GpuRect } from "./viewportMath";

export type RetainedContentTexturePageFrameSurface = {
  readonly contentBoundsCss: GpuRect;
  readonly contentSegments?: readonly RetainedContentTexturePageContentSegment[];
  readonly contentVersion: number;
  readonly layout: RetainedTexturePageSurfaceLayout;
  readonly rasterScene: GpuRetainedContentScene;
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
  readonly drawQuads: readonly RetainedTexturePageDrawQuad<RetainedContentTextureResources>[];
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
  readonly switchAnimations?: GpuRetainedContentSwitchAnimationStore;
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
