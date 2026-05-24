import type {
  GpuFlowCommittedSurfaceActorGeneration,
  GpuFlowCommittedSurfaceFrame,
} from "../../committedSurfaceFrame";
import type { BrowserTextActorRepresentation } from "../../surfaceCompositor/browserVisualActorAdapter";
import type { GpuFlowBlockedVisibleReason } from "../visibleFramePresentationProofs";

type GpuFlowCompatiblePreviousBudgetState =
  | "over-budget"
  | "within-budget"
  | null;

type GpuFlowVisiblePublicationActorProof = {
  readonly actorId: string;
  readonly actualInteractionProof: string;
  readonly actualVisualProof: string;
  readonly browserVisualRepresentation: BrowserTextActorRepresentation | null;
  readonly canonicalActorId: string;
  readonly clipChainRevision: string;
  readonly compatiblePreviousBudgetState: GpuFlowCompatiblePreviousBudgetState;
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

type GpuFlowVisiblePublicationActorDebt = {
  readonly actorId: string;
  readonly canonicalActorId: string;
  readonly ownerFamily: string;
  readonly remainingDebt: readonly string[];
};

export function createGpuFlowVisiblePublicationActorProofsForFrame({
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

export function createGpuFlowVisiblePublicationActorProofDigest(
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
      proof.browserVisualRepresentation,
      proof.compatiblePreviousBudgetState,
      proof.proofState,
      proof.remainingDebt,
    ]),
  );
}

export function createGpuFlowVisiblePublicationBlockedActorReasonsForFrame({
  committedFrame,
  projectionSampleId,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly projectionSampleId: number;
}): readonly GpuFlowBlockedVisibleReason[] {
  return Object.freeze(
    createGpuFlowVisiblePublicationActorProofsForFrame({
      committedFrame,
      projectionSampleId,
    }).flatMap(createGpuFlowVisiblePublicationBlockedActorReasons),
  );
}

