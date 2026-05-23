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
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  createGpuFlowCommittedSurfacePublicationFramePlanSelector,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  createGpuFlowRetainedDisplayPublicationFramePlanSelector,
  type GpuFlowCommittedSurfacePublicationCandidate,
  type GpuFlowCommittedSurfacePublicationCandidateInput,
  type GpuFlowCommittedSurfacePublicationFramePlanPreparer,
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
  type GpuFlowVisibleFramePublicationCandidateSet,
  type GpuFlowVisibleFramePublicationContentCandidate,
  type GpuFlowVisibleFramePublicationMotionCandidate,
  type GpuFlowVisibleFramePublicationPreparedCandidateSetFrame,
  type GpuFlowVisibleFramePublicationPreparedFrame,
  type GpuFlowVisibleFramePublicationTransactionOracle,
  type GpuFlowVisiblePublicationBlockedProof,
} from "./visibleFramePublicationOracle";
import {
  createGpuFlowProjectionFrameRenderPlanSelector,
  createGpuFlowProjectionFrameTransactionSelector,
  type GpuFlowProjectionFrameRenderablePlan,
  type GpuFlowProjectionFrameRenderPlanSelector,
  type GpuFlowProjectionFrameTransaction,
  type GpuFlowProjectionFrameTransactionSelector,
  type GpuFlowRetainedProjectionFrameResolver,
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
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  createGpuFlowCommittedSurfacePublicationFramePlanSelector,
  createGpuFlowContentPublicationBlockedCandidateSelector,
  createGpuFlowContentPublicationFrameResult,
  createGpuFlowContentPublicationFrameResultForCommittedSurfacePublicationPreparation,
  createGpuFlowContentPublicationFrameResultForNodeLayerFrame,
  createGpuFlowContentPublicationFrameResultForRetainedDisplayPublicationPreparation,
  createGpuFlowRetainedDisplayOutcomeFrameResultResolver,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  createGpuFlowRetainedDisplayPublicationFramePlanSelector,
  createGpuFlowRetainedDisplayPublicationOutcomeFrameResolver,
  requireGpuFlowRetainedDisplayPublishedOutcomeFrame,
  resolveGpuFlowCommittedSurfacePublicationActionFrameResult,
  resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult,
  resolveGpuFlowCommittedSurfacePublicationFramePlanResult,
  resolveGpuFlowRetainedDisplayOutcomeFrameResult,
  resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult,
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
  GpuFlowVisiblePublicationBlockedProof,
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
  GpuFlowProjectionFrameRenderablePlan,
  GpuFlowProjectionFrameRenderPlan,
  GpuFlowProjectionFrameRenderPlanSelector,
  GpuFlowProjectionFrameTransaction,
  GpuFlowProjectionFrameTransactionSelector,
  GpuFlowRetainedProjectionFrameResolver,
} from "./visibleFramePublicationProjectionPlan";

type GpuFlowVisiblePublicationScheduler = ReturnType<
  typeof createGpuFlowVisiblePublicationScheduler
