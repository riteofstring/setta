import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowCommittedSurfacePublicationCandidate } from "./visibleFramePublicationContentPlan";

export type GpuFlowBlockedCommittedSurfacePublication = Extract<
  GpuFlowCommittedSurfacePublicationCandidate,
  { readonly kind: "nonpublishable" }
>;

export type GpuFlowCommittedSurfacePublicationCandidateAction =
  | {
      readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
      readonly kind: "publish";
    }
  | {
      readonly blockedSurfacePublication: GpuFlowBlockedCommittedSurfacePublication;
      readonly kind: "rejected-candidate";
      readonly visibleProjectionState: null;
    };
