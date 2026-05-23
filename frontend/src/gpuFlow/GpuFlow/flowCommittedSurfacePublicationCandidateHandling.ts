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

export function resolveGpuFlowCommittedSurfacePublicationCandidateAction({
  candidate,
  publishedCommittedSurfaceFrame,
}: {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfacePublicationCandidateAction {
  switch (candidate.kind) {
    case "blocked":
      return {
        blockedSurfacePublication: candidate,
        kind: "blocked",
        visibleProjectionState: null,
      };
    case "held-previous":
      return {
        heldPreparedCommittedSurfaceFrame:
          publishedCommittedSurfaceFrame ?? null,
        kind: "held-previous",
        visibleProjectionState: candidate.visibleProjectionState,
      };
    case "publish":
      return {
        committedSurfaceFrame: publishedCommittedSurfaceFrame ?? null,
        kind: "publish",
      };
  }
}

export function assertGpuFlowCommittedSurfacePublicationCandidatePublished(
  candidate: GpuFlowCommittedSurfacePublicationCandidate,
): asserts candidate is Extract<
  GpuFlowCommittedSurfacePublicationCandidate,
  { readonly kind: "publish" }
> {
  if (candidate.kind !== "publish") {
    throw new Error(
      "GPU Flow committed surface publication continued without a publish candidate.",
    );
  }
}
