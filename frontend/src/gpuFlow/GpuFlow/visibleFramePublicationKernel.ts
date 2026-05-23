import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import {
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionLane,
  type GpuFlowVisibleProjectionState,
  type GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import {
  resolveGpuFlowRetainedDisplayPublication,
  type GpuFlowRetainedDisplayPublicationInput,
  type GpuFlowRetainedDisplayPublicationResult,
} from "./flowRetainedDisplayTransaction";
import {
  createGpuFlowCommittedSurfaceHeldPreviousPublicationTransaction,
  createGpuFlowRetainedProjectionBlockedPublicationCandidate,
  decideGpuFlowCommittedSurfacePublicationTransaction,
  shouldPreservePreparedCommittedSurfaceFrameForBrowserVisualRepair,
} from "./visibleFramePublicationCandidates";
import {
  completeGpuFlowVisibleFramePublicationTransaction,
  createGpuFlowVisibleFrameBlockedPublicationToken,
  type GpuFlowVisiblePublicationTransactionCompletion,
} from "./visibleFramePublicationCompletion";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowBlockedVisibleReason,
} from "./visibleFramePublicationTokens";

export {
  createGpuFlowBrowserVisualBlockedPublicationCandidate,
  createGpuFlowBlockedVisibleReasons,
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
  createGpuFlowVisiblePublicationCommitDebtProof,
  createGpuFlowVisiblePublicationCommitOracle,
  createGpuFlowVisiblePublicationCompletionCommitToken,
  createGpuFlowVisiblePublicationCompletionHoldOutcome,
  createGpuFlowVisiblePublicationCompletionOutcome,
  createGpuFlowVisiblePublicationTransactionReport,
} from "./visibleFramePublicationCompletion";
export type {
  GpuFlowVisiblePublicationCommitDebtProof,
  GpuFlowVisiblePublicationCommitOracle,
  GpuFlowVisiblePublicationCompletion,
  GpuFlowVisiblePublicationOutcome,
  GpuFlowVisiblePublicationTransactionCompletion,
} from "./visibleFramePublicationCompletion";

type GpuFlowVisiblePublicationScheduler = ReturnType<
  typeof createGpuFlowVisiblePublicationScheduler
>;

export type GpuFlowCommittedSurfacePublicationEffect =
  | {
      readonly kind: "publish";
    }
  | {
      readonly candidateFrame: GpuFlowCommittedSurfaceFrame;
      readonly deferRetry: boolean;
      readonly kind: "blocked";
      readonly timestamp: number;
    }
  | {
      readonly candidateFrame: GpuFlowCommittedSurfaceFrame;
      readonly deferRetry: boolean;
      readonly kind: "held-previous";
      readonly timestamp: number;
    };

export type GpuFlowCommittedSurfacePublicationCandidate =
  | {
      readonly effect: GpuFlowCommittedSurfacePublicationEffect;
      readonly kind: "publish";
    }
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
      readonly candidateFrame: GpuFlowCommittedSurfaceFrame;
      readonly effect: GpuFlowCommittedSurfacePublicationEffect;
      readonly errorMessage: string | null;
      readonly kind: "blocked";
      readonly preservePreparationSnapshot: boolean;
    }
  | {
      readonly effect: GpuFlowCommittedSurfacePublicationEffect;
      readonly kind: "held-previous";
      readonly visibleProjectionState: GpuFlowVisibleProjectionState;
    };

export type GpuFlowCommittedSurfacePublicationCandidateInput = Parameters<
  typeof prepareGpuFlowCommittedSurfacePublicationCandidate
>[0];

export type GpuFlowCommittedSurfacePublicationCandidatePreparer = (
  input: GpuFlowCommittedSurfacePublicationCandidateInput,
) => GpuFlowCommittedSurfacePublicationCandidate;

export type GpuFlowRetainedDisplayPublicationPreparer = (
  input: GpuFlowRetainedDisplayPublicationInput,
) => GpuFlowRetainedDisplayPublicationResult;

export type GpuFlowVisibleFrameBlockedPublicationCandidate = {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId: GpuFlowBlockedPublicationToken["frozenFrameId"];
};

