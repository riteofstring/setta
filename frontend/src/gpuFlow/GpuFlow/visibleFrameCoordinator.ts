import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowHeldPreviousProjection,
  createGpuFlowProjectionTransactionForCommittedFrameId,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionTransaction,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  resolveGpuFlowRetainedDisplayPublication,
  type GpuFlowRetainedDisplayPublicationInput,
  type GpuFlowRetainedDisplayPublicationResult,
} from "./flowRetainedDisplayTransaction";
import { createGpuFlowVisiblePublicationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import { createGpuFlowRetainedProjectionBlockedPublicationCandidate } from "./visibleFrameBlockedCandidate";
import {
  createGpuFlowVisibleFrameBudgetBrokerDecision,
  type GpuFlowVisibleFrameBudgetBroker,
  type GpuFlowVisibleFrameBudgetBrokerDecision,
} from "./visibleFrameBudgetBroker";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  createGpuFlowRetainedCommittedSurfacePublicationContentStageRunner,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  type GpuFlowRetainedCommittedSurfacePublicationContentStageRunner,
} from "./visibleFrameContentPlan";
import type { GpuFlowVisiblePublicationTransactionCompletion } from "./visibleFrameOutcomeReport";
import { proveGpuFlowVisibleFramePublicationPresentation } from "./visibleFramePresentationProofs";
import type { GpuFlowRetainedProjectionFrame } from "./visibleFrameProjectionCoverage";
import type {
  GpuFlowMotionProjectionFramePreparation,
  GpuFlowProjectionFrameRenderPlan,
  GpuFlowProjectionFrameTransaction,
} from "./visibleFrameProjectionPlan";
import { createGpuFlowVisiblePublicationDecisionForLane } from "./visibleFramePublicationDecision";
import type { GpuFlowVisibleFrameResourceGraphSnapshot } from "./visibleFrameResourceGraph";
import {
  reduceGpuFlowVisibleFramePublicationDecision,
  shouldDeferGpuFlowMaintenanceContentCatchup,
  type GpuFlowVisibleFrameRequestCoordinator,
  type GpuFlowVisibleFrameRequestFacts,
  type GpuFlowVisiblePublicationDecision,
} from "./visibleFrameScheduling";
import {
  createGpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory,
  createGpuFlowVisibleFramePublicationTransactionProofFactory,
  type GpuFlowVisibleFramePublicationCandidateSet,
  type GpuFlowVisibleFramePublicationContentCandidate,
  type GpuFlowVisibleFramePublicationMotionCandidate,
  type GpuFlowVisibleFramePublicationPreparedCandidateSetFrame,
  type GpuFlowVisibleFramePublicationPreparedFrame,
  type GpuFlowVisibleFramePublicationTransactionProof,
} from "./visibleFrameTransactionProofs";
import {
  createGpuFlowContentPublicationWorkPlan,
  createGpuFlowMotionProjectionWorkPlan,
  type GpuFlowContentPublicationWorkPlan,
  type GpuFlowMotionProjectionWorkPlan,
} from "./visibleFrameWorkPlan";

