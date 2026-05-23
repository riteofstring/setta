import {
  assertGpuFlowCommittedSurfacePresentationProof,
  createGpuFlowCommittedSurfaceActorManifestDigest,
  type GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import { createGpuFlowJsonDigest } from "../gpuFlowDigest";
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
} from "./visibleFramePublicationCompletion";
import type {
  GpuFlowVisibleFramePublicationTransactionOracle,
  GpuFlowVisiblePublicationBlockedProof,
} from "./visibleFramePublicationOracle";
import {
  assertGpuFlowVisiblePublicationResourcesProtected,
  createGpuFlowVisiblePublicationResourceProtectionDigest,
  createGpuFlowVisiblePublicationResourceProtectionReport,
} from "./visibleFramePublicationResourceOracle";

const GPU_FLOW_COMMIT_PUBLICATION_TOKEN = Symbol(
  "GpuFlowCommitPublicationToken",
);
const GPU_FLOW_COMMITTED_SURFACE_RESET_TOKEN = Symbol(
  "GpuFlowCommittedSurfaceResetToken",
);
const GPU_FLOW_COMMITTED_SURFACE_STARTUP_TOKEN = Symbol(
  "GpuFlowCommittedSurfaceStartupToken",
);
const GPU_FLOW_PRESENTABLE_COMMIT = Symbol("GpuFlowPresentableCommit");
const GPU_FLOW_HOLD_PREVIOUS_TOKEN = Symbol("GpuFlowHoldPreviousToken");
const GPU_FLOW_BLOCKED_PUBLICATION_TOKEN = Symbol(
  "GpuFlowBlockedPublicationToken",
);

type GpuFlowVisibleTransactionId = string;
type GpuFlowCommittedVisibleFrameId = number;
type GpuFlowProjectionSampleId = number;
type GpuFlowActorManifestDigest = string;
type GpuFlowVisibleProofDigest = string;
type GpuFlowPresentationPairDigest = string;
type GpuFlowResourceProtectionDigest = string;
export const GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID =
  "cold-start-shell:browser-visual";
export const GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID =
  "cold-start-shell:retained-projection";

type GpuFlowColdStartShellFrameId =
  | typeof GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID
  | typeof GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID;

export type GpuFlowColdStartShellFrame = {
  readonly id: GpuFlowColdStartShellFrameId;
  readonly input: "disabled";
  readonly kind: "cold-start-shell";
  readonly reason: string;
};

type GpuFlowCommitPresentationPairProof = {
  readonly actorManifestDigest: string;
  readonly batchId: string;
  readonly browserVisualFragmentDigest: string | null;
  readonly canvasGeneration: GpuFlowCommittedSurfaceFrame["presentationProof"]["canvasGeneration"];
  readonly domGeneration: GpuFlowCommittedSurfaceFrame["presentationProof"]["domGeneration"];
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly surfaceTransactionDigest: string | null;
};

export type GpuFlowCommitAuthorityProof = {
  readonly expectedActorSetDigest: GpuFlowActorManifestDigest;
  readonly presentationPairDigest: GpuFlowPresentationPairDigest;
  readonly presentationPairProof: GpuFlowCommitPresentationPairProof;
  readonly proofDigest: GpuFlowVisibleProofDigest;
  readonly resourceProtectionDigest: GpuFlowResourceProtectionDigest;
};

export type GpuFlowBlockedFrozenFrame =
  | {
      readonly frameId: GpuFlowCommittedVisibleFrameId;
      readonly kind: "committed";
    }
  | {
      readonly frame: GpuFlowColdStartShellFrame;
      readonly frameId: GpuFlowColdStartShellFrameId;
      readonly kind: "cold-start-shell";
    };

type CommitPublicationTokenBrand = {
  readonly [GPU_FLOW_COMMIT_PUBLICATION_TOKEN]: true;
};

type CommittedSurfaceResetTokenBrand = {
  readonly [GPU_FLOW_COMMITTED_SURFACE_RESET_TOKEN]: true;
};

type CommittedSurfaceStartupTokenBrand = {
  readonly [GPU_FLOW_COMMITTED_SURFACE_STARTUP_TOKEN]: true;
};

type PresentableCommitBrand = {
  readonly [GPU_FLOW_PRESENTABLE_COMMIT]: true;
};

type HoldPreviousTokenBrand = {
  readonly [GPU_FLOW_HOLD_PREVIOUS_TOKEN]: true;
};

