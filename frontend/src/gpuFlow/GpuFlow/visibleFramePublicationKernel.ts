import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
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
import {
  createGpuFlowBlockedPublicationToken,
  createGpuFlowCommitPublicationToken,
  createGpuFlowCommittedSurfaceResetToken,
  createGpuFlowCommittedSurfaceStartupToken,
  createGpuFlowHoldPreviousToken,
  createGpuFlowPresentableCommit,
  GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
} from "./visibleFramePublicationAuthority";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanSelector,
  prepareGpuFlowCommittedSurfacePublicationCandidate,
} from "./visibleFramePublicationCommittedSurfaceAuthority";
import {
  type GpuFlowVisiblePublicationOutcome,
  type GpuFlowVisiblePublicationTransactionCompletion,
} from "./visibleFramePublicationCompletion";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  type GpuFlowCommittedSurfacePublicationFramePlanPreparer,
  type GpuFlowRetainedDisplayPublicationFramePlanPreparer,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
} from "./visibleFramePublicationContentPlan";
import { prepareGpuFlowForcedBlockedVisibleFramePublicationCandidateSet } from "./visibleFramePublicationForcedBlockedCandidateSet";
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
import {
  createGpuFlowProjectionFrameRenderPlanSelector,
  type GpuFlowProjectionFrameRenderablePlan,
  type GpuFlowProjectionFrameRenderPlanSelector,
} from "./visibleFramePublicationProjectionPlan";
import {
  createGpuFlowProjectionFrameTransactionSelector,
  createGpuFlowRetainedProjectionBlockedPublicationCandidateFactory,
  createGpuFlowRetainedProjectionPublicationDecisionSelector,
  type GpuFlowProjectionFrameTransaction,
  type GpuFlowProjectionFrameTransactionSelector,
  type GpuFlowRetainedProjectionFrameResolver,
  type GpuFlowRetainedProjectionPublicationDecisionSelector,
} from "./visibleFramePublicationProjectionTransactionAuthority";
import {
  createGpuFlowMotionProjectionFrameBlockedPublicationReasonSelector,
  type GpuFlowMotionProjectionFrameBlockedPublicationReasonSelector,
} from "./visibleFramePublicationProjectionWorkAuthority";
import { createGpuFlowRetainedDisplayPublicationFramePlanSelector } from "./visibleFramePublicationRetainedDisplayAuthority";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowBlockedVisibleReason,
  GpuFlowCommitPublicationToken,
  GpuFlowCommittedSurfaceResetToken,
  GpuFlowCommittedSurfaceStartupToken,
  GpuFlowHoldPreviousToken,
  GpuFlowPresentableCommit,
} from "./visibleFramePublicationTokens";

