import type { GpuFlowRetainedTexturePageFrameMetrics } from "../framePerformance";
import type { RetainedContentTexturePageMaintenanceResult } from "../retainedContentTexturePageManager";
import type { RetainedTextLikePreviewPageMaintenanceResult } from "../retainedTextLikePreviewPageManager";

export function combineGpuFlowRetainedTexturePageMetrics({
  retainedPageResult,
  retainedTextLikePreviewResult,
}: {
  readonly retainedPageResult: RetainedContentTexturePageMaintenanceResult;
  readonly retainedTextLikePreviewResult: RetainedTextLikePreviewPageMaintenanceResult;
}): GpuFlowRetainedTexturePageFrameMetrics {
  return {
    budgetExhausted:
      retainedPageResult.budgetExhausted ||
      retainedTextLikePreviewResult.budgetExhausted,
    coverageCandidateCount: retainedPageResult.coverageCandidateCount,
    diagnosticCount:
      retainedPageResult.diagnostics.length +
      retainedTextLikePreviewResult.diagnostics.length,
    drawQuadCount:
      retainedPageResult.drawQuadCount +
      retainedTextLikePreviewResult.drawQuadCount,
    evictedBytes:
      retainedPageResult.evicted.evictedBytes +
      retainedTextLikePreviewResult.evicted.evictedBytes,
    evictedCount:
      retainedPageResult.evicted.evictedKeys.length +
      retainedTextLikePreviewResult.evicted.evictedKeys.length,
    fallbackDrawQuadCount: retainedPageResult.fallbackDrawQuadCount,
    memoryCommittedBytes:
      retainedPageResult.memory.committedBytes +
      retainedTextLikePreviewResult.memory.committedBytes,
    memoryCommittedCount:
      retainedPageResult.memory.committedCount +
      retainedTextLikePreviewResult.memory.committedCount,
    memoryRetiredBytes:
      retainedPageResult.memory.retiredBytes +
      retainedTextLikePreviewResult.memory.retiredBytes,
    memoryRetiredCount:
      retainedPageResult.memory.retiredCount +
      retainedTextLikePreviewResult.memory.retiredCount,
    memoryTotalBytes:
      retainedPageResult.memory.totalBytes +
      retainedTextLikePreviewResult.memory.totalBytes,
    mergedDrawQuadCount: retainedPageResult.mergedDrawQuadCount,
    missingPageCount:
      retainedPageResult.missingPageCount +
      retainedTextLikePreviewResult.missingPageCount,
    rasterMs: retainedPageResult.rasterMs,
    staleFallbackDrawQuadCount: retainedPageResult.staleFallbackDrawQuadCount,
    targetDescriptorCount:
      retainedPageResult.targetDescriptorCount +
      retainedTextLikePreviewResult.targetDescriptorCount,
    uncoveredRectCount: retainedPageResult.uncoveredRectCount,
    uploadedBytes:
      retainedPageResult.uploadedBytes +
      retainedTextLikePreviewResult.uploadedBytes,
    uploadedDrawCommandCount: retainedPageResult.uploadedDrawCommandCount,
    uploadCount:
      retainedPageResult.uploadCount +
      retainedTextLikePreviewResult.uploadCount,
    uploadMs:
      retainedPageResult.uploadMs + retainedTextLikePreviewResult.uploadMs,
  };
}
