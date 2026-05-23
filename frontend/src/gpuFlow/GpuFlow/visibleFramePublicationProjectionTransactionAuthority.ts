import type { GpuFrameReason } from "../gpuRenderer";
import type {
  GpuFlowHeldPreviousProjection,
  GpuFlowProjectionSchedulerKnobs,
  GpuFlowProjectionTransaction,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  createGpuFlowHeldPreviousProjection,
  createGpuFlowProjectionTransactionForCommittedFrameId,
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuFlowRetainedProjectionFrame } from "./flowProjectionFrame";
import { GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID } from "./visibleFramePublicationAuthority";
import type { GpuFlowVisibleFrameBlockedPublicationCandidate } from "./visibleFramePublicationContentPlan";

export type GpuFlowRetainedProjectionPublicationTransactionDecision =
  | {
      readonly blockedReason: null;
      readonly heldPreviousProjection: null;
      readonly kind: "project-requested";
      readonly transaction: GpuFlowProjectionTransaction;
    }
  | {
      readonly blockedReason: null;
      readonly heldPreviousProjection: GpuFlowHeldPreviousProjection;
      readonly kind: "held-previous";
      readonly transaction: GpuFlowProjectionTransaction;
    }
  | {
      readonly blockedReason: string;
      readonly heldPreviousProjection: GpuFlowHeldPreviousProjection;
      readonly kind: "blocked";
      readonly transaction: GpuFlowProjectionTransaction;
    };

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

export function createGpuFlowProjectionFrameTransactionSelector(): GpuFlowProjectionFrameTransactionSelector {
  return selectGpuFlowProjectionFrameTransactionFromPublicationDecision;
}

export function decideGpuFlowRetainedProjectionPublicationTransaction({
  frameReasons,
  hasActiveRetainedDomControl,
  heldPreviousProjectionState,
  projectionSchedulerKnobs,
  requestedProjectionCoverageMissing,
  requestedTransaction,
}: {
  readonly frameReasons: readonly GpuFrameReason[];
  readonly hasActiveRetainedDomControl: boolean;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly projectionSchedulerKnobs?:
    | GpuFlowProjectionSchedulerKnobs
    | undefined;
  readonly requestedProjectionCoverageMissing: boolean;
  readonly requestedTransaction: GpuFlowProjectionTransaction;
}): GpuFlowRetainedProjectionPublicationTransactionDecision {
  if (
    !requestedProjectionCoverageMissing ||
    heldPreviousProjectionState === null
  ) {
    return {
      blockedReason: null,
      heldPreviousProjection: null,
      kind: "project-requested",
      transaction: requestedTransaction,
    };
  }
  const heldPreviousTransaction =
    createGpuFlowProjectionTransactionForCommittedFrameId({
      committedFrameId:
        heldPreviousProjectionState.committedFrame.displayFrameId,
      kind: "held-previous",
      lane: requestedTransaction.lane,
      rawReasons: frameReasons,
      sample: requestedTransaction.sample,
    });
  const heldPreviousProjection = createGpuFlowHeldPreviousProjection({
    heldTransaction: heldPreviousTransaction,
    knobs:
      projectionSchedulerKnobs ?? DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
    previousVisibleProjectionState: heldPreviousProjectionState,
    reason: "retained-projection-coverage-missing",
    requestedSample: requestedTransaction.sample,
  });
  if (
    !isGpuFlowRetainedProjectionHeldPreviousOverBudget(heldPreviousProjection)
  ) {
    return {
      blockedReason: null,
      heldPreviousProjection,
      kind: "held-previous",
      transaction: heldPreviousTransaction,
    };
  }
  if (hasActiveRetainedDomControl) {
    return {
      blockedReason: null,
      heldPreviousProjection: null,
      kind: "project-requested",
      transaction: requestedTransaction,
    };
  }
  return {
    blockedReason: "held-previous-budget-exceeded",
    heldPreviousProjection,
    kind: "blocked",
    transaction: requestedTransaction,
  };
}

export function hasActiveGpuFlowRetainedDomControlPublicationProof(
  retainedDisplayFrame: RetainedDisplayFrame,
): boolean {
  return retainedDisplayFrame.retainedRuntimeFrame.descriptors.domControlSources.some(
    (control) => control.active,
  );
}

export function createGpuFlowRetainedProjectionBlockedPublicationCandidate({
  blockedReason,
  heldPreviousProjectionState,
}: {
  readonly blockedReason: string;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameBlockedPublicationCandidate {
  return Object.freeze({
    blockedReasons: Object.freeze([
      Object.freeze({
        actorId: null,
        family: "retained-projection",
        reason: blockedReason,
      }),
    ]),
    frozenFrameId:
      heldPreviousProjectionState?.committedFrame.displayFrameId ??
      GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
  });
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

function isGpuFlowRetainedProjectionHeldPreviousOverBudget(
  heldPreviousProjection: GpuFlowHeldPreviousProjection,
): boolean {
  return Boolean(
    heldPreviousProjection.maxHeldPreviousFramesExceeded ||
      heldPreviousProjection.maxHeldPreviousMsExceeded,
  );
}
