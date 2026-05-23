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
  type GpuFlowVisibleFrameEngineSample,
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
import type { GpuFlowVisibleFrameBlockedPublicationCandidate } from "./visibleFramePublicationContentPlan";
import {
  createGpuFlowVisiblePublicationPresentationBlockedReasons,
  type GpuFlowVisiblePublicationCanvasPresentationEvidence,
  type GpuFlowVisiblePublicationPresentationEvidence,
} from "./visibleFramePresentationEvidence";
import {
  assertGpuFlowVisiblePublicationResourcesProtected,
  createGpuFlowVisiblePublicationResourceBlockedReasons,
  createGpuFlowVisiblePublicationResourceProtectionReport,
} from "./visibleFrameResourceRegistry";
import type { GpuFlowBlockedPublicationToken } from "./visibleFramePublicationTokens";
import {
  createGpuFlowContentFrameId,
  createGpuFlowPresentationId,
  createGpuFlowVisibleFrameActorKey,
  GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
  type GpuFlowContentFrameId,
  type GpuFlowProjectionSampleId,
  type GpuFlowVisibleFrameActorFamily,
  type GpuFlowVisibleFrameActorKey,
  type GpuFlowVisibleFrameActorProof,
  type GpuFlowVisibleFrameCandidate,
  type GpuFlowVisibleFrameCommittedActorCoverage,
  type GpuFlowVisibleFrameCommittedPresentation,
  type GpuFlowVisibleFrameDebt,
  type GpuFlowVisibleFrameRect,
} from "./visibleFrameTypes";

type GpuFlowVisibleFramePublicationEngineActor =
  GpuFlowCommittedSurfaceFrame["actorGenerations"][number];

export type GpuFlowVisiblePublicationCommitDebtProof = {
  readonly content: boolean;
  readonly maintenance: boolean;
  readonly motion: boolean;
};

export type GpuFlowVisiblePublicationPresentationProofReport = {
  readonly actorManifestDigest: string;
  readonly batchId: string;
  readonly browserVisualFragmentDigest: string | null;
  readonly canvasGenerationEvidence: GpuFlowVisiblePublicationCanvasPresentationEvidence;
  readonly canvasGeneration: GpuFlowCommittedSurfaceFrame["presentationProof"]["canvasGeneration"];
  readonly domGenerationEvidence: GpuFlowCommittedSurfaceFrame["presentationProof"]["domGenerationEvidence"];
  readonly domGeneration: GpuFlowCommittedSurfaceFrame["presentationProof"]["domGeneration"];
  readonly projectionSampleId: number;
  readonly surfaceTransactionDigest: string | null;
};

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

