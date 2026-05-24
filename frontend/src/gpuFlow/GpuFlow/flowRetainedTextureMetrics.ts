import type {
  GpuFlowRetainedTexturePageDiagnosticMetrics,
  GpuFlowRetainedTexturePageExecutedWorkItemMetrics,
  GpuFlowRetainedTexturePageFrameMetrics,
  GpuFlowRetainedTexturePageWorkItemMetrics,
} from "../framePerformance";
import type { RetainedContentTexturePageMaintenanceResult } from "../retainedContentTexturePageManager";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import {
  retainedTextureWorkLaneForWorkItem,
  type RetainedTextureWorkItem,
} from "../retainedTextureWorkQueue";
import { normalizeGpuViewport } from "../viewportMath";

export function combineGpuFlowRetainedTexturePageMetrics({
  retainedDisplayFrame,
  retainedPageResult,
}: {
  readonly retainedDisplayFrame: RetainedDisplayFrame;
  readonly retainedPageResult: RetainedContentTexturePageMaintenanceResult;
}): GpuFlowRetainedTexturePageFrameMetrics {
  const presentedViewport = normalizeGpuViewport(
    retainedDisplayFrame.retainedRuntimeFrame.input.viewport,
  );
  const presentedScrollOffset = firstRetainedScrollOffset(
    retainedDisplayFrame.retainedRuntimeFrame.input.scrollOffsets,
  );
  const transactionMetrics = createRetainedTextureTransactionMetrics({
    retainedDisplayFrame,
    presentedScrollOffset,
    presentedViewport,
  });
  return {
    budgetExhausted: retainedPageResult.budgetExhausted,
    coverageCandidateCount: retainedPageResult.coverageCandidateCount,
    diagnosticCount: retainedPageResult.diagnostics.length,
    diagnostics: retainedPageResult.diagnostics.map(
      createRetainedTexturePageDiagnosticMetrics,
    ),
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
    executedItems: retainedPageResult.executedItems.map(
      createRetainedTexturePageExecutedWorkItemMetrics,
    ),
  };
}

function createRetainedTexturePageDiagnosticMetrics(
  diagnostic: RetainedContentTexturePageMaintenanceResult["diagnostics"][number],
): GpuFlowRetainedTexturePageDiagnosticMetrics {
  return {
    ...createRetainedTexturePageWorkItemMetrics(diagnostic.item),
    estimate: {
      rasterMs: diagnostic.estimate.rasterMs,
      uploadedBytes: diagnostic.estimate.uploadedBytes,
      uploadCount: diagnostic.estimate.uploadCount,
      uploadMs: diagnostic.estimate.uploadMs,
    },
    lane: diagnostic.lane,
    queue: diagnostic.queue,
    reason: diagnostic.reason,
  };
}

function createRetainedTexturePageWorkItemMetrics(
  item: RetainedTextureWorkItem,
): GpuFlowRetainedTexturePageWorkItemMetrics {
  return {
    contentVersion: item.contentVersion,
    kind: item.kind,
    lane: retainedTextureWorkLaneForWorkItem(item),
    priority: item.priority,
    projectionHorizonGeneration: item.projectionHorizonGeneration ?? null,
    sourceRect: item.sourceRect ? { ...item.sourceRect } : null,
    sourceWindow: item.sourceWindow ? { ...item.sourceWindow } : null,
    surfaceId: item.surfaceId,
    targetLod: item.targetLod ?? null,
    visualEpochKind: item.visualEpochKind ?? null,
  };
}

function createRetainedTexturePageExecutedWorkItemMetrics(
  item: RetainedContentTexturePageMaintenanceResult["executedItems"][number],
): GpuFlowRetainedTexturePageExecutedWorkItemMetrics {
  return {
    ...createRetainedTexturePageWorkItemMetrics(item),
    actual: {
      rasterMs: item.actual.rasterMs,
      uploadedBytes: item.actual.uploadedBytes,
      uploadCount: item.actual.uploadCount,
      uploadMs: item.actual.uploadMs,
    },
    estimate: {
      rasterMs: item.estimate.rasterMs,
      uploadedBytes: item.estimate.uploadedBytes,
      uploadCount: item.estimate.uploadCount,
      uploadMs: item.estimate.uploadMs,
    },
    queue: item.queue,
  };
}

function createRetainedTextureTransactionMetrics({
  presentedScrollOffset,
  presentedViewport,
  retainedDisplayFrame,
}: {
  readonly presentedScrollOffset: number | null;
  readonly presentedViewport: ReturnType<typeof normalizeGpuViewport>;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
}): Pick<
  GpuFlowRetainedTexturePageFrameMetrics,
  | "transactionDesiredScrollOffset"
  | "transactionDesiredViewport"
  | "transactionBlockingGenerationIds"
  | "transactionBlockingSurfaceIds"
  | "transactionHeldMotionFrameCount"
  | "transactionHeldTransactionCount"
  | "transactionHeldTransactionDurationMs"
  | "transactionHoldReason"
  | "transactionMaxHeldMotionAgeMs"
  | "transactionPresentedScrollOffset"
  | "transactionPresentedViewport"
> {
  const holdDiagnostics = retainedDisplayFrame.diagnostics.holdDiagnostics;
  if (!holdDiagnostics) {
    return {
      transactionBlockingGenerationIds: [],
      transactionBlockingSurfaceIds: [],
      transactionDesiredScrollOffset: presentedScrollOffset,
      transactionDesiredViewport: presentedViewport,
      transactionHeldMotionFrameCount: 0,
      transactionHeldTransactionCount: 0,
      transactionHeldTransactionDurationMs: 0,
      transactionHoldReason: null,
      transactionMaxHeldMotionAgeMs: 0,
      transactionPresentedScrollOffset: presentedScrollOffset,
      transactionPresentedViewport: presentedViewport,
    };
  }
  return {
    transactionBlockingGenerationIds: [
      ...holdDiagnostics.blockingGenerationIds,
    ],
    transactionBlockingSurfaceIds: [...holdDiagnostics.blockingSurfaceIds],
    transactionDesiredScrollOffset: holdDiagnostics.desiredScrollOffset,
    transactionDesiredViewport: holdDiagnostics.desiredViewport,
    transactionHeldMotionFrameCount: holdDiagnostics.heldMotionFrameCount,
    transactionHeldTransactionCount: holdDiagnostics.heldTransactionCount,
    transactionHeldTransactionDurationMs:
      holdDiagnostics.heldTransactionDurationMs,
    transactionHoldReason: holdDiagnostics.holdReason,
    transactionMaxHeldMotionAgeMs: holdDiagnostics.maxHeldMotionAgeMs,
    transactionPresentedScrollOffset: holdDiagnostics.presentedScrollOffset,
    transactionPresentedViewport: holdDiagnostics.presentedViewport,
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
