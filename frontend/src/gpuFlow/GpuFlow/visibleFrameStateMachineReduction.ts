import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowHeldPreviousProjection,
  createGpuFlowProjectionTransactionForPreparedContentFrameId,
  type GpuFlowProjectionLane,
  type GpuFlowProjectionTransaction,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  hasGpuFlowCriticalContentFrameRequest,
  isGpuFlowContentFrameReason,
  isGpuFlowMaintenanceFrameReason,
  isGpuFlowRetainedMotionFrameReason,
  shouldSelectGpuFlowContentPriorityWorkLane,
  shouldSelectGpuFlowMaintenancePriorityWorkLane,
  shouldSelectGpuFlowMotionPriorityWorkLane,
  shouldSelectGpuFlowSettledExplicitContentRepairLane,
  type GpuFlowVisibleFrameReducerState,
} from "../projectionSchedulerPolicy";
import { createGpuFlowRetainedProjectionBlockedPresentationCandidate } from "./visibleFrameBlockedCandidate";
import type { GpuFlowRetainedProjectionFrame } from "./visibleFrameProjectionCoverage";
import type {
  GpuFlowMotionProjectionFramePreparation,
  GpuFlowProjectionFrameRenderPlan,
  GpuFlowProjectionFrameTransaction,
} from "./visibleFrameProjectionPlan";
import { createGpuFlowVisibleFrameReducerDecisionForLane } from "./visibleFrameReducerDecision";
import type {
  GpuFlowVisibleFrameReducerDecision,
  GpuFlowVisibleFrameRequestFacts,
} from "./visibleFrameReducerRuntime";
import type { GpuFlowVisibleFramePresentationMotionCandidate } from "./visibleFrameTransactionProofs";

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

export type GpuFlowVisibleFrameWorkLane = GpuFlowProjectionLane | "idle";

export type GpuFlowVisibleFrameLaneReductionFacts = {
  readonly contentDebt: boolean;
  readonly contentRetryDeferred: boolean;
  readonly criticalContentDebt: boolean;
  readonly hasPresentedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
  readonly motionRetryDeferred: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly reducerState: GpuFlowVisibleFrameReducerState;
  readonly viewportInteractionActive: boolean;
};

export function reduceGpuFlowVisibleFrameReducerDecision({
  frameRequest,
  reducerPolicy,
}: {
  readonly frameRequest: GpuFlowVisibleFrameRequestFacts;
  readonly reducerPolicy: GpuFlowVisibleFrameStarvationPolicy;
}): GpuFlowVisibleFrameReducerDecision {
  const lane = reduceGpuFlowVisibleFrameWorkLane({
    contentDebt: frameRequest.contentDebt,
    contentRetryDeferred: frameRequest.contentRetryDeferred,
    criticalContentDebt: frameRequest.criticalContentDebt,
    hasPresentedContentFrame: frameRequest.hasPresentedContentFrame,
    maintenanceDebt: frameRequest.maintenanceDebt,
    motionDebt: frameRequest.motionDebt,
    motionRetryDeferred: frameRequest.motionRetryDeferred,
    rawReasons: frameRequest.rawReasons,
    reducerPolicy,
    reducerState: frameRequest.reducerState,
    viewportInteractionActive: frameRequest.viewportInteractionActive,
  });
  return createGpuFlowVisibleFrameReducerDecisionForLane({
    frameRequest,
    lane,
  });
}

