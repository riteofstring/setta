import type { GpuFlowRetainedTexturePageFrameMetrics } from "../framePerformance";
import type { RetainedContentTexturePageMaintenanceResult } from "../retainedContentTexturePageManager";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { normalizeGpuViewport } from "../viewportMath";

export function combineGpuFlowRetainedTexturePageMetrics({
  retainedDisplayFrame,
  retainedPageResult,
}: {
  readonly retainedDisplayFrame: RetainedDisplayFrame;
  readonly retainedPageResult: RetainedContentTexturePageMaintenanceResult;
}): GpuFlowRetainedTexturePageFrameMetrics {
  const publishedViewport = normalizeGpuViewport(
    retainedDisplayFrame.retainedRuntimeFrame.input.viewport,
  );
  const publishedScrollOffset = firstRetainedScrollOffset(
    retainedDisplayFrame.retainedRuntimeFrame.input.scrollOffsets,
  );
  const transactionMetrics = createRetainedTextureTransactionMetrics({
    retainedDisplayFrame,
    publishedScrollOffset,
    publishedViewport,
  });
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
    surfaceActorGenerationCount:
      retainedDisplayFrame.surfaceActorSnapshots.length,
    surfaceCoverageProtectedResourceCount:
      retainedDisplayFrame.surfaceTransaction.coverageProof
        .protectedResourceHandles.length,
    surfaceCoverageTrueHoleCount:
      retainedDisplayFrame.surfaceTransaction.coverageProof.trueHoleRects
        .length,
    targetDescriptorCount: retainedPageResult.targetDescriptorCount,
    ...transactionMetrics,
    transactionOutcome: retainedDisplayFrame.diagnostics.transactionOutcome,
    trueHoleRectCount: retainedDisplayFrame.diagnostics.trueHoleRectCount,
    uploadedBytes: retainedPageResult.uploadedBytes,
    uploadedDrawCommandCount: retainedPageResult.uploadedDrawCommandCount,
    uploadCount: retainedPageResult.uploadCount,
    uploadMs: retainedPageResult.uploadMs,
  };
}

function createRetainedTextureTransactionMetrics({
  publishedScrollOffset,
  publishedViewport,
  retainedDisplayFrame,
}: {
  readonly publishedScrollOffset: number | null;
  readonly publishedViewport: ReturnType<typeof normalizeGpuViewport>;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
}): Pick<
  GpuFlowRetainedTexturePageFrameMetrics,
  | "transactionDesiredScrollOffset"
  | "transactionDesiredViewport"
  | "transactionHeldMotionFrameCount"
  | "transactionHeldTransactionCount"
  | "transactionHeldTransactionDurationMs"
  | "transactionHoldReason"
  | "transactionMaxHeldMotionAgeMs"
  | "transactionPublishedScrollOffset"
  | "transactionPublishedViewport"
> {
  const holdDiagnostics = retainedDisplayFrame.diagnostics.holdDiagnostics;
  if (!holdDiagnostics) {
    return {
      transactionDesiredScrollOffset: publishedScrollOffset,
      transactionDesiredViewport: publishedViewport,
      transactionHeldMotionFrameCount: 0,
      transactionHeldTransactionCount: 0,
      transactionHeldTransactionDurationMs: 0,
      transactionHoldReason: null,
      transactionMaxHeldMotionAgeMs: 0,
      transactionPublishedScrollOffset: publishedScrollOffset,
      transactionPublishedViewport: publishedViewport,
    };
  }
  return {
    transactionDesiredScrollOffset: holdDiagnostics.desiredScrollOffset,
    transactionDesiredViewport: holdDiagnostics.desiredViewport,
    transactionHeldMotionFrameCount: holdDiagnostics.heldMotionFrameCount,
    transactionHeldTransactionCount: holdDiagnostics.heldTransactionCount,
    transactionHeldTransactionDurationMs:
      holdDiagnostics.heldTransactionDurationMs,
    transactionHoldReason: holdDiagnostics.holdReason,
    transactionMaxHeldMotionAgeMs: holdDiagnostics.maxHeldMotionAgeMs,
    transactionPublishedScrollOffset: holdDiagnostics.publishedScrollOffset,
    transactionPublishedViewport: holdDiagnostics.publishedViewport,
  };
}

function firstRetainedScrollOffset(
  scrollOffsets: RetainedDisplayFrame["retainedRuntimeFrame"]["input"]["scrollOffsets"],
): number | null {
  const firstOffset = scrollOffsets.values().next().value as
    | { readonly y: number }
    | undefined;
  return firstOffset?.y ?? null;
}
