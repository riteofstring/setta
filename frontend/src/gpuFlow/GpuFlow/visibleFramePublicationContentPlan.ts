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
  createGpuFlowContentPublicationBlockedCandidateForFrameResultSelector,
  createGpuFlowRetainedDisplayPublicationFramePlanResultResolver,
  type GpuFlowCommittedSurfacePublicationFramePlan,
  type GpuFlowCommittedSurfacePublicationFramePlanResult,
  type GpuFlowCommittedSurfacePublicationFramePlanSelector,
  type GpuFlowRetainedDisplayOutcomeFrameResult,
  type GpuFlowRetainedDisplayPublicationFramePlan,
  type GpuFlowRetainedDisplayPublicationFramePlanSelector,
} from "./visibleFramePublicationKernelContentDecisions";
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

const selectCommittedSurfaceFramePlanByPublicationKernel =
  createGpuFlowCommittedSurfacePublicationFramePlanSelector();
const resolveCommittedSurfaceFramePlanResultByPublicationKernel =
  createGpuFlowCommittedSurfacePublicationFramePlanResultResolver();
const resolveRetainedDisplayFramePlanResultByPublicationKernel =
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

export type GpuFlowRetainedDisplayCommittedSurfaceFramePreparer = (
  frame: RetainedDisplayFrame,
  options?:
    | {
        readonly gpuNativeVisuals:
          | readonly HtmlSurfaceSolidRoundedRectVisual[]
          | undefined;
      }
    | undefined,
) => GpuFlowCommittedSurfaceFrame | void;

export type GpuFlowPreparedCommittedSurfacePublicationFramePlan = {
  readonly preparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
  readonly publicationPreparation: GpuFlowCommittedSurfacePublicationFramePlanPreparation;
};

export type GpuFlowBlockedCommittedSurfacePublicationAbort = {
  readonly frame: GpuFlowCommittedSurfaceFrame | null;
  readonly preservePreparationSnapshot: boolean;
};

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

export type GpuFlowRetainedDisplayPublicationContentStage =
  | {
      readonly blockedFrameResult: GpuFlowContentPublicationFrameResult;
      readonly kind: "blocked";
    }
  | {
      readonly kind: "published";
      readonly publishedOutcomeFrame: NonNullable<
        GpuFlowRetainedDisplayPublicationFramePlanPreparation["publishedOutcomeFrame"]
      >;
    };

export type GpuFlowCommittedSurfacePublicationContentStage =
  | {
      readonly blockedFrameResult: GpuFlowContentPublicationFrameResult;
      readonly kind: "blocked";
    }
  | {
      readonly kind: "published";
      readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
    };

export type GpuFlowRetainedCommittedSurfacePublicationContentPublishedRetainedDisplay<
  Context,
> = {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly context: Context;
};

export type GpuFlowRetainedCommittedSurfacePublicationContentStageInput<
  RetainedContext,
  Result,
> = {
  readonly deferBrowserVisualRetry: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly onCommittedSurfacePrepared?: (input: {
    readonly committedSurfacePublicationPreparation: GpuFlowCommittedSurfacePublicationFramePlanPreparation;
    readonly context: RetainedContext;
    readonly preparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
    readonly publishedRetainedDisplayOutcomeFrame: NonNullable<
      GpuFlowRetainedDisplayPublicationFramePlanPreparation["publishedOutcomeFrame"]
    >;
    readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
    readonly retainedDisplayPublication: GpuFlowRetainedDisplayPublicationResult;
    readonly retainedDisplayPublicationPreparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  }) => void;
  readonly onCommittedSurfacePublished: (input: {
    readonly committedSurfacePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
    readonly committedSurfacePublicationPreparation: GpuFlowCommittedSurfacePublicationFramePlanPreparation;
    readonly context: RetainedContext;
    readonly preparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
    readonly publishedRetainedDisplayOutcomeFrame: NonNullable<
      GpuFlowRetainedDisplayPublicationFramePlanPreparation["publishedOutcomeFrame"]
    >;
    readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
    readonly retainedDisplayPublication: GpuFlowRetainedDisplayPublicationResult;
    readonly retainedDisplayPublicationPreparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  }) => Result;
  readonly onRetainedDisplayPublished: (input: {
    readonly publishedRetainedDisplayOutcomeFrame: NonNullable<
      GpuFlowRetainedDisplayPublicationFramePlanPreparation["publishedOutcomeFrame"]
    >;
    readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
    readonly retainedDisplayPublication: GpuFlowRetainedDisplayPublicationResult;
    readonly retainedDisplayPublicationPreparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  }) => GpuFlowRetainedCommittedSurfacePublicationContentPublishedRetainedDisplay<RetainedContext>;
  readonly prepareCommittedSurfaceFrame:
    | GpuFlowRetainedDisplayCommittedSurfaceFramePreparer
    | undefined;
  readonly prepareCommittedSurfacePublicationFramePlan: GpuFlowCommittedSurfacePublicationFramePlanPreparer;
  readonly prepareRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanPreparer;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly retainedDisplayPublicationInput: GpuFlowRetainedDisplayPublicationInput;
};

