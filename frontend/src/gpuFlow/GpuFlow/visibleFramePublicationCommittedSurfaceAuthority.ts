import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionLane,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import {
  type GpuFlowCommittedSurfacePublicationCandidateAction,
} from "./flowCommittedSurfacePublicationCandidateHandling";
import {
  createGpuFlowNodeLayerCommittedSurfacePublicationResult,
  type GpuFlowNodeLayerCommittedSurfacePublicationResult,
} from "./flowFrameResult";
import { createGpuFlowVisibleProjectionStateForRetainedPublication } from "./flowVisibleProjectionState";
import { GPU_FLOW_BROWSER_VISUAL_COLD_START_SHELL_FRAME_ID } from "./visibleFramePublicationAuthority";
import type {
  GpuFlowCommittedSurfacePublicationCandidate,
  GpuFlowCommittedSurfacePublicationCandidateInput,
  GpuFlowCommittedSurfacePublicationEffect,
  GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFramePublicationContentPlan";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowBlockedVisibleReason,
} from "./visibleFramePublicationTokens";

type GpuFlowBrowserVisualActorGeneration =
  GpuFlowCommittedSurfaceFrame["actorGenerations"][number];

type GpuFlowBrowserVisualTextCoverageProof = NonNullable<
  GpuFlowBrowserVisualActorGeneration["textCoverageProof"]
>;

type OptionalGpuFlowBrowserVisualTextCoverageProof =
  | GpuFlowBrowserVisualTextCoverageProof
  | null
  | undefined;

type GpuFlowCommittedSurfacePublicationTransactionDecision =
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

type GpuFlowCommittedSurfaceHeldPreviousPublicationTransaction = {
  readonly kind: "held-previous";
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
};

export type GpuFlowCommittedSurfacePublicationCandidateActionResolver = (
  input: {
    readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
    readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
  },
) => GpuFlowCommittedSurfacePublicationCandidateAction;

export type GpuFlowCommittedSurfacePublicationActionFrameResult = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowCommittedSurfacePublicationActionFrameResultResolver =
  (input: {
    readonly action: GpuFlowCommittedSurfacePublicationCandidateAction;
    readonly effect: GpuFlowCommittedSurfacePublicationEffect;
  }) => GpuFlowCommittedSurfacePublicationActionFrameResult;

export type GpuFlowCommittedSurfacePublicationFramePlan =
  | {
      readonly blockedPublicationCandidate: null;
      readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
      readonly kind: "publish";
      readonly visibleProjectionState: null;
    }
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
      readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
      readonly kind: "candidate";
      readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
    };

export type GpuFlowCommittedSurfacePublicationFramePlanResult =
  GpuFlowCommittedSurfacePublicationActionFrameResult;

export type GpuFlowCommittedSurfacePublicationFramePlanResultResolver =
  (input: {
    readonly framePlan: GpuFlowCommittedSurfacePublicationFramePlan;
  }) => GpuFlowCommittedSurfacePublicationFramePlanResult;

export type GpuFlowCommittedSurfacePublicationFramePlanSelector = (input: {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}) => GpuFlowCommittedSurfacePublicationFramePlan;