export { createGpuFlowContentPublicationFrameResult } from "./visibleFrameContentPlan";
export type {
  GpuFlowCommittedSurfaceBlockedCandidateResourceWork,
  GpuFlowCommittedSurfacePublicationCandidate,
  GpuFlowCommittedSurfacePublicationCandidateInput,
  GpuFlowCommittedSurfacePublicationCandidatePreparer,
  GpuFlowCommittedSurfacePublicationFramePlanPreparer,
  GpuFlowContentPublicationFrameResult,
  GpuFlowPreparedCommittedSurfacePublicationFramePlan,
  GpuFlowRetainedCommittedSurfacePublicationContentPublishedRetainedDisplay,
  GpuFlowRetainedCommittedSurfacePublicationContentStageInput,
  GpuFlowRetainedCommittedSurfacePublicationContentStageRunner,
  GpuFlowRetainedDisplayCommittedSurfaceFramePreparer,
  GpuFlowRetainedDisplayPublicationFramePlanPreparer,
  GpuFlowRetainedDisplayPublicationPreparer,
  GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFrameContentPlan";
export { createGpuFlowVisiblePublicationTransactionReport } from "./visibleFrameOutcomeReport";
export type {
  GpuFlowVisiblePublicationCompletion,
  GpuFlowVisiblePublicationDebtFrameRequest,
  GpuFlowVisiblePublicationOutcome,
  GpuFlowVisiblePublicationSchedulerFrameCompletion,
  GpuFlowVisiblePublicationTransactionCompletion,
} from "./visibleFrameOutcomeReport";
export type {
  GpuFlowMotionProjectionFramePreparation,
  GpuFlowProjectionFrameRenderablePlan,
  GpuFlowProjectionFrameRenderPlan,
  GpuFlowProjectionFrameTransaction,
  GpuFlowRetainedProjectionFrameResolver,
} from "./visibleFrameProjectionPlan";
export type {
  GpuFlowMotionProjectionFrameWorkReport,
  GpuFlowMotionProjectionFrameWorkResult,
} from "./visibleFrameProjectionWorkTypes";
export type {
  GpuFlowVisibleFramePublicationCandidateSet,
  GpuFlowVisibleFramePublicationContentCandidate,
  GpuFlowVisibleFramePublicationMotionCandidate,
  GpuFlowVisibleFramePublicationPreparedCandidateSet,
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrame,
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory,
  GpuFlowVisibleFramePublicationPreparedFrame,
  GpuFlowVisibleFramePublicationTransactionProof,
  GpuFlowVisibleFramePublicationTransactionProofFactory,
  GpuFlowVisiblePublicationBlockedProof,
  GpuFlowVisiblePublicationCommitDebtProof,
} from "./visibleFrameTransactionProofs";
export {
  createGpuFlowContentPublicationWorkPlan,
  createGpuFlowMotionProjectionWorkPlan,
  shouldConsiderGpuFlowDeferredContentPublication,
  shouldDeferGpuFlowBrowserVisualResourceWakeupForPublication,
} from "./visibleFrameWorkPlan";
export type {
  GpuFlowContentPublicationWorkPlan,
  GpuFlowMotionProjectionWorkPlan,
} from "./visibleFrameWorkPlan";
type GpuFlowVisiblePublicationScheduler = GpuFlowVisibleFrameRequestCoordinator;

type GpuFlowProjectionFrameRenderPlanSelector = (input: {
  readonly projectionFrameTransaction: GpuFlowProjectionFrameTransaction;
}) => GpuFlowProjectionFrameRenderPlan;

export type GpuFlowVisibleFramePublicationFrameContext = {
  readonly budgetDecision: GpuFlowVisibleFrameBudgetBrokerDecision;
  readonly deferResolutionUpdates: boolean;
  readonly frameRequest: GpuFlowVisibleFrameRequestFacts;
  readonly viewportFrame: boolean;
};

export type GpuFlowVisibleFramePublicationSample = {
  readonly hasCommittedContentFrame: boolean;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly runtimeViewportFrame: boolean;
  readonly sample: GpuFlowLiveProjectionSample;
  readonly timestamp: DOMHighResTimeStamp;
  readonly visibleFrameResourceGraphSnapshot?:
    | GpuFlowVisibleFrameResourceGraphSnapshot
    | null
    | undefined;
  readonly viewportInteractionActive: boolean;
};

export type GpuFlowVisibleFrameCoordinatorResult<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame,
> = GpuFlowVisiblePublicationTransactionCompletion & {
  readonly preparedFrame: PreparedFrame;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
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
  readonly runRetainedCommittedSurfacePublicationContentStage: GpuFlowRetainedCommittedSurfacePublicationContentStageRunner;
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
> = (transaction: GpuFlowVisibleFrameCoordinatorResult<PreparedFrame>) => void;

type GpuFlowVisibleFrameResourceBudgetPreparer = (
  budgetDecision: GpuFlowVisibleFrameBudgetBrokerDecision,
) => void;

type GpuFlowVisibleFrameCoordinatorInput<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = {
  readonly prepareContentPublicationFrame: GpuFlowVisibleFramePublicationContentFramePreparer<
    ContentPublicationFrame,
    MotionProjectionFrame
  >;
  readonly prepareMotionProjectionFrame: GpuFlowVisibleFramePublicationMotionFramePreparer<MotionProjectionFrame>;
  readonly prepareVisibleFrameResourcesForBudget?:
    | GpuFlowVisibleFrameResourceBudgetPreparer
    | undefined;
  readonly budgetBroker?: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly publish: GpuFlowVisibleFramePublicationPublisher<
    GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
      ContentPublicationFrame,
      MotionProjectionFrame
    >
  >;
  readonly sampleVisibleFramePublication: () => GpuFlowVisibleFramePublicationSample;
  readonly scheduler: GpuFlowVisiblePublicationScheduler;
};

type GpuFlowVisibleFrameReducedPublicationTransaction<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame & {
    readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof;
  },
> = GpuFlowVisibleFrameCoordinatorResult<PreparedFrame> & {
  readonly preparedFrame: PreparedFrame;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
};

export function runGpuFlowVisibleFrameCoordinator<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  prepareContentPublicationFrame,
  prepareMotionProjectionFrame,
  prepareVisibleFrameResourcesForBudget,
  budgetBroker,
  publish,
  sampleVisibleFramePublication,
  scheduler,
}: GpuFlowVisibleFrameCoordinatorInput<
  ContentPublicationFrame,
  MotionProjectionFrame
>): GpuFlowVisibleFrameCoordinatorResult<
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
    ContentPublicationFrame,
    MotionProjectionFrame
  >
