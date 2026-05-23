import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import {
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowVisibleProjectionState,
  type GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import {
  createGpuFlowCommittedSurfaceResetToken,
  createGpuFlowCommittedSurfaceStartupToken,
} from "./visibleFramePublicationAuthority";
import {
  createGpuFlowVisiblePublicationCommitOracleReport,
  createGpuFlowVisiblePublicationTransactionOracleReport,
  type GpuFlowVisibleFramePublicationTransactionOracle,
  type GpuFlowVisiblePublicationCommitDebtProof,
  type GpuFlowVisiblePublicationPresentationProofReport,
} from "./visibleFramePublicationOracle";
import type {
  GpuFlowBlockedPublicationToken,
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

export function createGpuFlowVisiblePublicationTransactionReport({
  completion,
  outcome,
  previousCommittedFrameId,
  publicationDecision,
  transactionOracle,
  visibleProjectionState,
}: {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  const token = createGpuFlowVisiblePublicationOutcomeTokenPayload(outcome);
  const commitOracleReport =
    createGpuFlowVisiblePublicationCommitOracleReport(
      transactionOracle?.commitOracle ?? null,
    );
  const transactionOracleReport =
    createGpuFlowVisiblePublicationTransactionOracleReport(transactionOracle);
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
    transactionOracle: transactionOracleReport,
    transactionKind: getGpuFlowVisiblePublicationProjectionTransactionKind(
      visibleProjectionState,
    ),
    visibleCommittedFrameId:
      getGpuFlowVisiblePublicationOutcomeCommittedFrameId(outcome),
    visibleTransaction: createGpuFlowVisibleTransactionReport({
      outcome,
      presentationProof: commitOracleReport.presentationProof,
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
  presentationProof,
  previousCommittedFrameId,
  publicationDecision,
  token,
}: {
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly presentationProof: GpuFlowVisiblePublicationPresentationProofReport | null;
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
    presentationProof: selectGpuFlowVisiblePresentationProofReport({
      outcome,
      presentationProof,
    }),
    previousCommittedFrameId,
    token,
    transactionId: getGpuFlowVisiblePublicationOutcomeTransactionId(outcome),
    visibleCommittedFrameId:
      outcome.kind === "commit" || outcome.kind === "hold-previous"
        ? outcome.token.committedFrameId
        : null,
  };
}

function selectGpuFlowVisiblePresentationProofReport({
  outcome,
  presentationProof,
}: {
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly presentationProof: GpuFlowVisiblePublicationPresentationProofReport | null;
}) {
  if (outcome.kind !== "commit") {
    return null;
  }
  if (presentationProof === null) {
    throw new Error(
      "GPU Flow visible publication report requires transaction-oracle DOM/canvas presentation proof evidence for commit outcomes.",
    );
  }
  if (presentationProof.projectionSampleId !== outcome.token.projectionSampleId) {
    throw new Error(
      "GPU Flow visible publication report requires presentation proof evidence for the committed outcome sample.",
    );
  }
  return presentationProof;
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
