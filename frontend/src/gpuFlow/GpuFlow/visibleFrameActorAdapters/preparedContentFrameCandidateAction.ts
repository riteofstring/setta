import type { GpuFlowPreparedContentFrame } from "../../preparedContentFrame";
import type { GpuFlowPreparedContentFramePresentationCandidate } from "../visibleFrameContentPlan";

export type GpuFlowBlockedPreparedContentFrameCandidate = Extract<
  GpuFlowPreparedContentFramePresentationCandidate,
  { readonly kind: "blocked" }
>;

export type GpuFlowPreparedContentFrameCandidateAction =
  | {
      readonly preparedContentFrame: GpuFlowPreparedContentFrame | null;
      readonly kind: "present";
    }
  | {
      readonly blockedSurfacePublication: GpuFlowBlockedPreparedContentFrameCandidate;
      readonly kind: "blocked-candidate";
      readonly visibleProjectionState: null;
    };
