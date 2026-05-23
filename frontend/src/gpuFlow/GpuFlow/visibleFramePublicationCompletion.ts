import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
  type GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import {
  createGpuFlowBlockedPublicationToken,
  createGpuFlowCommitPublicationToken,
  createGpuFlowCommittedSurfaceResetToken,
  createGpuFlowCommittedSurfaceStartupToken,
  createGpuFlowHoldPreviousToken,
  createGpuFlowPresentableCommit,
  GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
} from "./visibleFramePublicationAuthority";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowBlockedVisibleReason,
  GpuFlowCommitPublicationToken,
  GpuFlowCommittedSurfaceResetToken,
  GpuFlowCommittedSurfaceStartupToken,
  GpuFlowHoldPreviousToken,
} from "./visibleFramePublicationTokens";

type GpuFlowVisiblePublicationScheduler = ReturnType<
  typeof createGpuFlowVisiblePublicationScheduler
>;

export type GpuFlowVisiblePublicationCompletion = ReturnType<
  GpuFlowVisiblePublicationScheduler["completeFrame"]
>;

export type GpuFlowVisiblePublicationCommitDebtProof = {
  readonly content: boolean;
  readonly maintenance: boolean;
  readonly motion: boolean;
};

export type GpuFlowVisiblePublicationOutcome = ReturnType<
  typeof createGpuFlowVisiblePublicationCompletionOutcome
>;

export type GpuFlowVisiblePublicationCommitOracle = ReturnType<
  typeof createGpuFlowVisiblePublicationCommitOracle
>;

export type GpuFlowVisiblePublicationTransactionCompletion = {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
};

export function createGpuFlowCommittedSurfaceResetPublicationToken(): GpuFlowCommittedSurfaceResetToken {
  return createGpuFlowCommittedSurfaceResetToken();
}

