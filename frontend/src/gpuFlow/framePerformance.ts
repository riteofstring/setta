import type { GpuFrameReason } from "./gpuRenderer";
import type { RenderHtmlSurfaceFrameResult } from "./htmlSurfaces/frame";
import type { HtmlSurfaceTextureDirtyWorkCounts } from "./htmlSurfaces/textureUploadDiagnostics";
import type { GpuFlowInteractionDiagnostics } from "./interactionDiagnostics";
import { normalizeGpuViewport, type GpuViewportInput } from "./viewportMath";

export type GpuFlowFramePerformanceInput = {
  readonly deferResolutionUpdates: boolean;
  readonly frame: number;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly interactionDiagnostics?: GpuFlowInteractionDiagnostics | undefined;
  readonly layerResult: RenderHtmlSurfaceFrameResult;
  readonly renderDurationMs: number;
  readonly retainedTexturePages?:
    | GpuFlowRetainedTexturePageFrameMetrics
    | undefined;
  readonly viewport: GpuViewportInput;
  readonly viewportFrame: boolean;
};

export type GpuFlowRetainedTexturePageFrameMetrics = {
  readonly budgetExhausted: boolean;
  readonly coverageCandidateCount: number;
  readonly diagnosticCount: number;
  readonly drawQuadCount: number;
  readonly evictedBytes: number;
  readonly evictedCount: number;
  readonly compatibleDrawQuadCount: number;
  readonly memoryCommittedBytes: number;
  readonly memoryCommittedCount: number;
  readonly memoryRetiredBytes: number;
  readonly memoryRetiredCount: number;
  readonly memoryTotalBytes: number;
  readonly mergedDrawQuadCount: number;
  readonly refinementPageCount: number;
  readonly rasterMs: number;
  readonly rejectedStaleRectCount: number;
  readonly targetDescriptorCount: number;
  readonly trueHoleRectCount: number;
  readonly uploadedBytes: number;
  readonly uploadedDrawCommandCount: number;
  readonly uploadCount: number;
  readonly uploadMs: number;
};

export type GpuFlowFrameUploadDiagnostic = {
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly dirtyContent: boolean;
  readonly dirtyResolution: boolean;
  readonly dirtySourceRect: {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  } | null;
  readonly dirtyTileBytes: number;
  readonly dirtyTileCount: number;
  readonly durationMs: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly priority: string;
  readonly reasons: readonly string[];
  readonly surfaceId: string;
  readonly textureBytes: number;
  readonly textureLayoutKind: string;
  readonly uploadedBytes: number;
  readonly uploadedTextureCount: number;
  readonly uploadedTileCount: number;
  readonly workKinds: readonly string[];
};

type GpuFlowFrameTextureLifecycleDiagnostic = {
  readonly committed: RenderHtmlSurfaceFrameResult["textureLifecycleDiagnostics"][number]["committed"];
  readonly pending: RenderHtmlSurfaceFrameResult["textureLifecycleDiagnostics"][number]["pending"];
  readonly pendingResolution: RenderHtmlSurfaceFrameResult["textureLifecycleDiagnostics"][number]["pendingResolution"];
  readonly priority: string;
  readonly surfaceId: string;
};

