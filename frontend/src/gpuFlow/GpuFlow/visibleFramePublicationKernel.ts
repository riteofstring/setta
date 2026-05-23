import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionSchedulerKnobs,
  type GpuFlowProjectionTransaction,
  type GpuFlowVisibleProjectionState,
  type GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import {
  notifyGpuFlowRetainedDisplayFollowUpFrameNeeded,
  resolveGpuFlowRetainedDisplayPublication,
  type GpuFlowRetainedDisplayPublicationInput,
  type GpuFlowRetainedDisplayPublicationResult,
} from "./flowRetainedDisplayTransaction";
import { createGpuFlowPresentableCommit } from "./visibleFramePublicationAuthority";
import {
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
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  createGpuFlowContentPublicationBlockedCandidateForFrameResultSelector,
  createGpuFlowRetainedDisplayPublicationFramePlanSelector,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  type GpuFlowCommittedSurfacePublicationCandidate,
  type GpuFlowCommittedSurfacePublicationCandidateInput,
  type GpuFlowCommittedSurfacePublicationFramePlanPreparer,
  type GpuFlowContentPublicationBlockedCandidateForFrameResultSelector,
  type GpuFlowRetainedDisplayPublicationFramePlanPreparer,
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
  type GpuFlowProjectionFrameRenderablePlan,
  type GpuFlowProjectionFrameRenderPlanSelector,
  type GpuFlowProjectionFrameTransaction,
  type GpuFlowProjectionFrameTransactionSelector,
} from "./visibleFramePublicationProjectionPlan";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowPresentableCommit,
} from "./visibleFramePublicationTokens";

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
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  createGpuFlowContentPublicationBlockedCandidateForFrameResultSelector,
  createGpuFlowContentPublicationBlockedCandidateSelector,
  createGpuFlowContentPublicationFrameResult,
  createGpuFlowContentPublicationFrameResultForNodeLayerFrame,
  createGpuFlowRetainedDisplayOutcomeFrameResultResolver,
  createGpuFlowRetainedDisplayPublicationFramePlanSelector,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  createGpuFlowRetainedDisplayPublicationOutcomeFrameResolver,
  resolveGpuFlowCommittedSurfacePublicationActionFrameResult,
  resolveGpuFlowCommittedSurfacePublicationFramePlanResult,
  resolveGpuFlowRetainedDisplayOutcomeFrameResult,
  resolveGpuFlowRetainedDisplayPublicationFramePlanResult,
  selectGpuFlowCommittedSurfacePublicationFramePlan,
  selectGpuFlowContentPublicationBlockedCandidate,
  selectGpuFlowContentPublicationBlockedCandidateForFrameResult,
  selectGpuFlowRetainedDisplayPublicationFramePlan,
} from "./visibleFramePublicationContentPlan";
export type {
  GpuFlowCommittedSurfacePublicationActionFrameResult,
  GpuFlowCommittedSurfacePublicationActionFrameResultResolver,
  GpuFlowCommittedSurfacePublicationCandidate,
  GpuFlowCommittedSurfacePublicationCandidateActionResolver,
  GpuFlowCommittedSurfacePublicationCandidateInput,
  GpuFlowCommittedSurfacePublicationCandidatePreparer,
  GpuFlowCommittedSurfacePublicationEffect,
  GpuFlowCommittedSurfacePublicationFramePlan,
  GpuFlowCommittedSurfacePublicationFramePlanPreparer,
  GpuFlowCommittedSurfacePublicationFramePlanResult,
  GpuFlowCommittedSurfacePublicationFramePlanSelector,
  GpuFlowContentPublicationBlockedCandidateForFrameResultSelector,
  GpuFlowContentPublicationBlockedCandidateSelector,
  GpuFlowContentPublicationFrameResult,
  GpuFlowRetainedDisplayOutcomeFrameResult,
  GpuFlowRetainedDisplayOutcomeFrameResultResolver,
  GpuFlowRetainedDisplayPublicationFramePlan,
  GpuFlowRetainedDisplayPublicationFramePlanPreparer,
  GpuFlowRetainedDisplayPublicationFramePlanSelector,
  GpuFlowRetainedDisplayPublicationOutcomeFrameResolver,
  GpuFlowRetainedDisplayPublicationPreparer,
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
  GpuFlowProjectionFrameRenderablePlan,
  GpuFlowProjectionFrameRenderPlanSelector,
  GpuFlowProjectionFrameTransaction,
  GpuFlowProjectionFrameTransactionSelector,
  GpuFlowRetainedProjectionFrameResolver,
} from "./visibleFramePublicationProjectionPlan";

