// Adapts transaction proof state into the visible frame state machine's manifest model.
import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import { normalizeGpuViewport } from "../viewportMath";
import {
  createGpuFlowVisibleFrameActorKeyForBlockedReason,
  createGpuFlowVisibleFrameActorManifest,
  createGpuFlowVisibleFrameActorProofsForManifest,
  createGpuFlowVisibleFramePresentedActorCoverageForManifest,
} from "./visibleFrameActorManifest";
import type { GpuFlowVisibleFrameReducerDecision } from "./visibleFrameReducerRuntime";
import type {
  GpuFlowVisibleFramePreparedFrame,
  GpuFlowVisibleFrameStateMachineSample,
} from "./visibleFrameStateMachine";
import type { GpuFlowVisibleFramePresentationBlockedProof } from "./visibleFrameTransactionProofs";
import {
  createGpuFlowContentFrameId,
  createGpuFlowPresentationId,
  type GpuFlowContentFrameId,
  type GpuFlowVisibleFrameActorKey,
  type GpuFlowVisibleFrameDebt,
  type GpuFlowVisibleFramePresentedActorCoverage,
  type GpuFlowVisibleFramePresentedFrame,
  type GpuFlowVisibleFrameRect,
} from "./visibleFrameTypes";

export function createGpuFlowVisibleFramePresentationStateMachinePreparedFrame({
  blockingProofs,
  candidateContentFrame,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
  reducerDecision,
}: {
  readonly blockingProofs: readonly GpuFlowVisibleFramePresentationBlockedProof[];
  readonly candidateContentFrame: GpuFlowPreparedContentFrame | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): GpuFlowVisibleFramePreparedFrame {
  const manifestFrame =
    resolveGpuFlowVisibleFramePresentationStateMachineManifestFrame({
      candidateContentFrame,
      candidateVisibleProjectionState,
    });
  const candidate = createGpuFlowVisibleFramePresentationStateMachineCandidate({
    blockingProofs,
    candidateContentFrame,
    manifestFrame,
    candidateVisibleProjectionState,
    previousVisibleProjectionState,
    reducerDecision,
  });
  return Object.freeze({
    candidate,
    previousPresentation:
      createGpuFlowVisibleFramePresentationStateMachinePreviousPresentation({
        blockingProofs,
        candidate,
        candidateVisibleProjectionState,
        previousVisibleProjectionState,
      }),
    sample: createGpuFlowVisibleFramePresentationStateMachineSample({
      previousVisibleProjectionState,
      reducerDecision,
    }),
  });
}

function createGpuFlowVisibleFramePresentationStateMachineCandidate({
  blockingProofs,
  candidateContentFrame,
  manifestFrame,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
  reducerDecision,
}: {
  readonly blockingProofs: readonly GpuFlowVisibleFramePresentationBlockedProof[];
  readonly candidateContentFrame: GpuFlowPreparedContentFrame | null;
  readonly manifestFrame: GpuFlowPreparedContentFrame | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}) {
  const contentFrameId =
    createGpuFlowVisibleFramePresentationStateMachineContentFrameId({
      blockingProofs,
      candidateContentFrame,
      candidateVisibleProjectionState,
      previousVisibleProjectionState,
      reducerDecision,
    });
  const projectionSampleId = reducerDecision.sample.id;
  const manifestBlockedReasons =
    createGpuFlowVisibleFramePresentationStateMachineManifestBlockedReasons({
      blockingProofs,
      candidateVisibleProjectionState,
    });
  const manifest = createGpuFlowVisibleFrameActorManifest({
    blockedReasons: manifestBlockedReasons,
    frame: manifestFrame,
    sample: reducerDecision.sample,
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
      createGpuFlowVisibleFramePresentationStateMachinePreparedResourceIds(
        manifestFrame,
      ),
    projectionSampleId,
    queuedDebt: createGpuFlowVisibleFramePresentationStateMachineDebt({
      blockingProofs,
      reducerDecision,
    }),
    requiredActors: manifest.requiredActors,
  });
}

function createGpuFlowVisibleFramePresentationStateMachineManifestBlockedReasons({
  blockingProofs,
  candidateVisibleProjectionState,
}: {
  readonly blockingProofs: readonly GpuFlowVisibleFramePresentationBlockedProof[];
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

function createGpuFlowVisibleFramePresentationStateMachineContentFrameId({
  blockingProofs,
  candidateContentFrame,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
  reducerDecision,
}: {
  readonly blockingProofs: readonly GpuFlowVisibleFramePresentationBlockedProof[];
  readonly candidateContentFrame: GpuFlowPreparedContentFrame | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): GpuFlowContentFrameId {
  if (candidateVisibleProjectionState !== null) {
    return createGpuFlowContentFrameId(
      String(
        candidateVisibleProjectionState.preparedContentFrame.displayFrameId,
      ),
    );
  }
  if (candidateContentFrame !== null) {
    return createGpuFlowContentFrameId(
      String(candidateContentFrame.displayFrameId),
    );
  }
  if (previousVisibleProjectionState !== null) {
    return createGpuFlowContentFrameId(
      String(
        previousVisibleProjectionState.preparedContentFrame.displayFrameId,
      ),
    );
  }
  return createGpuFlowContentFrameId(
    `cold-start:${blockingProofs[0]?.source ?? "no-frame"}:${reducerDecision.sample.id}`,
  );
}

function resolveGpuFlowVisibleFramePresentationStateMachineManifestFrame({
  candidateContentFrame,
  candidateVisibleProjectionState,
}: {
  readonly candidateContentFrame: GpuFlowPreparedContentFrame | null;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowPreparedContentFrame | null {
  return (
    candidateContentFrame ??
    candidateVisibleProjectionState?.preparedContentFrame ??
    null
  );
}

function createGpuFlowVisibleFramePresentationStateMachinePreviousPresentation({
  blockingProofs,
  candidate,
  candidateVisibleProjectionState,
  previousVisibleProjectionState,
}: {
  readonly blockingProofs: readonly GpuFlowVisibleFramePresentationBlockedProof[];
  readonly candidate: ReturnType<
    typeof createGpuFlowVisibleFramePresentationStateMachineCandidate
  >;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePresentedFrame | null {
  const previousProjectionState = previousVisibleProjectionState;
  if (previousProjectionState === null) {
    return null;
  }
  const previousContentFrameId = createGpuFlowContentFrameId(
    String(previousProjectionState.preparedContentFrame.displayFrameId),
  );
  const presentationId = createGpuFlowPresentationId(
    previousProjectionState.transaction?.id ??
      `previous:${previousProjectionState.preparedContentFrame.displayFrameId}`,
  );
  const coverageByActor = new Map<
    string,
    GpuFlowVisibleFramePresentedActorCoverage
  >();
  addGpuFlowVisibleFramePresentationStateMachinePreviousActorCoverage({
    candidate,
    coverageByActor,
    presentationId,
    previousContentFrameId,
    previousProjectionState,
  });
  addGpuFlowVisibleFramePresentationStateMachineBlockedFrozenCoverage({
    blockingProofs,
    candidate,
    coverageByActor,
    presentationId,
    previousContentFrameId,
    previousProjectionState,
  });
  addGpuFlowVisibleFramePresentationStateMachineHeldPreviousSyntheticCoverage({
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

function addGpuFlowVisibleFramePresentationStateMachinePreviousActorCoverage({
  candidate,
  coverageByActor,
  presentationId,
  previousContentFrameId,
  previousProjectionState,
}: {
  readonly candidate: ReturnType<
    typeof createGpuFlowVisibleFramePresentationStateMachineCandidate
  >;
  readonly coverageByActor: Map<
    string,
    GpuFlowVisibleFramePresentedActorCoverage
  >;
  readonly presentationId: ReturnType<typeof createGpuFlowPresentationId>;
  readonly previousContentFrameId: GpuFlowContentFrameId;
  readonly previousProjectionState: GpuFlowVisibleProjectionState;
}): void {
  const previousManifest = createGpuFlowVisibleFrameActorManifest({
    frame: previousProjectionState.preparedContentFrame,
    sample: previousProjectionState.sample,
  });
  for (const coverage of createGpuFlowVisibleFramePresentedActorCoverageForManifest(
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

function addGpuFlowVisibleFramePresentationStateMachineBlockedFrozenCoverage({
  blockingProofs,
  candidate,
  coverageByActor,
  presentationId,
  previousContentFrameId,
  previousProjectionState,
}: {
  readonly blockingProofs: readonly GpuFlowVisibleFramePresentationBlockedProof[];
  readonly candidate: ReturnType<
    typeof createGpuFlowVisibleFramePresentationStateMachineCandidate
  >;
  readonly coverageByActor: Map<
    string,
    GpuFlowVisibleFramePresentedActorCoverage
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
      !shouldGpuFlowVisibleFramePresentationStateMachineUseBlockedFrozenFrameCoverage(
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
        createGpuFlowVisibleFramePresentationStateMachineCoverage({
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

function addGpuFlowVisibleFramePresentationStateMachineHeldPreviousSyntheticCoverage({
  blockingProofs,
  candidate,
  candidateVisibleProjectionState,
  coverageByActor,
  presentationId,
  previousContentFrameId,
}: {
  readonly blockingProofs: readonly GpuFlowVisibleFramePresentationBlockedProof[];
  readonly candidate: ReturnType<
    typeof createGpuFlowVisibleFramePresentationStateMachineCandidate
  >;
  readonly candidateVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly coverageByActor: Map<
    string,
    GpuFlowVisibleFramePresentedActorCoverage
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
    createGpuFlowVisibleFramePresentationStateMachineCoverage({
      actor,
      candidateContentFrameId: candidate.contentFrameId,
      contentFrameId: previousContentFrameId,
      coversCandidateProjection: true,
      presentationId,
    }),
  );
}

function createGpuFlowVisibleFramePresentationStateMachineCoverage({
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
}): GpuFlowVisibleFramePresentedActorCoverage {
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

function shouldGpuFlowVisibleFramePresentationStateMachineUseBlockedFrozenFrameCoverage({
  blockedProof,
  previousVisibleProjectionState,
}: {
  readonly blockedProof: GpuFlowVisibleFramePresentationBlockedProof;
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
    String(previousVisibleProjectionState.preparedContentFrame.displayFrameId)
  );
}

function createGpuFlowVisibleFramePresentationStateMachinePreparedResourceIds(
  frame: GpuFlowPreparedContentFrame | null,
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

function createGpuFlowVisibleFramePresentationStateMachineDebt({
  blockingProofs,
  reducerDecision,
}: {
  readonly blockingProofs: readonly GpuFlowVisibleFramePresentationBlockedProof[];
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
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
    content: reducerDecision.debt.content,
    maintenance: reducerDecision.debt.maintenance,
    motion: reducerDecision.debt.motion,
  });
}

function createGpuFlowVisibleFramePresentationStateMachineSample({
  previousVisibleProjectionState,
  reducerDecision,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): GpuFlowVisibleFrameStateMachineSample {
  const sample = reducerDecision.sample;
  const viewport = normalizeGpuViewport(sample.viewport ?? [0, 0, 1]);
  const canvasSize =
    createGpuFlowVisibleFramePresentationStateMachineCanvasSize(sample);
  return Object.freeze({
    activeGestureOwner: sample.gestureOwner ?? null,
    canvasSize,
    currentContentFrameId:
      getGpuFlowVisibleFramePresentationStateMachineCurrentFrameId(
        previousVisibleProjectionState,
      ),
    dpr: sample.devicePixelRatio ?? 1,
    projectionSampleId: sample.id,
    queuedDebt: createGpuFlowVisibleFramePresentationStateMachineDebt({
      blockingProofs: [],
      reducerDecision,
    }),
    retainedScrollOffsets:
      createGpuFlowVisibleFramePresentationStateMachineRetainedScrollOffsets(
        sample,
      ),
    sceneGeneration:
      getGpuFlowVisibleFramePresentationStateMachineSceneGeneration(
        previousVisibleProjectionState,
      ),
    viewport: createGpuFlowVisibleFramePresentationStateMachineRect({
      height: canvasSize.height,
      width: canvasSize.width,
      x: viewport.x,
      y: viewport.y,
    }),
  });
}

function createGpuFlowVisibleFramePresentationStateMachineCanvasSize(
  sample: GpuFlowVisibleFrameReducerDecision["sample"],
): GpuFlowVisibleFrameStateMachineSample["canvasSize"] {
  return Object.freeze({
    height: sample.cssViewport?.height ?? 0,
    width: sample.cssViewport?.width ?? 0,
  });
}

function getGpuFlowVisibleFramePresentationStateMachineCurrentFrameId(
  previousVisibleProjectionState: GpuFlowVisibleProjectionState | null,
): GpuFlowVisibleFrameStateMachineSample["currentContentFrameId"] {
  return (
    previousVisibleProjectionState?.preparedContentFrame.displayFrameId ?? null
  );
}

function getGpuFlowVisibleFramePresentationStateMachineSceneGeneration(
  previousVisibleProjectionState: GpuFlowVisibleProjectionState | null,
): string {
  return (
    previousVisibleProjectionState?.preparedContentFrame.sceneRevision?.toString() ??
    "unknown"
  );
}

function createGpuFlowVisibleFramePresentationStateMachineRetainedScrollOffsets(
  sample: GpuFlowVisibleFrameReducerDecision["sample"],
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

function createGpuFlowVisibleFramePresentationStateMachineRect({
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
