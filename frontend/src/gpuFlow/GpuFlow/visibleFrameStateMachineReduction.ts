import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowHeldPreviousProjection,
  createGpuFlowProjectionTransactionForCommittedFrameId,
  type GpuFlowProjectionLane,
  type GpuFlowProjectionTransaction,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  hasGpuFlowCriticalContentFrameRequest,
  isGpuFlowContentFrameReason,
  isGpuFlowMaintenanceFrameReason,
  isGpuFlowRetainedMotionFrameReason,
  shouldSelectGpuFlowContentPriorityPublicationLane,
  shouldSelectGpuFlowMaintenancePriorityPublicationLane,
  shouldSelectGpuFlowMotionPriorityPublicationLane,
  shouldSelectGpuFlowSettledExplicitContentRepairLane,
  type GpuFlowProjectionSchedulerState,
} from "../projectionSchedulerPolicy";
import { createGpuFlowRetainedProjectionBlockedPublicationCandidate } from "./visibleFrameBlockedCandidate";
import type { GpuFlowRetainedProjectionFrame } from "./visibleFrameProjectionCoverage";
import type {
  GpuFlowMotionProjectionFramePreparation,
  GpuFlowProjectionFrameRenderPlan,
  GpuFlowProjectionFrameTransaction,
} from "./visibleFrameProjectionPlan";
import { createGpuFlowVisiblePublicationDecisionForLane } from "./visibleFramePublicationDecision";
import type {
  GpuFlowVisibleFrameRequestFacts,
  GpuFlowVisiblePublicationDecision,
} from "./visibleFrameScheduling";
import type { GpuFlowVisibleFramePublicationMotionCandidate } from "./visibleFrameTransactionProofs";

export type GpuFlowVisibleFrameStarvationPolicy = {
  readonly maxConsecutiveMotionFramesBeforeContentProbe: number;
  readonly maxContentInterleaveMs: number;
  readonly maxHeldPreviousFrames: number;
  readonly maxHeldPreviousMs: number;
  readonly maxMaintenanceInterleaveMs: number;
  readonly motionSettleWindowMs: number;
};

type GpuFlowVisibleFrameHeldPreviousBudgetStatus = {
  readonly maxHeldPreviousFramesExceeded: boolean;
  readonly maxHeldPreviousMsExceeded: boolean;
};

export const DEFAULT_GPU_FLOW_VISIBLE_FRAME_STARVATION_POLICY: GpuFlowVisibleFrameStarvationPolicy =
  Object.freeze({
    maxConsecutiveMotionFramesBeforeContentProbe: 6,
    maxContentInterleaveMs: 2,
    maxHeldPreviousFrames: 6,
    maxHeldPreviousMs: 120,
    maxMaintenanceInterleaveMs: 1,
    motionSettleWindowMs: 120,
  });

export type GpuFlowVisibleFramePublicationLane = GpuFlowProjectionLane | "idle";

export type GpuFlowVisibleFrameLaneReductionFacts = {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
  readonly criticalContentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
  readonly motionRetryDeferred: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly schedulerState: GpuFlowProjectionSchedulerState;
  readonly viewportInteractionActive: boolean;
};

export function reduceGpuFlowVisibleFramePublicationDecision({
  frameRequest,
  schedulerKnobs,
}: {
  readonly frameRequest: GpuFlowVisibleFrameRequestFacts;
  readonly schedulerKnobs: GpuFlowVisibleFrameStarvationPolicy;
}): GpuFlowVisiblePublicationDecision {
  const lane = reduceGpuFlowVisibleFramePublicationLane({
    contentDebt: frameRequest.contentDebt,
    contentRetryDeferred: frameRequest.contentRetryDeferred,
    criticalContentDebt: frameRequest.criticalContentDebt,
    hasCommittedContentFrame: frameRequest.hasCommittedContentFrame,
    maintenanceDebt: frameRequest.maintenanceDebt,
    motionDebt: frameRequest.motionDebt,
    motionRetryDeferred: frameRequest.motionRetryDeferred,
    rawReasons: frameRequest.rawReasons,
    schedulerKnobs,
    schedulerState: frameRequest.schedulerState,
    viewportInteractionActive: frameRequest.viewportInteractionActive,
  });
  return createGpuFlowVisiblePublicationDecisionForLane({
    frameRequest,
    lane,
  });
}