export type GpuFlowRetainedCommittedSurfacePublicationContentStageRunner = <
  RetainedContext,
  Result,
>(
  input: Omit<
    GpuFlowRetainedCommittedSurfacePublicationContentStageInput<
      RetainedContext,
      Result
    >,
    | "prepareCommittedSurfacePublicationFramePlan"
    | "prepareRetainedDisplayPublicationFramePlan"
  >,
) => GpuFlowContentPublicationFrameResult | Result;

export function applyGpuFlowRetainedDisplayPublicationContentStage<Result>({
  contentStage,
  onPublished,
}: {
  readonly contentStage: GpuFlowRetainedDisplayPublicationContentStage;
  readonly onPublished: (
    publishedOutcomeFrame: Extract<
      GpuFlowRetainedDisplayPublicationContentStage,
      { readonly kind: "published" }
    >["publishedOutcomeFrame"],
  ) => Result;
}): GpuFlowContentPublicationFrameResult | Result {
  if (contentStage.kind === "blocked") {
    return contentStage.blockedFrameResult;
  }
  return onPublished(contentStage.publishedOutcomeFrame);
}

export function applyGpuFlowCommittedSurfacePublicationContentStage<Result>({
  contentStage,
  onPublished,
}: {
  readonly contentStage: GpuFlowCommittedSurfacePublicationContentStage;
  readonly onPublished: (
    committedSurfacePublication: Extract<
      GpuFlowCommittedSurfacePublicationContentStage,
      { readonly kind: "published" }
    >["committedSurfacePublication"],
  ) => Result;
}): GpuFlowContentPublicationFrameResult | Result {
  if (contentStage.kind === "blocked") {
    return contentStage.blockedFrameResult;
  }
  return onPublished(contentStage.committedSurfacePublication);
}

