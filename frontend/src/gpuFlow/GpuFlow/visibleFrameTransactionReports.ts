import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type {
  GpuFlowVisiblePublicationCanvasPresentationEvidence,
  GpuFlowVisiblePublicationPresentationEvidence,
} from "./visibleFramePresentationEvidence";

export type GpuFlowVisiblePublicationPresentationProofReport = {
  readonly actorManifestDigest: string;
  readonly batchId: string;
  readonly browserVisualFragmentDigest: string | null;
  readonly canvasGenerationEvidence: GpuFlowVisiblePublicationCanvasPresentationEvidence;
  readonly canvasGeneration: GpuFlowCommittedSurfaceFrame["presentationProof"]["canvasGeneration"];
  readonly domGenerationEvidence: GpuFlowCommittedSurfaceFrame["presentationProof"]["domGenerationEvidence"];
  readonly domGeneration: GpuFlowCommittedSurfaceFrame["presentationProof"]["domGeneration"];
  readonly projectionSampleId: number;
  readonly surfaceTransactionDigest: string | null;
};

export function createGpuFlowVisiblePublicationCompatiblePreviousProofReportForFrame({
  committedFrame,
  projectionSampleId,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly projectionSampleId: number | null;
}) {
  const actorGenerations = committedFrame?.actorGenerations ?? [];
  const samples = actorGenerations.flatMap((actor) => {
    const textCoverageProof = actor.textCoverageProof;
    if (textCoverageProof?.projectionCoverage !== "compatible-previous") {
      return [];
    }
    const proof = textCoverageProof.compatiblePreviousProof;
    return [
      {
        actorFamily: actor.actorFamily,
        actorId: actor.actorId,
        budgetState: proof.budgetState,
        canonicalActorId: actor.canonicalActorId,
        clipChainRevision: proof.clipChainRevision,
        hitMappingCompatible: proof.hitMappingCompatible,
        maxProofAgeFrames: proof.maxProofAgeFrames,
        maxProofAgeMs: proof.maxProofAgeMs,
        previousActorGenerationId: proof.previousActorGenerationId,
        previousCommittedFrameId: proof.previousCommittedFrameId,
        previousProjectionSampleRevision:
          proof.previousProjectionSampleRevision,
        previousTransactionId: proof.previousTransactionId,
        previousVisualGenerationId: proof.previousVisualGenerationId,
        proofAgeFrames: proof.proofAgeFrames,
        proofAgeMs: proof.proofAgeMs,
        protectedResourceIds: proof.protectedResourceIds,
        reasonCode: proof.reasonCode,
        requestedActorGenerationId: proof.requestedActorGenerationId,
        requestedLiveProjectionSampleId: projectionSampleId,
        requestedProjectionSampleRevision:
          proof.requestedProjectionSampleRevision,
        requestedVisualGenerationId: proof.requestedVisualGenerationId,
        resourceHandleIds: proof.resourceHandles.map((handle) => handle.id),
        retainedScrollCompatible: proof.retainedScrollCompatible,
      },
    ];
  });
  const overBudgetActorIds = samples
    .filter((sample) => sample.budgetState === "over-budget")
    .map((sample) => sample.actorId);
  return {
    actorCount: samples.length,
    maxObservedProofAgeFrames: maxNumber(
      samples.map((sample) => sample.proofAgeFrames),
    ),
    maxObservedProofAgeMs: maxNumber(
      samples
        .map((sample) => sample.proofAgeMs)
        .filter((ageMs) => ageMs !== null),
    ),
    overBudgetActorIds,
    samples,
  };
}

export function createGpuFlowVisiblePublicationBrowserActorProofReportForFrame(
  committedFrame: GpuFlowCommittedSurfaceFrame | null,
) {
  const actorGenerations = committedFrame?.actorGenerations ?? [];
  const proofCounts = {
    actualInteraction: {} as Record<string, number>,
    actualVisual: {} as Record<string, number>,
    actorFamily: {} as Record<string, number>,
    requiredInteraction: {} as Record<string, number>,
    requiredVisual: {} as Record<string, number>,
  };
  const canonicalActorIds = new Set<string>();
  let actorCount = 0;
  for (const actor of actorGenerations) {
    const proof = actor.browserVisual?.proof;
    if (!proof) {
      continue;
    }
    actorCount += 1;
    canonicalActorIds.add(actor.canonicalActorId);
    incrementGpuFlowVisiblePublicationProofCount(
      proofCounts.actualInteraction,
      proof.actualInteraction,
    );
    incrementGpuFlowVisiblePublicationProofCount(
      proofCounts.actualVisual,
      proof.actualVisual,
    );
    incrementGpuFlowVisiblePublicationProofCount(
      proofCounts.actorFamily,
      actor.actorFamily,
    );
    incrementGpuFlowVisiblePublicationProofCount(
      proofCounts.requiredInteraction,
      proof.requiredInteraction,
    );
    incrementGpuFlowVisiblePublicationProofCount(
      proofCounts.requiredVisual,
      proof.requiredVisual,
    );
  }
  return {
    actorCount,
    canonicalActorCount: canonicalActorIds.size,
    ...proofCounts,
  };
}

export function createGpuFlowVisiblePublicationCoverageReportForFrame(
  committedFrame: GpuFlowCommittedSurfaceFrame | null,
) {
  const coverageProof =
    committedFrame?.surfaceTransaction?.coverageProof ?? null;
  if (!coverageProof) {
    return null;
  }
  return {
    blockingGenerationCount: coverageProof.blockingGenerationIds.length,
    blockingSurfaceCount: coverageProof.blockingSurfaceIds.length,
    compatibleCoverageCount: coverageProof.compatibleCoverage.length,
    exactCoverageCount: coverageProof.exactCoverage.length,
    protectedResourceCount: coverageProof.protectedResourceHandles.length,
    rendererBucketCount: coverageProof.rendererBuckets.length,
    trueHoleRectCount: coverageProof.trueHoleRects.length,
    visibleRectCount: coverageProof.visibleRects.length,
    zOrderCount: coverageProof.zOrder.length,
  };
}

export function createGpuFlowVisiblePublicationPresentationProofReportForFrame({
  committedFrame,
  presentationEvidence,
  projectionSampleId,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence;
  readonly projectionSampleId: number;
}): GpuFlowVisiblePublicationPresentationProofReport {
  const proof = committedFrame.presentationProof;
  return Object.freeze({
    actorManifestDigest: proof.actorManifestDigest,
    batchId: proof.batchId,
    browserVisualFragmentDigest: proof.browserVisualFragmentDigest,
    canvasGenerationEvidence: Object.freeze({
      ...presentationEvidence.canvasGenerationEvidence,
    }),
    canvasGeneration: Object.freeze({ ...proof.canvasGeneration }),
    domGenerationEvidence: Object.freeze({ ...proof.domGenerationEvidence }),
    domGeneration: Object.freeze({ ...proof.domGeneration }),
    projectionSampleId,
    surfaceTransactionDigest: proof.surfaceTransactionDigest,
  });
}

function incrementGpuFlowVisiblePublicationProofCount(
  counts: Record<string, number>,
  key: string,
): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function maxNumber(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
}