export function reduceGpuFlowVisibleFramePublicationLane({
  contentDebt,
  contentRetryDeferred,
  criticalContentDebt,
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
  motionRetryDeferred,
  rawReasons,
  schedulerKnobs,
  schedulerState,
  viewportInteractionActive,
}: GpuFlowVisibleFrameLaneReductionFacts & {
  readonly schedulerKnobs: GpuFlowVisibleFrameStarvationPolicy;
}): GpuFlowVisibleFramePublicationLane {
  if (
    shouldPublishGpuFlowBootstrapContentFrame({
      hasCommittedContentFrame,
      motionDebt,
    })
  ) {
    return "content";
  }
  if (
    shouldSelectCurrentGpuFlowMotionPublicationLane({
      criticalContentDebt,
      hasCommittedContentFrame,
      motionDebt,
      motionRetryDeferred,
      rawReasons,
      schedulerState,
      viewportInteractionActive,
    })
  ) {
    return "motion";
  }
  switch (schedulerState) {
    case "motion-active":
    case "motion-settling":
      return selectMotionPriorityVisiblePublicationLane({
        contentDebt,
        contentRetryDeferred,
        criticalContentDebt,
        hasCommittedContentFrame,
        maintenanceDebt,
        motionDebt,
        motionRetryDeferred,
        rawReasons,
        schedulerKnobs,
        schedulerState,
        viewportInteractionActive,
      });
    case "content-catchup":
      return selectContentCatchupVisiblePublicationLane({
        contentDebt,
        hasCommittedContentFrame,
        maintenanceDebt,
        motionDebt,
      });
    case "maintenance-drain":
      return selectMaintenanceDrainVisiblePublicationLane({ maintenanceDebt });
    case "maintenance-deferred":
    case "idle":
      return "idle";
  }
}

export function reduceGpuFlowVisibleFrameMotionProjectionTransaction({
  previousVisibleProjectionState,
  projectionSchedulerKnobs,
  rawReasons,
  requestedProjectionCoverageMissing,
  requestedRetainedProjectionFrame,
  requestedTransaction,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly projectionSchedulerKnobs: GpuFlowVisibleFrameStarvationPolicy;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly requestedProjectionCoverageMissing: boolean;
  readonly requestedRetainedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly requestedTransaction: GpuFlowProjectionTransaction;
}): GpuFlowProjectionFrameTransaction {
  if (!requestedProjectionCoverageMissing) {
    return {
      blockedPublicationCandidate: null,
      blockedReason: null,
      heldPreviousProjection: null,
      retainedProjectionFrame: requestedRetainedProjectionFrame,
      transaction: requestedTransaction,
    };
  }
  if (previousVisibleProjectionState) {
    const heldTransaction =
      createGpuFlowProjectionTransactionForCommittedFrameId({
        committedFrameId:
          previousVisibleProjectionState.committedFrame.displayFrameId,
        kind: "held-previous",
        lane: requestedTransaction.lane,
        rawReasons,
        sample: requestedTransaction.sample,
      });
    const heldPreviousProjection = createGpuFlowHeldPreviousProjection({
      heldTransaction,
      knobs: projectionSchedulerKnobs,
      previousVisibleProjectionState,
      reason: "retained-projection-coverage-missing",
      requestedSample: requestedTransaction.sample,
    });
    return {
      blockedPublicationCandidate: null,
      blockedReason: null,
      heldPreviousProjection,
      retainedProjectionFrame: requestedRetainedProjectionFrame,
      transaction: heldTransaction,
    };
  }
  const blockedReason = "retained-projection-coverage-missing";
  return {
    blockedPublicationCandidate:
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason,
        heldPreviousProjectionState: previousVisibleProjectionState,
      }),
    blockedReason,
    heldPreviousProjection: null,
    retainedProjectionFrame: requestedRetainedProjectionFrame,
    transaction: requestedTransaction,
  };
}

