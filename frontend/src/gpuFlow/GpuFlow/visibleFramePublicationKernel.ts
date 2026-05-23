import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import {
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionLane,
  type GpuFlowProjectionSchedulerKnobs,
  type GpuFlowProjectionTransaction,
  type GpuFlowVisibleProjectionState,
  type GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import {
  notifyGpuFlowRetainedDisplayFollowUpFrameNeeded,
  resolveGpuFlowRetainedDisplayPublication,
  type GpuFlowRetainedDisplayPublicationInput,
  type GpuFlowRetainedDisplayPublicationResult,
} from "./flowRetainedDisplayTransaction";
import {
  createGpuFlowBrowserVisualBlockedPublicationCandidate,
  createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction,
  createGpuFlowRetainedProjectionBlockedPublicationCandidate,
  decideGpuFlowCommittedSurfacePublicationTransaction,
  decideGpuFlowRetainedProjectionPublicationTransaction,
  shouldPreservePreparedCommittedSurfaceFrameForBrowserVisualRepair,
  type GpuFlowRetainedProjectionPublicationTransactionDecision,
} from "./visibleFramePublicationCandidates";
import {
  completeGpuFlowVisibleFramePublicationTransaction,
  createGpuFlowVisibleFrameBlockedPublicationToken,
  type GpuFlowVisiblePublicationTransactionCompletion,
} from "./visibleFramePublicationCompletion";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanSelector,
  createGpuFlowRetainedDisplayPublicationFramePlanSelector,
  type GpuFlowCommittedSurfacePublicationCandidate,
  type GpuFlowCommittedSurfacePublicationEffect,
  type GpuFlowCommittedSurfacePublicationFramePlanSelector,
  type GpuFlowRetainedDisplayPublicationFramePlanSelector,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFramePublicationContentPlan";
import {
  createGpuFlowContentPublicationWorkPlan,
  createGpuFlowMotionProjectionWorkPlan,
  type GpuFlowContentPublicationWorkPlan,
  type GpuFlowMotionProjectionWorkPlan,
} from "./visibleFramePublicationKernelWorkPlan";
import {
  createGpuFlowVisibleFramePublicationTransactionOracle,
  type GpuFlowVisibleFramePublicationContentCandidate,
  type GpuFlowVisibleFramePublicationMotionCandidate,
  type GpuFlowVisibleFramePublicationPreparedCandidateSetFrame,
  type GpuFlowVisibleFramePublicationPreparedFrame,
  type GpuFlowVisibleFramePublicationTransactionOracle,
} from "./visibleFramePublicationOracle";
import {
  createGpuFlowProjectionFrameRenderPlanSelector,
  createGpuFlowProjectionFrameTransactionSelector,
  type GpuFlowProjectionFrameRenderPlanSelector,
  type GpuFlowProjectionFrameTransactionSelector,
} from "./visibleFramePublicationProjectionPlan";
import type { GpuFlowBlockedPublicationToken } from "./visibleFramePublicationTokens";

export { assertGpuFlowCommittedSurfacePublicationCandidatePublished } from "./flowCommittedSurfacePublicationCandidateHandling";
export type { GpuFlowCommittedSurfacePublicationCandidateAction } from "./flowCommittedSurfacePublicationCandidateHandling";
export {
  createGpuFlowBlockedVisibleReasons,
  createGpuFlowBrowserVisualBlockedPublicationCandidate,
  createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction,
  createGpuFlowRetainedProjectionBlockedPublicationCandidate,
  decideGpuFlowCommittedSurfacePublicationTransaction,
  decideGpuFlowRetainedProjectionPublicationTransaction,
  getGpuFlowBrowserVisualBlockedReason,
  getGpuFlowCommittedSurfacePublishabilityActorIds,
  hasActiveGpuFlowRetainedDomControlPublicationProof,
} from "./visibleFramePublicationCandidates";
export type {
  GpuFlowCommittedSurfaceHeldPreviousPublicationTransaction,
  GpuFlowCommittedSurfacePublicationTransactionDecision,
  GpuFlowRetainedProjectionPublicationTransactionDecision,
} from "./visibleFramePublicationCandidates";
export {
  completeGpuFlowVisibleFramePublicationTransaction,
  createGpuFlowCommittedSurfaceResetPublicationToken,
  createGpuFlowCommittedSurfaceStartupPublicationToken,
  createGpuFlowVisibleFrameBlockedPublicationToken,
  createGpuFlowVisibleFrameCommitPublicationToken,
  createGpuFlowVisibleFrameHoldPreviousToken,
  createGpuFlowVisiblePublicationCompletionCommitToken,
  createGpuFlowVisiblePublicationCompletionHoldOutcome,
  createGpuFlowVisiblePublicationCompletionOutcome,
  createGpuFlowVisiblePublicationTransactionReport,
} from "./visibleFramePublicationCompletion";
export type {
  GpuFlowVisiblePublicationCompletion,
  GpuFlowVisiblePublicationOutcome,
  GpuFlowVisiblePublicationTransactionCompletion,
} from "./visibleFramePublicationCompletion";
export {
  createGpuFlowCommittedSurfacePublicationActionFrameResultResolver,
  createGpuFlowCommittedSurfacePublicationCandidateActionResolver,
  createGpuFlowCommittedSurfacePublicationFramePlanSelector,
  createGpuFlowRetainedDisplayOutcomeFrameResultResolver,
  createGpuFlowRetainedDisplayPublicationFramePlanSelector,
  createGpuFlowRetainedDisplayPublicationOutcomeFrameResolver,
  resolveGpuFlowCommittedSurfacePublicationActionFrameResult,
  resolveGpuFlowRetainedDisplayOutcomeFrameResult,
  selectGpuFlowCommittedSurfacePublicationFramePlan,
  selectGpuFlowRetainedDisplayPublicationFramePlan,
} from "./visibleFramePublicationContentPlan";
export type {
  GpuFlowCommittedSurfacePublicationActionFrameResult,
  GpuFlowCommittedSurfacePublicationActionFrameResultResolver,
  GpuFlowCommittedSurfacePublicationCandidate,
  GpuFlowCommittedSurfacePublicationCandidateActionResolver,
  GpuFlowCommittedSurfacePublicationEffect,
  GpuFlowCommittedSurfacePublicationFramePlan,
  GpuFlowCommittedSurfacePublicationFramePlanSelector,
  GpuFlowRetainedDisplayOutcomeFrameResult,
  GpuFlowRetainedDisplayOutcomeFrameResultResolver,
  GpuFlowRetainedDisplayPublicationFramePlan,
  GpuFlowRetainedDisplayPublicationFramePlanSelector,
  GpuFlowRetainedDisplayPublicationOutcomeFrameResolver,
  GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFramePublicationContentPlan";
export {
  createGpuFlowContentPublicationWorkPlan,
  createGpuFlowMotionProjectionWorkPlan,
  shouldConsiderGpuFlowDeferredContentPublication,
  shouldDeferGpuFlowBrowserVisualRetryForPublication,
} from "./visibleFramePublicationKernelWorkPlan";
export type {
  GpuFlowContentPublicationWorkPlan,
  GpuFlowMotionProjectionWorkPlan,
} from "./visibleFramePublicationKernelWorkPlan";
export {
  createGpuFlowVisibleFramePublicationTransactionOracle,
  createGpuFlowVisiblePublicationCommitDebtProof,
  createGpuFlowVisiblePublicationCommitOracle,
  selectGpuFlowVisibleFramePublicationPreparedFrame,
} from "./visibleFramePublicationOracle";
export type {
  GpuFlowVisibleFramePublicationCandidateSet,
  GpuFlowVisibleFramePublicationContentCandidate,
  GpuFlowVisibleFramePublicationMotionCandidate,
  GpuFlowVisibleFramePublicationPreparedCandidateSet,
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrame,
  GpuFlowVisibleFramePublicationPreparedFrame,
  GpuFlowVisibleFramePublicationTransactionOracle,
  GpuFlowVisiblePublicationCommitDebtProof,
  GpuFlowVisiblePublicationCommitOracle,
} from "./visibleFramePublicationOracle";
export {
  createGpuFlowProjectionFrameRenderPlanSelector,
  createGpuFlowProjectionFrameTransactionSelector,
  selectGpuFlowProjectionFrameRenderPlan,
  selectGpuFlowProjectionFrameTransactionFromPublicationDecision,
} from "./visibleFramePublicationProjectionPlan";
export type {
  GpuFlowProjectionFrameRenderPlan,
  GpuFlowProjectionFrameRenderPlanSelector,
  GpuFlowProjectionFrameTransaction,
  GpuFlowProjectionFrameTransactionSelector,
  GpuFlowRetainedProjectionFrameResolver,
} from "./visibleFramePublicationProjectionPlan";

type GpuFlowVisiblePublicationScheduler = ReturnType<
  typeof createGpuFlowVisiblePublicationScheduler
>;

export type GpuFlowCommittedSurfacePublicationCandidateInput = Parameters<
  typeof prepareGpuFlowCommittedSurfacePublicationCandidate
>[0];

export type GpuFlowCommittedSurfacePublicationCandidatePreparer = (
  input: GpuFlowCommittedSurfacePublicationCandidateInput,
) => GpuFlowCommittedSurfacePublicationCandidate;

export type GpuFlowRetainedDisplayPublicationPreparer = (
  input: GpuFlowRetainedDisplayPublicationInput,
) => GpuFlowRetainedDisplayPublicationResult;

export type GpuFlowRetainedDisplayFollowUpFrameNotifier =
  typeof notifyGpuFlowRetainedDisplayFollowUpFrameNeeded;

export type GpuFlowContentPublicationBlockedCandidateSelector = (input: {
  readonly blockedCommittedSurfacePublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
  readonly committedSurfacePublicationEffect?:
    | GpuFlowCommittedSurfacePublicationEffect
    | null
    | undefined;
  readonly retainedProjectionBlockedReason?: string | null | undefined;
}) => GpuFlowVisibleFrameBlockedPublicationCandidate | null;

export type GpuFlowVisibleFramePublicationFrameContext = {
  readonly deferResolutionUpdates: boolean;
  readonly viewportFrame: boolean;
};

export type GpuFlowRetainedProjectionPublicationDecisionSelector = (input: {
  readonly hasActiveRetainedDomControl: boolean;
  readonly projectionSchedulerKnobs?:
    | GpuFlowProjectionSchedulerKnobs
    | undefined;
  readonly requestedProjectionCoverageMissing: boolean;
  readonly requestedTransaction: GpuFlowProjectionTransaction;
}) => GpuFlowRetainedProjectionPublicationTransactionDecision;

export type GpuFlowVisibleFramePublicationKernelResult<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame,
> = GpuFlowVisiblePublicationTransactionCompletion & {
  readonly preparedFrame: PreparedFrame;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
};

export function runGpuFlowVisibleFramePublicationCandidateSetKernel<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  hasCommittedContentFrame,
  prepareContentPublicationFrame,
  prepareMotionProjectionFrame,
  previousVisibleProjectionState,
  publish,
  rawReasons,
  runtimeViewportFrame,
  sample,
  scheduler,
  timestamp,
  viewportInteractionActive,
}: {
  readonly hasCommittedContentFrame: boolean;
  readonly prepareContentPublicationFrame: (input: {
    readonly contentPublicationWorkPlan: GpuFlowContentPublicationWorkPlan;
    readonly motionProjectionFrame: MotionProjectionFrame;
    readonly publicationDecision: GpuFlowVisiblePublicationDecision;
    readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
    readonly prepareCommittedSurfacePublicationCandidate: GpuFlowCommittedSurfacePublicationCandidatePreparer;
    readonly prepareRetainedDisplayPublicationCandidate: GpuFlowRetainedDisplayPublicationPreparer;
    readonly notifyRetainedDisplayFollowUpFrameNeeded: GpuFlowRetainedDisplayFollowUpFrameNotifier;
    readonly selectCommittedSurfacePublicationFramePlan: GpuFlowCommittedSurfacePublicationFramePlanSelector;
    readonly selectContentPublicationBlockedCandidate: GpuFlowContentPublicationBlockedCandidateSelector;
    readonly selectRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanSelector;
  }) => ContentPublicationFrame;
  readonly prepareMotionProjectionFrame: (input: {
    readonly motionProjectionWorkPlan: GpuFlowMotionProjectionWorkPlan;
    readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
    readonly publicationDecision: GpuFlowVisiblePublicationDecision;
    readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
    readonly selectProjectionFrameRenderPlan: GpuFlowProjectionFrameRenderPlanSelector;
    readonly selectProjectionFrameTransaction: GpuFlowProjectionFrameTransactionSelector;
    readonly selectRetainedProjectionPublicationDecision: GpuFlowRetainedProjectionPublicationDecisionSelector;
  }) => MotionProjectionFrame;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publish: (
    transaction: GpuFlowVisibleFramePublicationKernelResult<
      GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
        ContentPublicationFrame,
        MotionProjectionFrame
      >
    >,
  ) => void;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly runtimeViewportFrame: boolean;
  readonly sample: GpuFlowLiveProjectionSample;
  readonly scheduler: GpuFlowVisiblePublicationScheduler;
  readonly timestamp: DOMHighResTimeStamp;
  readonly viewportInteractionActive: boolean;
}): GpuFlowVisibleFramePublicationKernelResult<
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
    ContentPublicationFrame,
    MotionProjectionFrame
  >
