import type {
  GpuFlowMotionProjectionFrameWithWorkReport,
  GpuFlowMotionProjectionFrameWorkReport,
  GpuFlowMotionProjectionFrameWorkResult,
} from "./visibleFrameProjectionWorkTypes";

export function selectGpuFlowMotionProjectionFrameBlockedPublicationReason(
  frame: GpuFlowMotionProjectionFrameWithWorkReport,
): string | null {
  const workReport = frame.projectionOnlyFrameWork ?? null;
  if (!workReport) {
    return null;
  }
  return selectGpuFlowMotionProjectionFrameWorkBlockedReason(workReport);
}

function selectGpuFlowMotionProjectionFrameWorkBlockedReason({
  layerResult,
  projectionLane,
  transactionKind,
}: GpuFlowMotionProjectionFrameWorkReport): string | null {
  if (
    projectionLane !== "motion" ||
    (transactionKind !== "motion-projection" &&
      transactionKind !== "held-previous")
  ) {
    return null;
  }
  if (
    hasGpuFlowProjectionOnlyForbiddenContentWork({
      budgetExhausted: layerResult.budgetExhausted,
      blockedWork: createGpuFlowProjectionOnlyBlockedWork(layerResult),
    })
  ) {
    return "projection-only-content-work";
  }
  return null;
}

function createGpuFlowProjectionOnlyBlockedWork(
  layerResult: Omit<GpuFlowMotionProjectionFrameWorkResult, "budgetExhausted">,
) {
  return {
    deferredNodeIds: layerResult.deferredNodeIds,
    evictedTextureBytes: layerResult.evictedTextureBytes,
    evictedTextureNodeIds: layerResult.evictedTextureNodeIds,
    missingElementNodeIds: layerResult.missingElementNodeIds,
    remainingDirtyNodeIds: layerResult.remainingDirtyNodeIds,
    skippedNodeIds: layerResult.skippedNodeIds,
    uploadedNodeIds: layerResult.uploadedNodeIds,
  };
}

function hasGpuFlowProjectionOnlyForbiddenContentWork({
  blockedWork,
  budgetExhausted,
}: {
  readonly blockedWork: ReturnType<
    typeof createGpuFlowProjectionOnlyBlockedWork
  >;
  readonly budgetExhausted: boolean;
}): boolean {
  return [
    budgetExhausted,
    blockedWork.evictedTextureBytes > 0,
    blockedWork.evictedTextureNodeIds.length > 0,
    blockedWork.uploadedNodeIds.length > 0,
  ].some(Boolean);
}
