import type { GpuFrameReason } from "../gpuRenderer";
import {
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  resolveGpuFlowRetainedDisplayPublication,
  type GpuFlowRetainedDisplayPublicationInput,
  type GpuFlowRetainedDisplayPublicationResult,
} from "./flowRetainedDisplayTransaction";
import {
  createGpuFlowVisiblePublicationCandidateDecisionKernel,
  type GpuFlowRetainedProjectionPublicationCandidateSelector,
  type GpuFlowVisiblePublicationCandidateDecisionKernel,
} from "./visibleFrameActorAdapters/contentDecisionKernel";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  createGpuFlowRetainedCommittedSurfacePublicationContentStageRunner,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  type GpuFlowRetainedCommittedSurfacePublicationContentStageRunner,
} from "./visibleFrameContentPlan";
import {
  createGpuFlowVisibleFrameBudgetBrokerDecision,
  type GpuFlowVisibleFrameBudgetBroker,
  type GpuFlowVisibleFrameBudgetBrokerDecision,
} from "./visibleFrameBudgetBroker";
import { prepareGpuFlowForcedBlockedVisibleFramePublicationCandidateSet } from "./visibleFrameForcedBlockedCandidateSet";
import type { GpuFlowVisiblePublicationTransactionCompletion } from "./visibleFrameOutcomeReport";
import { proveGpuFlowVisibleFramePublicationPresentation } from "./visibleFramePresentationProofs";
import type {
  GpuFlowMotionProjectionFramePreparation,
  GpuFlowProjectionFrameRenderPlan,
  GpuFlowProjectionFrameTransaction,
} from "./visibleFrameProjectionPlan";
import {
  shouldDeferGpuFlowMaintenanceContentCatchup,
  type GpuFlowVisibleFrameRequestCoordinator,
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
  type GpuFlowVisiblePublicationBlockedProof,
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

export type GpuFlowVisibleFrameCoordinatorResult<
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
  const {
    hasCommittedContentFrame,
    previousVisibleProjectionState,
    rawReasons,
    runtimeViewportFrame,
    sample,
    timestamp,
    viewportInteractionActive,
  } = sampledPublication;
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
      budgetBroker,
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
    projectionSchedulerKnobs: scheduler.getKnobs(),
    rawReasons,
  });
  const preparedFrame = proveGpuFlowVisibleFramePublicationCandidateSet({
    candidateSet,
    previousVisibleProjectionState,
    publicationDecision,
  });
  const transaction = reduceGpuFlowVisibleFramePublicationTransaction({
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
  const candidateDecisionKernel =
    createGpuFlowVisiblePublicationCandidateDecisionKernel();
  const prepareCommittedSurfacePublicationFramePlan =
    createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
      contentDecisionKernel: candidateDecisionKernel,
    });
  const prepareRetainedDisplayPublicationFramePlan =
    createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
      contentDecisionKernel: candidateDecisionKernel,
      previousVisibleProjectionState,
      prepareRetainedDisplayPublicationCandidate:
        prepareGpuFlowRetainedDisplayPublicationCandidate,
    });
  const runRetainedCommittedSurfacePublicationContentStage =
    createGpuFlowRetainedCommittedSurfacePublicationContentStageRunner({
      contentDecisionKernel: candidateDecisionKernel,
      prepareCommittedSurfacePublicationFramePlan,
      prepareRetainedDisplayPublicationFramePlan,
    });
  const forcedCandidateSet =
    prepareGpuFlowForcedBlockedVisibleFramePublicationCandidateSet({
      prepareContentPublicationFrame,
      prepareMotionProjectionFrame,
      previousVisibleProjectionState,
      publicationDecision,
      publicationFrameContext,
      runRetainedCommittedSurfacePublicationContentStage,
    });
  if (forcedCandidateSet) {
    return forcedCandidateSet;
  }
  const selectRetainedProjectionPublicationCandidate =
    candidateDecisionKernel.createRetainedProjectionPublicationCandidateSelector(
      {
        previousVisibleProjectionState,
        projectionSchedulerKnobs,
        rawReasons,
      },
    );
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
    candidateDecisionKernel,
    selectProjectionFrameRenderPlan: selectGpuFlowProjectionFrameRenderPlan,
    selectRetainedProjectionPublicationCandidate,
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

function proveGpuFlowVisibleFramePublicationCandidateSet<
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
  publicationDecision,
  rawReasons,
  runtimeViewportFrame,
  viewportInteractionActive,
}: {
  readonly budgetBroker?: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly runtimeViewportFrame: boolean;
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
  });
  return Object.freeze({
    budgetDecision,
    deferResolutionUpdates: budgetDecision.resolutionUpdates.deferred,
    viewportFrame,
  });
}

