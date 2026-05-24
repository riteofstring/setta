import type {
  GpuFlowProjectionLane,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import { shouldDeferGpuFlowMaintenanceContentCatchup } from "../projectionScheduler";
import { shouldDeferGpuFlowBrowserVisualRepairForBudget } from "./visibleFrameBudgetBroker";

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

export function shouldDeferGpuFlowBrowserVisualRetryForPublication({
  deferResolutionUpdates,
  publicationDecision,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): boolean {
  return shouldDeferGpuFlowBrowserVisualRepairForBudget({
    deferResolutionUpdates,
    publicationDecision,
  });
}

export function shouldConsiderGpuFlowDeferredContentPublication({
  deferResolutionUpdates,
  hasPreviousRetainedDisplayFrame,
  publicationDecision,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly hasPreviousRetainedDisplayFrame: boolean;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): boolean {
  return (
    deferResolutionUpdates &&
    publicationDecision.lane !== "motion" &&
    hasPreviousRetainedDisplayFrame &&
    (publicationDecision.schedulerState === "motion-settling" ||
      shouldDeferGpuFlowMaintenanceContentCatchup({
        lane: publicationDecision.lane,
        rawReasons: publicationDecision.rawReasons,
      }))
  );
}
