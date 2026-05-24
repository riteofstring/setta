import type { GpuFrameReason } from "../gpuRenderer";
import {
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  resolveGpuFlowRetainedDisplayPresentation,
  type GpuFlowRetainedDisplayPresentationInput,
  type GpuFlowRetainedDisplayPresentationResult,
} from "./flowRetainedDisplayTransaction";
import { createGpuFlowVisibleFramePresentationContentDecisionKernel } from "./visibleFrameActorAdapters/contentDecisionKernel";
import {
  createGpuFlowVisibleFrameBudgetBrokerDecision,
  type GpuFlowVisibleFrameBudgetBroker,
  type GpuFlowVisibleFrameBudgetBrokerDecision,
} from "./visibleFrameBudgetBroker";
import {
  createGpuFlowPreparedContentFramePresentationFramePlanPreparer,
  createGpuFlowRetainedDisplayPresentationFramePlanPreparer,
  createGpuFlowRetainedPreparedContentFramePresentationContentStageRunner,
  type GpuFlowRetainedPreparedContentFramePresentationContentStageRunner,
} from "./visibleFrameContentPlan";
import type { GpuFlowVisibleFramePresentationTransactionCompletion } from "./visibleFrameOutcomeReport";
import {
  presentGpuFlowVisibleFramePresentationFrame,
  type GpuFlowVisibleFramePresentationRuntime,
} from "./visibleFramePresentation";
import { proveGpuFlowVisibleFramePresentationProof } from "./visibleFramePresentationProofs";
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
  createGpuFlowVisibleFramePresentationPreparedCandidateSetFrameFactory,
  createGpuFlowVisibleFramePresentationTransactionProofFactory,
  type GpuFlowVisibleFramePresentationCandidateSet,
  type GpuFlowVisibleFramePresentationContentCandidate,
  type GpuFlowVisibleFramePresentationMotionCandidate,
  type GpuFlowVisibleFramePresentationPreparedCandidateSetFrame,
  type GpuFlowVisibleFramePresentationPreparedFrame,
  type GpuFlowVisibleFramePresentationTransactionProof,
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
  GpuFlowPreparedContentFramePresentationCandidate,
  GpuFlowPreparedContentFramePresentationCandidateInput,
  GpuFlowPreparedContentFramePresentationCandidatePreparer,
  GpuFlowPreparedContentFramePresentationFramePlanPreparation,
  GpuFlowPreparedContentFramePresentationFramePlanPreparer,
  GpuFlowRetainedDisplayPreparedContentFramePreparer,
  GpuFlowRetainedDisplayPresentationFramePlanPreparer,
  GpuFlowRetainedDisplayPresentationPreparer,
  GpuFlowRetainedPreparedContentFramePresentationContentPresentedRetainedDisplay,
  GpuFlowRetainedPreparedContentFramePresentationContentStageInput,
  GpuFlowRetainedPreparedContentFramePresentationContentStageRunner,
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
  GpuFlowVisibleFramePresentationCandidateSet,
  GpuFlowVisibleFramePresentationContentCandidate,
  GpuFlowVisibleFramePresentationDebtProof,
  GpuFlowVisibleFramePresentationMotionCandidate,
  GpuFlowVisibleFramePresentationPreparedCandidateSet,
  GpuFlowVisibleFramePresentationPreparedCandidateSetFrame,
  GpuFlowVisibleFramePresentationPreparedCandidateSetFrameFactory,
  GpuFlowVisibleFramePresentationPreparedFrame,
  GpuFlowVisibleFramePresentationTransactionProof,
  GpuFlowVisibleFramePresentationTransactionProofFactory,
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

export type GpuFlowVisibleFramePresentationFrameContext = {
  readonly activeEditorPins: readonly string[];
  readonly budgetDecision: GpuFlowVisibleFrameBudgetBrokerDecision;
  readonly deferResolutionUpdates: boolean;
  readonly frameRequest: GpuFlowVisibleFrameRequestFacts;
  readonly viewportFrame: boolean;
};

