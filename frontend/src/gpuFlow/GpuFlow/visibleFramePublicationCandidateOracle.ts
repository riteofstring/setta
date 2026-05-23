import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowHeldPreviousProjection,
  createGpuFlowProjectionTransactionForCommittedFrameId,
  DEFAULT_GPU_FLOW_PROJECTION_SCHEDULER_KNOBS,
  type GpuFlowHeldPreviousProjection,
  type GpuFlowProjectionSchedulerKnobs,
  type GpuFlowProjectionTransaction,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
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
import type { GpuFlowRetainedProjectionFrame } from "./visibleFramePublicationKernelProjectionCoverage";
import type {
  GpuFlowMotionProjectionFrameWithWorkReport,
  GpuFlowMotionProjectionFrameWorkReport,
  GpuFlowMotionProjectionFrameWorkResult,
} from "./visibleFramePublicationKernelProjectionWorkTypes";
import type {
  GpuFlowProjectionFrameTransaction,
  GpuFlowRetainedProjectionFrameResolver,
} from "./visibleFramePublicationProjectionPlan";

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

type GpuFlowCommittedSurfacePublicationFramePlanResultResolver = (input: {
  readonly framePlan: GpuFlowCommittedSurfacePublicationFramePlan;
}) => GpuFlowCommittedSurfacePublicationFramePlanResult;

type GpuFlowCommittedSurfacePublicationFramePlanSelector = (input: {
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

type GpuFlowRetainedDisplayPublicationFramePlanSelector = (input: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];
}) => GpuFlowRetainedDisplayPublicationFramePlan;

type GpuFlowRetainedDisplayPublicationFramePlanResultResolver = (input: {
  readonly framePlan: GpuFlowRetainedDisplayPublicationFramePlan;
}) => GpuFlowRetainedDisplayOutcomeFrameResult;

