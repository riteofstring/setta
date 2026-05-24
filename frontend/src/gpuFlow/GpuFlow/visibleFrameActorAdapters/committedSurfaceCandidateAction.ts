import type { GpuFlowCommittedSurfaceFrame } from "../../committedSurfaceFrame";
import type { GpuFlowCommittedSurfacePublicationCandidate } from "../visibleFrameContentPlan";

export type GpuFlowBlockedCommittedSurfaceCandidate = Extract<
  GpuFlowCommittedSurfacePublicationCandidate,
  { readonly kind: "nonpublishable" }
>;

export type GpuFlowCommittedSurfaceCandidateAction =
  | {
      readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
      readonly kind: "publish";
    }
  | {
      readonly blockedSurfacePublication: GpuFlowBlockedCommittedSurfaceCandidate;
      readonly kind: "blocked-candidate";
      readonly visibleProjectionState: null;
    };
