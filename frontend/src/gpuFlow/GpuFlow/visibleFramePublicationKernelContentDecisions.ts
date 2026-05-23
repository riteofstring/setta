import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowVisibleProjectionState } from "../projectionRuntime";
import type { GpuFlowCommittedSurfacePublicationCandidateAction } from "./flowCommittedSurfacePublicationCandidateHandling";
import {
  createGpuFlowNodeLayerCommittedSurfacePublicationResult,
  type GpuFlowNodeLayerCommittedSurfacePublicationResult,
  type GpuFlowNodeLayerFrameResult,
} from "./flowFrameResult";
import type { GpuFlowRetainedDisplayPublicationResult } from "./flowRetainedDisplayTransaction";
import { createGpuFlowVisibleProjectionStateForRetainedPublication } from "./flowVisibleProjectionState";
import {
  createGpuFlowBrowserVisualBlockedPublicationCandidate,
  createGpuFlowRetainedProjectionBlockedPublicationCandidate,
  getGpuFlowCommittedSurfacePublishabilityActorIds,
  shouldPreservePreparedCommittedSurfaceFrameForBrowserVisualRepair,
} from "./visibleFramePublicationBlockedCandidate";
import type {
  GpuFlowCommittedSurfacePublicationCandidate,
  GpuFlowCommittedSurfacePublicationCandidateInput,
  GpuFlowCommittedSurfacePublicationEffect,
  GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFramePublicationContentPlan";

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

type GpuFlowRetainedDisplayPublicationOutcome =
  GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];

type GpuFlowRetainedDisplayPublicationOutcomeFrame =
  | {
      readonly kind: "blocked";
      readonly reason: string;
    }
  | {
      readonly frame: Extract<
        GpuFlowRetainedDisplayPublicationOutcome,
        { readonly frame: unknown }
      >["frame"];
      readonly kind: "published";
      readonly outcome: Extract<
        GpuFlowRetainedDisplayPublicationOutcome,
        { readonly frame: unknown }
      >;
      readonly outcomeKind: Extract<
        GpuFlowRetainedDisplayPublicationOutcome,
        { readonly frame: unknown }
      >["kind"];
    };

export type GpuFlowCommittedSurfacePublicationActionFrameResult = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

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

export type GpuFlowRetainedDisplayOutcomeFrameResult =
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
      readonly publishedOutcomeFrame: null;
    }
  | {
      readonly blockedPublicationCandidate: null;
      readonly publishedOutcomeFrame: Extract<
        GpuFlowRetainedDisplayPublicationOutcomeFrame,
        { readonly kind: "published" }
      >;
    };

export type GpuFlowRetainedDisplayPublicationFramePlan =
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
      readonly kind: "blocked";
    }
  | {
      readonly kind: "published";
      readonly publishedOutcomeFrame: Extract<
        GpuFlowRetainedDisplayPublicationOutcomeFrame,
        { readonly kind: "published" }
      >;
    };

export type GpuFlowRetainedDisplayPublicationFramePlanSelector = (input: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];
}) => GpuFlowRetainedDisplayPublicationFramePlan;

export type GpuFlowRetainedDisplayPublicationFramePlanResultResolver =
  (input: {
    readonly framePlan: GpuFlowRetainedDisplayPublicationFramePlan;
  }) => GpuFlowRetainedDisplayOutcomeFrameResult;

export type GpuFlowContentPublicationBlockedCandidateSelector = (input: {
  readonly blockedCommittedSurfacePublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
  readonly committedSurfacePublicationEffect?:
    | GpuFlowCommittedSurfacePublicationEffect
    | null
    | undefined;
  readonly retainedDisplayBlockedPublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
}) => GpuFlowVisibleFrameBlockedPublicationCandidate | null;

export type GpuFlowContentPublicationBlockedCandidateForFrameResultSelector =
  (input: {
    readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  }) => GpuFlowVisibleFrameBlockedPublicationCandidate | null;

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

export function createGpuFlowRetainedDisplayPublicationFramePlanSelector(): GpuFlowRetainedDisplayPublicationFramePlanSelector {
  return selectGpuFlowRetainedDisplayPublicationFramePlan;
}

export function createGpuFlowCommittedSurfacePublicationFramePlanResultResolver(): GpuFlowCommittedSurfacePublicationFramePlanResultResolver {
  return resolveGpuFlowCommittedSurfacePublicationFramePlanResult;
}

export function createGpuFlowCommittedSurfacePublicationFramePlanSelector(): GpuFlowCommittedSurfacePublicationFramePlanSelector {
  return selectGpuFlowCommittedSurfacePublicationFramePlan;
}

export function createGpuFlowRetainedDisplayPublicationFramePlanResultResolver(): GpuFlowRetainedDisplayPublicationFramePlanResultResolver {
  return resolveGpuFlowRetainedDisplayPublicationFramePlanResult;
}

