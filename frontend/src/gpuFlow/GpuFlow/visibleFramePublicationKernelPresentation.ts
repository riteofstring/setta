import type { GpuFrameReason } from "../gpuRenderer";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionLane,
  GpuFlowProjectionSchedulerKnobs,
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import {
  createGpuFlowHeldPreviousProjection,
  createGpuFlowProjectionTransactionForCommittedFrameId,
  createGpuFlowVisibleProjectionState,
  getGpuFlowVisiblePublicationDebtReason,
  hasGpuFlowVisiblePublicationDebt,
} from "../projectionRuntime";
import {
  createGpuFlowVisiblePublicationTokenIssuer,
  GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
  type GpuFlowCommitAuthorityProof,
} from "./visibleFramePublicationAuthority";
import type {
  GpuFlowColdStartShellPublication,
  GpuFlowVisiblePublicationDebtFrameRequest,
  GpuFlowVisiblePublicationOutcome,
  GpuFlowVisiblePublicationTransactionCompletion,
} from "./visibleFramePublicationCompletion";
import type { GpuFlowVisibleFramePublicationTransactionOracle } from "./visibleFramePublicationOracle";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowBlockedVisibleReason,
  GpuFlowCommitPublicationToken,
  GpuFlowHoldPreviousToken,
} from "./visibleFramePublicationTokens";

type GpuFlowVisibleFramePublicationPresentationScheduler = {
  readonly completeFrame: (
    publicationDecision: GpuFlowVisiblePublicationDecision,
    outcome: GpuFlowVisiblePublicationOutcome,
  ) => GpuFlowVisiblePublicationTransactionCompletion["completion"];
  readonly getKnobs: () => GpuFlowProjectionSchedulerKnobs;
};

const GPU_FLOW_MOTION_ACTIVE_DEBT_RETRY_DELAY_MS = 160;
const visiblePublicationTokenIssuer =
  createGpuFlowVisiblePublicationTokenIssuer();

export function proveGpuFlowVisibleFramePublicationPresentation({
  blockedPublicationToken,
  forceImmediatePublicationDebtFrame,
  followUpFrameReason,
  publicationDecision,
  previousVisibleProjectionState,
  scheduler,
  transactionOracle,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly forceImmediatePublicationDebtFrame: boolean;
  readonly followUpFrameReason: GpuFrameReason | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly scheduler: GpuFlowVisibleFramePublicationPresentationScheduler;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
}): GpuFlowVisiblePublicationTransactionCompletion {
  const schedulerKnobs = scheduler.getKnobs();
  const outcome = createGpuFlowVisiblePublicationCompletionOutcome({
    blockedPublicationToken,
    publicationDecision,
    previousVisibleProjectionState,
    schedulerKnobs,
    transactionOracle,
  });
  const completion = scheduler.completeFrame(publicationDecision, outcome);
  return Object.freeze({
    coldStartShellPublication:
      createGpuFlowVisiblePublicationColdStartShellPublication({ outcome }),
    completion,
    debtFrameRequest: createGpuFlowVisiblePublicationDebtFrameRequest({
      completion,
      forceImmediatePublicationDebtFrame,
      outcome,
      publicationDecision,
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
  completion,
  forceImmediatePublicationDebtFrame,
  outcome,
  publicationDecision,
  schedulerKnobs,
}: {
  readonly completion: GpuFlowVisiblePublicationTransactionCompletion["completion"];
  readonly forceImmediatePublicationDebtFrame: boolean;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
}): GpuFlowVisiblePublicationDebtFrameRequest | null {
  if (!hasGpuFlowVisiblePublicationDebt(completion.debt)) {
    return null;
  }
  return Object.freeze({
    delayMs:
      forceImmediatePublicationDebtFrame ||
      shouldRequestGpuFlowVisiblePublicationDebtFrameImmediately(outcome)
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

function getGpuFlowVisiblePublicationDebtFrameReason({
  completion,
  outcome,
}: {
  readonly completion: GpuFlowVisiblePublicationTransactionCompletion["completion"];
  readonly outcome: GpuFlowVisiblePublicationOutcome;
}): GpuFrameReason {
  if (isGpuFlowRetainedProjectionBlockedOutcome(outcome)) {
    return "texture-upload";
  }
  return getGpuFlowVisiblePublicationDebtReason(completion.debt);
}

function shouldRequestGpuFlowVisiblePublicationDebtFrameImmediately(
  outcome: GpuFlowVisiblePublicationOutcome,
): boolean {
  return isGpuFlowRetainedProjectionBlockedOutcome(outcome);
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
  if (publicationDecision.lane === "motion") {
    return null;
  }
  if (publicationDecision.schedulerState === "motion-active") {
    return GPU_FLOW_MOTION_ACTIVE_DEBT_RETRY_DELAY_MS;
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

function createGpuFlowVisibleFrameHoldPreviousToken({
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
  return visiblePublicationTokenIssuer.createHoldPreviousToken({
    committedFrameId,
    holdAgeFrames,
    holdAgeMs,
    projectionSample,
  });
}

function createGpuFlowVisibleFrameBlockedPublicationToken({
  blockedReasons,
  frozenFrameId,
  projectionSample,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId: GpuFlowBlockedPublicationToken["frozenFrameId"];
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowBlockedPublicationToken {
  return visiblePublicationTokenIssuer.createBlockedPublicationToken({
    blockedReasons,
    frozenFrameId,
    projectionSample,
  });
}

function createGpuFlowVisiblePublicationCompletionCommitToken({
  commitAuthorityProof,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly commitAuthorityProof: GpuFlowCommitAuthorityProof;
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
  if (
    commitAuthorityProof.expectedActorSetDigest !==
      visibleProjectionState.committedFrame.presentationProof
        .actorManifestDigest ||
    commitAuthorityProof.presentationPairProof.projectionSampleId !==
      publicationDecision.sample.id
  ) {
    throw new Error(
      "GPU Flow committed publication completion requires a commit authority proof for the selected visible frame and projection sample.",
    );
  }
  return visiblePublicationTokenIssuer.createCommitPublicationToken({
    commitAuthorityProof,
    frame: visibleProjectionState.committedFrame,
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
  if (!transactionOracle.renderedVisibleFrame) {
    if (blockedPublicationToken) {
      return { kind: "blocked", token: blockedPublicationToken };
    }
    return createGpuFlowVisiblePublicationCompletionNoFrameOutcome({
      previousVisibleProjectionState,
      publicationDecision,
      schedulerKnobs,
    });
  }
  const visibleProjectionState = transactionOracle.visibleProjectionState;
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
