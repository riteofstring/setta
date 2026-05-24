// Builds immutable transaction proof records; visible mutation stays in the presentation step.
import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type {
  GpuFlowProjectionTransactionKind,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  assertGpuFlowVisiblePublicationPresentationActorProofs,
  createGpuFlowVisiblePublicationActorProofDigest,
  createGpuFlowVisiblePublicationActorProofsForFrame,
  createGpuFlowVisiblePublicationBlockedActorReasonsForFrame,
  createGpuFlowVisiblePublicationRemainingActorDebt,
} from "./visibleFrameActorAdapters/browserVisualProofs";
import type { GpuFlowVisibleFrameBlockedPublicationCandidate } from "./visibleFrameContentPlan";
import {
  createGpuFlowVisiblePublicationPresentationBlockedReasons,
  type GpuFlowVisiblePublicationPresentationEvidence,
} from "./visibleFramePresentationEvidence";
import type { GpuFlowBlockedPublicationToken } from "./visibleFramePresentationProofs";
import { createGpuFlowPresentationAuthorityProof } from "./visibleFramePresentationProofs";
import { selectGpuFlowMotionProjectionFrameBlockedPublicationReason } from "./visibleFrameProjectionWorkProof";
import type { GpuFlowMotionProjectionFrameWorkReport } from "./visibleFrameProjectionWorkTypes";
import type { GpuFlowVisiblePublicationDecision } from "./visibleFrameReducerRuntime";
import {
  assertGpuFlowVisiblePublicationResourcesProtected,
  createGpuFlowVisiblePublicationResourceBlockedReasons,
  createGpuFlowVisiblePublicationResourceProtectionReport,
} from "./visibleFrameResourceGraph";
import {
  proveGpuFlowVisibleFrameStateMachineFrame,
  type GpuFlowVisibleFramePreparedFrame,
  type GpuFlowVisibleFrameStateMachineOutcome,
} from "./visibleFrameStateMachine";
import { createGpuFlowVisibleFramePublicationStateMachineBlockedProof } from "./visibleFrameStateMachineBlockedProof";
import {
  createGpuFlowVisiblePublicationBrowserActorProofReportForFrame,
  createGpuFlowVisiblePublicationCompatiblePreviousProofReportForFrame,
  createGpuFlowVisiblePublicationCoverageReportForFrame,
  createGpuFlowVisiblePublicationPresentationProofReportForFrame,
  type GpuFlowVisiblePublicationPresentationProofReport,
} from "./visibleFrameTransactionReports";
import { createGpuFlowVisibleFramePublicationStateMachinePreparedFrame } from "./visibleFrameTransactionStateMachineAdapter";
import { GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID } from "./visibleFrameTypes";

export type GpuFlowVisiblePublicationPresentationDebtProof = {
  readonly content: boolean;
  readonly maintenance: boolean;
  readonly motion: boolean;
};

export type { GpuFlowVisiblePublicationPresentationProofReport };

export type GpuFlowVisiblePublicationPresentableFrameProof = ReturnType<
  typeof createGpuFlowVisiblePublicationPresentableFrameProof
>;

export type GpuFlowVisiblePublicationPresentableFrameProofFactory = (input: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly projectionTransactionKind: GpuFlowProjectionTransactionKind;
  readonly projectionTransactionId: GpuFlowVisibleProjectionState["transaction"]["id"];
}) => GpuFlowVisiblePublicationPresentableFrameProof;

export type GpuFlowVisiblePublicationBlockedProof = {
  readonly blockedReasons: GpuFlowVisibleFrameBlockedPublicationCandidate["blockedReasons"];
  readonly candidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
  readonly frozenFrameId: GpuFlowVisibleFrameBlockedPublicationCandidate["frozenFrameId"];
  readonly source:
    | "actor-proof"
    | "browser-visual-proof"
    | "compatible-previous-proof"
    | "content-publication"
    | "motion-projection"
    | "presentation-pair"
    | "resource-protection";
};

export type GpuFlowVisibleFramePublicationPreparedFrame = {
  readonly blockedPublicationCandidate?: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly blockedProof?: GpuFlowVisiblePublicationBlockedProof | null;
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly visibleFrameStateMachineOutcome: GpuFlowVisibleFrameStateMachineOutcome | null;
  readonly visibleFrameStateMachinePreparedFrame: GpuFlowVisibleFramePreparedFrame | null;
};

