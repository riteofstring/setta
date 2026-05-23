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
} from "./visibleFramePublicationAuthority";
import {
  createGpuFlowVisiblePublicationCommitOracleReport,
  type GpuFlowVisiblePublicationCommitDebtProof,
  type GpuFlowVisiblePublicationCommitOracle,
} from "./visibleFramePublicationOracle";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowBlockedVisibleReason,
  GpuFlowCommitPublicationToken,
  GpuFlowCommittedSurfaceResetToken,
  GpuFlowCommittedSurfaceStartupToken,
  GpuFlowHoldPreviousToken,
  GpuFlowPresentableCommit,
} from "./visibleFramePublicationTokens";

type GpuFlowVisiblePublicationScheduler = ReturnType<
  typeof createGpuFlowVisiblePublicationScheduler
>;

export type GpuFlowVisiblePublicationCompletion = ReturnType<
  GpuFlowVisiblePublicationScheduler["completeFrame"]
>;

export type GpuFlowVisiblePublicationOutcome =
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
    };

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

export function createGpuFlowVisiblePublicationCompletionCommitToken({
  presentableCommit,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly presentableCommit: GpuFlowPresentableCommit | null;
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
  if (presentableCommit === null) {
    throw new Error(
      "GPU Flow committed publication completion requires a presentable commit proof from the transaction kernel.",
    );
  }
  if (
    presentableCommit.committedFrameId !==
      visibleProjectionState.committedFrame.displayFrameId ||
    presentableCommit.projectionSampleId !== publicationDecision.sample.id
  ) {
    throw new Error(
      "GPU Flow committed publication completion requires a presentable commit proof for the selected visible frame and projection sample.",
    );
  }
  return createGpuFlowCommitPublicationToken({
    presentableCommit,
  });
}

export function createGpuFlowVisiblePublicationTransactionReport({
  commitOracle,
  completion,
  outcome,
  previousCommittedFrameId,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly commitOracle: GpuFlowVisiblePublicationCommitOracle | null;
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  const token = createGpuFlowVisiblePublicationOutcomeTokenPayload(outcome);
  const commitOracleReport =
    createGpuFlowVisiblePublicationCommitOracleReport(commitOracle);
  return {
    actorProofDigest: commitOracleReport.actorProofDigest,
    actorProofs: commitOracleReport.actorProofs,
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
    remainingActorDebt: commitOracleReport.remainingActorDebt,
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
