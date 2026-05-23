import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFrameReason } from "../gpuRenderer";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionLane,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import {
  createGpuFlowBrowserVisualBlockedPublicationCandidate,
  createGpuFlowRetainedProjectionBlockedPublicationCandidate,
} from "./visibleFramePublicationCandidates";
import {
  resolveGpuFlowCommittedSurfacePublicationCandidateAction,
  type GpuFlowCommittedSurfacePublicationCandidateAction,
} from "./flowCommittedSurfacePublicationCandidateHandling";
import {
  createGpuFlowNodeLayerCommittedSurfacePublicationResult,
  createGpuFlowNodeLayerFrameResultForVisibleProjectionState,
  createGpuFlowNodeLayerFrameRetainedProjectionBlockedResult,
  type GpuFlowNodeLayerCommittedSurfacePublicationResult,
  type GpuFlowNodeLayerFrameResult,
} from "./flowFrameResult";
import type { GpuFlowNodeLayerFrameStatePublication } from "./flowFrameLifecycle";
import {
  resolveGpuFlowRetainedDisplayPublicationOutcomeFrame,
  type GpuFlowRetainedDisplayPublicationInput,
  type GpuFlowRetainedDisplayPublicationOutcomeFrame,
  type GpuFlowRetainedDisplayPublicationResult,
} from "./flowRetainedDisplayTransaction";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowBlockedVisibleReason,
} from "./visibleFramePublicationTokens";

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

export type GpuFlowVisibleFrameBlockedPublicationCandidate = {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId: GpuFlowBlockedPublicationToken["frozenFrameId"];
};

export type GpuFlowContentPublicationBlockedCandidateSelector = (input: {
  readonly blockedCommittedSurfacePublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
  readonly committedSurfacePublicationEffect?:
    | GpuFlowCommittedSurfacePublicationEffect
    | null
    | undefined;
  readonly retainedProjectionBlockedReason?: string | null | undefined;
}) => GpuFlowVisibleFrameBlockedPublicationCandidate | null;

export type GpuFlowContentPublicationBlockedCandidateForFrameResultSelector =
  (input: {
    readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  }) => GpuFlowVisibleFrameBlockedPublicationCandidate | null;

export type GpuFlowContentPublicationFrameResult = {
  readonly blockedErrorMessage: string | null;
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly committedSurfacePublicationEffect: GpuFlowCommittedSurfacePublicationEffect | null;
  readonly forceImmediatePublicationDebtFrame: boolean;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly rendered: boolean;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

type GpuFlowContentPublicationFrameResultInput = Pick<
  GpuFlowContentPublicationFrameResult,
  "rendered"
> &
  Partial<Omit<GpuFlowContentPublicationFrameResult, "rendered">>;

const EMPTY_GPU_FLOW_CONTENT_PUBLICATION_FRAME_RESULT_FIELDS = Object.freeze({
  blockedErrorMessage: null,
  blockedPreparedCommittedSurfaceFrame: null,
  blockedPreservePreparationSnapshot: false,
  blockedPublicationCandidate: null,
  committedSurfaceFrame: null,
  committedSurfacePublicationEffect: null,
  forceImmediatePublicationDebtFrame: false,
  heldPreparedCommittedSurfaceFrame: null,
  nodeLayerFrameStatePublication: null,
  retainedDisplayFrame: null,
  retainedDisplayFollowUpFrameReason: null,
  retainedRuntimeFrame: null,
  visibleProjectionState: null,
} satisfies Omit<GpuFlowContentPublicationFrameResult, "rendered">);

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
      readonly visibleProjectionState: NonNullable<
        GpuFlowNodeLayerFrameResult["visibleProjectionState"]
      >;
    };

export type GpuFlowCommittedSurfacePublicationCandidateInput = {
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
};

export type GpuFlowCommittedSurfacePublicationCandidatePreparer = (
  input: GpuFlowCommittedSurfacePublicationCandidateInput,
) => GpuFlowCommittedSurfacePublicationCandidate;

export type GpuFlowCommittedSurfacePublicationCandidateActionResolver = (
  input: Parameters<
    typeof resolveGpuFlowCommittedSurfacePublicationCandidateAction
  >[0],
) => GpuFlowCommittedSurfacePublicationCandidateAction;