type GpuFlowVisiblePublicationScheduler = ReturnType<
  typeof createGpuFlowVisiblePublicationScheduler
>;

export type GpuFlowRetainedDisplayFollowUpFrameNotifier =
  typeof notifyGpuFlowRetainedDisplayFollowUpFrameNeeded;

export type GpuFlowMotionProjectionFramePreparation<
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> =
  | {
      readonly frame: MotionProjectionFrame;
      readonly kind: "not-rendered";
    }
  | {
      readonly createBlockedProjectionFrame: (input: {
        readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
      }) => MotionProjectionFrame;
      readonly kind: "render";
      readonly projectionFrameTransaction: GpuFlowProjectionFrameTransaction;
      readonly renderProjectionFrame: (input: {
        readonly projectionFrameRenderPlan: GpuFlowProjectionFrameRenderablePlan;
      }) => MotionProjectionFrame;
    };

export type GpuFlowVisibleFramePublicationFrameContext = {
  readonly deferResolutionUpdates: boolean;
  readonly viewportFrame: boolean;
};

export type GpuFlowVisibleFramePublicationSample = {
  readonly hasCommittedContentFrame: boolean;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly runtimeViewportFrame: boolean;
  readonly sample: GpuFlowLiveProjectionSample;
  readonly timestamp: DOMHighResTimeStamp;
  readonly viewportInteractionActive: boolean;
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
  prepareContentPublicationFrame,
  prepareMotionProjectionFrame,
  publish,
  sampleVisibleFramePublication,
  scheduler,
}: {
  readonly prepareContentPublicationFrame: (input: {
    readonly contentPublicationWorkPlan: GpuFlowContentPublicationWorkPlan;
    readonly motionProjectionFrame: MotionProjectionFrame;
    readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
    readonly publicationDecision: GpuFlowVisiblePublicationDecision;
    readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
    readonly prepareCommittedSurfacePublicationFramePlan: GpuFlowCommittedSurfacePublicationFramePlanPreparer;
    readonly prepareRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanPreparer;
    readonly notifyRetainedDisplayFollowUpFrameNeeded: GpuFlowRetainedDisplayFollowUpFrameNotifier;
    readonly selectContentPublicationBlockedCandidateForFrameResult: GpuFlowContentPublicationBlockedCandidateForFrameResultSelector;
  }) => ContentPublicationFrame;
  readonly prepareMotionProjectionFrame: (input: {
    readonly motionProjectionWorkPlan: GpuFlowMotionProjectionWorkPlan;
    readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
    readonly publicationDecision: GpuFlowVisiblePublicationDecision;
    readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
    readonly selectProjectionFrameTransaction: GpuFlowProjectionFrameTransactionSelector;
    readonly selectRetainedProjectionPublicationDecision: GpuFlowRetainedProjectionPublicationDecisionSelector;
  }) => GpuFlowMotionProjectionFramePreparation<MotionProjectionFrame>;
  readonly publish: (
    transaction: GpuFlowVisibleFramePublicationKernelResult<
      GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
        ContentPublicationFrame,
        MotionProjectionFrame
      >
    >,
  ) => void;
  readonly sampleVisibleFramePublication: () => GpuFlowVisibleFramePublicationSample;
  readonly scheduler: GpuFlowVisiblePublicationScheduler;
}): GpuFlowVisibleFramePublicationKernelResult<
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
    ContentPublicationFrame,
    MotionProjectionFrame
  >