export type GpuFlowFramePerformanceEvent = {
  readonly activeNodeId: string | null;
  readonly activeNodePresent: boolean;
  readonly budgetExhausted: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly domTransformParkedNodeCount: number;
  readonly domTransformUpdatedNodeCount: number;
  readonly drawnEdgeCount: number;
  readonly drawnNodeCount: number;
  readonly durationMs: number;
  readonly edgeVertexCount: number;
  readonly evictedTextureBytes: number;
  readonly evictedTextureNodeCount: number;
  readonly frame: number;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly interactionDiagnostics: GpuFlowInteractionDiagnostics | null;
  readonly missingElementNodeCount: number;
  readonly missingTextureNodeCount: number;
  readonly remainingDirtyNodeCount: number;
  readonly retainedTexturePageBudgetExhausted: boolean;
  readonly retainedTexturePageCoverageCandidateCount: number;
  readonly retainedTexturePageDiagnosticCount: number;
  readonly retainedTexturePageDrawQuadCount: number;
  readonly retainedTexturePageEvictedBytes: number;
  readonly retainedTexturePageEvictedCount: number;
  readonly retainedTexturePageCompatibleDrawQuadCount: number;
  readonly retainedTexturePageMemoryCommittedBytes: number;
  readonly retainedTexturePageMemoryCommittedCount: number;
  readonly retainedTexturePageMemoryRetiredBytes: number;
  readonly retainedTexturePageMemoryRetiredCount: number;
  readonly retainedTexturePageMemoryTotalBytes: number;
  readonly retainedTexturePageMergedDrawQuadCount: number;
  readonly retainedTexturePageRefinementPageCount: number;
  readonly retainedTexturePageRasterMs: number;
  readonly retainedTexturePageRejectedStaleRectCount: number;
  readonly retainedTexturePageTargetDescriptorCount: number;
  readonly retainedTexturePageTrueHoleRectCount: number;
  readonly retainedTexturePageUploadedBytes: number;
  readonly retainedTexturePageUploadedDrawCommandCount: number;
  readonly retainedTexturePageUploadCount: number;
  readonly retainedTexturePageUploadMs: number;
  readonly skippedNodeCount: number;
  readonly solidRoundedRectSurfaceCount: number;
  readonly textureMemoryAllocatedBytes: number;
  readonly textureMemoryBeforeEvictionAllocatedBytes: number;
  readonly textureMemoryBeforeEvictionCount: number;
  readonly textureMemoryCount: number;
  readonly textureMemoryLargestBytes: number;
  readonly textureMemoryVisibleBytes: number;
  readonly textureMemoryVisibleCount: number;
  readonly textureLifecycleDiagnosticCount: number;
  readonly textureLifecycleDiagnostics: readonly GpuFlowFrameTextureLifecycleDiagnostic[];
  readonly textureUploadDeferredSurfaceCount: number;
  readonly textureUploadInitialDirtyWorkCounts: HtmlSurfaceTextureDirtyWorkCounts;
  readonly textureUploadInitialDirtySurfaceCount: number;
  readonly textureUploadNoWorkReason: string | null;
  readonly textureUploadPaintUnavailableSurfaceCount: number;
  readonly textureUploadRemainingDirtyWorkCounts: HtmlSurfaceTextureDirtyWorkCounts;
  readonly textureUploadRemainingDirtySurfaceCount: number;
  readonly textureUploadSkippedSurfaceCount: number;
  readonly textureUploadUploadableRemainingDirtyWorkCounts: HtmlSurfaceTextureDirtyWorkCounts;
  readonly textureUploadUploadableRemainingDirtySurfaceCount: number;
  readonly textureUploadUploadedSurfaceCount: number;
  readonly uploadDiagnosticCount: number;
  readonly uploadDiagnostics: readonly GpuFlowFrameUploadDiagnostic[];
  readonly uploadedNodeCount: number;
  readonly viewport: {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
  };
  readonly viewportFrame: boolean;
  readonly visibleNodeCount: number;
};

export type GpuFlowFramePerformanceReporter = {
  readonly isEnabled?: (() => boolean) | undefined;
  readonly onFrame: (event: GpuFlowFramePerformanceEvent) => void;
};

