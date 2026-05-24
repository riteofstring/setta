// Adapts transaction proof state into the visible frame state machine's manifest model.
import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import { normalizeGpuViewport } from "../viewportMath";
import {
  createGpuFlowVisibleFrameActorKeyForBlockedReason,
  createGpuFlowVisibleFrameActorManifest,
  createGpuFlowVisibleFrameActorProofsForManifest,
  createGpuFlowVisibleFrameCommittedActorCoverageForManifest,
} from "./visibleFrameActorManifest";
import type { GpuFlowVisiblePublicationDecision } from "./visibleFrameScheduling";
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
  blockingProofs,
  candidateCommittedSurfaceFrame,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
  publicationDecision,
}: {
  readonly blockingProofs: readonly GpuFlowVisiblePublicationBlockedProof[];
  readonly candidateCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisibleFramePreparedFrame {
  const manifestFrame =
    resolveGpuFlowVisibleFramePublicationStateMachineManifestFrame({
      candidateCommittedSurfaceFrame,
      candidateVisibleProjectionState,
    });
  const candidate = createGpuFlowVisibleFramePublicationStateMachineCandidate({
    blockingProofs,
    candidateCommittedSurfaceFrame,
    manifestFrame,
    candidateVisibleProjectionState,
    previousVisibleProjectionState,
    publicationDecision,
  });
  return Object.freeze({
    candidate,
    previousPresentation:
      createGpuFlowVisibleFramePublicationStateMachinePreviousPresentation({
        blockingProofs,
        candidate,
        candidateVisibleProjectionState,
        previousVisibleProjectionState,
      }),
    sample: createGpuFlowVisibleFramePublicationStateMachineSample({
      previousVisibleProjectionState,
      publicationDecision,
    }),
  });
}

function createGpuFlowVisibleFramePublicationStateMachineCandidate({
  blockingProofs,
  candidateCommittedSurfaceFrame,
  manifestFrame,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
  publicationDecision,
}: {
  readonly blockingProofs: readonly GpuFlowVisiblePublicationBlockedProof[];
  readonly candidateCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly manifestFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}) {
  const contentFrameId =
    createGpuFlowVisibleFramePublicationStateMachineContentFrameId({
      blockingProofs,
      candidateCommittedSurfaceFrame,
      candidateVisibleProjectionState,
      previousVisibleProjectionState,
      publicationDecision,
    });
  const projectionSampleId = publicationDecision.sample.id;
  const manifestBlockedReasons =
    createGpuFlowVisibleFramePublicationStateMachineManifestBlockedReasons({
      blockingProofs,
      candidateVisibleProjectionState,
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
      blockingProofs,
      publicationDecision,
    }),
    requiredActors: manifest.requiredActors,
  });
}

