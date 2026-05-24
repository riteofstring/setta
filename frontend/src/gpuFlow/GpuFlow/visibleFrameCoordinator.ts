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
import { createGpuFlowVisibleFramePresentationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
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
import type { GpuFlowVisibleFramePresentationTransactionCompletion } from "./visibleFrameOutcomeReport";
import {
  presentGpuFlowVisibleFramePublicationFrame,
  type GpuFlowVisibleFramePresentationRuntime,
} from "./visibleFramePresentation";
import { proveGpuFlowVisibleFramePublicationPresentation } from "./visibleFramePresentationProofs";
import type { GpuFlowMotionProjectionFramePreparation } from "./visibleFrameProjectionPlan";
import {
  reduceGpuFlowVisibleFrameReducerDecision,
  shouldDeferGpuFlowMaintenanceContentCatchup,
  type GpuFlowVisibleFrameReducerDecision,
  type GpuFlowVisibleFrameReducerRuntime,
  type GpuFlowVisibleFrameRequestFacts,
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
  createGpuFlowContentPreparationWorkPlan,
  createGpuFlowMotionProjectionWorkPlan,
  type GpuFlowContentPreparationWorkPlan,
  type GpuFlowMotionProjectionWorkPlan,
} from "./visibleFrameWorkPlan";

export { createGpuFlowContentPreparationFrameResult } from "./visibleFrameContentPlan";
export type {
  GpuFlowContentPreparationFrameResult,
  GpuFlowPreparedContentBlockedCandidateResourceWork,
  GpuFlowPreparedContentFramePublicationCandidate,
  GpuFlowPreparedContentFramePublicationCandidateInput,
  GpuFlowPreparedContentFramePublicationCandidatePreparer,
  GpuFlowPreparedContentFramePublicationFramePlanPreparation,
  GpuFlowPreparedContentFramePublicationFramePlanPreparer,
  GpuFlowRetainedDisplayPreparedContentFramePreparer,
  GpuFlowRetainedDisplayPublicationFramePlanPreparer,
  GpuFlowRetainedDisplayPublicationPreparer,
  GpuFlowRetainedPreparedContentFramePublicationContentPublishedRetainedDisplay,
  GpuFlowRetainedPreparedContentFramePublicationContentStageInput,
  GpuFlowRetainedPreparedContentFramePublicationContentStageRunner,
  GpuFlowVisibleFrameBlockedPresentationCandidate,
} from "./visibleFrameContentPlan";
export { createGpuFlowVisibleFramePresentationTransactionReport } from "./visibleFrameOutcomeReport";
export type {
  GpuFlowVisibleFramePresentationOutcome,
  GpuFlowVisibleFramePresentationReducerFrameCompletion,
  GpuFlowVisibleFramePresentationTransactionCompletion,
  GpuFlowVisibleFrameReducerCompletion,
  GpuFlowVisibleFrameReducerDebtFrameRequest,
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
  GpuFlowVisibleFramePresentationBlockedProof,
  GpuFlowVisibleFramePresentationDebtProof,
  GpuFlowVisibleFramePublicationCandidateSet,
  GpuFlowVisibleFramePublicationContentCandidate,
  GpuFlowVisibleFramePublicationMotionCandidate,
  GpuFlowVisibleFramePublicationPreparedCandidateSet,
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrame,
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory,
  GpuFlowVisibleFramePublicationPreparedFrame,
  GpuFlowVisibleFramePublicationTransactionProof,
  GpuFlowVisibleFramePublicationTransactionProofFactory,
} from "./visibleFrameTransactionProofs";
export {
  createGpuFlowContentPreparationWorkPlan,
  createGpuFlowMotionProjectionWorkPlan,
  shouldConsiderGpuFlowDeferredContentPreparation,
  shouldDeferGpuFlowBrowserVisualResourceWakeupForPreparation,
  shouldSkipGpuFlowDeferredContentPreparationFrame,
} from "./visibleFrameWorkPlan";
export type {
  GpuFlowContentPreparationWorkPlan,
  GpuFlowMotionProjectionWorkPlan,
} from "./visibleFrameWorkPlan";
type GpuFlowVisibleFramePresentationReducerRuntime =
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
> = GpuFlowVisibleFramePresentationTransactionCompletion & {
  readonly preparedFrame: PreparedFrame;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
};

type GpuFlowVisibleFramePublicationContentFramePreparer<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = (input: {
  readonly contentPreparationWorkPlan: GpuFlowContentPreparationWorkPlan;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
  readonly runRetainedPreparedContentFramePublicationContentStage: GpuFlowRetainedPreparedContentFramePublicationContentStageRunner;
}) => ContentPreparationFrame;

type GpuFlowVisibleFramePublicationMotionFramePreparer<
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = (input: {
  readonly motionProjectionWorkPlan: GpuFlowMotionProjectionWorkPlan;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
}) => GpuFlowMotionProjectionFramePreparation<MotionProjectionFrame>;

type GpuFlowVisibleFramePublicationPublisher<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame,
> = (transaction: GpuFlowVisibleFrameCoordinatorResult<PreparedFrame>) => void;

type GpuFlowVisibleFrameResourceBudgetPreparer = (
  budgetDecision: GpuFlowVisibleFrameBudgetBrokerDecision,
) => void;

type GpuFlowVisibleFrameCoordinatorInput<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = {
  readonly prepareContentPreparationFrame: GpuFlowVisibleFramePublicationContentFramePreparer<
    ContentPreparationFrame,
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
          ContentPreparationFrame,
          MotionProjectionFrame
        >
      >
    | undefined;
  readonly sampleVisibleFramePublication: () => GpuFlowVisibleFramePublicationSample;
  readonly reducerRuntime: GpuFlowVisibleFramePresentationReducerRuntime;
};

type GpuFlowVisibleFrameReducedPublicationTransaction<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame & {
    readonly transactionProof: GpuFlowVisibleFramePublicationTransactionProof;
  },
> = GpuFlowVisibleFrameCoordinatorResult<PreparedFrame> & {
  readonly preparedFrame: PreparedFrame;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
};

export function runGpuFlowVisibleFrameCoordinator<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  prepareContentPreparationFrame,
  prepareMotionProjectionFrame,
  prepareVisibleFrameResourcesForBudget,
  budgetBroker,
  presentationRuntime,
  publish,
  reducerRuntime,
  sampleVisibleFramePublication,
}: GpuFlowVisibleFrameCoordinatorInput<
  ContentPreparationFrame,
  MotionProjectionFrame
