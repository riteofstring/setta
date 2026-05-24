import type { GpuFlowProjectionLane } from "../projectionRuntime";
import { hasGpuFlowCriticalContentFrameRequest } from "../projectionSchedulerPolicy";
import {
  shouldDeferGpuFlowBrowserVisualRepairForBudget,
  type GpuFlowVisibleFrameBudgetBroker,
  type GpuFlowVisibleFrameBudgetBrokerDecision,
} from "./visibleFrameBudgetBroker";
import type { GpuFlowVisibleFrameReducerDecision } from "./visibleFrameReducerRuntime";

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
  budgetDecision,
  blockedProjectionOnlyFrame,
  reducerDecision,
  renderedProjectionOnlyFrame,
}: {
  readonly budgetDecision?: GpuFlowVisibleFrameBudgetBrokerDecision | undefined;
  readonly blockedProjectionOnlyFrame: boolean;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly renderedProjectionOnlyFrame: boolean;
}): GpuFlowContentPreparationWorkPlan {
  const budgetedVisibleRepair =
    hasGpuFlowBudgetedVisibleContentRepair(budgetDecision);
  if (
    (blockedProjectionOnlyFrame && !budgetedVisibleRepair) ||
    (renderedProjectionOnlyFrame && !budgetedVisibleRepair) ||
    reducerDecision.lane === "motion" ||
    reducerDecision.lane === "idle"
  ) {
    if (!budgetedVisibleRepair) {
      return Object.freeze({
        kind: "skip" as const,
      });
    }
    return Object.freeze({
      kind: "prepare" as const,
      contentWorkLane: "content" as const,
    });
  }
  return Object.freeze({
    kind: "prepare" as const,
    contentWorkLane:
      reducerDecision.lane === "maintenance" ? "maintenance" : "content",
  });
}

function hasGpuFlowBudgetedVisibleContentRepair(
  budgetDecision: GpuFlowVisibleFrameBudgetBrokerDecision | undefined,
): boolean {
  return (
    (budgetDecision?.preparationBudget.selectedVisibleDebtIds.length ?? 0) > 0
  );
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
  hasPreviousRetainedDisplayFrame,
  hasPreviousVisibleProjectionState,
  reducerDecision,
}: {
  readonly activeEditorActivationPending?: boolean | undefined;
  readonly deferResolutionUpdates: boolean;
  readonly hasPreviousRetainedDisplayFrame: boolean;
  readonly hasPreviousVisibleProjectionState: boolean;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): boolean {
  if (hasGpuFlowSafetyOrContinuityDebt(reducerDecision)) {
    return false;
  }
  return (
    !activeEditorActivationPending &&
    hasPreviousRetainedDisplayFrame &&
    hasPreviousVisibleProjectionState &&
    (deferResolutionUpdates ||
      reducerDecision.reducerState === "motion-active" ||
      reducerDecision.reducerState === "motion-settling") &&
    reducerDecision.lane !== "motion" &&
    !reducerDecision.rawReasons.includes("texture-upload") &&
    !hasGpuFlowCriticalContentFrameRequest(reducerDecision.rawReasons)
  );
}

function hasGpuFlowSafetyOrContinuityDebt(
  reducerDecision: GpuFlowVisibleFrameReducerDecision,
): boolean {
  return (
    reducerDecision.classifiedDebt?.safety.active === true ||
    reducerDecision.classifiedDebt?.continuity.active === true
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