export type GpuFlowCommittedSurfacePublicationActionFrameResult = {
  readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
  readonly frameResult: GpuFlowNodeLayerFrameResult | null;
};

export type GpuFlowCommittedSurfacePublicationActionFrameResultResolver =
  (input: {
    readonly action: GpuFlowCommittedSurfacePublicationCandidateAction;
    readonly effect: GpuFlowCommittedSurfacePublicationEffect;
  }) => GpuFlowCommittedSurfacePublicationActionFrameResult;

export type GpuFlowCommittedSurfacePublicationFramePlan =
  | {
      readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
      readonly kind: "publish";
    }
  | {
      readonly frameResult: GpuFlowNodeLayerFrameResult;
      readonly kind: "frame-result";
    };

export type GpuFlowCommittedSurfacePublicationFramePlanSelector = (input: {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}) => GpuFlowCommittedSurfacePublicationFramePlan;

export type GpuFlowCommittedSurfacePublicationFramePlanPreparation = {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly framePlan: GpuFlowCommittedSurfacePublicationFramePlan;
};

export type GpuFlowCommittedSurfacePublicationFramePlanPreparer = (
  input: GpuFlowCommittedSurfacePublicationCandidateInput,
) => GpuFlowCommittedSurfacePublicationFramePlanPreparation;

export type GpuFlowRetainedDisplayPublicationOutcomeFrameResolver = (
  input: Parameters<
    typeof resolveGpuFlowRetainedDisplayPublicationOutcomeFrame
  >[0],
) => GpuFlowRetainedDisplayPublicationOutcomeFrame;

export type GpuFlowRetainedDisplayOutcomeFrameResult =
  | {
      readonly frameResult: GpuFlowNodeLayerFrameResult;
      readonly publishedOutcomeFrame: null;
    }
  | {
      readonly frameResult: null;
      readonly publishedOutcomeFrame: Extract<
        GpuFlowRetainedDisplayPublicationOutcomeFrame,
        { readonly kind: "published" }
      >;
    };

export type GpuFlowRetainedDisplayOutcomeFrameResultResolver = (input: {
  readonly outcomeFrame: GpuFlowRetainedDisplayPublicationOutcomeFrame;
}) => GpuFlowRetainedDisplayOutcomeFrameResult;

export type GpuFlowRetainedDisplayPublicationFramePlan =
  | {
      readonly frameResult: GpuFlowNodeLayerFrameResult;
      readonly kind: "blocked";
    }
  | {
      readonly kind: "published";
      readonly publishedOutcomeFrame: Extract<
        GpuFlowRetainedDisplayPublicationOutcomeFrame,
        { readonly kind: "published" }
      >;
    };

export type GpuFlowRetainedDisplayPublicationFramePlanSelector = (input: {
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];
}) => GpuFlowRetainedDisplayPublicationFramePlan;

export type GpuFlowRetainedDisplayPublicationPreparer = (
  input: GpuFlowRetainedDisplayPublicationInput,
) => GpuFlowRetainedDisplayPublicationResult;

export type GpuFlowRetainedDisplayPublicationFramePlanPreparation = {
  readonly framePlan: GpuFlowRetainedDisplayPublicationFramePlan;
  readonly publication: GpuFlowRetainedDisplayPublicationResult;
};

export type GpuFlowRetainedDisplayPublicationFramePlanPreparer = (
  input: GpuFlowRetainedDisplayPublicationInput,
) => GpuFlowRetainedDisplayPublicationFramePlanPreparation;