export { assertGpuFlowCommittedSurfacePublicationCandidatePublished } from "./flowCommittedSurfacePublicationCandidateHandling";
export type { GpuFlowCommittedSurfacePublicationCandidateAction } from "./flowCommittedSurfacePublicationCandidateHandling";
export { createGpuFlowCommittedSurfacePublicationFramePlanResultResolver, createGpuFlowCommittedSurfacePublicationFramePlanSelector, prepareGpuFlowCommittedSurfacePublicationCandidate } from "./visibleFramePublicationCommittedSurfaceAuthority";
export type { GpuFlowCommittedSurfacePublicationActionFrameResult, GpuFlowCommittedSurfacePublicationFramePlan, GpuFlowCommittedSurfacePublicationFramePlanResult, GpuFlowCommittedSurfacePublicationFramePlanResultResolver, GpuFlowCommittedSurfacePublicationFramePlanSelector } from "./visibleFramePublicationCommittedSurfaceAuthority";
export { createGpuFlowVisiblePublicationTransactionReport } from "./visibleFramePublicationCompletion";
export type { GpuFlowVisiblePublicationCompletion, GpuFlowVisiblePublicationOutcome, GpuFlowVisiblePublicationTransactionCompletion } from "./visibleFramePublicationCompletion";
export { createGpuFlowContentPublicationBlockedCandidateForFrameResultSelector, createGpuFlowContentPublicationBlockedCandidateSelector } from "./visibleFramePublicationContentAuthority";
export type { GpuFlowContentPublicationBlockedCandidateForFrameResultSelector, GpuFlowContentPublicationBlockedCandidateSelector } from "./visibleFramePublicationContentAuthority";
export { createGpuFlowCommittedSurfacePublicationContentStep, createGpuFlowCommittedSurfacePublicationFramePlanPreparer, createGpuFlowContentPublicationFrameResult, createGpuFlowContentPublicationFrameResultForNodeLayerFrame, createGpuFlowRetainedDisplayPublicationContentStep, createGpuFlowRetainedDisplayPublicationFramePlanPreparer, resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult, resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult } from "./visibleFramePublicationContentPlan";
export type { GpuFlowCommittedSurfacePublicationCandidate, GpuFlowCommittedSurfacePublicationCandidateInput, GpuFlowCommittedSurfacePublicationCandidatePreparer, GpuFlowCommittedSurfacePublicationEffect, GpuFlowCommittedSurfacePublicationFramePlanPreparer, GpuFlowContentPublicationFrameResult, GpuFlowRetainedDisplayPublicationFramePlanPreparer, GpuFlowRetainedDisplayPublicationPreparer, GpuFlowVisibleFrameBlockedPublicationCandidate } from "./visibleFramePublicationContentPlan";
export { createGpuFlowContentPublicationWorkPlan, createGpuFlowMotionProjectionWorkPlan, shouldConsiderGpuFlowDeferredContentPublication, shouldDeferGpuFlowBrowserVisualRetryForPublication } from "./visibleFramePublicationKernelWorkPlan";
export type { GpuFlowContentPublicationWorkPlan, GpuFlowMotionProjectionWorkPlan } from "./visibleFramePublicationKernelWorkPlan";
export { createGpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory, createGpuFlowVisibleFramePublicationPreparedFrameSelector, createGpuFlowVisibleFramePublicationTransactionOracleFactory, createGpuFlowVisiblePublicationCommitDebtProof, createGpuFlowVisiblePublicationCommitOracleFactory } from "./visibleFramePublicationOracle";
export type { GpuFlowVisibleFramePublicationCandidateSet, GpuFlowVisibleFramePublicationContentCandidate, GpuFlowVisibleFramePublicationMotionCandidate, GpuFlowVisibleFramePublicationPreparedCandidateSet, GpuFlowVisibleFramePublicationPreparedCandidateSetFrame, GpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory, GpuFlowVisibleFramePublicationPreparedFrame, GpuFlowVisibleFramePublicationPreparedFrameSelector, GpuFlowVisibleFramePublicationTransactionOracle, GpuFlowVisibleFramePublicationTransactionOracleFactory, GpuFlowVisiblePublicationBlockedProof, GpuFlowVisiblePublicationCommitDebtProof, GpuFlowVisiblePublicationCommitOracle, GpuFlowVisiblePublicationCommitOracleFactory } from "./visibleFramePublicationOracle";
export { createGpuFlowProjectionFrameRenderPlanSelector } from "./visibleFramePublicationProjectionPlan";
export type { GpuFlowProjectionFrameRenderablePlan, GpuFlowProjectionFrameRenderPlan, GpuFlowProjectionFrameRenderPlanSelector } from "./visibleFramePublicationProjectionPlan";
export { createGpuFlowProjectionFrameTransactionSelector, createGpuFlowRetainedProjectionBlockedPublicationCandidateFactory, createGpuFlowRetainedProjectionPublicationDecisionSelector, hasActiveGpuFlowRetainedDomControlPublicationProof } from "./visibleFramePublicationProjectionTransactionAuthority";
export type { GpuFlowProjectionFrameTransaction, GpuFlowProjectionFrameTransactionSelector, GpuFlowRetainedProjectionBlockedPublicationCandidateFactory, GpuFlowRetainedProjectionFrameResolver, GpuFlowRetainedProjectionPublicationDecisionSelector, GpuFlowRetainedProjectionPublicationTransactionDecision } from "./visibleFramePublicationProjectionTransactionAuthority";
export { createGpuFlowRetainedDisplayPublicationFramePlanResultResolver, createGpuFlowRetainedDisplayPublicationFramePlanSelector } from "./visibleFramePublicationRetainedDisplayAuthority";
export type { GpuFlowRetainedDisplayOutcomeFrameResult, GpuFlowRetainedDisplayPublicationFramePlan, GpuFlowRetainedDisplayPublicationFramePlanResultResolver, GpuFlowRetainedDisplayPublicationFramePlanSelector } from "./visibleFramePublicationRetainedDisplayAuthority";

