import type { GpuFlowPreparedContentFrame } from "../../preparedContentFrame";
import type { GpuFlowPreparedContentFramePublicationCandidate } from "../visibleFrameContentPlan";

export type GpuFlowBlockedPreparedContentFrameCandidate = Extract<
  GpuFlowPreparedContentFramePublicationCandidate,
  { readonly kind: "nonpublishable" }
>;

export type GpuFlowPreparedContentFrameCandidateAction =
  | {
      readonly preparedContentFrame: GpuFlowPreparedContentFrame | null;
      readonly kind: "publish";
    }
  | {
      readonly blockedSurfacePublication: GpuFlowBlockedPreparedContentFrameCandidate;
      readonly kind: "blocked-candidate";
      readonly visibleProjectionState: null;
    };
