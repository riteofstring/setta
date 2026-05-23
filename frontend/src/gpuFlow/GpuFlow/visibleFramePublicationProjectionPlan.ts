import type {
  GpuFlowHeldPreviousProjection,
  GpuFlowProjectionLane,
  GpuFlowProjectionTransaction,
  GpuFlowProjectionTransactionKind,
} from "../projectionRuntime";
import type { RenderHtmlSurfaceFrameResult } from "../htmlSurfaces/frame";
import type { GpuFlowRetainedProjectionFrame } from "./flowProjectionFrame";
import type { GpuFlowRetainedProjectionPublicationTransactionDecision } from "./visibleFramePublicationCandidates";

export type GpuFlowProjectionFrameTransaction = {
  readonly blockedReason: string | null;
  readonly heldPreviousProjection: GpuFlowHeldPreviousProjection | null;
  readonly retainedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly transaction: GpuFlowProjectionTransaction;
};

export type GpuFlowRetainedProjectionFrameResolver = (input: {
  readonly transaction: GpuFlowProjectionTransaction;
}) => GpuFlowRetainedProjectionFrame;

export type GpuFlowProjectionFrameTransactionSelector = (input: {
  readonly publicationDecision: GpuFlowRetainedProjectionPublicationTransactionDecision;
  readonly requestedRetainedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly resolveHeldRetainedProjectionFrame: GpuFlowRetainedProjectionFrameResolver;
}) => GpuFlowProjectionFrameTransaction;

export type GpuFlowProjectionFrameRenderPlan =
  {
    readonly heldPreviousProjection: GpuFlowHeldPreviousProjection | null;
    readonly kind: "render";
    readonly retainedProjectionFrame: GpuFlowRetainedProjectionFrame;
    readonly transaction: GpuFlowProjectionTransaction;
  };

export type GpuFlowProjectionFrameRenderablePlan = Extract<
  GpuFlowProjectionFrameRenderPlan,
  { readonly kind: "render" }
>;

export type GpuFlowProjectionFrameRenderPlanSelector = (input: {
  readonly projectionFrameTransaction: GpuFlowProjectionFrameTransaction;
}) => GpuFlowProjectionFrameRenderPlan;

export type GpuFlowProjectionOnlyFrameWorkResult = Pick<
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

export type GpuFlowProjectionOnlyFrameWorkInput = {
  readonly layerResult: GpuFlowProjectionOnlyFrameWorkResult;
  readonly projectionLane: GpuFlowProjectionLane;
  readonly transactionKind: GpuFlowProjectionTransactionKind;
};

export function createGpuFlowProjectionFrameTransactionSelector(): GpuFlowProjectionFrameTransactionSelector {
  return selectGpuFlowProjectionFrameTransactionFromPublicationDecision;
}

export function selectGpuFlowProjectionFrameTransactionFromPublicationDecision({
  publicationDecision,
  requestedRetainedProjectionFrame,
  resolveHeldRetainedProjectionFrame,
}: {
  readonly publicationDecision: GpuFlowRetainedProjectionPublicationTransactionDecision;
  readonly requestedRetainedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly resolveHeldRetainedProjectionFrame: GpuFlowRetainedProjectionFrameResolver;
}): GpuFlowProjectionFrameTransaction {
  if (publicationDecision.kind === "project-requested") {
    return {
      blockedReason: null,
      heldPreviousProjection: null,
      retainedProjectionFrame: requestedRetainedProjectionFrame,
      transaction: publicationDecision.transaction,
    };
  }
  if (publicationDecision.kind === "blocked") {
    return {
      blockedReason: publicationDecision.blockedReason,
      heldPreviousProjection: publicationDecision.heldPreviousProjection,
      retainedProjectionFrame: requestedRetainedProjectionFrame,
      transaction: publicationDecision.transaction,
    };
  }
  const heldProjectionFrame = resolveHeldRetainedProjectionFrame({
    transaction: publicationDecision.transaction,
  });
  return {
    blockedReason: null,
    heldPreviousProjection: publicationDecision.heldPreviousProjection,
    retainedProjectionFrame: {
      ...heldProjectionFrame,
      needsRetainedPageMaintenance:
        heldProjectionFrame.needsRetainedPageMaintenance ||
        requestedRetainedProjectionFrame.needsRetainedPageMaintenance,
    },
    transaction: publicationDecision.transaction,
  };
}

export function createGpuFlowProjectionFrameRenderPlanSelector(): GpuFlowProjectionFrameRenderPlanSelector {
  return selectGpuFlowProjectionFrameRenderPlan;
}

export function selectGpuFlowProjectionFrameRenderPlan({
  projectionFrameTransaction,
}: {
  readonly projectionFrameTransaction: GpuFlowProjectionFrameTransaction;
}): GpuFlowProjectionFrameRenderPlan {
  assertGpuFlowProjectionFrameTransactionRenderable(
    projectionFrameTransaction,
  );
  return {
    heldPreviousProjection: projectionFrameTransaction.heldPreviousProjection,
    kind: "render" as const,
    retainedProjectionFrame: projectionFrameTransaction.retainedProjectionFrame,
    transaction: projectionFrameTransaction.transaction,
  };
}

function assertGpuFlowProjectionFrameTransactionRenderable(
  projectionFrameTransaction: GpuFlowProjectionFrameTransaction,
): void {
  if (projectionFrameTransaction.blockedReason !== null) {
    throw new Error(
      "GPU Flow projection frame render plans require a nonblocked projection transaction.",
    );
  }
}

export function selectGpuFlowMotionProjectionFrameWorkBlockedReason({
  layerResult,
  projectionLane,
  transactionKind,
}: GpuFlowProjectionOnlyFrameWorkInput): string | null {
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

export function createGpuFlowProjectionOnlyBlockedWork(
  layerResult: Omit<GpuFlowProjectionOnlyFrameWorkResult, "budgetExhausted">,
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
