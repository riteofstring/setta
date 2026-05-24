// Builds immutable transaction proof records; visible mutation stays in the presentation step.
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type {
  GpuFlowProjectionTransactionKind,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  assertGpuFlowVisibleFramePresentationActorProofs,
  createGpuFlowVisibleFramePresentationActorProofDigest,
  createGpuFlowVisibleFramePresentationActorProofsForFrame,
  createGpuFlowVisibleFramePresentationBlockedActorReasonsForFrame,
  createGpuFlowVisibleFramePresentationRemainingActorDebt,
} from "./visibleFrameActorAdapters/browserVisualProofs";
import type { GpuFlowVisibleFrameBlockedPresentationCandidate } from "./visibleFrameContentPlan";
import {
  createGpuFlowVisibleFramePresentationBlockedReasons,
  type GpuFlowVisibleFramePresentationEvidence,
} from "./visibleFramePresentationEvidence";
import type { GpuFlowBlockedPresentationToken } from "./visibleFramePresentationProofs";
import { createGpuFlowPresentationAuthorityProof } from "./visibleFramePresentationProofs";
import { selectGpuFlowMotionProjectionFrameBlockedPresentationReason } from "./visibleFrameProjectionWorkProof";
import type { GpuFlowMotionProjectionFrameWorkReport } from "./visibleFrameProjectionWorkTypes";
import type { GpuFlowVisibleFrameReducerDecision } from "./visibleFrameReducerRuntime";
import {
  assertGpuFlowVisibleFramePresentationResourcesProtected,
  createGpuFlowVisibleFramePresentationResourceBlockedReasons,
  createGpuFlowVisibleFramePresentationResourceProtectionReport,
} from "./visibleFrameResourceGraph";
import {
  proveGpuFlowVisibleFrameStateMachineFrame,
  type GpuFlowVisibleFramePreparedFrame,
  type GpuFlowVisibleFrameStateMachineOutcome,
} from "./visibleFrameStateMachine";
import { createGpuFlowVisibleFramePresentationStateMachineBlockedProof } from "./visibleFrameStateMachineBlockedProof";
import {
  createGpuFlowVisibleFramePresentationBrowserActorProofReportForFrame,
  createGpuFlowVisibleFramePresentationCompatiblePreviousProofReportForFrame,
  createGpuFlowVisibleFramePresentationCoverageReportForFrame,
  createGpuFlowVisibleFramePresentationProofReportForFrame,
  type GpuFlowVisibleFramePresentationProofReport,
} from "./visibleFrameTransactionReports";
import { createGpuFlowVisibleFramePresentationStateMachinePreparedFrame } from "./visibleFrameTransactionStateMachineAdapter";
import { GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID } from "./visibleFrameTypes";

export type GpuFlowVisibleFramePresentationDebtProof = {
  readonly content: boolean;
  readonly maintenance: boolean;
  readonly motion: boolean;
};

export type { GpuFlowVisibleFramePresentationProofReport };

export type GpuFlowVisibleFramePresentableFrameProof = ReturnType<
  typeof createGpuFlowVisibleFramePresentableFrameProof
>;

export type GpuFlowVisibleFramePresentableFrameProofFactory = (input: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
  readonly presentationEvidence: GpuFlowVisibleFramePresentationEvidence;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly projectionTransactionKind: GpuFlowProjectionTransactionKind;
  readonly projectionTransactionId: GpuFlowVisibleProjectionState["transaction"]["id"];
}) => GpuFlowVisibleFramePresentableFrameProof;

export type GpuFlowVisibleFramePresentationBlockedProof = {
  readonly blockedReasons: GpuFlowVisibleFrameBlockedPresentationCandidate["blockedReasons"];
  readonly candidate: GpuFlowVisibleFrameBlockedPresentationCandidate;
  readonly frozenFrameId: GpuFlowVisibleFrameBlockedPresentationCandidate["frozenFrameId"];
  readonly source:
    | "actor-proof"
    | "browser-visual-proof"
    | "compatible-previous-proof"
    | "prepared-content"
    | "motion-projection"
    | "presentation-pair"
    | "resource-protection";
};

export type GpuFlowVisibleFramePresentationPreparedFrame = {
  readonly blockedPresentationCandidate?: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly blockedProof?: GpuFlowVisibleFramePresentationBlockedProof | null;
  readonly blockedPresentationToken: GpuFlowBlockedPresentationToken | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly visibleFrameStateMachineOutcome: GpuFlowVisibleFrameStateMachineOutcome | null;
  readonly visibleFrameStateMachinePreparedFrame: GpuFlowVisibleFramePreparedFrame | null;
};

