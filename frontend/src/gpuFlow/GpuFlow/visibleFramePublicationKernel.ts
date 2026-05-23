import type { GpuFrameReason } from "../gpuRenderer";
import {
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowVisibleProjectionState,
  type GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import {
  resolveGpuFlowRetainedDisplayPublication,
  type GpuFlowRetainedDisplayPublicationInput,
  type GpuFlowRetainedDisplayPublicationResult,
} from "./flowRetainedDisplayTransaction";
import {
  createGpuFlowVisiblePublicationCandidateOracle,
  type GpuFlowRetainedProjectionPublicationCandidateSelector,
  type GpuFlowVisiblePublicationCandidateOracle,
} from "./visibleFramePublicationCandidateOracle";
import type { GpuFlowVisiblePublicationTransactionCompletion } from "./visibleFramePublicationCompletion";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  createGpuFlowRetainedCommittedSurfacePublicationContentStageRunner,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  type GpuFlowRetainedCommittedSurfacePublicationContentStageRunner,
} from "./visibleFramePublicationContentPlan";
import { prepareGpuFlowForcedBlockedVisibleFramePublicationCandidateSet } from "./visibleFramePublicationForcedBlockedCandidateSet";
import { proveGpuFlowVisibleFramePublicationPresentation } from "./visibleFramePublicationKernelPresentation";
import {
  createGpuFlowContentPublicationWorkPlan,
  createGpuFlowMotionProjectionWorkPlan,
  type GpuFlowContentPublicationWorkPlan,
  type GpuFlowMotionProjectionWorkPlan,
} from "./visibleFramePublicationKernelWorkPlan";
import {
  createGpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory,
  createGpuFlowVisibleFramePublicationTransactionOracleFactory,
  type GpuFlowVisibleFramePublicationCandidateSet,
  type GpuFlowVisibleFramePublicationContentCandidate,
  type GpuFlowVisibleFramePublicationMotionCandidate,
  type GpuFlowVisibleFramePublicationPreparedCandidateSetFrame,
  type GpuFlowVisibleFramePublicationPreparedFrame,
  type GpuFlowVisibleFramePublicationTransactionOracle,
  type GpuFlowVisiblePublicationBlockedProof,
} from "./visibleFramePublicationOracle";
import type {
  GpuFlowMotionProjectionFramePreparation,
  GpuFlowProjectionFrameRenderPlan,
  GpuFlowProjectionFrameTransaction,
} from "./visibleFramePublicationProjectionPlan";

export { createGpuFlowVisiblePublicationTransactionReport } from "./visibleFramePublicationCompletion";
export type {
  GpuFlowVisiblePublicationCompletion,
  GpuFlowVisiblePublicationDebtFrameRequest,
  GpuFlowVisiblePublicationOutcome,
  GpuFlowVisiblePublicationSchedulerFrameCompletion,
  GpuFlowVisiblePublicationTransactionCompletion,
} from "./visibleFramePublicationCompletion";
export { resolveGpuFlowBlockedCommittedSurfacePublicationAbort } from "./visibleFramePublicationContentAbort";
export type { GpuFlowBlockedCommittedSurfacePublicationAbort } from "./visibleFramePublicationContentAbort";
export { createGpuFlowContentPublicationFrameResult } from "./visibleFramePublicationContentPlan";
export type {
  GpuFlowCommittedSurfacePublicationCandidate,
  GpuFlowCommittedSurfacePublicationCandidateInput,
  GpuFlowCommittedSurfacePublicationCandidatePreparer,
  GpuFlowCommittedSurfacePublicationEffect,
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
} from "./visibleFramePublicationContentPlan";
export type {
  GpuFlowMotionProjectionFrameWorkReport,
  GpuFlowMotionProjectionFrameWorkResult,
} from "./visibleFramePublicationKernelProjectionWorkTypes";
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
export type {
  GpuFlowVisibleFramePublicationCandidateSet,
  GpuFlowVisibleFramePublicationContentCandidate,
  GpuFlowVisibleFramePublicationMotionCandidate,
  GpuFlowVisibleFramePublicationPreparedCandidateSet,
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrame,
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory,
  GpuFlowVisibleFramePublicationPreparedFrame,
  GpuFlowVisibleFramePublicationTransactionOracle,
  GpuFlowVisibleFramePublicationTransactionOracleFactory,
  GpuFlowVisiblePublicationBlockedProof,
  GpuFlowVisiblePublicationCommitDebtProof,
} from "./visibleFramePublicationOracle";
export type {
  GpuFlowMotionProjectionFramePreparation,
  GpuFlowProjectionFrameRenderablePlan,
  GpuFlowProjectionFrameRenderPlan,
  GpuFlowProjectionFrameTransaction,
  GpuFlowRetainedProjectionFrameResolver,
} from "./visibleFramePublicationProjectionPlan";
type GpuFlowVisiblePublicationScheduler = ReturnType<
  typeof createGpuFlowVisiblePublicationScheduler
