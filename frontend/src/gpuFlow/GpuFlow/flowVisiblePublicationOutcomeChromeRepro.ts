import {
  isChromeReproActive,
  postChromeReproEvent,
} from "state/actions/chromeRepro";

import type {
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import type { GpuFlowVisiblePublicationCompletionOutcome } from "../projectionScheduler";

type GpuFlowVisiblePublicationSchedulerCompletion = {
  readonly debt: {
    readonly content: boolean;
    readonly maintenance: boolean;
    readonly motion: boolean;
  };
  readonly outcome: string;
};

export function postGpuFlowVisiblePublicationOutcomeChromeReproEvent({
  completion,
  outcome,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly completion: GpuFlowVisiblePublicationSchedulerCompletion;
  readonly outcome: GpuFlowVisiblePublicationCompletionOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): void {
  if (!isChromeReproActive()) {
    return;
  }
  postChromeReproEvent(
    "gpu-flow-visible-publication-outcome",
    createGpuFlowVisiblePublicationOutcomeChromeReproPayload({
      completion,
      outcome,
      publicationDecision,
      visibleProjectionState,
    }),
  );
}

export function createGpuFlowVisiblePublicationOutcomeChromeReproPayload({
  completion,
  outcome,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly completion: GpuFlowVisiblePublicationSchedulerCompletion;
  readonly outcome: GpuFlowVisiblePublicationCompletionOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  return {
    coverage: createGpuFlowVisiblePublicationCoverageChromeReproPayload(
      visibleProjectionState,
    ),
    browserActorProofs:
      createGpuFlowVisiblePublicationBrowserActorProofChromeReproPayload(
        visibleProjectionState,
      ),
    compatiblePreviousProofs:
      createGpuFlowVisiblePublicationCompatiblePreviousProofChromeReproPayload(
        visibleProjectionState,
      ),
    decisionDebt: publicationDecision.debt,
    lane: publicationDecision.lane,
    outcome: outcome.kind,
    projectionSampleId: publicationDecision.sample.id,
    rawReasons: publicationDecision.rawReasons,
    remainingDebt: completion.debt,
    schedulerOutcome: completion.outcome,
    schedulerState: publicationDecision.schedulerState,
    token: createGpuFlowVisiblePublicationOutcomeTokenPayload(outcome),
    transactionId: visibleProjectionState?.transaction.id ?? null,
    transactionKind: visibleProjectionState?.transaction.kind ?? null,
    visibleCommittedFrameId:
      visibleProjectionState?.committedFrame.displayFrameId ?? null,
  };
}

function createGpuFlowVisiblePublicationOutcomeTokenPayload(
  outcome: GpuFlowVisiblePublicationCompletionOutcome,
) {
  switch (outcome.kind) {
    case "commit":
      return {
        committedFrameId: outcome.token.committedFrameId,
        expectedActorSetDigest: outcome.token.expectedActorSetDigest,
        presentationPairDigest: outcome.token.presentationPairDigest,
        projectionSampleId: outcome.token.projectionSampleId,
        proofDigest: outcome.token.proofDigest,
        transactionId: outcome.token.transactionId,
      };
    case "hold-previous":
      return {
        committedFrameId: outcome.token.committedFrameId,
        holdAgeFrames: outcome.token.holdAgeFrames,
        holdAgeMs: outcome.token.holdAgeMs,
        projectionSampleId: outcome.token.projectionSampleId,
        transactionId: outcome.token.transactionId,
      };
    case "blocked":
      return {
        blockedReasons: outcome.token.blockedReasons,
        frozenFrame: outcome.token.frozenFrame,
        frozenFrameId: outcome.token.frozenFrameId,
        projectionSampleId: outcome.token.projectionSampleId,
        transactionId: outcome.token.transactionId,
      };
    case "not-published":
      return null;
  }
}

function createGpuFlowVisiblePublicationCompatiblePreviousProofChromeReproPayload(
  visibleProjectionState: GpuFlowVisibleProjectionState | null,
) {
  const actorGenerations =
    visibleProjectionState?.committedFrame.actorGenerations ?? [];
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
        previousProjectionSampleRevision: proof.previousProjectionSampleRevision,
        proofAgeFrames: proof.proofAgeFrames,
        proofAgeMs: proof.proofAgeMs,
        protectedResourceIds: proof.protectedResourceIds,
        reasonCode: proof.reasonCode,
        requestedProjectionSampleRevision: proof.requestedProjectionSampleRevision,
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

function maxNumber(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
}

function createGpuFlowVisiblePublicationBrowserActorProofChromeReproPayload(
  visibleProjectionState: GpuFlowVisibleProjectionState | null,
) {
  const actorGenerations =
    visibleProjectionState?.committedFrame.actorGenerations ?? [];
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

function createGpuFlowVisiblePublicationCoverageChromeReproPayload(
  visibleProjectionState: GpuFlowVisibleProjectionState | null,
) {
  const coverageProof =
    visibleProjectionState?.committedFrame.surfaceTransaction?.coverageProof ??
    null;
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
