// Builds immutable transaction proof records; visible mutation stays in the presenter.
import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type {
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import {
  assertGpuFlowVisiblePublicationCommitActorProofs,
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
import { createGpuFlowCommitAuthorityProof } from "./visibleFramePresentationProofs";
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
import {
  createGpuFlowVisiblePublicationBrowserActorProofReportForFrame,
  createGpuFlowVisiblePublicationCompatiblePreviousProofReportForFrame,
  createGpuFlowVisiblePublicationCoverageReportForFrame,
  createGpuFlowVisiblePublicationPresentationProofReportForFrame,
  type GpuFlowVisiblePublicationPresentationProofReport,
} from "./visibleFrameTransactionReports";
import { createGpuFlowVisibleFramePublicationStateMachinePreparedFrame } from "./visibleFrameTransactionStateMachineAdapter";
import { GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID } from "./visibleFrameTypes";

export type GpuFlowVisiblePublicationCommitDebtProof = {
  readonly content: boolean;
  readonly maintenance: boolean;
  readonly motion: boolean;
};

export type { GpuFlowVisiblePublicationPresentationProofReport };

export type GpuFlowVisiblePublicationCommitProof = ReturnType<
  typeof createGpuFlowVisiblePublicationCommitProof
>;

export type GpuFlowVisiblePublicationCommitProofFactory = (input: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly projectionTransactionId: GpuFlowVisibleProjectionState["transaction"]["id"];
}) => GpuFlowVisiblePublicationCommitProof;

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
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly forceImmediatePublicationDebtFrame?: boolean | undefined;
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
  readonly commitProof: GpuFlowVisiblePublicationCommitProof | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationTransactionProof = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly blockedSource:
    | GpuFlowVisiblePublicationBlockedProof["source"]
    | null;
  readonly commitProof: GpuFlowVisiblePublicationCommitProof | null;
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

export function createGpuFlowVisiblePublicationCommitProofFactory(): GpuFlowVisiblePublicationCommitProofFactory {
  return createGpuFlowVisiblePublicationCommitProof;
}

function createGpuFlowVisiblePublicationCommitProof({
  committedFrame,
  presentationEvidence,
  publicationDecision,
  projectionTransactionId,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly projectionTransactionId: GpuFlowVisibleProjectionState["transaction"]["id"];
}) {
  const actorProofs = createGpuFlowVisiblePublicationActorProofsForFrame({
    committedFrame,
    projectionSampleId: publicationDecision.sample.id,
  });
  assertGpuFlowVisiblePublicationCommitActorProofs(actorProofs);
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
    commitAuthorityProof: createGpuFlowCommitAuthorityProof({
      frame: committedFrame,
      presentationPairProof: presentationProof,
      projectionSampleId: publicationDecision.sample.id,
      projectionTransactionId,
    }),
    presentationProof,
    remainingActorDebt:
      createGpuFlowVisiblePublicationRemainingActorDebt(actorProofs),
    resourceProtection,
  });
}