export function reduceGpuFlowMotionProjectionFramePreparation<
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  preparation,
  previousVisibleProjectionState,
  projectionSchedulerKnobs,
  rawReasons,
}: {
  readonly preparation: GpuFlowMotionProjectionFramePreparation<MotionProjectionFrame>;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly projectionSchedulerKnobs: GpuFlowVisibleFrameStarvationPolicy;
  readonly rawReasons: readonly GpuFrameReason[];
}): MotionProjectionFrame {
  if (preparation.kind === "not-rendered") {
    return preparation.frame;
  }
  const requestedRetainedProjectionFrame =
    preparation.resolveRetainedProjectionFrame({
      transaction: preparation.requestedTransaction,
    });
  const projectionFrameTransaction =
    reduceGpuFlowVisibleFrameMotionProjectionTransaction({
      previousVisibleProjectionState,
      projectionSchedulerKnobs,
      rawReasons,
      requestedProjectionCoverageMissing:
        requestedRetainedProjectionFrame.missingCoverageSurfaceIds.size > 0,
      requestedRetainedProjectionFrame,
      requestedTransaction: preparation.requestedTransaction,
    });
  if (projectionFrameTransaction.blockedPublicationCandidate !== null) {
    return preparation.createBlockedProjectionFrame({
      blockedPublicationCandidate:
        projectionFrameTransaction.blockedPublicationCandidate,
    });
  }
  const projectionFrameRenderPlan = selectGpuFlowProjectionFrameRenderPlan({
    projectionFrameTransaction,
  });
  return preparation.renderProjectionFrame({
    projectionFrameRenderPlan,
    requestedProjectionTransaction: preparation.requestedTransaction,
  });
}

export function createGpuFlowVisibleFrameStarvationPolicy(
  policy: GpuFlowVisibleFrameStarvationPolicy = DEFAULT_GPU_FLOW_VISIBLE_FRAME_STARVATION_POLICY,
): GpuFlowVisibleFrameStarvationPolicy {
  assertGpuFlowVisibleFrameStarvationPolicy(policy);
  return Object.freeze({ ...policy });
}

export function getGpuFlowVisibleFrameHeldPreviousBudgetStatus({
  consecutiveFrameCount,
  heldDurationMs,
  policy,
}: {
  readonly consecutiveFrameCount: number;
  readonly heldDurationMs: number;
  readonly policy: GpuFlowVisibleFrameStarvationPolicy;
}): GpuFlowVisibleFrameHeldPreviousBudgetStatus {
  const starvationPolicy = createGpuFlowVisibleFrameStarvationPolicy(policy);
  return Object.freeze({
    maxHeldPreviousFramesExceeded:
      consecutiveFrameCount > starvationPolicy.maxHeldPreviousFrames,
    maxHeldPreviousMsExceeded:
      heldDurationMs > starvationPolicy.maxHeldPreviousMs,
  });
}

function selectGpuFlowProjectionFrameRenderPlan({
  projectionFrameTransaction,
}: {
  readonly projectionFrameTransaction: GpuFlowProjectionFrameTransaction;
}): GpuFlowProjectionFrameRenderPlan {
  assertGpuFlowProjectionFrameTransactionRenderable(projectionFrameTransaction);
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
  if (projectionFrameTransaction.blockedPublicationCandidate !== null) {
    throw new Error(
      "GPU Flow projection frame render plans require a nonblocked projection transaction.",
    );
  }
}

function shouldPublishGpuFlowBootstrapContentFrame({
  hasCommittedContentFrame,
  motionDebt,
}: {
  readonly hasCommittedContentFrame: boolean;
  readonly motionDebt: boolean;
}): boolean {
  return motionDebt && !hasCommittedContentFrame;
}