>;

type GpuFlowProjectionFrameRenderPlanSelector = (input: {
  readonly projectionFrameTransaction: GpuFlowProjectionFrameTransaction;
}) => GpuFlowProjectionFrameRenderPlan;

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

type GpuFlowVisibleFramePublicationOutcomeDecision<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame & {
    readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
  },
> = {
  readonly blockedPublicationProof: GpuFlowVisiblePublicationBlockedProof | null;
  readonly preparedFrame: PreparedFrame;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly scheduler: GpuFlowVisiblePublicationScheduler;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
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
  });
  const preparedFrame = proveGpuFlowVisibleFramePublicationCandidateSet({
    candidateSet,
    previousVisibleProjectionState,
    publicationDecision,
  });
  const outcomeDecision = decideGpuFlowVisibleFramePublicationOutcome({
    preparedFrame,
    previousVisibleProjectionState,
    publicationDecision,
    scheduler,
  });
  const transactionCompletion = proveGpuFlowVisibleFramePublicationPresentation(
    {
      blockedPublicationProof: outcomeDecision.blockedPublicationProof,
      forceImmediatePublicationDebtFrame:
        outcomeDecision.preparedFrame.contentPublicationFrame
          .forceImmediatePublicationDebtFrame ?? false,
      followUpFrameReason:
        outcomeDecision.preparedFrame.contentPublicationFrame
          .retainedDisplayFollowUpFrameReason ?? null,
      previousVisibleProjectionState:
        outcomeDecision.previousVisibleProjectionState,
      publicationDecision: outcomeDecision.publicationDecision,
      scheduler: outcomeDecision.scheduler,
      transactionOracle: outcomeDecision.transactionOracle,
    },
  );
  const transaction = Object.freeze({
    ...transactionCompletion,
    preparedFrame: outcomeDecision.preparedFrame,
    publicationDecision: outcomeDecision.publicationDecision,
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
}): GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> {
  const candidateOracle = createGpuFlowVisiblePublicationCandidateOracle();
  const prepareCommittedSurfacePublicationFramePlan =
    createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
      contentDecisionKernel: candidateOracle,
    });
  const prepareRetainedDisplayPublicationFramePlan =
    createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
      contentDecisionKernel: candidateOracle,
      previousVisibleProjectionState,
      prepareRetainedDisplayPublicationCandidate:
        prepareGpuFlowRetainedDisplayPublicationCandidate,
    });
  const runRetainedCommittedSurfacePublicationContentStage =
    createGpuFlowRetainedCommittedSurfacePublicationContentStageRunner({
      contentDecisionKernel: candidateOracle,
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
    candidateOracle.createRetainedProjectionPublicationCandidateSelector({
      previousVisibleProjectionState,
      rawReasons,
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
    candidateOracle,
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
  const transactionOracle =
    createGpuFlowVisibleFramePublicationTransactionOracleFactory()({
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
      transactionOracle,
    });
  return preparedFrame;
}

function createGpuFlowVisibleFramePublicationFrameContext({
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
  candidateOracle,
  selectProjectionFrameRenderPlan,
  selectRetainedProjectionPublicationCandidate,
}: {
  readonly preparation: GpuFlowMotionProjectionFramePreparation<MotionProjectionFrame>;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly candidateOracle: Pick<
    GpuFlowVisiblePublicationCandidateOracle,
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
    candidateOracle.selectProjectionFrameTransaction({
      publicationCandidate: retainedProjectionPublicationCandidate,
      requestedRetainedProjectionFrame,
      resolveHeldRetainedProjectionFrame:
        preparation.resolveRetainedProjectionFrame,
    });
  if (projectionFrameTransaction.blockedReason !== null) {
    return preparation.createBlockedProjectionFrame({
      blockedPublicationCandidate:
        candidateOracle.createRetainedProjectionBlockedPublicationCandidate({
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
  const projectionBlockedReason =
    candidateOracle.selectMotionProjectionFrameBlockedPublicationReason(
      projectionFrame,
    );
  if (projectionBlockedReason) {
    return preparation.createBlockedProjectionFrame({
      blockedPublicationCandidate:
        candidateOracle.createRetainedProjectionBlockedPublicationCandidate({
          blockedReason: projectionBlockedReason,
          heldPreviousProjectionState: previousVisibleProjectionState,
        }),
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

function decideGpuFlowVisibleFramePublicationOutcome<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame & {
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
}): GpuFlowVisibleFramePublicationOutcomeDecision<PreparedFrame> {
  return Object.freeze({
    blockedPublicationProof: preparedFrame.transactionOracle.blockedProof,
    preparedFrame,
    previousVisibleProjectionState,
    publicationDecision,
    scheduler,
    transactionOracle: preparedFrame.transactionOracle,
  });
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
