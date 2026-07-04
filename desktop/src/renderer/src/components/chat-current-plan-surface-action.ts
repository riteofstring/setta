import type { ActivityItemBlockProjection } from "@generated/backend";

import type { CurrentPlanSurfaceTarget } from "./chat-current-plan-surface";

export interface CurrentPlanSurfaceAction extends CurrentPlanSurfaceTarget {
  onOpenCurrentPlanSurface: (target: CurrentPlanSurfaceTarget) => void;
}

export function currentPlanSurfaceActionForActivity({
  activeCurrentPlanTarget,
  activity,
  onOpenCurrentPlanSurface,
  runId,
}: {
  activeCurrentPlanTarget?: CurrentPlanSurfaceTarget | null;
  activity: ActivityItemBlockProjection;
  onOpenCurrentPlanSurface?: (target: CurrentPlanSurfaceTarget) => void;
  runId: string;
}): CurrentPlanSurfaceAction | null {
  if (
    activeCurrentPlanTarget === null ||
    activeCurrentPlanTarget === undefined ||
    onOpenCurrentPlanSurface === undefined ||
    activity.type !== "plan" ||
    activity.details.plan === null ||
    activeCurrentPlanTarget.runId !== runId ||
    activeCurrentPlanTarget.sourceRunItemId !== activity.sourceRunItemId
  ) {
    return null;
  }
  return {
    onOpenCurrentPlanSurface,
    runId,
    sourceRunItemId: activity.sourceRunItemId,
  };
}