>): GpuFlowVisibleFrameCoordinatorResult<
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
    ContentPreparationFrame,
    MotionProjectionFrame
  >
> {
  const sampledPublication = sampleGpuFlowVisibleFramePublicationTransaction({
    sampleVisibleFramePublication,
  });
  const transaction = reduceGpuFlowVisibleFramePublicationFrame({
    budgetBroker,
    prepareContentPreparationFrame,
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
  ContentPreparationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  budgetBroker,
  prepareContentPreparationFrame,
  prepareMotionProjectionFrame,
  prepareVisibleFrameResourcesForBudget,
  reducerRuntime,
  sampledPublication,
}: {
  readonly budgetBroker?: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly prepareContentPreparationFrame: GpuFlowVisibleFramePublicationContentFramePreparer<
    ContentPreparationFrame,
    MotionProjectionFrame
  >;
  readonly prepareMotionProjectionFrame: GpuFlowVisibleFramePublicationMotionFramePreparer<MotionProjectionFrame>;
  readonly prepareVisibleFrameResourcesForBudget?:
    | GpuFlowVisibleFrameResourceBudgetPreparer
    | undefined;
  readonly sampledPublication: GpuFlowVisibleFramePublicationSample;
  readonly reducerRuntime: GpuFlowVisibleFramePresentationReducerRuntime;
}): GpuFlowVisibleFrameReducedPublicationTransaction<
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
    ContentPreparationFrame,
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
  const reducerDecision = reduceGpuFlowVisibleFrameReducerDecision({
    frameRequest,
    reducerPolicy,
  });
  const publicationFrameContext =
    createGpuFlowVisibleFramePublicationFrameContext({
      frameRequest,
      reducerDecision,
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
    prepareContentPreparationFrame,
    prepareMotionProjectionFrame,
    previousVisibleProjectionState,
    reducerDecision,
    publicationFrameContext,
    projectionSchedulerKnobs: reducerPolicy,
    rawReasons,
  });
  const preparedFrame = createGpuFlowVisibleFramePublicationPreparedFrame({
    candidateSet,
    previousVisibleProjectionState,
    reducerDecision,
  });
  const transactionCompletion = proveGpuFlowVisibleFramePublicationPresentation(
    {
      forceImmediateReducerDebtFrame:
        preparedFrame.contentPreparationFrame.forceImmediateReducerDebtFrame ??
        false,
      followUpFrameReason:
        preparedFrame.contentPreparationFrame
          .retainedDisplayFollowUpFrameReason ?? null,
      previousVisibleProjectionState,
      reducerDecision,
      reducerRuntime,
      transactionProof: preparedFrame.transactionProof,
    },
  );
  return Object.freeze({
    ...transactionCompletion,
    preparedFrame,
    reducerDecision,
    publicationFrameContext,
  });
}

