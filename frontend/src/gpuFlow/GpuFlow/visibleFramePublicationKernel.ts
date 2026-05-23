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
  createGpuFlowCommittedSurfaceResetToken,
  createGpuFlowCommittedSurfaceStartupToken,
} from "./visibleFramePublicationAuthority";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanSelector,
  prepareGpuFlowCommittedSurfacePublicationCandidate,
} from "./visibleFramePublicationCommittedSurfaceAuthority";
import type { GpuFlowVisiblePublicationTransactionCompletion } from "./visibleFramePublicationCompletion";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  createGpuFlowRetainedCommittedSurfacePublicationContentStageRunner,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  type GpuFlowRetainedCommittedSurfacePublicationContentStageRunner,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
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
  GpuFlowCommittedSurfaceResetToken,
  GpuFlowCommittedSurfaceStartupToken,
} from "./visibleFramePublicationTokens";

export { assertGpuFlowCommittedSurfacePublicationCandidatePublished } from "./flowCommittedSurfacePublicationCandidateHandling";
export type { GpuFlowCommittedSurfacePublicationCandidateAction } from "./flowCommittedSurfacePublicationCandidateHandling";
export {
  createGpuFlowCommittedSurfacePublicationFramePlanResultResolver,
  createGpuFlowCommittedSurfacePublicationFramePlanSelector,
  prepareGpuFlowCommittedSurfacePublicationCandidate,
} from "./visibleFramePublicationCommittedSurfaceAuthority";
export type {
  GpuFlowCommittedSurfacePublicationActionFrameResult,
  GpuFlowCommittedSurfacePublicationFramePlan,
  GpuFlowCommittedSurfacePublicationFramePlanResult,
  GpuFlowCommittedSurfacePublicationFramePlanResultResolver,
  GpuFlowCommittedSurfacePublicationFramePlanSelector,
} from "./visibleFramePublicationCommittedSurfaceAuthority";
export { createGpuFlowVisiblePublicationTransactionReport } from "./visibleFramePublicationCompletion";
export type {
  GpuFlowVisiblePublicationCompletion,
  GpuFlowVisiblePublicationOutcome,
  GpuFlowVisiblePublicationTransactionCompletion,
} from "./visibleFramePublicationCompletion";
export {
  createGpuFlowContentPublicationBlockedCandidateForFrameResultSelector,
  createGpuFlowContentPublicationBlockedCandidateSelector,
} from "./visibleFramePublicationContentAuthority";
export type {
  GpuFlowContentPublicationBlockedCandidateForFrameResultSelector,
  GpuFlowContentPublicationBlockedCandidateSelector,
} from "./visibleFramePublicationContentAuthority";
export {
  createGpuFlowCommittedSurfacePublicationFramePlanPreparer,
  createGpuFlowContentPublicationFrameResult,
  createGpuFlowContentPublicationFrameResultForNodeLayerFrame,
  createGpuFlowRetainedCommittedSurfacePublicationContentStageRunner,
  createGpuFlowRetainedDisplayPublicationFramePlanPreparer,
  prepareGpuFlowCommittedSurfacePublicationFramePlanForRetainedDisplay,
  resolveGpuFlowBlockedCommittedSurfacePublicationAbort,
  resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult,
  resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult,
  runGpuFlowCommittedSurfacePublicationContentStage,
  runGpuFlowRetainedCommittedSurfacePublicationContentStage,
  runGpuFlowRetainedDisplayPublicationContentStage,
} from "./visibleFramePublicationContentPlan";
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
  createGpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory,
  createGpuFlowVisibleFramePublicationPreparedFrameSelector,
  createGpuFlowVisibleFramePublicationTransactionOracleFactory,
  createGpuFlowVisiblePublicationCommitDebtProof,
  createGpuFlowVisiblePublicationCommitOracleFactory,
} from "./visibleFramePublicationOracle";
export type {
  GpuFlowVisibleFramePublicationCandidateSet,
  GpuFlowVisibleFramePublicationContentCandidate,
  GpuFlowVisibleFramePublicationMotionCandidate,
  GpuFlowVisibleFramePublicationPreparedCandidateSet,
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrame,
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrameFactory,
  GpuFlowVisibleFramePublicationPreparedFrame,
  GpuFlowVisibleFramePublicationPreparedFrameSelector,
  GpuFlowVisibleFramePublicationTransactionOracle,
  GpuFlowVisibleFramePublicationTransactionOracleFactory,
  GpuFlowVisiblePublicationBlockedProof,
  GpuFlowVisiblePublicationCommitDebtProof,
  GpuFlowVisiblePublicationCommitOracle,
  GpuFlowVisiblePublicationCommitOracleFactory,
} from "./visibleFramePublicationOracle";
export {
  isGpuFlowRetainedProjectionSurfaceCovered,
  resolveGpuFlowRetainedProjectionFrame,
} from "./visibleFramePublicationProjectionCoverageAuthority";
export type { GpuFlowRetainedProjectionFrame } from "./visibleFramePublicationProjectionCoverageAuthority";
export { createGpuFlowProjectionFrameRenderPlanSelector } from "./visibleFramePublicationProjectionPlan";
export type {
  GpuFlowProjectionFrameRenderablePlan,
  GpuFlowProjectionFrameRenderPlan,
  GpuFlowProjectionFrameRenderPlanSelector,
} from "./visibleFramePublicationProjectionPlan";
export {
  createGpuFlowProjectionFrameTransactionSelector,
  createGpuFlowRetainedProjectionBlockedPublicationCandidateFactory,
  createGpuFlowRetainedProjectionPublicationDecisionSelector,
  hasActiveGpuFlowRetainedDomControlPublicationProof,
} from "./visibleFramePublicationProjectionTransactionAuthority";
export type {
  GpuFlowProjectionFrameTransaction,
  GpuFlowProjectionFrameTransactionSelector,
  GpuFlowRetainedProjectionBlockedPublicationCandidateFactory,
  GpuFlowRetainedProjectionFrameResolver,
  GpuFlowRetainedProjectionPublicationDecisionSelector,
  GpuFlowRetainedProjectionPublicationTransactionDecision,
} from "./visibleFramePublicationProjectionTransactionAuthority";
export {
  createGpuFlowRetainedDisplayPublicationFramePlanResultResolver,
  createGpuFlowRetainedDisplayPublicationFramePlanSelector,
} from "./visibleFramePublicationRetainedDisplayAuthority";
export type {
  GpuFlowRetainedDisplayOutcomeFrameResult,
  GpuFlowRetainedDisplayPublicationFramePlan,
  GpuFlowRetainedDisplayPublicationFramePlanResultResolver,
  GpuFlowRetainedDisplayPublicationFramePlanSelector,
} from "./visibleFramePublicationRetainedDisplayAuthority";

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
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
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
    scheduler,
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
      blockedPublicationToken: outcomeDecision.blockedPublicationToken,
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
  const runRetainedCommittedSurfacePublicationContentStage =
    createGpuFlowRetainedCommittedSurfacePublicationContentStageRunner({
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
  const blockedPublicationToken =
    preparedFrame.blockedPublicationToken ??
    createGpuFlowVisibleFrameBlockedPublicationTokenForProof({
      proof: preparedFrame.transactionOracle.blockedProof,
      publicationDecision,
    });
  return Object.freeze({
    blockedPublicationToken,
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

export function prepareGpuFlowRetainedDisplayPublicationCandidate(
  input: GpuFlowRetainedDisplayPublicationInput,
): GpuFlowRetainedDisplayPublicationResult {
  return resolveGpuFlowRetainedDisplayPublication(input);
}