export function createGpuFlowContentPublicationBlockedCandidateSelector({
  previousVisibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationBlockedCandidateSelector {
  return selectGpuFlowContentPublicationBlockedCandidate({
    previousVisibleProjectionState,
  });
}

export function createGpuFlowContentPublicationBlockedCandidateForFrameResultSelector({
  previousVisibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationBlockedCandidateForFrameResultSelector {
  const selectContentPublicationBlockedCandidate =
    selectGpuFlowContentPublicationBlockedCandidate({
      previousVisibleProjectionState,
    });
  return ({ nodeLayerFrameResult }) =>
    selectGpuFlowContentPublicationBlockedCandidateForFrameResult({
      nodeLayerFrameResult,
      selectContentPublicationBlockedCandidate,
    });
}

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

function createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction({
  committedGpuNativeVisuals,
  frameReasons,
  heldPreviousProjectionState,
  liveProjectionSample,
  publicationLane,
  publishedRetainedFrame,
}: Pick<
  GpuFlowCommittedSurfacePublicationCandidateInput,
  | "committedGpuNativeVisuals"
  | "frameReasons"
  | "heldPreviousProjectionState"
  | "liveProjectionSample"
  | "publicationLane"
  | "publishedRetainedFrame"
>): GpuFlowCommittedSurfaceHeldPreviousPublicationTransaction {
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

function selectGpuFlowRetainedDisplayPublicationFramePlan({
  previousVisibleProjectionState,
  retainedDisplayOutcome,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];
}): GpuFlowRetainedDisplayPublicationFramePlan {
  const outcomeFrame = resolveGpuFlowRetainedDisplayPublicationOutcomeFrame(
    retainedDisplayOutcome,
  );
  if (outcomeFrame.kind !== "blocked") {
    return {
      kind: "published" as const,
      publishedOutcomeFrame: outcomeFrame,
    };
  }
  return {
    blockedPublicationCandidate:
      createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: outcomeFrame.reason,
        heldPreviousProjectionState: previousVisibleProjectionState,
      }),
    kind: "blocked" as const,
  };
}

function resolveGpuFlowRetainedDisplayPublicationFramePlanResult({
  framePlan,
}: {
  readonly framePlan: GpuFlowRetainedDisplayPublicationFramePlan;
}): GpuFlowRetainedDisplayOutcomeFrameResult {
  if (framePlan.kind === "blocked") {
    return {
      blockedPublicationCandidate: framePlan.blockedPublicationCandidate,
      publishedOutcomeFrame: null,
    };
  }
  return {
    blockedPublicationCandidate: null,
    publishedOutcomeFrame: framePlan.publishedOutcomeFrame,
  };
}

function resolveGpuFlowRetainedDisplayPublicationOutcomeFrame(
  outcome: GpuFlowRetainedDisplayPublicationOutcome,
): GpuFlowRetainedDisplayPublicationOutcomeFrame {
  if (outcome.kind === "block-cold-first-coverage") {
    return {
      kind: "blocked",
      reason: outcome.reason,
    };
  }
  return {
    frame: outcome.frame,
    kind: "published",
    outcome,
    outcomeKind: outcome.kind,
  };
}

function selectGpuFlowContentPublicationBlockedCandidate({
  previousVisibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationBlockedCandidateSelector {
  return ({
    blockedCommittedSurfacePublicationCandidate,
    committedSurfacePublicationEffect,
    retainedDisplayBlockedPublicationCandidate,
  }) => {
    if (blockedCommittedSurfacePublicationCandidate) {
      return blockedCommittedSurfacePublicationCandidate;
    }
    if (retainedDisplayBlockedPublicationCandidate) {
      return retainedDisplayBlockedPublicationCandidate;
    }
    if (committedSurfacePublicationEffect?.kind !== "held-previous") {
      return null;
    }
    return createGpuFlowBrowserVisualBlockedPublicationCandidate({
      frame: committedSurfacePublicationEffect.candidateFrame,
      heldPreviousProjectionState: previousVisibleProjectionState,
    });
  };
}

function selectGpuFlowContentPublicationBlockedCandidateForFrameResult({
  nodeLayerFrameResult,
  selectContentPublicationBlockedCandidate,
}: {
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly selectContentPublicationBlockedCandidate: GpuFlowContentPublicationBlockedCandidateSelector;
}): GpuFlowVisibleFrameBlockedPublicationCandidate | null {
  const committedSurfacePublication =
    nodeLayerFrameResult.committedSurfacePublication;
  return selectContentPublicationBlockedCandidate({
    blockedCommittedSurfacePublicationCandidate:
      committedSurfacePublication.blockedSurfacePublication
        ?.blockedPublicationCandidate ?? null,
    committedSurfacePublicationEffect:
      committedSurfacePublication.committedSurfacePublicationEffect,
    retainedDisplayBlockedPublicationCandidate:
      nodeLayerFrameResult.blockedPublicationCandidate,
  });
}