export type GpuFlowVisibleFramePresentationSample = {
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
  PreparedFrame extends GpuFlowVisibleFramePresentationPreparedFrame,
> = GpuFlowVisibleFramePresentationTransactionCompletion & {
  readonly preparedFrame: PreparedFrame;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly presentationFrameContext: GpuFlowVisibleFramePresentationFrameContext;
};

type GpuFlowVisibleFramePresentationContentFramePreparer<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
> = (input: {
  readonly contentPreparationWorkPlan: GpuFlowContentPreparationWorkPlan;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly presentationFrameContext: GpuFlowVisibleFramePresentationFrameContext;
  readonly runRetainedPreparedContentFramePresentationContentStage: GpuFlowRetainedPreparedContentFramePresentationContentStageRunner;
}) => ContentPreparationFrame;

type GpuFlowVisibleFramePresentationMotionFramePreparer<
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
> = (input: {
  readonly motionProjectionWorkPlan: GpuFlowMotionProjectionWorkPlan;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly presentationFrameContext: GpuFlowVisibleFramePresentationFrameContext;
}) => GpuFlowMotionProjectionFramePreparation<MotionProjectionFrame>;

type GpuFlowVisibleFramePresentationObserver<
  PreparedFrame extends GpuFlowVisibleFramePresentationPreparedFrame,
> = (transaction: GpuFlowVisibleFrameCoordinatorResult<PreparedFrame>) => void;

type GpuFlowVisibleFrameResourceBudgetPreparer = (
  budgetDecision: GpuFlowVisibleFrameBudgetBrokerDecision,
) => void;

type GpuFlowVisibleFrameCoordinatorInput<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
> = {
  readonly prepareContentPreparationFrame: GpuFlowVisibleFramePresentationContentFramePreparer<
    ContentPreparationFrame,
    MotionProjectionFrame
  >;
  readonly prepareMotionProjectionFrame: GpuFlowVisibleFramePresentationMotionFramePreparer<MotionProjectionFrame>;
  readonly prepareVisibleFrameResourcesForBudget?:
    | GpuFlowVisibleFrameResourceBudgetPreparer
    | undefined;
  readonly budgetBroker?: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly presentationRuntime?:
    | GpuFlowVisibleFramePresentationRuntime
    | undefined;
  readonly onPresentation?:
    | GpuFlowVisibleFramePresentationObserver<
        GpuFlowVisibleFramePresentationPreparedCandidateSetFrame<
          ContentPreparationFrame,
          MotionProjectionFrame
        >
      >
    | undefined;
  readonly sampleVisibleFramePresentation: () => GpuFlowVisibleFramePresentationSample;
  readonly reducerRuntime: GpuFlowVisibleFramePresentationReducerRuntime;
};

type GpuFlowVisibleFrameReducedPresentationTransaction<
  PreparedFrame extends GpuFlowVisibleFramePresentationPreparedFrame & {
    readonly transactionProof: GpuFlowVisibleFramePresentationTransactionProof;
  },
> = GpuFlowVisibleFrameCoordinatorResult<PreparedFrame> & {
  readonly preparedFrame: PreparedFrame;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
};

export function runGpuFlowVisibleFrameCoordinator<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
>({
  prepareContentPreparationFrame,
  prepareMotionProjectionFrame,
  prepareVisibleFrameResourcesForBudget,
  budgetBroker,
  presentationRuntime,
  onPresentation,
  reducerRuntime,
  sampleVisibleFramePresentation,
}: GpuFlowVisibleFrameCoordinatorInput<
  ContentPreparationFrame,
  MotionProjectionFrame
>): GpuFlowVisibleFrameCoordinatorResult<
  GpuFlowVisibleFramePresentationPreparedCandidateSetFrame<
    ContentPreparationFrame,
    MotionProjectionFrame
  >
> {
  const sampledPresentation = sampleGpuFlowVisibleFramePresentationTransaction({
    sampleVisibleFramePresentation,
  });
  const transaction = reduceGpuFlowVisibleFramePresentationFrame({
    budgetBroker,
    prepareContentPreparationFrame,
    prepareMotionProjectionFrame,
    prepareVisibleFrameResourcesForBudget,
    reducerRuntime,
    sampledPresentation,
  });
  return presentGpuFlowVisibleFramePresentationOutcome({
    presentationRuntime,
    onPresentation,
    transaction,
  });
}

function sampleGpuFlowVisibleFramePresentationTransaction({
  sampleVisibleFramePresentation,
}: {
  readonly sampleVisibleFramePresentation: () => GpuFlowVisibleFramePresentationSample;
}): GpuFlowVisibleFramePresentationSample {
  return sampleVisibleFramePresentation();
}

function reduceGpuFlowVisibleFramePresentationFrame<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
>({
  budgetBroker,
  prepareContentPreparationFrame,
  prepareMotionProjectionFrame,
  prepareVisibleFrameResourcesForBudget,
  reducerRuntime,
  sampledPresentation,
}: {
  readonly budgetBroker?: GpuFlowVisibleFrameBudgetBroker | undefined;
  readonly prepareContentPreparationFrame: GpuFlowVisibleFramePresentationContentFramePreparer<
    ContentPreparationFrame,
    MotionProjectionFrame
  >;
  readonly prepareMotionProjectionFrame: GpuFlowVisibleFramePresentationMotionFramePreparer<MotionProjectionFrame>;
  readonly prepareVisibleFrameResourcesForBudget?:
    | GpuFlowVisibleFrameResourceBudgetPreparer
    | undefined;
  readonly sampledPresentation: GpuFlowVisibleFramePresentationSample;
  readonly reducerRuntime: GpuFlowVisibleFramePresentationReducerRuntime;
}): GpuFlowVisibleFrameReducedPresentationTransaction<
  GpuFlowVisibleFramePresentationPreparedCandidateSetFrame<
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
  } = sampledPresentation;
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
  const presentationFrameContext =
    createGpuFlowVisibleFramePresentationFrameContext({
      frameRequest,
      reducerDecision,
      budgetBroker,
      rawReasons,
      runtimeViewportFrame,
      visibleFrameResourceGraphSnapshot,
      viewportInteractionActive,
    });
  prepareVisibleFrameResourcesForBudget?.(
    presentationFrameContext.budgetDecision,
  );
  const candidateSet = prepareGpuFlowVisibleFramePresentationCandidateSet({
    prepareContentPreparationFrame,
    prepareMotionProjectionFrame,
    previousVisibleProjectionState,
    reducerDecision,
    presentationFrameContext,
    projectionSchedulerKnobs: reducerPolicy,
    rawReasons,
  });
  const preparedFrame = createGpuFlowVisibleFramePresentationPreparedFrame({
    candidateSet,
    previousVisibleProjectionState,
    reducerDecision,
  });
  const transactionCompletion = proveGpuFlowVisibleFramePresentationProof({
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
  });
  return Object.freeze({
    ...transactionCompletion,
    preparedFrame,
    reducerDecision,
    presentationFrameContext,
  });
}

