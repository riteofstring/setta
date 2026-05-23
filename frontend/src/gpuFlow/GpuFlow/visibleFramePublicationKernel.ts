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
} from "./visibleFrameActorAdapters/contentDecisionKernel";
import {
  createGpuFlowVisibleFrameEngine,
  type GpuFlowVisibleFrameEngineOutcome,
  type GpuFlowVisibleFrameEngineSample,
} from "./visibleFrameEngine";
import type { GpuFlowVisiblePublicationTransactionCompletion } from "./visibleFrameOutcomeReport";
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
import type {
  GpuFlowMotionProjectionFramePreparation,
  GpuFlowProjectionFrameRenderPlan,
  GpuFlowProjectionFrameTransaction,
} from "./visibleFramePublicationProjectionPlan";
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
} from "./visibleFrameTransactionProofs";

export { createGpuFlowVisiblePublicationTransactionReport } from "./visibleFrameOutcomeReport";
export type {
  GpuFlowVisiblePublicationCompletion,
  GpuFlowVisiblePublicationDebtFrameRequest,
  GpuFlowVisiblePublicationOutcome,
  GpuFlowVisiblePublicationSchedulerFrameCompletion,
  GpuFlowVisiblePublicationTransactionCompletion,
} from "./visibleFrameOutcomeReport";
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
  GpuFlowMotionProjectionFramePreparation,
  GpuFlowProjectionFrameRenderablePlan,
  GpuFlowProjectionFrameRenderPlan,
  GpuFlowProjectionFrameTransaction,
  GpuFlowRetainedProjectionFrameResolver,
} from "./visibleFramePublicationProjectionPlan";
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
} from "./visibleFrameTransactionProofs";
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
  type PreparedFrame = GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
    ContentPublicationFrame,
    MotionProjectionFrame
  >;
  type KernelResult = GpuFlowVisibleFramePublicationKernelResult<PreparedFrame>;

  let sampledPublication: GpuFlowVisibleFramePublicationSample | null = null;
  let outcomeDecision: GpuFlowVisibleFramePublicationOutcomeDecision<PreparedFrame> | null =
    null;
  let transactionResult: KernelResult | null = null;

  const completeVisibleFramePublication = ({
    lifecycleOutcome,
  }: {
    readonly lifecycleOutcome: GpuFlowVisibleFrameEngineOutcome;
  }): void => {
    if (outcomeDecision === null) {
      throw new Error(
        "GPU Flow visible frame engine completed before preparing a transaction.",
      );
    }
    assertGpuFlowVisibleFrameKernelEngineOutcomeMatchesTransaction({
      lifecycleOutcome,
      transactionOutcome:
        outcomeDecision.transactionOracle.visibleFrameEngineOutcome,
    });
    const transactionCompletion =
      proveGpuFlowVisibleFramePublicationPresentation({
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
      });
    const transaction = Object.freeze({
      ...transactionCompletion,
      preparedFrame: outcomeDecision.preparedFrame,
      publicationDecision: outcomeDecision.publicationDecision,
    });
    transactionResult = publishGpuFlowVisibleFramePublicationOutcome({
      publish,
      transaction,
    });
  };

  const engine = createGpuFlowVisibleFrameEngine({
    sampleVisibleFrame: () => {
      sampledPublication = sampleGpuFlowVisibleFramePublicationTransaction({
        sampleVisibleFramePublication,
      });
      return createGpuFlowVisibleFrameKernelEngineSample(sampledPublication);
    },
    prepareVisibleFrameCandidate: () => {
      if (sampledPublication === null) {
        throw new Error(
          "GPU Flow visible frame engine prepared before sampling a transaction.",
        );
      }
      const {
        hasCommittedContentFrame,
        previousVisibleProjectionState,
        rawReasons,
        runtimeViewportFrame,
        sample,
        timestamp,
        viewportInteractionActive,
      } = sampledPublication;
      const publicationDecision =
        selectGpuFlowVisibleFramePublicationTransaction({
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
        projectionSchedulerKnobs: scheduler.getKnobs(),
        rawReasons,
      });
      const preparedFrame = proveGpuFlowVisibleFramePublicationCandidateSet({
        candidateSet,
        previousVisibleProjectionState,
        publicationDecision,
      });
      outcomeDecision = decideGpuFlowVisibleFramePublicationOutcome({
        preparedFrame,
        previousVisibleProjectionState,
        publicationDecision,
        scheduler,
      });
      return outcomeDecision.transactionOracle.visibleFrameEnginePreparedFrame;
    },
    presentVisibleFrame: ({ outcome }) =>
      completeVisibleFramePublication({ lifecycleOutcome: outcome }),
    holdVisibleFrame: ({ outcome }) =>
      completeVisibleFramePublication({ lifecycleOutcome: outcome }),
    blockColdStartVisibleFrame: ({ outcome }) =>
      completeVisibleFramePublication({ lifecycleOutcome: outcome }),
    abortVisibleFrameCandidate: ({ outcome }) =>
      completeVisibleFramePublication({ lifecycleOutcome: outcome }),
  });

  engine.runFrame();
  if (transactionResult === null) {
    throw new Error(
      "GPU Flow visible frame engine did not complete a publication transaction.",
    );
  }
  return transactionResult;
}

