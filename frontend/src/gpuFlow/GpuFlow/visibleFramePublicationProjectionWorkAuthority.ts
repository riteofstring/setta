import type { RenderHtmlSurfaceFrameResult } from "../htmlSurfaces/frame";
import type {
  GpuFlowProjectionLane,
  GpuFlowProjectionTransactionKind,
} from "../projectionRuntime";

export type GpuFlowMotionProjectionFrameWorkResult = Pick<
  RenderHtmlSurfaceFrameResult,
  | "budgetExhausted"
  | "deferredNodeIds"
  | "evictedTextureBytes"
  | "evictedTextureNodeIds"
  | "missingElementNodeIds"
  | "remainingDirtyNodeIds"
  | "skippedNodeIds"
  | "uploadedNodeIds"
>;

export type GpuFlowMotionProjectionFrameWorkReport = {
  readonly layerResult: GpuFlowMotionProjectionFrameWorkResult;
  readonly projectionLane: GpuFlowProjectionLane;
  readonly transactionKind: GpuFlowProjectionTransactionKind;
};

type GpuFlowMotionProjectionFrameWithWorkReport = {
  readonly projectionOnlyFrameWork?:
    | GpuFlowMotionProjectionFrameWorkReport
    | null
    | undefined;
};

export type GpuFlowMotionProjectionFrameBlockedPublicationReasonSelector =
  (frame: unknown) => string | null;

export type GpuFlowMotionProjectionFrameWorkBlockedReasonSelector =
  (workReport: GpuFlowMotionProjectionFrameWorkReport) => string | null;

export function createGpuFlowMotionProjectionFrameBlockedPublicationReasonSelector(): GpuFlowMotionProjectionFrameBlockedPublicationReasonSelector {
  return selectGpuFlowMotionProjectionFrameBlockedPublicationReason;
}

export function createGpuFlowMotionProjectionFrameWorkBlockedReasonSelector(): GpuFlowMotionProjectionFrameWorkBlockedReasonSelector {
  return selectGpuFlowMotionProjectionFrameWorkBlockedReason;
}

function selectGpuFlowMotionProjectionFrameBlockedPublicationReason(
  frame: unknown,
): string | null {
  if (!hasGpuFlowMotionProjectionFrameWorkReport(frame)) {
    return null;
  }
  const workReport = frame.projectionOnlyFrameWork ?? null;
  if (!workReport) {
    return null;
  }
  return selectGpuFlowMotionProjectionFrameWorkBlockedReason(workReport);
}

export function assertGpuFlowMotionProjectionFrameWork(
  workReport: GpuFlowMotionProjectionFrameWorkReport,
): void {
  const blockedReason =
    selectGpuFlowMotionProjectionFrameWorkBlockedReason(workReport);
  if (blockedReason === null) {
    return;
  }
  const blockedWork = createGpuFlowProjectionOnlyBlockedWork(
    workReport.layerResult,
  );
  throw new Error(
    `GPU Flow motion projection frame performed forbidden content work: ${JSON.stringify(
      blockedWork,
    )}`,
  );
}

function hasGpuFlowMotionProjectionFrameWorkReport(
  frame: unknown,
): frame is GpuFlowMotionProjectionFrameWithWorkReport {
  return frame !== null && typeof frame === "object";
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
  readonly blockedWork: ReturnType<typeof createGpuFlowProjectionOnlyBlockedWork>;
  readonly budgetExhausted: boolean;
}): boolean {
  return [
    budgetExhausted,
    blockedWork.evictedTextureBytes > 0,
    blockedWork.evictedTextureNodeIds.length > 0,
    blockedWork.uploadedNodeIds.length > 0,
  ].some(Boolean);
}