> {
  const {
    hasCommittedContentFrame,
    previousVisibleProjectionState,
    rawReasons,
    runtimeViewportFrame,
    sample,
    timestamp,
    viewportInteractionActive,
  } = sampleVisibleFramePublication();
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
  const prepareCommittedSurfacePublicationFramePlan =
    createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
      prepareCommittedSurfacePublicationCandidate:
        prepareGpuFlowCommittedSurfacePublicationCandidate,
      selectCommittedSurfacePublicationFramePlan,
    });
  const prepareRetainedDisplayPublicationFramePlan =
    createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
      previousVisibleProjectionState,
      prepareRetainedDisplayPublicationCandidate:
        prepareGpuFlowRetainedDisplayPublicationCandidate,
      selectRetainedDisplayPublicationFramePlan,
    });
  const selectContentPublicationBlockedCandidateForFrameResult =
    createGpuFlowContentPublicationBlockedCandidateForFrameResultSelector({
      previousVisibleProjectionState,
    });
  const motionProjectionWorkPlan = createGpuFlowMotionProjectionWorkPlan({
    publicationDecision,
  });
  const motionProjectionFrame = resolveGpuFlowMotionProjectionFramePreparation({
    preparation: prepareMotionProjectionFrame({
      motionProjectionWorkPlan,
      previousVisibleProjectionState,
      publicationDecision,
      publicationFrameContext,
      selectProjectionFrameTransaction,
      selectRetainedProjectionPublicationDecision,
    }),
    previousVisibleProjectionState,
    selectProjectionFrameRenderPlan,
  });
  const contentPublicationWorkPlan = createGpuFlowContentPublicationWorkPlan({
    publicationDecision,
    renderedProjectionOnlyFrame:
      motionProjectionFrame.visibleProjectionState !== null,
  });
  const contentPublicationFrame = prepareContentPublicationFrame({
    contentPublicationWorkPlan,
    motionProjectionFrame,
    previousVisibleProjectionState,
    prepareCommittedSurfacePublicationFramePlan,
    prepareRetainedDisplayPublicationFramePlan,
    publicationDecision,
    publicationFrameContext,
    notifyRetainedDisplayFollowUpFrameNeeded,
    selectContentPublicationBlockedCandidateForFrameResult,
  });
  const transactionOracle =
    createGpuFlowVisibleFramePublicationTransactionOracle({
      contentPublicationFrame,
      motionProjectionFrame,
      publicationDecision,
    });
  const presentableCommit =
    createGpuFlowVisibleFramePublicationPresentableCommit({
      publicationDecision,
      transactionOracle,
    });
  const preparedFrame =
    createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame({
      contentPublicationFrame,
      motionProjectionFrame,
      presentableCommit,
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

function resolveGpuFlowMotionProjectionFramePreparation<
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  preparation,
  previousVisibleProjectionState,
  selectProjectionFrameRenderPlan,
}: {
  readonly preparation: GpuFlowMotionProjectionFramePreparation<MotionProjectionFrame>;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly selectProjectionFrameRenderPlan: GpuFlowProjectionFrameRenderPlanSelector;
}): MotionProjectionFrame {
  if (preparation.kind === "not-rendered") {
    return preparation.frame;
  }
  if (preparation.projectionFrameTransaction.blockedReason !== null) {
    return preparation.createBlockedProjectionFrame({
      blockedPublicationCandidate:
        createGpuFlowRetainedProjectionBlockedPublicationCandidate({
          blockedReason: preparation.projectionFrameTransaction.blockedReason,
          heldPreviousProjectionState: previousVisibleProjectionState,
        }),
    });
  }
  const projectionFrameRenderPlan = selectProjectionFrameRenderPlan({
    projectionFrameTransaction: preparation.projectionFrameTransaction,
  });
  return preparation.renderProjectionFrame({ projectionFrameRenderPlan });
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
  presentableCommit,
  transactionOracle,
}: {
  readonly contentPublicationFrame: ContentPublicationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly presentableCommit: GpuFlowPresentableCommit | null;
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
    presentableCommit,
    renderedVisibleFrame: transactionOracle.renderedVisibleFrame,
    transactionOracle,
    visibleProjectionState: transactionOracle.visibleProjectionState,
  });
}

function createGpuFlowVisibleFramePublicationPresentableCommit({
  publicationDecision,
  transactionOracle,
}: {
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
}): GpuFlowPresentableCommit | null {
  const visibleProjectionState = transactionOracle.visibleProjectionState;
  if (
    transactionOracle.commitOracle === null ||
    !transactionOracle.renderedVisibleFrame ||
    visibleProjectionState === null ||
    visibleProjectionState.transaction.kind === "held-previous"
  ) {
    return null;
  }
  return createGpuFlowPresentableCommit({
    frame: visibleProjectionState.committedFrame,
    projectionSample: publicationDecision.sample,
  });
}

function completeGpuFlowVisibleFramePublicationPreparedFrame<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame & {
    readonly presentableCommit: GpuFlowPresentableCommit | null;
    readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
  },
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
    commitOracle: preparedFrame.transactionOracle.commitOracle,
    presentableCommit: preparedFrame.presentableCommit,
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