export function createGpuFlowVisiblePublicationCommitProofReport(
  commitProof: GpuFlowVisiblePublicationCommitProof | null,
) {
  if (commitProof === null) {
    return {
      actorProofDigest: null,
      actorProofs: [],
      browserActorProofs:
        createGpuFlowVisiblePublicationBrowserActorProofReportForFrame(null),
      commitProof: null,
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
    actorProofDigest: commitProof.actorProofDigest,
    actorProofs: commitProof.actorProofs,
    browserActorProofs: commitProof.browserActorProofs,
    commitProof: {
      debtProof: commitProof.debtProof,
      hasCompatiblePreviousCoverage: commitProof.hasCompatiblePreviousCoverage,
      resourceProtectionDigest:
        commitProof.commitAuthorityProof.resourceProtectionDigest,
    },
    compatiblePreviousProofs: commitProof.compatiblePreviousProofs,
    coverage: commitProof.coverage,
    presentationProof: commitProof.presentationProof,
    remainingActorDebt: commitProof.remainingActorDebt,
    resourceProtection: commitProof.resourceProtection,
  };
}

export function createGpuFlowVisiblePublicationTransactionProofReport(
  transactionProof: GpuFlowVisibleFramePublicationTransactionProof | null,
) {
  if (transactionProof === null) {
    return {
      blockedProof: null,
      blockedSource: null,
      hasCommitProof: false,
      hasPresentableCommit: false,
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
    hasCommitProof: transactionProof.commitProof !== null,
    hasPresentableCommit:
      transactionProof.commitProof !== null &&
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
  const { blockedProof, visibleProjectionState } =
    resolveGpuFlowVisibleFramePublicationProofState({
      candidateBlockedProof:
        resolveGpuFlowVisibleFramePublicationCandidateBlockedProof({
          candidateBlockedProof,
          candidateVisibleProjectionSource,
        }),
      candidateVisibleProjectionState,
      previousVisibleProjectionState,
    });
  const presentationEvidence =
    resolveGpuFlowVisibleFramePublicationPresentationEvidence({
      contentPublicationFrame,
      motionProjectionFrame,
      visibleProjectionSource: candidateVisibleProjectionSource,
    });
  const presentationBlockedProof =
    createGpuFlowVisibleFramePublicationPresentationBlockedProof({
      presentationEvidence,
      previousVisibleProjectionState,
      publicationDecision,
      visibleProjectionState,
    });
  const selectedBlockedProof = blockedProof ?? presentationBlockedProof;
  const selectedVisibleProjectionState =
    selectedBlockedProof === null ? visibleProjectionState : null;
  const commitProof =
    createGpuFlowVisibleFramePublicationTransactionCommitProof({
      presentationEvidence,
      publicationDecision,
      visibleProjectionState: selectedVisibleProjectionState,
    });
  const visibleFrameStateMachinePreparedFrame =
    createGpuFlowVisibleFramePublicationStateMachinePreparedFrame({
      blockedProof: selectedBlockedProof,
      candidateVisibleProjectionState,
      previousVisibleProjectionState,
      publicationDecision,
      selectedVisibleProjectionState,
    });
  const visibleFrameStateMachineOutcome =
    proveGpuFlowVisibleFrameStateMachineFrame({
      candidate: visibleFrameStateMachinePreparedFrame.candidate,
      previousPresentation:
        visibleFrameStateMachinePreparedFrame.previousPresentation,
    });
  return Object.freeze({
    blockedPublicationCandidate: selectedBlockedProof?.candidate ?? null,
    blockedProof: selectedBlockedProof,
    blockedSource: selectedBlockedProof?.source ?? null,
    commitProof,
    renderedVisibleFrame: selectedVisibleProjectionState !== null,
    visibleFrameStateMachineOutcome,
    visibleFrameStateMachinePreparedFrame,
    visibleProjectionSource:
      selectGpuFlowVisibleFramePublicationProjectionSource({
        contentPublicationFrame,
        motionProjectionFrame,
        visibleProjectionState: selectedVisibleProjectionState,
      }),
    visibleProjectionState: selectedVisibleProjectionState,
  });
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

function resolveGpuFlowVisibleFramePublicationProofState({
  candidateBlockedProof,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
}: {
  readonly candidateBlockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
} {
  if (candidateBlockedProof !== null) {
    return {
      blockedProof: candidateBlockedProof,
      visibleProjectionState: null,
    };
  }
  const actorBlockedProof =
    createGpuFlowVisibleFramePublicationActorBlockedProof({
      previousVisibleProjectionState,
      visibleProjectionState: candidateVisibleProjectionState,
    });
  if (actorBlockedProof === null) {
    const resourceBlockedProof =
      createGpuFlowVisibleFramePublicationResourceBlockedProof({
        previousVisibleProjectionState,
        visibleProjectionState: candidateVisibleProjectionState,
      });
    return resourceBlockedProof === null
      ? {
          blockedProof: null,
          visibleProjectionState: candidateVisibleProjectionState,
        }
      : {
          blockedProof: resourceBlockedProof,
          visibleProjectionState: null,
        };
  }
  return {
    blockedProof: actorBlockedProof,
    visibleProjectionState: null,
  };
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

function createGpuFlowVisibleFramePublicationTransactionCommitProof({
  presentationEvidence,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisiblePublicationCommitProof | null {
  if (
    visibleProjectionState === null ||
    visibleProjectionState.transaction.kind === "held-previous"
  ) {
    return null;
  }
  if (presentationEvidence === null) {
    throw new Error(
      "GPU Flow visible publication commit proof requires DOM/canvas presentation evidence.",
    );
  }
  return createGpuFlowVisiblePublicationCommitProof({
    committedFrame: visibleProjectionState.committedFrame,
    presentationEvidence,
    publicationDecision,
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
