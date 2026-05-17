import { didRetainedPageVisualCoverageChange } from "./retainedContentTexturePageManagerHelpers";
import type {
  RetainedContentTexturePageMaintenanceResult,
  RetainedContentTexturePagePreparedFrame,
} from "./retainedContentTexturePageManagerTypes";
import type {
  RetainedTexturePageCacheSnapshot,
  RetainedTexturePageEvictionResult,
} from "./retainedTexturePages";
import type { RetainedTextureUploadSchedulerDiagnostic } from "./retainedTextureUploadScheduler";
import type { RetainedTextureWorkItem } from "./retainedTextureWorkQueue";

type RetainedContentTexturePageUploadResult = {
  readonly budgetExhausted: boolean;
  readonly diagnostics: readonly RetainedTextureUploadSchedulerDiagnostic[];
  readonly executedItems: readonly RetainedTextureWorkItem[];
  readonly rasterMs: number;
  readonly remainingUploadableWorkCount: number;
  readonly skippedItems: readonly RetainedTextureWorkItem[];
  readonly uploadedBytes: number;
  readonly uploadCount: number;
  readonly uploadMs: number;
};

export function createRetainedContentTexturePageMaintenanceResult({
  evicted,
  memory,
  postMaintenancePageVisualResult,
  preparedFrame,
  queuedWorkCount,
  queuedWorkCountBeforeUpload,
  uploadedDrawCommandCount,
  uploadResult,
}: {
  readonly evicted: RetainedTexturePageEvictionResult;
  readonly memory: RetainedTexturePageCacheSnapshot;
  readonly postMaintenancePageVisualResult: RetainedContentTexturePagePreparedFrame;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly queuedWorkCount: number;
  readonly queuedWorkCountBeforeUpload: number;
  readonly uploadedDrawCommandCount: number;
  readonly uploadResult: RetainedContentTexturePageUploadResult;
}): RetainedContentTexturePageMaintenanceResult {
  const committedRefinementChangedDrawableCoverage =
    uploadResult.uploadCount > 0 &&
    didRetainedPageVisualCoverageChange({
      after: postMaintenancePageVisualResult,
      before: preparedFrame,
    });
  const committedMissingPageCoverage =
    preparedFrame.refinementPageCount > 0 && uploadResult.uploadCount > 0;
  const remainingTrueHoleCoverage =
    postMaintenancePageVisualResult.trueHoleRectCount > 0;

  return {
    budgetExhausted: uploadResult.budgetExhausted,
    compatibleDrawQuadCount: preparedFrame.compatibleDrawQuadCount,
    coverageCandidateCount: preparedFrame.coverageCandidateCount,
    diagnostics: uploadResult.diagnostics,
    drawQuadCount: preparedFrame.drawQuadCount,
    evicted,
    executedItemCount: uploadResult.executedItems.length,
    executedItems: uploadResult.executedItems,
    fidelityState: preparedFrame.fidelityState,
    memory,
    mergedDrawQuadCount: preparedFrame.mergedDrawQuadCount,
    needsFollowUpFrame:
      uploadResult.budgetExhausted ||
      committedRefinementChangedDrawableCoverage ||
      committedMissingPageCoverage ||
      queuedWorkCount > 0 ||
      remainingTrueHoleCoverage,
    postMaintenanceRefinementPageCount:
      postMaintenancePageVisualResult.refinementPageCount,
    queuedWorkCount,
    queuedWorkCountBeforeUpload,
    rasterMs: uploadResult.rasterMs,
    refinementPageCount: preparedFrame.refinementPageCount,
    rejectedStaleRectCount: preparedFrame.rejectedStaleRectCount,
    remainingUploadableWorkCount: uploadResult.remainingUploadableWorkCount,
    repairedPreparedFrame: postMaintenancePageVisualResult,
    skippedItemCount: uploadResult.skippedItems.length,
    skippedItems: uploadResult.skippedItems,
    targetDescriptorCount: preparedFrame.refinementDescriptors.length,
    trueHoleRectCount: preparedFrame.trueHoleRectCount,
    trueHoleVisuals: preparedFrame.trueHoleVisuals,
    uploadedBytes: uploadResult.uploadedBytes,
    uploadedDrawCommandCount,
    uploadCount: uploadResult.uploadCount,
    uploadMs: uploadResult.uploadMs,
  };
}

export function createDeferredRetainedContentTexturePageMaintenanceResult({
  memory,
  preparedFrame,
  queuedWorkCount,
}: {
  readonly memory: RetainedTexturePageCacheSnapshot;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly queuedWorkCount: number;
}): RetainedContentTexturePageMaintenanceResult {
  return {
    budgetExhausted: false,
    compatibleDrawQuadCount: preparedFrame.compatibleDrawQuadCount,
    coverageCandidateCount: preparedFrame.coverageCandidateCount,
    diagnostics: [],
    drawQuadCount: preparedFrame.drawQuadCount,
    evicted: {
      evictedBytes: 0,
      evictedKeys: [],
      remainingBytes: memory.committedBytes,
    },
    executedItemCount: 0,
    executedItems: [],
    fidelityState: preparedFrame.fidelityState,
    memory,
    mergedDrawQuadCount: preparedFrame.mergedDrawQuadCount,
    needsFollowUpFrame: false,
    postMaintenanceRefinementPageCount: preparedFrame.refinementPageCount,
    queuedWorkCount,
    queuedWorkCountBeforeUpload: queuedWorkCount,
    rasterMs: 0,
    refinementPageCount: preparedFrame.refinementPageCount,
    rejectedStaleRectCount: preparedFrame.rejectedStaleRectCount,
    remainingUploadableWorkCount: 0,
    repairedPreparedFrame: preparedFrame,
    skippedItemCount: 0,
    skippedItems: [],
    targetDescriptorCount: preparedFrame.refinementDescriptors.length,
    trueHoleRectCount: preparedFrame.trueHoleRectCount,
    trueHoleVisuals: preparedFrame.trueHoleVisuals,
    uploadedBytes: 0,
    uploadedDrawCommandCount: 0,
    uploadCount: 0,
    uploadMs: 0,
  };
}
