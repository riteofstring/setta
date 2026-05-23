import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type {
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import { createGpuFlowRetainedProjectionBlockedPublicationCandidate } from "./visibleFramePublicationCandidates";
import type { GpuFlowVisibleFrameBlockedPublicationCandidate } from "./visibleFramePublicationContentPlan";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowPresentableCommit,
} from "./visibleFramePublicationTokens";

export type GpuFlowVisiblePublicationCommitDebtProof = {
  readonly content: boolean;
  readonly maintenance: boolean;
  readonly motion: boolean;
};

export type GpuFlowVisiblePublicationCommitOracle = ReturnType<
  typeof createGpuFlowVisiblePublicationCommitOracle
>;

export type GpuFlowVisibleFramePublicationPreparedFrame = {
  readonly blockedPublicationCandidate?: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationContentCandidate = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationMotionCandidate = {
  readonly blockedProjectionReason: string | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = {
  readonly contentPublicationFrame: ContentPublicationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
};

export type GpuFlowVisibleFramePublicationPreparedCandidateSet = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationTransactionOracle = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly blockedSource: "content-publication" | "motion-projection" | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionSource:
    | "content-publication"
    | "motion-projection"
    | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = GpuFlowVisibleFramePublicationPreparedFrame & {
  readonly contentPublicationFrame: ContentPublicationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly presentableCommit: GpuFlowPresentableCommit | null;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
};

export function createGpuFlowVisiblePublicationCommitDebtProof({
  committedFrame,
  publicationDecision,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisiblePublicationCommitDebtProof {
  return createGpuFlowVisiblePublicationCommitOracle({
    committedFrame,
    publicationDecision,
  }).debtProof;
}

export function createGpuFlowVisiblePublicationCommitOracle({
  committedFrame,
  publicationDecision,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}) {
  const browserActorProofs =
    createGpuFlowVisiblePublicationBrowserActorProofReportForFrame(
      committedFrame,
    );
  const compatiblePreviousProofs =
    createGpuFlowVisiblePublicationCompatiblePreviousProofReportForFrame(
      committedFrame,
    );
  const coverage =
    createGpuFlowVisiblePublicationCoverageReportForFrame(committedFrame);
  const hasCompatiblePreviousCoverage =
    hasGpuFlowVisiblePublicationCompatiblePreviousCoverage({
      committedFrame,
      compatiblePreviousProofs,
      coverage,
    });
  const debtProof = Object.freeze({
    content:
      publicationDecision.lane === "content" && !hasCompatiblePreviousCoverage,
    maintenance:
      publicationDecision.lane === "maintenance" &&
      !hasCompatiblePreviousCoverage,
    motion: publicationDecision.lane === "motion",
  });
  return Object.freeze({
    browserActorProofs,
    compatiblePreviousProofs,
    coverage,
    debtProof,
    hasCompatiblePreviousCoverage,
  });
}

export function createGpuFlowVisiblePublicationCommitOracleReport(
  commitOracle: GpuFlowVisiblePublicationCommitOracle | null,
) {
  if (commitOracle === null) {
    return {
      browserActorProofs:
        createGpuFlowVisiblePublicationBrowserActorProofReportForFrame(null),
      commitOracle: null,
      compatiblePreviousProofs:
        createGpuFlowVisiblePublicationCompatiblePreviousProofReportForFrame(
          null,
        ),
      coverage: null,
    };
  }
  return {
    browserActorProofs: commitOracle.browserActorProofs,
    commitOracle: {
      debtProof: commitOracle.debtProof,
      hasCompatiblePreviousCoverage: commitOracle.hasCompatiblePreviousCoverage,
    },
    compatiblePreviousProofs: commitOracle.compatiblePreviousProofs,
    coverage: commitOracle.coverage,
  };
}

export function selectGpuFlowVisibleFramePublicationPreparedFrame<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  heldPreviousProjectionState,
  motionProjectionFrame,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePublicationPreparedCandidateSet {
  const oracle = createGpuFlowVisibleFramePublicationTransactionOracle({
    contentPublicationFrame,
    heldPreviousProjectionState,
    motionProjectionFrame,
  });
  return Object.freeze({
    blockedPublicationCandidate: oracle.blockedPublicationCandidate,
    renderedVisibleFrame: oracle.renderedVisibleFrame,
    visibleProjectionState: oracle.visibleProjectionState,
  });
}

export function createGpuFlowVisibleFramePublicationTransactionOracle<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  heldPreviousProjectionState,
  motionProjectionFrame,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePublicationTransactionOracle {
  const visibleProjectionState =
    contentPublicationFrame.visibleProjectionState ??
    motionProjectionFrame.visibleProjectionState;
  const blockedPublicationCandidate =
    contentPublicationFrame.blockedPublicationCandidate ??
    createGpuFlowMotionProjectionBlockedPublicationCandidate({
      blockedProjectionReason: motionProjectionFrame.blockedProjectionReason,
      heldPreviousProjectionState,
    });
  return Object.freeze({
    blockedPublicationCandidate,
    blockedSource: createGpuFlowVisibleFramePublicationOracleBlockedSource({
      blockedPublicationCandidate,
      contentPublicationFrame,
      motionProjectionFrame,
    }),
    renderedVisibleFrame: visibleProjectionState !== null,
    visibleProjectionSource:
      createGpuFlowVisibleFramePublicationOracleProjectionSource({
        contentPublicationFrame,
        motionProjectionFrame,
        visibleProjectionState,
      }),
    visibleProjectionState,
  });
}

function hasGpuFlowVisiblePublicationCompatiblePreviousCoverage({
  committedFrame,
  compatiblePreviousProofs,
  coverage,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly compatiblePreviousProofs: ReturnType<
    typeof createGpuFlowVisiblePublicationCompatiblePreviousProofReportForFrame
  >;
  readonly coverage: ReturnType<
    typeof createGpuFlowVisiblePublicationCoverageReportForFrame
  >;
}): boolean {
  return (
    (committedFrame.projectionHorizon?.textActorCoverage
      ?.compatiblePreviousActorIds.length ?? 0) > 0 ||
    compatiblePreviousProofs.actorCount > 0 ||
    (coverage?.compatibleCoverageCount ?? 0) > 0
  );
}

function createGpuFlowVisibleFramePublicationOracleBlockedSource<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  blockedPublicationCandidate,
  contentPublicationFrame,
  motionProjectionFrame,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
}): GpuFlowVisibleFramePublicationTransactionOracle["blockedSource"] {
  if (!blockedPublicationCandidate) {
    return null;
  }
  if (contentPublicationFrame.blockedPublicationCandidate) {
    return "content-publication";
  }
  if (motionProjectionFrame.blockedProjectionReason !== null) {
    return "motion-projection";
  }
  return null;
}

function createGpuFlowVisibleFramePublicationOracleProjectionSource<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  motionProjectionFrame,
  visibleProjectionState,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePublicationTransactionOracle["visibleProjectionSource"] {
  if (!visibleProjectionState) {
    return null;
  }
  if (contentPublicationFrame.visibleProjectionState) {
    return "content-publication";
  }
  if (motionProjectionFrame.visibleProjectionState) {
    return "motion-projection";
  }
  return null;
}

function createGpuFlowMotionProjectionBlockedPublicationCandidate({
  blockedProjectionReason,
  heldPreviousProjectionState,
}: {
  readonly blockedProjectionReason: string | null;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameBlockedPublicationCandidate | null {
  if (blockedProjectionReason === null) {
    return null;
  }
  return createGpuFlowRetainedProjectionBlockedPublicationCandidate({
    blockedReason: blockedProjectionReason,
    heldPreviousProjectionState,
  });
}

function createGpuFlowVisiblePublicationCompatiblePreviousProofReportForFrame(
  committedFrame: GpuFlowCommittedSurfaceFrame | null,
) {
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
        hitMappingCompatible: proof.hitMappingCompatible,
        maxProofAgeFrames: proof.maxProofAgeFrames,
        maxProofAgeMs: proof.maxProofAgeMs,
        previousCommittedFrameId: proof.previousCommittedFrameId,
        previousProjectionSampleRevision:
          proof.previousProjectionSampleRevision,
        proofAgeFrames: proof.proofAgeFrames,
        proofAgeMs: proof.proofAgeMs,
        protectedResourceIds: proof.protectedResourceIds,
        reasonCode: proof.reasonCode,
        requestedProjectionSampleRevision:
          proof.requestedProjectionSampleRevision,
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

function createGpuFlowVisiblePublicationBrowserActorProofReportForFrame(
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

function incrementGpuFlowVisiblePublicationProofCount(
  counts: Record<string, number>,
  key: string,
): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function createGpuFlowVisiblePublicationCoverageReportForFrame(
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

function maxNumber(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
}