> {
  const sampledPublication = sampleGpuFlowVisibleFramePublicationTransaction({
    sampleVisibleFramePublication,
  });
  const transaction = reduceGpuFlowVisibleFramePublicationFrame({
    budgetBroker,
    prepareContentPublicationFrame,
    prepareMotionProjectionFrame,
    sampledPublication,
    scheduler,
  });
  return publishGpuFlowVisibleFramePublicationOutcome({
    prepareVisibleFrameResourcesForBudget,
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

function reduceGpuFlowVisibleFramePublicationFrame<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  budgetBroker,
  prepareContentPublicationFrame,
  prepareMotionProjectionFrame,
  sampledPublication,
  scheduler,
}: {
  readonly budgetBroker?: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly prepareContentPublicationFrame: GpuFlowVisibleFramePublicationContentFramePreparer<
    ContentPublicationFrame,
    MotionProjectionFrame
  >;
  readonly prepareMotionProjectionFrame: GpuFlowVisibleFramePublicationMotionFramePreparer<MotionProjectionFrame>;
  readonly sampledPublication: GpuFlowVisibleFramePublicationSample;
  readonly scheduler: GpuFlowVisiblePublicationScheduler;
}): GpuFlowVisibleFrameReducedPublicationTransaction<
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
    visibleFrameResourceGraphSnapshot,
    viewportInteractionActive,
  } = sampledPublication;
  const schedulerKnobs = scheduler.getKnobs();
  const frameRequest = createGpuFlowVisibleFrameRequestFacts({
    hasCommittedContentFrame,
    rawReasons,
    sample,
    scheduler,
    timestamp,
    viewportInteractionActive,
  });
  const publicationDecision = reduceGpuFlowVisibleFramePublicationDecision({
    frameRequest,
    schedulerKnobs,
  });
  const initialPublicationFrameContext =
    createGpuFlowVisibleFramePublicationFrameContext({
      frameRequest,
      publicationDecision,
      budgetBroker,
      rawReasons,
      runtimeViewportFrame,
      visibleFrameResourceGraphSnapshot,
      viewportInteractionActive,
    });
  const finalPublicationDecision =
    selectGpuFlowVisibleFramePublicationDecisionForBudget({
      budgetDecision: initialPublicationFrameContext.budgetDecision,
      frameRequest,
      publicationDecision,
    });
  const publicationFrameContext = initialPublicationFrameContext;
  const candidateSet = prepareGpuFlowVisibleFramePublicationCandidateSet({
    prepareContentPublicationFrame,
    prepareMotionProjectionFrame,
    previousVisibleProjectionState,
    publicationDecision: finalPublicationDecision,
    publicationFrameContext,
    projectionSchedulerKnobs: schedulerKnobs,
    rawReasons,
  });
  const preparedFrame = createGpuFlowVisibleFramePublicationPreparedFrame({
    candidateSet,
    previousVisibleProjectionState,
    publicationDecision: finalPublicationDecision,
  });
  const transactionCompletion = proveGpuFlowVisibleFramePublicationPresentation(
    {
      forceImmediatePublicationDebtFrame:
        preparedFrame.contentPublicationFrame
          .forceImmediatePublicationDebtFrame ?? false,
      followUpFrameReason:
        preparedFrame.contentPublicationFrame
          .retainedDisplayFollowUpFrameReason ?? null,
      previousVisibleProjectionState,
      publicationDecision: finalPublicationDecision,
      scheduler,
      transactionProof: preparedFrame.transactionProof,
    },
  );
  return Object.freeze({
    ...transactionCompletion,
    preparedFrame,
    publicationDecision: finalPublicationDecision,
    publicationFrameContext,
  });
}