export function createGpuFlowContentPublicationBlockedCandidateSelector({
  previousVisibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationBlockedCandidateSelector {
  return selectGpuFlowContentPublicationBlockedCandidate({
    previousVisibleProjectionState,
  });
}

export function selectGpuFlowContentPublicationBlockedCandidate({
  previousVisibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationBlockedCandidateSelector {
  return ({
    blockedCommittedSurfacePublicationCandidate,
    committedSurfacePublicationEffect,
    retainedProjectionBlockedReason,
  }) => {
    if (blockedCommittedSurfacePublicationCandidate) {
      return blockedCommittedSurfacePublicationCandidate;
    }
    if (retainedProjectionBlockedReason) {
      return createGpuFlowRetainedProjectionBlockedPublicationCandidate({
        blockedReason: retainedProjectionBlockedReason,
        heldPreviousProjectionState: previousVisibleProjectionState,
      });
    }
    if (committedSurfacePublicationEffect?.kind !== "held-previous") {
      return null;
    }
    return createGpuFlowBrowserVisualBlockedPublicationCandidate({
      frame: committedSurfacePublicationEffect.candidateFrame,
      heldPreviousProjectionState: previousVisibleProjectionState,
    });
  };
}

export function createGpuFlowContentPublicationBlockedCandidateForFrameResultSelector({
  previousVisibleProjectionState,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationBlockedCandidateForFrameResultSelector {
  const selectContentPublicationBlockedCandidate =
    selectGpuFlowContentPublicationBlockedCandidate({
      previousVisibleProjectionState,
    });
  return ({ nodeLayerFrameResult }) =>
    selectGpuFlowContentPublicationBlockedCandidateForFrameResult({
      nodeLayerFrameResult,
      selectContentPublicationBlockedCandidate,
    });
}

export function selectGpuFlowContentPublicationBlockedCandidateForFrameResult({
  nodeLayerFrameResult,
  selectContentPublicationBlockedCandidate,
}: {
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly selectContentPublicationBlockedCandidate: GpuFlowContentPublicationBlockedCandidateSelector;
}): GpuFlowVisibleFrameBlockedPublicationCandidate | null {
  const committedSurfacePublication =
    nodeLayerFrameResult.committedSurfacePublication;
  return selectContentPublicationBlockedCandidate({
    blockedCommittedSurfacePublicationCandidate:
      committedSurfacePublication.blockedSurfacePublication
        ?.blockedPublicationCandidate ?? null,
    committedSurfacePublicationEffect:
      committedSurfacePublication.committedSurfacePublicationEffect,
    retainedProjectionBlockedReason:
      nodeLayerFrameResult.kind === "retained-projection-blocked"
        ? nodeLayerFrameResult.retainedProjectionBlockedReason
        : null,
  });
}

export function createGpuFlowContentPublicationFrameResult(
  input: GpuFlowContentPublicationFrameResultInput,
): GpuFlowContentPublicationFrameResult {
  return {
    ...EMPTY_GPU_FLOW_CONTENT_PUBLICATION_FRAME_RESULT_FIELDS,
    ...input,
  };
}

export function createGpuFlowContentPublicationFrameResultForNodeLayerFrame({
  deferResolutionUpdates,
  nodeLayerFrameResult,
  nodeLayerFrameStatePublication,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  selectContentPublicationBlockedCandidateForFrameResult,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly selectContentPublicationBlockedCandidateForFrameResult: GpuFlowContentPublicationBlockedCandidateForFrameResultSelector;
}): GpuFlowContentPublicationFrameResult {
  const committedSurfacePublication =
    nodeLayerFrameResult.committedSurfacePublication;
  const blockedPublicationCandidate =
    selectContentPublicationBlockedCandidateForFrameResult({
      nodeLayerFrameResult,
    });
  const visibleProjectionState = nodeLayerFrameResult.visibleProjectionState;
  if (visibleProjectionState) {
    return createGpuFlowVisibleContentPublicationFrameResult({
      blockedPublicationCandidate,
      committedSurfacePublication,
      deferResolutionUpdates,
      nodeLayerFrameStatePublication,
      retainedDisplayFrame,
      retainedDisplayFollowUpFrameReason,
      retainedRuntimeFrame,
      visibleProjectionState,
    });
  }
  return createGpuFlowNotVisibleContentPublicationFrameResult({
    blockedPublicationCandidate,
    nodeLayerFrameResult,
    nodeLayerFrameStatePublication,
    retainedDisplayFollowUpFrameReason,
    retainedRuntimeFrame,
  });
}

function createGpuFlowVisibleContentPublicationFrameResult({
  blockedPublicationCandidate,
  committedSurfacePublication,
  deferResolutionUpdates,
  nodeLayerFrameStatePublication,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  visibleProjectionState,
}: {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly committedSurfacePublication: GpuFlowNodeLayerFrameResult["committedSurfacePublication"];
  readonly deferResolutionUpdates: boolean;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowContentPublicationFrameResult {
  const heldPrevious =
    visibleProjectionState.transaction.kind === "held-previous";
  return createGpuFlowContentPublicationFrameResult({
    blockedPublicationCandidate,
    committedSurfaceFrame: committedSurfacePublication.committedSurfaceFrame,
    committedSurfacePublicationEffect:
      committedSurfacePublication.committedSurfacePublicationEffect,
    forceImmediatePublicationDebtFrame: heldPrevious && !deferResolutionUpdates,
    heldPreparedCommittedSurfaceFrame:
      committedSurfacePublication.heldPreparedCommittedSurfaceFrame,
    nodeLayerFrameStatePublication,
    rendered: deferResolutionUpdates || !heldPrevious,
    retainedDisplayFrame,
    retainedDisplayFollowUpFrameReason,
    retainedRuntimeFrame,
    visibleProjectionState,
  });
}

function createGpuFlowNotVisibleContentPublicationFrameResult({
  blockedPublicationCandidate,
  nodeLayerFrameResult,
  nodeLayerFrameStatePublication,
  retainedDisplayFollowUpFrameReason,
  retainedRuntimeFrame,
}: {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
}): GpuFlowContentPublicationFrameResult {
  const committedSurfacePublication =
    nodeLayerFrameResult.committedSurfacePublication;
  const blockedSurfacePublication =
    committedSurfacePublication.blockedSurfacePublication;
  return createGpuFlowContentPublicationFrameResult({
    blockedErrorMessage: blockedSurfacePublication?.errorMessage ?? null,
    blockedPreparedCommittedSurfaceFrame:
      blockedSurfacePublication?.candidateFrame ?? null,
    blockedPreservePreparationSnapshot:
      blockedSurfacePublication?.preservePreparationSnapshot ?? false,
    blockedPublicationCandidate,
    committedSurfaceFrame: committedSurfacePublication.committedSurfaceFrame,
    committedSurfacePublicationEffect:
      committedSurfacePublication.committedSurfacePublicationEffect,
    heldPreparedCommittedSurfaceFrame:
      committedSurfacePublication.heldPreparedCommittedSurfaceFrame,
    nodeLayerFrameStatePublication,
    rendered: false,
    retainedRuntimeFrame,
    retainedDisplayFollowUpFrameReason,
  });
}

export function createGpuFlowCommittedSurfacePublicationCandidateActionResolver(): GpuFlowCommittedSurfacePublicationCandidateActionResolver {
  return resolveGpuFlowCommittedSurfacePublicationCandidateAction;
}

export function createGpuFlowCommittedSurfacePublicationActionFrameResultResolver(): GpuFlowCommittedSurfacePublicationActionFrameResultResolver {
  return resolveGpuFlowCommittedSurfacePublicationActionFrameResult;
}

export function createGpuFlowCommittedSurfacePublicationFramePlanSelector(): GpuFlowCommittedSurfacePublicationFramePlanSelector {
  return selectGpuFlowCommittedSurfacePublicationFramePlan;
}

export function createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
  prepareCommittedSurfacePublicationCandidate,
  selectCommittedSurfacePublicationFramePlan =
    selectGpuFlowCommittedSurfacePublicationFramePlan,
}: {
  readonly prepareCommittedSurfacePublicationCandidate: GpuFlowCommittedSurfacePublicationCandidatePreparer;
  readonly selectCommittedSurfacePublicationFramePlan?: GpuFlowCommittedSurfacePublicationFramePlanSelector;
}): GpuFlowCommittedSurfacePublicationFramePlanPreparer {
  return (input) => {
    const candidate = prepareCommittedSurfacePublicationCandidate(input);
    return Object.freeze({
      candidate,
      framePlan: selectCommittedSurfacePublicationFramePlan({
        candidate,
        publishedCommittedSurfaceFrame: input.publishedCommittedSurfaceFrame,
      }),
    });
  };
}

export function selectGpuFlowCommittedSurfacePublicationFramePlan({
  candidate,
  publishedCommittedSurfaceFrame,
}: {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly publishedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
}): GpuFlowCommittedSurfacePublicationFramePlan {
  const action = resolveGpuFlowCommittedSurfacePublicationCandidateAction({
    candidate,
    publishedCommittedSurfaceFrame,
  });
  const result = resolveGpuFlowCommittedSurfacePublicationActionFrameResult({
    action,
    effect: candidate.effect,
  });
  if (result.frameResult) {
    return {
      frameResult: result.frameResult,
      kind: "frame-result" as const,
    };
  }
  return {
    committedSurfacePublication: result.committedSurfacePublication,
    kind: "publish" as const,
  };
}

export function resolveGpuFlowCommittedSurfacePublicationActionFrameResult({
  action,
  effect,
}: {
  readonly action: GpuFlowCommittedSurfacePublicationCandidateAction;
  readonly effect: GpuFlowCommittedSurfacePublicationEffect;
}): GpuFlowCommittedSurfacePublicationActionFrameResult {
  const committedSurfacePublication =
    createGpuFlowNodeLayerCommittedSurfacePublicationResult({
      action,
      effect,
    });
  if (action.kind === "publish") {
    return {
      committedSurfacePublication,
      frameResult: null,
    };
  }
  return {
    committedSurfacePublication,
    frameResult: createGpuFlowNodeLayerFrameResultForVisibleProjectionState(
      action.visibleProjectionState,
      { committedSurfacePublication },
    ),
  };
}

export function createGpuFlowRetainedDisplayPublicationOutcomeFrameResolver(): GpuFlowRetainedDisplayPublicationOutcomeFrameResolver {
  return resolveGpuFlowRetainedDisplayPublicationOutcomeFrame;
}

export function createGpuFlowRetainedDisplayOutcomeFrameResultResolver(): GpuFlowRetainedDisplayOutcomeFrameResultResolver {
  return resolveGpuFlowRetainedDisplayOutcomeFrameResult;
}

export function createGpuFlowRetainedDisplayPublicationFramePlanSelector(): GpuFlowRetainedDisplayPublicationFramePlanSelector {
  return selectGpuFlowRetainedDisplayPublicationFramePlan;
}

export function createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
  prepareRetainedDisplayPublicationCandidate,
  selectRetainedDisplayPublicationFramePlan =
    selectGpuFlowRetainedDisplayPublicationFramePlan,
}: {
  readonly prepareRetainedDisplayPublicationCandidate: GpuFlowRetainedDisplayPublicationPreparer;
  readonly selectRetainedDisplayPublicationFramePlan?: GpuFlowRetainedDisplayPublicationFramePlanSelector;
}): GpuFlowRetainedDisplayPublicationFramePlanPreparer {
  return (input) => {
    const publication = prepareRetainedDisplayPublicationCandidate(input);
    return Object.freeze({
      framePlan: selectRetainedDisplayPublicationFramePlan({
        retainedDisplayOutcome: publication.retainedDisplayOutcome,
      }),
      publication,
    });
  };
}

export function selectGpuFlowRetainedDisplayPublicationFramePlan({
  retainedDisplayOutcome,
}: {
  readonly retainedDisplayOutcome: GpuFlowRetainedDisplayPublicationResult["retainedDisplayOutcome"];
}): GpuFlowRetainedDisplayPublicationFramePlan {
  const outcomeFrame = resolveGpuFlowRetainedDisplayPublicationOutcomeFrame(
    retainedDisplayOutcome,
  );
  const result = resolveGpuFlowRetainedDisplayOutcomeFrameResult({
    outcomeFrame,
  });
  if (result.frameResult) {
    return {
      frameResult: result.frameResult,
      kind: "blocked" as const,
    };
  }
  return {
    kind: "published" as const,
    publishedOutcomeFrame: result.publishedOutcomeFrame,
  };
}

export function resolveGpuFlowRetainedDisplayOutcomeFrameResult({
  outcomeFrame,
}: {
  readonly outcomeFrame: GpuFlowRetainedDisplayPublicationOutcomeFrame;
}): GpuFlowRetainedDisplayOutcomeFrameResult {
  if (outcomeFrame.kind !== "blocked") {
    return {
      frameResult: null,
      publishedOutcomeFrame: outcomeFrame,
    };
  }
  return {
    frameResult: createGpuFlowNodeLayerFrameRetainedProjectionBlockedResult(
      outcomeFrame.reason,
    ),
    publishedOutcomeFrame: null,
  };
}
