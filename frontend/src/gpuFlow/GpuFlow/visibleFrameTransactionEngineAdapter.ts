// Adapts transaction oracle state into the visible frame engine's proof model.
import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type {
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import type {
  GpuFlowVisibleFrameEngineSample,
  GpuFlowVisibleFramePreparedFrame,
} from "./visibleFrameEngine";
import type { GpuFlowVisiblePublicationBlockedProof } from "./visibleFrameTransactionProofs";
import {
  createGpuFlowContentFrameId,
  createGpuFlowPresentationId,
  createGpuFlowVisibleFrameActorKey,
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

type GpuFlowVisibleFramePublicationEngineBrowserRepresentationKind =
  | "active-editor"
  | "live-dom"
  | "snapshot";

const GPU_FLOW_VISIBLE_FRAME_ENGINE_NATIVE_VISUAL_ACTOR_FAMILIES =
  new Set<string>(["gpu-native-visual"]);
const GPU_FLOW_VISIBLE_FRAME_ENGINE_RETAINED_PAGE_ACTOR_FAMILIES =
  new Set<string>([
    "retained-page",
    "retained-projection",
    "visible-transaction",
  ]);
const GPU_FLOW_VISIBLE_FRAME_ENGINE_BROWSER_VISUAL_ACTOR_FAMILIES =
  new Set<string>([
    "active-editor",
    "browser-visual",
    "compatible-previous",
    "dom-control",
    "text-like-dom-control",
  ]);

export function createGpuFlowVisibleFramePublicationEnginePreparedFrame({
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
  const actorProofs = createGpuFlowVisibleFramePublicationEngineActorProofs({
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

function createGpuFlowVisibleFramePublicationEngineActorProofs({
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
  addGpuFlowVisibleFramePublicationEngineCandidateActorProofs({
    candidateVisibleProjectionState,
    contentFrameId,
    projectionSampleId,
    proofByActor,
  });
  addGpuFlowVisibleFramePublicationEngineBlockedProofs({
    blockedProof,
    proofByActor,
  });
  addGpuFlowVisibleFramePublicationEngineSyntheticFrameProof({
    blockedProof,
    proofByActor,
    selectedVisibleProjectionState,
  });
  return Object.freeze([...proofByActor.values()]);
}

function addGpuFlowVisibleFramePublicationEngineCandidateActorProofs({
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
    setGpuFlowVisibleFramePublicationEngineActorProof({
      proof: createGpuFlowVisibleFramePublicationEngineActorProof({
        actor,
        contentFrameId,
        projectionSampleId,
      }),
      proofByActor,
    });
  }
}

function addGpuFlowVisibleFramePublicationEngineBlockedProofs({
  blockedProof,
  proofByActor,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly proofByActor: Map<string, GpuFlowVisibleFrameActorProof>;
}): void {
  for (const proof of createGpuFlowVisibleFramePublicationEngineBlockedProofs({
    blockedProof,
  })) {
    setGpuFlowVisibleFramePublicationEngineActorProof({
      proof,
      proofByActor,
    });
  }
}

function addGpuFlowVisibleFramePublicationEngineSyntheticFrameProof({
  blockedProof,
  proofByActor,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly proofByActor: Map<string, GpuFlowVisibleFrameActorProof>;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): void {
  const proof = createGpuFlowVisibleFramePublicationEngineSyntheticFrameProof({
    blockedProof,
    selectedVisibleProjectionState,
  });
  if (proof === null) {
    return;
  }
  setGpuFlowVisibleFramePublicationEngineActorProof({
    proof,
    proofByActor,
  });
}

function createGpuFlowVisibleFramePublicationEngineSyntheticFrameProof({
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
  return createGpuFlowVisibleFramePublicationEngineSyntheticBlockedProof({
    actorId: "visible-frame",
    family: "retained-page",
    reason:
      selectedVisibleProjectionState?.transaction.kind === "held-previous"
        ? getGpuFlowVisibleFramePublicationEngineHeldPreviousReason(
            selectedVisibleProjectionState,
          )
        : "no-visible-frame",
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
        requirement: "required",
      });
    case "compatible-previous":
      return createGpuFlowVisibleFramePublicationEngineCompatiblePreviousProof({
        actor,
        actorKey,
        contentFrameId,
        projectionSampleId,
      });
    case "exact-live-dom":
    case "exact-snapshot":
    case undefined:
      return createGpuFlowVisibleFramePublicationEngineExactActorProof({
        actor,
        actorKey,
      });
  }
}

function createGpuFlowVisibleFramePublicationEngineExactActorProof({
  actor,
  actorKey,
}: {
  readonly actor: GpuFlowVisibleFramePublicationEngineActor;
  readonly actorKey: GpuFlowVisibleFrameActorKey;
}): GpuFlowVisibleFrameActorProof {
  return Object.freeze({
    ...actorKey,
    generationId: actor.generationId,
    proof: "exact",
    requirement: "required",
  });
}

function createGpuFlowVisibleFramePublicationEngineCompatiblePreviousProof({
  actor,
  actorKey,
  contentFrameId,
  projectionSampleId,
}: {
  readonly actor: GpuFlowVisibleFramePublicationEngineActor;
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
      "GPU Flow compatible-previous engine proof requires compatible-previous text coverage.",
    );
  }
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
  addGpuFlowVisibleFramePublicationEnginePreviousActorCoverage({
    candidate,
    coverageByActor,
    presentationId,
    previousContentFrameId,
    previousProjectionState,
  });
  addGpuFlowVisibleFramePublicationEngineBlockedFrozenCoverage({
    blockedProof,
    candidate,
    coverageByActor,
    presentationId,
    previousContentFrameId,
    previousProjectionState,
  });
  addGpuFlowVisibleFramePublicationEngineSyntheticPreviousCoverage({
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

function addGpuFlowVisibleFramePublicationEnginePreviousActorCoverage({
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
}

function addGpuFlowVisibleFramePublicationEngineBlockedFrozenCoverage({
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
    !shouldGpuFlowVisibleFramePublicationEngineUseBlockedFrozenFrameCoverage({
      blockedProof,
      previousVisibleProjectionState: previousProjectionState,
    })
  ) {
    return;
  }
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

function addGpuFlowVisibleFramePublicationEngineSyntheticPreviousCoverage({
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
    createGpuFlowVisibleFramePublicationEngineCoverage({
      actor,
      candidateContentFrameId: candidate.contentFrameId,
      contentFrameId: previousContentFrameId,
      coversCandidateProjection: true,
      presentationId,
    }),
  );
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
  if (family === "dom-island" || family === "html-texture") {
    return family;
  }
  if (family === "resource-maintenance") {
    return "resource-maintenance";
  }
  if (GPU_FLOW_VISIBLE_FRAME_ENGINE_NATIVE_VISUAL_ACTOR_FAMILIES.has(family)) {
    return "native-visual";
  }
  if (GPU_FLOW_VISIBLE_FRAME_ENGINE_RETAINED_PAGE_ACTOR_FAMILIES.has(family)) {
    return "retained-page";
  }
  if (GPU_FLOW_VISIBLE_FRAME_ENGINE_BROWSER_VISUAL_ACTOR_FAMILIES.has(family)) {
    return "browser-visual";
  }
  return "browser-visual";
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
): GpuFlowVisibleFramePublicationEngineBrowserRepresentationKind {
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
