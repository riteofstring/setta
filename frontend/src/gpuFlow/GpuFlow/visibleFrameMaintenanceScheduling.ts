import type { GpuFrameReason } from "../gpuRenderer";
import {
  hasGpuFlowCriticalContentFrameRequest,
  isGpuFlowMaintenanceFrameReason,
  isGpuFlowRetainedMotionFrameReason,
} from "../projectionSchedulerPolicy";

export function shouldDrainGpuFlowBrowserVisualMaintenanceNow({
  browserVisualContentRepairBlocked,
  contentDebt,
  maintenanceDebt,
  rawReasons,
  viewportInteractionActive,
}: {
  readonly browserVisualContentRepairBlocked: boolean;
  readonly contentDebt: boolean;
  readonly maintenanceDebt: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly viewportInteractionActive: boolean;
}): boolean {
  return (
    browserVisualContentRepairBlocked &&
    contentDebt &&
    maintenanceDebt &&
    !viewportInteractionActive &&
    rawReasons.some(isGpuFlowMaintenanceFrameReason) &&
    !rawReasons.some(isGpuFlowRetainedMotionFrameReason) &&
    !hasGpuFlowCriticalContentFrameRequest(rawReasons)
  );
}
