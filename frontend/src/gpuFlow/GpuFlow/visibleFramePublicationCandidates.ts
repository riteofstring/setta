import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import {
  createGpuFlowHeldPreviousProjection,
  createGpuFlowProjectionTransactionForCommittedFrameId,
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
  type GpuFlowHeldPreviousProjection,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionLane,
  type GpuFlowProjectionSchedulerKnobs,
  type GpuFlowProjectionTransaction,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { createGpuFlowVisibleProjectionStateForRetainedPublication } from "./flowVisibleProjectionState";
import {
  GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID,
  GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
} from "./visibleFramePublicationAuthority";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowBlockedVisibleReason,
} from "./visibleFramePublicationTokens";
import type { GpuFlowVisibleFrameBlockedPublicationCandidate } from "./visibleFramePublicationKernel";

type GpuFlowBrowserVisualActorGeneration =
  GpuFlowCommittedSurfaceFrame["actorGenerations"][number];

type GpuFlowBrowserVisualTextCoverageProof = NonNullable<
  GpuFlowBrowserVisualActorGeneration["textCoverageProof"]
>;

type OptionalGpuFlowBrowserVisualTextCoverageProof =
  | GpuFlowBrowserVisualTextCoverageProof
  | null
  | undefined;

export type GpuFlowCommittedSurfacePublicationTransactionDecision =
  | {
      readonly kind: "publish";
    }
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
      readonly errorMessage: string | null;
      readonly kind: "blocked";
    }
  | {
      readonly kind: "held-previous";
    };

export type GpuFlowCommittedSurfaceHeldPreviousPublicationTransaction = {
  readonly kind: "held-previous";
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
};

export type GpuFlowRetainedProjectionPublicationTransactionDecision =
  | {
      readonly blockedReason: null;
      readonly heldPreviousProjection: null;
      readonly kind: "project-requested";
      readonly transaction: GpuFlowProjectionTransaction;
    }
  | {
      readonly blockedReason: null;
      readonly heldPreviousProjection: GpuFlowHeldPreviousProjection;
      readonly kind: "held-previous";
      readonly transaction: GpuFlowProjectionTransaction;
    }
  | {
      readonly blockedReason: string;
      readonly heldPreviousProjection: GpuFlowHeldPreviousProjection;
      readonly kind: "blocked";
      readonly transaction: GpuFlowProjectionTransaction;
    };

export function decideGpuFlowRetainedProjectionPublicationTransaction({
  frameReasons,
  hasActiveRetainedDomControl,
  heldPreviousProjectionState,
  projectionSchedulerKnobs,
  requestedProjectionCoverageMissing,
  requestedTransaction,
}: {
  readonly frameReasons: readonly GpuFrameReason[];
  readonly hasActiveRetainedDomControl: boolean;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly projectionSchedulerKnobs?:
    | GpuFlowProjectionSchedulerKnobs
    | undefined;
  readonly requestedProjectionCoverageMissing: boolean;
  readonly requestedTransaction: GpuFlowProjectionTransaction;
}): GpuFlowRetainedProjectionPublicationTransactionDecision {
  if (
    !requestedProjectionCoverageMissing ||
    heldPreviousProjectionState === null
  ) {
    return {
      blockedReason: null,
      heldPreviousProjection: null,
      kind: "project-requested",
      transaction: requestedTransaction,
    };
  }
  const heldPreviousTransaction =
    createGpuFlowProjectionTransactionForCommittedFrameId({
      committedFrameId:
        heldPreviousProjectionState.committedFrame.displayFrameId,
      kind: "held-previous",
      lane: requestedTransaction.lane,
      rawReasons: frameReasons,
      sample: requestedTransaction.sample,
    });
  const heldPreviousProjection = createGpuFlowHeldPreviousProjection({
    heldTransaction: heldPreviousTransaction,
    knobs:
      projectionSchedulerKnobs ?? DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
    previousVisibleProjectionState: heldPreviousProjectionState,
    reason: "retained-projection-coverage-missing",
    requestedSample: requestedTransaction.sample,
  });
  if (
    !isGpuFlowRetainedProjectionHeldPreviousOverBudget(heldPreviousProjection)
  ) {
    return {
      blockedReason: null,
      heldPreviousProjection,
      kind: "held-previous",
      transaction: heldPreviousTransaction,
    };
  }
  if (hasActiveRetainedDomControl) {
    return {
      blockedReason: null,
      heldPreviousProjection: null,
      kind: "project-requested",
      transaction: requestedTransaction,
    };
  }
  return {
    blockedReason: "held-previous-budget-exceeded",
    heldPreviousProjection,
    kind: "blocked",
    transaction: requestedTransaction,
  };
}

export function hasActiveGpuFlowRetainedDomControlPublicationProof(
  retainedDisplayFrame: RetainedDisplayFrame,
): boolean {
  return retainedDisplayFrame.retainedRuntimeFrame.descriptors.domControlSources.some(
    (control) => control.active,
  );
}