export type GpuFlowVisibleFramePublicationContentCandidate = {
  readonly blockedPreparedContentFrame?:
    | GpuFlowCommittedSurfaceFrame
    | null
    | undefined;
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly committedSurfaceFrame?:
    | GpuFlowCommittedSurfaceFrame
    | null
    | undefined;
  readonly forceImmediatePublicationDebtFrame?: boolean | undefined;
  readonly heldPreparedContentFrame?:
    | GpuFlowCommittedSurfaceFrame
    | null
    | undefined;
  readonly presentationEvidence?:
    | GpuFlowVisiblePublicationPresentationEvidence
    | null
    | undefined;
  readonly retainedDisplayFollowUpFrameReason?:
    | GpuFrameReason
    | null
    | undefined;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationMotionCandidate = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly presentationEvidence?:
    | GpuFlowVisiblePublicationPresentationEvidence
    | null
    | undefined;
  readonly projectionOnlyFrameWork?:
    | GpuFlowMotionProjectionFrameWorkReport
    | null
    | undefined;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = {
  readonly contentPublicationFrame: ContentPublicationFrame;
  readonly forcedBlockedPublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
  readonly motionProjectionFrame: MotionProjectionFrame;
};

export type GpuFlowVisibleFramePublicationPreparedCandidateSet = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly presentableFrameProof: GpuFlowVisiblePublicationPresentableFrameProof | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationTransactionProof = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly blockedSource:
    | GpuFlowVisiblePublicationBlockedProof["source"]
    | null;
  readonly presentableFrameProof: GpuFlowVisiblePublicationPresentableFrameProof | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleFrameStateMachineOutcome: GpuFlowVisibleFrameStateMachineOutcome;
  readonly visibleFrameStateMachinePreparedFrame: GpuFlowVisibleFramePreparedFrame;
  readonly visibleProjectionSource:
    | "content-publication"
    | "motion-projection"
    | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = GpuFlowVisibleFramePublicationPreparedFrame & {
  readonly contentPublicationFrame: ContentPublicationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof;
};

export type GpuFlowVisibleFramePublicationTransactionProofFactory = <
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>(
  input: GpuFlowVisibleFramePublicationCandidateSet<
    ContentPublicationFrame,
    MotionProjectionFrame
  > & {
    readonly previousVisibleProjectionState?: GpuFlowVisibleProjectionState | null;
    readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  },
) => GpuFlowVisibleFramePublicationTransactionProof;

export type GpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory = <
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>(input: {
  readonly contentPublicationFrame: ContentPublicationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof;
}) => GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
  ContentPublicationFrame,
  MotionProjectionFrame
>;

export function createGpuFlowVisiblePublicationPresentableFrameProofFactory(): GpuFlowVisiblePublicationPresentableFrameProofFactory {
  return createGpuFlowVisiblePublicationPresentableFrameProof;
}

function createGpuFlowVisiblePublicationPresentableFrameProof({
  committedFrame,
  presentationEvidence,
  publicationDecision,
  projectionTransactionKind,
  projectionTransactionId,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly projectionTransactionKind: GpuFlowProjectionTransactionKind;
  readonly projectionTransactionId: GpuFlowVisibleProjectionState["transaction"]["id"];
}) {
  const actorProofs = createGpuFlowVisiblePublicationActorProofsForFrame({
    committedFrame,
    projectionSampleId: publicationDecision.sample.id,
  });
  assertGpuFlowVisiblePublicationPresentationActorProofs(actorProofs);
  const resourceProtection =
    createGpuFlowVisiblePublicationResourceProtectionReport(committedFrame);
  assertGpuFlowVisiblePublicationResourcesProtected(resourceProtection);
  const browserActorProofs =
    createGpuFlowVisiblePublicationBrowserActorProofReportForFrame(
      committedFrame,
    );
  const compatiblePreviousProofs =
    createGpuFlowVisiblePublicationCompatiblePreviousProofReportForFrame({
      committedFrame,
      projectionSampleId: publicationDecision.sample.id,
    });
  const coverage =
    createGpuFlowVisiblePublicationCoverageReportForFrame(committedFrame);
  const presentationProof =
    createGpuFlowVisiblePublicationPresentationProofReportForFrame({
      committedFrame,
      presentationEvidence,
      projectionSampleId: publicationDecision.sample.id,
      projectionTransactionKind,
    });
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
    actorProofDigest:
      createGpuFlowVisiblePublicationActorProofDigest(actorProofs),
    actorProofs,
    browserActorProofs,
    compatiblePreviousProofs,
    coverage,
    debtProof,
    hasCompatiblePreviousCoverage,
    presentationAuthorityProof: createGpuFlowPresentationAuthorityProof({
      frame: committedFrame,
      presentationPairProof: presentationProof,
      projectionSampleId: publicationDecision.sample.id,
      projectionTransactionKind,
      projectionTransactionId,
    }),
    presentationProof,
    remainingActorDebt:
      createGpuFlowVisiblePublicationRemainingActorDebt(actorProofs),
    resourceProtection,
  });
}