export type GpuFlowVisibleFramePublicationPreparedFrame = {
  readonly blockedPublicationCandidate?: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationContentCandidate = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationMotionCandidate = {
  readonly blockedProjectionReason: string | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = {
  readonly contentPublicationFrame: ContentPublicationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
};

export type GpuFlowVisibleFramePublicationPreparedCandidateSet = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationTransactionOracle = {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly blockedSource: "content-publication" | "motion-projection" | null;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionSource:
    | "content-publication"
    | "motion-projection"
    | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
> = GpuFlowVisibleFramePublicationPreparedFrame & {
  readonly contentPublicationFrame: ContentPublicationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
};

export type GpuFlowVisibleFramePublicationFrameContext = {
  readonly deferResolutionUpdates: boolean;
  readonly viewportFrame: boolean;
};

export type GpuFlowVisibleFramePublicationKernelResult<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame,
> = GpuFlowVisiblePublicationTransactionCompletion & {
  readonly preparedFrame: PreparedFrame;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
};

export function runGpuFlowVisibleFramePublicationCandidateSetKernel<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  hasCommittedContentFrame,
  prepareContentPublicationFrame,
  prepareMotionProjectionFrame,
  previousVisibleProjectionState,
  publish,
  rawReasons,
  runtimeViewportFrame,
  sample,
  scheduler,
  timestamp,
  viewportInteractionActive,
}: {
  readonly hasCommittedContentFrame: boolean;
  readonly prepareContentPublicationFrame: (input: {
    readonly motionProjectionFrame: MotionProjectionFrame;
    readonly publicationDecision: GpuFlowVisiblePublicationDecision;
    readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
  }) => ContentPublicationFrame;
  readonly prepareMotionProjectionFrame: (input: {
    readonly publicationDecision: GpuFlowVisiblePublicationDecision;
    readonly publicationFrameContext: GpuFlowVisibleFramePublicationFrameContext;
  }) => MotionProjectionFrame;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publish: (
    transaction: GpuFlowVisibleFramePublicationKernelResult<
      GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
        ContentPublicationFrame,
        MotionProjectionFrame
      >
    >,
  ) => void;
  readonly rawReasons: readonly GpuFrameReason[];
  readonly runtimeViewportFrame: boolean;
  readonly sample: GpuFlowLiveProjectionSample;
  readonly scheduler: GpuFlowVisiblePublicationScheduler;
  readonly timestamp: DOMHighResTimeStamp;
  readonly viewportInteractionActive: boolean;
}): GpuFlowVisibleFramePublicationKernelResult<
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
    ContentPublicationFrame,
    MotionProjectionFrame
  >
> {
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
  const motionProjectionFrame = prepareMotionProjectionFrame({
    publicationDecision,
    publicationFrameContext,
  });
  const contentPublicationFrame = prepareContentPublicationFrame({
    motionProjectionFrame,
    publicationDecision,
    publicationFrameContext,
  });
  const transactionOracle =
    createGpuFlowVisibleFramePublicationTransactionOracle({
      contentPublicationFrame,
      heldPreviousProjectionState: previousVisibleProjectionState,
      motionProjectionFrame,
    });
  const preparedFrame =
    createGpuFlowVisibleFramePublicationPreparedCandidateSetFrame({
      contentPublicationFrame,
      motionProjectionFrame,
      transactionOracle,
    });
  return completeGpuFlowVisibleFramePublicationPreparedFrame({
    preparedFrame,
    previousVisibleProjectionState,
    publicationDecision,
    publish,
    scheduler,
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
  const viewportFrame =
    rawReasons.includes("viewport") || runtimeViewportFrame;
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
  transactionOracle,
}: {
  readonly contentPublicationFrame: ContentPublicationFrame;
  readonly motionProjectionFrame: MotionProjectionFrame;
  readonly transactionOracle: GpuFlowVisibleFramePublicationTransactionOracle;
}): GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
  ContentPublicationFrame,
  MotionProjectionFrame
> {
  return Object.freeze({
    blockedPublicationCandidate: transactionOracle.blockedPublicationCandidate,
    blockedPublicationToken: null,
    contentPublicationFrame,
    motionProjectionFrame,
    renderedVisibleFrame: transactionOracle.renderedVisibleFrame,
    transactionOracle,
    visibleProjectionState: transactionOracle.visibleProjectionState,
  });
}

function completeGpuFlowVisibleFramePublicationPreparedFrame<
  PreparedFrame extends GpuFlowVisibleFramePublicationPreparedFrame,
>({
  preparedFrame,
  previousVisibleProjectionState,
  publicationDecision,
  publish,
  scheduler,
}: {
  readonly preparedFrame: PreparedFrame;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly publish: (
    transaction: GpuFlowVisibleFramePublicationKernelResult<PreparedFrame>,
  ) => void;
  readonly scheduler: GpuFlowVisiblePublicationScheduler;
}): GpuFlowVisibleFramePublicationKernelResult<PreparedFrame> {
  const blockedPublicationToken =
    preparedFrame.blockedPublicationToken ??
    createGpuFlowVisibleFrameBlockedPublicationTokenForCandidate({
      candidate: preparedFrame.blockedPublicationCandidate ?? null,
      publicationDecision,
    });
  const completion = completeGpuFlowVisibleFramePublicationTransaction({
    blockedPublicationToken,
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
  publish(transaction);
  return transaction;
}

export function createGpuFlowVisibleFrameBlockedPublicationTokenForCandidate({
  candidate,
  publicationDecision,
}: {
  readonly candidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): GpuFlowBlockedPublicationToken | null {
  if (!candidate) {
    return null;
  }
  return createGpuFlowVisibleFrameBlockedPublicationToken({
    blockedReasons: candidate.blockedReasons,
    frozenFrameId: candidate.frozenFrameId,
    projectionSample: publicationDecision.sample,
  });
}

export function selectGpuFlowVisibleFramePublicationTransaction({
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

export function selectGpuFlowVisibleFramePublicationPreparedFrame<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  heldPreviousProjectionState,
  motionProjectionFrame,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePublicationPreparedCandidateSet {
  const oracle = createGpuFlowVisibleFramePublicationTransactionOracle({
    contentPublicationFrame,
    heldPreviousProjectionState,
    motionProjectionFrame,
  });
  return Object.freeze({
    blockedPublicationCandidate: oracle.blockedPublicationCandidate,
    renderedVisibleFrame: oracle.renderedVisibleFrame,
    visibleProjectionState: oracle.visibleProjectionState,
  });
}

export function createGpuFlowVisibleFramePublicationTransactionOracle<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  heldPreviousProjectionState,
  motionProjectionFrame,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePublicationTransactionOracle {
  const visibleProjectionState =
    contentPublicationFrame.visibleProjectionState ??
    motionProjectionFrame.visibleProjectionState;
  const blockedPublicationCandidate =
    contentPublicationFrame.blockedPublicationCandidate ??
    createGpuFlowMotionProjectionBlockedPublicationCandidate({
      blockedProjectionReason: motionProjectionFrame.blockedProjectionReason,
      heldPreviousProjectionState,
    });
  return Object.freeze({
    blockedPublicationCandidate,
    blockedSource: createGpuFlowVisibleFramePublicationOracleBlockedSource({
      blockedPublicationCandidate,
      contentPublicationFrame,
      motionProjectionFrame,
    }),
    renderedVisibleFrame: visibleProjectionState !== null,
    visibleProjectionSource:
      createGpuFlowVisibleFramePublicationOracleProjectionSource({
        contentPublicationFrame,
        motionProjectionFrame,
        visibleProjectionState,
      }),
    visibleProjectionState,
  });
}

function createGpuFlowVisibleFramePublicationOracleBlockedSource<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  blockedPublicationCandidate,
  contentPublicationFrame,
  motionProjectionFrame,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
}): GpuFlowVisibleFramePublicationTransactionOracle["blockedSource"] {
  if (!blockedPublicationCandidate) {
    return null;
  }
  if (contentPublicationFrame.blockedPublicationCandidate) {
    return "content-publication";
  }
  if (motionProjectionFrame.blockedProjectionReason !== null) {
    return "motion-projection";
  }
  return null;
}

function createGpuFlowVisibleFramePublicationOracleProjectionSource<
  ContentPublicationFrame extends
    GpuFlowVisibleFramePublicationContentCandidate,
  MotionProjectionFrame extends GpuFlowVisibleFramePublicationMotionCandidate,
>({
  contentPublicationFrame,
  motionProjectionFrame,
  visibleProjectionState,
}: GpuFlowVisibleFramePublicationCandidateSet<
  ContentPublicationFrame,
  MotionProjectionFrame
> & {
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFramePublicationTransactionOracle["visibleProjectionSource"] {
  if (!visibleProjectionState) {
    return null;
  }
  if (contentPublicationFrame.visibleProjectionState) {
    return "content-publication";
  }
  if (motionProjectionFrame.visibleProjectionState) {
    return "motion-projection";
  }
  return null;
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
}: {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly deferBrowserVisualRetry?: boolean | undefined;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
}): GpuFlowCommittedSurfacePublicationCandidate {
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

function createGpuFlowMotionProjectionBlockedPublicationCandidate({
  blockedProjectionReason,
  heldPreviousProjectionState,
}: {
  readonly blockedProjectionReason: string | null;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameBlockedPublicationCandidate | null {
  if (blockedProjectionReason === null) {
    return null;
  }
  return createGpuFlowRetainedProjectionBlockedPublicationCandidate({
    blockedReason: blockedProjectionReason,
    heldPreviousProjectionState,
  });
}