type BlockedPublicationTokenBrand = {
  readonly [GPU_FLOW_BLOCKED_PUBLICATION_TOKEN]: true;
};

export type GpuFlowCommitPublicationToken = CommitPublicationTokenBrand & {
  readonly committedFrameId: GpuFlowCommittedVisibleFrameId;
  readonly expectedActorSetDigest: GpuFlowActorManifestDigest;
  readonly presentationPairDigest: GpuFlowPresentationPairDigest;
  readonly presentationPairProof: GpuFlowCommitPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly proofDigest: GpuFlowVisibleProofDigest;
  readonly resourceProtectionDigest: GpuFlowResourceProtectionDigest;
  readonly transactionId: GpuFlowVisibleTransactionId;
};

export type GpuFlowCommittedSurfaceResetToken =
  CommittedSurfaceResetTokenBrand & {
    readonly transactionId: GpuFlowVisibleTransactionId;
  };

export type GpuFlowCommittedSurfaceStartupToken =
  CommittedSurfaceStartupTokenBrand & {
    readonly expectedActorSetDigest: GpuFlowActorManifestDigest;
    readonly proofDigest: GpuFlowVisibleProofDigest;
    readonly startupFrameId: GpuFlowCommittedVisibleFrameId;
    readonly transactionId: GpuFlowVisibleTransactionId;
  };

type GpuFlowPresentableCommit = PresentableCommitBrand & {
  readonly committedFrameId: GpuFlowCommittedVisibleFrameId;
  readonly expectedActorSetDigest: GpuFlowActorManifestDigest;
  readonly presentationPairDigest: GpuFlowPresentationPairDigest;
  readonly presentationPairProof: GpuFlowCommitPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly proofDigest: GpuFlowVisibleProofDigest;
  readonly resourceProtectionDigest: GpuFlowResourceProtectionDigest;
  readonly transactionId: GpuFlowVisibleTransactionId;
};

export type GpuFlowHoldPreviousToken = HoldPreviousTokenBrand & {
  readonly committedFrameId: GpuFlowCommittedVisibleFrameId;
  readonly holdAgeFrames: number;
  readonly holdAgeMs: number;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly transactionId: GpuFlowVisibleTransactionId;
};

export type GpuFlowBlockedVisibleReason = {
  readonly actorId: string | null;
  readonly family: string;
  readonly reason: string;
};

export type GpuFlowBlockedPublicationToken = BlockedPublicationTokenBrand & {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrame: GpuFlowBlockedFrozenFrame;
  readonly frozenFrameId:
    | GpuFlowCommittedVisibleFrameId
    | GpuFlowColdStartShellFrameId;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly transactionId: GpuFlowVisibleTransactionId;
};

type GpuFlowVisiblePublicationTokenIssuer = {
  readonly createBlockedPublicationToken: (input: {
    readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
    readonly frozenFrameId:
      | GpuFlowCommittedVisibleFrameId
      | GpuFlowColdStartShellFrameId;
    readonly projectionSample: GpuFlowLiveProjectionSample;
  }) => GpuFlowBlockedPublicationToken;
  readonly createCommitPublicationToken: (input: {
    readonly commitAuthorityProof: GpuFlowCommitAuthorityProof;
    readonly frame: GpuFlowCommittedSurfaceFrame;
    readonly projectionSample: GpuFlowLiveProjectionSample;
  }) => GpuFlowCommitPublicationToken;
  readonly createCommittedSurfaceResetToken: () => GpuFlowCommittedSurfaceResetToken;
  readonly createCommittedSurfaceStartupToken: (input: {
    readonly frame: GpuFlowCommittedSurfaceFrame;
  }) => GpuFlowCommittedSurfaceStartupToken;
  readonly createHoldPreviousToken: (input: {
    readonly committedFrameId: GpuFlowCommittedVisibleFrameId;
    readonly holdAgeFrames: number;
    readonly holdAgeMs: number;
    readonly projectionSample: GpuFlowLiveProjectionSample;
  }) => GpuFlowHoldPreviousToken;
};

