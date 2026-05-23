import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { GpuFlowNodeLayerFrameResult } from "./flowFrameResult";
import { createGpuFlowBrowserVisualBlockedPublicationCandidate } from "./visibleFramePublicationCommittedSurfaceAuthority";
import type {
  GpuFlowCommittedSurfacePublicationEffect,
  GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFramePublicationContentPlan";

export type GpuFlowContentPublicationBlockedCandidateSelector = (input: {
  readonly blockedCommittedSurfacePublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
  readonly committedSurfacePublicationEffect?:
    | GpuFlowCommittedSurfacePublicationEffect
    | null
    | undefined;
  readonly retainedDisplayBlockedPublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
}) => GpuFlowVisibleFrameBlockedPublicationCandidate | null;

export type GpuFlowContentPublicationBlockedCandidateForFrameResultSelector =
  (input: {
    readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  }) => GpuFlowVisibleFrameBlockedPublicationCandidate | null;

export function createGpuFlowContentPublicationBlockedCandidateSelector({
  previousVisibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationBlockedCandidateSelector {
  return selectGpuFlowContentPublicationBlockedCandidate({
    previousVisibleProjectionState,
  });
}

function selectGpuFlowContentPublicationBlockedCandidate({
  previousVisibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationBlockedCandidateSelector {
  return ({
    blockedCommittedSurfacePublicationCandidate,
    committedSurfacePublicationEffect,
    retainedDisplayBlockedPublicationCandidate,
  }) => {
    if (blockedCommittedSurfacePublicationCandidate) {
      return blockedCommittedSurfacePublicationCandidate;
    }
    if (retainedDisplayBlockedPublicationCandidate) {
      return retainedDisplayBlockedPublicationCandidate;
    }
    if (committedSurfacePublicationEffect?.kind !== "held-previous") {
      return null;
    }
    return createGpuFlowBrowserVisualBlockedPublicationCandidate({
      frame: committedSurfacePublicationEffect.candidateFrame,
      heldPreviousProjectionState: previousVisibleProjectionState,
    });
  };
}

export function createGpuFlowContentPublicationBlockedCandidateForFrameResultSelector({
  previousVisibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationBlockedCandidateForFrameResultSelector {
  const selectContentPublicationBlockedCandidate =
    selectGpuFlowContentPublicationBlockedCandidate({
      previousVisibleProjectionState,
    });
  return ({ nodeLayerFrameResult }) =>
    selectGpuFlowContentPublicationBlockedCandidateForFrameResult({
      nodeLayerFrameResult,
      selectContentPublicationBlockedCandidate,
    });
}

function selectGpuFlowContentPublicationBlockedCandidateForFrameResult({
  nodeLayerFrameResult,
  selectContentPublicationBlockedCandidate,
}: {
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly selectContentPublicationBlockedCandidate: GpuFlowContentPublicationBlockedCandidateSelector;
}): GpuFlowVisibleFrameBlockedPublicationCandidate | null {
  const committedSurfacePublication =
    nodeLayerFrameResult.committedSurfacePublication;
  return selectContentPublicationBlockedCandidate({
    blockedCommittedSurfacePublicationCandidate:
      committedSurfacePublication.blockedSurfacePublication
        ?.blockedPublicationCandidate ?? null,
    committedSurfacePublicationEffect:
      committedSurfacePublication.committedSurfacePublicationEffect,
    retainedDisplayBlockedPublicationCandidate:
      nodeLayerFrameResult.blockedPublicationCandidate,
  });
}
