import type { GpuFlowRetainedTexturePageFrameMetrics } from "../framePerformance";
import type { RetainedContentTexturePageMaintenanceResult } from "../retainedContentTexturePageManager";

export function combineGpuFlowRetainedTexturePageMetrics({
  retainedPageResult,
}: {
  readonly retainedPageResult: RetainedContentTexturePageMaintenanceResult;
}): GpuFlowRetainedTexturePageFrameMetrics {
  return {
    budgetExhausted: retainedPageResult.budgetExhausted,
    coverageCandidateCount: retainedPageResult.coverageCandidateCount,
    diagnosticCount: retainedPageResult.diagnostics.length,
    drawQuadCount: retainedPageResult.drawQuadCount,
    evictedBytes: retainedPageResult.evicted.evictedBytes,
    evictedCount: retainedPageResult.evicted.evictedKeys.length,
    compatibleDrawQuadCount: retainedPageResult.compatibleDrawQuadCount,
    memoryCommittedBytes: retainedPageResult.memory.committedBytes,
    memoryCommittedCount: retainedPageResult.memory.committedCount,
    memoryRetiredBytes: retainedPageResult.memory.retiredBytes,
    memoryRetiredCount: retainedPageResult.memory.retiredCount,
    memoryTotalBytes: retainedPageResult.memory.totalBytes,
    mergedDrawQuadCount: retainedPageResult.mergedDrawQuadCount,
    refinementPageCount: retainedPageResult.refinementPageCount,
    rasterMs: retainedPageResult.rasterMs,
    rejectedStaleRectCount: retainedPageResult.rejectedStaleRectCount,
    targetDescriptorCount: retainedPageResult.targetDescriptorCount,
    trueHoleRectCount: retainedPageResult.trueHoleRectCount,
    uploadedBytes: retainedPageResult.uploadedBytes,
    uploadedDrawCommandCount: retainedPageResult.uploadedDrawCommandCount,
    uploadCount: retainedPageResult.uploadCount,
    uploadMs: retainedPageResult.uploadMs,
  };
}