type GpuFlowVisiblePublicationScheduler = ReturnType<
  typeof createGpuFlowVisiblePublicationScheduler
>;

const createRetainedProjectionBlockedPublicationCandidate =
  createGpuFlowRetainedProjectionBlockedPublicationCandidateFactory();

export function createGpuFlowCommittedSurfaceResetPublicationToken(): GpuFlowCommittedSurfaceResetToken {
  return createGpuFlowCommittedSurfaceResetToken();
}

export function createGpuFlowCommittedSurfaceStartupPublicationToken({
  frame,
}: {
  readonly frame: GpuFlowCommittedSurfaceFrame;
}): GpuFlowCommittedSurfaceStartupToken {
  return createGpuFlowCommittedSurfaceStartupToken({ frame });
}

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
  const forcedCandidateSet =
    prepareGpuFlowForcedBlockedVisibleFramePublicationCandidateSet({
      prepareContentPublicationFrame,
      prepareCommittedSurfacePublicationFramePlan,
      prepareMotionProjectionFrame,
      prepareRetainedDisplayPublicationFramePlan,
      previousVisibleProjectionState,
      publicationDecision,
      publicationFrameContext,
    });
  if (forcedCandidateSet) {
    return forcedCandidateSet;
  }
  const selectRetainedProjectionPublicationDecision =
    createGpuFlowRetainedProjectionPublicationDecisionSelector({
      previousVisibleProjectionState,
      rawReasons,
    });
  const selectProjectionFrameTransaction =
    createGpuFlowProjectionFrameTransactionSelector();
  const selectProjectionFrameRenderPlan =
    createGpuFlowProjectionFrameRenderPlanSelector();
  const selectMotionProjectionFrameBlockedPublicationReason =
    createGpuFlowMotionProjectionFrameBlockedPublicationReasonSelector();
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
    selectMotionProjectionFrameBlockedPublicationReason,
    selectRetainedProjectionPublicationDecision,
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
    createGpuFlowVisibleFramePublicationTransactionOracleFactory()({
      contentPublicationFrame: candidateSet.contentPublicationFrame,
      forcedBlockedPublicationCandidate:
        candidateSet.forcedBlockedPublicationCandidate,
      motionProjectionFrame: candidateSet.motionProjectionFrame,
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
  selectMotionProjectionFrameBlockedPublicationReason,
  selectRetainedProjectionPublicationDecision,
}: {
  readonly preparation: GpuFlowMotionProjectionFramePreparation<MotionProjectionFrame>;
  readonly projectionSchedulerKnobs: GpuFlowProjectionSchedulerKnobs;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly selectProjectionFrameTransaction: GpuFlowProjectionFrameTransactionSelector;
  readonly selectProjectionFrameRenderPlan: GpuFlowProjectionFrameRenderPlanSelector;
  readonly selectMotionProjectionFrameBlockedPublicationReason: GpuFlowMotionProjectionFrameBlockedPublicationReasonSelector;
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
        createRetainedProjectionBlockedPublicationCandidate({
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
    selectMotionProjectionFrameBlockedPublicationReason(projectionFrame);
  if (projectionBlockedReason) {
    return preparation.createBlockedProjectionFrame({
      blockedPublicationCandidate:
        createRetainedProjectionBlockedPublicationCandidate({
          blockedReason: projectionBlockedReason,
          heldPreviousProjectionState: previousVisibleProjectionState,
        }),
    });
  }
  return projectionFrame;
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

function createGpuFlowVisibleFrameHoldPreviousToken({
  committedFrameId,
  holdAgeFrames,
  holdAgeMs,
  projectionSample,
}: {
  readonly committedFrameId: number;
  readonly holdAgeFrames: number;
  readonly holdAgeMs: number;
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowHoldPreviousToken {
  return createGpuFlowHoldPreviousToken({
    committedFrameId,
    holdAgeFrames,
    holdAgeMs,
    projectionSample,
  });
}

function createGpuFlowVisibleFrameBlockedPublicationToken({
  blockedReasons,
  frozenFrameId,
  projectionSample,
}: {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId: GpuFlowBlockedPublicationToken["frozenFrameId"];
  readonly projectionSample: GpuFlowLiveProjectionSample;
}): GpuFlowBlockedPublicationToken {
  return createGpuFlowBlockedPublicationToken({
    blockedReasons,
    frozenFrameId,
    projectionSample,
  });
}

function createGpuFlowVisibleFrameBlockedPublicationTokenForProof({
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

function createGpuFlowVisiblePublicationCompletionCommitToken({
  presentableCommit,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly presentableCommit: GpuFlowPresentableCommit;
  readonly publicationDecision: {
    readonly sample: GpuFlowLiveProjectionSample;
  };
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowCommitPublicationToken {
  if (visibleProjectionState.sample.id !== publicationDecision.sample.id) {
    throw new Error(
      "GPU Flow committed publication completion requires visible projection state for the selected sample.",
    );
  }
  if (
    presentableCommit.committedFrameId !==
      visibleProjectionState.committedFrame.displayFrameId ||
    presentableCommit.projectionSampleId !== publicationDecision.sample.id
  ) {
    throw new Error(
      "GPU Flow committed publication completion requires a presentable commit proof for the selected visible frame and projection sample.",
    );
  }
  return createGpuFlowCommitPublicationToken({
    presentableCommit,
  });
}

function completeGpuFlowVisibleFramePublicationTransaction({
  blockedPublicationToken,
  publicationDecision,
  previousVisibleProjectionState,
  scheduler,
  transactionOracle,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly scheduler: Pick<
    GpuFlowVisiblePublicationScheduler,
    "completeFrame" | "getKnobs"
  >;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
}): GpuFlowVisiblePublicationTransactionCompletion {
  const outcome = createGpuFlowVisiblePublicationCompletionOutcome({
    blockedPublicationToken,
    publicationDecision,
    previousVisibleProjectionState,
    schedulerKnobs: scheduler.getKnobs(),
    transactionOracle,
  });
  return Object.freeze({
    completion: scheduler.completeFrame(publicationDecision, outcome),
    outcome,
    previousCommittedFrameId:
      previousVisibleProjectionState?.committedFrame.displayFrameId ?? null,
  });
}
function createGpuFlowVisiblePublicationCompletionOutcome({
  blockedPublicationToken,
  publicationDecision,
  previousVisibleProjectionState,
  schedulerKnobs,
  transactionOracle,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
}): GpuFlowVisiblePublicationOutcome {
  if (!transactionOracle.renderedVisibleFrame) {
    if (blockedPublicationToken) {
      return { kind: "blocked", token: blockedPublicationToken };
    }
    return createGpuFlowVisiblePublicationCompletionNoFrameOutcome({
      previousVisibleProjectionState,
      publicationDecision,
      schedulerKnobs,
    });
  }
  const visibleProjectionState = transactionOracle.visibleProjectionState;
  if (visibleProjectionState === null) {
    throw new Error(
      "GPU Flow visible publication completion cannot commit a rendered frame without visible projection state.",
    );
  }
  if (visibleProjectionState.transaction.kind === "held-previous") {
    return createGpuFlowVisiblePublicationCompletionHeldPreviousOutcome({
      blockedPublicationToken,
      publicationDecision,
      visibleProjectionState,
    });
  }
  const commitOracle = transactionOracle.commitOracle;
  if (commitOracle === null) {
    throw new Error(
      "GPU Flow committed publication completion requires the transaction oracle commit proof.",
    );
  }
  const presentableCommit = createGpuFlowPresentableCommit({
    frame: visibleProjectionState.committedFrame,
    commitAuthorityProof: commitOracle.commitAuthorityProof,
    projectionSample: publicationDecision.sample,
  });
  return {
    debtProof: commitOracle.debtProof,
    kind: "commit",
    token: createGpuFlowVisiblePublicationCompletionCommitToken({
      presentableCommit,
      publicationDecision,
      visibleProjectionState,
    }),
  };
}
export function createGpuFlowVisiblePublicationCompletionHoldOutcome({
  publicationDecision,
  visibleProjectionState,
}: {
  readonly publicationDecision: {
    readonly sample: GpuFlowLiveProjectionSample;
  };
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): Extract<
  GpuFlowVisiblePublicationOutcome,
  { readonly kind: "hold-previous" }
> {
  const heldPreviousProjection =
    assertGpuFlowHeldPreviousPublicationCompletionMatchesSample({
      publicationDecision,
      visibleProjectionState,
    });
  return {
    kind: "hold-previous",
    token: createGpuFlowVisibleFrameHoldPreviousToken({
      committedFrameId: visibleProjectionState.committedFrame.displayFrameId,
      holdAgeFrames: heldPreviousProjection.consecutiveFrameCount,
      holdAgeMs: heldPreviousProjection.heldDurationMs,
      projectionSample: publicationDecision.sample,
    }),
  };
}
function createGpuFlowVisiblePublicationCompletionHeldPreviousOutcome({
  blockedPublicationToken,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): Extract<
  GpuFlowVisiblePublicationOutcome,
  { readonly kind: "blocked" | "hold-previous" }
> {
  assertGpuFlowHeldPreviousPublicationCompletionMatchesSample({
    publicationDecision,
    visibleProjectionState,
  });
  if (
    !isGpuFlowVisiblePublicationHeldPreviousOverBudget(visibleProjectionState)
  ) {
    return createGpuFlowVisiblePublicationCompletionHoldOutcome({
      publicationDecision,
      visibleProjectionState,
    });
  }
  if (blockedPublicationToken) {
    return {
      kind: "blocked",
      token: blockedPublicationToken,
    };
  }
  return {
    kind: "blocked",
    token: createGpuFlowVisibleFrameBlockedPublicationToken({
      blockedReasons: [
        {
          actorId: null,
          family: "visible-transaction",
          reason: "held-previous-budget-exceeded",
        },
      ],
      frozenFrameId: visibleProjectionState.committedFrame.displayFrameId,
      projectionSample: publicationDecision.sample,
    }),
  };
}
function assertGpuFlowHeldPreviousPublicationCompletionMatchesSample({
  publicationDecision,
  visibleProjectionState,
}: {
  readonly publicationDecision: {
    readonly sample: GpuFlowLiveProjectionSample;
  };
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): NonNullable<GpuFlowVisibleProjectionState["heldPreviousProjection"]> {
  const heldPreviousProjection = visibleProjectionState.heldPreviousProjection;
  if (
    heldPreviousProjection === null ||
    heldPreviousProjection.requestedProjectionSampleId !==
      publicationDecision.sample.id
  ) {
    throw new Error(
      "GPU Flow held-previous publication completion requires diagnostics for the selected projection sample.",
    );
  }
  return heldPreviousProjection;
}
function isGpuFlowVisiblePublicationHeldPreviousOverBudget(
  visibleProjectionState: GpuFlowVisibleProjectionState,
): boolean {
  const heldPreviousProjection = visibleProjectionState.heldPreviousProjection;
  if (heldPreviousProjection === null) {
    return false;
  }
  return Boolean(
    heldPreviousProjection.maxHeldPreviousFramesExceeded ||
      heldPreviousProjection.maxHeldPreviousMsExceeded,
  );
}
function createGpuFlowVisiblePublicationCompletionNoFrameOutcome({
  previousVisibleProjectionState,
  publicationDecision,
  schedulerKnobs,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
}): Extract<
  GpuFlowVisiblePublicationOutcome,
  { readonly kind: "blocked" | "hold-previous" }
> {
  if (!previousVisibleProjectionState) {
    return {
      kind: "blocked",
      token: createGpuFlowVisibleFrameBlockedPublicationToken({
        blockedReasons: [
          {
            actorId: null,
            family: "visible-transaction",
            reason: "no-visible-frame-before-first-commit",
          },
        ],
        frozenFrameId: GPU_FLOW_RETAINED_PROJECTION_COLD_START_SHELL_FRAME_ID,
        projectionSample: publicationDecision.sample,
      }),
    };
  }
  const previousHeld = previousVisibleProjectionState.heldPreviousProjection;
  const firstHeldAtMs =
    previousHeld?.firstHeldAtMs ?? publicationDecision.sample.timestamp;
  const holdAgeFrames = (previousHeld?.consecutiveFrameCount ?? 0) + 1;
  const holdAgeMs = Math.max(
    0,
    publicationDecision.sample.timestamp - firstHeldAtMs,
  );
  if (
    isGpuFlowNoFrameHeldPreviousOverBudget({
      holdAgeFrames,
      holdAgeMs,
      previousHeld,
      schedulerKnobs,
    })
  ) {
    return {
      kind: "blocked",
      token: createGpuFlowVisibleFrameBlockedPublicationToken({
        blockedReasons: [
          {
            actorId: null,
            family: "visible-transaction",
            reason: "held-previous-budget-exceeded",
          },
        ],
        frozenFrameId:
          previousVisibleProjectionState.committedFrame.displayFrameId,
        projectionSample: publicationDecision.sample,
      }),
    };
  }
  return {
    kind: "hold-previous",
    token: createGpuFlowVisibleFrameHoldPreviousToken({
      committedFrameId:
        previousVisibleProjectionState.committedFrame.displayFrameId,
      holdAgeFrames,
      holdAgeMs,
      projectionSample: publicationDecision.sample,
    }),
  };
}
function isGpuFlowNoFrameHeldPreviousOverBudget({
  holdAgeFrames,
  holdAgeMs,
  previousHeld,
  schedulerKnobs,
}: {
  readonly holdAgeFrames: number;
  readonly holdAgeMs: number;
  readonly previousHeld: GpuFlowVisibleProjectionState["heldPreviousProjection"];
  readonly schedulerKnobs: GpuFlowProjectionSchedulerKnobs;
}): boolean {
  return Boolean(
    previousHeld?.maxHeldPreviousFramesExceeded ||
      previousHeld?.maxHeldPreviousMsExceeded ||
      holdAgeFrames > schedulerKnobs.maxHeldPreviousFrames ||
      holdAgeMs > schedulerKnobs.maxHeldPreviousMs,
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
}): GpuFlowVisibleFramePublicationKernelResult<PreparedFrame> {
  const blockedPublicationToken =
    preparedFrame.blockedPublicationToken ??
    createGpuFlowVisibleFrameBlockedPublicationTokenForProof({
      proof: preparedFrame.transactionOracle.blockedProof,
      publicationDecision,
    });
  const completion = completeGpuFlowVisibleFramePublicationTransaction({
    blockedPublicationToken,
    publicationDecision,
    previousVisibleProjectionState,
    scheduler,
    transactionOracle: preparedFrame.transactionOracle,
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
