// Builds immutable transaction proof records; visible mutation stays in the presenter.
import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type {
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import {
  proveGpuFlowVisibleFrameEngineFrame,
  type GpuFlowVisibleFrameEngineOutcome,
  type GpuFlowVisibleFramePreparedFrame,
} from "./visibleFrameEngine";
import { createGpuFlowCommitAuthorityProof } from "./visibleFramePresentationProofs";
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
import {
  assertGpuFlowVisiblePublicationResourcesProtected,
  createGpuFlowVisiblePublicationResourceBlockedReasons,
  createGpuFlowVisiblePublicationResourceProtectionReport,
} from "./visibleFrameResourceRegistry";
import type { GpuFlowBlockedPublicationToken } from "./visibleFramePresentationProofs";
import {
  createGpuFlowVisiblePublicationBrowserActorProofReportForFrame,
  createGpuFlowVisiblePublicationCompatiblePreviousProofReportForFrame,
  createGpuFlowVisiblePublicationCoverageReportForFrame,
  createGpuFlowVisiblePublicationPresentationProofReportForFrame,
  type GpuFlowVisiblePublicationPresentationProofReport,
} from "./visibleFrameTransactionReports";
import { createGpuFlowVisibleFramePublicationEnginePreparedFrame } from "./visibleFrameTransactionEngineAdapter";
import {
  GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
} from "./visibleFrameTypes";

export type GpuFlowVisiblePublicationCommitDebtProof = {
  readonly content: boolean;
  readonly maintenance: boolean;
  readonly motion: boolean;
};

export type { GpuFlowVisiblePublicationPresentationProofReport };

export type GpuFlowVisiblePublicationCommitOracle = ReturnType<
  typeof createGpuFlowVisiblePublicationCommitOracle
>;

export type GpuFlowVisiblePublicationCommitOracleFactory = (input: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly projectionTransactionId: GpuFlowVisibleProjectionState["transaction"]["id"];
}) => GpuFlowVisiblePublicationCommitOracle;

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
  readonly visibleFrameEngineOutcome: GpuFlowVisibleFrameEngineOutcome | null;
  readonly visibleFrameEnginePreparedFrame: GpuFlowVisibleFramePreparedFrame | null;
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
  readonly commitOracle: GpuFlowVisiblePublicationCommitOracle | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationTransactionOracle = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly blockedSource:
    | GpuFlowVisiblePublicationBlockedProof["source"]
    | null;
  readonly commitOracle: GpuFlowVisiblePublicationCommitOracle | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleFrameEngineOutcome: GpuFlowVisibleFrameEngineOutcome;
  readonly visibleFrameEnginePreparedFrame: GpuFlowVisibleFramePreparedFrame;
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
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
};

export type GpuFlowVisibleFramePublicationTransactionOracleFactory = <
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
) => GpuFlowVisibleFramePublicationTransactionOracle;

export type GpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory = <
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>(input: {
  readonly contentPublicationFrame: ContentPublicationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
}) => GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
  ContentPublicationFrame,
  MotionProjectionFrame
>;

export function createGpuFlowVisiblePublicationCommitOracleFactory(): GpuFlowVisiblePublicationCommitOracleFactory {
  return createGpuFlowVisiblePublicationCommitOracle;
}

