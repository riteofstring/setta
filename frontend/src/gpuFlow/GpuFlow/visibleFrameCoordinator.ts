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
import { createGpuFlowVisiblePublicationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import {
  createGpuFlowVisibleFrameBudgetBrokerDecision,
  type GpuFlowVisibleFrameBudgetBroker,
  type GpuFlowVisibleFrameBudgetBrokerDecision,
} from "./visibleFrameBudgetBroker";
import {
  createGpuFlowPreparedContentFramePublicationFramePlanPreparer,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  createGpuFlowRetainedPreparedContentFramePublicationContentStageRunner,
  type GpuFlowRetainedPreparedContentFramePublicationContentStageRunner,
} from "./visibleFrameContentPlan";
import type { GpuFlowVisiblePublicationTransactionCompletion } from "./visibleFrameOutcomeReport";
import {
  presentGpuFlowVisibleFramePublicationFrame,
  type GpuFlowVisibleFramePresentationRuntime,
} from "./visibleFramePresentation";
import { proveGpuFlowVisibleFramePublicationPresentation } from "./visibleFramePresentationProofs";
import type { GpuFlowMotionProjectionFramePreparation } from "./visibleFrameProjectionPlan";
import {
  reduceGpuFlowVisibleFramePublicationDecision,
  shouldDeferGpuFlowMaintenanceContentCatchup,
  type GpuFlowVisibleFrameReducerRuntime,
  type GpuFlowVisibleFrameRequestFacts,
  type GpuFlowVisiblePublicationDecision,
} from "./visibleFrameReducerRuntime";
import type { GpuFlowVisibleFrameResourceGraphSnapshot } from "./visibleFrameResourceGraph";
import { reduceGpuFlowMotionProjectionFramePreparation } from "./visibleFrameStateMachine";
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
  GpuFlowContentPublicationFrameResult,
  GpuFlowPreparedContentFramePublicationCandidate,
  GpuFlowPreparedContentFramePublicationCandidateInput,
  GpuFlowPreparedContentFramePublicationCandidatePreparer,
  GpuFlowPreparedContentFramePublicationFramePlanPreparation,
  GpuFlowPreparedContentFramePublicationFramePlanPreparer,
  GpuFlowRetainedDisplayCommittedSurfaceFramePreparer,
  GpuFlowRetainedDisplayPublicationFramePlanPreparer,
  GpuFlowRetainedDisplayPublicationPreparer,
  GpuFlowRetainedPreparedContentFramePublicationContentPublishedRetainedDisplay,
  GpuFlowRetainedPreparedContentFramePublicationContentStageInput,
  GpuFlowRetainedPreparedContentFramePublicationContentStageRunner,
  GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFrameContentPlan";
export { createGpuFlowVisiblePublicationTransactionReport } from "./visibleFrameOutcomeReport";
export type {
  GpuFlowVisiblePublicationCompletion,
  GpuFlowVisiblePublicationDebtFrameRequest,
  GpuFlowVisiblePublicationOutcome,
  GpuFlowVisiblePublicationReducerFrameCompletion,
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
  GpuFlowVisiblePublicationPresentationDebtProof,
} from "./visibleFrameTransactionProofs";
export {
  createGpuFlowContentPublicationWorkPlan,
  createGpuFlowMotionProjectionWorkPlan,
  shouldConsiderGpuFlowDeferredContentPublication,
  shouldDeferGpuFlowBrowserVisualResourceWakeupForPublication,
  shouldSkipGpuFlowDeferredContentPublicationFrame,
} from "./visibleFrameWorkPlan";
export type {
  GpuFlowContentPublicationWorkPlan,
  GpuFlowMotionProjectionWorkPlan,
} from "./visibleFrameWorkPlan";
type GpuFlowVisiblePublicationReducerRuntime =
  GpuFlowVisibleFrameReducerRuntime;

export type GpuFlowVisibleFramePublicationFrameContext = {
  readonly activeEditorPins: readonly string[];
  readonly budgetDecision: GpuFlowVisibleFrameBudgetBrokerDecision;
  readonly deferResolutionUpdates: boolean;
  readonly frameRequest: GpuFlowVisibleFrameRequestFacts;
  readonly viewportFrame: boolean;
};

export type GpuFlowVisibleFramePublicationSample = {
  readonly hasPresentedContentFrame: boolean;
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
  readonly runRetainedPreparedContentFramePublicationContentStage: GpuFlowRetainedPreparedContentFramePublicationContentStageRunner;
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
  readonly presentationRuntime?:
    | GpuFlowVisibleFramePresentationRuntime
    | undefined;
  readonly publish?:
    | GpuFlowVisibleFramePublicationPublisher<
        GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
          ContentPublicationFrame,
          MotionProjectionFrame
        >
      >
    | undefined;
  readonly sampleVisibleFramePublication: () => GpuFlowVisibleFramePublicationSample;
  readonly reducerRuntime: GpuFlowVisiblePublicationReducerRuntime;
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
  presentationRuntime,
  publish,
  reducerRuntime,
  sampleVisibleFramePublication,
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
    prepareVisibleFrameResourcesForBudget,
    reducerRuntime,
    sampledPublication,
  });
  return publishGpuFlowVisibleFramePublicationOutcome({
    presentationRuntime,
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
  prepareVisibleFrameResourcesForBudget,
  reducerRuntime,
  sampledPublication,
}: {
  readonly budgetBroker?: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly prepareContentPublicationFrame: GpuFlowVisibleFramePublicationContentFramePreparer<
    ContentPublicationFrame,
    MotionProjectionFrame
  >;
  readonly prepareMotionProjectionFrame: GpuFlowVisibleFramePublicationMotionFramePreparer<MotionProjectionFrame>;
  readonly prepareVisibleFrameResourcesForBudget?:
    | GpuFlowVisibleFrameResourceBudgetPreparer
    | undefined;
  readonly sampledPublication: GpuFlowVisibleFramePublicationSample;
  readonly reducerRuntime: GpuFlowVisiblePublicationReducerRuntime;
}): GpuFlowVisibleFrameReducedPublicationTransaction<
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
    ContentPublicationFrame,
    MotionProjectionFrame
  >
