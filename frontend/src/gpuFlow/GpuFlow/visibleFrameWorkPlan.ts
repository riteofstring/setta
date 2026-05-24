import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuFlowProjectionLane } from "../projectionRuntime";
import {
  hasGpuFlowCriticalContentFrameRequest,
  isGpuFlowContentFrameReason,
  isGpuFlowMaintenanceFrameReason,
  isGpuFlowMotionFrameReason,
} from "../projectionSchedulerPolicy";
import {
  shouldDeferGpuFlowBrowserVisualRepairForBudget,
  type GpuFlowVisibleFrameBudgetBroker,
  type GpuFlowVisibleFrameBudgetBrokerDecision,
} from "./visibleFrameBudgetBroker";
import type { GpuFlowVisibleFrameReducerDecision } from "./visibleFrameReducerRuntime";
import { DEFAULT_GPU_FLOW_VISIBLE_FRAME_STARVATION_POLICY } from "./visibleFrameStateMachine";

export type GpuFlowMotionProjectionWorkPlan =
  | {
      readonly kind: "prepare";
    }
  | {
      readonly kind: "skip";
    };

export type GpuFlowContentPreparationWorkPlan =
  | {
      readonly kind: "prepare";
      readonly contentWorkLane: Extract<
        GpuFlowProjectionLane,
        "content" | "maintenance"
      >;
    }
  | {
      readonly kind: "skip";
    };