export function createGpuFlowVisiblePublicationRemainingActorDebt(
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

export function assertGpuFlowVisiblePublicationCommitActorProofs(
  actorProofs: readonly GpuFlowVisiblePublicationActorProof[],
): void {
  const blockedProofs = actorProofs.filter(
    (proof) => proof.proofState === "blocked",
  );
  if (blockedProofs.length > 0) {
    throw new Error(
      `GPU Flow visible publication proof cannot commit blocked actor proofs: ${blockedProofs
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
  const representationMismatches = actorProofs.flatMap((proof) => {
    const mismatch =
      getGpuFlowVisiblePublicationActorRepresentationMismatch(proof);
    return mismatch === null ? [] : [mismatch];
  });
  if (representationMismatches.length === 0) {
    return;
  }
  throw new Error(
    `GPU Flow visible publication proof cannot commit actor proofs with mismatched browser visual representation: ${representationMismatches.join(
      ", ",
    )}.`,
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
  const compatiblePreviousBudgetState =
    getGpuFlowVisiblePublicationCompatiblePreviousBudgetState(actor);
  const remainingDebt = createGpuFlowVisiblePublicationActorRemainingDebt({
    actualInteractionProof,
    actualVisualProof,
    compatiblePreviousBudgetState,
    requiredInteractionRepresentation,
    requiredVisualRepresentation,
  });
  return Object.freeze({
    actorId: actor.actorId,
    actualInteractionProof,
    actualVisualProof,
    browserVisualRepresentation:
      createGpuFlowVisiblePublicationBrowserVisualRepresentation(actor),
    canonicalActorId: actor.canonicalActorId,
    clipChainRevision: actor.clipChainRevision,
    compatiblePreviousBudgetState,
    contentGenerationId: actor.contentGenerationId,
    generationClassification: actor.generationClassification,
    ownerFamily: actor.actorFamily,
    ownerSurfaceId: actor.ownerSurfaceId,
    projectionGenerationId: actor.layoutProjectionGenerationId,
    projectionSampleId,
    proofState: createGpuFlowVisiblePublicationActorProofState({
      actualInteractionProof,
      actualVisualProof,
      compatiblePreviousBudgetState,
      requiredInteractionRepresentation,
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

function createGpuFlowVisiblePublicationBrowserVisualRepresentation(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): BrowserTextActorRepresentation | null {
  const representation = actor.browserVisual?.representation ?? null;
  return representation === null ? null : Object.freeze({ ...representation });
}

function getGpuFlowVisiblePublicationActorRepresentationMismatch(
  proof: GpuFlowVisiblePublicationActorProof,
): string | null {
  const representation = proof.browserVisualRepresentation;
  if (representation && representation.actorId !== proof.actorId) {
    return `${proof.actorId}:${proof.actualVisualProof}:actor-id-mismatch`;
  }
  return getGpuFlowVisiblePublicationActorVisualRepresentationMismatch(proof);
}

function getGpuFlowVisiblePublicationActorVisualRepresentationMismatch(
  proof: GpuFlowVisiblePublicationActorProof,
): string | null {
  switch (proof.actualVisualProof) {
    case "compatible-previous":
      return getGpuFlowCompatiblePreviousRepresentationMismatch(proof);
    case "exact-snapshot":
      return getGpuFlowExactSnapshotRepresentationMismatch(proof);
    case "same-live-host-compatible-projection":
      return getGpuFlowSameLiveHostRepresentationMismatch(proof);
    case "exact-live-host":
      return getGpuFlowExactLiveHostRepresentationMismatch(proof);
    case "blocked":
    case "not-required":
    default:
      return null;
  }
}

function getGpuFlowCompatiblePreviousRepresentationMismatch(
  proof: GpuFlowVisiblePublicationActorProof,
): string | null {
  return proof.browserVisualRepresentation?.kind === "compatible-previous"
    ? null
    : `${proof.actorId}:compatible-previous:previous-transaction-identity-required`;
}

function getGpuFlowExactSnapshotRepresentationMismatch(
  proof: GpuFlowVisiblePublicationActorProof,
): string | null {
  if (proof.ownerFamily !== "text-like-dom-control") {
    return null;
  }
  return proof.browserVisualRepresentation?.kind === "passive-snapshot"
    ? null
    : `${proof.actorId}:exact-snapshot:snapshot-identity-required`;
}

function getGpuFlowSameLiveHostRepresentationMismatch(
  proof: GpuFlowVisiblePublicationActorProof,
): string | null {
  return isGpuFlowVisiblePublicationLiveHostRepresentation(
    proof.browserVisualRepresentation,
  )
    ? null
    : `${proof.actorId}:same-live-host-compatible-projection:live-host-identity-required`;
}

function getGpuFlowExactLiveHostRepresentationMismatch(
  proof: GpuFlowVisiblePublicationActorProof,
): string | null {
  if (proof.requiredInteractionRepresentation !== "active-editor-live") {
    return null;
  }
  return proof.browserVisualRepresentation?.kind === "active-editor"
    ? null
    : `${proof.actorId}:exact-live-host:active-editor-host-identity-required`;
}

function isGpuFlowVisiblePublicationLiveHostRepresentation(
  representation: BrowserTextActorRepresentation | null,
): boolean {
  return (
    representation?.kind === "active-editor" ||
    representation?.kind === "passive-live-display"
  );
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

function getGpuFlowVisiblePublicationCompatiblePreviousBudgetState(
  actor: GpuFlowCommittedSurfaceActorGeneration,
): GpuFlowCompatiblePreviousBudgetState {
  const textCoverageProof = actor.textCoverageProof;
  if (textCoverageProof?.projectionCoverage !== "compatible-previous") {
    return null;
  }
  return textCoverageProof.compatiblePreviousProof.budgetState;
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
  compatiblePreviousBudgetState,
  requiredInteractionRepresentation,
  requiredVisualRepresentation,
}: {
  readonly actualInteractionProof: string;
  readonly actualVisualProof: string;
  readonly compatiblePreviousBudgetState: GpuFlowCompatiblePreviousBudgetState;
  readonly requiredInteractionRepresentation: string;
  readonly requiredVisualRepresentation: string;
}): GpuFlowVisiblePublicationActorProof["proofState"] {
  if (
    isGpuFlowBlockingRequiredBrowserVisualProof({
      actualVisualProof,
      requiredInteractionRepresentation,
    }) ||
    isGpuFlowBlockingRequiredBrowserInteractionProof({
      actualInteractionProof,
      requiredInteractionRepresentation,
    }) ||
    compatiblePreviousBudgetState === "over-budget" ||
    isGpuFlowActiveEditorCompatiblePreviousProofBlocked({
      actualVisualProof,
      requiredInteractionRepresentation,
    })
  ) {
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

function isGpuFlowBlockingRequiredBrowserVisualProof({
  actualVisualProof,
  requiredInteractionRepresentation,
}: {
  readonly actualVisualProof: string;
  readonly requiredInteractionRepresentation: string;
}): boolean {
  return (
    actualVisualProof === "blocked" &&
    requiredInteractionRepresentation === "active-editor-live"
  );
}

function isGpuFlowBlockingRequiredBrowserInteractionProof({
  actualInteractionProof,
  requiredInteractionRepresentation,
}: {
  readonly actualInteractionProof: string;
  readonly requiredInteractionRepresentation: string;
}): boolean {
  return (
    actualInteractionProof === "blocked" &&
    requiredInteractionRepresentation === "active-editor-live"
  );
}

function isGpuFlowActiveEditorCompatiblePreviousProofBlocked({
  actualVisualProof,
  requiredInteractionRepresentation,
}: {
  readonly actualVisualProof: string;
  readonly requiredInteractionRepresentation: string;
}): boolean {
  return (
    requiredInteractionRepresentation === "active-editor-live" &&
    actualVisualProof === "compatible-previous"
  );
}

function createGpuFlowVisiblePublicationActorRemainingDebt({
  actualInteractionProof,
  actualVisualProof,
  compatiblePreviousBudgetState,
  requiredInteractionRepresentation,
  requiredVisualRepresentation,
}: {
  readonly actualInteractionProof: string;
  readonly actualVisualProof: string;
  readonly compatiblePreviousBudgetState: GpuFlowCompatiblePreviousBudgetState;
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
  if (compatiblePreviousBudgetState === "over-budget") {
    debt.add("compatible-previous-budget");
  }
  if (
    isGpuFlowActiveEditorCompatiblePreviousProofBlocked({
      actualVisualProof,
      requiredInteractionRepresentation,
    })
  ) {
    debt.add("active-editor");
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

function createGpuFlowVisiblePublicationBlockedActorReasons(
  proof: GpuFlowVisiblePublicationActorProof,
): readonly GpuFlowBlockedVisibleReason[] {
  if (proof.proofState === "blocked") {
    return [createGpuFlowVisiblePublicationBlockedActorReason(proof)];
  }
  const representationMismatch =
    getGpuFlowVisiblePublicationActorRepresentationMismatch(proof);
  return representationMismatch === null
    ? []
    : [
        Object.freeze({
          actorId: proof.actorId,
          family:
            proof.requiredInteractionRepresentation === "active-editor-live"
              ? "active-editor"
              : "browser-visual",
          reason: representationMismatch,
        }),
      ];
}

function createGpuFlowVisiblePublicationBlockedActorReason(
  proof: GpuFlowVisiblePublicationActorProof,
): GpuFlowBlockedVisibleReason {
  if (proof.compatiblePreviousBudgetState === "over-budget") {
    return Object.freeze({
      actorId: proof.actorId,
      family: "compatible-previous",
      reason: "compatible-previous-budget-exceeded",
    });
  }
  if (
    isGpuFlowActiveEditorCompatiblePreviousProofBlocked({
      actualVisualProof: proof.actualVisualProof,
      requiredInteractionRepresentation:
        proof.requiredInteractionRepresentation,
    })
  ) {
    return Object.freeze({
      actorId: proof.actorId,
      family: "active-editor",
      reason: "active-editor-live-proof-required",
    });
  }
  if (proof.actualInteractionProof === "blocked") {
    return Object.freeze({
      actorId: proof.actorId,
      family:
        proof.requiredInteractionRepresentation === "active-editor-live"
          ? "active-editor"
          : "browser-interaction",
      reason: "interaction-proof-blocked",
    });
  }
  return Object.freeze({
    actorId: proof.actorId,
    family: proof.ownerFamily,
    reason: "visual-proof-blocked",
  });
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
