import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceFrame,
} from "../committedSurfaceFrame";
import type {
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import { createGpuFlowPresentableCommit } from "./visibleFramePublicationAuthority";
import type { GpuFlowVisibleFrameBlockedPublicationCandidate } from "./visibleFramePublicationContentPlan";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowPresentableCommit,
} from "./visibleFramePublicationTokens";

export type GpuFlowVisiblePublicationCommitDebtProof = {
  readonly content: boolean;
  readonly maintenance: boolean;
  readonly motion: boolean;
};

export type GpuFlowVisiblePublicationActorProof = {
  readonly actorId: string;
  readonly actualInteractionProof: string;
  readonly actualVisualProof: string;
  readonly canonicalActorId: string;
  readonly clipChainRevision: string;
  readonly contentGenerationId: string;
  readonly generationClassification: GpuFlowCommittedSurfaceActorGeneration["generationClassification"];
  readonly ownerFamily: string;
  readonly ownerSurfaceId: string;
  readonly projectionGenerationId: string;
  readonly projectionSampleId: number;
  readonly proofState:
    | "blocked"
    | "compatible-previous"
    | "exact"
    | "inactive-visual-only"
    | "not-required";
  readonly remainingDebt: readonly string[];
  readonly requiredInteractionRepresentation: string;
  readonly requiredVisualRepresentation: string;
  readonly sampledVisualEvidence:
    | "blocked"
    | "canvas"
    | "compatible-previous"
    | "exact-live-host"
    | "exact-snapshot"
    | "not-required"
    | "same-live-host-compatible-projection";
};

export type GpuFlowVisiblePublicationActorDebt = {
  readonly actorId: string;
  readonly canonicalActorId: string;
  readonly ownerFamily: string;
  readonly remainingDebt: readonly string[];
};

export type GpuFlowVisiblePublicationCommitOracle = ReturnType<
  typeof createGpuFlowVisiblePublicationCommitOracle
>;

export type GpuFlowVisiblePublicationBlockedProof = {
  readonly blockedReasons: GpuFlowVisibleFrameBlockedPublicationCandidate["blockedReasons"];
  readonly candidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
  readonly frozenFrameId: GpuFlowVisibleFrameBlockedPublicationCandidate["frozenFrameId"];
  readonly source:
    | "browser-visual-proof"
    | "content-publication"
    | "motion-projection";
};

export type GpuFlowVisibleFramePublicationPreparedFrame = {
  readonly blockedPublicationCandidate?: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly blockedProof?: GpuFlowVisiblePublicationBlockedProof | null;
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationContentCandidate = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationMotionCandidate = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
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
  readonly presentableCommit: GpuFlowPresentableCommit | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationTransactionOracle = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly blockedSource: GpuFlowVisiblePublicationBlockedProof["source"] | null;
  readonly commitOracle: GpuFlowVisiblePublicationCommitOracle | null;
  readonly presentableCommit: GpuFlowPresentableCommit | null;
  readonly renderedVisibleFrame: boolean;
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
  readonly presentableCommit: GpuFlowPresentableCommit | null;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
};

export function createGpuFlowVisiblePublicationCommitDebtProof({
  committedFrame,
  publicationDecision,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisiblePublicationCommitDebtProof {
  return createGpuFlowVisiblePublicationCommitOracle({
    committedFrame,
    publicationDecision,
  }).debtProof;
}

export function createGpuFlowVisiblePublicationCommitOracle({
  committedFrame,
  publicationDecision,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}) {
  const actorProofs = createGpuFlowVisiblePublicationActorProofsForFrame({
    committedFrame,
    projectionSampleId: publicationDecision.sample.id,
  });
  assertGpuFlowVisiblePublicationCommitActorProofs(actorProofs);
  const browserActorProofs =
    createGpuFlowVisiblePublicationBrowserActorProofReportForFrame(
      committedFrame,
    );
  const compatiblePreviousProofs =
    createGpuFlowVisiblePublicationCompatiblePreviousProofReportForFrame(
      committedFrame,
    );
  const coverage =
    createGpuFlowVisiblePublicationCoverageReportForFrame(committedFrame);
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
    remainingActorDebt:
      createGpuFlowVisiblePublicationRemainingActorDebt(actorProofs),
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
        createGpuFlowVisiblePublicationCompatiblePreviousProofReportForFrame(
          null,
        ),
      coverage: null,
      remainingActorDebt: [],
    };
  }
  return {
    actorProofDigest: commitOracle.actorProofDigest,
    actorProofs: commitOracle.actorProofs,
    browserActorProofs: commitOracle.browserActorProofs,
    commitOracle: {
      debtProof: commitOracle.debtProof,
      hasCompatiblePreviousCoverage: commitOracle.hasCompatiblePreviousCoverage,
    },
    compatiblePreviousProofs: commitOracle.compatiblePreviousProofs,
    coverage: commitOracle.coverage,
    remainingActorDebt: commitOracle.remainingActorDebt,
  };
}