function decideGpuFlowCommittedSurfacePublicationTransaction({
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

export function prepareGpuFlowCommittedSurfacePublicationCandidate({
  committedGpuNativeVisuals,
  deferBrowserVisualRetry,
  frameReasons,
  heldPreviousProjectionState,
  liveProjectionSample,
  publicationLane,
  publishedCommittedSurfaceFrame,
  publishedRetainedFrame,
}: GpuFlowCommittedSurfacePublicationCandidateInput): GpuFlowCommittedSurfacePublicationCandidate {
  const transactionDecision =
    decideGpuFlowCommittedSurfacePublicationTransaction({
      heldPreviousProjectionState,
      publishedCommittedSurfaceFrame,
    });
  if (transactionDecision.kind === "publish") {
    return {
      effect: { kind: "publish" },
      kind: "publish",
    };
  }
  if (!publishedCommittedSurfaceFrame) {
    throw new Error(
      "GPU Flow committed surface publication transaction blocked without a candidate frame.",
    );
  }
  if (transactionDecision.kind === "blocked") {
    return {
      blockedPublicationCandidate:
        transactionDecision.blockedPublicationCandidate,
      candidateFrame: publishedCommittedSurfaceFrame,
      effect: {
        candidateFrame: publishedCommittedSurfaceFrame,
        deferRetry: deferBrowserVisualRetry === true,
        kind: "blocked",
        timestamp: liveProjectionSample.timestamp,
      },
      errorMessage: transactionDecision.errorMessage,
      kind: "blocked",
      preservePreparationSnapshot:
        shouldPreservePreparedCommittedSurfaceFrameForBrowserVisualRepair(
          transactionDecision.blockedPublicationCandidate,
        ),
    };
  }
  const heldPreviousTransaction =
    createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction({
      committedGpuNativeVisuals,
      frameReasons,
      heldPreviousProjectionState,
      liveProjectionSample,
      publicationLane,
      publishedRetainedFrame,
    });
  return {
    ...heldPreviousTransaction,
    effect: {
      candidateFrame: publishedCommittedSurfaceFrame,
      deferRetry: deferBrowserVisualRetry === true,
      kind: "held-previous",
      timestamp: liveProjectionSample.timestamp,
    },
  };
}

function createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction({
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

export function createGpuFlowCommittedSurfacePublicationCandidateActionResolver(): GpuFlowCommittedSurfacePublicationCandidateActionResolver {
  return resolveGpuFlowCommittedSurfacePublicationCandidateAction;
}

export function createGpuFlowCommittedSurfacePublicationActionFrameResultResolver(): GpuFlowCommittedSurfacePublicationActionFrameResultResolver {
  return resolveGpuFlowCommittedSurfacePublicationActionFrameResult;
}

export function createGpuFlowCommittedSurfacePublicationFramePlanResultResolver(): GpuFlowCommittedSurfacePublicationFramePlanResultResolver {
  return resolveGpuFlowCommittedSurfacePublicationFramePlanResult;
}

export function createGpuFlowCommittedSurfacePublicationFramePlanSelector(): GpuFlowCommittedSurfacePublicationFramePlanSelector {
  return selectGpuFlowCommittedSurfacePublicationFramePlan;
}

function selectGpuFlowCommittedSurfacePublicationFramePlan({
  candidate,
  publishedCommittedSurfaceFrame,
}: {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfacePublicationFramePlan {
  const action = resolveGpuFlowCommittedSurfacePublicationCandidateAction({
    candidate,
    publishedCommittedSurfaceFrame,
  });
  const result = resolveGpuFlowCommittedSurfacePublicationActionFrameResult({
    action,
    effect: candidate.effect,
  });
  if (action.kind !== "publish") {
    return {
      blockedPublicationCandidate: result.blockedPublicationCandidate,
      committedSurfacePublication: result.committedSurfacePublication,
      kind: "candidate" as const,
      visibleProjectionState: result.visibleProjectionState,
    };
  }
  return {
    blockedPublicationCandidate: null,
    committedSurfacePublication: result.committedSurfacePublication,
    kind: "publish" as const,
    visibleProjectionState: null,
  };
}

function resolveGpuFlowCommittedSurfacePublicationCandidateAction({
  candidate,
  publishedCommittedSurfaceFrame,
}: {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfacePublicationCandidateAction {
  switch (candidate.kind) {
    case "blocked":
      return {
        blockedSurfacePublication: candidate,
        kind: "blocked",
        visibleProjectionState: null,
      };
    case "held-previous":
      return {
        heldPreparedCommittedSurfaceFrame:
          publishedCommittedSurfaceFrame ?? null,
        kind: "held-previous",
        visibleProjectionState: candidate.visibleProjectionState,
      };
    case "publish":
      return {
        committedSurfaceFrame: publishedCommittedSurfaceFrame ?? null,
        kind: "publish",
      };
  }
}

function resolveGpuFlowCommittedSurfacePublicationFramePlanResult({
  framePlan,
}: {
  readonly framePlan: GpuFlowCommittedSurfacePublicationFramePlan;
}): GpuFlowCommittedSurfacePublicationFramePlanResult {
  return {
    blockedPublicationCandidate: framePlan.blockedPublicationCandidate,
    committedSurfacePublication: framePlan.committedSurfacePublication,
    visibleProjectionState: framePlan.visibleProjectionState,
  };
}

function resolveGpuFlowCommittedSurfacePublicationActionFrameResult({
  action,
  effect,
}: {
  readonly action: GpuFlowCommittedSurfacePublicationCandidateAction;
  readonly effect: GpuFlowCommittedSurfacePublicationEffect;
}): GpuFlowCommittedSurfacePublicationActionFrameResult {
  const committedSurfacePublication =
    createGpuFlowNodeLayerCommittedSurfacePublicationResult({
      action,
      effect,
    });
  if (action.kind === "publish") {
    return {
      blockedPublicationCandidate: null,
      committedSurfacePublication,
      visibleProjectionState: null,
    };
  }
  if (action.kind === "blocked") {
    return {
      blockedPublicationCandidate:
        action.blockedSurfacePublication.blockedPublicationCandidate,
      committedSurfacePublication,
      visibleProjectionState: null,
    };
  }
  return {
    blockedPublicationCandidate: null,
    committedSurfacePublication,
    visibleProjectionState: action.visibleProjectionState,
  };
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
