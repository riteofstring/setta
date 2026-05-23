import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowHeldPreviousProjection,
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisibleProjectionState,
  getGpuFlowVisiblePublicationDebtReason,
  hasGpuFlowVisiblePublicationDebt,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionLane,
  type GpuFlowProjectionSchedulerKnobs,
  type GpuFlowVisibleProjectionState,
  type GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import type {
  GpuFlowColdStartShellPublication,
  GpuFlowVisiblePublicationDebtFrameRequest,
  GpuFlowVisiblePublicationOutcome,
  GpuFlowVisiblePublicationSchedulerFrameCompletion,
  GpuFlowVisiblePublicationTransactionCompletion,
} from "./visibleFrameOutcomeReport";
import type {
  GpuFlowVisibleFramePublicationTransactionOracle,
  GpuFlowVisiblePublicationBlockedProof,
} from "./visibleFrameTransactionProofs";
import {
  createGpuFlowVisibleFrameBlockedPublicationToken,
  createGpuFlowVisibleFrameHoldPreviousToken,
  createGpuFlowVisiblePublicationCompletionCommitToken,
  type GpuFlowBlockedPublicationToken,
} from "./visibleFramePresentationTokens";
import { GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID } from "./visibleFrameTypes";

export {
  createGpuFlowCommitAuthorityProof,
  type GpuFlowCommitAuthorityProof,
} from "./visibleFrameCommitProofs";
export {
  assertGpuFlowBlockedPublicationTokenBrand,
  assertGpuFlowBlockedPublicationTokenForProjectionSample,
  assertGpuFlowCommitPublicationToken,
  assertGpuFlowCommitPublicationTokenBrand,
  assertGpuFlowCommitPublicationTokenForFrameId,
  assertGpuFlowCommitPublicationTokenForPresentationProof,
  assertGpuFlowCommitPublicationTokenForProjectionSample,
  assertGpuFlowHoldPreviousTokenBrand,
  assertGpuFlowHoldPreviousTokenForProjectionSample,
  assertGpuFlowPreparedCandidateAbortToken,
  type GpuFlowBlockedFrozenFrame,
  type GpuFlowBlockedPublicationToken,
  type GpuFlowBlockedVisibleReason,
  type GpuFlowCommitPublicationToken,
  type GpuFlowHoldPreviousToken,
} from "./visibleFramePresentationTokens";

type GpuFlowVisibleFramePublicationPresentationScheduler = {
  readonly completeFrame: (
    publicationDecision: GpuFlowVisiblePublicationDecision,
    outcome: Extract<
      GpuFlowVisiblePublicationOutcome,
      { readonly kind: "commit" }
    >,
  ) => GpuFlowVisiblePublicationSchedulerFrameCompletion["completion"];
  readonly getKnobs: () => GpuFlowProjectionSchedulerKnobs;
  readonly recordUncommittedFrame: (
    publicationDecision: GpuFlowVisiblePublicationDecision,
    outcome: Extract<
      GpuFlowVisiblePublicationOutcome,
      { readonly kind: "blocked" | "hold-previous" }
    >,
  ) => GpuFlowVisiblePublicationSchedulerFrameCompletion["completion"];
};

const GPU_FLOW_MOTION_ACTIVE_DEBT_RETRY_DELAY_MS = 160;

