// Builds outcome reports and reducer completion records after a frame is proved.
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type {
  GpuFlowBlockedPresentationToken,
  GpuFlowHoldPreviousToken,
  GpuFlowVisibleFramePresentationToken,
} from "./visibleFramePresentationProofs";
import type {
  GpuFlowVisibleFrameReducerCompletion,
  GpuFlowVisibleFrameReducerDecision,
} from "./visibleFrameReducerRuntime";
import {
  createGpuFlowVisibleFramePresentableFrameProofReport,
  createGpuFlowVisibleFramePresentationTransactionProofReport,
  type GpuFlowVisibleFramePresentationDebtProof,
  type GpuFlowVisibleFramePresentationProofReport,
  type GpuFlowVisibleFramePublicationTransactionProof,
} from "./visibleFrameTransactionProofs";
import type { GpuFlowColdStartShellFrame } from "./visibleFrameTypes";

export type { GpuFlowVisibleFrameReducerCompletion } from "./visibleFrameReducerRuntime";

export type GpuFlowVisibleFramePresentationOutcome =
  | {
      readonly kind: "blocked";
      readonly token: GpuFlowBlockedPresentationToken;
    }
  | {
      readonly kind: "present";
      readonly debtProof: GpuFlowVisibleFramePresentationDebtProof;
      readonly token: GpuFlowVisibleFramePresentationToken;
    }
  | {
      readonly kind: "hold-previous";
      readonly token: GpuFlowHoldPreviousToken;
    };

export type GpuFlowVisibleFramePresentationTransactionCompletion = {
  readonly coldStartShellPublication: GpuFlowColdStartShellPublication;
  readonly completeReducerFrame: () => GpuFlowVisibleFramePresentationReducerFrameCompletion;
  readonly followUpFrameRequests: readonly GpuFrameReason[];
  readonly heldPreviousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly previousContentFrameId: number | null;
};

export type GpuFlowVisibleFramePresentationReducerFrameCompletion = {
  readonly completion: GpuFlowVisibleFrameReducerCompletion;
  readonly debtFrameRequest: GpuFlowVisibleFrameReducerDebtFrameRequest | null;
};

export type GpuFlowVisibleFrameReducerDebtFrameRequest = {
  readonly delayMs: number | null;
  readonly frameReason: GpuFrameReason;
};

export type GpuFlowColdStartShellPublication = {
  readonly frame: GpuFlowColdStartShellFrame | null;
  readonly token: GpuFlowVisibleFramePresentationOutcome["token"];
};