function selectGpuFlowVisibleFramePublicationDecisionForBudget({
  budgetDecision,
  frameRequest,
  publicationDecision,
}: {
  readonly budgetDecision: GpuFlowVisibleFrameBudgetBrokerDecision;
  readonly frameRequest: GpuFlowVisibleFrameRequestFacts;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisiblePublicationDecision {
  if (
    publicationDecision.lane !== "content" &&
    budgetDecision.preparationBudget.selectedVisibleDebtIds.length > 0
  ) {
    return createGpuFlowVisiblePublicationDecisionForLane({
      frameRequest,
      lane: "content",
    });
  }
  return publicationDecision;
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
  projectionSchedulerKnobs,
  rawReasons,
}: {
  readonly prepareContentPublicationFrame: GpuFlowVisibleFramePublicationContentFramePreparer<
    ContentPublicationFrame,
    MotionProjectionFrame
  >;
  readonly prepareMotionProjectionFrame: GpuFlowVisibleFramePublicationMotionFramePreparer<MotionProjectionFrame>;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
  readonly projectionSchedulerKnobs: ReturnType<
    GpuFlowVisiblePublicationScheduler["getKnobs"]
  >;
  readonly rawReasons: readonly GpuFrameReason[];
}): GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> {
  const contentDecisionKernel =
    createGpuFlowVisiblePublicationContentDecisionKernel();
  const prepareCommittedSurfacePublicationFramePlan =
    createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
      contentDecisionKernel,
    });
  const prepareRetainedDisplayPublicationFramePlan =
    createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
      contentDecisionKernel,
      previousVisibleProjectionState,
      prepareRetainedDisplayPublicationCandidate:
        prepareGpuFlowRetainedDisplayPublicationCandidate,
    });
  const runRetainedCommittedSurfacePublicationContentStage =
    createGpuFlowRetainedCommittedSurfacePublicationContentStageRunner({
      contentDecisionKernel,
      prepareCommittedSurfacePublicationFramePlan,
      prepareRetainedDisplayPublicationFramePlan,
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
    previousVisibleProjectionState,
    projectionSchedulerKnobs,
    rawReasons,
    selectProjectionFrameRenderPlan: selectGpuFlowProjectionFrameRenderPlan,
  });
  const contentPublicationWorkPlan = createGpuFlowContentPublicationWorkPlan({
    blockedProjectionOnlyFrame:
      motionProjectionFrame.blockedPublicationCandidate !== null,
    publicationDecision,
    renderedProjectionOnlyFrame:
      motionProjectionFrame.visibleProjectionState !== null,
  });
  const contentPublicationFrame = prepareContentPublicationFrame({
    contentPublicationWorkPlan,
    motionProjectionFrame,
    previousVisibleProjectionState,
    publicationDecision,
    publicationFrameContext,
    runRetainedCommittedSurfacePublicationContentStage,
  });
  return Object.freeze({
    contentPublicationFrame,
    motionProjectionFrame,
  });
}

