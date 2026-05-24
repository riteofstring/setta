import type { GpuFlowProjectionLane } from "../projectionRuntime";
import {
  shouldDeferGpuFlowBrowserVisualRepairForBudget,
  type GpuFlowVisibleFrameBudgetBroker,
} from "./visibleFrameBudgetBroker";
import {
  shouldDeferGpuFlowMaintenanceContentCatchup,
  type GpuFlowVisiblePublicationDecision,
} from "./visibleFrameScheduling";

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
  publicationDecision,
}: {
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowMotionProjectionWorkPlan {
  if (publicationDecision.lane !== "motion") {
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
  publicationDecision,
  renderedProjectionOnlyFrame,
}: {
  readonly blockedProjectionOnlyFrame: boolean;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly renderedProjectionOnlyFrame: boolean;
}): GpuFlowContentPublicationWorkPlan {
  if (
    blockedProjectionOnlyFrame ||
    renderedProjectionOnlyFrame ||
    publicationDecision.lane === "motion" ||
    publicationDecision.lane === "idle"
  ) {
    return Object.freeze({
      kind: "skip" as const,
    });
  }
  return Object.freeze({
    kind: "prepare" as const,
    publicationLane:
      publicationDecision.lane === "maintenance" ? "maintenance" : "content",
  });
}

export function shouldDeferGpuFlowBrowserVisualResourceWakeupForPublication({
  budgetBroker,
  deferResolutionUpdates,
  publicationDecision,
}: {
  readonly budgetBroker?: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly deferResolutionUpdates: boolean;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): boolean {
  return shouldDeferGpuFlowBrowserVisualRepairForBudget({
    budgetBroker,
    deferResolutionUpdates,
    publicationDecision,
  });
}

export function shouldConsiderGpuFlowDeferredContentPublication({
  deferResolutionUpdates,
  hasPreviousRetainedDisplayFrame,
  hasPreviousVisibleProjectionState,
  publicationDecision,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly hasPreviousRetainedDisplayFrame: boolean;
  readonly hasPreviousVisibleProjectionState: boolean;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): boolean {
  return (
    deferResolutionUpdates &&
    hasPreviousVisibleProjectionState &&
    publicationDecision.lane !== "motion" &&
    hasPreviousRetainedDisplayFrame &&
    (publicationDecision.schedulerState === "motion-settling" ||
      shouldDeferGpuFlowMaintenanceContentCatchup({
        lane: publicationDecision.lane,
        rawReasons: publicationDecision.rawReasons,
      }))
  );
}
