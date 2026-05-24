// Builds outcome reports and scheduler completion records after a frame is proved.
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowCommitPublicationToken,
  GpuFlowHoldPreviousToken,
} from "./visibleFramePresentationProofs";
import type {
  GpuFlowVisiblePublicationCompletion,
  GpuFlowVisiblePublicationDecision,
} from "./visibleFrameScheduling";
import {
  createGpuFlowVisiblePublicationCommitProofReport,
  createGpuFlowVisiblePublicationTransactionProofReport,
  type GpuFlowVisibleFramePublicationTransactionProof,
  type GpuFlowVisiblePublicationCommitDebtProof,
  type GpuFlowVisiblePublicationPresentationProofReport,
} from "./visibleFrameTransactionProofs";
import type { GpuFlowColdStartShellFrame } from "./visibleFrameTypes";

export type { GpuFlowVisiblePublicationCompletion } from "./visibleFrameScheduling";

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
  readonly coldStartShellPublication: GpuFlowColdStartShellPublication;
  readonly completeSchedulerFrame: () => GpuFlowVisiblePublicationSchedulerFrameCompletion;
  readonly followUpFrameRequests: readonly GpuFrameReason[];
  readonly heldPreviousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
};

export type GpuFlowVisiblePublicationSchedulerFrameCompletion = {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly debtFrameRequest: GpuFlowVisiblePublicationDebtFrameRequest | null;
};

export type GpuFlowVisiblePublicationDebtFrameRequest = {
  readonly delayMs: number | null;
  readonly frameReason: GpuFrameReason;
};

export type GpuFlowColdStartShellPublication = {
  readonly frame: GpuFlowColdStartShellFrame | null;
  readonly token: GpuFlowVisiblePublicationOutcome["token"];
};

export function createGpuFlowVisiblePublicationTransactionReport({
  completion,
  outcome,
  previousCommittedFrameId,
  publicationDecision,
  transactionProof,
  visibleProjectionState,
}: {
  readonly completion: GpuFlowVisiblePublicationCompletion;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly previousCommittedFrameId: number | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  const token = createGpuFlowVisiblePublicationOutcomeTokenPayload(outcome);
  const commitProofReport = createGpuFlowVisiblePublicationCommitProofReport(
    transactionProof?.commitProof ?? null,
  );
  const transactionProofReport =
    createGpuFlowVisiblePublicationTransactionProofReport(transactionProof);
  return {
    actorProofDigest: commitProofReport.actorProofDigest,
    actorProofs: commitProofReport.actorProofs,
    browserActorProofs: commitProofReport.browserActorProofs,
    commitProof: commitProofReport.commitProof,
    compatiblePreviousProofs: commitProofReport.compatiblePreviousProofs,
    coverage: commitProofReport.coverage,
    decisionDebt: publicationDecision.debt,
    inputSampleId: publicationDecision.sample.id,
    lane: publicationDecision.lane,
    outcome: outcome.kind,
    previousCommittedFrameId,
    projectionSampleId: publicationDecision.sample.id,
    rawReasons: publicationDecision.rawReasons,
    remainingActorDebt: commitProofReport.remainingActorDebt,
    remainingDebt: completion.debt,
    resourceProtection: commitProofReport.resourceProtection,
    schedulerOutcome: completion.outcome,
    schedulerState: publicationDecision.schedulerState,
    token,
    transactionId: getGpuFlowVisiblePublicationOutcomeTransactionId(outcome),
    transactionProof: transactionProofReport,
    transactionKind: getGpuFlowVisiblePublicationProjectionTransactionKind(
      visibleProjectionState,
    ),
    visibleCommittedFrameId:
      getGpuFlowVisiblePublicationOutcomeCommittedFrameId(outcome),
    visibleTransaction: createGpuFlowVisibleTransactionReport({
      outcome,
      presentationProof: commitProofReport.presentationProof,
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
            presentationPairProof: commitToken.presentationPairProof,
            proofDigest: commitToken.proofDigest,
            resourceProtectionDigest: commitToken.resourceProtectionDigest,
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
      "GPU Flow visible publication report requires transaction-proof DOM/canvas presentation proof evidence for commit outcomes.",
    );
  }
  if (
    presentationProof.projectionSampleId !== outcome.token.projectionSampleId
  ) {
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
        presentationPairProof: outcome.token.presentationPairProof,
        projectionSampleId: outcome.token.projectionSampleId,
        proofDigest: outcome.token.proofDigest,
        resourceProtectionDigest: outcome.token.resourceProtectionDigest,
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