export type GpuFlowVisibleFramePresentationContentCandidate = {
  readonly blockedPreparedContentFrame?:
    | GpuFlowPreparedContentFrame
    | null
    | undefined;
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly preparedContentFrame?:
    | GpuFlowPreparedContentFrame
    | null
    | undefined;
  readonly forceImmediateReducerDebtFrame?: boolean | undefined;
  readonly heldPreparedContentFrame?:
    | GpuFlowPreparedContentFrame
    | null
    | undefined;
  readonly presentationEvidence?:
    | GpuFlowVisibleFramePresentationEvidence
    | null
    | undefined;
  readonly retainedDisplayFollowUpFrameReason?:
    | GpuFrameReason
    | null
    | undefined;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePresentationMotionCandidate = {
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly presentationEvidence?:
    | GpuFlowVisibleFramePresentationEvidence
    | null
    | undefined;
  readonly projectionOnlyFrameWork?:
    | GpuFlowMotionProjectionFrameWorkReport
    | null
    | undefined;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePresentationCandidateSet<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
> = {
  readonly contentPreparationFrame: ContentPreparationFrame;
  readonly forcedBlockedPresentationCandidate?:
    | GpuFlowVisibleFrameBlockedPresentationCandidate
    | null
    | undefined;
  readonly motionProjectionFrame: MotionProjectionFrame;
};

export type GpuFlowVisibleFramePresentationPreparedCandidateSet = {
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly blockedProof: GpuFlowVisibleFramePresentationBlockedProof | null;
  readonly presentableFrameProof: GpuFlowVisibleFramePresentableFrameProof | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePresentationTransactionProof = {
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly blockedProof: GpuFlowVisibleFramePresentationBlockedProof | null;
  readonly blockedSource:
    | GpuFlowVisibleFramePresentationBlockedProof["source"]
    | null;
  readonly presentableFrameProof: GpuFlowVisibleFramePresentableFrameProof | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleFrameStateMachineOutcome: GpuFlowVisibleFrameStateMachineOutcome;
  readonly visibleFrameStateMachinePreparedFrame: GpuFlowVisibleFramePreparedFrame;
  readonly visibleProjectionSource:
    | "prepared-content"
    | "motion-projection"
    | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePresentationPreparedCandidateSetFrame<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
> = GpuFlowVisibleFramePresentationPreparedFrame & {
  readonly contentPreparationFrame: ContentPreparationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly transactionProof: GpuFlowVisibleFramePresentationTransactionProof;
};

export type GpuFlowVisibleFramePresentationTransactionProofFactory = <
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
>(
  input: GpuFlowVisibleFramePresentationCandidateSet<
    ContentPreparationFrame,
    MotionProjectionFrame
  > & {
    readonly previousVisibleProjectionState?: GpuFlowVisibleProjectionState | null;
    readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  },
) => GpuFlowVisibleFramePresentationTransactionProof;

export type GpuFlowVisibleFramePresentationPreparedCandidateSetFrameFactory = <
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
>(input: {
  readonly contentPreparationFrame: ContentPreparationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly transactionProof: GpuFlowVisibleFramePresentationTransactionProof;
}) => GpuFlowVisibleFramePresentationPreparedCandidateSetFrame<
  ContentPreparationFrame,
  MotionProjectionFrame
>;

export function createGpuFlowVisibleFramePresentableFrameProofFactory(): GpuFlowVisibleFramePresentableFrameProofFactory {
  return createGpuFlowVisibleFramePresentableFrameProof;
}

function createGpuFlowVisibleFramePresentableFrameProof({
  preparedContentFrame,
  presentationEvidence,
  reducerDecision,
  projectionTransactionKind,
  projectionTransactionId,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
  readonly presentationEvidence: GpuFlowVisibleFramePresentationEvidence;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly projectionTransactionKind: GpuFlowProjectionTransactionKind;
  readonly projectionTransactionId: GpuFlowVisibleProjectionState["transaction"]["id"];
}) {
  const actorProofs = createGpuFlowVisibleFramePresentationActorProofsForFrame({
    preparedContentFrame,
    projectionSampleId: reducerDecision.sample.id,
  });
  assertGpuFlowVisibleFramePresentationActorProofs(actorProofs);
  const resourceProtection =
    createGpuFlowVisibleFramePresentationResourceProtectionReport(
      preparedContentFrame,
    );
  assertGpuFlowVisibleFramePresentationResourcesProtected(resourceProtection);
  const browserActorProofs =
    createGpuFlowVisibleFramePresentationBrowserActorProofReportForFrame(
      preparedContentFrame,
    );
  const compatiblePreviousProofs =
    createGpuFlowVisibleFramePresentationCompatiblePreviousProofReportForFrame({
      preparedContentFrame,
      projectionSampleId: reducerDecision.sample.id,
    });
  const coverage =
    createGpuFlowVisibleFramePresentationCoverageReportForFrame(
      preparedContentFrame,
    );
  const presentationProof =
    createGpuFlowVisibleFramePresentationProofReportForFrame({
      preparedContentFrame,
      presentationEvidence,
      projectionSampleId: reducerDecision.sample.id,
      projectionTransactionKind,
    });
  const hasCompatiblePreviousCoverage =
    hasGpuFlowVisibleFramePresentationCompatiblePreviousCoverage({
      preparedContentFrame,
      compatiblePreviousProofs,
      coverage,
    });
  const debtProof = Object.freeze({
    content:
      reducerDecision.lane === "content" && !hasCompatiblePreviousCoverage,
    maintenance:
      reducerDecision.lane === "maintenance" && !hasCompatiblePreviousCoverage,
    motion: reducerDecision.lane === "motion",
  });
  return Object.freeze({
    actorProofDigest:
      createGpuFlowVisibleFramePresentationActorProofDigest(actorProofs),
    actorProofs,
    browserActorProofs,
    compatiblePreviousProofs,
    coverage,
    debtProof,
    hasCompatiblePreviousCoverage,
    presentationAuthorityProof: createGpuFlowPresentationAuthorityProof({
      frame: preparedContentFrame,
      presentationPairProof: presentationProof,
      projectionSampleId: reducerDecision.sample.id,
      projectionTransactionKind,
      projectionTransactionId,
    }),
    presentationProof,
    remainingActorDebt:
      createGpuFlowVisibleFramePresentationRemainingActorDebt(actorProofs),
    resourceProtection,
  });
}

export function createGpuFlowVisibleFramePresentableFrameProofReport(
  presentableFrameProof: GpuFlowVisibleFramePresentableFrameProof | null,
) {
  if (presentableFrameProof === null) {
    return {
      actorProofDigest: null,
      actorProofs: [],
      browserActorProofs:
        createGpuFlowVisibleFramePresentationBrowserActorProofReportForFrame(
          null,
        ),
      presentableFrameProof: null,
      compatiblePreviousProofs:
        createGpuFlowVisibleFramePresentationCompatiblePreviousProofReportForFrame(
          {
            preparedContentFrame: null,
            projectionSampleId: null,
          },
        ),
      coverage: null,
      presentationProof: null,
      remainingActorDebt: [],
      resourceProtection:
        createGpuFlowVisibleFramePresentationResourceProtectionReport(null),
    };
  }
  return {
    actorProofDigest: presentableFrameProof.actorProofDigest,
    actorProofs: presentableFrameProof.actorProofs,
    browserActorProofs: presentableFrameProof.browserActorProofs,
    presentableFrameProof: {
      debtProof: presentableFrameProof.debtProof,
      hasCompatiblePreviousCoverage:
        presentableFrameProof.hasCompatiblePreviousCoverage,
      resourceProtectionDigest:
        presentableFrameProof.presentationAuthorityProof
          .resourceProtectionDigest,
    },
    compatiblePreviousProofs: presentableFrameProof.compatiblePreviousProofs,
    coverage: presentableFrameProof.coverage,
    presentationProof: presentableFrameProof.presentationProof,
    remainingActorDebt: presentableFrameProof.remainingActorDebt,
    resourceProtection: presentableFrameProof.resourceProtection,
  };
}

export function createGpuFlowVisibleFramePresentationTransactionProofReport(
  transactionProof: GpuFlowVisibleFramePresentationTransactionProof | null,
) {
  if (transactionProof === null) {
    return {
      blockedProof: null,
      blockedSource: null,
      hasPresentableFrameProof: false,
      hasPresentableFrame: false,
      renderedVisibleFrame: false,
      visibleFrameStateMachineOutcome: null,
      visibleProjectionSource: null,
    };
  }
  const visibleFrameStateMachineOutcome =
    transactionProof.visibleFrameStateMachineOutcome ?? null;
  return {
    blockedProof:
      transactionProof.blockedProof === null
        ? null
        : {
            blockedReasons: transactionProof.blockedProof.blockedReasons,
            frozenFrameId: transactionProof.blockedProof.frozenFrameId,
            source: transactionProof.blockedProof.source,
          },
    blockedSource: transactionProof.blockedSource,
    hasPresentableFrameProof: transactionProof.presentableFrameProof !== null,
    hasPresentableFrame:
      transactionProof.presentableFrameProof !== null &&
      transactionProof.visibleProjectionState?.transaction?.kind !==
        "held-previous",
    renderedVisibleFrame: transactionProof.renderedVisibleFrame,
    ...(visibleFrameStateMachineOutcome === null
      ? {}
      : {
          visibleFrameStateMachineOutcome: {
            decidingProof: visibleFrameStateMachineOutcome.decidingProof,
            kind: visibleFrameStateMachineOutcome.kind,
          },
        }),
    visibleProjectionSource: transactionProof.visibleProjectionSource,
  };
}

export function createGpuFlowVisibleFramePresentationTransactionProofFactory(): GpuFlowVisibleFramePresentationTransactionProofFactory {
  return createGpuFlowVisibleFramePresentationTransactionProof;
}

export function createGpuFlowVisibleFramePresentationPreparedCandidateSetFrameFactory(): GpuFlowVisibleFramePresentationPreparedCandidateSetFrameFactory {
  return createGpuFlowVisibleFramePresentationPreparedCandidateSetFrame;
}

function createGpuFlowVisibleFramePresentationPreparedCandidateSetFrame<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
>({
  contentPreparationFrame,
  motionProjectionFrame,
  transactionProof,
}: {
  readonly contentPreparationFrame: ContentPreparationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly transactionProof: GpuFlowVisibleFramePresentationTransactionProof;
}): GpuFlowVisibleFramePresentationPreparedCandidateSetFrame<
  ContentPreparationFrame,
  MotionProjectionFrame
> {
  return Object.freeze({
    blockedPresentationCandidate: transactionProof.blockedPresentationCandidate,
    blockedProof: transactionProof.blockedProof,
    blockedPresentationToken: null,
    contentPreparationFrame,
    motionProjectionFrame,
    renderedVisibleFrame: transactionProof.renderedVisibleFrame,
    transactionProof,
    visibleFrameStateMachineOutcome:
      transactionProof.visibleFrameStateMachineOutcome,
    visibleFrameStateMachinePreparedFrame:
      transactionProof.visibleFrameStateMachinePreparedFrame,
    visibleProjectionState: transactionProof.visibleProjectionState,
  });
}

function createGpuFlowVisibleFramePresentationTransactionProof<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
>({
  contentPreparationFrame,
  forcedBlockedPresentationCandidate = null,
  motionProjectionFrame,
  previousVisibleProjectionState = null,
  reducerDecision,
}: GpuFlowVisibleFramePresentationCandidateSet<
  ContentPreparationFrame,
  MotionProjectionFrame
> & {
  readonly previousVisibleProjectionState?: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): GpuFlowVisibleFramePresentationTransactionProof {
  const candidateVisibleProjectionState =
    resolveGpuFlowVisibleFramePresentationVisibleProjectionState({
      contentPreparationFrame,
      motionProjectionFrame,
    });
  const candidateBlockedProof =
    createGpuFlowVisibleFramePresentationCandidateBlockedProof({
      contentPreparationFrame,
      forcedBlockedPresentationCandidate,
      motionProjectionFrame,
    });
  const candidateVisibleProjectionSource =
    selectGpuFlowVisibleFramePresentationProjectionSource({
      contentPreparationFrame,
      motionProjectionFrame,
      visibleProjectionState: candidateVisibleProjectionState,
    });
  const presentationEvidence = resolveGpuFlowVisibleFramePresentationEvidence({
    contentPreparationFrame,
    motionProjectionFrame,
    visibleProjectionSource: candidateVisibleProjectionSource,
  });
  const blockingProofs = createGpuFlowVisibleFramePresentationBlockingProofs({
    candidateBlockedProof:
      resolveGpuFlowVisibleFramePresentationCandidateBlockedProof({
        candidateBlockedProof,
        candidateVisibleProjectionSource,
      }),
    candidateVisibleProjectionState,
    candidateVisibleProjectionSource,
    motionProjectionFrame,
    presentationEvidence,
    previousVisibleProjectionState,
    reducerDecision,
  });
  const visibleFrameStateMachinePreparedFrame =
    createGpuFlowVisibleFramePresentationStateMachinePreparedFrame({
      blockingProofs,
      candidateContentFrame:
        resolveGpuFlowVisibleFramePresentationCandidateContentFrame({
          contentPreparationFrame,
          candidateVisibleProjectionState,
        }),
      candidateVisibleProjectionState,
      previousVisibleProjectionState,
      reducerDecision,
    });
  const visibleFrameStateMachineOutcome =
    proveGpuFlowVisibleFrameStateMachineFrame({
      candidate: visibleFrameStateMachinePreparedFrame.candidate,
      previousPresentation:
        visibleFrameStateMachinePreparedFrame.previousPresentation,
    });
  const finalBlockedProof =
    createGpuFlowVisibleFramePresentationFinalBlockedProof({
      blockingProofs,
      candidate: visibleFrameStateMachinePreparedFrame.candidate,
      previousVisibleProjectionState,
      visibleFrameStateMachineOutcome,
    });
  const finalVisibleProjectionState =
    selectGpuFlowVisibleFramePresentationFinalVisibleProjectionState({
      candidateVisibleProjectionState,
      visibleFrameStateMachineOutcome,
    });
  const presentableFrameProof =
    createGpuFlowVisibleFramePresentationTransactionPresentableFrameProof({
      presentationEvidence,
      reducerDecision,
      visibleProjectionState: finalVisibleProjectionState,
    });
  return Object.freeze({
    blockedPresentationCandidate: finalBlockedProof?.candidate ?? null,
    blockedProof: finalBlockedProof,
    blockedSource: finalBlockedProof?.source ?? null,
    presentableFrameProof,
    renderedVisibleFrame: finalVisibleProjectionState !== null,
    visibleFrameStateMachineOutcome,
    visibleFrameStateMachinePreparedFrame,
    visibleProjectionSource:
      selectGpuFlowVisibleFramePresentationProjectionSource({
        contentPreparationFrame,
        motionProjectionFrame,
        visibleProjectionState: finalVisibleProjectionState,
      }),
    visibleProjectionState: finalVisibleProjectionState,
  });
}

function createGpuFlowVisibleFramePresentationFinalBlockedProof({
  blockingProofs,
  candidate,
  previousVisibleProjectionState,
  visibleFrameStateMachineOutcome,
}: {
  readonly blockingProofs: readonly GpuFlowVisibleFramePresentationBlockedProof[];
  readonly candidate: GpuFlowVisibleFramePreparedFrame["candidate"];
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly visibleFrameStateMachineOutcome: GpuFlowVisibleFrameStateMachineOutcome;
}): GpuFlowVisibleFramePresentationBlockedProof | null {
  return createGpuFlowVisibleFramePresentationStateMachineBlockedProof({
    blockingProofs,
    candidate,
    previousVisibleProjectionState,
    visibleFrameStateMachineOutcome,
  });
}

function selectGpuFlowVisibleFramePresentationFinalVisibleProjectionState({
  candidateVisibleProjectionState,
  visibleFrameStateMachineOutcome,
}: {
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly visibleFrameStateMachineOutcome: GpuFlowVisibleFrameStateMachineOutcome;
}): GpuFlowVisibleProjectionState | null {
  if (
    isGpuFlowVisibleFrameStateMachinePresentationOutcome(
      visibleFrameStateMachineOutcome,
    )
  ) {
    return candidateVisibleProjectionState;
  }
  return candidateVisibleProjectionState?.transaction.kind === "held-previous"
    ? candidateVisibleProjectionState
    : null;
}

function isGpuFlowVisibleFrameStateMachinePresentationOutcome(
  outcome: GpuFlowVisibleFrameStateMachineOutcome,
): boolean {
  return outcome.kind === "presented" || outcome.kind === "projected";
}

function resolveGpuFlowVisibleFramePresentationCandidateContentFrame<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
>({
  contentPreparationFrame,
  candidateVisibleProjectionState,
}: {
  readonly contentPreparationFrame: ContentPreparationFrame;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowPreparedContentFrame | null {
  return (
    candidateVisibleProjectionState?.preparedContentFrame ??
    contentPreparationFrame.preparedContentFrame ??
    contentPreparationFrame.blockedPreparedContentFrame ??
    contentPreparationFrame.heldPreparedContentFrame ??
    null
  );
}

function resolveGpuFlowVisibleFramePresentationCandidateBlockedProof({
  candidateBlockedProof,
  candidateVisibleProjectionSource,
}: {
  readonly candidateBlockedProof: GpuFlowVisibleFramePresentationBlockedProof | null;
  readonly candidateVisibleProjectionSource: GpuFlowVisibleFramePresentationTransactionProof["visibleProjectionSource"];
}): GpuFlowVisibleFramePresentationBlockedProof | null {
  if (
    candidateBlockedProof === null ||
    candidateVisibleProjectionSource === null ||
    candidateBlockedProof.source === "browser-visual-proof" ||
    candidateBlockedProof.source === candidateVisibleProjectionSource
  ) {
    return candidateBlockedProof;
  }
  return null;
}

function createGpuFlowVisibleFramePresentationBlockingProofs({
  candidateBlockedProof,
  candidateVisibleProjectionState,
  candidateVisibleProjectionSource,
  motionProjectionFrame,
  presentationEvidence,
  previousVisibleProjectionState,
  reducerDecision,
}: {
  readonly candidateBlockedProof: GpuFlowVisibleFramePresentationBlockedProof | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly candidateVisibleProjectionSource: GpuFlowVisibleFramePresentationTransactionProof["visibleProjectionSource"];
  readonly motionProjectionFrame: GpuFlowVisibleFramePresentationMotionCandidate;
  readonly presentationEvidence: GpuFlowVisibleFramePresentationEvidence | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): readonly GpuFlowVisibleFramePresentationBlockedProof[] {
  return Object.freeze(
    [
      candidateBlockedProof,
      createGpuFlowVisibleFramePresentationActorBlockedProof({
        previousVisibleProjectionState,
        visibleProjectionState: candidateVisibleProjectionState,
      }),
      createGpuFlowVisibleFramePresentationResourceBlockedProof({
        previousVisibleProjectionState,
        visibleProjectionState: candidateVisibleProjectionState,
      }),
      createGpuFlowVisibleFramePresentationMotionWorkBlockedProof({
        candidateVisibleProjectionSource,
        motionProjectionFrame,
        previousVisibleProjectionState,
      }),
      createGpuFlowVisibleFramePresentationPairBlockedProof({
        presentationEvidence,
        previousVisibleProjectionState,
        reducerDecision,
        visibleProjectionState: candidateVisibleProjectionState,
      }),
    ].filter(
      (proof): proof is GpuFlowVisibleFramePresentationBlockedProof =>
        proof !== null,
    ),
  );
}

function createGpuFlowVisibleFramePresentationMotionWorkBlockedProof({
  candidateVisibleProjectionSource,
  motionProjectionFrame,
  previousVisibleProjectionState,
}: {
  readonly candidateVisibleProjectionSource: GpuFlowVisibleFramePresentationTransactionProof["visibleProjectionSource"];
  readonly motionProjectionFrame: GpuFlowVisibleFramePresentationMotionCandidate;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePresentationBlockedProof | null {
  if (candidateVisibleProjectionSource !== "motion-projection") {
    return null;
  }
  const blockedReason =
    selectGpuFlowMotionProjectionFrameBlockedPresentationReason(
      motionProjectionFrame,
    );
  if (blockedReason === null) {
    return null;
  }
  return createGpuFlowVisibleFramePresentationBlockedProof({
    candidate: Object.freeze({
      blockedReasons: [
        {
          actorId: null,
          family: "retained-projection",
          reason: blockedReason,
        },
      ],
      frozenFrameId:
        previousVisibleProjectionState?.preparedContentFrame.displayFrameId ??
        GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
    }),
    source: "motion-projection",
  });
}

function resolveGpuFlowVisibleFramePresentationVisibleProjectionState<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
>({
  contentPreparationFrame,
  motionProjectionFrame,
}: GpuFlowVisibleFramePresentationCandidateSet<
  ContentPreparationFrame,
  MotionProjectionFrame
>): GpuFlowVisibleProjectionState | null {
  if (
    contentPreparationFrame.visibleProjectionState &&
    motionProjectionFrame.visibleProjectionState
  ) {
    assertGpuFlowMotionProjectionVisibleProjectionState(
      motionProjectionFrame.visibleProjectionState,
    );
    return motionProjectionFrame.visibleProjectionState;
  }
  return (
    contentPreparationFrame.visibleProjectionState ??
    motionProjectionFrame.visibleProjectionState
  );
}

function assertGpuFlowMotionProjectionVisibleProjectionState(
  visibleProjectionState: GpuFlowVisibleProjectionState,
): void {
  if (visibleProjectionState.transaction.kind === "motion-projection") {
    return;
  }
  throw new Error(
    "GPU Flow visible frame presentation proof can only pair background content preparation with a motion projection.",
  );
}

function resolveGpuFlowVisibleFramePresentationEvidence<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
>({
  contentPreparationFrame,
  motionProjectionFrame,
  visibleProjectionSource,
}: GpuFlowVisibleFramePresentationCandidateSet<
  ContentPreparationFrame,
  MotionProjectionFrame
> & {
  readonly visibleProjectionSource: GpuFlowVisibleFramePresentationTransactionProof["visibleProjectionSource"];
}): GpuFlowVisibleFramePresentationEvidence | null {
  switch (visibleProjectionSource) {
    case "prepared-content":
      return contentPreparationFrame.presentationEvidence ?? null;
    case "motion-projection":
      return motionProjectionFrame.presentationEvidence ?? null;
    case null:
      return null;
  }
}

function createGpuFlowVisibleFramePresentationPairBlockedProof({
  presentationEvidence,
  previousVisibleProjectionState,
  reducerDecision,
  visibleProjectionState,
}: {
  readonly presentationEvidence: GpuFlowVisibleFramePresentationEvidence | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePresentationBlockedProof | null {
  if (
    visibleProjectionState === null ||
    visibleProjectionState.transaction.kind === "held-previous"
  ) {
    return null;
  }
  const blockedReasons = createGpuFlowVisibleFramePresentationBlockedReasons({
    presentationEvidence,
    reducerDecision,
    visibleProjectionState,
  });
  if (blockedReasons.length === 0) {
    return null;
  }
  return createGpuFlowVisibleFramePresentationBlockedProof({
    candidate: Object.freeze({
      blockedReasons,
      frozenFrameId:
        previousVisibleProjectionState?.preparedContentFrame.displayFrameId ??
        GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
    }),
    source: "presentation-pair",
  });
}

function createGpuFlowVisibleFramePresentationResourceBlockedProof({
  previousVisibleProjectionState,
  visibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePresentationBlockedProof | null {
  if (visibleProjectionState === null) {
    return null;
  }
  const blockedReasons =
    createGpuFlowVisibleFramePresentationResourceBlockedReasons(
      visibleProjectionState.preparedContentFrame,
    );
  if (blockedReasons.length === 0) {
    return null;
  }
  return createGpuFlowVisibleFramePresentationBlockedProof({
    candidate: Object.freeze({
      blockedReasons,
      frozenFrameId:
        previousVisibleProjectionState?.preparedContentFrame.displayFrameId ??
        GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
    }),
    source: "resource-protection",
  });
}

function createGpuFlowVisibleFramePresentationTransactionPresentableFrameProof({
  presentationEvidence,
  reducerDecision,
  visibleProjectionState,
}: {
  readonly presentationEvidence: GpuFlowVisibleFramePresentationEvidence | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePresentableFrameProof | null {
  if (
    visibleProjectionState === null ||
    visibleProjectionState.transaction.kind === "held-previous"
  ) {
    return null;
  }
  if (presentationEvidence === null) {
    throw new Error(
      "GPU Flow visible presentation proof requires DOM/canvas presentation evidence.",
    );
  }
  return createGpuFlowVisibleFramePresentableFrameProof({
    preparedContentFrame: visibleProjectionState.preparedContentFrame,
    presentationEvidence,
    reducerDecision,
    projectionTransactionKind: visibleProjectionState.transaction.kind,
    projectionTransactionId: visibleProjectionState.transaction.id,
  });
}

function hasGpuFlowVisibleFramePresentationCompatiblePreviousCoverage({
  preparedContentFrame,
  compatiblePreviousProofs,
  coverage,
}: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame;
  readonly compatiblePreviousProofs: ReturnType<
    typeof createGpuFlowVisibleFramePresentationCompatiblePreviousProofReportForFrame
  >;
  readonly coverage: ReturnType<
    typeof createGpuFlowVisibleFramePresentationCoverageReportForFrame
  >;
}): boolean {
  return (
    (preparedContentFrame.projectionHorizon?.textActorCoverage
      ?.compatiblePreviousActorIds.length ?? 0) > 0 ||
    compatiblePreviousProofs.actorCount > 0 ||
    (coverage?.compatibleCoverageCount ?? 0) > 0
  );
}

function createGpuFlowVisibleFramePresentationCandidateBlockedProof<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
>({
  contentPreparationFrame,
  forcedBlockedPresentationCandidate,
  motionProjectionFrame,
}: GpuFlowVisibleFramePresentationCandidateSet<
  ContentPreparationFrame,
  MotionProjectionFrame
>): GpuFlowVisibleFramePresentationBlockedProof | null {
  if (forcedBlockedPresentationCandidate) {
    return createGpuFlowVisibleFramePresentationBlockedProof({
      candidate: forcedBlockedPresentationCandidate,
      source: "browser-visual-proof",
    });
  }
  const contentBlockedCandidate =
    contentPreparationFrame.blockedPresentationCandidate;
  const motionBlockedCandidate =
    motionProjectionFrame.blockedPresentationCandidate;
  if (contentBlockedCandidate && motionBlockedCandidate) {
    throw new Error(
      "GPU Flow visible frame presentation proof received competing content and motion blocked presentation candidates for one transaction.",
    );
  }
  if (contentBlockedCandidate) {
    return createGpuFlowVisibleFramePresentationBlockedProof({
      candidate: contentBlockedCandidate,
      source: "prepared-content",
    });
  }
  if (motionBlockedCandidate) {
    return createGpuFlowVisibleFramePresentationBlockedProof({
      candidate: motionBlockedCandidate,
      source: "motion-projection",
    });
  }
  return null;
}

function createGpuFlowVisibleFramePresentationBlockedProof({
  candidate,
  source,
}: {
  readonly candidate: GpuFlowVisibleFrameBlockedPresentationCandidate;
  readonly source: GpuFlowVisibleFramePresentationBlockedProof["source"];
}): GpuFlowVisibleFramePresentationBlockedProof {
  return Object.freeze({
    blockedReasons: candidate.blockedReasons,
    candidate,
    frozenFrameId: candidate.frozenFrameId,
    source,
  });
}

function createGpuFlowVisibleFramePresentationActorBlockedProof({
  previousVisibleProjectionState,
  visibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePresentationBlockedProof | null {
  if (visibleProjectionState === null) {
    return null;
  }
  const blockedReasons =
    createGpuFlowVisibleFramePresentationBlockedActorReasonsForFrame({
      preparedContentFrame: visibleProjectionState.preparedContentFrame,
      projectionSampleId: visibleProjectionState.sample.id,
    });
  if (blockedReasons.length === 0) {
    return null;
  }
  return createGpuFlowVisibleFramePresentationBlockedProof({
    candidate: Object.freeze({
      blockedReasons,
      frozenFrameId:
        previousVisibleProjectionState?.preparedContentFrame.displayFrameId ??
        GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
    }),
    source: createGpuFlowVisibleFramePresentationActorBlockedProofSource({
      blockedReasons,
    }),
  });
}

function createGpuFlowVisibleFramePresentationActorBlockedProofSource({
  blockedReasons,
}: {
  readonly blockedReasons: readonly {
    readonly reason: string;
  }[];
}): GpuFlowVisibleFramePresentationBlockedProof["source"] {
  return blockedReasons.some(
    (reason) => reason.reason === "compatible-previous-budget-exceeded",
  )
    ? "compatible-previous-proof"
    : "actor-proof";
}

function selectGpuFlowVisibleFramePresentationProjectionSource<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
>({
  contentPreparationFrame,
  motionProjectionFrame,
  visibleProjectionState,
}: GpuFlowVisibleFramePresentationCandidateSet<
  ContentPreparationFrame,
  MotionProjectionFrame
> & {
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePresentationTransactionProof["visibleProjectionSource"] {
  if (!visibleProjectionState) {
    return null;
  }
  if (
    visibleProjectionState === contentPreparationFrame.visibleProjectionState
  ) {
    return "prepared-content";
  }
  if (visibleProjectionState === motionProjectionFrame.visibleProjectionState) {
    return "motion-projection";
  }
  return null;
}