export function proveGpuFlowVisibleFramePublicationPresentation({
  blockedPublicationProof,
  forceImmediatePublicationDebtFrame,
  followUpFrameReason,
  publicationDecision,
  previousVisibleProjectionState,
  scheduler,
  transactionOracle,
}: {
  readonly blockedPublicationProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly forceImmediatePublicationDebtFrame: boolean;
  readonly followUpFrameReason: GpuFrameReason | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly scheduler: GpuFlowVisibleFramePublicationPresentationScheduler;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
}): GpuFlowVisiblePublicationTransactionCompletion {
  const schedulerKnobs = scheduler.getKnobs();
  const outcome = createGpuFlowVisiblePublicationCompletionOutcome({
    blockedPublicationToken:
      createGpuFlowVisibleFrameBlockedPublicationTokenForProof({
        proof: blockedPublicationProof,
        publicationDecision,
      }),
    publicationDecision,
    previousVisibleProjectionState,
    schedulerKnobs,
    transactionOracle,
  });
  return Object.freeze({
    coldStartShellPublication:
      createGpuFlowVisiblePublicationColdStartShellPublication({ outcome }),
    completeSchedulerFrame:
      createGpuFlowVisiblePublicationSchedulerFrameCompleter({
        blockedPublicationProof,
        forceImmediatePublicationDebtFrame,
        outcome,
        publicationDecision,
        scheduler,
        schedulerKnobs,
      }),
    followUpFrameRequests: createGpuFlowVisiblePublicationFollowUpFrameRequests(
      {
        followUpFrameReason,
      },
    ),
    heldPreviousVisibleProjectionState:
      createGpuFlowVisiblePublicationCompletionHeldPreviousState({
        outcome,
        previousVisibleProjectionState,
        publicationDecision,
        renderedVisibleFrame: transactionOracle.renderedVisibleFrame,
        schedulerKnobs,
      }),
    outcome,
    previousCommittedFrameId:
      previousVisibleProjectionState?.committedFrame.displayFrameId ?? null,
  });
}

function createGpuFlowVisiblePublicationSchedulerFrameCompleter({
  blockedPublicationProof,
  forceImmediatePublicationDebtFrame,
  outcome,
  publicationDecision,
  scheduler,
  schedulerKnobs,
}: {
  readonly blockedPublicationProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly forceImmediatePublicationDebtFrame: boolean;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly scheduler: GpuFlowVisibleFramePublicationPresentationScheduler;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
}): () => GpuFlowVisiblePublicationSchedulerFrameCompletion {
  let schedulerFrameCompletion: GpuFlowVisiblePublicationSchedulerFrameCompletion | null =
    null;
  return () => {
    if (schedulerFrameCompletion !== null) {
      return schedulerFrameCompletion;
    }
    const completion =
      outcome.kind === "commit"
        ? scheduler.completeFrame(publicationDecision, outcome)
        : scheduler.recordUncommittedFrame(publicationDecision, outcome);
    schedulerFrameCompletion = Object.freeze({
      completion,
      debtFrameRequest: createGpuFlowVisiblePublicationDebtFrameRequest({
        blockedPublicationProof,
        completion,
        forceImmediatePublicationDebtFrame,
        outcome,
        publicationDecision,
        schedulerKnobs,
      }),
    });
    return schedulerFrameCompletion;
  };
}

function createGpuFlowVisiblePublicationColdStartShellPublication({
  outcome,
}: {
  readonly outcome: GpuFlowVisiblePublicationOutcome;
}): GpuFlowColdStartShellPublication {
  return Object.freeze({
    frame:
      outcome.kind === "blocked" &&
      outcome.token.frozenFrame.kind === "cold-start-shell"
        ? outcome.token.frozenFrame.frame
        : null,
    token: outcome.token,
  });
}

function createGpuFlowVisiblePublicationFollowUpFrameRequests({
  followUpFrameReason,
}: {
  readonly followUpFrameReason: GpuFrameReason | null;
}): readonly GpuFrameReason[] {
  return Object.freeze(
    followUpFrameReason === null ? [] : [followUpFrameReason],
  );
}

function createGpuFlowVisiblePublicationDebtFrameRequest({
  blockedPublicationProof,
  completion,
  forceImmediatePublicationDebtFrame,
  outcome,
  publicationDecision,
  schedulerKnobs,
}: {
  readonly blockedPublicationProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly completion: GpuFlowVisiblePublicationSchedulerFrameCompletion["completion"];
  readonly forceImmediatePublicationDebtFrame: boolean;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
}): GpuFlowVisiblePublicationDebtFrameRequest | null {
  if (!hasGpuFlowVisiblePublicationDebt(completion.debt)) {
    return null;
  }
  if (
    shouldWaitForGpuFlowBrowserVisualReadinessBeforeContentRetry({
      blockedPublicationProof,
      completion,
      outcome,
      publicationDecision,
    })
  ) {
    return null;
  }
  return Object.freeze({
    delayMs:
      forceImmediatePublicationDebtFrame ||
      shouldRequestGpuFlowVisiblePublicationDebtFrameImmediately({
        outcome,
        publicationDecision,
      })
        ? null
        : getDelayedGpuFlowVisiblePublicationDebtRequestMs({
            publicationDecision,
            schedulerMotionSettleWindowMs: schedulerKnobs.motionSettleWindowMs,
          }),
    frameReason: getGpuFlowVisiblePublicationDebtFrameReason({
      completion,
      outcome,
    }),
  });
}