export function createGpuFlowFramePerformanceEvent({
  deferResolutionUpdates,
  frame,
  frameReasons,
  interactionDiagnostics,
  layerResult,
  renderDurationMs,
  retainedTexturePages,
  viewport,
  viewportFrame,
}: GpuFlowFramePerformanceInput): GpuFlowFramePerformanceEvent {
  const normalizedViewport = normalizeGpuViewport(viewport);
  const textureMemory = layerResult.textureMemory;
  const textureMemoryBeforeEviction = layerResult.textureMemoryBeforeEviction;
  const textureLifecycleDiagnostics = layerResult.textureLifecycleDiagnostics;
  const uploadWorkSummary = layerResult.uploadWorkSummary;
  const uploadDiagnostics = layerResult.uploadDiagnostics;
  const retainedTexturePageFields =
    createRetainedTexturePagePerformanceFields(retainedTexturePages);
  return {
    activeNodeId: layerResult.activeNodeId,
    activeNodePresent: layerResult.activeNodeId !== null,
    budgetExhausted: layerResult.budgetExhausted,
    deferResolutionUpdates,
    domTransformParkedNodeCount: layerResult.domTransformParkedNodeIds.length,
    domTransformUpdatedNodeCount: layerResult.domTransformUpdatedNodeIds.length,
    drawnEdgeCount: layerResult.drawnEdgeIds.length,
    drawnNodeCount: layerResult.drawnNodeIds.length,
    durationMs: renderDurationMs,
    edgeVertexCount: layerResult.edgeVertexCount,
    evictedTextureBytes: layerResult.evictedTextureBytes,
    evictedTextureNodeCount: layerResult.evictedTextureNodeIds.length,
    frame,
    frameReasons: [...frameReasons],
    interactionDiagnostics: interactionDiagnostics ?? null,
    missingElementNodeCount: layerResult.missingElementNodeIds.length,
    missingTextureNodeCount: layerResult.missingTextureNodeIds.length,
    remainingDirtyNodeCount: layerResult.remainingDirtyNodeIds.length,
    ...retainedTexturePageFields,
    skippedNodeCount: layerResult.skippedNodeIds.length,
    solidRoundedRectSurfaceCount:
      layerResult.visualScene.solidRoundedRectSurfaces.length,
    textureMemoryAllocatedBytes: textureMemory.allocatedBytes,
    textureMemoryBeforeEvictionAllocatedBytes:
      textureMemoryBeforeEviction.allocatedBytes,
    textureMemoryBeforeEvictionCount: textureMemoryBeforeEviction.textureCount,
    textureMemoryCount: textureMemory.textureCount,
    textureMemoryLargestBytes: textureMemory.largestTextureBytes,
    textureMemoryVisibleBytes: textureMemory.visibleBytes,
    textureMemoryVisibleCount: textureMemory.visibleTextureCount,
    textureLifecycleDiagnosticCount: textureLifecycleDiagnostics.length,
    textureLifecycleDiagnostics: createTextureLifecycleDiagnostics(
      textureLifecycleDiagnostics,
    ),
    textureUploadDeferredSurfaceCount: uploadWorkSummary.deferredSurfaceCount,
    textureUploadInitialDirtyWorkCounts: {
      ...uploadWorkSummary.initialDirtyWorkCounts,
    },
    textureUploadInitialDirtySurfaceCount:
      uploadWorkSummary.initialDirtySurfaceCount,
    textureUploadNoWorkReason: uploadWorkSummary.noUploadReason,
    textureUploadPaintUnavailableSurfaceCount:
      uploadWorkSummary.paintUnavailableSurfaceCount,
    textureUploadRemainingDirtyWorkCounts: {
      ...uploadWorkSummary.remainingDirtyWorkCounts,
    },
    textureUploadRemainingDirtySurfaceCount:
      uploadWorkSummary.remainingDirtySurfaceCount,
    textureUploadSkippedSurfaceCount: uploadWorkSummary.skippedSurfaceCount,
    textureUploadUploadableRemainingDirtyWorkCounts: {
      ...uploadWorkSummary.uploadableRemainingDirtyWorkCounts,
    },
    textureUploadUploadableRemainingDirtySurfaceCount:
      uploadWorkSummary.uploadableRemainingDirtySurfaceCount,
    textureUploadUploadedSurfaceCount: uploadWorkSummary.uploadedSurfaceCount,
    uploadDiagnosticCount: uploadDiagnostics.length,
    uploadDiagnostics: createUploadDiagnostics(uploadDiagnostics),
    uploadedNodeCount: layerResult.uploadedNodeIds.length,
    viewport: {
      x: normalizedViewport.x,
      y: normalizedViewport.y,
      zoom: normalizedViewport.zoom,
    },
    viewportFrame,
    visibleNodeCount: layerResult.visibleNodeIds.length,
  };
}