function createGpuFlowVisiblePublicationCommitOracle({
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

export function createGpuFlowVisiblePublicationCommitOracleReport(
  commitOracle: GpuFlowVisiblePublicationCommitOracle | null,
) {
  if (commitOracle === null) {
    return {
      actorProofDigest: null,
      actorProofs: [],
      browserActorProofs:
        createGpuFlowVisiblePublicationBrowserActorProofReportForFrame(null),
      commitOracle: null,
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
    actorProofDigest: commitOracle.actorProofDigest,
    actorProofs: commitOracle.actorProofs,
    browserActorProofs: commitOracle.browserActorProofs,
    commitOracle: {
      debtProof: commitOracle.debtProof,
      hasCompatiblePreviousCoverage: commitOracle.hasCompatiblePreviousCoverage,
      resourceProtectionDigest:
        commitOracle.commitAuthorityProof.resourceProtectionDigest,
    },
    compatiblePreviousProofs: commitOracle.compatiblePreviousProofs,
    coverage: commitOracle.coverage,
    presentationProof: commitOracle.presentationProof,
    remainingActorDebt: commitOracle.remainingActorDebt,
    resourceProtection: commitOracle.resourceProtection,
  };
}

export function createGpuFlowVisiblePublicationTransactionOracleReport(
  transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle | null,
) {
  if (transactionOracle === null) {
    return {
      blockedProof: null,
      blockedSource: null,
      hasCommitOracle: false,
      hasPresentableCommit: false,
      renderedVisibleFrame: false,
      visibleFrameEngineOutcome: null,
      visibleProjectionSource: null,
    };
  }
  const visibleFrameEngineOutcome =
    transactionOracle.visibleFrameEngineOutcome ?? null;
  return {
    blockedProof:
      transactionOracle.blockedProof === null
        ? null
        : {
            blockedReasons: transactionOracle.blockedProof.blockedReasons,
            frozenFrameId: transactionOracle.blockedProof.frozenFrameId,
            source: transactionOracle.blockedProof.source,
          },
    blockedSource: transactionOracle.blockedSource,
    hasCommitOracle: transactionOracle.commitOracle !== null,
    hasPresentableCommit:
      transactionOracle.commitOracle !== null &&
      transactionOracle.visibleProjectionState?.transaction?.kind !==
        "held-previous",
    renderedVisibleFrame: transactionOracle.renderedVisibleFrame,
    ...(visibleFrameEngineOutcome === null
      ? {}
      : {
          visibleFrameEngineOutcome: {
            decidingProof: visibleFrameEngineOutcome.decidingProof,
            kind: visibleFrameEngineOutcome.kind,
          },
        }),
    visibleProjectionSource: transactionOracle.visibleProjectionSource,
  };
}

export function createGpuFlowVisibleFramePublicationTransactionOracleFactory(): GpuFlowVisibleFramePublicationTransactionOracleFactory {
  return createGpuFlowVisibleFramePublicationTransactionOracle;
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
  transactionOracle,
}: {
  readonly contentPublicationFrame: ContentPublicationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
}): GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
  ContentPublicationFrame,
  MotionProjectionFrame
> {
  return Object.freeze({
    blockedPublicationCandidate: transactionOracle.blockedPublicationCandidate,
    blockedProof: transactionOracle.blockedProof,
    blockedPublicationToken: null,
    contentPublicationFrame,
    motionProjectionFrame,
    renderedVisibleFrame: transactionOracle.renderedVisibleFrame,
    transactionOracle,
    visibleFrameEngineOutcome: transactionOracle.visibleFrameEngineOutcome,
    visibleFrameEnginePreparedFrame:
      transactionOracle.visibleFrameEnginePreparedFrame,
    visibleProjectionState: transactionOracle.visibleProjectionState,
  });
}

function createGpuFlowVisibleFramePublicationTransactionOracle<
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
}): GpuFlowVisibleFramePublicationTransactionOracle {
  const candidateVisibleProjectionState =
    resolveGpuFlowVisibleFramePublicationOracleVisibleProjectionState({
      contentPublicationFrame,
      motionProjectionFrame,
    });
  const candidateBlockedProof =
    createGpuFlowVisibleFramePublicationOracleBlockedProof({
      contentPublicationFrame,
      forcedBlockedPublicationCandidate,
      motionProjectionFrame,
    });
  const candidateVisibleProjectionSource =
    createGpuFlowVisibleFramePublicationOracleProjectionSource({
      contentPublicationFrame,
      motionProjectionFrame,
      visibleProjectionState: candidateVisibleProjectionState,
    });
  const { blockedProof, visibleProjectionState } =
    resolveGpuFlowVisibleFramePublicationOracleProofState({
      candidateBlockedProof:
        resolveGpuFlowVisibleFramePublicationOracleCandidateBlockedProof({
          candidateBlockedProof,
          candidateVisibleProjectionSource,
        }),
      candidateVisibleProjectionState,
      previousVisibleProjectionState,
    });
  const presentationEvidence =
    resolveGpuFlowVisibleFramePublicationOraclePresentationEvidence({
      contentPublicationFrame,
      motionProjectionFrame,
      visibleProjectionSource: candidateVisibleProjectionSource,
    });
  const presentationBlockedProof =
    createGpuFlowVisibleFramePublicationOraclePresentationBlockedProof({
      presentationEvidence,
      previousVisibleProjectionState,
      publicationDecision,
      visibleProjectionState,
    });
  const selectedBlockedProof = blockedProof ?? presentationBlockedProof;
  const selectedVisibleProjectionState =
    selectedBlockedProof === null ? visibleProjectionState : null;
  const commitOracle =
    createGpuFlowVisibleFramePublicationTransactionCommitOracle({
      presentationEvidence,
      publicationDecision,
      visibleProjectionState: selectedVisibleProjectionState,
    });
  const visibleFrameEnginePreparedFrame =
    createGpuFlowVisibleFramePublicationEnginePreparedFrame({
      blockedProof: selectedBlockedProof,
      candidateVisibleProjectionState,
      previousVisibleProjectionState,
      publicationDecision,
      selectedVisibleProjectionState,
    });
  const visibleFrameEngineOutcome = proveGpuFlowVisibleFrameEngineFrame({
    candidate: visibleFrameEnginePreparedFrame.candidate,
    previousPresentation: visibleFrameEnginePreparedFrame.previousPresentation,
  });
  return Object.freeze({
    blockedPublicationCandidate: selectedBlockedProof?.candidate ?? null,
    blockedProof: selectedBlockedProof,
    blockedSource: selectedBlockedProof?.source ?? null,
    commitOracle,
    renderedVisibleFrame: selectedVisibleProjectionState !== null,
    visibleFrameEngineOutcome,
    visibleFrameEnginePreparedFrame,
    visibleProjectionSource:
      createGpuFlowVisibleFramePublicationOracleProjectionSource({
        contentPublicationFrame,
        motionProjectionFrame,
        visibleProjectionState: selectedVisibleProjectionState,
      }),
    visibleProjectionState: selectedVisibleProjectionState,
  });
}