function selectMotionPriorityVisiblePublicationLane({
  contentDebt,
  contentRetryDeferred,
  criticalContentDebt,
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
  motionRetryDeferred,
  rawReasons,
  schedulerState,
  schedulerKnobs,
  viewportInteractionActive,
}: GpuFlowVisibleFrameLaneReductionFacts & {
  readonly schedulerKnobs: GpuFlowVisibleFrameStarvationPolicy;
}): GpuFlowVisibleFramePublicationLane {
  if (
    shouldSelectGpuFlowSettledExplicitContentRepairLane({
      contentDebt,
      contentRetryDeferred,
      criticalContentDebt,
      rawReasons,
      viewportInteractionActive,
    })
  ) {
    return schedulerKnobs.maxContentInterleaveMs > 0 ? "content" : "idle";
  }
  if (
    shouldSelectGpuFlowMotionPriorityPublicationLane({
      hasCommittedContentFrame,
      motionDebt,
      motionRetryDeferred,
      schedulerState,
    })
  ) {
    return "motion";
  }
  if (
    shouldSelectGpuFlowContentPriorityPublicationLane({
      contentDebt,
      contentRetryDeferred,
    })
  ) {
    return schedulerKnobs.maxContentInterleaveMs > 0 ? "content" : "idle";
  }
  if (
    shouldSelectGpuFlowMaintenancePriorityPublicationLane({
      contentRetryDeferred,
      maintenanceDebt,
    })
  ) {
    return schedulerKnobs.maxMaintenanceInterleaveMs > 0
      ? "maintenance"
      : "idle";
  }
  return "idle";
}

function shouldSelectCurrentGpuFlowMotionPublicationLane({
  criticalContentDebt,
  hasCommittedContentFrame,
  motionDebt,
  motionRetryDeferred,
  rawReasons,
  schedulerState,
  viewportInteractionActive,
}: {
  readonly criticalContentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly motionDebt: boolean;
  readonly motionRetryDeferred: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly schedulerState: GpuFlowProjectionSchedulerState;
  readonly viewportInteractionActive: boolean;
}): boolean {
  if (rawReasons.includes("texture-upload")) {
    return false;
  }
  const hasRetainedMotionReason = rawReasons.some(
    isGpuFlowRetainedMotionFrameReason,
  );
  if (!viewportInteractionActive && !hasRetainedMotionReason) {
    return false;
  }
  if (
    hasGpuFlowMotionPublicationCompetingReason({
      criticalContentDebt,
      hasRetainedMotionReason,
      rawReasons,
    })
  ) {
    return false;
  }
  return shouldSelectGpuFlowMotionPriorityPublicationLane({
    hasCommittedContentFrame,
    motionDebt,
    motionRetryDeferred: hasRetainedMotionReason ? false : motionRetryDeferred,
    schedulerState,
  });
}

function hasGpuFlowMotionPublicationCompetingReason({
  criticalContentDebt,
  hasRetainedMotionReason,
  rawReasons,
}: {
  readonly criticalContentDebt: boolean;
  readonly hasRetainedMotionReason: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
}): boolean {
  if (criticalContentDebt || hasRetainedMotionReason) {
    return false;
  }
  return (
    rawReasons.some(isGpuFlowContentFrameReason) ||
    rawReasons.some(isGpuFlowMaintenanceFrameReason) ||
    hasGpuFlowCriticalContentFrameRequest(rawReasons)
  );
}

function selectContentCatchupVisiblePublicationLane({
  contentDebt,
  hasCommittedContentFrame,
  maintenanceDebt,
  motionDebt,
}: {
  readonly contentDebt: boolean;
  readonly hasCommittedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
}): GpuFlowVisibleFramePublicationLane {
  if (contentDebt) {
    return "content";
  }
  if (motionDebt && hasCommittedContentFrame) {
    return "motion";
  }
  return selectMaintenanceDrainVisiblePublicationLane({ maintenanceDebt });
}

function selectMaintenanceDrainVisiblePublicationLane({
  maintenanceDebt,
}: {
  readonly maintenanceDebt: boolean;
}): GpuFlowVisibleFramePublicationLane {
  return maintenanceDebt ? "maintenance" : "idle";
}

function assertGpuFlowVisibleFrameStarvationPolicy(
  policy: GpuFlowVisibleFrameStarvationPolicy,
): void {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `GPU Flow visible frame starvation policy ${name} must be finite and non-negative.`,
      );
    }
  }
}