function assertGpuFlowVisibleFrameKernelEngineOutcomeMatchesTransaction({
  lifecycleOutcome,
  transactionOutcome,
}: {
  readonly lifecycleOutcome: GpuFlowVisibleFrameEngineOutcome;
  readonly transactionOutcome: GpuFlowVisibleFrameEngineOutcome;
}): void {
  if (
    lifecycleOutcome.kind !== transactionOutcome.kind ||
    !areGpuFlowVisibleFrameKernelEngineOutcomeReasonsEqual(
      lifecycleOutcome.decidingProof,
      transactionOutcome.decidingProof,
    )
  ) {
    throw new Error(
      `GPU Flow visible frame engine lifecycle outcome ${lifecycleOutcome.kind} does not match transaction outcome ${transactionOutcome.kind}.`,
    );
  }
}

function areGpuFlowVisibleFrameKernelEngineOutcomeReasonsEqual(
  left: GpuFlowVisibleFrameEngineOutcome["decidingProof"],
  right: GpuFlowVisibleFrameEngineOutcome["decidingProof"],
): boolean {
  if (left === null || right === null) {
    return left === right;
  }
  return (
    left.actorId === right.actorId &&
    left.family === right.family &&
    left.proof === right.proof &&
    left.reason === right.reason
  );
}

function createGpuFlowVisibleFrameKernelEngineSample(
  publicationSample: GpuFlowVisibleFramePublicationSample,
): GpuFlowVisibleFrameEngineSample {
  const sample = publicationSample.sample;
  const cssViewport = sample.cssViewport ?? {
    height: 0,
    width: 0,
  };
  const viewport = normalizeGpuFlowVisibleFrameKernelEngineViewport(
    sample.viewport,
  );
  return Object.freeze({
    activeGestureOwner:
      sample.gestureOwner === "idle" || sample.gestureOwner === "cooldown"
        ? null
        : sample.gestureOwner,
    canvasSize: Object.freeze({
      height: cssViewport.height,
      width: cssViewport.width,
    }),
    currentCommittedFrameId:
      publicationSample.previousVisibleProjectionState?.committedFrame
        .displayFrameId ?? null,
    dpr: sample.devicePixelRatio,
    projectionSampleId: sample.id,
    queuedDebt: Object.freeze({
      browserVisual: false,
      content: false,
      maintenance: false,
      motion: false,
    }),
    retainedScrollOffsets: Object.freeze(
      [...(sample.retainedScrollOffsets ?? new Map()).entries()].map(
        ([actorId, offset]) =>
          Object.freeze({
            actorId,
            scrollLeft: offset.x,
            scrollTop: offset.y,
          }),
      ),
    ),
    sceneGeneration: String(
      publicationSample.previousVisibleProjectionState?.committedFrame
        .sceneRevision ?? "cold",
    ),
    viewport: Object.freeze({
      height: cssViewport.height,
      width: cssViewport.width,
      x: viewport.x,
      y: viewport.y,
    }),
  });
}

function normalizeGpuFlowVisibleFrameKernelEngineViewport(
  viewport: GpuFlowLiveProjectionSample["viewport"] | undefined,
): {
  readonly x: number;
  readonly y: number;
} {
  if (viewport === undefined) {
    return {
      x: 0,
      y: 0,
    };
  }
  if (Array.isArray(viewport)) {
    const [x, y] = viewport;
    return {
      x,
      y,
    };
  }
  return {
    x: viewport.x,
    y: viewport.y,
  };
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
      projectionSchedulerKnobs,
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