export function createGpuFlowVisibleFramePresentationTransactionReport({
  completion,
  outcome,
  previousContentFrameId,
  reducerDecision,
  transactionProof,
  visibleProjectionState,
}: {
  readonly completion: GpuFlowVisibleFrameReducerCompletion;
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly previousContentFrameId: number | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  const token =
    createGpuFlowVisibleFramePresentationOutcomeTokenPayload(outcome);
  const presentableFrameProofReport =
    createGpuFlowVisibleFramePresentableFrameProofReport(
      transactionProof?.presentableFrameProof ?? null,
    );
  const transactionProofReport =
    createGpuFlowVisibleFramePresentationTransactionProofReport(
      transactionProof,
    );
  return {
    actorProofDigest: presentableFrameProofReport.actorProofDigest,
    actorProofs: presentableFrameProofReport.actorProofs,
    browserActorProofs: presentableFrameProofReport.browserActorProofs,
    presentableFrameProof: presentableFrameProofReport.presentableFrameProof,
    compatiblePreviousProofs:
      presentableFrameProofReport.compatiblePreviousProofs,
    coverage: presentableFrameProofReport.coverage,
    decisionDebt: reducerDecision.debt,
    inputSampleId: reducerDecision.sample.id,
    lane: reducerDecision.lane,
    outcome: outcome.kind,
    previousContentFrameId,
    projectionSampleId: reducerDecision.sample.id,
    rawReasons: reducerDecision.rawReasons,
    remainingActorDebt: presentableFrameProofReport.remainingActorDebt,
    remainingDebt: completion.debt,
    resourceProtection: presentableFrameProofReport.resourceProtection,
    reducerOutcome: completion.outcome,
    reducerState: reducerDecision.reducerState,
    token,
    transactionId:
      getGpuFlowVisibleFramePresentationOutcomeTransactionId(outcome),
    transactionProof: transactionProofReport,
    transactionKind:
      getGpuFlowVisibleFramePresentationProjectionTransactionKind(
        visibleProjectionState,
      ),
    visiblePreparedContentFrameId:
      getGpuFlowVisibleFramePresentationOutcomePreparedContentFrameId(outcome),
    visibleTransaction: createGpuFlowVisibleTransactionReport({
      outcome,
      presentationProof: presentableFrameProofReport.presentationProof,
      previousContentFrameId,
      reducerDecision,
      token,
    }),
  };
}

function getGpuFlowVisibleFramePresentationProjectionTransactionKind(
  visibleProjectionState: GpuFlowVisibleProjectionState | null,
): GpuFlowVisibleProjectionState["transaction"]["kind"] | null {
  return visibleProjectionState?.transaction.kind ?? null;
}

function getGpuFlowVisibleFramePresentationOutcomePreparedContentFrameId(
  outcome: GpuFlowVisibleFramePresentationOutcome,
): number | null {
  if (outcome.kind !== "present" && outcome.kind !== "hold-previous") {
    return null;
  }
  return outcome.token.preparedContentFrameId;
}

function createGpuFlowVisibleTransactionReport({
  outcome,
  presentationProof,
  previousContentFrameId,
  reducerDecision,
  token,
}: {
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly presentationProof: GpuFlowVisibleFramePresentationProofReport | null;
  readonly previousContentFrameId: number | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly token: ReturnType<
    typeof createGpuFlowVisibleFramePresentationOutcomeTokenPayload
  >;
}) {
  const presentationToken = outcome.kind === "present" ? outcome.token : null;
  return {
    inputSampleId: reducerDecision.sample.id,
    outcome: outcome.kind,
    presentableFrame:
      presentationToken === null
        ? null
        : {
            expectedActorSetDigest: presentationToken.expectedActorSetDigest,
            presentationPairDigest: presentationToken.presentationPairDigest,
            presentationPairProof: presentationToken.presentationPairProof,
            proofDigest: presentationToken.proofDigest,
            resourceProtectionDigest:
              presentationToken.resourceProtectionDigest,
          },
    presentationProof: selectGpuFlowVisiblePresentationProofReport({
      outcome,
      presentationProof,
    }),
    previousContentFrameId,
    token,
    transactionId:
      getGpuFlowVisibleFramePresentationOutcomeTransactionId(outcome),
    visiblePreparedContentFrameId:
      outcome.kind === "present" || outcome.kind === "hold-previous"
        ? outcome.token.preparedContentFrameId
        : null,
  };
}

function selectGpuFlowVisiblePresentationProofReport({
  outcome,
  presentationProof,
}: {
  readonly outcome: GpuFlowVisibleFramePresentationOutcome;
  readonly presentationProof: GpuFlowVisibleFramePresentationProofReport | null;
}) {
  if (outcome.kind !== "present") {
    return null;
  }
  if (presentationProof === null) {
    throw new Error(
      "GPU Flow visible frame presentation report requires transaction-proof DOM/canvas presentation proof evidence for present outcomes.",
    );
  }
  if (
    presentationProof.projectionSampleId !== outcome.token.projectionSampleId
  ) {
    throw new Error(
      "GPU Flow visible frame presentation report requires presentation proof evidence for the presented outcome sample.",
    );
  }
  return presentationProof;
}

function getGpuFlowVisibleFramePresentationOutcomeTransactionId(
  outcome: GpuFlowVisibleFramePresentationOutcome,
): string {
  switch (outcome.kind) {
    case "present":
    case "hold-previous":
    case "blocked":
      return outcome.token.transactionId;
  }
}

function createGpuFlowVisibleFramePresentationOutcomeTokenPayload(
  outcome: GpuFlowVisibleFramePresentationOutcome,
) {
  switch (outcome.kind) {
    case "present":
      return {
        preparedContentFrameId: outcome.token.preparedContentFrameId,
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
        preparedContentFrameId: outcome.token.preparedContentFrameId,
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
