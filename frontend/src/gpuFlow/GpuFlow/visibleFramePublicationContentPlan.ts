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
import type { GpuFlowNodeLayerFrameStatePublication } from "./flowFrameLifecycle";
import {
  createGpuFlowNodeLayerFrameNotRenderedResult,
  createGpuFlowNodeLayerFrameVisibleProjectionStateResult,
  type GpuFlowNodeLayerCommittedSurfacePublicationResult,
  type GpuFlowNodeLayerFrameResult,
} from "./flowFrameResult";
import {
  selectGpuFlowRetainedDisplayFollowUpFrameReason,
  type GpuFlowRetainedDisplayPublicationInput,
  type GpuFlowRetainedDisplayPublicationResult,
} from "./flowRetainedDisplayTransaction";
import {
  createGpuFlowCommittedSurfacePublicationFramePlanResultResolver,
  createGpuFlowCommittedSurfacePublicationFramePlanSelector,
  type GpuFlowCommittedSurfacePublicationFramePlan,
  type GpuFlowCommittedSurfacePublicationFramePlanResult,
  type GpuFlowCommittedSurfacePublicationFramePlanSelector,
} from "./visibleFramePublicationCommittedSurfaceAuthority";
import { createGpuFlowContentPublicationBlockedCandidateForFrameResultSelector } from "./visibleFramePublicationContentAuthority";
import {
  createGpuFlowRetainedDisplayPublicationFramePlanResultResolver,
  createGpuFlowRetainedDisplayPublicationFramePlanSelector,
  type GpuFlowRetainedDisplayOutcomeFrameResult,
  type GpuFlowRetainedDisplayPublicationFramePlan,
  type GpuFlowRetainedDisplayPublicationFramePlanSelector,
} from "./visibleFramePublicationRetainedDisplayAuthority";
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

const selectCommittedSurfaceFramePlanByPublicationAuthority =
  createGpuFlowCommittedSurfacePublicationFramePlanSelector();
const resolveCommittedSurfaceFramePlanResultByPublicationAuthority =
  createGpuFlowCommittedSurfacePublicationFramePlanResultResolver();
const selectRetainedDisplayFramePlanByPublicationAuthority =
  createGpuFlowRetainedDisplayPublicationFramePlanSelector();
const resolveRetainedDisplayFramePlanResultByPublicationAuthority =
  createGpuFlowRetainedDisplayPublicationFramePlanResultResolver();

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

export type GpuFlowCommittedSurfacePublicationFramePlanPreparation = {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
  readonly framePlan: GpuFlowCommittedSurfacePublicationFramePlan;
  readonly framePlanResult: GpuFlowCommittedSurfacePublicationFramePlanResult;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult | null;
  readonly shouldPrepareHtmlSurfaceOverlayTextures: boolean;
};

export type GpuFlowCommittedSurfacePublicationFramePlanPreparer = (
  input: GpuFlowCommittedSurfacePublicationCandidateInput,
) => GpuFlowCommittedSurfacePublicationFramePlanPreparation;

export type GpuFlowRetainedDisplayPublicationPreparer = (
  input: GpuFlowRetainedDisplayPublicationInput,
) => GpuFlowRetainedDisplayPublicationResult;

export type GpuFlowRetainedDisplayPublicationFramePlanPreparation = {
  readonly followUpFrameReason: GpuFrameReason | null;
  readonly framePlan: GpuFlowRetainedDisplayPublicationFramePlan;
  readonly framePlanResult: GpuFlowRetainedDisplayOutcomeFrameResult;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult | null;
  readonly publication: GpuFlowRetainedDisplayPublicationResult;
  readonly publishedOutcomeFrame: GpuFlowRetainedDisplayOutcomeFrameResult["publishedOutcomeFrame"];
};

export type GpuFlowRetainedDisplayPublicationFramePlanPreparer = (
  input: GpuFlowRetainedDisplayPublicationInput,
) => GpuFlowRetainedDisplayPublicationFramePlanPreparation;

export type GpuFlowRetainedDisplayPublicationContentStep =
  | {
      readonly frameResult: GpuFlowContentPublicationFrameResult;
      readonly publishedOutcomeFrame: null;
    }
  | {
      readonly frameResult: null;
      readonly publishedOutcomeFrame: NonNullable<
        GpuFlowRetainedDisplayPublicationFramePlanPreparation["publishedOutcomeFrame"]
      >;
    };

