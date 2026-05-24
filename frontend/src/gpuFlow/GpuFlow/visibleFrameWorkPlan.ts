import type { GpuFlowProjectionLane } from "../projectionRuntime";
import { hasGpuFlowCriticalContentFrameRequest } from "../projectionSchedulerPolicy";
import {
  shouldDeferGpuFlowBrowserVisualRepairForBudget,
  type GpuFlowVisibleFrameBudgetBroker,
} from "./visibleFrameBudgetBroker";
import type { GpuFlowVisibleFrameReducerDecision } from "./visibleFrameReducerRuntime";

export type GpuFlowMotionProjectionWorkPlan =
  | {
      readonly kind: "prepare";
    }
  | {
      readonly kind: "skip";
    };

export type GpuFlowContentPublicationWorkPlan =
  | {
      readonly kind: "prepare";
      readonly publicationLane: Extract<
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

export function createGpuFlowContentPublicationWorkPlan({
  blockedProjectionOnlyFrame,
  reducerDecision,
  renderedProjectionOnlyFrame,
}: {
  readonly blockedProjectionOnlyFrame: boolean;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly renderedProjectionOnlyFrame: boolean;
}): GpuFlowContentPublicationWorkPlan {
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
    publicationLane:
      reducerDecision.lane === "maintenance" ? "maintenance" : "content",
  });
}

export function shouldDeferGpuFlowBrowserVisualResourceWakeupForPublication({
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

export function shouldConsiderGpuFlowDeferredContentPublication({
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
  return (
    !activeEditorActivationPending &&
    hasPreviousRetainedDisplayFrame &&
    hasPreviousVisibleProjectionState &&
    (deferResolutionUpdates ||
      reducerDecision.schedulerState === "motion-active" ||
      reducerDecision.schedulerState === "motion-settling") &&
    reducerDecision.lane !== "motion" &&
    !reducerDecision.rawReasons.includes("texture-upload") &&
    !hasGpuFlowCriticalContentFrameRequest(reducerDecision.rawReasons)
  );
}

export function shouldSkipGpuFlowDeferredContentPublicationFrame({
  shouldConsiderDeferredPublication,
}: {
  readonly canReusePreparedFrame: boolean;
  readonly hasPreparedFrame: boolean;
  readonly hasUnpublishedPreparedSourceFrame: boolean;
  readonly shouldConsiderDeferredPublication: boolean;
}): boolean {
  return shouldConsiderDeferredPublication;
}