function prepareGpuFlowVisibleFramePublicationCandidateSet<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  prepareContentPreparationFrame,
  prepareMotionProjectionFrame,
  previousVisibleProjectionState,
  reducerDecision,
  publicationFrameContext,
  projectionSchedulerKnobs,
  rawReasons,
}: {
  readonly prepareContentPreparationFrame: GpuFlowVisibleFramePublicationContentFramePreparer<
    ContentPreparationFrame,
    MotionProjectionFrame
  >;
  readonly prepareMotionProjectionFrame: GpuFlowVisibleFramePublicationMotionFramePreparer<MotionProjectionFrame>;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
  readonly projectionSchedulerKnobs: ReturnType<
    GpuFlowVisibleFramePresentationReducerRuntime["getKnobs"]
  >;
  readonly rawReasons: readonly GpuFrameReason[];
}): GpuFlowVisibleFramePublicationCandidateSet<
  ContentPreparationFrame,
  MotionProjectionFrame
> {
  const contentDecisionKernel =
    createGpuFlowVisibleFramePresentationContentDecisionKernel();
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
    reducerDecision,
  });
  const motionProjectionFrame = reduceGpuFlowMotionProjectionFramePreparation({
    preparation: prepareMotionProjectionFrame({
      motionProjectionWorkPlan,
      previousVisibleProjectionState,
      reducerDecision,
      publicationFrameContext,
    }),
    previousVisibleProjectionState,
    projectionSchedulerKnobs,
    rawReasons,
  });
  const contentPreparationWorkPlan = createGpuFlowContentPreparationWorkPlan({
    blockedProjectionOnlyFrame:
      motionProjectionFrame.blockedPresentationCandidate !== null,
    reducerDecision,
    renderedProjectionOnlyFrame:
      motionProjectionFrame.visibleProjectionState !== null,
  });
  const contentPreparationFrame = prepareContentPreparationFrame({
    contentPreparationWorkPlan,
    motionProjectionFrame,
    previousVisibleProjectionState,
    reducerDecision,
    publicationFrameContext,
    runRetainedPreparedContentFramePublicationContentStage,
  });
  return Object.freeze({
    contentPreparationFrame,
    motionProjectionFrame,
  });
}