export type GpuFlowCommittedSurfacePublicationContentStep =
  | {
      readonly committedSurfacePublication: null;
      readonly frameResult: GpuFlowContentPublicationFrameResult;
    }
  | {
      readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
      readonly frameResult: null;
    };

export function createGpuFlowContentPublicationFrameResult(
  input: GpuFlowContentPublicationFrameResultInput,
): GpuFlowContentPublicationFrameResult {
  return {
    ...EMPTY_GPU_FLOW_CONTENT_PUBLICATION_FRAME_RESULT_FIELDS,
    ...input,
  };
}

function createGpuFlowContentPublicationFrameResultForRetainedDisplayPublicationPreparation({
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationFrameResult | null {
  if (preparation.nodeLayerFrameResult === null) {
    return null;
  }
  return createGpuFlowContentPublicationFrameResultForNodeLayerFrame({
    deferResolutionUpdates,
    nodeLayerFrameResult: preparation.nodeLayerFrameResult,
    nodeLayerFrameStatePublication: null,
    previousVisibleProjectionState,
    retainedDisplayFollowUpFrameReason: preparation.followUpFrameReason,
    retainedDisplayFrame: null,
    retainedRuntimeFrame: null,
  });
}

export function createGpuFlowRetainedDisplayPublicationContentStep({
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowRetainedDisplayPublicationContentStep {
  const frameResult =
    createGpuFlowContentPublicationFrameResultForRetainedDisplayPublicationPreparation(
      {
        deferResolutionUpdates,
        preparation,
        previousVisibleProjectionState,
      },
    );
  if (frameResult) {
    return {
      frameResult,
      publishedOutcomeFrame: null,
    };
  }
  return {
    frameResult: null,
    publishedOutcomeFrame: requireGpuFlowRetainedDisplayPublishedOutcomeFrame({
      preparation,
    }),
  };
}

function requireGpuFlowRetainedDisplayPublishedOutcomeFrame({
  preparation,
}: {
  readonly preparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
}): NonNullable<
  GpuFlowRetainedDisplayPublicationFramePlanPreparation["publishedOutcomeFrame"]
> {
  if (preparation.publishedOutcomeFrame === null) {
    throw new Error(
      "GPU Flow retained display content plan must provide a published outcome frame after candidate resolution.",
    );
  }
  return preparation.publishedOutcomeFrame;
}

function createGpuFlowContentPublicationFrameResultForCommittedSurfacePublicationPreparation({
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowCommittedSurfacePublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
}): GpuFlowContentPublicationFrameResult | null {
  if (preparation.nodeLayerFrameResult === null) {
    return null;
  }
  return createGpuFlowContentPublicationFrameResultForNodeLayerFrame({
    deferResolutionUpdates,
    nodeLayerFrameResult: preparation.nodeLayerFrameResult,
    nodeLayerFrameStatePublication: null,
    previousVisibleProjectionState,
    retainedDisplayFollowUpFrameReason,
    retainedDisplayFrame: null,
    retainedRuntimeFrame: null,
  });
}

export function createGpuFlowCommittedSurfacePublicationContentStep({
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowCommittedSurfacePublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
}): GpuFlowCommittedSurfacePublicationContentStep {
  const frameResult =
    createGpuFlowContentPublicationFrameResultForCommittedSurfacePublicationPreparation(
      {
        deferResolutionUpdates,
        preparation,
        previousVisibleProjectionState,
        retainedDisplayFollowUpFrameReason,
      },
    );
  if (frameResult) {
    return {
      committedSurfacePublication: null,
      frameResult,
    };
  }
  return {
    committedSurfacePublication: preparation.committedSurfacePublication,
    frameResult: null,
  };
}

export function createGpuFlowContentPublicationFrameResultForNodeLayerFrame({
  deferResolutionUpdates,
  nodeLayerFrameResult,
  nodeLayerFrameStatePublication,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
}): GpuFlowContentPublicationFrameResult {
  const committedSurfacePublication =
    nodeLayerFrameResult.committedSurfacePublication;
  const blockedPublicationCandidate =
    createGpuFlowContentPublicationBlockedCandidateForFrameResultSelector({
      previousVisibleProjectionState,
    })({
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

export function createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
  prepareCommittedSurfacePublicationCandidate,
  selectCommittedSurfacePublicationFramePlan = selectCommittedSurfaceFramePlanByPublicationAuthority,
}: {
  readonly prepareCommittedSurfacePublicationCandidate: GpuFlowCommittedSurfacePublicationCandidatePreparer;
  readonly selectCommittedSurfacePublicationFramePlan?: GpuFlowCommittedSurfacePublicationFramePlanSelector;
}): GpuFlowCommittedSurfacePublicationFramePlanPreparer {
  return (input) => {
    const candidate = prepareCommittedSurfacePublicationCandidate(input);
    const framePlan = selectCommittedSurfacePublicationFramePlan({
      candidate,
      publishedCommittedSurfaceFrame: input.publishedCommittedSurfaceFrame,
    });
    const framePlanResult =
      resolveCommittedSurfaceFramePlanResultByPublicationAuthority({
        framePlan,
      });
    return Object.freeze({
      candidate,
      committedSurfacePublication: framePlanResult.committedSurfacePublication,
      framePlan,
      framePlanResult,
      nodeLayerFrameResult:
        resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult({
          framePlanResult,
        }),
      shouldPrepareHtmlSurfaceOverlayTextures: candidate.kind !== "publish",
    });
  };
}

export function resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult({
  framePlanResult,
}: {
  readonly framePlanResult: GpuFlowCommittedSurfacePublicationFramePlanResult;
}): GpuFlowNodeLayerFrameResult | null {
  if (
    framePlanResult.blockedPublicationCandidate === null &&
    framePlanResult.visibleProjectionState === null
  ) {
    return null;
  }
  const candidateResultOptions = {
    blockedPublicationCandidate: framePlanResult.blockedPublicationCandidate,
    committedSurfacePublication: framePlanResult.committedSurfacePublication,
  };
  if (framePlanResult.visibleProjectionState) {
    return createGpuFlowNodeLayerFrameVisibleProjectionStateResult(
      framePlanResult.visibleProjectionState,
      candidateResultOptions,
    );
  }
  return createGpuFlowNodeLayerFrameNotRenderedResult(candidateResultOptions);
}

export function createGpuFlowRetainedDisplayPublicationFramePlanPreparer({
  previousVisibleProjectionState,
  prepareRetainedDisplayPublicationCandidate,
  selectRetainedDisplayPublicationFramePlan = selectRetainedDisplayFramePlanByPublicationAuthority,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly prepareRetainedDisplayPublicationCandidate: GpuFlowRetainedDisplayPublicationPreparer;
  readonly selectRetainedDisplayPublicationFramePlan?: GpuFlowRetainedDisplayPublicationFramePlanSelector;
}): GpuFlowRetainedDisplayPublicationFramePlanPreparer {
  return (input) => {
    const publication = prepareRetainedDisplayPublicationCandidate(input);
    const framePlan = selectRetainedDisplayPublicationFramePlan({
      previousVisibleProjectionState,
      retainedDisplayOutcome: publication.retainedDisplayOutcome,
    });
    const framePlanResult =
      resolveRetainedDisplayFramePlanResultByPublicationAuthority({
        framePlan,
      });
    return Object.freeze({
      followUpFrameReason:
        framePlanResult.publishedOutcomeFrame === null
          ? null
          : selectGpuFlowRetainedDisplayFollowUpFrameReason({
              deferResolutionUpdates: input.deferResolutionUpdates,
              outcomeKind: framePlanResult.publishedOutcomeFrame.outcomeKind,
            }),
      framePlan,
      framePlanResult,
      nodeLayerFrameResult:
        resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult({
          framePlanResult,
        }),
      publication,
      publishedOutcomeFrame: framePlanResult.publishedOutcomeFrame,
    });
  };
}

export function resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult({
  framePlanResult,
}: {
  readonly framePlanResult: GpuFlowRetainedDisplayOutcomeFrameResult;
}): GpuFlowNodeLayerFrameResult | null {
  if (!framePlanResult.blockedPublicationCandidate) {
    return null;
  }
  return createGpuFlowNodeLayerFrameNotRenderedResult({
    blockedPublicationCandidate: framePlanResult.blockedPublicationCandidate,
  });
}