export function reduceGpuFlowVisibleFrameWorkLane({
  contentDebt,
  contentRetryDeferred,
  criticalContentDebt,
  hasPresentedContentFrame,
  maintenanceDebt,
  motionDebt,
  motionRetryDeferred,
  rawReasons,
  reducerPolicy,
  reducerState,
  viewportInteractionActive,
}: GpuFlowVisibleFrameLaneReductionFacts & {
  readonly reducerPolicy: GpuFlowVisibleFrameStarvationPolicy;
}): GpuFlowVisibleFrameWorkLane {
  if (
    shouldPresentGpuFlowBootstrapContentFrame({
      hasPresentedContentFrame,
      motionDebt,
    })
  ) {
    return "content";
  }
  if (
    shouldSelectCurrentGpuFlowMotionWorkLane({
      criticalContentDebt,
      hasPresentedContentFrame,
      motionDebt,
      motionRetryDeferred,
      rawReasons,
      reducerState,
      viewportInteractionActive,
    })
  ) {
    return "motion";
  }
  switch (reducerState) {
    case "motion-active":
    case "motion-settling":
      return selectMotionPriorityVisibleFrameWorkLane({
        contentDebt,
        contentRetryDeferred,
        criticalContentDebt,
        hasPresentedContentFrame,
        maintenanceDebt,
        motionDebt,
        motionRetryDeferred,
        rawReasons,
        reducerPolicy,
        reducerState,
        viewportInteractionActive,
      });
    case "content-catchup":
      return selectContentCatchupVisibleFrameWorkLane({
        contentDebt,
        hasPresentedContentFrame,
        maintenanceDebt,
        motionDebt,
      });
    case "maintenance-drain":
      return selectMaintenanceDrainVisibleFrameWorkLane({ maintenanceDebt });
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
      blockedPresentationCandidate: null,
      blockedReason: null,
      heldPreviousProjection: null,
      retainedProjectionFrame: requestedRetainedProjectionFrame,
      transaction: requestedTransaction,
    };
  }
  if (previousVisibleProjectionState) {
    const heldTransaction =
      createGpuFlowProjectionTransactionForPreparedContentFrameId({
        preparedContentFrameId:
          previousVisibleProjectionState.preparedContentFrame.displayFrameId,
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
      blockedPresentationCandidate: null,
      blockedReason: null,
      heldPreviousProjection,
      retainedProjectionFrame: requestedRetainedProjectionFrame,
      transaction: heldTransaction,
    };
  }
  const blockedReason = "retained-projection-coverage-missing";
  return {
    blockedPresentationCandidate:
      createGpuFlowRetainedProjectionBlockedPresentationCandidate({
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
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
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
  if (projectionFrameTransaction.blockedPresentationCandidate !== null) {
    return preparation.createBlockedProjectionFrame({
      blockedPresentationCandidate:
        projectionFrameTransaction.blockedPresentationCandidate,
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
  if (projectionFrameTransaction.blockedPresentationCandidate !== null) {
    throw new Error(
      "GPU Flow projection frame render plans require a nonblocked projection transaction.",
    );
  }
}

function shouldPresentGpuFlowBootstrapContentFrame({
  hasPresentedContentFrame,
  motionDebt,
}: {
  readonly hasPresentedContentFrame: boolean;
  readonly motionDebt: boolean;
}): boolean {
  return motionDebt && !hasPresentedContentFrame;
}

function selectMotionPriorityVisibleFrameWorkLane({
  contentDebt,
  contentRetryDeferred,
  criticalContentDebt,
  hasPresentedContentFrame,
  maintenanceDebt,
  motionDebt,
  motionRetryDeferred,
  rawReasons,
  reducerState,
  reducerPolicy,
  viewportInteractionActive,
}: GpuFlowVisibleFrameLaneReductionFacts & {
  readonly reducerPolicy: GpuFlowVisibleFrameStarvationPolicy;
}): GpuFlowVisibleFrameWorkLane {
  if (
    shouldSelectGpuFlowSettledExplicitContentRepairLane({
      contentDebt,
      contentRetryDeferred,
      criticalContentDebt,
      rawReasons,
      viewportInteractionActive,
    })
  ) {
    return reducerPolicy.maxContentInterleaveMs > 0 ? "content" : "idle";
  }
  if (
    shouldSelectGpuFlowMotionPriorityWorkLane({
      hasPresentedContentFrame,
      motionDebt,
      motionRetryDeferred,
      reducerState,
    })
  ) {
    return "motion";
  }
  if (
    shouldSelectGpuFlowContentPriorityWorkLane({
      contentDebt,
      contentRetryDeferred,
    })
  ) {
    return reducerPolicy.maxContentInterleaveMs > 0 ? "content" : "idle";
  }
  if (
    shouldSelectGpuFlowMaintenancePriorityWorkLane({
      contentRetryDeferred,
      maintenanceDebt,
    })
  ) {
    return reducerPolicy.maxMaintenanceInterleaveMs > 0
      ? "maintenance"
      : "idle";
  }
  return "idle";
}

function shouldSelectCurrentGpuFlowMotionWorkLane({
  criticalContentDebt,
  hasPresentedContentFrame,
  motionDebt,
  motionRetryDeferred,
  rawReasons,
  reducerState,
  viewportInteractionActive,
}: {
  readonly criticalContentDebt: boolean;
  readonly hasPresentedContentFrame: boolean;
  readonly motionDebt: boolean;
  readonly motionRetryDeferred: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly reducerState: GpuFlowVisibleFrameReducerState;
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
    hasGpuFlowMotionPresentationCompetingReason({
      criticalContentDebt,
      hasRetainedMotionReason,
      rawReasons,
    })
  ) {
    return false;
  }
  return shouldSelectGpuFlowMotionPriorityWorkLane({
    hasPresentedContentFrame,
    motionDebt,
    motionRetryDeferred: hasRetainedMotionReason ? false : motionRetryDeferred,
    reducerState,
  });
}

function hasGpuFlowMotionPresentationCompetingReason({
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

function selectContentCatchupVisibleFrameWorkLane({
  contentDebt,
  hasPresentedContentFrame,
  maintenanceDebt,
  motionDebt,
}: {
  readonly contentDebt: boolean;
  readonly hasPresentedContentFrame: boolean;
  readonly maintenanceDebt: boolean;
  readonly motionDebt: boolean;
}): GpuFlowVisibleFrameWorkLane {
  if (contentDebt) {
    return "content";
  }
  if (motionDebt && hasPresentedContentFrame) {
    return "motion";
  }
  return selectMaintenanceDrainVisibleFrameWorkLane({ maintenanceDebt });
}

function selectMaintenanceDrainVisibleFrameWorkLane({
  maintenanceDebt,
}: {
  readonly maintenanceDebt: boolean;
}): GpuFlowVisibleFrameWorkLane {
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
