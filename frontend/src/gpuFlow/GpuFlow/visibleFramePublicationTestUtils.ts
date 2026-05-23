import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import { createGpuFlowVisiblePublicationCompletionCommitToken } from "./visibleFramePublicationCompletion";
import { createGpuFlowVisibleFramePublicationTransactionOracle } from "./visibleFramePublicationOracle";
import type { GpuFlowCommitPublicationToken } from "./visibleFramePublicationTokens";

export function createGpuFlowVisibleFrameCommitPublicationTokenForTest({
  frame,
  projectionSample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowCommitPublicationToken {
  const publicationDecision = {
    lane: "content",
    sample: projectionSample,
  } as GpuFlowVisiblePublicationDecision;
  const visibleProjectionState = {
    committedFrame: frame,
    heldPreviousProjection: null,
    sample: projectionSample,
    transaction: {
      kind: "content-publication",
    },
  } as GpuFlowVisibleProjectionState;
  const transactionOracle =
    createGpuFlowVisibleFramePublicationTransactionOracle({
      contentPublicationFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState,
      },
      motionProjectionFrame: {
        blockedPublicationCandidate: null,
        visibleProjectionState: null,
      },
      publicationDecision,
    });

  return createGpuFlowVisiblePublicationCompletionCommitToken({
    presentableCommit: transactionOracle.presentableCommit,
    publicationDecision,
    visibleProjectionState,
  });
}
