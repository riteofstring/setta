import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import {
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

type GpuFlowCommittedSurfacePublicationReadiness =
  | {
      readonly kind: "publish";
    }
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
      readonly errorMessage: string | null;
      readonly kind: "nonpublishable";
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
  readonly retainedDisplayBlockedPublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
}) => GpuFlowVisibleFrameBlockedPublicationCandidate | null;

export type GpuFlowRetainedProjectionPublicationCandidate =
  | {
      readonly blockedReason: null;
      readonly kind: "project-requested";
      readonly transaction: GpuFlowProjectionTransaction;
    }
  | {
      readonly blockedReason: string;
      readonly kind: "blocked-candidate";
      readonly transaction: GpuFlowProjectionTransaction;
    };

export type GpuFlowProjectionFrameTransactionSelector = (input: {
  readonly publicationCandidate: GpuFlowRetainedProjectionPublicationCandidate;
  readonly requestedRetainedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly resolveHeldRetainedProjectionFrame?: GpuFlowRetainedProjectionFrameResolver;
}) => GpuFlowProjectionFrameTransaction;

export type GpuFlowRetainedProjectionPublicationCandidateSelector = (input: {
  readonly hasActiveRetainedDomControl: boolean;
  readonly requestedProjectionCoverageMissing: boolean;
  readonly requestedTransaction: GpuFlowProjectionTransaction;
}) => GpuFlowRetainedProjectionPublicationCandidate;

export type GpuFlowVisiblePublicationCandidateOracle =
  GpuFlowVisiblePublicationContentDecisionKernel & {
    readonly createRetainedProjectionBlockedPublicationCandidate: typeof createGpuFlowRetainedProjectionBlockedPublicationCandidate;
    readonly createRetainedProjectionPublicationCandidateSelector: (input: {
      readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
      readonly rawReasons: readonly GpuFrameReason[];
    }) => GpuFlowRetainedProjectionPublicationCandidateSelector;
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
  deferBrowserVisualRetry,
  heldPreviousProjectionState,
  liveProjectionSample,
  publishedCommittedSurfaceFrame,
}: GpuFlowCommittedSurfacePublicationCandidateInput): GpuFlowCommittedSurfacePublicationCandidate {
  const publicationReadiness =
    resolveGpuFlowCommittedSurfacePublicationReadiness({
      heldPreviousProjectionState,
      publishedCommittedSurfaceFrame,
    });
  if (publicationReadiness.kind === "publish") {
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
  return {
    blockedPublicationCandidate: publicationReadiness.blockedPublicationCandidate,
    candidateFrame: publishedCommittedSurfaceFrame,
    effect: {
      candidateFrame: publishedCommittedSurfaceFrame,
      deferRetry: deferBrowserVisualRetry === true,
      kind: "rejected-candidate",
      timestamp: liveProjectionSample.timestamp,
    },
    errorMessage: publicationReadiness.errorMessage,
    kind: "nonpublishable",
    preservePreparationSnapshot:
      shouldPreservePreparedCommittedSurfaceFrameForBrowserVisualRepair(
        publicationReadiness.blockedPublicationCandidate,
      ),
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
    createRetainedProjectionPublicationCandidateSelector:
      createGpuFlowRetainedProjectionPublicationCandidateSelector,
    selectMotionProjectionFrameBlockedPublicationReason:
      selectGpuFlowMotionProjectionFrameBlockedPublicationReason,
    selectProjectionFrameTransaction:
      selectGpuFlowProjectionFrameTransactionFromPublicationCandidate,
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
    case "nonpublishable":
      return {
        blockedSurfacePublication: candidate,
        kind: "rejected-candidate",
        visibleProjectionState: null,
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
  if (action.kind === "rejected-candidate") {
    return {
      blockedPublicationCandidate:
        action.blockedSurfacePublication.blockedPublicationCandidate,
      committedSurfacePublication,
      visibleProjectionState: null,
    };
  }
  action satisfies never;
  throw new Error("Unknown GPU Flow committed surface publication action.");
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
    retainedDisplayBlockedPublicationCandidate,
  }) => {
    if (blockedCommittedSurfacePublicationCandidate) {
      return blockedCommittedSurfacePublicationCandidate;
    }
    if (retainedDisplayBlockedPublicationCandidate) {
      return retainedDisplayBlockedPublicationCandidate;
    }
    void previousVisibleProjectionState;
    return null;
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

function createGpuFlowRetainedProjectionPublicationCandidateSelector({
  previousVisibleProjectionState,
  rawReasons,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly rawReasons: readonly GpuFrameReason[];
}): GpuFlowRetainedProjectionPublicationCandidateSelector {
  void previousVisibleProjectionState;
  void rawReasons;
  return ({
    hasActiveRetainedDomControl,
    requestedProjectionCoverageMissing,
    requestedTransaction,
  }) =>
    prepareGpuFlowRetainedProjectionPublicationCandidate({
      hasActiveRetainedDomControl,
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

function selectGpuFlowProjectionFrameTransactionFromPublicationCandidate({
  publicationCandidate,
  requestedRetainedProjectionFrame,
}: {
  readonly publicationCandidate: GpuFlowRetainedProjectionPublicationCandidate;
  readonly requestedRetainedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly resolveHeldRetainedProjectionFrame?: GpuFlowRetainedProjectionFrameResolver;
}): GpuFlowProjectionFrameTransaction {
  if (publicationCandidate.kind === "project-requested") {
    return {
      blockedReason: null,
      heldPreviousProjection: null,
      retainedProjectionFrame: requestedRetainedProjectionFrame,
      transaction: publicationCandidate.transaction,
    };
  }
  return {
    blockedReason: publicationCandidate.blockedReason,
    heldPreviousProjection: null,
    retainedProjectionFrame: requestedRetainedProjectionFrame,
    transaction: publicationCandidate.transaction,
  };
}

function prepareGpuFlowRetainedProjectionPublicationCandidate({
  hasActiveRetainedDomControl,
  requestedProjectionCoverageMissing,
  requestedTransaction,
}: {
  readonly hasActiveRetainedDomControl: boolean;
  readonly requestedProjectionCoverageMissing: boolean;
  readonly requestedTransaction: GpuFlowProjectionTransaction;
}): GpuFlowRetainedProjectionPublicationCandidate {
  if (!requestedProjectionCoverageMissing || hasActiveRetainedDomControl) {
    return {
      blockedReason: null,
      kind: "project-requested",
      transaction: requestedTransaction,
    };
  }
  return {
    blockedReason: "retained-projection-coverage-missing",
    kind: "blocked-candidate",
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

function resolveGpuFlowCommittedSurfacePublicationReadiness({
  heldPreviousProjectionState,
  publishedCommittedSurfaceFrame,
}: {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfacePublicationReadiness {
  if (
    !publishedCommittedSurfaceFrame ||
    publishedCommittedSurfaceFrame.publishability.kind === "publishable"
  ) {
    return {
      kind: "publish",
    };
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
    kind: "nonpublishable",
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