function shouldWaitForGpuFlowBrowserVisualReadinessBeforeContentRetry({
  blockedPublicationProof,
  completion,
  outcome,
  publicationDecision,
}: {
  readonly blockedPublicationProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly completion: GpuFlowVisiblePublicationSchedulerFrameCompletion["completion"];
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): boolean {
  return (
    publicationDecision.lane === "content" &&
    outcome.kind !== "commit" &&
    completion.debt.content &&
    blockedPublicationProof !== null &&
    blockedPublicationProof.blockedReasons.some(
      isGpuFlowBrowserVisualReadinessBlockedReason,
    )
  );
}

function isGpuFlowBrowserVisualReadinessBlockedReason(reason: {
  readonly family: string;
  readonly reason: string;
}): boolean {
  return (
    reason.family === "browser-visual" ||
    reason.family === "text-like-dom-control" ||
    reason.reason === "live-dom-budget" ||
    reason.reason === "snapshot-pending"
  );
}

function getGpuFlowVisiblePublicationDebtFrameReason({
  completion,
  outcome,
}: {
  readonly completion: GpuFlowVisiblePublicationSchedulerFrameCompletion["completion"];
  readonly outcome: GpuFlowVisiblePublicationOutcome;
}): GpuFrameReason {
  if (isGpuFlowRetainedProjectionBlockedOutcome(outcome)) {
    return "texture-upload";
  }
  return getGpuFlowVisiblePublicationDebtReason(completion.debt);
}

function shouldRequestGpuFlowVisiblePublicationDebtFrameImmediately({
  outcome,
  publicationDecision,
}: {
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): boolean {
  return (
    isGpuFlowRetainedProjectionBlockedOutcome(outcome) &&
    publicationDecision.schedulerState !== "motion-active"
  );
}

function isGpuFlowRetainedProjectionBlockedOutcome(
  outcome: GpuFlowVisiblePublicationOutcome,
): boolean {
  return (
    outcome.kind === "blocked" &&
    outcome.token.blockedReasons.some(
      (reason) => reason.family === "retained-projection",
    )
  );
}

function getDelayedGpuFlowVisiblePublicationDebtRequestMs({
  publicationDecision,
  schedulerMotionSettleWindowMs,
}: {
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly schedulerMotionSettleWindowMs: number;
}): number | null {
  if (publicationDecision.schedulerState === "motion-active") {
    return GPU_FLOW_MOTION_ACTIVE_DEBT_RETRY_DELAY_MS;
  }
  if (publicationDecision.lane === "motion") {
    return null;
  }
  if (publicationDecision.schedulerState === "motion-settling") {
    return schedulerMotionSettleWindowMs * 8;
  }
  return null;
}

function createGpuFlowVisiblePublicationCompletionHeldPreviousState({
  outcome,
  previousVisibleProjectionState,
  publicationDecision,
  renderedVisibleFrame,
  schedulerKnobs,
}: {
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly renderedVisibleFrame: boolean;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
}): GpuFlowVisibleProjectionState | null {
  if (
    outcome.kind !== "hold-previous" ||
    renderedVisibleFrame ||
    !previousVisibleProjectionState
  ) {
    return null;
  }
  const transaction = createGpuFlowProjectionTransactionForCommittedFrameId({
    committedFrameId:
      previousVisibleProjectionState.committedFrame.displayFrameId,
    kind: "held-previous",
    lane: resolveGpuFlowHeldPreviousPublicationLane({
      previousVisibleProjectionState,
      publicationDecision,
    }),
    rawReasons: publicationDecision.rawReasons,
    sample: publicationDecision.sample,
  });
  return createGpuFlowVisibleProjectionState({
    committedFrame: previousVisibleProjectionState.committedFrame,
    heldPreviousProjection: createGpuFlowHeldPreviousProjection({
      heldTransaction: transaction,
      knobs: schedulerKnobs,
      previousVisibleProjectionState,
      reason: "no-visible-frame",
      requestedSample: publicationDecision.sample,
    }),
    transaction,
  });
}

function resolveGpuFlowHeldPreviousPublicationLane({
  previousVisibleProjectionState,
  publicationDecision,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowProjectionLane {
  if (publicationDecision.lane !== "idle") {
    return publicationDecision.lane;
  }
  return previousVisibleProjectionState.transaction.lane;
}

function createGpuFlowVisibleFrameBlockedPublicationTokenForProof({
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

function createGpuFlowVisiblePublicationCompletionOutcome({
  blockedPublicationToken,
  publicationDecision,
  previousVisibleProjectionState,
  schedulerKnobs,
  transactionOracle,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
}): GpuFlowVisiblePublicationOutcome {
  const visibleFrameEngineOutcome = transactionOracle.visibleFrameEngineOutcome;
  if (!visibleFrameEngineOutcome) {
    throw new Error(
      "GPU Flow visible publication completion requires a visible frame engine outcome.",
    );
  }
  switch (visibleFrameEngineOutcome.kind) {
    case "presented":
    case "projected":
      return createGpuFlowVisiblePublicationCompletionCommitOutcome({
        publicationDecision,
        transactionOracle,
      });
    case "held":
      return createGpuFlowVisiblePublicationCompletionHeldEngineOutcome({
        publicationDecision,
        previousVisibleProjectionState,
        schedulerKnobs,
        transactionOracle,
      });
    case "blocked-cold-start":
      if (blockedPublicationToken !== null) {
        return {
          kind: "blocked",
          token: blockedPublicationToken,
        };
      }
      return createGpuFlowVisiblePublicationCompletionNoFrameOutcome({
        previousVisibleProjectionState,
        publicationDecision,
        schedulerKnobs,
      });
    case "aborted":
      return createGpuFlowVisiblePublicationCompletionAbortedEngineOutcome({
        blockedPublicationToken,
        publicationDecision,
        previousVisibleProjectionState,
        schedulerKnobs,
        transactionOracle,
      });
  }
}

function createGpuFlowVisiblePublicationCompletionHeldEngineOutcome({
  publicationDecision,
  previousVisibleProjectionState,
  schedulerKnobs,
  transactionOracle,
}: {
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
}): Extract<
  GpuFlowVisiblePublicationOutcome,
  { readonly kind: "blocked" | "hold-previous" }
> {
  const visibleProjectionState = transactionOracle.visibleProjectionState;
  if (visibleProjectionState?.transaction.kind === "held-previous") {
    return createGpuFlowVisiblePublicationCompletionHeldPreviousOutcome({
      blockedPublicationToken: null,
      publicationDecision,
      visibleProjectionState,
    });
  }
  return createGpuFlowVisiblePublicationCompletionNoFrameOutcome({
    previousVisibleProjectionState,
    publicationDecision,
    schedulerKnobs,
  });
}

function createGpuFlowVisiblePublicationCompletionAbortedEngineOutcome({
  blockedPublicationToken,
  publicationDecision,
  previousVisibleProjectionState,
  schedulerKnobs,
  transactionOracle,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
}): Extract<
  GpuFlowVisiblePublicationOutcome,
  { readonly kind: "blocked" | "hold-previous" }
> {
  const visibleProjectionState = transactionOracle.visibleProjectionState;
  if (visibleProjectionState?.transaction.kind === "held-previous") {
    return createGpuFlowVisiblePublicationCompletionHeldPreviousOutcome({
      blockedPublicationToken,
      publicationDecision,
      visibleProjectionState,
    });
  }
  if (blockedPublicationToken !== null) {
    return {
      kind: "blocked",
      token: blockedPublicationToken,
    };
  }
  const engineOutcome = transactionOracle.visibleFrameEngineOutcome;
  if (engineOutcome?.kind === "aborted") {
    return {
      kind: "blocked",
      token: createGpuFlowVisibleFrameBlockedPublicationToken({
        blockedReasons: [
          {
            actorId: engineOutcome.decidingProof.actorId,
            family: engineOutcome.decidingProof.family,
            reason: engineOutcome.decidingProof.reason,
          },
        ],
        frozenFrameId:
          previousVisibleProjectionState?.committedFrame.displayFrameId ??
          GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
        projectionSample: publicationDecision.sample,
      }),
    };
  }
  return createGpuFlowVisiblePublicationCompletionNoFrameOutcome({
    previousVisibleProjectionState,
    publicationDecision,
    schedulerKnobs,
  });
}

function createGpuFlowVisiblePublicationCompletionCommitOutcome({
  publicationDecision,
  transactionOracle,
}: {
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
}): Extract<GpuFlowVisiblePublicationOutcome, { readonly kind: "commit" }> {
  if (!transactionOracle.renderedVisibleFrame) {
    throw new Error(
      "GPU Flow visible publication completion cannot commit without a rendered engine outcome.",
    );
  }
  const visibleProjectionState = transactionOracle.visibleProjectionState;
  if (visibleProjectionState === null) {
    throw new Error(
      "GPU Flow visible publication completion cannot commit a rendered frame without visible projection state.",
    );
  }
  if (visibleProjectionState.transaction.kind === "held-previous") {
    throw new Error(
      "GPU Flow visible publication completion cannot commit a held-previous engine outcome.",
    );
  }
  const commitOracle = transactionOracle.commitOracle;
  if (commitOracle === null) {
    throw new Error(
      "GPU Flow committed publication completion requires the transaction oracle commit proof.",
    );
  }
  return {
    debtProof: commitOracle.debtProof,
    kind: "commit",
    token: createGpuFlowVisiblePublicationCompletionCommitToken({
      commitAuthorityProof: commitOracle.commitAuthorityProof,
      publicationDecision,
      visibleProjectionState,
    }),
  };
}

function createGpuFlowVisiblePublicationCompletionHoldOutcome({
  publicationDecision,
  visibleProjectionState,
}: {
  readonly publicationDecision: {
    readonly sample: GpuFlowLiveProjectionSample;
  };
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): Extract<
  GpuFlowVisiblePublicationOutcome,
  { readonly kind: "hold-previous" }
> {
  const heldPreviousProjection =
    assertGpuFlowHeldPreviousPublicationCompletionMatchesSample({
      publicationDecision,
      visibleProjectionState,
    });
  return {
    kind: "hold-previous",
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
}): Extract<
  GpuFlowVisiblePublicationOutcome,
  { readonly kind: "blocked" | "hold-previous" }
> {
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
  schedulerKnobs,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
}): Extract<
  GpuFlowVisiblePublicationOutcome,
  { readonly kind: "blocked" | "hold-previous" }
> {
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
  const holdAgeFrames = (previousHeld?.consecutiveFrameCount ?? 0) + 1;
  const holdAgeMs = Math.max(
    0,
    publicationDecision.sample.timestamp - firstHeldAtMs,
  );
  if (
    isGpuFlowNoFrameHeldPreviousOverBudget({
      holdAgeFrames,
      holdAgeMs,
      previousHeld,
      schedulerKnobs,
    })
  ) {
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
        frozenFrameId:
          previousVisibleProjectionState.committedFrame.displayFrameId,
        projectionSample: publicationDecision.sample,
      }),
    };
  }
  return {
    kind: "hold-previous",
    token: createGpuFlowVisibleFrameHoldPreviousToken({
      committedFrameId:
        previousVisibleProjectionState.committedFrame.displayFrameId,
      holdAgeFrames,
      holdAgeMs,
      projectionSample: publicationDecision.sample,
    }),
  };
}

function isGpuFlowNoFrameHeldPreviousOverBudget({
  holdAgeFrames,
  holdAgeMs,
  previousHeld,
  schedulerKnobs,
}: {
  readonly holdAgeFrames: number;
  readonly holdAgeMs: number;
  readonly previousHeld: GpuFlowVisibleProjectionState["heldPreviousProjection"];
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
}): boolean {
  return Boolean(
    previousHeld?.maxHeldPreviousFramesExceeded ||
      previousHeld?.maxHeldPreviousMsExceeded ||
      holdAgeFrames > schedulerKnobs.maxHeldPreviousFrames ||
      holdAgeMs > schedulerKnobs.maxHeldPreviousMs,
  );
}