function createRetainedTexturePagePerformanceFields(
  retainedTexturePages: GpuFlowRetainedTexturePageFrameMetrics | undefined,
): Pick<
  GpuFlowFramePerformanceEvent,
  | "retainedTexturePageBudgetExhausted"
  | "retainedTexturePageCoverageCandidateCount"
  | "retainedTexturePageDiagnosticCount"
  | "retainedTexturePageDrawQuadCount"
  | "retainedTexturePageEvictedBytes"
  | "retainedTexturePageEvictedCount"
  | "retainedTexturePageCompatibleDrawQuadCount"
  | "retainedTexturePageMemoryCommittedBytes"
  | "retainedTexturePageMemoryCommittedCount"
  | "retainedTexturePageMemoryRetiredBytes"
  | "retainedTexturePageMemoryRetiredCount"
  | "retainedTexturePageMemoryTotalBytes"
  | "retainedTexturePageMergedDrawQuadCount"
  | "retainedTexturePageRefinementPageCount"
  | "retainedTexturePageRasterMs"
  | "retainedTexturePageRejectedStaleRectCount"
  | "retainedTexturePageTargetDescriptorCount"
  | "retainedTexturePageTrueHoleRectCount"
  | "retainedTexturePageUploadedBytes"
  | "retainedTexturePageUploadedDrawCommandCount"
  | "retainedTexturePageUploadCount"
  | "retainedTexturePageUploadMs"
> {
  if (!retainedTexturePages) {
    return {
      retainedTexturePageBudgetExhausted: false,
      retainedTexturePageCoverageCandidateCount: 0,
      retainedTexturePageDiagnosticCount: 0,
      retainedTexturePageDrawQuadCount: 0,
      retainedTexturePageEvictedBytes: 0,
      retainedTexturePageEvictedCount: 0,
      retainedTexturePageCompatibleDrawQuadCount: 0,
      retainedTexturePageMemoryCommittedBytes: 0,
      retainedTexturePageMemoryCommittedCount: 0,
      retainedTexturePageMemoryRetiredBytes: 0,
      retainedTexturePageMemoryRetiredCount: 0,
      retainedTexturePageMemoryTotalBytes: 0,
      retainedTexturePageMergedDrawQuadCount: 0,
      retainedTexturePageRefinementPageCount: 0,
      retainedTexturePageRasterMs: 0,
      retainedTexturePageRejectedStaleRectCount: 0,
      retainedTexturePageTargetDescriptorCount: 0,
      retainedTexturePageTrueHoleRectCount: 0,
      retainedTexturePageUploadedBytes: 0,
      retainedTexturePageUploadedDrawCommandCount: 0,
      retainedTexturePageUploadCount: 0,
      retainedTexturePageUploadMs: 0,
    };
  }
  return {
    retainedTexturePageBudgetExhausted: retainedTexturePages.budgetExhausted,
    retainedTexturePageCoverageCandidateCount:
      retainedTexturePages.coverageCandidateCount,
    retainedTexturePageDiagnosticCount: retainedTexturePages.diagnosticCount,
    retainedTexturePageDrawQuadCount: retainedTexturePages.drawQuadCount,
    retainedTexturePageEvictedBytes: retainedTexturePages.evictedBytes,
    retainedTexturePageEvictedCount: retainedTexturePages.evictedCount,
    retainedTexturePageCompatibleDrawQuadCount:
      retainedTexturePages.compatibleDrawQuadCount,
    retainedTexturePageMemoryCommittedBytes:
      retainedTexturePages.memoryCommittedBytes,
    retainedTexturePageMemoryCommittedCount:
      retainedTexturePages.memoryCommittedCount,
    retainedTexturePageMemoryRetiredBytes:
      retainedTexturePages.memoryRetiredBytes,
    retainedTexturePageMemoryRetiredCount:
      retainedTexturePages.memoryRetiredCount,
    retainedTexturePageMemoryTotalBytes: retainedTexturePages.memoryTotalBytes,
    retainedTexturePageMergedDrawQuadCount:
      retainedTexturePages.mergedDrawQuadCount,
    retainedTexturePageRefinementPageCount:
      retainedTexturePages.refinementPageCount,
    retainedTexturePageRasterMs: retainedTexturePages.rasterMs,
    retainedTexturePageRejectedStaleRectCount:
      retainedTexturePages.rejectedStaleRectCount,
    retainedTexturePageTargetDescriptorCount:
      retainedTexturePages.targetDescriptorCount,
    retainedTexturePageTrueHoleRectCount:
      retainedTexturePages.trueHoleRectCount,
    retainedTexturePageUploadedBytes: retainedTexturePages.uploadedBytes,
    retainedTexturePageUploadedDrawCommandCount:
      retainedTexturePages.uploadedDrawCommandCount,
    retainedTexturePageUploadCount: retainedTexturePages.uploadCount,
    retainedTexturePageUploadMs: retainedTexturePages.uploadMs,
  };
}