>;

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
      readonly hasActiveRetainedDomControl: boolean;
      readonly kind: "render";
      readonly requestedProjectionCoverageMissing: boolean;
      readonly requestedProjectionFrame: GpuFlowProjectionFrameTransaction["retainedProjectionFrame"];
      readonly requestedTransaction: GpuFlowProjectionTransaction;
      readonly resolveHeldRetainedProjectionFrame: GpuFlowRetainedProjectionFrameResolver;
      readonly renderProjectionFrame: (input: {
        readonly projectionFrameRenderPlan: GpuFlowProjectionFrameRenderablePlan;
        readonly requestedProjectionTransaction: GpuFlowProjectionTransaction;
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

type GpuFlowVisibleFramePublicationContentFramePreparer<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = (input: {
  readonly contentPublicationWorkPlan: GpuFlowContentPublicationWorkPlan;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
  readonly prepareCommittedSurfacePublicationFramePlan: GpuFlowCommittedSurfacePublicationFramePlanPreparer;
  readonly prepareRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanPreparer;
}) => ContentPublicationFrame;

type GpuFlowVisibleFramePublicationMotionFramePreparer<
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = (input: {
  readonly motionProjectionWorkPlan: GpuFlowMotionProjectionWorkPlan;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
}) => GpuFlowMotionProjectionFramePreparation<MotionProjectionFrame>;

type GpuFlowVisibleFramePublicationPublisher<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame,
> = (
  transaction: GpuFlowVisibleFramePublicationKernelResult<PreparedFrame>,
) => void;

type GpuFlowVisibleFramePublicationCandidateSetKernelInput<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = {
  readonly prepareContentPublicationFrame: GpuFlowVisibleFramePublicationContentFramePreparer<
    ContentPublicationFrame,
    MotionProjectionFrame
  >;
  readonly prepareMotionProjectionFrame: GpuFlowVisibleFramePublicationMotionFramePreparer<MotionProjectionFrame>;
  readonly publish: GpuFlowVisibleFramePublicationPublisher<
    GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
      ContentPublicationFrame,
      MotionProjectionFrame
    >
  >;
  readonly sampleVisibleFramePublication: () => GpuFlowVisibleFramePublicationSample;
  readonly scheduler: GpuFlowVisiblePublicationScheduler;
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
}: GpuFlowVisibleFramePublicationCandidateSetKernelInput<
  ContentPublicationFrame,
  MotionProjectionFrame
>): GpuFlowVisibleFramePublicationKernelResult<
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
  } = sampleGpuFlowVisibleFramePublicationTransaction({
    sampleVisibleFramePublication,
  });
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
  const candidateSet = prepareGpuFlowVisibleFramePublicationCandidateSet({
    prepareContentPublicationFrame,
    prepareMotionProjectionFrame,
    previousVisibleProjectionState,
    publicationDecision,
    publicationFrameContext,
    rawReasons,
    scheduler,
  });
  const preparedFrame = proveGpuFlowVisibleFramePublicationCandidateSet({
    candidateSet,
    publicationDecision,
  });
  const transaction = decideGpuFlowVisibleFramePublicationOutcome({
    preparedFrame,
    previousVisibleProjectionState,
    publicationDecision,
    scheduler,
  });
  return publishGpuFlowVisibleFramePublicationOutcome({
    publish,
    transaction,
  });
}

function sampleGpuFlowVisibleFramePublicationTransaction({
  sampleVisibleFramePublication,
}: {
  readonly sampleVisibleFramePublication: () => GpuFlowVisibleFramePublicationSample;
}): GpuFlowVisibleFramePublicationSample {
  return sampleVisibleFramePublication();
}

function prepareGpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  prepareContentPublicationFrame,
  prepareMotionProjectionFrame,
  previousVisibleProjectionState,
  publicationDecision,
  publicationFrameContext,
  rawReasons,
  scheduler,
}: {
  readonly prepareContentPublicationFrame: GpuFlowVisibleFramePublicationContentFramePreparer<
    ContentPublicationFrame,
    MotionProjectionFrame
  >;
  readonly prepareMotionProjectionFrame: GpuFlowVisibleFramePublicationMotionFramePreparer<MotionProjectionFrame>;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly scheduler: Pick<GpuFlowVisiblePublicationScheduler, "getKnobs">;
}): GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> {
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
  const motionProjectionWorkPlan = createGpuFlowMotionProjectionWorkPlan({
    publicationDecision,
  });
  const motionProjectionFrame = resolveGpuFlowMotionProjectionFramePreparation({
    preparation: prepareMotionProjectionFrame({
      motionProjectionWorkPlan,
      previousVisibleProjectionState,
      publicationDecision,
      publicationFrameContext,
    }),
    projectionSchedulerKnobs: scheduler.getKnobs(),
    previousVisibleProjectionState,
    selectProjectionFrameTransaction,
    selectProjectionFrameRenderPlan,
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
    previousVisibleProjectionState,
    prepareCommittedSurfacePublicationFramePlan,
    prepareRetainedDisplayPublicationFramePlan,
    publicationDecision,
    publicationFrameContext,
  });
  return Object.freeze({
    contentPublicationFrame,
    motionProjectionFrame,
  });
}

function proveGpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  candidateSet,
  publicationDecision,
}: {
  readonly candidateSet: GpuFlowVisibleFramePublicationCandidateSet<
    ContentPublicationFrame,
    MotionProjectionFrame
  >;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
  ContentPublicationFrame,
  MotionProjectionFrame
> {
  const transactionOracle =
    createGpuFlowVisibleFramePublicationTransactionOracle({
      contentPublicationFrame: candidateSet.contentPublicationFrame,
      motionProjectionFrame: candidateSet.motionProjectionFrame,
      publicationDecision,
    });
  const presentableCommit = proveGpuFlowVisibleFramePublicationPresentation({
    publicationDecision,
    transactionOracle,
  });
  const preparedFrame =
    createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame({
      contentPublicationFrame: candidateSet.contentPublicationFrame,
      motionProjectionFrame: candidateSet.motionProjectionFrame,
      presentableCommit,
      transactionOracle,
    });
  return preparedFrame;
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
  projectionSchedulerKnobs,
  previousVisibleProjectionState,
  selectProjectionFrameTransaction,
  selectProjectionFrameRenderPlan,
  selectRetainedProjectionPublicationDecision,
}: {
  readonly preparation: GpuFlowMotionProjectionFramePreparation<MotionProjectionFrame>;
  readonly projectionSchedulerKnobs: GpuFlowProjectionSchedulerKnobs;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly selectProjectionFrameTransaction: GpuFlowProjectionFrameTransactionSelector;
  readonly selectProjectionFrameRenderPlan: GpuFlowProjectionFrameRenderPlanSelector;
  readonly selectRetainedProjectionPublicationDecision: GpuFlowRetainedProjectionPublicationDecisionSelector;
}): MotionProjectionFrame {
  if (preparation.kind === "not-rendered") {
    return preparation.frame;
  }
  const retainedProjectionPublicationDecision =
    selectRetainedProjectionPublicationDecision({
      hasActiveRetainedDomControl: preparation.hasActiveRetainedDomControl,
      projectionSchedulerKnobs,
      requestedProjectionCoverageMissing:
        preparation.requestedProjectionCoverageMissing,
      requestedTransaction: preparation.requestedTransaction,
    });
  const projectionFrameTransaction = selectProjectionFrameTransaction({
    publicationDecision: retainedProjectionPublicationDecision,
    requestedRetainedProjectionFrame: preparation.requestedProjectionFrame,
    resolveHeldRetainedProjectionFrame:
      preparation.resolveHeldRetainedProjectionFrame,
  });
  if (projectionFrameTransaction.blockedReason !== null) {
    return preparation.createBlockedProjectionFrame({
      blockedPublicationCandidate:
        createGpuFlowRetainedProjectionBlockedPublicationCandidate({
          blockedReason: projectionFrameTransaction.blockedReason,
          heldPreviousProjectionState: previousVisibleProjectionState,
        }),
    });
  }
  const projectionFrameRenderPlan = selectProjectionFrameRenderPlan({
    projectionFrameTransaction,
  });
  return preparation.renderProjectionFrame({
    projectionFrameRenderPlan,
    requestedProjectionTransaction: preparation.requestedTransaction,
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
    blockedProof: transactionOracle.blockedProof,
    blockedPublicationToken: null,
    contentPublicationFrame,
    motionProjectionFrame,
    presentableCommit,
    renderedVisibleFrame: transactionOracle.renderedVisibleFrame,
    transactionOracle,
    visibleProjectionState: transactionOracle.visibleProjectionState,
  });
}

function proveGpuFlowVisibleFramePublicationPresentation({
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

function decideGpuFlowVisibleFramePublicationOutcome<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame & {
    readonly presentableCommit: GpuFlowPresentableCommit | null;
    readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
  },
>({
  preparedFrame,
  previousVisibleProjectionState,
  publicationDecision,
  scheduler,
}: {
  readonly preparedFrame: PreparedFrame;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly scheduler: GpuFlowVisiblePublicationScheduler;
}): GpuFlowVisibleFramePublicationKernelResult<PreparedFrame> {
  const blockedPublicationToken =
    preparedFrame.blockedPublicationToken ??
    createGpuFlowVisibleFrameBlockedPublicationTokenForProof({
      proof: preparedFrame.transactionOracle.blockedProof,
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
  return transaction;
}

function publishGpuFlowVisibleFramePublicationOutcome<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame,
>({
  publish,
  transaction,
}: {
  readonly publish: GpuFlowVisibleFramePublicationPublisher<PreparedFrame>;
  readonly transaction: GpuFlowVisibleFramePublicationKernelResult<PreparedFrame>;
}): GpuFlowVisibleFramePublicationKernelResult<PreparedFrame> {
  publish(transaction);
  return transaction;
}

export function createGpuFlowVisibleFrameBlockedPublicationTokenForProof({
  proof,
  publicationDecision,
}: {
  readonly proof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowBlockedPublicationToken | null {
  if (!proof) {
    return null;
  }
  return createGpuFlowVisibleFrameBlockedPublicationToken({
    blockedReasons: proof.blockedReasons,
    frozenFrameId: proof.frozenFrameId,
    projectionSample: publicationDecision.sample,
  });
}

function selectGpuFlowVisibleFramePublicationTransaction({
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
