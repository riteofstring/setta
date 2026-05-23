import type { GpuFlowVisiblePublicationDecision } from "../projectionRuntime";
import { createGpuFlowVisibleFrameBlockedPublicationToken } from "./visibleFramePublicationCompletion";
import type { GpuFlowVisiblePublicationBlockedProof } from "./visibleFramePublicationOracle";
import type { GpuFlowBlockedPublicationToken } from "./visibleFramePublicationTokens";

export function createGpuFlowVisibleFrameBlockedPublicationTokenForProof({
  proof,
  publicationDecision,
}: {
  readonly proof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowBlockedPublicationToken | null {
  if (!proof) {
    return null;
  }
  return createGpuFlowVisibleFrameBlockedPublicationToken({
    blockedReasons: proof.blockedReasons,
    frozenFrameId: proof.frozenFrameId,
    projectionSample: publicationDecision.sample,
  });
}