function createGpuFlowVisiblePublicationTokenIssuer(): GpuFlowVisiblePublicationTokenIssuer {
  return Object.freeze({
    createBlockedPublicationToken: createGpuFlowBlockedPublicationToken,
    createCommitPublicationToken: ({
      commitAuthorityProof,
      frame,
      projectionSample,
    }) =>
      createGpuFlowCommitPublicationToken({
        presentableCommit: createGpuFlowPresentableCommit({
          commitAuthorityProof,
          frame,
          projectionSample,
        }),
      }),
    createCommittedSurfaceResetToken: createGpuFlowCommittedSurfaceResetToken,
    createCommittedSurfaceStartupToken:
      createGpuFlowCommittedSurfaceStartupToken,
    createHoldPreviousToken: createGpuFlowHoldPreviousToken,
  });
}

const visiblePublicationTokenIssuer =
  createGpuFlowVisiblePublicationTokenIssuer();

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

export function createGpuFlowCommittedSurfaceResetPublicationToken(): GpuFlowCommittedSurfaceResetToken {
  return visiblePublicationTokenIssuer.createCommittedSurfaceResetToken();
}

export function createGpuFlowCommittedSurfaceStartupPublicationToken({
  frame,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): GpuFlowCommittedSurfaceStartupToken {
  return visiblePublicationTokenIssuer.createCommittedSurfaceStartupToken({
    frame,
  });
}

function createGpuFlowCommittedSurfaceResetToken(): GpuFlowCommittedSurfaceResetToken {
  return Object.freeze({
    [GPU_FLOW_COMMITTED_SURFACE_RESET_TOKEN]: true as const,
    transactionId: "semantic-reset:committed-surface",
  });
}

function createGpuFlowCommittedSurfaceStartupToken({
  frame,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): GpuFlowCommittedSurfaceStartupToken {
  return Object.freeze({
    [GPU_FLOW_COMMITTED_SURFACE_STARTUP_TOKEN]: true as const,
    expectedActorSetDigest: frame.presentationProof.actorManifestDigest,
    proofDigest: createGpuFlowVisibleProofDigest(frame),
    startupFrameId: frame.displayFrameId,
    transactionId: `semantic-startup:frame-${frame.displayFrameId}`,
  });
}

function createGpuFlowPresentableCommit({
  frame,
  commitAuthorityProof,
  projectionSample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly commitAuthorityProof: GpuFlowCommitAuthorityProof;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowPresentableCommit {
  assertGpuFlowPresentableCommitFrame({
    frame,
    commitAuthorityProof,
    projectionSampleId: projectionSample.id,
  });
  return Object.freeze({
    [GPU_FLOW_PRESENTABLE_COMMIT]: true as const,
    committedFrameId: frame.displayFrameId,
    expectedActorSetDigest: commitAuthorityProof.expectedActorSetDigest,
    presentationPairDigest: commitAuthorityProof.presentationPairDigest,
    presentationPairProof: commitAuthorityProof.presentationPairProof,
    projectionSampleId: projectionSample.id,
    proofDigest: commitAuthorityProof.proofDigest,
    resourceProtectionDigest: commitAuthorityProof.resourceProtectionDigest,
    transactionId: createGpuFlowVisibleTransactionId({
      frame,
      projectionSample,
    }),
  });
}

export function createGpuFlowCommitAuthorityProof({
  frame,
  presentationPairProof,
  projectionSampleId,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly presentationPairProof: GpuFlowCommitPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): GpuFlowCommitAuthorityProof {
  assertGpuFlowCommitPresentationPairProof({
    frame,
    presentationPairProof,
    projectionSampleId,
  });
  const resourceProtectionDigest =
    createGpuFlowCommitResourceProtectionDigestForFrame({ frame });
  return Object.freeze({
    expectedActorSetDigest: presentationPairProof.actorManifestDigest,
    presentationPairDigest: createGpuFlowPresentationPairDigest({
      frame,
      projectionSampleId,
    }),
    presentationPairProof,
    proofDigest: createGpuFlowVisibleProofDigest(frame),
    resourceProtectionDigest,
  });
}

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
  forceImmediatePublicationDebtFrame,
  outcome,
  publicationDecision,
  scheduler,
  schedulerKnobs,
}: {
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
  completion,
  forceImmediatePublicationDebtFrame,
  outcome,
  publicationDecision,
  schedulerKnobs,
}: {
  readonly completion: GpuFlowVisiblePublicationSchedulerFrameCompletion["completion"];
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

function assertGpuFlowPresentableCommitFrame({
  frame,
  commitAuthorityProof,
  projectionSampleId,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly commitAuthorityProof: GpuFlowCommitAuthorityProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): void {
  if (
    frame.publishability.kind !== "publishable" ||
    frame.publishability.blockingActorIds.length > 0
  ) {
    throw new Error(
      "GPU Flow commit publication authority requires a publishable committed surface frame.",
    );
  }
  assertGpuFlowPresentationPairFeasible({
    frame,
    commitAuthorityProof,
    projectionSampleId,
  });
}

function assertGpuFlowPresentationPairFeasible({
  frame,
  commitAuthorityProof,
  projectionSampleId,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly commitAuthorityProof: GpuFlowCommitAuthorityProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): void {
  assertGpuFlowCommittedSurfacePresentationProof(frame);
  assertGpuFlowCommitAuthorityProofMatchesFrame({
    frame,
    commitAuthorityProof,
    projectionSampleId,
  });
}

function assertGpuFlowCommitAuthorityProofMatchesFrame({
  frame,
  commitAuthorityProof,
  projectionSampleId,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly commitAuthorityProof: GpuFlowCommitAuthorityProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): void {
  assertGpuFlowCommitPresentationPairProof({
    frame,
    presentationPairProof: commitAuthorityProof.presentationPairProof,
    projectionSampleId,
  });
  const resourceProtectionDigest =
    createGpuFlowCommitResourceProtectionDigestForFrame({ frame });
  if (
    commitAuthorityProof.resourceProtectionDigest !== resourceProtectionDigest
  ) {
    throw new Error(
      "GPU Flow commit publication authority requires the transaction oracle resource protection proof for the selected frame.",
    );
  }
  if (
    commitAuthorityProof.expectedActorSetDigest !==
      frame.presentationProof.actorManifestDigest ||
    commitAuthorityProof.proofDigest !==
      createGpuFlowVisibleProofDigest(frame) ||
    commitAuthorityProof.presentationPairDigest !==
      createGpuFlowPresentationPairDigest({ frame, projectionSampleId })
  ) {
    throw new Error(
      "GPU Flow commit publication authority requires the transaction oracle presentable commit proof for the selected frame.",
    );
  }
}

function assertGpuFlowCommitPresentationPairProof({
  frame,
  presentationPairProof,
  projectionSampleId,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly presentationPairProof: GpuFlowCommitPresentationPairProof;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): void {
  const expected = frame.presentationProof;
  if (
    presentationPairProof.projectionSampleId !== projectionSampleId ||
    presentationPairProof.batchId !== expected.batchId ||
    presentationPairProof.actorManifestDigest !==
      expected.actorManifestDigest ||
    presentationPairProof.browserVisualFragmentDigest !==
      expected.browserVisualFragmentDigest ||
    presentationPairProof.surfaceTransactionDigest !==
      expected.surfaceTransactionDigest ||
    !areGpuFlowPresentationGenerationProofsEqual(
      presentationPairProof.domGeneration,
      expected.domGeneration,
    ) ||
    !areGpuFlowPresentationGenerationProofsEqual(
      presentationPairProof.canvasGeneration,
      expected.canvasGeneration,
    )
  ) {
    throw new Error(
      "GPU Flow commit publication authority requires the transaction oracle DOM/canvas presentation pair proof for the selected frame and projection sample.",
    );
  }
}

type GpuFlowPresentationGenerationProof =
  | GpuFlowCommitPresentationPairProof["domGeneration"]
  | GpuFlowCommitPresentationPairProof["canvasGeneration"];
type GpuFlowDomPresentationGenerationProof =
  GpuFlowCommitPresentationPairProof["domGeneration"];
type GpuFlowCanvasPresentationGenerationProof =
  GpuFlowCommitPresentationPairProof["canvasGeneration"];

function areGpuFlowPresentationGenerationProofsEqual(
  left: GpuFlowPresentationGenerationProof,
  right: GpuFlowPresentationGenerationProof,
): boolean {
  if (isGpuFlowDomPresentationGenerationProof(left)) {
    return (
      isGpuFlowDomPresentationGenerationProof(right) &&
      areGpuFlowDomPresentationGenerationProofsEqual(left, right)
    );
  }
  return (
    isGpuFlowCanvasPresentationGenerationProof(left) &&
    isGpuFlowCanvasPresentationGenerationProof(right) &&
    areGpuFlowCanvasPresentationGenerationProofsEqual(left, right)
  );
}

function isGpuFlowDomPresentationGenerationProof(
  proof: GpuFlowPresentationGenerationProof,
): proof is GpuFlowDomPresentationGenerationProof {
  return "staged" in proof;
}

function isGpuFlowCanvasPresentationGenerationProof(
  proof: GpuFlowPresentationGenerationProof,
): proof is GpuFlowCanvasPresentationGenerationProof {
  return "prepared" in proof;
}

function areGpuFlowDomPresentationGenerationProofsEqual(
  left: GpuFlowDomPresentationGenerationProof,
  right: GpuFlowDomPresentationGenerationProof,
): boolean {
  return (
    left.browserVisualCommittedFrameId ===
      right.browserVisualCommittedFrameId &&
    left.domControlCommittedFrameId === right.domControlCommittedFrameId &&
    left.domIslandCommittedFrameId === right.domIslandCommittedFrameId &&
    left.exposable === right.exposable &&
    left.presentationBatchId === right.presentationBatchId &&
    left.staged === right.staged
  );
}

function areGpuFlowCanvasPresentationGenerationProofsEqual(
  left: GpuFlowCanvasPresentationGenerationProof,
  right: GpuFlowCanvasPresentationGenerationProof,
): boolean {
  return (
    left.canvasRetainedFrameId === right.canvasRetainedFrameId &&
    left.debugSnapshotFrameId === right.debugSnapshotFrameId &&
    left.exposable === right.exposable &&
    left.gpuNativeVisualCommittedFrameId ===
      right.gpuNativeVisualCommittedFrameId &&
    left.htmlTextureOverlayCommittedFrameId ===
      right.htmlTextureOverlayCommittedFrameId &&
    left.prepared === right.prepared &&
    left.presentationBatchId === right.presentationBatchId
  );
}

function createGpuFlowCommitResourceProtectionDigestForFrame({
  frame,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): GpuFlowResourceProtectionDigest {
  const report = createGpuFlowVisiblePublicationResourceProtectionReport(frame);
  assertGpuFlowVisiblePublicationResourcesProtected(report);
  return createGpuFlowVisiblePublicationResourceProtectionDigest(report);
}

function createGpuFlowCommitPublicationToken({
  presentableCommit,
}: {
  readonly presentableCommit: GpuFlowPresentableCommit;
}): GpuFlowCommitPublicationToken {
  assertGpuFlowPresentableCommit({ presentableCommit });
  return Object.freeze({
    [GPU_FLOW_COMMIT_PUBLICATION_TOKEN]: true as const,
    committedFrameId: presentableCommit.committedFrameId,
    expectedActorSetDigest: presentableCommit.expectedActorSetDigest,
    presentationPairDigest: presentableCommit.presentationPairDigest,
    presentationPairProof: presentableCommit.presentationPairProof,
    projectionSampleId: presentableCommit.projectionSampleId,
    proofDigest: presentableCommit.proofDigest,
    resourceProtectionDigest: presentableCommit.resourceProtectionDigest,
    transactionId: presentableCommit.transactionId,
  });
}

function createGpuFlowHoldPreviousToken({
  committedFrameId,
  holdAgeFrames,
  holdAgeMs,
  projectionSample,
}: {
  readonly committedFrameId: GpuFlowCommittedVisibleFrameId;
  readonly holdAgeFrames: number;
  readonly holdAgeMs: number;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowHoldPreviousToken {
  return Object.freeze({
    [GPU_FLOW_HOLD_PREVIOUS_TOKEN]: true as const,
    committedFrameId,
    holdAgeFrames,
    holdAgeMs,
    projectionSampleId: projectionSample.id,
    transactionId: `hold:frame-${committedFrameId}:sample-${projectionSample.id}`,
  });
}

function createGpuFlowBlockedPublicationToken({
  blockedReasons,
  frozenFrameId,
  projectionSample,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId:
    | GpuFlowCommittedVisibleFrameId
    | GpuFlowColdStartShellFrameId;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowBlockedPublicationToken {
  const frozenFrame = createGpuFlowBlockedFrozenFrame(frozenFrameId);
  return Object.freeze({
    [GPU_FLOW_BLOCKED_PUBLICATION_TOKEN]: true as const,
    blockedReasons: Object.freeze(
      blockedReasons.map((reason) => Object.freeze({ ...reason })),
    ),
    frozenFrame,
    frozenFrameId,
    projectionSampleId: projectionSample.id,
    transactionId: `blocked:frame-${frozenFrameId}:sample-${projectionSample.id}`,
  });
}

function createGpuFlowBlockedFrozenFrame(
  frozenFrameId: GpuFlowCommittedVisibleFrameId | GpuFlowColdStartShellFrameId,
): GpuFlowBlockedFrozenFrame {
  if (typeof frozenFrameId === "number") {
    return Object.freeze({
      frameId: frozenFrameId,
      kind: "committed" as const,
    });
  }
  return Object.freeze({
    frame: Object.freeze({
      id: frozenFrameId,
      input: "disabled" as const,
      kind: "cold-start-shell" as const,
      reason: createGpuFlowColdStartShellReason(frozenFrameId),
    }),
    frameId: frozenFrameId,
    kind: "cold-start-shell" as const,
  });
}

function createGpuFlowColdStartShellReason(
  frameId: GpuFlowColdStartShellFrameId,
): string {
  switch (frameId) {
    case GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID:
      return "browser-visual-publication-blocked-before-first-commit";
    case GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID:
      return "retained-projection-blocked-before-first-commit";
  }
}

export function assertGpuFlowCommitPublicationToken({
  frame,
  token,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  if (
    !token ||
    token[GPU_FLOW_COMMIT_PUBLICATION_TOKEN] !== true ||
    token.committedFrameId !== frame.displayFrameId ||
    token.expectedActorSetDigest !== createGpuFlowActorManifestDigest(frame) ||
    token.proofDigest !== createGpuFlowVisibleProofDigest(frame) ||
    token.resourceProtectionDigest !==
      createGpuFlowCommitResourceProtectionDigestForFrame({ frame }) ||
    !token.presentationPairProof ||
    token.presentationPairDigest !==
      createGpuFlowPresentationPairDigest({
        frame,
        projectionSampleId: token.projectionSampleId,
      })
  ) {
    throw new Error(
      "GPU Flow committed content publication requires a commit publication token for the same visible frame.",
    );
  }
  assertGpuFlowCommitPresentationPairProof({
    frame,
    presentationPairProof: token.presentationPairProof,
    projectionSampleId: token.projectionSampleId,
  });
}

export function assertGpuFlowCommitPublicationTokenForPresentationProof({
  frame,
  token,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  if (
    !token ||
    token[GPU_FLOW_COMMIT_PUBLICATION_TOKEN] !== true ||
    token.committedFrameId !== frame.displayFrameId ||
    token.expectedActorSetDigest !==
      frame.presentationProof.actorManifestDigest ||
    token.proofDigest !== createGpuFlowVisibleProofDigest(frame) ||
    !token.presentationPairProof ||
    token.presentationPairDigest !==
      createGpuFlowPresentationPairDigest({
        frame,
        projectionSampleId: token.projectionSampleId,
      })
  ) {
    throw new Error(
      "GPU Flow committed content publication requires a commit publication token for the same visible frame.",
    );
  }
  assertGpuFlowCommitPresentationPairProof({
    frame,
    presentationPairProof: token.presentationPairProof,
    projectionSampleId: token.projectionSampleId,
  });
}

export function assertGpuFlowCommittedSurfaceResetToken({
  token,
}: {
  readonly token: GpuFlowCommittedSurfaceResetToken;
}): void {
  if (!isGpuFlowCommittedSurfaceResetToken(token)) {
    throw new Error(
      "GPU Flow committed surface reset requires a committed-surface reset publication token.",
    );
  }
}

export function assertGpuFlowCommittedSurfaceStartupToken({
  frame,
  token,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly token: GpuFlowCommittedSurfaceStartupToken;
}): void {
  if (
    !isGpuFlowCommittedSurfaceStartupToken(token) ||
    token.startupFrameId !== frame.displayFrameId ||
    token.expectedActorSetDigest !== createGpuFlowActorManifestDigest(frame) ||
    token.proofDigest !== createGpuFlowVisibleProofDigest(frame)
  ) {
    throw new Error(
      "GPU Flow committed surface startup publication requires a startup token for the same startup frame.",
    );
  }
}

export function assertGpuFlowCommitPublicationTokenForFrameId({
  committedFrameId,
  token,
}: {
  readonly committedFrameId: GpuFlowCommittedVisibleFrameId;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  if (
    !token ||
    token[GPU_FLOW_COMMIT_PUBLICATION_TOKEN] !== true ||
    token.committedFrameId !== committedFrameId
  ) {
    throw new Error(
      `GPU Flow browser visual publication requires a commit publication token for the same visible frame (expected frame ${committedFrameId}, received ${
        isGpuFlowCommitPublicationToken(token)
          ? token.committedFrameId
          : "unbranded"
      }).`,
    );
  }
}

export function assertGpuFlowCommitPublicationTokenForProjectionSample({
  projectionSampleId,
  token,
}: {
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  if (
    !isGpuFlowCommitPublicationToken(token) ||
    token.projectionSampleId !== projectionSampleId
  ) {
    throw new Error(
      `GPU Flow visible publication debt completion requires a commit token for the selected projection sample (expected sample ${projectionSampleId}, received sample ${
        isGpuFlowCommitPublicationToken(token)
          ? token.projectionSampleId
          : "unbranded"
      }).`,
    );
  }
}

export function assertGpuFlowHoldPreviousTokenForProjectionSample({
  projectionSampleId,
  token,
}: {
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly token: GpuFlowHoldPreviousToken;
}): void {
  if (
    !isGpuFlowHoldPreviousToken(token) ||
    token.projectionSampleId !== projectionSampleId
  ) {
    throw new Error(
      "GPU Flow visible publication debt completion requires a hold-previous token for the selected projection sample.",
    );
  }
}

export function assertGpuFlowBlockedPublicationTokenForProjectionSample({
  projectionSampleId,
  token,
}: {
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly token: GpuFlowBlockedPublicationToken;
}): void {
  if (
    !isGpuFlowBlockedPublicationToken(token) ||
    token.projectionSampleId !== projectionSampleId
  ) {
    throw new Error(
      "GPU Flow visible publication debt completion requires a blocked token for the selected projection sample.",
    );
  }
}

export function assertGpuFlowPreparedCandidateAbortToken({
  token,
}: {
  readonly token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken;
}): void {
  if (
    !isGpuFlowBlockedPublicationToken(token) &&
    !isGpuFlowHoldPreviousToken(token)
  ) {
    throw new Error(
      "GPU Flow prepared browser visual abort requires a hold-previous or blocked publication token.",
    );
  }
}

export function assertGpuFlowCommitPublicationTokenBrand({
  token,
}: {
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  if (!isGpuFlowCommitPublicationToken(token)) {
    throw new Error(
      "GPU Flow commit-only publication resource release requires a commit publication token.",
    );
  }
}

export function assertGpuFlowBlockedPublicationTokenBrand({
  token,
}: {
  readonly token: GpuFlowBlockedPublicationToken;
}): void {
  if (!isGpuFlowBlockedPublicationToken(token)) {
    throw new Error(
      "GPU Flow rejected candidate resource release requires a blocked publication token.",
    );
  }
}

export function assertGpuFlowHoldPreviousTokenBrand({
  token,
}: {
  readonly token: GpuFlowHoldPreviousToken;
}): void {
  if (!isGpuFlowHoldPreviousToken(token)) {
    throw new Error(
      "GPU Flow held-previous visible publication requires a hold-previous publication token.",
    );
  }
}

function assertGpuFlowPresentableCommit({
  presentableCommit,
}: {
  readonly presentableCommit: GpuFlowPresentableCommit;
}): void {
  if (!isGpuFlowPresentableCommit(presentableCommit)) {
    throw new Error(
      "GPU Flow commit publication token minting requires a presentable commit proof.",
    );
  }
}

function isGpuFlowPresentableCommit(
  presentableCommit: unknown,
): presentableCommit is GpuFlowPresentableCommit {
  return Boolean(
    presentableCommit &&
      typeof presentableCommit === "object" &&
      (
        presentableCommit as {
          readonly [GPU_FLOW_PRESENTABLE_COMMIT]?: true;
        }
      )[GPU_FLOW_PRESENTABLE_COMMIT] === true,
  );
}

function isGpuFlowCommittedSurfaceResetToken(
  token: unknown,
): token is GpuFlowCommittedSurfaceResetToken {
  return Boolean(
    token &&
      typeof token === "object" &&
      (
        token as {
          readonly [GPU_FLOW_COMMITTED_SURFACE_RESET_TOKEN]?: true;
        }
      )[GPU_FLOW_COMMITTED_SURFACE_RESET_TOKEN] === true,
  );
}

function isGpuFlowCommittedSurfaceStartupToken(
  token: unknown,
): token is GpuFlowCommittedSurfaceStartupToken {
  return Boolean(
    token &&
      typeof token === "object" &&
      (
        token as {
          readonly [GPU_FLOW_COMMITTED_SURFACE_STARTUP_TOKEN]?: true;
        }
      )[GPU_FLOW_COMMITTED_SURFACE_STARTUP_TOKEN] === true,
  );
}

function isGpuFlowCommitPublicationToken(
  token: unknown,
): token is GpuFlowCommitPublicationToken {
  return Boolean(
    token &&
      typeof token === "object" &&
      (
        token as {
          readonly [GPU_FLOW_COMMIT_PUBLICATION_TOKEN]?: true;
        }
      )[GPU_FLOW_COMMIT_PUBLICATION_TOKEN] === true,
  );
}

function isGpuFlowHoldPreviousToken(
  token: unknown,
): token is GpuFlowHoldPreviousToken {
  return Boolean(
    token &&
      typeof token === "object" &&
      (
        token as {
          readonly [GPU_FLOW_HOLD_PREVIOUS_TOKEN]?: true;
        }
      )[GPU_FLOW_HOLD_PREVIOUS_TOKEN] === true,
  );
}

function isGpuFlowBlockedPublicationToken(
  token: unknown,
): token is GpuFlowBlockedPublicationToken {
  return Boolean(
    token &&
      typeof token === "object" &&
      (
        token as {
          readonly [GPU_FLOW_BLOCKED_PUBLICATION_TOKEN]?: true;
        }
      )[GPU_FLOW_BLOCKED_PUBLICATION_TOKEN] === true,
  );
}

function createGpuFlowVisibleTransactionId({
  frame,
  projectionSample,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowVisibleTransactionId {
  return `commit:frame-${frame.displayFrameId}:sample-${projectionSample.id}`;
}

function createGpuFlowActorManifestDigest(
  frame: GpuFlowCommittedSurfaceFrame,
): GpuFlowActorManifestDigest {
  return createGpuFlowCommittedSurfaceActorManifestDigest(
    frame.actorGenerations,
  );
}

function createGpuFlowVisibleProofDigest(
  frame: GpuFlowCommittedSurfaceFrame,
): GpuFlowVisibleProofDigest {
  const transaction = frame.surfaceTransaction;
  return createGpuFlowJsonDigest("visible-publication-proof", {
    blockingActorIds: frame.publishability.blockingActorIds,
    browserVisualCoverage: frame.projectionHorizon.textActorCoverage,
    kind: frame.publishability.kind,
    protectedResourceHandles: transaction?.protectedResourceHandles ?? [],
    surfaceCoverage: transaction
      ? {
          compatible: transaction.coverageProof.compatibleCoverage.length,
          exact: transaction.coverageProof.exactCoverage.length,
          trueHoles: transaction.coverageProof.trueHoleRects.length,
        }
      : null,
  });
}

function createGpuFlowPresentationPairDigest({
  frame,
  projectionSampleId,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): GpuFlowPresentationPairDigest {
  return createGpuFlowJsonDigest("visible-presentation-pair", {
    actorManifestDigest: frame.presentationProof.actorManifestDigest,
    browserVisualFragmentDigest:
      frame.presentationProof.browserVisualFragmentDigest,
    canvasGeneration: frame.presentationProof.canvasGeneration,
    domGeneration: frame.presentationProof.domGeneration,
    presentationBatchId: frame.presentationProof.batchId,
    presentationProofDigest: createGpuFlowPresentationProofDigest(frame),
    projectionSampleId,
    proofDigest: createGpuFlowVisibleProofDigest(frame),
    proofPresentationActorManifestDigest:
      frame.presentationProof.actorManifestDigest,
    surfaceTransactionDigest: frame.presentationProof.surfaceTransactionDigest,
  });
}

function createGpuFlowPresentationProofDigest(
  frame: GpuFlowCommittedSurfaceFrame,
): string {
  return createGpuFlowJsonDigest("visible-presentation-proof", {
    actorManifestDigest: frame.presentationProof.actorManifestDigest,
    browserVisualFragmentDigest:
      frame.presentationProof.browserVisualFragmentDigest,
    canvasGeneration: frame.presentationProof.canvasGeneration,
    domGeneration: frame.presentationProof.domGeneration,
    presentationBatchId: frame.presentationProof.batchId,
    surfaceTransactionDigest: frame.presentationProof.surfaceTransactionDigest,
  });
}