function createGpuFlowVisibleFramePublicationEnginePreparedFrame({
  blockedProof,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
  publicationDecision,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePreparedFrame {
  const candidate = createGpuFlowVisibleFramePublicationEngineCandidate({
    blockedProof,
    candidateVisibleProjectionState,
    previousVisibleProjectionState,
    publicationDecision,
    selectedVisibleProjectionState,
  });
  return Object.freeze({
    candidate,
    previousPresentation:
      createGpuFlowVisibleFramePublicationEnginePreviousPresentation({
        blockedProof,
        candidate,
        previousVisibleProjectionState,
        selectedVisibleProjectionState,
      }),
    sample: createGpuFlowVisibleFramePublicationEngineSample({
      previousVisibleProjectionState,
      publicationDecision,
    }),
  });
}

function createGpuFlowVisibleFramePublicationEngineCandidate({
  blockedProof,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
  publicationDecision,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameCandidate {
  const contentFrameId =
    createGpuFlowVisibleFramePublicationEngineContentFrameId({
      blockedProof,
      candidateVisibleProjectionState,
      previousVisibleProjectionState,
      publicationDecision,
      selectedVisibleProjectionState,
    });
  const projectionSampleId = publicationDecision.sample.id;
  const proofByActor = new Map<string, GpuFlowVisibleFrameActorProof>();
  for (const actor of candidateVisibleProjectionState?.committedFrame
    .actorGenerations ?? []) {
    if (!actor.visibleNonempty) {
      continue;
    }
    setGpuFlowVisibleFramePublicationEngineActorProof({
      proof: createGpuFlowVisibleFramePublicationEngineActorProof({
        actor,
        contentFrameId,
        projectionSampleId,
      }),
      proofByActor,
    });
  }
  for (const proof of createGpuFlowVisibleFramePublicationEngineBlockedProofs({
    blockedProof,
  })) {
    setGpuFlowVisibleFramePublicationEngineActorProof({
      proof,
      proofByActor,
    });
  }
  if (
    selectedVisibleProjectionState?.transaction.kind === "held-previous" ||
    (selectedVisibleProjectionState === null && blockedProof === null)
  ) {
    const syntheticProof =
      createGpuFlowVisibleFramePublicationEngineSyntheticBlockedProof({
        actorId: "visible-frame",
        family: "retained-page",
        reason:
          selectedVisibleProjectionState?.transaction.kind === "held-previous"
            ? getGpuFlowVisibleFramePublicationEngineHeldPreviousReason(
                selectedVisibleProjectionState,
              )
            : "no-visible-frame",
      });
    setGpuFlowVisibleFramePublicationEngineActorProof({
      proof: syntheticProof,
      proofByActor,
    });
  }
  const actorProofs = Object.freeze([...proofByActor.values()]);
  return Object.freeze({
    actorProofs,
    contentFrameId,
    preparedResourceIds:
      createGpuFlowVisibleFramePublicationEnginePreparedResourceIds(
        candidateVisibleProjectionState,
      ),
    projectionSampleId,
    queuedDebt: createGpuFlowVisibleFramePublicationEngineDebt({
      blockedProof,
      publicationDecision,
    }),
    requiredActors: Object.freeze(
      actorProofs
        .filter((proof) => proof.requirement === "required")
        .map(({ actorId, family }) =>
          Object.freeze({
            actorId,
            family,
          }),
        ),
    ),
  });
}

function getGpuFlowVisibleFramePublicationEngineHeldPreviousReason(
  visibleProjectionState: GpuFlowVisibleProjectionState,
): string {
  const heldPreviousProjection = visibleProjectionState.heldPreviousProjection;
  return heldPreviousProjection?.maxHeldPreviousFramesExceeded ||
    heldPreviousProjection?.maxHeldPreviousMsExceeded
    ? "held-previous-budget-exceeded"
    : "held-previous";
}

function createGpuFlowVisibleFramePublicationEngineContentFrameId({
  blockedProof,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
  publicationDecision,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentFrameId {
  const visibleProjectionState =
    selectedVisibleProjectionState ?? candidateVisibleProjectionState;
  if (visibleProjectionState !== null) {
    return createGpuFlowContentFrameId(
      String(visibleProjectionState.committedFrame.displayFrameId),
    );
  }
  if (previousVisibleProjectionState !== null) {
    return createGpuFlowContentFrameId(
      String(previousVisibleProjectionState.committedFrame.displayFrameId),
    );
  }
  return createGpuFlowContentFrameId(
    `cold-start:${blockedProof?.source ?? "no-frame"}:${publicationDecision.sample.id}`,
  );
}

function createGpuFlowVisibleFramePublicationEngineActorProof({
  actor,
  contentFrameId,
  projectionSampleId,
}: {
  readonly actor: GpuFlowVisibleFramePublicationEngineActor;
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): GpuFlowVisibleFrameActorProof {
  const actorKey = createGpuFlowVisibleFramePublicationEngineActorKey(actor);
  const textCoverage = actor.textCoverageProof;
  if (textCoverage?.projectionCoverage === "true-hole") {
    return Object.freeze({
      ...actorKey,
      proof: "true-hole",
      reason: textCoverage.readinessReason,
      requirement: "required",
      trueHoleCount: 1,
    });
  }
  if (
    textCoverage?.projectionCoverage === "blocked-awaiting-browser-visual" ||
    textCoverage?.projectionCoverage === "blocked-awaiting-live-host"
  ) {
    return Object.freeze({
      ...actorKey,
      proof: "blocked",
      reason: textCoverage.readinessReason,
      requirement: "required",
    });
  }
  if (textCoverage?.projectionCoverage === "compatible-previous") {
    const compatiblePreviousProof = textCoverage.compatiblePreviousProof;
    return Object.freeze({
      ...actorKey,
      compatiblePreviousProof: Object.freeze({
        family: "browser-visual" as const,
        proof: Object.freeze({
          activeEditorState:
            getGpuFlowVisibleFramePublicationEngineBrowserRepresentationKind(
              actor,
            ) === "active-editor"
              ? Object.freeze({
                  focusPreserved: true as const,
                  hostId: actor.controlId ?? actor.actorId,
                  selectionPreserved: true as const,
                  transferKind: "same-host-transform" as const,
                })
              : undefined,
          actorId: actor.actorId,
          browserVisualGeneration: actor.visualGenerationId,
          candidateContentFrameId: contentFrameId,
          candidateProjectionSampleId: projectionSampleId,
          clipChainGeneration: actor.clipChainRevision,
          previousContentFrameId: createGpuFlowContentFrameId(
            String(compatiblePreviousProof.previousCommittedFrameId),
          ),
          previousPresentationId: createGpuFlowPresentationId(
            compatiblePreviousProof.previousTransactionId,
          ),
          representationKind:
            getGpuFlowVisibleFramePublicationEngineBrowserRepresentationKind(
              actor,
            ),
          resourceId:
            compatiblePreviousProof.resourceHandles[0]?.id ??
            compatiblePreviousProof.protectedResourceIds[0] ??
            actor.ownerSurfaceId,
          scrollProjectionGeneration:
            compatiblePreviousProof.requestedProjectionSampleRevision,
          semanticGeneration: actor.semanticGenerationId,
          sourceRect: createGpuFlowVisibleFramePublicationEngineRect(
            actor.sourceRect,
          ),
          visibleClip: createGpuFlowVisibleFramePublicationEngineRect(
            actor.clipRect,
          ),
        }),
      }),
      proof: "compatible-previous",
      requirement: "required",
    });
  }
  return Object.freeze({
    ...actorKey,
    generationId: actor.generationId,
    proof: "exact",
    requirement: "required",
  });
}

function createGpuFlowVisibleFramePublicationEngineBlockedProofs({
  blockedProof,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
}): readonly GpuFlowVisibleFrameActorProof[] {
  if (blockedProof === null) {
    return [];
  }
  return Object.freeze(
    blockedProof.blockedReasons.map((reason, index) =>
      createGpuFlowVisibleFramePublicationEngineSyntheticBlockedProof({
        actorId:
          reason.actorId ??
          `blocked:${blockedProof.source}:${reason.family}:${index}`,
        family: mapGpuFlowVisibleFramePublicationEngineActorFamily(
          reason.family,
        ),
        reason: reason.reason,
      }),
    ),
  );
}

function createGpuFlowVisibleFramePublicationEngineSyntheticBlockedProof({
  actorId,
  family,
  reason,
}: GpuFlowVisibleFrameActorKey & {
  readonly reason: string;
}): GpuFlowVisibleFrameActorProof {
  return Object.freeze({
    actorId,
    family,
    proof: "blocked",
    reason,
    requirement: "required",
  });
}

function setGpuFlowVisibleFramePublicationEngineActorProof({
  proof,
  proofByActor,
}: {
  readonly proof: GpuFlowVisibleFrameActorProof;
  readonly proofByActor: Map<string, GpuFlowVisibleFrameActorProof>;
}): void {
  const key = createGpuFlowVisibleFrameActorKey(proof);
  const existingProof = proofByActor.get(key);
  if (existingProof?.proof === "true-hole") {
    return;
  }
  proofByActor.set(key, proof);
}

function createGpuFlowVisibleFramePublicationEnginePreviousPresentation({
  blockedProof,
  candidate,
  previousVisibleProjectionState,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameCommittedPresentation | null {
  const previousProjectionState =
    previousVisibleProjectionState ??
    (selectedVisibleProjectionState?.transaction.kind === "held-previous"
      ? selectedVisibleProjectionState
      : null);
  if (previousProjectionState === null) {
    return null;
  }
  const previousContentFrameId = createGpuFlowContentFrameId(
    String(previousProjectionState.committedFrame.displayFrameId),
  );
  const presentationId = createGpuFlowPresentationId(
    previousProjectionState.transaction?.id ??
      `previous:${previousProjectionState.committedFrame.displayFrameId}`,
  );
  const coverageByActor = new Map<
    string,
    GpuFlowVisibleFrameCommittedActorCoverage
  >();
  for (const actor of previousProjectionState.committedFrame.actorGenerations ??
    []) {
    if (!actor.visibleNonempty) {
      continue;
    }
    const actorKey = createGpuFlowVisibleFramePublicationEngineActorKey(actor);
    const coverage = createGpuFlowVisibleFramePublicationEngineCoverage({
      actor: actorKey,
      candidateContentFrameId: candidate.contentFrameId,
      contentFrameId: previousContentFrameId,
      coversCandidateProjection:
        previousContentFrameId === candidate.contentFrameId,
      presentationId,
    });
    coverageByActor.set(createGpuFlowVisibleFrameActorKey(actorKey), coverage);
  }
  if (
    blockedProof !== null &&
    shouldGpuFlowVisibleFramePublicationEngineUseBlockedFrozenFrameCoverage({
      blockedProof,
      previousVisibleProjectionState: previousProjectionState,
    })
  ) {
    for (const reason of blockedProof.blockedReasons) {
      const actor = Object.freeze({
        actorId:
          reason.actorId ??
          `blocked:${blockedProof.source}:${reason.family}:${reason.reason}`,
        family: mapGpuFlowVisibleFramePublicationEngineActorFamily(
          reason.family,
        ),
      });
      coverageByActor.set(
        createGpuFlowVisibleFrameActorKey(actor),
        createGpuFlowVisibleFramePublicationEngineCoverage({
          actor,
          candidateContentFrameId: candidate.contentFrameId,
          contentFrameId: previousContentFrameId,
          coversCandidateProjection: true,
          presentationId,
        }),
      );
    }
  }
  if (
    blockedProof === null &&
    (selectedVisibleProjectionState === null ||
      selectedVisibleProjectionState.transaction.kind === "held-previous")
  ) {
    const actor = Object.freeze({
      actorId: "visible-frame",
      family: "retained-page" as const,
    });
    coverageByActor.set(
      createGpuFlowVisibleFrameActorKey(actor),
      createGpuFlowVisibleFramePublicationEngineCoverage({
        actor,
        candidateContentFrameId: candidate.contentFrameId,
        contentFrameId: previousContentFrameId,
        coversCandidateProjection: true,
        presentationId,
      }),
    );
  }
  return Object.freeze({
    actorCoverages: Object.freeze([...coverageByActor.values()]),
    contentFrameId: previousContentFrameId,
    presentationId,
  });
}

function createGpuFlowVisibleFramePublicationEngineCoverage({
  actor,
  candidateContentFrameId,
  contentFrameId,
  coversCandidateProjection,
  presentationId,
}: {
  readonly actor: GpuFlowVisibleFrameActorKey;
  readonly candidateContentFrameId: GpuFlowContentFrameId;
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly coversCandidateProjection: boolean;
  readonly presentationId: ReturnType<typeof createGpuFlowPresentationId>;
}): GpuFlowVisibleFrameCommittedActorCoverage {
  return Object.freeze({
    ...actor,
    compatibleContentFrameIds:
      candidateContentFrameId === contentFrameId
        ? Object.freeze([contentFrameId])
        : Object.freeze([candidateContentFrameId]),
    contentFrameId,
    coversCandidateProjection,
    presentationId,
  });
}

function shouldGpuFlowVisibleFramePublicationEngineUseBlockedFrozenFrameCoverage({
  blockedProof,
  previousVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState;
}): boolean {
  return (
    (blockedProof.source === "content-publication" ||
      blockedProof.source === "motion-projection") &&
    blockedProof.frozenFrameId ===
      previousVisibleProjectionState.committedFrame.displayFrameId
  );
}

function createGpuFlowVisibleFramePublicationEngineSample({
  previousVisibleProjectionState,
  publicationDecision,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisibleFrameEngineSample {
  const cssViewport = publicationDecision.sample.cssViewport ?? {
    height: 0,
    width: 0,
  };
  const viewport = normalizeGpuFlowVisibleFramePublicationEngineViewport(
    publicationDecision.sample.viewport,
  );
  return Object.freeze({
    activeGestureOwner:
      publicationDecision.sample.gestureOwner === "idle" ||
      publicationDecision.sample.gestureOwner === "cooldown"
        ? null
        : publicationDecision.sample.gestureOwner,
    canvasSize: Object.freeze({
      height: cssViewport.height,
      width: cssViewport.width,
    }),
    currentCommittedFrameId:
      previousVisibleProjectionState?.committedFrame.displayFrameId ?? null,
    dpr: publicationDecision.sample.devicePixelRatio,
    projectionSampleId: publicationDecision.sample.id,
    queuedDebt: createGpuFlowVisibleFramePublicationEngineDebt({
      blockedProof: null,
      publicationDecision,
    }),
    retainedScrollOffsets: Object.freeze(
      [
        ...(
          publicationDecision.sample.retainedScrollOffsets ?? new Map()
        ).entries(),
      ].map(([actorId, offset]) =>
        Object.freeze({
          actorId,
          scrollLeft: offset.x,
          scrollTop: offset.y,
        }),
      ),
    ),
    sceneGeneration: String(
      previousVisibleProjectionState?.committedFrame.sceneRevision ?? "cold",
    ),
    viewport: Object.freeze({
      height: cssViewport.height,
      width: cssViewport.width,
      x: viewport.x,
      y: viewport.y,
    }),
  });
}

function createGpuFlowVisibleFramePublicationEngineDebt({
  blockedProof,
  publicationDecision,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisibleFrameDebt {
  return Object.freeze({
    browserVisual: Boolean(
      blockedProof?.blockedReasons.some((reason) =>
        isGpuFlowVisibleFramePublicationEngineBrowserVisualDebtFamily(
          reason.family,
        ),
      ),
    ),
    content: publicationDecision.debt.content,
    maintenance: publicationDecision.debt.maintenance,
    motion: publicationDecision.debt.motion,
  });
}

function createGpuFlowVisibleFramePublicationEnginePreparedResourceIds(
  visibleProjectionState: GpuFlowVisibleProjectionState | null,
): readonly string[] {
  if (visibleProjectionState === null) {
    return [];
  }
  return Object.freeze([
    ...(
      visibleProjectionState.committedFrame.surfaceTransaction
        ?.protectedResourceHandles ?? []
    ).map((handle) => handle.id),
    ...visibleProjectionState.committedFrame.actorGenerations.flatMap((actor) =>
      (actor.browserVisual?.resourceHandles ?? []).map((handle) => handle.id),
    ),
  ]);
}

function createGpuFlowVisibleFramePublicationEngineActorKey(
  actor: GpuFlowVisibleFramePublicationEngineActor,
): GpuFlowVisibleFrameActorKey {
  return Object.freeze({
    actorId: actor.actorId,
    family: mapGpuFlowVisibleFramePublicationEngineActorFamily(
      actor.actorFamily,
    ),
  });
}

function mapGpuFlowVisibleFramePublicationEngineActorFamily(
  family: string,
): GpuFlowVisibleFrameActorFamily {
  switch (family) {
    case "dom-island":
      return "dom-island";
    case "gpu-native-visual":
      return "native-visual";
    case "html-texture":
      return "html-texture";
    case "resource-maintenance":
      return "resource-maintenance";
    case "retained-page":
    case "retained-projection":
    case "visible-transaction":
      return "retained-page";
    case "active-editor":
    case "browser-visual":
    case "compatible-previous":
    case "dom-control":
    case "text-like-dom-control":
    default:
      return "browser-visual";
  }
}

function isGpuFlowVisibleFramePublicationEngineBrowserVisualDebtFamily(
  family: string,
): boolean {
  return (
    mapGpuFlowVisibleFramePublicationEngineActorFamily(family) ===
    "browser-visual"
  );
}

function getGpuFlowVisibleFramePublicationEngineBrowserRepresentationKind(
  actor: GpuFlowVisibleFramePublicationEngineActor,
): "active-editor" | "live-dom" | "snapshot" {
  switch (actor.browserVisual?.representationKind) {
    case "active-editor":
      return "active-editor";
    case "passive-snapshot":
      return "snapshot";
    case "blocked":
    case "compatible-previous":
    case "live-host":
    case "passive-live-display":
    case null:
    case undefined:
      return actor.textCoverageProof?.projectionCoverage === "exact-snapshot"
        ? "snapshot"
        : "live-dom";
  }
}

function createGpuFlowVisibleFramePublicationEngineRect(
  rect: GpuFlowVisibleFrameRect | null | undefined,
): GpuFlowVisibleFrameRect {
  if (!rect) {
    return Object.freeze({
      height: 0,
      width: 0,
      x: 0,
      y: 0,
    });
  }
  return Object.freeze({
    height: rect.height,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  });
}

function normalizeGpuFlowVisibleFramePublicationEngineViewport(
  viewport: GpuFlowVisiblePublicationDecision["sample"]["viewport"] | undefined,
): {
  readonly x: number;
  readonly y: number;
} {
  if (viewport === undefined) {
    return {
      x: 0,
      y: 0,
    };
  }
  if (Array.isArray(viewport)) {
    const [x, y] = viewport;
    return {
      x,
      y,
    };
  }
  const normalizedViewport = viewport as {
    readonly x: number;
    readonly y: number;
  };
  return {
    x: normalizedViewport.x,
    y: normalizedViewport.y,
  };
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

function createGpuFlowVisiblePublicationCompatiblePreviousProofReportForFrame({
  committedFrame,
  projectionSampleId,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly projectionSampleId: number | null;
}) {
  const actorGenerations = committedFrame?.actorGenerations ?? [];
  const samples = actorGenerations.flatMap((actor) => {
    const textCoverageProof = actor.textCoverageProof;
    if (textCoverageProof?.projectionCoverage !== "compatible-previous") {
      return [];
    }
    const proof = textCoverageProof.compatiblePreviousProof;
    return [
      {
        actorFamily: actor.actorFamily,
        actorId: actor.actorId,
        budgetState: proof.budgetState,
        canonicalActorId: actor.canonicalActorId,
        clipChainRevision: proof.clipChainRevision,
        hitMappingCompatible: proof.hitMappingCompatible,
        maxProofAgeFrames: proof.maxProofAgeFrames,
        maxProofAgeMs: proof.maxProofAgeMs,
        previousActorGenerationId: proof.previousActorGenerationId,
        previousCommittedFrameId: proof.previousCommittedFrameId,
        previousProjectionSampleRevision:
          proof.previousProjectionSampleRevision,
        previousTransactionId: proof.previousTransactionId,
        previousVisualGenerationId: proof.previousVisualGenerationId,
        proofAgeFrames: proof.proofAgeFrames,
        proofAgeMs: proof.proofAgeMs,
        protectedResourceIds: proof.protectedResourceIds,
        reasonCode: proof.reasonCode,
        requestedActorGenerationId: proof.requestedActorGenerationId,
        requestedLiveProjectionSampleId: projectionSampleId,
        requestedProjectionSampleRevision:
          proof.requestedProjectionSampleRevision,
        requestedVisualGenerationId: proof.requestedVisualGenerationId,
        resourceHandleIds: proof.resourceHandles.map((handle) => handle.id),
        retainedScrollCompatible: proof.retainedScrollCompatible,
      },
    ];
  });
  const overBudgetActorIds = samples
    .filter((sample) => sample.budgetState === "over-budget")
    .map((sample) => sample.actorId);
  return {
    actorCount: samples.length,
    maxObservedProofAgeFrames: maxNumber(
      samples.map((sample) => sample.proofAgeFrames),
    ),
    maxObservedProofAgeMs: maxNumber(
      samples
        .map((sample) => sample.proofAgeMs)
        .filter((ageMs) => ageMs !== null),
    ),
    overBudgetActorIds,
    samples,
  };
}

function createGpuFlowVisiblePublicationBrowserActorProofReportForFrame(
  committedFrame: GpuFlowCommittedSurfaceFrame | null,
) {
  const actorGenerations = committedFrame?.actorGenerations ?? [];
  const proofCounts = {
    actualInteraction: {} as Record<string, number>,
    actualVisual: {} as Record<string, number>,
    actorFamily: {} as Record<string, number>,
    requiredInteraction: {} as Record<string, number>,
    requiredVisual: {} as Record<string, number>,
  };
  const canonicalActorIds = new Set<string>();
  let actorCount = 0;
  for (const actor of actorGenerations) {
    const proof = actor.browserVisual?.proof;
    if (!proof) {
      continue;
    }
    actorCount += 1;
    canonicalActorIds.add(actor.canonicalActorId);
    incrementGpuFlowVisiblePublicationProofCount(
      proofCounts.actualInteraction,
      proof.actualInteraction,
    );
    incrementGpuFlowVisiblePublicationProofCount(
      proofCounts.actualVisual,
      proof.actualVisual,
    );
    incrementGpuFlowVisiblePublicationProofCount(
      proofCounts.actorFamily,
      actor.actorFamily,
    );
    incrementGpuFlowVisiblePublicationProofCount(
      proofCounts.requiredInteraction,
      proof.requiredInteraction,
    );
    incrementGpuFlowVisiblePublicationProofCount(
      proofCounts.requiredVisual,
      proof.requiredVisual,
    );
  }
  return {
    actorCount,
    canonicalActorCount: canonicalActorIds.size,
    ...proofCounts,
  };
}

function incrementGpuFlowVisiblePublicationProofCount(
  counts: Record<string, number>,
  key: string,
): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

function createGpuFlowVisiblePublicationCoverageReportForFrame(
  committedFrame: GpuFlowCommittedSurfaceFrame | null,
) {
  const coverageProof =
    committedFrame?.surfaceTransaction?.coverageProof ?? null;
  if (!coverageProof) {
    return null;
  }
  return {
    blockingGenerationCount: coverageProof.blockingGenerationIds.length,
    blockingSurfaceCount: coverageProof.blockingSurfaceIds.length,
    compatibleCoverageCount: coverageProof.compatibleCoverage.length,
    exactCoverageCount: coverageProof.exactCoverage.length,
    protectedResourceCount: coverageProof.protectedResourceHandles.length,
    rendererBucketCount: coverageProof.rendererBuckets.length,
    trueHoleRectCount: coverageProof.trueHoleRects.length,
    visibleRectCount: coverageProof.visibleRects.length,
    zOrderCount: coverageProof.zOrder.length,
  };
}

function createGpuFlowVisiblePublicationPresentationProofReportForFrame({
  committedFrame,
  presentationEvidence,
  projectionSampleId,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence;
  readonly projectionSampleId: number;
}): GpuFlowVisiblePublicationPresentationProofReport {
  const proof = committedFrame.presentationProof;
  return Object.freeze({
    actorManifestDigest: proof.actorManifestDigest,
    batchId: proof.batchId,
    browserVisualFragmentDigest: proof.browserVisualFragmentDigest,
    canvasGenerationEvidence: Object.freeze({
      ...presentationEvidence.canvasGenerationEvidence,
    }),
    canvasGeneration: Object.freeze({ ...proof.canvasGeneration }),
    domGenerationEvidence: Object.freeze({ ...proof.domGenerationEvidence }),
    domGeneration: Object.freeze({ ...proof.domGeneration }),
    projectionSampleId,
    surfaceTransactionDigest: proof.surfaceTransactionDigest,
  });
}

function maxNumber(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
}