export function createGpuFlowVisiblePublicationPresentableFrameProofReport(
  presentableFrameProof: GpuFlowVisiblePublicationPresentableFrameProof | null,
) {
  if (presentableFrameProof === null) {
    return {
      actorProofDigest: null,
      actorProofs: [],
      browserActorProofs:
        createGpuFlowVisiblePublicationBrowserActorProofReportForFrame(null),
      presentableFrameProof: null,
      compatiblePreviousProofs:
        createGpuFlowVisiblePublicationCompatiblePreviousProofReportForFrame({
          committedFrame: null,
          projectionSampleId: null,
        }),
      coverage: null,
      presentationProof: null,
      remainingActorDebt: [],
      resourceProtection:
        createGpuFlowVisiblePublicationResourceProtectionReport(null),
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

export function createGpuFlowVisiblePublicationTransactionProofReport(
  transactionProof: GpuFlowVisibleFramePublicationTransactionProof | null,
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

export function createGpuFlowVisibleFramePublicationTransactionProofFactory(): GpuFlowVisibleFramePublicationTransactionProofFactory {
  return createGpuFlowVisibleFramePublicationTransactionProof;
}

export function createGpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory(): GpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory {
  return createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame;
}

function createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  motionProjectionFrame,
  transactionProof,
}: {
  readonly contentPublicationFrame: ContentPublicationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof;
}): GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
  ContentPublicationFrame,
  MotionProjectionFrame
> {
  return Object.freeze({
    blockedPublicationCandidate: transactionProof.blockedPublicationCandidate,
    blockedProof: transactionProof.blockedProof,
    blockedPublicationToken: null,
    contentPublicationFrame,
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

function createGpuFlowVisibleFramePublicationTransactionProof<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  forcedBlockedPublicationCandidate = null,
  motionProjectionFrame,
  previousVisibleProjectionState = null,
  publicationDecision,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly previousVisibleProjectionState?: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisibleFramePublicationTransactionProof {
  const candidateVisibleProjectionState =
    resolveGpuFlowVisibleFramePublicationVisibleProjectionState({
      contentPublicationFrame,
      motionProjectionFrame,
    });
  const candidateBlockedProof =
    createGpuFlowVisibleFramePublicationCandidateBlockedProof({
      contentPublicationFrame,
      forcedBlockedPublicationCandidate,
      motionProjectionFrame,
    });
  const candidateVisibleProjectionSource =
    selectGpuFlowVisibleFramePublicationProjectionSource({
      contentPublicationFrame,
      motionProjectionFrame,
      visibleProjectionState: candidateVisibleProjectionState,
    });
  const presentationEvidence =
    resolveGpuFlowVisibleFramePublicationPresentationEvidence({
      contentPublicationFrame,
      motionProjectionFrame,
      visibleProjectionSource: candidateVisibleProjectionSource,
    });
  const blockingProofs = createGpuFlowVisibleFramePublicationBlockingProofs({
    candidateBlockedProof:
      resolveGpuFlowVisibleFramePublicationCandidateBlockedProof({
        candidateBlockedProof,
        candidateVisibleProjectionSource,
      }),
    candidateVisibleProjectionState,
    candidateVisibleProjectionSource,
    motionProjectionFrame,
    presentationEvidence,
    previousVisibleProjectionState,
    publicationDecision,
  });
  const visibleFrameStateMachinePreparedFrame =
    createGpuFlowVisibleFramePublicationStateMachinePreparedFrame({
      blockingProofs,
      candidateContentFrame:
        resolveGpuFlowVisibleFramePublicationCandidateContentFrame({
          contentPublicationFrame,
          candidateVisibleProjectionState,
        }),
      candidateVisibleProjectionState,
      previousVisibleProjectionState,
      publicationDecision,
    });
  const visibleFrameStateMachineOutcome =
    proveGpuFlowVisibleFrameStateMachineFrame({
      candidate: visibleFrameStateMachinePreparedFrame.candidate,
      previousPresentation:
        visibleFrameStateMachinePreparedFrame.previousPresentation,
    });
  const finalBlockedProof =
    createGpuFlowVisibleFramePublicationFinalBlockedProof({
      blockingProofs,
      candidate: visibleFrameStateMachinePreparedFrame.candidate,
      previousVisibleProjectionState,
      visibleFrameStateMachineOutcome,
    });
  const finalVisibleProjectionState =
    selectGpuFlowVisibleFramePublicationFinalVisibleProjectionState({
      candidateVisibleProjectionState,
      visibleFrameStateMachineOutcome,
    });
  const presentableFrameProof =
    createGpuFlowVisibleFramePublicationTransactionPresentableFrameProof({
      presentationEvidence,
      publicationDecision,
      visibleProjectionState: finalVisibleProjectionState,
    });
  return Object.freeze({
    blockedPublicationCandidate: finalBlockedProof?.candidate ?? null,
    blockedProof: finalBlockedProof,
    blockedSource: finalBlockedProof?.source ?? null,
    presentableFrameProof,
    renderedVisibleFrame: finalVisibleProjectionState !== null,
    visibleFrameStateMachineOutcome,
    visibleFrameStateMachinePreparedFrame,
    visibleProjectionSource:
      selectGpuFlowVisibleFramePublicationProjectionSource({
        contentPublicationFrame,
        motionProjectionFrame,
        visibleProjectionState: finalVisibleProjectionState,
      }),
    visibleProjectionState: finalVisibleProjectionState,
  });
}

function createGpuFlowVisibleFramePublicationFinalBlockedProof({
  blockingProofs,
  candidate,
  previousVisibleProjectionState,
  visibleFrameStateMachineOutcome,
}: {
  readonly blockingProofs: readonly GpuFlowVisiblePublicationBlockedProof[];
  readonly candidate: GpuFlowVisibleFramePreparedFrame["candidate"];
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly visibleFrameStateMachineOutcome: GpuFlowVisibleFrameStateMachineOutcome;
}): GpuFlowVisiblePublicationBlockedProof | null {
  return createGpuFlowVisibleFramePublicationStateMachineBlockedProof({
    blockingProofs,
    candidate,
    previousVisibleProjectionState,
    visibleFrameStateMachineOutcome,
  });
}

function selectGpuFlowVisibleFramePublicationFinalVisibleProjectionState({
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

function resolveGpuFlowVisibleFramePublicationCandidateContentFrame<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
>({
  contentPublicationFrame,
  candidateVisibleProjectionState,
}: {
  readonly contentPublicationFrame: ContentPublicationFrame;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowCommittedSurfaceFrame | null {
  return (
    candidateVisibleProjectionState?.committedFrame ??
    contentPublicationFrame.committedSurfaceFrame ??
    contentPublicationFrame.blockedPreparedContentFrame ??
    contentPublicationFrame.heldPreparedContentFrame ??
    null
  );
}

function resolveGpuFlowVisibleFramePublicationCandidateBlockedProof({
  candidateBlockedProof,
  candidateVisibleProjectionSource,
}: {
  readonly candidateBlockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidateVisibleProjectionSource: GpuFlowVisibleFramePublicationTransactionProof["visibleProjectionSource"];
}): GpuFlowVisiblePublicationBlockedProof | null {
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

function createGpuFlowVisibleFramePublicationBlockingProofs({
  candidateBlockedProof,
  candidateVisibleProjectionState,
  candidateVisibleProjectionSource,
  motionProjectionFrame,
  presentationEvidence,
  previousVisibleProjectionState,
  publicationDecision,
}: {
  readonly candidateBlockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly candidateVisibleProjectionSource: GpuFlowVisibleFramePublicationTransactionProof["visibleProjectionSource"];
  readonly motionProjectionFrame: GpuFlowVisibleFramePublicationMotionCandidate;
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): readonly GpuFlowVisiblePublicationBlockedProof[] {
  return Object.freeze(
    [
      candidateBlockedProof,
      createGpuFlowVisibleFramePublicationActorBlockedProof({
        previousVisibleProjectionState,
        visibleProjectionState: candidateVisibleProjectionState,
      }),
      createGpuFlowVisibleFramePublicationResourceBlockedProof({
        previousVisibleProjectionState,
        visibleProjectionState: candidateVisibleProjectionState,
      }),
      createGpuFlowVisibleFramePublicationMotionWorkBlockedProof({
        candidateVisibleProjectionSource,
        motionProjectionFrame,
        previousVisibleProjectionState,
      }),
      createGpuFlowVisibleFramePublicationPresentationBlockedProof({
        presentationEvidence,
        previousVisibleProjectionState,
        publicationDecision,
        visibleProjectionState: candidateVisibleProjectionState,
      }),
    ].filter(
      (proof): proof is GpuFlowVisiblePublicationBlockedProof => proof !== null,
    ),
  );
}

function createGpuFlowVisibleFramePublicationMotionWorkBlockedProof({
  candidateVisibleProjectionSource,
  motionProjectionFrame,
  previousVisibleProjectionState,
}: {
  readonly candidateVisibleProjectionSource: GpuFlowVisibleFramePublicationTransactionProof["visibleProjectionSource"];
  readonly motionProjectionFrame: GpuFlowVisibleFramePublicationMotionCandidate;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisiblePublicationBlockedProof | null {
  if (candidateVisibleProjectionSource !== "motion-projection") {
    return null;
  }
  const blockedReason =
    selectGpuFlowMotionProjectionFrameBlockedPublicationReason(
      motionProjectionFrame,
    );
  if (blockedReason === null) {
    return null;
  }
  return createGpuFlowVisiblePublicationBlockedProof({
    candidate: Object.freeze({
      blockedReasons: [
        {
          actorId: null,
          family: "retained-projection",
          reason: blockedReason,
        },
      ],
      frozenFrameId:
        previousVisibleProjectionState?.committedFrame.displayFrameId ??
        GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
    }),
    source: "motion-projection",
  });
}

function resolveGpuFlowVisibleFramePublicationVisibleProjectionState<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  motionProjectionFrame,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
>): GpuFlowVisibleProjectionState | null {
  if (
    contentPublicationFrame.visibleProjectionState &&
    motionProjectionFrame.visibleProjectionState
  ) {
    throw new Error(
      "GPU Flow visible publication proof received competing content and motion visible projection states for one transaction.",
    );
  }
  return (
    contentPublicationFrame.visibleProjectionState ??
    motionProjectionFrame.visibleProjectionState
  );
}

function resolveGpuFlowVisibleFramePublicationPresentationEvidence<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  motionProjectionFrame,
  visibleProjectionSource,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly visibleProjectionSource: GpuFlowVisibleFramePublicationTransactionProof["visibleProjectionSource"];
}): GpuFlowVisiblePublicationPresentationEvidence | null {
  switch (visibleProjectionSource) {
    case "content-publication":
      return contentPublicationFrame.presentationEvidence ?? null;
    case "motion-projection":
      return motionProjectionFrame.presentationEvidence ?? null;
    case null:
      return null;
  }
}

function createGpuFlowVisibleFramePublicationPresentationBlockedProof({
  presentationEvidence,
  previousVisibleProjectionState,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisiblePublicationBlockedProof | null {
  if (
    visibleProjectionState === null ||
    visibleProjectionState.transaction.kind === "held-previous"
  ) {
    return null;
  }
  const blockedReasons =
    createGpuFlowVisiblePublicationPresentationBlockedReasons({
      presentationEvidence,
      publicationDecision,
      visibleProjectionState,
    });
  if (blockedReasons.length === 0) {
    return null;
  }
  return createGpuFlowVisiblePublicationBlockedProof({
    candidate: Object.freeze({
      blockedReasons,
      frozenFrameId:
        previousVisibleProjectionState?.committedFrame.displayFrameId ??
        GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
    }),
    source: "presentation-pair",
  });
}

function createGpuFlowVisibleFramePublicationResourceBlockedProof({
  previousVisibleProjectionState,
  visibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisiblePublicationBlockedProof | null {
  if (visibleProjectionState === null) {
    return null;
  }
  const blockedReasons = createGpuFlowVisiblePublicationResourceBlockedReasons(
    visibleProjectionState.committedFrame,
  );
  if (blockedReasons.length === 0) {
    return null;
  }
  return createGpuFlowVisiblePublicationBlockedProof({
    candidate: Object.freeze({
      blockedReasons,
      frozenFrameId:
        previousVisibleProjectionState?.committedFrame.displayFrameId ??
        GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
    }),
    source: "resource-protection",
  });
}

function createGpuFlowVisibleFramePublicationTransactionPresentableFrameProof({
  presentationEvidence,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisiblePublicationPresentableFrameProof | null {
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
  return createGpuFlowVisiblePublicationPresentableFrameProof({
    committedFrame: visibleProjectionState.committedFrame,
    presentationEvidence,
    publicationDecision,
    projectionTransactionKind: visibleProjectionState.transaction.kind,
    projectionTransactionId: visibleProjectionState.transaction.id,
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

function createGpuFlowVisibleFramePublicationCandidateBlockedProof<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  forcedBlockedPublicationCandidate,
  motionProjectionFrame,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
>): GpuFlowVisiblePublicationBlockedProof | null {
  if (forcedBlockedPublicationCandidate) {
    return createGpuFlowVisiblePublicationBlockedProof({
      candidate: forcedBlockedPublicationCandidate,
      source: "browser-visual-proof",
    });
  }
  const contentBlockedCandidate =
    contentPublicationFrame.blockedPublicationCandidate;
  const motionBlockedCandidate =
    motionProjectionFrame.blockedPublicationCandidate;
  if (contentBlockedCandidate && motionBlockedCandidate) {
    throw new Error(
      "GPU Flow visible publication proof received competing content and motion blocked publication candidates for one transaction.",
    );
  }
  if (contentBlockedCandidate) {
    return createGpuFlowVisiblePublicationBlockedProof({
      candidate: contentBlockedCandidate,
      source: "content-publication",
    });
  }
  if (motionBlockedCandidate) {
    return createGpuFlowVisiblePublicationBlockedProof({
      candidate: motionBlockedCandidate,
      source: "motion-projection",
    });
  }
  return null;
}

function createGpuFlowVisiblePublicationBlockedProof({
  candidate,
  source,
}: {
  readonly candidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
  readonly source: GpuFlowVisiblePublicationBlockedProof["source"];
}): GpuFlowVisiblePublicationBlockedProof {
  return Object.freeze({
    blockedReasons: candidate.blockedReasons,
    candidate,
    frozenFrameId: candidate.frozenFrameId,
    source,
  });
}

function createGpuFlowVisibleFramePublicationActorBlockedProof({
  previousVisibleProjectionState,
  visibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisiblePublicationBlockedProof | null {
  if (visibleProjectionState === null) {
    return null;
  }
  const blockedReasons =
    createGpuFlowVisiblePublicationBlockedActorReasonsForFrame({
      committedFrame: visibleProjectionState.committedFrame,
      projectionSampleId: visibleProjectionState.sample.id,
    });
  if (blockedReasons.length === 0) {
    return null;
  }
  return createGpuFlowVisiblePublicationBlockedProof({
    candidate: Object.freeze({
      blockedReasons,
      frozenFrameId:
        previousVisibleProjectionState?.committedFrame.displayFrameId ??
        GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
    }),
    source: createGpuFlowVisiblePublicationActorBlockedProofSource({
      blockedReasons,
    }),
  });
}

function createGpuFlowVisiblePublicationActorBlockedProofSource({
  blockedReasons,
}: {
  readonly blockedReasons: readonly {
    readonly reason: string;
  }[];
}): GpuFlowVisiblePublicationBlockedProof["source"] {
  return blockedReasons.some(
    (reason) => reason.reason === "compatible-previous-budget-exceeded",
  )
    ? "compatible-previous-proof"
    : "actor-proof";
}

function selectGpuFlowVisibleFramePublicationProjectionSource<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  motionProjectionFrame,
  visibleProjectionState,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePublicationTransactionProof["visibleProjectionSource"] {
  if (!visibleProjectionState) {
    return null;
  }
  if (contentPublicationFrame.visibleProjectionState) {
    return "content-publication";
  }
  if (motionProjectionFrame.visibleProjectionState) {
    return "motion-projection";
  }
  return null;
}