export function decideGpuFlowCommittedSurfacePublicationTransaction({
  heldPreviousProjectionState,
  publishedCommittedSurfaceFrame,
}: {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfacePublicationTransactionDecision {
  if (
    !publishedCommittedSurfaceFrame ||
    publishedCommittedSurfaceFrame.publishability.kind === "publishable"
  ) {
    return {
      kind: "publish",
    };
  }
  if (
    publishedCommittedSurfaceFrame.publishability.kind === "hold-previous" &&
    heldPreviousProjectionState &&
    !isGpuFlowHeldPreviousPublicationOverBudget(heldPreviousProjectionState)
  ) {
    return { kind: "held-previous" };
  }
  return {
    blockedPublicationCandidate:
      createGpuFlowBrowserVisualBlockedPublicationCandidate({
        frame: publishedCommittedSurfaceFrame,
        heldPreviousProjectionState,
      }),
    errorMessage:
      publishedCommittedSurfaceFrame.publishability.kind === "true-hole"
        ? `GPU Flow committed surface frame has true-hole browser visual coverage: ${getGpuFlowCommittedSurfacePublishabilityActorIds(
            publishedCommittedSurfaceFrame,
          ).join(", ")}.`
        : null,
    kind: "blocked",
  };
}

export function createGpuFlowBrowserVisualBlockedPublicationCandidate({
  frame,
  heldPreviousProjectionState,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameBlockedPublicationCandidate {
  return Object.freeze({
    blockedReasons: createGpuFlowBlockedVisibleReasons(frame),
    frozenFrameId: resolveGpuFlowBlockedVisibleFrozenFrameId({
      heldPreviousProjectionState,
    }),
  });
}

function isGpuFlowHeldPreviousPublicationOverBudget(
  heldPreviousProjectionState: GpuFlowVisibleProjectionState,
): boolean {
  const heldPreviousProjection =
    heldPreviousProjectionState.heldPreviousProjection;
  return Boolean(
    heldPreviousProjection?.maxHeldPreviousFramesExceeded ||
      heldPreviousProjection?.maxHeldPreviousMsExceeded,
  );
}

export function createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction({
  committedGpuNativeVisuals,
  frameReasons,
  heldPreviousProjectionState,
  liveProjectionSample,
  publicationLane,
  publishedRetainedFrame,
}: {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
}): GpuFlowCommittedSurfaceHeldPreviousPublicationTransaction {
  const visibleProjectionState =
    createGpuFlowVisibleProjectionStateForRetainedPublication({
      committedGpuNativeVisuals,
      frameReasons,
      heldPreviousProjectionState,
      heldPreviousReason: "browser-visual-coverage-missing",
      liveProjectionSample,
      publicationLane,
      publishedCommittedSurfaceFrame: undefined,
      publishedRetainedFrame,
      retainedDisplayOutcomeKind: "hold-previous",
    });
  if (!visibleProjectionState.heldPreviousProjection) {
    throw new Error(
      "GPU Flow held-previous publication requires held-previous diagnostics.",
    );
  }
  return {
    kind: "held-previous",
    visibleProjectionState,
  };
}

export function createGpuFlowRetainedProjectionBlockedPublicationCandidate({
  blockedReason,
  heldPreviousProjectionState,
}: {
  readonly blockedReason: string;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameBlockedPublicationCandidate {
  return Object.freeze({
    blockedReasons: Object.freeze([
      Object.freeze({
        actorId: null,
        family: "retained-projection",
        reason: blockedReason,
      }),
    ]),
    frozenFrameId:
      heldPreviousProjectionState?.committedFrame.displayFrameId ??
      GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
  });
}

export function shouldPreservePreparedCommittedSurfaceFrameForBrowserVisualRepair(
  candidate: GpuFlowVisibleFrameBlockedPublicationCandidate,
): boolean {
  return candidate.blockedReasons.some(
    (reason) =>
      reason.family === "dom-control" ||
      reason.family === "dom-island" ||
      reason.reason === "snapshot-pending" ||
      reason.reason === "live-dom-budget" ||
      reason.reason === "visible-dom-control-not-projected",
  );
}

function isGpuFlowRetainedProjectionHeldPreviousOverBudget(
  heldPreviousProjection: GpuFlowHeldPreviousProjection,
): boolean {
  return Boolean(
    heldPreviousProjection.maxHeldPreviousFramesExceeded ||
      heldPreviousProjection.maxHeldPreviousMsExceeded,
  );
}

export function createGpuFlowBlockedVisibleReasons(
  frame: GpuFlowCommittedSurfaceFrame,
): readonly GpuFlowBlockedVisibleReason[] {
  const actorById = new Map(
    frame.actorGenerations.map((actor) => [actor.actorId, actor]),
  );
  const actorIds = getGpuFlowCommittedSurfacePublishabilityActorIds(frame);
  return Object.freeze(
    actorIds.map((actorId) => {
      const actor = actorById.get(actorId);
      return Object.freeze({
        actorId,
        family: actor?.actorFamily ?? actor?.kind ?? "unknown",
        reason: getGpuFlowBrowserVisualBlockedReason({
          frame,
          textCoverage: actor?.textCoverageProof,
        }),
      });
    }),
  );
}

export function getGpuFlowCommittedSurfacePublishabilityActorIds(
  frame: GpuFlowCommittedSurfaceFrame,
): readonly string[] {
  return frame.publishability.kind === "true-hole"
    ? frame.publishability.actorIds
    : frame.publishability.blockingActorIds;
}

export function getGpuFlowBrowserVisualBlockedReason({
  frame,
  textCoverage,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
  readonly textCoverage: OptionalGpuFlowBrowserVisualTextCoverageProof;
}): string {
  if (textCoverage && "readinessReason" in textCoverage) {
    return textCoverage.readinessReason;
  }
  return getGpuFlowCommittedSurfacePublishabilityReason(frame);
}

function getGpuFlowCommittedSurfacePublishabilityReason(
  frame: GpuFlowCommittedSurfaceFrame,
): string {
  switch (frame.publishability.kind) {
    case "block-first-publication":
    case "hold-previous":
    case "true-hole":
      return frame.publishability.reason;
    case "publishable":
      return "browser-visual-coverage-missing";
  }
}

function resolveGpuFlowBlockedVisibleFrozenFrameId({
  heldPreviousProjectionState,
}: {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowBlockedPublicationToken["frozenFrameId"] {
  return (
    heldPreviousProjectionState?.committedFrame.displayFrameId ??
    GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID
  );
}