function prepareGpuFlowVisibleFramePresentationCandidateSet<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
>({
  prepareContentPreparationFrame,
  prepareMotionProjectionFrame,
  previousVisibleProjectionState,
  reducerDecision,
  presentationFrameContext,
  projectionSchedulerKnobs,
  rawReasons,
}: {
  readonly prepareContentPreparationFrame: GpuFlowVisibleFramePresentationContentFramePreparer<
    ContentPreparationFrame,
    MotionProjectionFrame
  >;
  readonly prepareMotionProjectionFrame: GpuFlowVisibleFramePresentationMotionFramePreparer<MotionProjectionFrame>;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
  readonly presentationFrameContext: GpuFlowVisibleFramePresentationFrameContext;
  readonly projectionSchedulerKnobs: ReturnType<
    GpuFlowVisibleFramePresentationReducerRuntime["getKnobs"]
  >;
  readonly rawReasons: readonly GpuFrameReason[];
}): GpuFlowVisibleFramePresentationCandidateSet<
  ContentPreparationFrame,
  MotionProjectionFrame
> {
  const contentDecisionKernel =
    createGpuFlowVisibleFramePresentationContentDecisionKernel();
  const preparePreparedContentFramePresentationFramePlan =
    createGpuFlowPreparedContentFramePresentationFramePlanPreparer({
      contentDecisionKernel,
    });
  const prepareRetainedDisplayPresentationFramePlan =
    createGpuFlowRetainedDisplayPresentationFramePlanPreparer({
      contentDecisionKernel,
      previousVisibleProjectionState,
      prepareRetainedDisplayPresentationCandidate:
        prepareGpuFlowRetainedDisplayPresentationCandidate,
    });
  const runRetainedPreparedContentFramePresentationContentStage =
    createGpuFlowRetainedPreparedContentFramePresentationContentStageRunner({
      contentDecisionKernel,
      preparePreparedContentFramePresentationFramePlan,
      prepareRetainedDisplayPresentationFramePlan,
    });
  const motionProjectionWorkPlan = createGpuFlowMotionProjectionWorkPlan({
    reducerDecision,
  });
  const motionProjectionFrame = reduceGpuFlowMotionProjectionFramePreparation({
    preparation: prepareMotionProjectionFrame({
      motionProjectionWorkPlan,
      previousVisibleProjectionState,
      reducerDecision,
      presentationFrameContext,
    }),
    previousVisibleProjectionState,
    projectionSchedulerKnobs,
    rawReasons,
  });
  const contentPreparationWorkPlan = createGpuFlowContentPreparationWorkPlan({
    blockedProjectionOnlyFrame:
      motionProjectionFrame.blockedPresentationCandidate !== null,
    budgetDecision: presentationFrameContext.budgetDecision,
    reducerDecision,
    renderedProjectionOnlyFrame:
      motionProjectionFrame.visibleProjectionState !== null,
  });
  const contentPreparationFrame = prepareContentPreparationFrame({
    contentPreparationWorkPlan,
    motionProjectionFrame,
    previousVisibleProjectionState,
    reducerDecision,
    presentationFrameContext,
    runRetainedPreparedContentFramePresentationContentStage,
  });
  return Object.freeze({
    contentPreparationFrame,
    motionProjectionFrame,
  });
}