> {
  const publicationDecision = selectGpuFlowVisibleFramePublicationTransaction({
    hasCommittedContentFrame,
    rawReasons,
    sample,
    scheduler,
    timestamp,
    viewportInteractionActive,
  });
  const publicationFrameContext =
    createGpuFlowVisibleFramePublicationFrameContext({
      publicationDecision,
      rawReasons,
      runtimeViewportFrame,
      viewportInteractionActive,
    });
  const selectRetainedProjectionPublicationDecision =
    createGpuFlowRetainedProjectionPublicationDecisionSelector({
      previousVisibleProjectionState,
      rawReasons,
    });
  const selectProjectionFrameTransaction =
    createGpuFlowProjectionFrameTransactionSelector();
  const selectProjectionFrameRenderPlan =
    createGpuFlowProjectionFrameRenderPlanSelector();
  const selectCommittedSurfacePublicationFramePlan =
    createGpuFlowCommittedSurfacePublicationFramePlanSelector();
  const notifyRetainedDisplayFollowUpFrameNeeded =
    createGpuFlowRetainedDisplayFollowUpFrameNotifier();
  const selectRetainedDisplayPublicationFramePlan =
    createGpuFlowRetainedDisplayPublicationFramePlanSelector();
  const selectContentPublicationBlockedCandidate =
    createGpuFlowContentPublicationBlockedCandidateSelector({
      previousVisibleProjectionState,
    });
  const motionProjectionWorkPlan = createGpuFlowMotionProjectionWorkPlan({
    publicationDecision,
  });
  const motionProjectionFrame = prepareMotionProjectionFrame({
    motionProjectionWorkPlan,
    previousVisibleProjectionState,
    publicationDecision,
    publicationFrameContext,
    selectProjectionFrameRenderPlan,
    selectProjectionFrameTransaction,
    selectRetainedProjectionPublicationDecision,
  });
  const contentPublicationWorkPlan = createGpuFlowContentPublicationWorkPlan({
    publicationDecision,
    renderedProjectionOnlyFrame:
      motionProjectionFrame.visibleProjectionState !== null,
  });
  const contentPublicationFrame = prepareContentPublicationFrame({
    contentPublicationWorkPlan,
    motionProjectionFrame,
    prepareCommittedSurfacePublicationCandidate:
      prepareGpuFlowCommittedSurfacePublicationCandidate,
    prepareRetainedDisplayPublicationCandidate:
      prepareGpuFlowRetainedDisplayPublicationCandidate,
    publicationDecision,
    publicationFrameContext,
    notifyRetainedDisplayFollowUpFrameNeeded,
    selectCommittedSurfacePublicationFramePlan,
    selectContentPublicationBlockedCandidate,
    selectRetainedDisplayPublicationFramePlan,
  });
  const transactionOracle =
    createGpuFlowVisibleFramePublicationTransactionOracle({
      contentPublicationFrame,
      heldPreviousProjectionState: previousVisibleProjectionState,
      motionProjectionFrame,
    });
  const preparedFrame =
    createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame({
      contentPublicationFrame,
      motionProjectionFrame,
      transactionOracle,
    });
  return completeGpuFlowVisibleFramePublicationPreparedFrame({
    preparedFrame,
    previousVisibleProjectionState,
    publicationDecision,
    publish,
    scheduler,
  });
}