export function runGpuFlowRetainedDisplayPublicationContentStage<Result>({
  deferResolutionUpdates,
  onPublished,
  preparation,
  previousVisibleProjectionState,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly onPublished: (
    publishedOutcomeFrame: Extract<
      GpuFlowRetainedDisplayPublicationContentStage,
      { readonly kind: "published" }
    >["publishedOutcomeFrame"],
  ) => Result;
  readonly preparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationFrameResult | Result {
  return applyGpuFlowRetainedDisplayPublicationContentStage({
    contentStage: createGpuFlowRetainedDisplayPublicationContentStage({
      deferResolutionUpdates,
      preparation,
      previousVisibleProjectionState,
    }),
    onPublished,
  });
}

export function runGpuFlowCommittedSurfacePublicationContentStage<Result>({
  deferResolutionUpdates,
  onPublished,
  preparation,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly onPublished: (
    committedSurfacePublication: Extract<
      GpuFlowCommittedSurfacePublicationContentStage,
      { readonly kind: "published" }
    >["committedSurfacePublication"],
  ) => Result;
  readonly preparation: GpuFlowCommittedSurfacePublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
}): GpuFlowContentPublicationFrameResult | Result {
  return applyGpuFlowCommittedSurfacePublicationContentStage({
    contentStage: createGpuFlowCommittedSurfacePublicationContentStage({
      deferResolutionUpdates,
      preparation,
      previousVisibleProjectionState,
      retainedDisplayFollowUpFrameReason,
    }),
    onPublished,
  });
}

export function prepareGpuFlowCommittedSurfacePublicationFramePlanForRetainedDisplay({
  committedGpuNativeVisuals,
  deferBrowserVisualRetry,
  frameReasons,
  heldPreviousProjectionState,
  liveProjectionSample,
  prepareCommittedSurfaceFrame,
  prepareCommittedSurfacePublicationFramePlan,
  publicationLane,
  publishedRetainedFrame,
}: {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly deferBrowserVisualRetry: boolean;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly prepareCommittedSurfaceFrame:
    | GpuFlowRetainedDisplayCommittedSurfaceFramePreparer
    | undefined;
  readonly prepareCommittedSurfacePublicationFramePlan: GpuFlowCommittedSurfacePublicationFramePlanPreparer;
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
}): GpuFlowPreparedCommittedSurfacePublicationFramePlan {
  const preparedCommittedSurfaceFrame = prepareCommittedSurfaceFrame?.(
    publishedRetainedFrame,
    {
      gpuNativeVisuals: committedGpuNativeVisuals,
    },
  );
  return Object.freeze({
    preparedCommittedSurfaceFrame,
    publicationPreparation: prepareCommittedSurfacePublicationFramePlan({
      committedGpuNativeVisuals,
      deferBrowserVisualRetry,
      frameReasons,
      heldPreviousProjectionState,
      liveProjectionSample,
      publicationLane,
      publishedCommittedSurfaceFrame: preparedCommittedSurfaceFrame,
      publishedRetainedFrame,
    }),
  });
}

export function runGpuFlowRetainedCommittedSurfacePublicationContentStage<
  RetainedContext,
  Result,
>({
  deferBrowserVisualRetry,
  deferResolutionUpdates,
  frameReasons,
  liveProjectionSample,
  onCommittedSurfacePrepared,
  onCommittedSurfacePublished,
  onRetainedDisplayPublished,
  prepareCommittedSurfaceFrame,
  prepareCommittedSurfacePublicationFramePlan,
  prepareRetainedDisplayPublicationFramePlan,
  previousVisibleProjectionState,
  publicationLane,
  retainedDisplayPublicationInput,
}: GpuFlowRetainedCommittedSurfacePublicationContentStageInput<
  RetainedContext,
  Result
>): GpuFlowContentPublicationFrameResult | Result {
  const retainedDisplayPublicationPreparation =
    prepareRetainedDisplayPublicationFramePlan(retainedDisplayPublicationInput);
  const retainedDisplayPublication =
    retainedDisplayPublicationPreparation.publication;
  const retainedDisplayFollowUpFrameReason =
    retainedDisplayPublicationPreparation.followUpFrameReason;
  return runGpuFlowRetainedDisplayPublicationContentStage({
    deferResolutionUpdates,
    onPublished: (publishedRetainedDisplayOutcomeFrame) => {
      const retainedDisplayContent = onRetainedDisplayPublished({
        publishedRetainedDisplayOutcomeFrame,
        retainedDisplayFollowUpFrameReason,
        retainedDisplayPublication,
        retainedDisplayPublicationPreparation,
      });
      const committedSurfacePreparation =
        prepareGpuFlowCommittedSurfacePublicationFramePlanForRetainedDisplay({
          committedGpuNativeVisuals:
            retainedDisplayContent.committedGpuNativeVisuals,
          deferBrowserVisualRetry,
          frameReasons,
          heldPreviousProjectionState: previousVisibleProjectionState,
          liveProjectionSample,
          prepareCommittedSurfaceFrame,
          prepareCommittedSurfacePublicationFramePlan,
          publicationLane,
          publishedRetainedFrame: publishedRetainedDisplayOutcomeFrame.frame,
        });
      const committedSurfacePublicationPreparation =
        committedSurfacePreparation.publicationPreparation;
      onCommittedSurfacePrepared?.({
        committedSurfacePublicationPreparation,
        context: retainedDisplayContent.context,
        preparedCommittedSurfaceFrame:
          committedSurfacePreparation.preparedCommittedSurfaceFrame,
        publishedRetainedDisplayOutcomeFrame,
        retainedDisplayFollowUpFrameReason,
        retainedDisplayPublication,
        retainedDisplayPublicationPreparation,
      });
      return runGpuFlowCommittedSurfacePublicationContentStage({
        deferResolutionUpdates,
        onPublished: (committedSurfacePublication) =>
          onCommittedSurfacePublished({
            committedSurfacePublication,
            committedSurfacePublicationPreparation,
            context: retainedDisplayContent.context,
            preparedCommittedSurfaceFrame:
              committedSurfacePreparation.preparedCommittedSurfaceFrame,
            publishedRetainedDisplayOutcomeFrame,
            retainedDisplayFollowUpFrameReason,
            retainedDisplayPublication,
            retainedDisplayPublicationPreparation,
          }),
        preparation: committedSurfacePublicationPreparation,
        previousVisibleProjectionState,
        retainedDisplayFollowUpFrameReason,
      });
    },
    preparation: retainedDisplayPublicationPreparation,
    previousVisibleProjectionState,
  });
}

export function createGpuFlowRetainedCommittedSurfacePublicationContentStageRunner({
  prepareCommittedSurfacePublicationFramePlan,
  prepareRetainedDisplayPublicationFramePlan,
}: {
  readonly prepareCommittedSurfacePublicationFramePlan: GpuFlowCommittedSurfacePublicationFramePlanPreparer;
  readonly prepareRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanPreparer;
}): GpuFlowRetainedCommittedSurfacePublicationContentStageRunner {
  return (input) =>
    runGpuFlowRetainedCommittedSurfacePublicationContentStage({
      ...input,
      prepareCommittedSurfacePublicationFramePlan,
      prepareRetainedDisplayPublicationFramePlan,
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

export function resolveGpuFlowBlockedCommittedSurfacePublicationAbort({
  blockedPreparedCommittedSurfaceFrame,
  blockedPreservePreparationSnapshot,
  committedSurfaceFrame,
  heldPreparedCommittedSurfaceFrame,
  selectedVisibleProjectionState,
}: {
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowBlockedCommittedSurfacePublicationAbort {
  if (blockedPreparedCommittedSurfaceFrame) {
    return Object.freeze({
      frame: blockedPreparedCommittedSurfaceFrame,
      preservePreparationSnapshot: blockedPreservePreparationSnapshot,
    });
  }
  if (selectedVisibleProjectionState?.transaction.kind !== "held-previous") {
    return Object.freeze({
      frame: null,
      preservePreparationSnapshot: false,
    });
  }
  return Object.freeze({
    frame: heldPreparedCommittedSurfaceFrame ?? committedSurfaceFrame,
    preservePreparationSnapshot: heldPreparedCommittedSurfaceFrame !== null,
  });
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

export function createGpuFlowRetainedDisplayPublicationContentStage({
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowRetainedDisplayPublicationContentStage {
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
      blockedFrameResult: frameResult,
      kind: "blocked",
    };
  }
  return {
    kind: "published",
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

export function createGpuFlowCommittedSurfacePublicationContentStage({
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowCommittedSurfacePublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
}): GpuFlowCommittedSurfacePublicationContentStage {
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
      blockedFrameResult: frameResult,
      kind: "blocked",
    };
  }
  return {
    committedSurfacePublication: preparation.committedSurfacePublication,
    kind: "published",
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
  selectCommittedSurfacePublicationFramePlan = selectCommittedSurfaceFramePlanByPublicationKernel,
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
      resolveCommittedSurfaceFramePlanResultByPublicationKernel({
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
  selectRetainedDisplayPublicationFramePlan,
}: {
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly prepareRetainedDisplayPublicationCandidate: GpuFlowRetainedDisplayPublicationPreparer;
  readonly selectRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanSelector;
}): GpuFlowRetainedDisplayPublicationFramePlanPreparer {
  return (input) => {
    const publication = prepareRetainedDisplayPublicationCandidate(input);
    const framePlan = selectRetainedDisplayPublicationFramePlan({
      previousVisibleProjectionState,
      retainedDisplayOutcome: publication.retainedDisplayOutcome,
    });
    const framePlanResult =
      resolveRetainedDisplayFramePlanResultByPublicationKernel({
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