> {
  const {
    hasPresentedContentFrame,
    previousVisibleProjectionState,
    rawReasons,
    runtimeViewportFrame,
    sample,
    timestamp,
    visibleFrameResourceGraphSnapshot,
    viewportInteractionActive,
  } = sampledPublication;
  const reducerPolicy = reducerRuntime.getKnobs();
  const frameRequest = createGpuFlowVisibleFrameRequestFacts({
    hasPresentedContentFrame,
    rawReasons,
    reducerRuntime,
    sample,
    timestamp,
    viewportInteractionActive,
  });
  const publicationDecision = reduceGpuFlowVisibleFramePublicationDecision({
    frameRequest,
    reducerPolicy,
  });
  const publicationFrameContext =
    createGpuFlowVisibleFramePublicationFrameContext({
      frameRequest,
      publicationDecision,
      budgetBroker,
      rawReasons,
      runtimeViewportFrame,
      visibleFrameResourceGraphSnapshot,
      viewportInteractionActive,
    });
  prepareVisibleFrameResourcesForBudget?.(
    publicationFrameContext.budgetDecision,
  );
  const candidateSet = prepareGpuFlowVisibleFramePublicationCandidateSet({
    prepareContentPublicationFrame,
    prepareMotionProjectionFrame,
    previousVisibleProjectionState,
    publicationDecision,
    publicationFrameContext,
    projectionSchedulerKnobs: reducerPolicy,
    rawReasons,
  });
  const preparedFrame = createGpuFlowVisibleFramePublicationPreparedFrame({
    candidateSet,
    previousVisibleProjectionState,
    publicationDecision,
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
      publicationDecision,
      reducerRuntime,
      transactionProof: preparedFrame.transactionProof,
    },
  );
  return Object.freeze({
    ...transactionCompletion,
    preparedFrame,
    publicationDecision,
    publicationFrameContext,
  });
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
    GpuFlowVisiblePublicationReducerRuntime["getKnobs"]
  >;
  readonly rawReasons: readonly GpuFrameReason[];
}): GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> {
  const contentDecisionKernel =
    createGpuFlowVisiblePublicationContentDecisionKernel();
  const preparePreparedContentFramePublicationFramePlan =
    createGpuFlowPreparedContentFramePublicationFramePlanPreparer({
      contentDecisionKernel,
    });
  const prepareRetainedDisplayPublicationFramePlan =
    createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
      contentDecisionKernel,
      previousVisibleProjectionState,
      prepareRetainedDisplayPublicationCandidate:
        prepareGpuFlowRetainedDisplayPublicationCandidate,
    });
  const runRetainedPreparedContentFramePublicationContentStage =
    createGpuFlowRetainedPreparedContentFramePublicationContentStageRunner({
      contentDecisionKernel,
      preparePreparedContentFramePublicationFramePlan,
      prepareRetainedDisplayPublicationFramePlan,
    });
  const motionProjectionWorkPlan = createGpuFlowMotionProjectionWorkPlan({
    publicationDecision,
  });
  const motionProjectionFrame = reduceGpuFlowMotionProjectionFramePreparation({
    preparation: prepareMotionProjectionFrame({
      motionProjectionWorkPlan,
      previousVisibleProjectionState,
      publicationDecision,
      publicationFrameContext,
    }),
    previousVisibleProjectionState,
    projectionSchedulerKnobs,
    rawReasons,
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
    runRetainedPreparedContentFramePublicationContentStage,
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
    activeEditorPins: Object.freeze([
      ...(visibleFrameResourceGraphSnapshot?.activeEditorPins ?? []),
    ]),
    budgetDecision,
    deferResolutionUpdates: budgetDecision.resolutionUpdates.deferred,
    frameRequest,
    viewportFrame,
  });
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
  presentationRuntime,
  publish,
  transaction,
}: {
  readonly presentationRuntime?:
    | GpuFlowVisibleFramePresentationRuntime
    | undefined;
  readonly publish?:
    | GpuFlowVisibleFramePublicationPublisher<PreparedFrame>
    | undefined;
  readonly transaction: GpuFlowVisibleFrameCoordinatorResult<PreparedFrame>;
}): GpuFlowVisibleFrameCoordinatorResult<PreparedFrame> {
  if (presentationRuntime) {
    presentGpuFlowVisibleFramePublicationFrame({
      ...presentationRuntime,
      publicationTransaction: transaction as unknown as Parameters<
        typeof presentGpuFlowVisibleFramePublicationFrame
      >[0]["publicationTransaction"],
    });
  }
  publish?.(transaction);
  return transaction;
}

function createGpuFlowVisibleFrameRequestFacts({
  hasPresentedContentFrame,
  rawReasons,
  reducerRuntime,
  sample,
  timestamp,
  viewportInteractionActive,
}: {
  readonly hasPresentedContentFrame: boolean;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly sample: GpuFlowLiveProjectionSample;
  readonly reducerRuntime: Pick<
    GpuFlowVisiblePublicationReducerRuntime,
    "selectFrameRequest"
  >;
  readonly timestamp: DOMHighResTimeStamp;
  readonly viewportInteractionActive: boolean;
}): GpuFlowVisibleFrameRequestFacts {
  return reducerRuntime.selectFrameRequest({
    hasPresentedContentFrame,
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