export function createGpuFlowMotionProjectionWorkPlan({
  reducerDecision,
}: {
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): GpuFlowMotionProjectionWorkPlan {
  if (reducerDecision.lane !== "motion") {
    return Object.freeze({
      kind: "skip" as const,
    });
  }
  return Object.freeze({
    kind: "prepare" as const,
  });
}

export function createGpuFlowContentPreparationWorkPlan({
  blockedProjectionOnlyFrame,
  reducerDecision,
  renderedProjectionOnlyFrame,
}: {
  readonly budgetDecision?: GpuFlowVisibleFrameBudgetBrokerDecision | undefined;
  readonly blockedProjectionOnlyFrame: boolean;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly renderedProjectionOnlyFrame: boolean;
}): GpuFlowContentPreparationWorkPlan {
  if (
    blockedProjectionOnlyFrame ||
    renderedProjectionOnlyFrame ||
    reducerDecision.lane === "motion" ||
    reducerDecision.lane === "idle"
  ) {
    return Object.freeze({
      kind: "skip" as const,
    });
  }
  return Object.freeze({
    kind: "prepare" as const,
    contentWorkLane:
      reducerDecision.lane === "maintenance" ? "maintenance" : "content",
  });
}

export function shouldDeferGpuFlowBrowserVisualResourceWakeupForPreparation({
  budgetBroker,
  deferResolutionUpdates,
  reducerDecision,
}: {
  readonly budgetBroker?: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly deferResolutionUpdates: boolean;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): boolean {
  return shouldDeferGpuFlowBrowserVisualRepairForBudget({
    budgetBroker,
    deferResolutionUpdates,
    reducerDecision,
  });
}

export function shouldConsiderGpuFlowDeferredContentPreparation({
  activeEditorActivationPending = false,
  deferResolutionUpdates,
  frameReasons,
  hasPreviousRetainedDisplayFrame,
  hasPreviousVisibleProjectionState,
  reducerDecision,
}: {
  readonly activeEditorActivationPending?: boolean | undefined;
  readonly deferResolutionUpdates: boolean;
  readonly frameReasons?: readonly GpuFrameReason[] | undefined;
  readonly hasPreviousRetainedDisplayFrame: boolean;
  readonly hasPreviousVisibleProjectionState: boolean;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): boolean {
  if (
    shouldKeepGpuFlowRepairPreparationOnVisiblePath({
      activeEditorActivationPending,
      frameReasons,
      reducerDecision,
    })
  ) {
    return false;
  }
  if (
    !hasGpuFlowPreviousVisibleContentPreparationState({
      hasPreviousRetainedDisplayFrame,
      hasPreviousVisibleProjectionState,
    })
  ) {
    return false;
  }
  if (
    !isGpuFlowDeferredContentPreparationWindow({
      deferResolutionUpdates,
      reducerDecision,
    })
  ) {
    return false;
  }
  return !requiresImmediateGpuFlowContentPreparation(reducerDecision);
}

function shouldKeepGpuFlowRepairPreparationOnVisiblePath({
  activeEditorActivationPending,
  frameReasons,
  reducerDecision,
}: {
  readonly activeEditorActivationPending: boolean;
  readonly frameReasons: readonly GpuFrameReason[] | undefined;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): boolean {
  if (
    shouldDeferGpuFlowMaintenanceContinuityRepair({
      frameReasons,
      reducerDecision,
    })
  ) {
    return false;
  }
  return (
    activeEditorActivationPending ||
    hasGpuFlowSafetyDebt(reducerDecision) ||
    shouldKeepGpuFlowContinuityRepairPreparationOnVisiblePath({
      frameReasons,
      reducerDecision,
    })
  );
}

function hasGpuFlowPreviousVisibleContentPreparationState({
  hasPreviousRetainedDisplayFrame,
  hasPreviousVisibleProjectionState,
}: {
  readonly hasPreviousRetainedDisplayFrame: boolean;
  readonly hasPreviousVisibleProjectionState: boolean;
}): boolean {
  return hasPreviousRetainedDisplayFrame && hasPreviousVisibleProjectionState;
}

function isGpuFlowDeferredContentPreparationWindow({
  deferResolutionUpdates,
  reducerDecision,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): boolean {
  if (reducerDecision.lane === "motion") {
    return false;
  }
  return (
    deferResolutionUpdates ||
    reducerDecision.reducerState === "motion-active" ||
    reducerDecision.reducerState === "motion-settling"
  );
}

function requiresImmediateGpuFlowContentPreparation(
  reducerDecision: GpuFlowVisibleFrameReducerDecision,
): boolean {
  return hasGpuFlowCriticalContentFrameRequest(reducerDecision.rawReasons);
}

function hasGpuFlowSafetyDebt(
  reducerDecision: GpuFlowVisibleFrameReducerDecision,
): boolean {
  return reducerDecision.classifiedDebt?.safety.active === true;
}

function shouldKeepGpuFlowContinuityRepairPreparationOnVisiblePath({
  frameReasons,
  reducerDecision,
}: {
  readonly frameReasons: readonly GpuFrameReason[] | undefined;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): boolean {
  const continuityDebt = reducerDecision.classifiedDebt?.continuity;
  const sourceReasons = frameReasons ?? reducerDecision.rawReasons;
  if (continuityDebt?.active !== true) {
    return false;
  }
  if (hasGpuFlowCriticalContentFrameRequest(reducerDecision.rawReasons)) {
    return true;
  }
  if (hasOnlyGpuFlowMotionFrameReasons(sourceReasons)) {
    return false;
  }
  if (sourceReasons.some(isGpuFlowContentFrameReason)) {
    return true;
  }
  if (!sourceReasons.some(isGpuFlowMaintenanceFrameReason)) {
    return true;
  }
  return !shouldDeferGpuFlowMaintenanceContinuityRepair({
    frameReasons,
    reducerDecision,
  });
}

function hasOnlyGpuFlowMotionFrameReasons(
  frameReasons: readonly GpuFrameReason[],
): boolean {
  return (
    frameReasons.some(isGpuFlowMotionFrameReason) &&
    !frameReasons.some(isGpuFlowContentFrameReason)
  );
}

function shouldDeferGpuFlowMaintenanceContinuityRepair({
  frameReasons,
  reducerDecision,
}: {
  readonly frameReasons: readonly GpuFrameReason[] | undefined;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): boolean {
  const continuityDebt = reducerDecision.classifiedDebt?.continuity;
  const sourceReasons = frameReasons ?? reducerDecision.rawReasons;
  return (
    continuityDebt?.active === true &&
    continuityDebt.ageFrames >=
      DEFAULT_GPU_FLOW_VISIBLE_FRAME_STARVATION_POLICY.maxConsecutiveMotionFramesBeforeContentProbe &&
    sourceReasons.some(isGpuFlowMaintenanceFrameReason) &&
    !sourceReasons.some(isGpuFlowContentFrameReason) &&
    !hasGpuFlowCriticalContentFrameRequest(reducerDecision.rawReasons)
  );
}

export function shouldSkipGpuFlowDeferredContentPreparationFrame({
  shouldConsiderDeferredPreparation,
}: {
  readonly canReusePreparedFrame: boolean;
  readonly hasPreparedFrame: boolean;
  readonly hasUnpresentedPreparedSourceFrame: boolean;
  readonly shouldConsiderDeferredPreparation: boolean;
}): boolean {
  return shouldConsiderDeferredPreparation;
}