export function createGpuFlowCommittedSurfaceStartupPublicationToken({
  frame,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): GpuFlowCommittedSurfaceStartupToken {
  return createGpuFlowCommittedSurfaceStartupToken({ frame });
}

export function createGpuFlowVisibleFrameCommitPublicationToken({
  frame,
  projectionSample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowCommitPublicationToken {
  return createGpuFlowCommitPublicationToken({
    presentableCommit: createGpuFlowPresentableCommit({
      frame,
      projectionSample,
    }),
  });
}

export function createGpuFlowVisibleFrameHoldPreviousToken({
  committedFrameId,
  holdAgeFrames,
  holdAgeMs,
  projectionSample,
}: {
  readonly committedFrameId: number;
  readonly holdAgeFrames: number;
  readonly holdAgeMs: number;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowHoldPreviousToken {
  return createGpuFlowHoldPreviousToken({
    committedFrameId,
    holdAgeFrames,
    holdAgeMs,
    projectionSample,
  });
}

export function createGpuFlowVisibleFrameBlockedPublicationToken({
  blockedReasons,
  frozenFrameId,
  projectionSample,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId: GpuFlowBlockedPublicationToken["frozenFrameId"];
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowBlockedPublicationToken {
  return createGpuFlowBlockedPublicationToken({
    blockedReasons,
    frozenFrameId,
    projectionSample,
  });
}

export function createGpuFlowVisiblePublicationCompletionHoldOutcome({
  publicationDecision,
  visibleProjectionState,
}: {
  readonly publicationDecision: {
    readonly sample: GpuFlowLiveProjectionSample;
  };
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}) {
  const heldPreviousProjection =
    assertGpuFlowHeldPreviousPublicationCompletionMatchesSample({
      publicationDecision,
      visibleProjectionState,
    });
  return {
    kind: "hold-previous" as const,
    token: createGpuFlowVisibleFrameHoldPreviousToken({
      committedFrameId: visibleProjectionState.committedFrame.displayFrameId,
      holdAgeFrames: heldPreviousProjection.consecutiveFrameCount,
      holdAgeMs: heldPreviousProjection.heldDurationMs,
      projectionSample: publicationDecision.sample,
    }),
  };
}

function createGpuFlowVisiblePublicationCompletionHeldPreviousOutcome({
  blockedPublicationToken,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}):
  | {
      readonly kind: "blocked";
      readonly token: GpuFlowBlockedPublicationToken;
    }
  | {
      readonly kind: "hold-previous";
      readonly token: GpuFlowHoldPreviousToken;
    } {
  assertGpuFlowHeldPreviousPublicationCompletionMatchesSample({
    publicationDecision,
    visibleProjectionState,
  });
  if (
    !isGpuFlowVisiblePublicationHeldPreviousOverBudget(visibleProjectionState)
  ) {
    return createGpuFlowVisiblePublicationCompletionHoldOutcome({
      publicationDecision,
      visibleProjectionState,
    });
  }
  if (blockedPublicationToken) {
    return {
      kind: "blocked",
      token: blockedPublicationToken,
    };
  }
  return {
    kind: "blocked",
    token: createGpuFlowVisibleFrameBlockedPublicationToken({
      blockedReasons: [
        {
          actorId: null,
          family: "visible-transaction",
          reason: "held-previous-budget-exceeded",
        },
      ],
      frozenFrameId: visibleProjectionState.committedFrame.displayFrameId,
      projectionSample: publicationDecision.sample,
    }),
  };
}

function assertGpuFlowHeldPreviousPublicationCompletionMatchesSample({
  publicationDecision,
  visibleProjectionState,
}: {
  readonly publicationDecision: {
    readonly sample: GpuFlowLiveProjectionSample;
  };
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): NonNullable<GpuFlowVisibleProjectionState["heldPreviousProjection"]> {
  const heldPreviousProjection = visibleProjectionState.heldPreviousProjection;
  if (
    heldPreviousProjection === null ||
    heldPreviousProjection.requestedProjectionSampleId !==
      publicationDecision.sample.id
  ) {
    throw new Error(
      "GPU Flow held-previous publication completion requires diagnostics for the selected projection sample.",
    );
  }
  return heldPreviousProjection;
}

function isGpuFlowVisiblePublicationHeldPreviousOverBudget(
  visibleProjectionState: GpuFlowVisibleProjectionState,
): boolean {
  const heldPreviousProjection = visibleProjectionState.heldPreviousProjection;
  if (heldPreviousProjection === null) {
    return false;
  }
  return Boolean(
    heldPreviousProjection.maxHeldPreviousFramesExceeded ||
      heldPreviousProjection.maxHeldPreviousMsExceeded,
  );
}

function createGpuFlowVisiblePublicationCompletionNoFrameOutcome({
  previousVisibleProjectionState,
  publicationDecision,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}):
  | {
      readonly kind: "blocked";
      readonly token: GpuFlowBlockedPublicationToken;
    }
  | {
      readonly kind: "hold-previous";
      readonly token: GpuFlowHoldPreviousToken;
    } {
  if (!previousVisibleProjectionState) {
    return {
      kind: "blocked",
      token: createGpuFlowVisibleFrameBlockedPublicationToken({
        blockedReasons: [
          {
            actorId: null,
            family: "visible-transaction",
            reason: "no-visible-frame-before-first-commit",
          },
        ],
        frozenFrameId: GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
        projectionSample: publicationDecision.sample,
      }),
    };
  }
  const previousHeld = previousVisibleProjectionState.heldPreviousProjection;
  const firstHeldAtMs =
    previousHeld?.firstHeldAtMs ?? publicationDecision.sample.timestamp;
  return {
    kind: "hold-previous",
    token: createGpuFlowVisibleFrameHoldPreviousToken({
      committedFrameId:
        previousVisibleProjectionState.committedFrame.displayFrameId,
      holdAgeFrames: (previousHeld?.consecutiveFrameCount ?? 0) + 1,
      holdAgeMs: Math.max(
        0,
        publicationDecision.sample.timestamp - firstHeldAtMs,
      ),
      projectionSample: publicationDecision.sample,
    }),
  };
}

export function createGpuFlowVisiblePublicationCompletionCommitToken({
  publicationDecision,
  visibleProjectionState,
}: {
  readonly publicationDecision: {
    readonly sample: GpuFlowLiveProjectionSample;
  };
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowCommitPublicationToken {
  if (visibleProjectionState.sample.id !== publicationDecision.sample.id) {
    throw new Error(
      "GPU Flow committed publication completion requires visible projection state for the selected sample.",
    );
  }
  return createGpuFlowVisibleFrameCommitPublicationToken({
    frame: visibleProjectionState.committedFrame,
    projectionSample: publicationDecision.sample,
  });
}

export function createGpuFlowVisiblePublicationCompletionOutcome({
  blockedPublicationToken,
  publicationDecision,
  previousVisibleProjectionState,
  renderedVisibleFrame,
  visibleProjectionState,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}):
  | {
      readonly kind: "blocked";
      readonly token: GpuFlowBlockedPublicationToken;
    }
  | {
      readonly kind: "commit";
      readonly debtProof: GpuFlowVisiblePublicationCommitDebtProof;
      readonly token: GpuFlowCommitPublicationToken;
    }
  | {
      readonly kind: "hold-previous";
      readonly token: GpuFlowHoldPreviousToken;
    } {
  if (!renderedVisibleFrame) {
    if (blockedPublicationToken) {
      return { kind: "blocked", token: blockedPublicationToken };
    }
    return createGpuFlowVisiblePublicationCompletionNoFrameOutcome({
      previousVisibleProjectionState,
      publicationDecision,
    });
  }
  if (visibleProjectionState === null) {
    throw new Error(
      "GPU Flow visible publication completion cannot commit a rendered frame without visible projection state.",
    );
  }
  if (visibleProjectionState.transaction.kind === "held-previous") {
    return createGpuFlowVisiblePublicationCompletionHeldPreviousOutcome({
      blockedPublicationToken,
      publicationDecision,
      visibleProjectionState,
    });
  }
  return {
    debtProof: createGpuFlowVisiblePublicationCommitOracle({
      committedFrame: visibleProjectionState.committedFrame,
      publicationDecision,
    }).debtProof,
    kind: "commit",
    token: createGpuFlowVisiblePublicationCompletionCommitToken({
      publicationDecision,
      visibleProjectionState,
    }),
  };
}

export function completeGpuFlowVisibleFramePublicationTransaction({
  blockedPublicationToken,
  publicationDecision,
  previousVisibleProjectionState,
  renderedVisibleFrame,
  scheduler,
  visibleProjectionState,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly renderedVisibleFrame: boolean;
  readonly scheduler: Pick<GpuFlowVisiblePublicationScheduler, "completeFrame">;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisiblePublicationTransactionCompletion {
  const outcome = createGpuFlowVisiblePublicationCompletionOutcome({
    blockedPublicationToken,
    publicationDecision,
    previousVisibleProjectionState,
    renderedVisibleFrame,
    visibleProjectionState,
  });
  return Object.freeze({
    completion: scheduler.completeFrame(publicationDecision, outcome),
    outcome,
    previousCommittedFrameId:
      previousVisibleProjectionState?.committedFrame.displayFrameId ?? null,
  });
}

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

export function createGpuFlowVisiblePublicationTransactionReport({
  completion,
  outcome,
  previousCommittedFrameId,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  const token = createGpuFlowVisiblePublicationOutcomeTokenPayload(outcome);
  const commitOracle = visibleProjectionState
    ? createGpuFlowVisiblePublicationCommitOracle({
        committedFrame: visibleProjectionState.committedFrame,
        publicationDecision,
      })
    : null;
  const commitOracleReport =
    createGpuFlowVisiblePublicationCommitOracleReport(commitOracle);
  return {
    browserActorProofs: commitOracleReport.browserActorProofs,
    commitOracle: commitOracleReport.commitOracle,
    compatiblePreviousProofs: commitOracleReport.compatiblePreviousProofs,
    coverage: commitOracleReport.coverage,
    decisionDebt: publicationDecision.debt,
    inputSampleId: publicationDecision.sample.id,
    lane: publicationDecision.lane,
    outcome: outcome.kind,
    previousCommittedFrameId,
    projectionSampleId: publicationDecision.sample.id,
    rawReasons: publicationDecision.rawReasons,
    remainingDebt: completion.debt,
    schedulerOutcome: completion.outcome,
    schedulerState: publicationDecision.schedulerState,
    token,
    transactionId: getGpuFlowVisiblePublicationOutcomeTransactionId(outcome),
    transactionKind: getGpuFlowVisiblePublicationProjectionTransactionKind(
      visibleProjectionState,
    ),
    visibleCommittedFrameId:
      getGpuFlowVisiblePublicationOutcomeCommittedFrameId(outcome),
    visibleTransaction: createGpuFlowVisibleTransactionReport({
      outcome,
      previousCommittedFrameId,
      publicationDecision,
      token,
    }),
  };
}

function createGpuFlowVisiblePublicationCommitOracleReport(
  commitOracle: ReturnType<
    typeof createGpuFlowVisiblePublicationCommitOracle
  > | null,
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

function getGpuFlowVisiblePublicationProjectionTransactionKind(
  visibleProjectionState: GpuFlowVisibleProjectionState | null,
): GpuFlowVisibleProjectionState["transaction"]["kind"] | null {
  return visibleProjectionState?.transaction.kind ?? null;
}

function getGpuFlowVisiblePublicationOutcomeCommittedFrameId(
  outcome: GpuFlowVisiblePublicationOutcome,
): number | null {
  if (outcome.kind !== "commit" && outcome.kind !== "hold-previous") {
    return null;
  }
  return outcome.token.committedFrameId;
}

function createGpuFlowVisibleTransactionReport({
  outcome,
  previousCommittedFrameId,
  publicationDecision,
  token,
}: {
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly token: ReturnType<
    typeof createGpuFlowVisiblePublicationOutcomeTokenPayload
  >;
}) {
  const commitToken = outcome.kind === "commit" ? outcome.token : null;
  return {
    inputSampleId: publicationDecision.sample.id,
    outcome: outcome.kind,
    presentableCommit:
      commitToken === null
        ? null
        : {
            expectedActorSetDigest: commitToken.expectedActorSetDigest,
            presentationPairDigest: commitToken.presentationPairDigest,
            proofDigest: commitToken.proofDigest,
          },
    previousCommittedFrameId,
    token,
    transactionId: getGpuFlowVisiblePublicationOutcomeTransactionId(outcome),
    visibleCommittedFrameId:
      outcome.kind === "commit" || outcome.kind === "hold-previous"
        ? outcome.token.committedFrameId
        : null,
  };
}

function getGpuFlowVisiblePublicationOutcomeTransactionId(
  outcome: GpuFlowVisiblePublicationOutcome,
): string {
  switch (outcome.kind) {
    case "commit":
    case "hold-previous":
    case "blocked":
      return outcome.token.transactionId;
  }
}

function createGpuFlowVisiblePublicationOutcomeTokenPayload(
  outcome: GpuFlowVisiblePublicationOutcome,
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
  }
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