function resolveGpuFlowMotionProjectionFramePreparation<
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  preparation,
  previousVisibleProjectionState,
  candidateDecisionKernel,
  selectProjectionFrameRenderPlan,
  selectRetainedProjectionPublicationCandidate,
}: {
  readonly preparation: GpuFlowMotionProjectionFramePreparation<MotionProjectionFrame>;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly candidateDecisionKernel: Pick<
    GpuFlowVisiblePublicationCandidateDecisionKernel,
    | "createRetainedProjectionBlockedPublicationCandidate"
    | "selectMotionProjectionFrameBlockedPublicationReason"
    | "selectProjectionFrameTransaction"
  >;
  readonly selectProjectionFrameRenderPlan: GpuFlowProjectionFrameRenderPlanSelector;
  readonly selectRetainedProjectionPublicationCandidate: GpuFlowRetainedProjectionPublicationCandidateSelector;
}): MotionProjectionFrame {
  if (preparation.kind === "not-rendered") {
    return preparation.frame;
  }
  const requestedRetainedProjectionFrame =
    preparation.resolveRetainedProjectionFrame({
      transaction: preparation.requestedTransaction,
    });
  const retainedProjectionPublicationCandidate =
    selectRetainedProjectionPublicationCandidate({
      hasActiveRetainedDomControl: preparation.hasActiveRetainedDomControl,
      requestedProjectionCoverageMissing:
        requestedRetainedProjectionFrame.missingCoverageSurfaceIds.size > 0,
      requestedTransaction: preparation.requestedTransaction,
    });
  const projectionFrameTransaction =
    candidateDecisionKernel.selectProjectionFrameTransaction({
      publicationCandidate: retainedProjectionPublicationCandidate,
      requestedRetainedProjectionFrame,
      resolveHeldRetainedProjectionFrame:
        preparation.resolveRetainedProjectionFrame,
    });
  if (projectionFrameTransaction.blockedReason !== null) {
    return preparation.createBlockedProjectionFrame({
      blockedPublicationCandidate:
        candidateDecisionKernel.createRetainedProjectionBlockedPublicationCandidate(
          {
            blockedReason: projectionFrameTransaction.blockedReason,
            heldPreviousProjectionState: previousVisibleProjectionState,
          },
        ),
    });
  }
  const projectionFrameRenderPlan = selectProjectionFrameRenderPlan({
    projectionFrameTransaction,
  });
  const projectionFrame = preparation.renderProjectionFrame({
    projectionFrameRenderPlan,
    requestedProjectionTransaction: preparation.requestedTransaction,
  });
  const projectionBlockedReason =
    candidateDecisionKernel.selectMotionProjectionFrameBlockedPublicationReason(
      projectionFrame,
    );
  if (projectionBlockedReason) {
    return preparation.createBlockedProjectionFrame({
      blockedPublicationCandidate:
        candidateDecisionKernel.createRetainedProjectionBlockedPublicationCandidate(
          {
            blockedReason: projectionBlockedReason,
            heldPreviousProjectionState: previousVisibleProjectionState,
          },
        ),
    });
  }
  return projectionFrame;
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

function reduceGpuFlowVisibleFramePublicationTransaction<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame & {
    readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof;
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
}): GpuFlowVisibleFrameReducedPublicationTransaction<PreparedFrame> {
  const transactionCompletion = proveGpuFlowVisibleFramePublicationPresentation(
    {
      blockedPublicationProof: preparedFrame.transactionProof.blockedProof,
      forceImmediatePublicationDebtFrame:
        preparedFrame.contentPublicationFrame
          .forceImmediatePublicationDebtFrame ?? false,
      followUpFrameReason:
        preparedFrame.contentPublicationFrame
          .retainedDisplayFollowUpFrameReason ?? null,
      previousVisibleProjectionState,
      publicationDecision,
      scheduler,
      transactionProof: preparedFrame.transactionProof,
    },
  );
  return Object.freeze({
    ...transactionCompletion,
    preparedFrame,
    publicationDecision,
  });
}

function publishGpuFlowVisibleFramePublicationOutcome<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame,
>({
  publish,
  transaction,
}: {
  readonly publish: GpuFlowVisibleFramePublicationPublisher<PreparedFrame>;
  readonly transaction: GpuFlowVisibleFrameCoordinatorResult<PreparedFrame>;
}): GpuFlowVisibleFrameCoordinatorResult<PreparedFrame> {
  publish(transaction);
  return transaction;
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

function prepareGpuFlowRetainedDisplayPublicationCandidate(
  input: GpuFlowRetainedDisplayPublicationInput,
): GpuFlowRetainedDisplayPublicationResult {
  return resolveGpuFlowRetainedDisplayPublication(input);
}