export function createGpuFlowRetainedDisplayFollowUpFrameNotifier(): GpuFlowRetainedDisplayFollowUpFrameNotifier {
  return notifyGpuFlowRetainedDisplayFollowUpFrameNeeded;
}

export function createGpuFlowContentPublicationBlockedCandidateSelector({
  previousVisibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationBlockedCandidateSelector {
  return ({
    blockedCommittedSurfacePublicationCandidate,
    committedSurfacePublicationEffect,
    retainedProjectionBlockedReason,
  }) => {
    if (blockedCommittedSurfacePublicationCandidate) {
      return blockedCommittedSurfacePublicationCandidate;
    }
    if (retainedProjectionBlockedReason) {
      return createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: retainedProjectionBlockedReason,
        heldPreviousProjectionState: previousVisibleProjectionState,
      });
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

export function createGpuFlowRetainedProjectionPublicationDecisionSelector({
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

export function createGpuFlowVisibleFramePublicationFrameContext({
  publicationDecision,
  rawReasons,
  runtimeViewportFrame,
  viewportInteractionActive,
}: {
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly runtimeViewportFrame: boolean;
  readonly viewportInteractionActive: boolean;
}): GpuFlowVisibleFramePublicationFrameContext {
  const viewportFrame = rawReasons.includes("viewport") || runtimeViewportFrame;
  return Object.freeze({
    deferResolutionUpdates: shouldDeferGpuFlowResolutionUpdates({
      lane: publicationDecision.lane,
      schedulerState: publicationDecision.schedulerState,
      viewportFrame,
      viewportInteractionActive,
    }),
    viewportFrame,
  });
}

export function shouldDeferGpuFlowResolutionUpdates({
  lane,
  schedulerState,
  viewportFrame,
  viewportInteractionActive,
}: {
  readonly lane: GpuFlowVisiblePublicationDecision["lane"];
  readonly schedulerState: GpuFlowVisiblePublicationDecision["schedulerState"];
  readonly viewportFrame: boolean;
  readonly viewportInteractionActive: boolean;
}): boolean {
  return (
    viewportInteractionActive ||
    viewportFrame ||
    (schedulerState === "motion-settling" && lane !== "idle")
  );
}

function createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  motionProjectionFrame,
  transactionOracle,
}: {
  readonly contentPublicationFrame: ContentPublicationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
}): GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
  ContentPublicationFrame,
  MotionProjectionFrame
> {
  return Object.freeze({
    blockedPublicationCandidate: transactionOracle.blockedPublicationCandidate,
    blockedPublicationToken: null,
    contentPublicationFrame,
    motionProjectionFrame,
    renderedVisibleFrame: transactionOracle.renderedVisibleFrame,
    transactionOracle,
    visibleProjectionState: transactionOracle.visibleProjectionState,
  });
}

function completeGpuFlowVisibleFramePublicationPreparedFrame<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame,
>({
  preparedFrame,
  previousVisibleProjectionState,
  publicationDecision,
  publish,
  scheduler,
}: {
  readonly preparedFrame: PreparedFrame;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly publish: (
    transaction: GpuFlowVisibleFramePublicationKernelResult<PreparedFrame>,
  ) => void;
  readonly scheduler: GpuFlowVisiblePublicationScheduler;
}): GpuFlowVisibleFramePublicationKernelResult<PreparedFrame> {
  const blockedPublicationToken =
    preparedFrame.blockedPublicationToken ??
    createGpuFlowVisibleFrameBlockedPublicationTokenForCandidate({
      candidate: preparedFrame.blockedPublicationCandidate ?? null,
      publicationDecision,
    });
  const completion = completeGpuFlowVisibleFramePublicationTransaction({
    blockedPublicationToken,
    publicationDecision,
    previousVisibleProjectionState,
    renderedVisibleFrame: preparedFrame.renderedVisibleFrame,
    scheduler,
    visibleProjectionState: preparedFrame.visibleProjectionState,
  });
  const transaction = Object.freeze({
    ...completion,
    preparedFrame,
    publicationDecision,
  });
  publish(transaction);
  return transaction;
}

export function createGpuFlowVisibleFrameBlockedPublicationTokenForCandidate({
  candidate,
  publicationDecision,
}: {
  readonly candidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowBlockedPublicationToken | null {
  if (!candidate) {
    return null;
  }
  return createGpuFlowVisibleFrameBlockedPublicationToken({
    blockedReasons: candidate.blockedReasons,
    frozenFrameId: candidate.frozenFrameId,
    projectionSample: publicationDecision.sample,
  });
}

export function selectGpuFlowVisibleFramePublicationTransaction({
  hasCommittedContentFrame,
  rawReasons,
  sample,
  scheduler,
  timestamp,
  viewportInteractionActive,
}: {
  readonly hasCommittedContentFrame: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly sample: GpuFlowLiveProjectionSample;
  readonly scheduler: Pick<GpuFlowVisiblePublicationScheduler, "selectFrame">;
  readonly timestamp: DOMHighResTimeStamp;
  readonly viewportInteractionActive: boolean;
}): GpuFlowVisiblePublicationDecision {
  return scheduler.selectFrame({
    hasCommittedContentFrame,
    rawReasons,
    sample,
    timestamp,
    viewportInteractionActive,
  });
}

export function prepareGpuFlowRetainedDisplayPublicationCandidate(
  input: GpuFlowRetainedDisplayPublicationInput,
): GpuFlowRetainedDisplayPublicationResult {
  return resolveGpuFlowRetainedDisplayPublication(input);
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
}: {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly deferBrowserVisualRetry?: boolean | undefined;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
}): GpuFlowCommittedSurfacePublicationCandidate {
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