function createGpuFlowVisibleFramePublicationStateMachineManifestBlockedReasons({
  blockingProofs,
  candidateVisibleProjectionState,
}: {
  readonly blockingProofs: readonly GpuFlowVisiblePublicationBlockedProof[];
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  const blockedReasons = blockingProofs.flatMap(
    (proof) => proof.blockedReasons,
  );
  if (candidateVisibleProjectionState?.transaction.kind === "held-previous") {
    blockedReasons.push({
      actorId: "visible-frame",
      family: "visible-transaction",
      reason:
        candidateVisibleProjectionState.heldPreviousProjection
          ?.maxHeldPreviousFramesExceeded ||
        candidateVisibleProjectionState.heldPreviousProjection
          ?.maxHeldPreviousMsExceeded
          ? "held-previous-budget-exceeded"
          : "held-previous",
    });
  }
  return Object.freeze(blockedReasons);
}

function createGpuFlowVisibleFramePublicationStateMachineContentFrameId({
  blockingProofs,
  candidateCommittedSurfaceFrame,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
  publicationDecision,
}: {
  readonly blockingProofs: readonly GpuFlowVisiblePublicationBlockedProof[];
  readonly candidateCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowContentFrameId {
  if (candidateVisibleProjectionState !== null) {
    return createGpuFlowContentFrameId(
      String(candidateVisibleProjectionState.committedFrame.displayFrameId),
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
    `cold-start:${blockingProofs[0]?.source ?? "no-frame"}:${publicationDecision.sample.id}`,
  );
}

function resolveGpuFlowVisibleFramePublicationStateMachineManifestFrame({
  candidateCommittedSurfaceFrame,
  candidateVisibleProjectionState,
}: {
  readonly candidateCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowCommittedSurfaceFrame | null {
  return (
    candidateCommittedSurfaceFrame ??
    candidateVisibleProjectionState?.committedFrame ??
    null
  );
}

function createGpuFlowVisibleFramePublicationStateMachinePreviousPresentation({
  blockingProofs,
  candidate,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
}: {
  readonly blockingProofs: readonly GpuFlowVisiblePublicationBlockedProof[];
  readonly candidate: ReturnType<
    typeof createGpuFlowVisibleFramePublicationStateMachineCandidate
  >;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameCommittedPresentation | null {
  const previousProjectionState = previousVisibleProjectionState;
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
    blockingProofs,
    candidate,
    coverageByActor,
    presentationId,
    previousContentFrameId,
    previousProjectionState,
  });
  addGpuFlowVisibleFramePublicationStateMachineHeldPreviousSyntheticCoverage({
    blockingProofs,
    candidate,
    candidateVisibleProjectionState,
    coverageByActor,
    presentationId,
    previousContentFrameId,
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
  blockingProofs,
  candidate,
  coverageByActor,
  presentationId,
  previousContentFrameId,
  previousProjectionState,
}: {
  readonly blockingProofs: readonly GpuFlowVisiblePublicationBlockedProof[];
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
  if (blockingProofs.length === 0) {
    return;
  }
  let blockedReasonIndex = 0;
  for (const blockingProof of blockingProofs) {
    if (
      blockingProof.source === "browser-visual-proof" ||
      !shouldGpuFlowVisibleFramePublicationStateMachineUseBlockedFrozenFrameCoverage(
        {
          blockedProof: blockingProof,
          previousVisibleProjectionState: previousProjectionState,
        },
      )
    ) {
      blockedReasonIndex += blockingProof.blockedReasons.length;
      continue;
    }
    blockingProof.blockedReasons.forEach((reason) => {
      const actor = createGpuFlowVisibleFrameActorKeyForBlockedReason({
        index: blockedReasonIndex,
        reason,
      });
      if (
        reason.actorId !== null &&
        (blockingProof.source === "actor-proof" ||
          blockingProof.source === "compatible-previous-proof") &&
        !coverageByActor.has(createGpuFlowVisibleFrameActorCoverageKey(actor))
      ) {
        blockedReasonIndex += 1;
        return;
      }
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
      blockedReasonIndex += 1;
    });
  }
}

function addGpuFlowVisibleFramePublicationStateMachineHeldPreviousSyntheticCoverage({
  blockingProofs,
  candidate,
  candidateVisibleProjectionState,
  coverageByActor,
  presentationId,
  previousContentFrameId,
}: {
  readonly blockingProofs: readonly GpuFlowVisiblePublicationBlockedProof[];
  readonly candidate: ReturnType<
    typeof createGpuFlowVisibleFramePublicationStateMachineCandidate
  >;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly coverageByActor: Map<
    string,
    GpuFlowVisibleFrameCommittedActorCoverage
  >;
  readonly presentationId: ReturnType<typeof createGpuFlowPresentationId>;
  readonly previousContentFrameId: GpuFlowContentFrameId;
}): void {
  if (
    blockingProofs.length > 0 ||
    (candidateVisibleProjectionState !== null &&
      candidateVisibleProjectionState.transaction.kind !== "held-previous")
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
  blockingProofs,
  publicationDecision,
}: {
  readonly blockingProofs: readonly GpuFlowVisiblePublicationBlockedProof[];
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisibleFrameDebt {
  const blockedFamilies = new Set(
    blockingProofs.flatMap((proof) =>
      proof.blockedReasons.map((reason) => reason.family),
    ),
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
  const canvasSize =
    createGpuFlowVisibleFramePublicationStateMachineCanvasSize(sample);
  return Object.freeze({
    activeGestureOwner: sample.gestureOwner ?? null,
    canvasSize,
    currentCommittedFrameId:
      getGpuFlowVisibleFramePublicationStateMachineCurrentFrameId(
        previousVisibleProjectionState,
      ),
    dpr: sample.devicePixelRatio ?? 1,
    projectionSampleId: sample.id,
    queuedDebt: createGpuFlowVisibleFramePublicationStateMachineDebt({
      blockingProofs: [],
      publicationDecision,
    }),
    retainedScrollOffsets:
      createGpuFlowVisibleFramePublicationStateMachineRetainedScrollOffsets(
        sample,
      ),
    sceneGeneration:
      getGpuFlowVisibleFramePublicationStateMachineSceneGeneration(
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
