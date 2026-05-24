import type { GpuFlowCommittedSurfaceFrame } from "../../committedSurfaceFrame";
import type { GpuFlowPreparedContentFramePublicationCandidate } from "../visibleFrameContentPlan";

export type GpuFlowBlockedPreparedContentFrameCandidate = Extract<
  GpuFlowPreparedContentFramePublicationCandidate,
  { readonly kind: "nonpublishable" }
>;

export type GpuFlowPreparedContentFrameCandidateAction =
  | {
      readonly preparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
      readonly kind: "publish";
    }
  | {
      readonly blockedSurfacePublication: GpuFlowBlockedPreparedContentFrameCandidate;
      readonly kind: "blocked-candidate";
      readonly visibleProjectionState: null;
    };
