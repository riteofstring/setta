// Adapts transaction proof state into the visible frame state machine's proof model.
import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type {
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import {
  getGpuFlowBrowserStyleBlockedReasonFamily,
  getGpuFlowBrowserStyleVisibleFrameActorFamily,
  type GpuFlowBrowserStyleVisibleFrameActorFamily,
} from "./visibleFrameActorRegistry";
import type {
  GpuFlowVisibleFramePreparedFrame,
  GpuFlowVisibleFrameStateMachineSample,
} from "./visibleFrameStateMachine";
import type { GpuFlowVisiblePublicationBlockedProof } from "./visibleFrameTransactionProofs";
import {
  createGpuFlowContentFrameId,
  createGpuFlowPresentationId,
  createGpuFlowVisibleFrameActorKey,
  type GpuFlowContentFrameId,
  type GpuFlowProjectionSampleId,
  type GpuFlowVisibleFrameActorKey,
  type GpuFlowVisibleFrameActorProof,
  type GpuFlowVisibleFrameCandidate,
  type GpuFlowVisibleFrameCommittedActorCoverage,
  type GpuFlowVisibleFrameCommittedPresentation,
  type GpuFlowVisibleFrameDebt,
  type GpuFlowVisibleFrameRect,
} from "./visibleFrameTypes";

type GpuFlowVisibleFramePublicationStateMachineActor =
  GpuFlowCommittedSurfaceFrame["actorGenerations"][number];

type GpuFlowVisibleFramePublicationStateMachineBrowserRepresentationKind =
  | "active-editor"
  | "live-dom"
  | "snapshot";

type GpuFlowVisibleFramePublicationStateMachineBrowserActorFamily = Extract<
  GpuFlowBrowserStyleVisibleFrameActorFamily,
  "active-editor" | "browser-text-control" | "browser-text-snapshot"
>;

export function createGpuFlowVisibleFramePublicationStateMachinePreparedFrame({
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
  const candidate = createGpuFlowVisibleFramePublicationStateMachineCandidate({
    blockedProof,
    candidateVisibleProjectionState,
    previousVisibleProjectionState,
    publicationDecision,
    selectedVisibleProjectionState,
  });
  return Object.freeze({
    candidate,
    previousPresentation:
      createGpuFlowVisibleFramePublicationStateMachinePreviousPresentation({
        blockedProof,
        candidate,
        previousVisibleProjectionState,
        selectedVisibleProjectionState,
      }),
    sample: createGpuFlowVisibleFramePublicationStateMachineSample({
      previousVisibleProjectionState,
      publicationDecision,
    }),
  });
}

function createGpuFlowVisibleFramePublicationStateMachineCandidate({
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
    createGpuFlowVisibleFramePublicationStateMachineContentFrameId({
      blockedProof,
      candidateVisibleProjectionState,
      previousVisibleProjectionState,
      publicationDecision,
      selectedVisibleProjectionState,
    });
  const projectionSampleId = publicationDecision.sample.id;
  const actorProofs =
    createGpuFlowVisibleFramePublicationStateMachineActorProofs({
      blockedProof,
      candidateVisibleProjectionState,
      contentFrameId,
      projectionSampleId,
      selectedVisibleProjectionState,
    });
  return Object.freeze({
    actorProofs,
    contentFrameId,
    preparedResourceIds:
      createGpuFlowVisibleFramePublicationStateMachinePreparedResourceIds(
        candidateVisibleProjectionState,
      ),
    projectionSampleId,
    queuedDebt: createGpuFlowVisibleFramePublicationStateMachineDebt({
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

function createGpuFlowVisibleFramePublicationStateMachineActorProofs({
  blockedProof,
  candidateVisibleProjectionState,
  contentFrameId,
  projectionSampleId,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): readonly GpuFlowVisibleFrameActorProof[] {
  const proofByActor = new Map<string, GpuFlowVisibleFrameActorProof>();
  addGpuFlowVisibleFramePublicationStateMachineCandidateActorProofs({
    candidateVisibleProjectionState,
    contentFrameId,
    projectionSampleId,
    proofByActor,
  });
  addGpuFlowVisibleFramePublicationStateMachineBlockedProofs({
    blockedProof,
    proofByActor,
  });
  addGpuFlowVisibleFramePublicationStateMachineSyntheticFrameProof({
    blockedProof,
    proofByActor,
    selectedVisibleProjectionState,
  });
  return Object.freeze([...proofByActor.values()]);
}

function addGpuFlowVisibleFramePublicationStateMachineCandidateActorProofs({
  candidateVisibleProjectionState,
  contentFrameId,
  projectionSampleId,
  proofByActor,
}: {
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
  readonly proofByActor: Map<string, GpuFlowVisibleFrameActorProof>;
}): void {
  for (const actor of candidateVisibleProjectionState?.committedFrame
    .actorGenerations ?? []) {
    if (!actor.visibleNonempty) {
      continue;
    }
    setGpuFlowVisibleFramePublicationStateMachineActorProof({
      proof: createGpuFlowVisibleFramePublicationStateMachineActorProof({
        actor,
        contentFrameId,
        projectionSampleId,
      }),
      proofByActor,
    });
  }
}

function addGpuFlowVisibleFramePublicationStateMachineBlockedProofs({
  blockedProof,
  proofByActor,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly proofByActor: Map<string, GpuFlowVisibleFrameActorProof>;
}): void {
  for (const proof of createGpuFlowVisibleFramePublicationStateMachineBlockedProofs(
    {
      blockedProof,
    },
  )) {
    setGpuFlowVisibleFramePublicationStateMachineActorProof({
      proof,
      proofByActor,
    });
  }
}

function addGpuFlowVisibleFramePublicationStateMachineSyntheticFrameProof({
  blockedProof,
  proofByActor,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly proofByActor: Map<string, GpuFlowVisibleFrameActorProof>;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): void {
  const proof =
    createGpuFlowVisibleFramePublicationStateMachineSyntheticFrameProof({
      blockedProof,
      selectedVisibleProjectionState,
    });
  if (proof === null) {
    return;
  }
  setGpuFlowVisibleFramePublicationStateMachineActorProof({
    proof,
    proofByActor,
  });
}

function createGpuFlowVisibleFramePublicationStateMachineSyntheticFrameProof({
  blockedProof,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameActorProof | null {
  if (
    selectedVisibleProjectionState?.transaction.kind !== "held-previous" &&
    (selectedVisibleProjectionState !== null || blockedProof !== null)
  ) {
    return null;
  }
  return createGpuFlowVisibleFramePublicationStateMachineSyntheticBlockedProof({
    actorId: "visible-frame",
    family: "retained-page",
    reason:
      selectedVisibleProjectionState?.transaction.kind === "held-previous"
        ? getGpuFlowVisibleFramePublicationStateMachineHeldPreviousReason(
            selectedVisibleProjectionState,
          )
        : "no-visible-frame",
  });
}

function getGpuFlowVisibleFramePublicationStateMachineHeldPreviousReason(
  visibleProjectionState: GpuFlowVisibleProjectionState,
): string {
  const heldPreviousProjection = visibleProjectionState.heldPreviousProjection;
  return heldPreviousProjection?.maxHeldPreviousFramesExceeded ||
    heldPreviousProjection?.maxHeldPreviousMsExceeded
    ? "held-previous-budget-exceeded"
    : "held-previous";
}

function createGpuFlowVisibleFramePublicationStateMachineContentFrameId({
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

function createGpuFlowVisibleFramePublicationStateMachineActorProof({
  actor,
  contentFrameId,
  projectionSampleId,
}: {
  readonly actor: GpuFlowVisibleFramePublicationStateMachineActor;
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): GpuFlowVisibleFrameActorProof {
  const actorKey =
    createGpuFlowVisibleFramePublicationStateMachineActorKey(actor);
  const textCoverage = actor.textCoverageProof;
  switch (textCoverage?.projectionCoverage) {
    case "true-hole":
      return Object.freeze({
        ...actorKey,
        proof: "true-hole",
        reason: textCoverage.readinessReason,
        requirement: "required",
        trueHoleCount: 1,
      });
    case "blocked-awaiting-browser-visual":
    case "blocked-awaiting-live-host":
      return Object.freeze({
        ...actorKey,
        proof: "blocked",
        reason: textCoverage.readinessReason,
        requirement:
          getGpuFlowVisibleFramePublicationStateMachineBlockedTextRequirement(
            actorKey,
          ),
      });
    case "compatible-previous":
      return createGpuFlowVisibleFramePublicationStateMachineCompatiblePreviousProof(
        {
          actor,
          actorKey,
          contentFrameId,
          projectionSampleId,
        },
      );
    case "exact-live-dom":
    case "exact-snapshot":
    case undefined:
      return createGpuFlowVisibleFramePublicationStateMachineExactActorProof({
        actor,
        actorKey,
      });
  }
}

function getGpuFlowVisibleFramePublicationStateMachineBlockedTextRequirement(
  actorKey: GpuFlowVisibleFrameActorKey,
): GpuFlowVisibleFrameActorProof["requirement"] {
  return actorKey.family === "active-editor" ? "required" : "maintenance";
}

function createGpuFlowVisibleFramePublicationStateMachineExactActorProof({
  actor,
  actorKey,
}: {
  readonly actor: GpuFlowVisibleFramePublicationStateMachineActor;
  readonly actorKey: GpuFlowVisibleFrameActorKey;
}): GpuFlowVisibleFrameActorProof {
  return Object.freeze({
    ...actorKey,
    generationId: actor.generationId,
    proof: "exact",
    requirement: "required",
  });
}

function createGpuFlowVisibleFramePublicationStateMachineCompatiblePreviousProof({
  actor,
  actorKey,
  contentFrameId,
  projectionSampleId,
}: {
  readonly actor: GpuFlowVisibleFramePublicationStateMachineActor;
  readonly actorKey: GpuFlowVisibleFrameActorKey;
  readonly contentFrameId: GpuFlowContentFrameId;
  readonly projectionSampleId: GpuFlowProjectionSampleId;
}): GpuFlowVisibleFrameActorProof {
  const compatiblePreviousProof =
    actor.textCoverageProof?.projectionCoverage === "compatible-previous"
      ? actor.textCoverageProof.compatiblePreviousProof
      : null;
  if (compatiblePreviousProof === null) {
    throw new Error(
      "GPU Flow compatible-previous state machine proof requires compatible-previous text coverage.",
    );
  }
  return Object.freeze({
    ...actorKey,
    compatiblePreviousProof: Object.freeze({
      family:
        assertGpuFlowVisibleFramePublicationStateMachineBrowserActorFamily(
          actorKey,
        ),
      proof: Object.freeze({
        activeEditorState:
          getGpuFlowVisibleFramePublicationStateMachineBrowserRepresentationKind(
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
          getGpuFlowVisibleFramePublicationStateMachineBrowserRepresentationKind(
            actor,
          ),
        resourceId:
          compatiblePreviousProof.resourceHandles[0]?.id ??
          compatiblePreviousProof.protectedResourceIds[0] ??
          actor.ownerSurfaceId,
        scrollProjectionGeneration:
          compatiblePreviousProof.requestedProjectionSampleRevision,
        semanticGeneration: actor.semanticGenerationId,
        sourceRect: createGpuFlowVisibleFramePublicationStateMachineRect(
          actor.sourceRect,
        ),
        visibleClip: createGpuFlowVisibleFramePublicationStateMachineRect(
          actor.clipRect,
        ),
      }),
    }),
    proof: "compatible-previous",
    requirement: "required",
  });
}

function createGpuFlowVisibleFramePublicationStateMachineBlockedProofs({
  blockedProof,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
}): readonly GpuFlowVisibleFrameActorProof[] {
  if (blockedProof === null) {
    return [];
  }
  return Object.freeze(
    blockedProof.blockedReasons.map((reason, index) =>
      createGpuFlowVisibleFramePublicationStateMachineSyntheticBlockedProof({
        actorId:
          reason.actorId ??
          `blocked:${blockedProof.source}:${reason.family}:${index}`,
        family: getGpuFlowBrowserStyleBlockedReasonFamily(reason),
        reason: reason.reason,
      }),
    ),
  );
}

function createGpuFlowVisibleFramePublicationStateMachineSyntheticBlockedProof({
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

function setGpuFlowVisibleFramePublicationStateMachineActorProof({
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

function createGpuFlowVisibleFramePublicationStateMachinePreviousPresentation({
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
  addGpuFlowVisibleFramePublicationStateMachinePreviousActorCoverage({
    candidate,
    coverageByActor,
    presentationId,
    previousContentFrameId,
    previousProjectionState,
  });
  addGpuFlowVisibleFramePublicationStateMachineBlockedFrozenCoverage({
    blockedProof,
    candidate,
    coverageByActor,
    presentationId,
    previousContentFrameId,
    previousProjectionState,
  });
  addGpuFlowVisibleFramePublicationStateMachineSyntheticPreviousCoverage({
    blockedProof,
    candidate,
    coverageByActor,
    presentationId,
    previousContentFrameId,
    selectedVisibleProjectionState,
  });
  return Object.freeze({
    actorCoverages: Object.freeze([...coverageByActor.values()]),
    contentFrameId: previousContentFrameId,
    presentationId,
  });
}

function addGpuFlowVisibleFramePublicationStateMachinePreviousActorCoverage({
  candidate,
  coverageByActor,
  presentationId,
  previousContentFrameId,
  previousProjectionState,
}: {
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly coverageByActor: Map<
    string,
    GpuFlowVisibleFrameCommittedActorCoverage
  >;
  readonly presentationId: ReturnType<typeof createGpuFlowPresentationId>;
  readonly previousContentFrameId: GpuFlowContentFrameId;
  readonly previousProjectionState: GpuFlowVisibleProjectionState;
}): void {
  for (const actor of previousProjectionState.committedFrame.actorGenerations ??
    []) {
    if (!actor.visibleNonempty) {
      continue;
    }
    const actorKey =
      createGpuFlowVisibleFramePublicationStateMachineActorKey(actor);
    const coverage = createGpuFlowVisibleFramePublicationStateMachineCoverage({
      actor: actorKey,
      candidateContentFrameId: candidate.contentFrameId,
      contentFrameId: previousContentFrameId,
      coversCandidateProjection:
        previousContentFrameId === candidate.contentFrameId,
      presentationId,
    });
    coverageByActor.set(createGpuFlowVisibleFrameActorKey(actorKey), coverage);
  }
}

function addGpuFlowVisibleFramePublicationStateMachineBlockedFrozenCoverage({
  blockedProof,
  candidate,
  coverageByActor,
  presentationId,
  previousContentFrameId,
  previousProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly coverageByActor: Map<
    string,
    GpuFlowVisibleFrameCommittedActorCoverage
  >;
  readonly presentationId: ReturnType<typeof createGpuFlowPresentationId>;
  readonly previousContentFrameId: GpuFlowContentFrameId;
  readonly previousProjectionState: GpuFlowVisibleProjectionState;
}): void {
  if (
    blockedProof === null ||
    !shouldGpuFlowVisibleFramePublicationStateMachineUseBlockedFrozenFrameCoverage(
      {
        blockedProof,
        previousVisibleProjectionState: previousProjectionState,
      },
    )
  ) {
    return;
  }
  for (const reason of blockedProof.blockedReasons) {
    const actor = Object.freeze({
      actorId:
        reason.actorId ??
        `blocked:${blockedProof.source}:${reason.family}:${reason.reason}`,
      family: getGpuFlowBrowserStyleBlockedReasonFamily(reason),
    });
    coverageByActor.set(
      createGpuFlowVisibleFrameActorKey(actor),
      createGpuFlowVisibleFramePublicationStateMachineCoverage({
        actor,
        candidateContentFrameId: candidate.contentFrameId,
        contentFrameId: previousContentFrameId,
        coversCandidateProjection: true,
        presentationId,
      }),
    );
  }
}

function addGpuFlowVisibleFramePublicationStateMachineSyntheticPreviousCoverage({
  blockedProof,
  candidate,
  coverageByActor,
  presentationId,
  previousContentFrameId,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidate: GpuFlowVisibleFrameCandidate;
  readonly coverageByActor: Map<
    string,
    GpuFlowVisibleFrameCommittedActorCoverage
  >;
  readonly presentationId: ReturnType<typeof createGpuFlowPresentationId>;
  readonly previousContentFrameId: GpuFlowContentFrameId;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): void {
  if (
    blockedProof !== null ||
    (selectedVisibleProjectionState !== null &&
      selectedVisibleProjectionState.transaction.kind !== "held-previous")
  ) {
    return;
  }
  const actor = Object.freeze({
    actorId: "visible-frame",
    family: "retained-page" as const,
  });
  coverageByActor.set(
    createGpuFlowVisibleFrameActorKey(actor),
    createGpuFlowVisibleFramePublicationStateMachineCoverage({
      actor,
      candidateContentFrameId: candidate.contentFrameId,
      contentFrameId: previousContentFrameId,
      coversCandidateProjection: true,
      presentationId,
    }),
  );
}

function createGpuFlowVisibleFramePublicationStateMachineCoverage({
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

function shouldGpuFlowVisibleFramePublicationStateMachineUseBlockedFrozenFrameCoverage({
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

function createGpuFlowVisibleFramePublicationStateMachineSample({
  previousVisibleProjectionState,
  publicationDecision,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisibleFrameStateMachineSample {
  const cssViewport = publicationDecision.sample.cssViewport ?? {
    height: 0,
    width: 0,
  };
  const viewport = normalizeGpuFlowVisibleFramePublicationStateMachineViewport(
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
    queuedDebt: createGpuFlowVisibleFramePublicationStateMachineDebt({
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

function createGpuFlowVisibleFramePublicationStateMachineDebt({
  blockedProof,
  publicationDecision,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisibleFrameDebt {
  return Object.freeze({
    browserVisual: Boolean(
      blockedProof?.blockedReasons.some((reason) =>
        isGpuFlowVisibleFramePublicationStateMachineBrowserVisualDebtFamily(
          reason.family,
        ),
      ),
    ),
    content: publicationDecision.debt.content,
    maintenance: publicationDecision.debt.maintenance,
    motion: publicationDecision.debt.motion,
  });
}

function createGpuFlowVisibleFramePublicationStateMachinePreparedResourceIds(
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

function createGpuFlowVisibleFramePublicationStateMachineActorKey(
  actor: GpuFlowVisibleFramePublicationStateMachineActor,
): GpuFlowVisibleFrameActorKey {
  return Object.freeze({
    actorId: actor.actorId,
    family: getGpuFlowBrowserStyleVisibleFrameActorFamily(actor),
  });
}

function isGpuFlowVisibleFramePublicationStateMachineBrowserVisualDebtFamily(
  family: string,
): boolean {
  const browserStyleFamily = getGpuFlowBrowserStyleBlockedReasonFamily({
    family,
  });
  return (
    browserStyleFamily === "active-editor" ||
    browserStyleFamily === "browser-text-control" ||
    browserStyleFamily === "browser-text-snapshot"
  );
}

function assertGpuFlowVisibleFramePublicationStateMachineBrowserActorFamily(
  actor: GpuFlowVisibleFrameActorKey,
): GpuFlowVisibleFramePublicationStateMachineBrowserActorFamily {
  if (
    actor.family !== "active-editor" &&
    actor.family !== "browser-text-control" &&
    actor.family !== "browser-text-snapshot"
  ) {
    throw new Error(
      `GPU Flow compatible-previous browser proof cannot use ${actor.family} actor ${actor.actorId}.`,
    );
  }
  return actor.family;
}

function getGpuFlowVisibleFramePublicationStateMachineBrowserRepresentationKind(
  actor: GpuFlowVisibleFramePublicationStateMachineActor,
): GpuFlowVisibleFramePublicationStateMachineBrowserRepresentationKind {
  const representationKind = actor.browserVisual?.representationKind;
  if (representationKind === "active-editor") {
    return "active-editor";
  }
  if (
    representationKind === "passive-snapshot" ||
    actor.textCoverageProof?.projectionCoverage === "exact-snapshot"
  ) {
    return "snapshot";
  }
  return "live-dom";
}

function createGpuFlowVisibleFramePublicationStateMachineRect(
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

function normalizeGpuFlowVisibleFramePublicationStateMachineViewport(
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
