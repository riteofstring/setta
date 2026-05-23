import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { GpuFlowCommittedSurfacePublicationCandidate } from "./visibleFramePublicationContentPlan";

export type GpuFlowBlockedCommittedSurfacePublication = Extract<
  GpuFlowCommittedSurfacePublicationCandidate,
  { readonly kind: "blocked" }
>;

export type GpuFlowCommittedSurfacePublicationCandidateAction =
  | {
      readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
      readonly kind: "publish";
    }
  | {
      readonly blockedSurfacePublication: GpuFlowBlockedCommittedSurfacePublication;
      readonly kind: "blocked";
      readonly visibleProjectionState: null;
    }
  | {
      readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
      readonly kind: "held-previous";
      readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
    };
