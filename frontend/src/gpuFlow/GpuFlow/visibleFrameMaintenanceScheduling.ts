import type { GpuFrameReason } from "../gpuRenderer";
import {
  hasGpuFlowCriticalContentFrameRequest,
  isGpuFlowMaintenanceFrameReason,
  isGpuFlowMotionFrameReason,
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
    !rawReasons.some(isGpuFlowMotionFrameReason) &&
    !hasGpuFlowCriticalContentFrameRequest(rawReasons)
  );
}