function createGpuFlowVisibleFramePresentationPreparedFrame<
  ContentPreparationFrame extends
    GpuFlowVisibleFramePresentationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePresentationMotionCandidate,
>({
  candidateSet,
  previousVisibleProjectionState,
  reducerDecision,
}: {
  readonly candidateSet: GpuFlowVisibleFramePresentationCandidateSet<
    ContentPreparationFrame,
    MotionProjectionFrame
  >;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly reducerDecision: GpuFlowVisibleFrameReducerDecision;
}): GpuFlowVisibleFramePresentationPreparedCandidateSetFrame<
  ContentPreparationFrame,
  MotionProjectionFrame
> {
  const transactionProof =
    createGpuFlowVisibleFramePresentationTransactionProofFactory()({
      contentPreparationFrame: candidateSet.contentPreparationFrame,
      forcedBlockedPresentationCandidate:
        candidateSet.forcedBlockedPresentationCandidate,
      motionProjectionFrame: candidateSet.motionProjectionFrame,
      previousVisibleProjectionState,
      reducerDecision,
    });
  const preparedFrame =
    createGpuFlowVisibleFramePresentationPreparedCandidateSetFrameFactory()({
      contentPreparationFrame: candidateSet.contentPreparationFrame,
      motionProjectionFrame: candidateSet.motionProjectionFrame,
      transactionProof,
    });
  return preparedFrame;
}

function createGpuFlowVisibleFramePresentationFrameContext({
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
}): GpuFlowVisibleFramePresentationFrameContext {
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

function presentGpuFlowVisibleFramePresentationOutcome<
  PreparedFrame extends GpuFlowVisibleFramePresentationPreparedFrame,
>({
  presentationRuntime,
  onPresentation,
  transaction,
}: {
  readonly presentationRuntime?:
    | GpuFlowVisibleFramePresentationRuntime
    | undefined;
  readonly onPresentation?:
    | GpuFlowVisibleFramePresentationObserver<PreparedFrame>
    | undefined;
  readonly transaction: GpuFlowVisibleFrameCoordinatorResult<PreparedFrame>;
}): GpuFlowVisibleFrameCoordinatorResult<PreparedFrame> {
  if (presentationRuntime) {
    presentGpuFlowVisibleFramePresentationFrame({
      ...presentationRuntime,
      presentationTransaction: transaction as unknown as Parameters<
        typeof presentGpuFlowVisibleFramePresentationFrame
      >[0]["presentationTransaction"],
    });
  }
  onPresentation?.(transaction);
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

function prepareGpuFlowRetainedDisplayPresentationCandidate(
  input: GpuFlowRetainedDisplayPresentationInput,
): GpuFlowRetainedDisplayPresentationResult {
  return resolveGpuFlowRetainedDisplayPresentation(input);
}