function createGpuFlowVisibleFramePublicationPreparedFrame<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  candidateSet,
  previousVisibleProjectionState,
  publicationDecision,
}: {
  readonly candidateSet: GpuFlowVisibleFramePublicationCandidateSet<
    ContentPublicationFrame,
    MotionProjectionFrame
  >;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
  ContentPublicationFrame,
  MotionProjectionFrame
> {
  const transactionProof =
    createGpuFlowVisibleFramePublicationTransactionProofFactory()({
      contentPublicationFrame: candidateSet.contentPublicationFrame,
      forcedBlockedPublicationCandidate:
        candidateSet.forcedBlockedPublicationCandidate,
      motionProjectionFrame: candidateSet.motionProjectionFrame,
      previousVisibleProjectionState,
      publicationDecision,
    });
  const preparedFrame =
    createGpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory()({
      contentPublicationFrame: candidateSet.contentPublicationFrame,
      motionProjectionFrame: candidateSet.motionProjectionFrame,
      transactionProof,
    });
  return preparedFrame;
}

function createGpuFlowVisibleFramePublicationFrameContext({
  budgetBroker,
  frameRequest,
  publicationDecision,
  rawReasons,
  runtimeViewportFrame,
  visibleFrameResourceGraphSnapshot,
  viewportInteractionActive,
}: {
  readonly budgetBroker?: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly frameRequest: GpuFlowVisibleFrameRequestFacts;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly runtimeViewportFrame: boolean;
  readonly visibleFrameResourceGraphSnapshot?:
    | GpuFlowVisibleFrameResourceGraphSnapshot
    | null
    | undefined;
  readonly viewportInteractionActive: boolean;
}): GpuFlowVisibleFramePublicationFrameContext {
  const viewportFrame = rawReasons.includes("viewport") || runtimeViewportFrame;
  const deferResolutionUpdates = shouldDeferGpuFlowResolutionUpdates({
    lane: publicationDecision.lane,
    rawReasons,
    schedulerState: publicationDecision.schedulerState,
    viewportFrame,
    viewportInteractionActive,
  });
  const budgetDecision = createGpuFlowVisibleFrameBudgetBrokerDecision({
    budgetBroker,
    deferResolutionUpdates,
    publicationDecision,
    resourceGraphSnapshot: visibleFrameResourceGraphSnapshot,
  });
  return Object.freeze({
    budgetDecision,
    deferResolutionUpdates: budgetDecision.resolutionUpdates.deferred,
    frameRequest,
    viewportFrame,
  });
}

function resolveGpuFlowMotionProjectionFramePreparation<
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  preparation,
  previousVisibleProjectionState,
  projectionSchedulerKnobs,
  rawReasons,
  selectProjectionFrameRenderPlan,
}: {
  readonly preparation: GpuFlowMotionProjectionFramePreparation<MotionProjectionFrame>;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly projectionSchedulerKnobs: ReturnType<
    GpuFlowVisiblePublicationScheduler["getKnobs"]
  >;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly selectProjectionFrameRenderPlan: GpuFlowProjectionFrameRenderPlanSelector;
}): MotionProjectionFrame {
  if (preparation.kind === "not-rendered") {
    return preparation.frame;
  }
  const requestedRetainedProjectionFrame =
    preparation.resolveRetainedProjectionFrame({
      transaction: preparation.requestedTransaction,
    });
  const projectionFrameTransaction =
    resolveGpuFlowMotionProjectionFrameTransaction({
      hasActiveRetainedDomControl: preparation.hasActiveRetainedDomControl,
      previousVisibleProjectionState,
      projectionSchedulerKnobs,
      rawReasons,
      requestedProjectionCoverageMissing:
        requestedRetainedProjectionFrame.missingCoverageSurfaceIds.size > 0,
      requestedRetainedProjectionFrame,
      requestedTransaction: preparation.requestedTransaction,
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
  const projectionFrame = preparation.renderProjectionFrame({
    projectionFrameRenderPlan,
    requestedProjectionTransaction: preparation.requestedTransaction,
  });
  return projectionFrame;
}

function resolveGpuFlowMotionProjectionFrameTransaction({
  hasActiveRetainedDomControl,
  previousVisibleProjectionState,
  projectionSchedulerKnobs,
  rawReasons,
  requestedProjectionCoverageMissing,
  requestedRetainedProjectionFrame,
  requestedTransaction,
}: {
  readonly hasActiveRetainedDomControl: boolean;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly projectionSchedulerKnobs: ReturnType<
    GpuFlowVisiblePublicationScheduler["getKnobs"]
  >;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly requestedProjectionCoverageMissing: boolean;
  readonly requestedRetainedProjectionFrame: GpuFlowRetainedProjectionFrame;
  readonly requestedTransaction: GpuFlowProjectionTransaction;
}): GpuFlowProjectionFrameTransaction {
  if (!requestedProjectionCoverageMissing || hasActiveRetainedDomControl) {
    return {
      blockedReason: null,
      heldPreviousProjection: null,
      retainedProjectionFrame: requestedRetainedProjectionFrame,
      transaction: requestedTransaction,
    };
  }
  if (previousVisibleProjectionState) {
    const heldTransaction =
      createGpuFlowProjectionTransactionForCommittedFrameId({
        committedFrameId:
          previousVisibleProjectionState.committedFrame.displayFrameId,
        kind: "held-previous",
        lane: requestedTransaction.lane,
        rawReasons,
        sample: requestedTransaction.sample,
      });
    const heldPreviousProjection = createGpuFlowHeldPreviousProjection({
      heldTransaction,
      knobs: projectionSchedulerKnobs,
      previousVisibleProjectionState,
      reason: "retained-projection-coverage-missing",
      requestedSample: requestedTransaction.sample,
    });
    return {
      blockedReason: null,
      heldPreviousProjection,
      retainedProjectionFrame: requestedRetainedProjectionFrame,
      transaction: heldTransaction,
    };
  }
  return {
    blockedReason: "retained-projection-coverage-missing",
    heldPreviousProjection: null,
    retainedProjectionFrame: requestedRetainedProjectionFrame,
    transaction: requestedTransaction,
  };
}

function selectGpuFlowProjectionFrameRenderPlan({
  projectionFrameTransaction,
}: {
  readonly projectionFrameTransaction: GpuFlowProjectionFrameTransaction;
}): GpuFlowProjectionFrameRenderPlan {
  assertGpuFlowProjectionFrameTransactionRenderable(projectionFrameTransaction);
  return {
    heldPreviousProjection: projectionFrameTransaction.heldPreviousProjection,
    kind: "render" as const,
    retainedProjectionFrame: projectionFrameTransaction.retainedProjectionFrame,
    transaction: projectionFrameTransaction.transaction,
  };
}

function assertGpuFlowProjectionFrameTransactionRenderable(
  projectionFrameTransaction: GpuFlowProjectionFrameTransaction,
): void {
  if (projectionFrameTransaction.blockedReason !== null) {
    throw new Error(
      "GPU Flow projection frame render plans require a nonblocked projection transaction.",
    );
  }
}

function shouldDeferGpuFlowResolutionUpdates({
  lane,
  rawReasons,
  schedulerState,
  viewportFrame,
  viewportInteractionActive,
}: {
  readonly lane: GpuFlowVisiblePublicationDecision["lane"];
  readonly rawReasons: readonly GpuFrameReason[];
  readonly schedulerState: GpuFlowVisiblePublicationDecision["schedulerState"];
  readonly viewportFrame: boolean;
  readonly viewportInteractionActive: boolean;
}): boolean {
  if (
    shouldRunGpuFlowResolutionUpdatesForContentCatchup({
      lane,
      rawReasons,
      schedulerState,
      viewportFrame,
      viewportInteractionActive,
    })
  ) {
    return false;
  }
  return shouldDeferGpuFlowResolutionUpdatesForFrame({
    lane,
    rawReasons,
    schedulerState,
    viewportFrame,
    viewportInteractionActive,
  });
}

function shouldRunGpuFlowResolutionUpdatesForContentCatchup({
  lane,
  rawReasons,
  schedulerState,
  viewportFrame,
  viewportInteractionActive,
}: {
  readonly lane: GpuFlowVisiblePublicationDecision["lane"];
  readonly rawReasons: readonly GpuFrameReason[];
  readonly schedulerState: GpuFlowVisiblePublicationDecision["schedulerState"];
  readonly viewportFrame: boolean;
  readonly viewportInteractionActive: boolean;
}): boolean {
  if (lane !== "content") {
    return false;
  }
  if (schedulerState === "motion-active") {
    return true;
  }
  return (
    schedulerState === "content-catchup" &&
    viewportFrame &&
    !viewportInteractionActive &&
    !shouldDeferGpuFlowMaintenanceContentCatchup({
      lane,
      rawReasons,
    })
  );
}

function shouldDeferGpuFlowResolutionUpdatesForFrame({
  lane,
  rawReasons,
  schedulerState,
  viewportFrame,
  viewportInteractionActive,
}: {
  readonly lane: GpuFlowVisiblePublicationDecision["lane"];
  readonly rawReasons: readonly GpuFrameReason[];
  readonly schedulerState: GpuFlowVisiblePublicationDecision["schedulerState"];
  readonly viewportFrame: boolean;
  readonly viewportInteractionActive: boolean;
}): boolean {
  return (
    viewportInteractionActive ||
    viewportFrame ||
    (schedulerState === "motion-settling" && lane !== "idle") ||
    shouldDeferGpuFlowMaintenanceContentCatchup({
      lane,
      rawReasons,
    })
  );
}

function publishGpuFlowVisibleFramePublicationOutcome<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame,
>({
  prepareVisibleFrameResourcesForBudget,
  publish,
  transaction,
}: {
  readonly prepareVisibleFrameResourcesForBudget?:
    | GpuFlowVisibleFrameResourceBudgetPreparer
    | undefined;
  readonly publish: GpuFlowVisibleFramePublicationPublisher<PreparedFrame>;
  readonly transaction: GpuFlowVisibleFrameCoordinatorResult<PreparedFrame>;
}): GpuFlowVisibleFrameCoordinatorResult<PreparedFrame> {
  publish(transaction);
  prepareVisibleFrameResourcesForBudget?.(
    transaction.publicationFrameContext.budgetDecision,
  );
  return transaction;
}

function createGpuFlowVisibleFrameRequestFacts({
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
  readonly scheduler: Pick<
    GpuFlowVisiblePublicationScheduler,
    "selectFrameRequest"
  >;
  readonly timestamp: DOMHighResTimeStamp;
  readonly viewportInteractionActive: boolean;
}): GpuFlowVisibleFrameRequestFacts {
  return scheduler.selectFrameRequest({
    hasCommittedContentFrame,
    rawReasons,
    sample,
    timestamp,
    viewportInteractionActive,
  });
}

function prepareGpuFlowRetainedDisplayPublicationCandidate(
  input: GpuFlowRetainedDisplayPublicationInput,
): GpuFlowRetainedDisplayPublicationResult {
  return resolveGpuFlowRetainedDisplayPublication(input);
}
