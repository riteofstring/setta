import type {
  GpuFlowVisibleFrameRequestFacts,
  GpuFlowVisiblePublicationDecision,
} from "./visibleFrameScheduling";
import type { GpuFlowVisibleFramePublicationLane } from "./visibleFrameStateMachine";

export function createGpuFlowVisiblePublicationDecisionForLane({
  frameRequest,
  lane,
}: {
  readonly frameRequest: GpuFlowVisibleFrameRequestFacts;
  readonly lane: GpuFlowVisibleFramePublicationLane;
}): GpuFlowVisiblePublicationDecision {
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