export function selectGpuFlowVisibleFramePublicationPreparedFrame<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  forcedBlockedPublicationCandidate = null,
  motionProjectionFrame,
  publicationDecision,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisibleFramePublicationPreparedCandidateSet {
  const oracle = createGpuFlowVisibleFramePublicationTransactionOracle({
    contentPublicationFrame,
    forcedBlockedPublicationCandidate,
    motionProjectionFrame,
    publicationDecision,
  });
  return Object.freeze({
    blockedPublicationCandidate: oracle.blockedPublicationCandidate,
    blockedProof: oracle.blockedProof,
    commitOracle: oracle.commitOracle,
    presentableCommit: oracle.presentableCommit,
    renderedVisibleFrame: oracle.renderedVisibleFrame,
    visibleProjectionState: oracle.visibleProjectionState,
  });
}

export function createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
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
    presentableCommit: transactionOracle.presentableCommit,
    renderedVisibleFrame: transactionOracle.renderedVisibleFrame,
    transactionOracle,
    visibleProjectionState: transactionOracle.visibleProjectionState,
  });
}

export function createGpuFlowVisibleFramePublicationTransactionOracle<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  forcedBlockedPublicationCandidate = null,
  motionProjectionFrame,
  publicationDecision,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisibleFramePublicationTransactionOracle {
  const visibleProjectionState =
    resolveGpuFlowVisibleFramePublicationOracleVisibleProjectionState({
      contentPublicationFrame,
      motionProjectionFrame,
    });
  const blockedProof = createGpuFlowVisibleFramePublicationOracleBlockedProof({
    contentPublicationFrame,
    forcedBlockedPublicationCandidate,
    motionProjectionFrame,
  });
  assertGpuFlowVisibleFramePublicationOracleOutcomeCoherent({
    blockedProof,
    visibleProjectionState,
  });
  const commitOracle =
    createGpuFlowVisibleFramePublicationTransactionCommitOracle({
      publicationDecision,
      visibleProjectionState,
    });
  return Object.freeze({
    blockedPublicationCandidate: blockedProof?.candidate ?? null,
    blockedProof,
    blockedSource: blockedProof?.source ?? null,
    commitOracle,
    presentableCommit: createGpuFlowVisibleFramePublicationPresentableCommit({
      commitOracle,
      publicationDecision,
      visibleProjectionState,
    }),
    renderedVisibleFrame: visibleProjectionState !== null,
    visibleProjectionSource:
      createGpuFlowVisibleFramePublicationOracleProjectionSource({
        contentPublicationFrame,
        motionProjectionFrame,
        visibleProjectionState,
      }),
    visibleProjectionState,
  });
}