function createTextureLifecycleDiagnostics(
  diagnostics: RenderHtmlSurfaceFrameResult["textureLifecycleDiagnostics"],
): readonly GpuFlowFrameTextureLifecycleDiagnostic[] {
  return diagnostics.slice(0, 12).map((diagnostic) => ({
    committed: { ...diagnostic.committed },
    pending: diagnostic.pending ? { ...diagnostic.pending } : null,
    pendingResolution: diagnostic.pendingResolution
      ? { ...diagnostic.pendingResolution }
      : null,
    priority: diagnostic.priority,
    surfaceId: diagnostic.surfaceId,
  }));
}

function createUploadDiagnostics(
  diagnostics: RenderHtmlSurfaceFrameResult["uploadDiagnostics"],
): readonly GpuFlowFrameUploadDiagnostic[] {
  return diagnostics.slice(0, 12).map((diagnostic) => ({
    cssHeight: diagnostic.cssHeight,
    cssWidth: diagnostic.cssWidth,
    dirtyContent: diagnostic.dirtyContent,
    dirtyResolution: diagnostic.dirtyResolution,
    dirtySourceRect: diagnostic.dirtySourceRect
      ? {
          height: diagnostic.dirtySourceRect.height,
          width: diagnostic.dirtySourceRect.width,
          x: diagnostic.dirtySourceRect.x,
          y: diagnostic.dirtySourceRect.y,
        }
      : null,
    dirtyTileBytes: diagnostic.dirtyTileBytes,
    dirtyTileCount: diagnostic.dirtyTileCount,
    durationMs: diagnostic.durationMs,
    pixelHeight: diagnostic.pixelHeight,
    pixelWidth: diagnostic.pixelWidth,
    priority: diagnostic.priority,
    reasons: [...diagnostic.reasons],
    surfaceId: diagnostic.surfaceId,
    textureBytes: diagnostic.textureBytes,
    textureLayoutKind: diagnostic.textureLayoutKind,
    uploadedBytes: diagnostic.uploadedBytes,
    uploadedTextureCount: diagnostic.uploadedTextureCount,
    uploadedTileCount: diagnostic.uploadedTileCount,
    workKinds: [...diagnostic.workKinds],
  }));
}