function resolveGpuFlowVisibleFramePublicationOracleCandidateBlockedProof({
  candidateBlockedProof,
  candidateVisibleProjectionSource,
}: {
  readonly candidateBlockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidateVisibleProjectionSource: GpuFlowVisibleFramePublicationTransactionOracle["visibleProjectionSource"];
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

function resolveGpuFlowVisibleFramePublicationOracleProofState({
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
    createGpuFlowVisibleFramePublicationOracleActorBlockedProof({
      previousVisibleProjectionState,
      visibleProjectionState: candidateVisibleProjectionState,
    });
  if (actorBlockedProof === null) {
    const resourceBlockedProof =
      createGpuFlowVisibleFramePublicationOracleResourceBlockedProof({
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

function resolveGpuFlowVisibleFramePublicationOracleVisibleProjectionState<
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
      "GPU Flow visible publication oracle received competing content and motion visible projection states for one transaction.",
    );
  }
  return (
    contentPublicationFrame.visibleProjectionState ??
    motionProjectionFrame.visibleProjectionState
  );
}

function resolveGpuFlowVisibleFramePublicationOraclePresentationEvidence<
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
  readonly visibleProjectionSource: GpuFlowVisibleFramePublicationTransactionOracle["visibleProjectionSource"];
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

function createGpuFlowVisibleFramePublicationOraclePresentationBlockedProof({
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

function createGpuFlowVisibleFramePublicationOracleResourceBlockedProof({
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

function createGpuFlowVisibleFramePublicationTransactionCommitOracle({
  presentationEvidence,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisiblePublicationCommitOracle | null {
  if (
    visibleProjectionState === null ||
    visibleProjectionState.transaction.kind === "held-previous"
  ) {
    return null;
  }
  if (presentationEvidence === null) {
    throw new Error(
      "GPU Flow visible publication commit oracle requires DOM/canvas presentation evidence.",
    );
  }
  return createGpuFlowVisiblePublicationCommitOracle({
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

function createGpuFlowVisibleFramePublicationOracleBlockedProof<
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
      "GPU Flow visible publication oracle received competing content and motion blocked publication candidates for one transaction.",
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

function createGpuFlowVisibleFramePublicationOracleActorBlockedProof({
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

function createGpuFlowVisibleFramePublicationOracleProjectionSource<
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
}): GpuFlowVisibleFramePublicationTransactionOracle["visibleProjectionSource"] {
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