type GpuFlowContentPublicationBlockedCandidateSelector = (input: {
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

export type GpuFlowProjectionFrameTransactionSelector = (input: {
  readonly publicationDecision: GpuFlowRetainedProjectionPublicationTransactionDecision;
  readonly requestedRetainedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly resolveHeldRetainedProjectionFrame: GpuFlowRetainedProjectionFrameResolver;
}) => GpuFlowProjectionFrameTransaction;

export type GpuFlowRetainedProjectionPublicationDecisionSelector = (input: {
  readonly hasActiveRetainedDomControl: boolean;
  readonly projectionSchedulerKnobs?:
    | GpuFlowProjectionSchedulerKnobs
    | undefined;
  readonly requestedProjectionCoverageMissing: boolean;
  readonly requestedTransaction: GpuFlowProjectionTransaction;
}) => GpuFlowRetainedProjectionPublicationTransactionDecision;

export type GpuFlowVisiblePublicationCandidateOracle =
  GpuFlowVisiblePublicationContentDecisionKernel & {
    readonly createRetainedProjectionBlockedPublicationCandidate: typeof createGpuFlowRetainedProjectionBlockedPublicationCandidate;
    readonly createRetainedProjectionPublicationDecisionSelector: (input: {
      readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
      readonly rawReasons: readonly GpuFrameReason[];
    }) => GpuFlowRetainedProjectionPublicationDecisionSelector;
    readonly selectMotionProjectionFrameBlockedPublicationReason: (
      frame: unknown,
    ) => string | null;
    readonly selectProjectionFrameTransaction: GpuFlowProjectionFrameTransactionSelector;
  };

export type GpuFlowVisiblePublicationContentDecisionKernel = {
  readonly createVisibleProjectionStateForRetainedPublication: (
    input: GpuFlowRetainedPublicationVisibleProjectionStateInput,
  ) => GpuFlowVisibleProjectionState;
  readonly prepareCommittedSurfacePublicationCandidate: (
    input: GpuFlowCommittedSurfacePublicationCandidateInput,
  ) => GpuFlowCommittedSurfacePublicationCandidate;
  readonly resolveCommittedSurfacePublicationFramePlanResult: GpuFlowCommittedSurfacePublicationFramePlanResultResolver;
  readonly resolveRetainedDisplayPublicationFramePlanResult: GpuFlowRetainedDisplayPublicationFramePlanResultResolver;
  readonly selectCommittedSurfacePublicationFramePlan: GpuFlowCommittedSurfacePublicationFramePlanSelector;
  readonly selectContentPublicationBlockedCandidateForFrameResult: (input: {
    readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
    readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  }) => GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly selectRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanSelector;
};

type GpuFlowRetainedPublicationVisibleProjectionStateInput = Pick<
  GpuFlowCommittedSurfacePublicationCandidateInput,
  | "committedGpuNativeVisuals"
  | "frameReasons"
  | "heldPreviousProjectionState"
  | "liveProjectionSample"
  | "publicationLane"
  | "publishedCommittedSurfaceFrame"
  | "publishedRetainedFrame"
> & {
  readonly retainedDisplayOutcomeKind: string;
};

export type GpuFlowRetainedDisplayPublicationOutcomeFrame =
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

export function createGpuFlowVisiblePublicationContentDecisionKernel(): GpuFlowVisiblePublicationContentDecisionKernel {
  return createGpuFlowVisiblePublicationContentDecisionKernelMethods();
}

export function createGpuFlowVisiblePublicationCandidateOracle(): GpuFlowVisiblePublicationCandidateOracle {
  return Object.freeze({
    ...createGpuFlowVisiblePublicationContentDecisionKernelMethods(),
    createRetainedProjectionBlockedPublicationCandidate:
      createGpuFlowRetainedProjectionBlockedPublicationCandidate,
    createRetainedProjectionPublicationDecisionSelector:
      createGpuFlowRetainedProjectionPublicationDecisionSelector,
    selectMotionProjectionFrameBlockedPublicationReason:
      selectGpuFlowMotionProjectionFrameBlockedPublicationReason,
    selectProjectionFrameTransaction:
      selectGpuFlowProjectionFrameTransactionFromPublicationDecision,
  });
}

export function selectGpuFlowRetainedDisplayPublicationFramePlan({
  previousVisibleProjectionState,
  retainedDisplayOutcome,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];
}) {
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

function selectGpuFlowMotionProjectionFrameBlockedPublicationReason(
  frame: unknown,
): string | null {
  if (!hasGpuFlowMotionProjectionFrameWorkReport(frame)) {
    return null;
  }
  const workReport = frame.projectionOnlyFrameWork ?? null;
  if (!workReport) {
    return null;
  }
  return selectGpuFlowMotionProjectionFrameWorkBlockedReason(workReport);
}

function createGpuFlowRetainedProjectionPublicationDecisionSelector({
  previousVisibleProjectionState,
  rawReasons,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly rawReasons: readonly GpuFrameReason[];
}): GpuFlowRetainedProjectionPublicationDecisionSelector {
  return ({
    hasActiveRetainedDomControl,
    projectionSchedulerKnobs,
    requestedProjectionCoverageMissing,
    requestedTransaction,
  }) =>
    decideGpuFlowRetainedProjectionPublicationTransaction({
      frameReasons: rawReasons,
      hasActiveRetainedDomControl,
      heldPreviousProjectionState: previousVisibleProjectionState,
      projectionSchedulerKnobs,
      requestedProjectionCoverageMissing,
      requestedTransaction,
    });
}

function createGpuFlowVisiblePublicationContentDecisionKernelMethods(): GpuFlowVisiblePublicationContentDecisionKernel {
  return Object.freeze({
    createVisibleProjectionStateForRetainedPublication:
      createGpuFlowVisibleProjectionStateForRetainedPublication,
    prepareCommittedSurfacePublicationCandidate:
      prepareGpuFlowCommittedSurfacePublicationCandidate,
    resolveCommittedSurfacePublicationFramePlanResult:
      resolveGpuFlowCommittedSurfacePublicationFramePlanResult,
    resolveRetainedDisplayPublicationFramePlanResult:
      resolveGpuFlowRetainedDisplayPublicationFramePlanResult,
    selectCommittedSurfacePublicationFramePlan:
      selectGpuFlowCommittedSurfacePublicationFramePlan,
    selectContentPublicationBlockedCandidateForFrameResult: ({
      nodeLayerFrameResult,
      previousVisibleProjectionState,
    }) => {
      const selectContentPublicationBlockedCandidate =
        selectGpuFlowContentPublicationBlockedCandidate({
          previousVisibleProjectionState,
        });
      return selectGpuFlowContentPublicationBlockedCandidateForFrameResult({
        nodeLayerFrameResult,
        selectContentPublicationBlockedCandidate,
      });
    },
    selectRetainedDisplayPublicationFramePlan:
      selectGpuFlowRetainedDisplayPublicationFramePlan,
  });
}

function selectGpuFlowProjectionFrameTransactionFromPublicationDecision({
  publicationDecision,
  requestedRetainedProjectionFrame,
  resolveHeldRetainedProjectionFrame,
}: {
  readonly publicationDecision: GpuFlowRetainedProjectionPublicationTransactionDecision;
  readonly requestedRetainedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly resolveHeldRetainedProjectionFrame: GpuFlowRetainedProjectionFrameResolver;
}): GpuFlowProjectionFrameTransaction {
  if (publicationDecision.kind === "project-requested") {
    return {
      blockedReason: null,
      heldPreviousProjection: null,
      retainedProjectionFrame: requestedRetainedProjectionFrame,
      transaction: publicationDecision.transaction,
    };
  }
  if (publicationDecision.kind === "blocked") {
    return {
      blockedReason: publicationDecision.blockedReason,
      heldPreviousProjection: publicationDecision.heldPreviousProjection,
      retainedProjectionFrame: requestedRetainedProjectionFrame,
      transaction: publicationDecision.transaction,
    };
  }
  const heldProjectionFrame = resolveHeldRetainedProjectionFrame({
    transaction: publicationDecision.transaction,
  });
  return {
    blockedReason: null,
    heldPreviousProjection: publicationDecision.heldPreviousProjection,
    retainedProjectionFrame: {
      ...heldProjectionFrame,
      needsRetainedPageMaintenance:
        heldProjectionFrame.needsRetainedPageMaintenance ||
        requestedRetainedProjectionFrame.needsRetainedPageMaintenance,
    },
    transaction: publicationDecision.transaction,
  };
}

function decideGpuFlowRetainedProjectionPublicationTransaction({
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

function selectGpuFlowMotionProjectionFrameWorkBlockedReason({
  layerResult,
  projectionLane,
  transactionKind,
}: GpuFlowMotionProjectionFrameWorkReport): string | null {
  if (
    projectionLane !== "motion" ||
    (transactionKind !== "motion-projection" &&
      transactionKind !== "held-previous")
  ) {
    return null;
  }
  if (
    hasGpuFlowProjectionOnlyForbiddenContentWork({
      budgetExhausted: layerResult.budgetExhausted,
      blockedWork: createGpuFlowProjectionOnlyBlockedWork(layerResult),
    })
  ) {
    return "projection-only-content-work";
  }
  return null;
}

function hasGpuFlowMotionProjectionFrameWorkReport(
  frame: unknown,
): frame is GpuFlowMotionProjectionFrameWithWorkReport {
  return frame !== null && typeof frame === "object";
}

function createGpuFlowProjectionOnlyBlockedWork(
  layerResult: Omit<GpuFlowMotionProjectionFrameWorkResult, "budgetExhausted">,
) {
  return {
    deferredNodeIds: layerResult.deferredNodeIds,
    evictedTextureBytes: layerResult.evictedTextureBytes,
    evictedTextureNodeIds: layerResult.evictedTextureNodeIds,
    missingElementNodeIds: layerResult.missingElementNodeIds,
    remainingDirtyNodeIds: layerResult.remainingDirtyNodeIds,
    skippedNodeIds: layerResult.skippedNodeIds,
    uploadedNodeIds: layerResult.uploadedNodeIds,
  };
}

function hasGpuFlowProjectionOnlyForbiddenContentWork({
  blockedWork,
  budgetExhausted,
}: {
  readonly blockedWork: ReturnType<
    typeof createGpuFlowProjectionOnlyBlockedWork
  >;
  readonly budgetExhausted: boolean;
}): boolean {
  return [
    budgetExhausted,
    blockedWork.evictedTextureBytes > 0,
    blockedWork.evictedTextureNodeIds.length > 0,
    blockedWork.uploadedNodeIds.length > 0,
  ].some(Boolean);
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

function isGpuFlowRetainedProjectionHeldPreviousOverBudget(
  heldPreviousProjection: GpuFlowHeldPreviousProjection,
): boolean {
  return Boolean(
    heldPreviousProjection.maxHeldPreviousFramesExceeded ||
      heldPreviousProjection.maxHeldPreviousMsExceeded,
  );
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