function createGpuFlowVisibleFramePublicationPreparedFrame<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  candidateSet,
  previousVisibleProjectionState,
  reducerDecision,
}: {
  readonly candidateSet: GpuFlowVisibleFramePublicationCandidateSet<
    ContentPreparationFrame,
    MotionProjectionFrame
  >;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
  ContentPreparationFrame,
  MotionProjectionFrame
> {
  const transactionProof =
    createGpuFlowVisibleFramePublicationTransactionProofFactory()({
      contentPreparationFrame: candidateSet.contentPreparationFrame,
      forcedBlockedPresentationCandidate:
        candidateSet.forcedBlockedPresentationCandidate,
      motionProjectionFrame: candidateSet.motionProjectionFrame,
      previousVisibleProjectionState,
      reducerDecision,
    });
  const preparedFrame =
    createGpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory()({
      contentPreparationFrame: candidateSet.contentPreparationFrame,
      motionProjectionFrame: candidateSet.motionProjectionFrame,
      transactionProof,
    });
  return preparedFrame;
}

function createGpuFlowVisibleFramePublicationFrameContext({
  budgetBroker,
  frameRequest,
  reducerDecision,
  rawReasons,
  runtimeViewportFrame,
  visibleFrameResourceGraphSnapshot,
  viewportInteractionActive,
}: {
  readonly budgetBroker?: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly frameRequest: GpuFlowVisibleFrameRequestFacts;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
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
    lane: reducerDecision.lane,
    rawReasons,
    reducerState: reducerDecision.reducerState,
    viewportFrame,
    viewportInteractionActive,
  });
  const budgetDecision = createGpuFlowVisibleFrameBudgetBrokerDecision({
    budgetBroker,
    deferResolutionUpdates,
    reducerDecision,
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
  reducerState,
  viewportFrame,
  viewportInteractionActive,
}: {
  readonly lane: GpuFlowVisibleFrameReducerDecision["lane"];
  readonly rawReasons: readonly GpuFrameReason[];
  readonly reducerState: GpuFlowVisibleFrameReducerDecision["reducerState"];
  readonly viewportFrame: boolean;
  readonly viewportInteractionActive: boolean;
}): boolean {
  if (
    shouldRunGpuFlowResolutionUpdatesForContentCatchup({
      lane,
      rawReasons,
      reducerState,
      viewportFrame,
      viewportInteractionActive,
    })
  ) {
    return false;
  }
  return shouldDeferGpuFlowResolutionUpdatesForFrame({
    lane,
    rawReasons,
    reducerState,
    viewportFrame,
    viewportInteractionActive,
  });
}

function shouldRunGpuFlowResolutionUpdatesForContentCatchup({
  lane,
  rawReasons,
  reducerState,
  viewportFrame,
  viewportInteractionActive,
}: {
  readonly lane: GpuFlowVisibleFrameReducerDecision["lane"];
  readonly rawReasons: readonly GpuFrameReason[];
  readonly reducerState: GpuFlowVisibleFrameReducerDecision["reducerState"];
  readonly viewportFrame: boolean;
  readonly viewportInteractionActive: boolean;
}): boolean {
  if (lane !== "content") {
    return false;
  }
  if (reducerState === "motion-active") {
    return true;
  }
  return (
    reducerState === "content-catchup" &&
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
  reducerState,
  viewportFrame,
  viewportInteractionActive,
}: {
  readonly lane: GpuFlowVisibleFrameReducerDecision["lane"];
  readonly rawReasons: readonly GpuFrameReason[];
  readonly reducerState: GpuFlowVisibleFrameReducerDecision["reducerState"];
  readonly viewportFrame: boolean;
  readonly viewportInteractionActive: boolean;
}): boolean {
  return (
    viewportInteractionActive ||
    viewportFrame ||
    (reducerState === "motion-settling" && lane !== "idle") ||
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
    GpuFlowVisibleFramePresentationReducerRuntime,
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