function createGpuFlowVisibleFramePublicationPresentableCommit({
  commitOracle,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly commitOracle: GpuFlowVisiblePublicationCommitOracle | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowPresentableCommit | null {
  if (
    commitOracle === null ||
    visibleProjectionState === null ||
    visibleProjectionState.transaction.kind === "held-previous"
  ) {
    return null;
  }
  return createGpuFlowPresentableCommit({
    frame: visibleProjectionState.committedFrame,
    projectionSample: publicationDecision.sample,
  });
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

function assertGpuFlowVisibleFramePublicationOracleOutcomeCoherent({
  blockedProof,
  visibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): void {
  if (blockedProof !== null && visibleProjectionState !== null) {
    throw new Error(
      "GPU Flow visible publication oracle cannot combine a blocked proof with a visible projection state.",
    );
  }
}

function createGpuFlowVisibleFramePublicationTransactionCommitOracle({
  publicationDecision,
  visibleProjectionState,
}: {
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisiblePublicationCommitOracle | null {
  if (
    visibleProjectionState === null ||
    visibleProjectionState.transaction.kind === "held-previous"
  ) {
    return null;
  }
  return createGpuFlowVisiblePublicationCommitOracle({
    committedFrame: visibleProjectionState.committedFrame,
    publicationDecision,
  });
}

function createGpuFlowVisiblePublicationActorProofsForFrame({
  committedFrame,
  projectionSampleId,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSampleId: number;
}): readonly GpuFlowVisiblePublicationActorProof[] {
  return Object.freeze(
    committedFrame.actorGenerations
      .filter((actor) => actor.visibleNonempty)
      .map((actor) =>
        createGpuFlowVisiblePublicationActorProof({
          actor,
          projectionSampleId,
        }),
      ),
  );
}

function createGpuFlowVisiblePublicationActorProof({
  actor,
  projectionSampleId,
}: {
  readonly actor: GpuFlowCommittedSurfaceActorGeneration;
  readonly projectionSampleId: number;
}): GpuFlowVisiblePublicationActorProof {
  const requiredVisualRepresentation =
    getGpuFlowVisiblePublicationRequiredVisualRepresentation(actor);
  const actualVisualProof =
    getGpuFlowVisiblePublicationActualVisualProof(actor);
  const requiredInteractionRepresentation =
    getGpuFlowVisiblePublicationRequiredInteractionRepresentation(actor);
  const actualInteractionProof =
    getGpuFlowVisiblePublicationActualInteractionProof(actor);
  const remainingDebt = createGpuFlowVisiblePublicationActorRemainingDebt({
    actualInteractionProof,
    actualVisualProof,
    requiredInteractionRepresentation,
    requiredVisualRepresentation,
  });
  return Object.freeze({
    actorId: actor.actorId,
    actualInteractionProof,
    actualVisualProof,
    canonicalActorId: actor.canonicalActorId,
    clipChainRevision: actor.clipChainRevision,
    contentGenerationId: actor.contentGenerationId,
    generationClassification: actor.generationClassification,
    ownerFamily: actor.actorFamily,
    ownerSurfaceId: actor.ownerSurfaceId,
    projectionGenerationId: actor.layoutProjectionGenerationId,
    projectionSampleId,
    proofState: createGpuFlowVisiblePublicationActorProofState({
      actualInteractionProof,
      actualVisualProof,
      requiredVisualRepresentation,
    }),
    remainingDebt,
    requiredInteractionRepresentation,
    requiredVisualRepresentation,
    sampledVisualEvidence: createGpuFlowVisiblePublicationActorEvidenceState({
      actualVisualProof,
    }),
  });
}

function getGpuFlowVisiblePublicationRequiredVisualRepresentation(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): string {
  return actor.browserVisual?.proof.requiredVisual ?? "canvas-visible";
}

function getGpuFlowVisiblePublicationActualVisualProof(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): string {
  return actor.browserVisual?.proof.actualVisual ?? "exact-canvas";
}

function getGpuFlowVisiblePublicationRequiredInteractionRepresentation(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): string {
  return (
    actor.browserVisual?.proof.requiredInteraction ??
    getGpuFlowVisiblePublicationCanvasInteractionRequirement(actor)
  );
}

function getGpuFlowVisiblePublicationActualInteractionProof(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): string {
  return (
    actor.browserVisual?.proof.actualInteraction ??
    getGpuFlowVisiblePublicationCanvasInteractionProof(actor)
  );
}

function getGpuFlowVisiblePublicationCanvasInteractionRequirement(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): string {
  return actor.pointerEvents === "auto" ? "canvas-hit" : "none";
}

function getGpuFlowVisiblePublicationCanvasInteractionProof(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): string {
  return actor.pointerEvents === "auto" ? "canvas-hit" : "not-required";
}

function createGpuFlowVisiblePublicationActorProofState({
  actualInteractionProof,
  actualVisualProof,
  requiredVisualRepresentation,
}: {
  readonly actualInteractionProof: string;
  readonly actualVisualProof: string;
  readonly requiredVisualRepresentation: string;
}): GpuFlowVisiblePublicationActorProof["proofState"] {
  if (actualVisualProof === "blocked" || actualInteractionProof === "blocked") {
    return "blocked";
  }
  if (actualVisualProof === "compatible-previous") {
    return "compatible-previous";
  }
  if (actualInteractionProof === "inactive-visual-only") {
    return "inactive-visual-only";
  }
  if (requiredVisualRepresentation === "none") {
    return "not-required";
  }
  return "exact";
}

function createGpuFlowVisiblePublicationActorRemainingDebt({
  actualInteractionProof,
  actualVisualProof,
  requiredInteractionRepresentation,
  requiredVisualRepresentation,
}: {
  readonly actualInteractionProof: string;
  readonly actualVisualProof: string;
  readonly requiredInteractionRepresentation: string;
  readonly requiredVisualRepresentation: string;
}): readonly string[] {
  const debt = new Set<string>();
  if (
    requiredVisualRepresentation !== "none" &&
    actualVisualProof === "blocked"
  ) {
    debt.add("browser-visual");
  }
  if (actualVisualProof === "compatible-previous") {
    debt.add("exact-browser-visual");
  }
  if (
    requiredInteractionRepresentation !== "none" &&
    actualInteractionProof === "blocked"
  ) {
    debt.add(
      requiredInteractionRepresentation === "active-editor-live"
        ? "active-editor"
        : "browser-interaction",
    );
  }
  return Object.freeze([...debt]);
}

function createGpuFlowVisiblePublicationActorEvidenceState({
  actualVisualProof,
}: {
  readonly actualVisualProof: string;
}): GpuFlowVisiblePublicationActorProof["sampledVisualEvidence"] {
  switch (actualVisualProof) {
    case "blocked":
      return "blocked";
    case "compatible-previous":
      return "compatible-previous";
    case "exact-live-host":
      return "exact-live-host";
    case "exact-snapshot":
      return "exact-snapshot";
    case "same-live-host-compatible-projection":
      return "same-live-host-compatible-projection";
    case "not-required":
      return "not-required";
    default:
      return "canvas";
  }
}

function createGpuFlowVisiblePublicationActorProofDigest(
  actorProofs: readonly GpuFlowVisiblePublicationActorProof[],
): string {
  return JSON.stringify(
    actorProofs.map((proof) => [
      proof.canonicalActorId,
      proof.contentGenerationId,
      proof.projectionGenerationId,
      proof.requiredVisualRepresentation,
      proof.actualVisualProof,
      proof.requiredInteractionRepresentation,
      proof.actualInteractionProof,
      proof.proofState,
      proof.remainingDebt,
    ]),
  );
}

function createGpuFlowVisiblePublicationRemainingActorDebt(
  actorProofs: readonly GpuFlowVisiblePublicationActorProof[],
): readonly GpuFlowVisiblePublicationActorDebt[] {
  return Object.freeze(
    actorProofs
      .filter((proof) => proof.remainingDebt.length > 0)
      .map((proof) =>
        Object.freeze({
          actorId: proof.actorId,
          canonicalActorId: proof.canonicalActorId,
          ownerFamily: proof.ownerFamily,
          remainingDebt: proof.remainingDebt,
        }),
      ),
  );
}

function assertGpuFlowVisiblePublicationCommitActorProofs(
  actorProofs: readonly GpuFlowVisiblePublicationActorProof[],
): void {
  const blockedProofs = actorProofs.filter(
    (proof) => proof.proofState === "blocked",
  );
  if (blockedProofs.length === 0) {
    return;
  }
  throw new Error(
    `GPU Flow visible publication oracle cannot commit blocked actor proofs: ${blockedProofs
      .map((proof) =>
        [
          proof.actorId,
          proof.actualVisualProof,
          proof.actualInteractionProof,
        ].join(":"),
      )
      .join(", ")}.`,
  );
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

function createGpuFlowVisiblePublicationCompatiblePreviousProofReportForFrame(
  committedFrame: GpuFlowCommittedSurfaceFrame | null,
) {
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
        hitMappingCompatible: proof.hitMappingCompatible,
        maxProofAgeFrames: proof.maxProofAgeFrames,
        maxProofAgeMs: proof.maxProofAgeMs,
        previousCommittedFrameId: proof.previousCommittedFrameId,
        previousProjectionSampleRevision:
          proof.previousProjectionSampleRevision,
        proofAgeFrames: proof.proofAgeFrames,
        proofAgeMs: proof.proofAgeMs,
        protectedResourceIds: proof.protectedResourceIds,
        reasonCode: proof.reasonCode,
        requestedProjectionSampleRevision:
          proof.requestedProjectionSampleRevision,
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

function maxNumber(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
}
