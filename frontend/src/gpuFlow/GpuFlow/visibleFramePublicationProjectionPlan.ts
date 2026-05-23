import type {
  GpuFlowHeldPreviousProjection,
  GpuFlowProjectionTransaction,
} from "../projectionRuntime";
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
  | {
      readonly blockedProjectionReason: string;
      readonly kind: "blocked";
    }
  | {
      readonly heldPreviousProjection: GpuFlowHeldPreviousProjection | null;
      readonly kind: "render";
      readonly retainedProjectionFrame: GpuFlowRetainedProjectionFrame;
      readonly transaction: GpuFlowProjectionTransaction;
    };

export type GpuFlowProjectionFrameRenderPlanSelector = (input: {
  readonly projectionFrameTransaction: GpuFlowProjectionFrameTransaction;
}) => GpuFlowProjectionFrameRenderPlan;

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
  if (projectionFrameTransaction.blockedReason !== null) {
    return {
      blockedProjectionReason: projectionFrameTransaction.blockedReason,
      kind: "blocked" as const,
    };
  }
  return {
    heldPreviousProjection: projectionFrameTransaction.heldPreviousProjection,
    kind: "render" as const,
    retainedProjectionFrame: projectionFrameTransaction.retainedProjectionFrame,
    transaction: projectionFrameTransaction.transaction,
  };
}
