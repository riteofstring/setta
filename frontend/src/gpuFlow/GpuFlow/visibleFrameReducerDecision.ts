import type {
  GpuFlowVisibleFrameRequestFacts,
  GpuFlowVisibleFrameReducerDecision,
} from "./visibleFrameReducerRuntime";
import type { GpuFlowVisibleFrameWorkLane } from "./visibleFrameStateMachine";

export function createGpuFlowVisibleFrameReducerDecisionForLane({
  frameRequest,
  lane,
}: {
  readonly frameRequest: GpuFlowVisibleFrameRequestFacts;
  readonly lane: GpuFlowVisibleFrameWorkLane;
}): GpuFlowVisibleFrameReducerDecision {
  return Object.freeze({
    debt: Object.freeze({
      content: lane === "content" ? false : frameRequest.contentDebt,
      maintenance:
        lane === "maintenance" ? false : frameRequest.maintenanceDebt,
      motion: lane === "motion" ? false : frameRequest.motionDebt,
    }),
    lane,
    rawReasons: Object.freeze([...frameRequest.rawReasons]),
    sample: frameRequest.sample,
    schedulerState: frameRequest.schedulerState,
  });
}
