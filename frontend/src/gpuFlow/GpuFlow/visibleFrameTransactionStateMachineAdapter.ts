// Adapts transaction proof state into the visible frame state machine's manifest model.
import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type {
  GpuFlowVisibleProjectionState,
  GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import { normalizeGpuViewport } from "../viewportMath";
import {
  createGpuFlowVisibleFrameActorKeyForBlockedReason,
  createGpuFlowVisibleFrameActorManifest,
  createGpuFlowVisibleFrameActorProofsForManifest,
  createGpuFlowVisibleFrameCommittedActorCoverageForManifest,
} from "./visibleFrameActorManifest";
import type {
  GpuFlowVisibleFramePreparedFrame,
  GpuFlowVisibleFrameStateMachineSample,
} from "./visibleFrameStateMachine";
import type { GpuFlowVisiblePublicationBlockedProof } from "./visibleFrameTransactionProofs";
import {
  createGpuFlowContentFrameId,
  createGpuFlowPresentationId,
  type GpuFlowContentFrameId,
  type GpuFlowVisibleFrameActorKey,
  type GpuFlowVisibleFrameCommittedActorCoverage,
  type GpuFlowVisibleFrameCommittedPresentation,
  type GpuFlowVisibleFrameDebt,
  type GpuFlowVisibleFrameRect,
} from "./visibleFrameTypes";

export function createGpuFlowVisibleFramePublicationStateMachinePreparedFrame({
  blockedProof,
  candidateCommittedSurfaceFrame,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
  publicationDecision,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidateCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePreparedFrame {
  const manifestFrame =
    resolveGpuFlowVisibleFramePublicationStateMachineManifestFrame({
      candidateCommittedSurfaceFrame,
      candidateVisibleProjectionState,
      selectedVisibleProjectionState,
    });
  const candidate = createGpuFlowVisibleFramePublicationStateMachineCandidate({
    blockedProof,
    candidateCommittedSurfaceFrame,
    manifestFrame,
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
        candidateManifestFrame: manifestFrame,
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
  candidateCommittedSurfaceFrame,
  manifestFrame,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
  publicationDecision,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidateCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly manifestFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  const contentFrameId =
    createGpuFlowVisibleFramePublicationStateMachineContentFrameId({
      blockedProof,
      candidateCommittedSurfaceFrame,
      candidateVisibleProjectionState,
      previousVisibleProjectionState,
      publicationDecision,
      selectedVisibleProjectionState,
    });
  const projectionSampleId = publicationDecision.sample.id;
  const manifestBlockedReasons =
    createGpuFlowVisibleFramePublicationStateMachineManifestBlockedReasons({
      blockedProof,
      selectedVisibleProjectionState,
    });
  const manifest = createGpuFlowVisibleFrameActorManifest({
    blockedReasons: manifestBlockedReasons,
    frame: manifestFrame,
    sample: publicationDecision.sample,
  });
  const actorProofs = createGpuFlowVisibleFrameActorProofsForManifest({
    contentFrameId,
    frame: manifestFrame,
    manifest,
    projectionSampleId,
  });
  return Object.freeze({
    actorProofs,
    contentFrameId,
    preparedResourceIds:
      createGpuFlowVisibleFramePublicationStateMachinePreparedResourceIds(
        manifestFrame,
      ),
    projectionSampleId,
    queuedDebt: createGpuFlowVisibleFramePublicationStateMachineDebt({
      blockedProof,
      publicationDecision,
    }),
    requiredActors: manifest.requiredActors,
  });
}

function createGpuFlowVisibleFramePublicationStateMachineManifestBlockedReasons({
  blockedProof,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  const blockedReasons = [...(blockedProof?.blockedReasons ?? [])];
  if (selectedVisibleProjectionState?.transaction.kind === "held-previous") {
    blockedReasons.push({
      actorId: "visible-frame",
      family: "visible-transaction",
      reason:
        selectedVisibleProjectionState.heldPreviousProjection
          ?.maxHeldPreviousFramesExceeded ||
        selectedVisibleProjectionState.heldPreviousProjection
          ?.maxHeldPreviousMsExceeded
          ? "held-previous-budget-exceeded"
          : "held-previous",
    });
  }
  return Object.freeze(blockedReasons);
}

function createGpuFlowVisibleFramePublicationStateMachineContentFrameId({
  blockedProof,
  candidateCommittedSurfaceFrame,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
  publicationDecision,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidateCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
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
  if (candidateCommittedSurfaceFrame !== null) {
    return createGpuFlowContentFrameId(
      String(candidateCommittedSurfaceFrame.displayFrameId),
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

function resolveGpuFlowVisibleFramePublicationStateMachineManifestFrame({
  candidateCommittedSurfaceFrame,
  candidateVisibleProjectionState,
  selectedVisibleProjectionState,
}: {
  readonly candidateCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowCommittedSurfaceFrame | null {
  return (
    candidateCommittedSurfaceFrame ??
    candidateVisibleProjectionState?.committedFrame ??
    selectedVisibleProjectionState?.committedFrame ??
    null
  );
}

function createGpuFlowVisibleFramePublicationStateMachinePreviousPresentation({
  blockedProof,
  candidate,
  candidateManifestFrame,
  previousVisibleProjectionState,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidate: ReturnType<
    typeof createGpuFlowVisibleFramePublicationStateMachineCandidate
  >;
  readonly candidateManifestFrame: GpuFlowCommittedSurfaceFrame | null;
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
    candidateManifestFrame,
    coverageByActor,
    presentationId,
    previousContentFrameId,
    previousProjectionState,
  });
  addGpuFlowVisibleFramePublicationStateMachineHeldPreviousSyntheticCoverage({
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
  readonly candidate: ReturnType<
    typeof createGpuFlowVisibleFramePublicationStateMachineCandidate
  >;
  readonly coverageByActor: Map<
    string,
    GpuFlowVisibleFrameCommittedActorCoverage
  >;
  readonly presentationId: ReturnType<typeof createGpuFlowPresentationId>;
  readonly previousContentFrameId: GpuFlowContentFrameId;
  readonly previousProjectionState: GpuFlowVisibleProjectionState;
}): void {
  const previousManifest = createGpuFlowVisibleFrameActorManifest({
    frame: previousProjectionState.committedFrame,
    sample: previousProjectionState.sample,
  });
  for (const coverage of createGpuFlowVisibleFrameCommittedActorCoverageForManifest(
    {
      candidateContentFrameId: candidate.contentFrameId,
      contentFrameId: previousContentFrameId,
      coversCandidateProjection:
        previousContentFrameId === candidate.contentFrameId,
      manifest: previousManifest,
      presentationId,
    },
  )) {
    coverageByActor.set(
      createGpuFlowVisibleFrameActorCoverageKey(coverage),
      coverage,
    );
  }
}

function addGpuFlowVisibleFramePublicationStateMachineBlockedFrozenCoverage({
  blockedProof,
  candidate,
  candidateManifestFrame,
  coverageByActor,
  presentationId,
  previousContentFrameId,
  previousProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidate: ReturnType<
    typeof createGpuFlowVisibleFramePublicationStateMachineCandidate
  >;
  readonly candidateManifestFrame: GpuFlowCommittedSurfaceFrame | null;
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
    blockedProof.source === "browser-visual-proof" ||
    candidateManifestFrame !== null ||
    !shouldGpuFlowVisibleFramePublicationStateMachineUseBlockedFrozenFrameCoverage(
      {
        blockedProof,
        previousVisibleProjectionState: previousProjectionState,
      },
    )
  ) {
    return;
  }
  blockedProof.blockedReasons.forEach((reason, index) => {
    const actor = createGpuFlowVisibleFrameActorKeyForBlockedReason({
      index,
      reason,
    });
    coverageByActor.set(
      createGpuFlowVisibleFrameActorCoverageKey(actor),
      createGpuFlowVisibleFramePublicationStateMachineCoverage({
        actor,
        candidateContentFrameId: candidate.contentFrameId,
        contentFrameId: previousContentFrameId,
        coversCandidateProjection: true,
        presentationId,
      }),
    );
  });
}

function addGpuFlowVisibleFramePublicationStateMachineHeldPreviousSyntheticCoverage({
  blockedProof,
  candidate,
  coverageByActor,
  presentationId,
  previousContentFrameId,
  selectedVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly candidate: ReturnType<
    typeof createGpuFlowVisibleFramePublicationStateMachineCandidate
  >;
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
    createGpuFlowVisibleFrameActorCoverageKey(actor),
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
      contentFrameId === candidateContentFrameId
        ? Object.freeze([candidateContentFrameId])
        : Object.freeze([]),
    contentFrameId,
    coversCandidateProjection,
    presentationId,
  });
}

function createGpuFlowVisibleFrameActorCoverageKey(
  actor: GpuFlowVisibleFrameActorKey,
): string {
  return `${actor.family}:${actor.actorId}`;
}

function shouldGpuFlowVisibleFramePublicationStateMachineUseBlockedFrozenFrameCoverage({
  blockedProof,
  previousVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState;
}): boolean {
  if (
    typeof blockedProof.frozenFrameId === "string" &&
    blockedProof.frozenFrameId.startsWith("cold-start-shell")
  ) {
    return false;
  }
  return (
    String(blockedProof.frozenFrameId) ===
    String(previousVisibleProjectionState.committedFrame.displayFrameId)
  );
}

function createGpuFlowVisibleFramePublicationStateMachinePreparedResourceIds(
  frame: GpuFlowCommittedSurfaceFrame | null,
): readonly string[] {
  if (frame === null) {
    return [];
  }
  return Object.freeze(
    (frame.actorGenerations ?? []).flatMap((actor) => [
      ...(actor.browserVisual?.resourceHandles?.map(
        (handle) => `${handle.kind}:${handle.id}`,
      ) ?? []),
      ...(actor.textCoverageProof?.projectionCoverage === "compatible-previous"
        ? actor.textCoverageProof.compatiblePreviousProof.resourceHandles?.map(
            (handle) => `${handle.kind}:${handle.id}`,
          ) ?? []
        : []),
    ]),
  );
}

function createGpuFlowVisibleFramePublicationStateMachineDebt({
  blockedProof,
  publicationDecision,
}: {
  readonly blockedProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisibleFrameDebt {
  const blockedFamilies = new Set(
    blockedProof?.blockedReasons.map((reason) => reason.family) ?? [],
  );
  return Object.freeze({
    browserVisual:
      blockedFamilies.has("browser-visual") ||
      blockedFamilies.has("browser-text-control") ||
      blockedFamilies.has("text-like-dom-control") ||
      blockedFamilies.has("active-editor") ||
      blockedFamilies.has("compatible-previous"),
    content: publicationDecision.debt.content,
    maintenance: publicationDecision.debt.maintenance,
    motion: publicationDecision.debt.motion,
  });
}

function createGpuFlowVisibleFramePublicationStateMachineSample({
  previousVisibleProjectionState,
  publicationDecision,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisibleFrameStateMachineSample {
  const sample = publicationDecision.sample;
  const viewport = normalizeGpuViewport(sample.viewport ?? [0, 0, 1]);
  const canvasSize = createGpuFlowVisibleFramePublicationStateMachineCanvasSize(
    sample,
  );
  return Object.freeze({
    activeGestureOwner: sample.gestureOwner ?? null,
    canvasSize,
    currentCommittedFrameId: getGpuFlowVisibleFramePublicationStateMachineCurrentFrameId(
      previousVisibleProjectionState,
    ),
    dpr: sample.devicePixelRatio ?? 1,
    projectionSampleId: sample.id,
    queuedDebt: createGpuFlowVisibleFramePublicationStateMachineDebt({
      blockedProof: null,
      publicationDecision,
    }),
    retainedScrollOffsets: createGpuFlowVisibleFramePublicationStateMachineRetainedScrollOffsets(
      sample,
    ),
    sceneGeneration: getGpuFlowVisibleFramePublicationStateMachineSceneGeneration(
      previousVisibleProjectionState,
    ),
    viewport: createGpuFlowVisibleFramePublicationStateMachineRect({
      height: canvasSize.height,
      width: canvasSize.width,
      x: viewport.x,
      y: viewport.y,
    }),
  });
}

function createGpuFlowVisibleFramePublicationStateMachineCanvasSize(
  sample: GpuFlowVisiblePublicationDecision["sample"],
): GpuFlowVisibleFrameStateMachineSample["canvasSize"] {
  return Object.freeze({
    height: sample.cssViewport?.height ?? 0,
    width: sample.cssViewport?.width ?? 0,
  });
}

function getGpuFlowVisibleFramePublicationStateMachineCurrentFrameId(
  previousVisibleProjectionState: GpuFlowVisibleProjectionState | null,
): GpuFlowVisibleFrameStateMachineSample["currentCommittedFrameId"] {
  return previousVisibleProjectionState?.committedFrame.displayFrameId ?? null;
}

function getGpuFlowVisibleFramePublicationStateMachineSceneGeneration(
  previousVisibleProjectionState: GpuFlowVisibleProjectionState | null,
): string {
  return (
    previousVisibleProjectionState?.committedFrame.sceneRevision?.toString() ??
    "unknown"
  );
}

function createGpuFlowVisibleFramePublicationStateMachineRetainedScrollOffsets(
  sample: GpuFlowVisiblePublicationDecision["sample"],
): GpuFlowVisibleFrameStateMachineSample["retainedScrollOffsets"] {
  return Object.freeze(
    [...(sample.retainedScrollOffsets ?? new Map()).entries()].map(
      ([actorId, offset]) =>
        Object.freeze({
          actorId,
          scrollLeft: offset.x,
          scrollTop: offset.y,
        }),
    ),
  );
}

function createGpuFlowVisibleFramePublicationStateMachineRect({
  height,
  width,
  x,
  y,
}: {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}): GpuFlowVisibleFrameRect {
  return Object.freeze({
    height,
    width,
    x,
    y,
  });
}
