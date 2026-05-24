import type { GpuFrameReason } from "../gpuRenderer";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";
import type { GpuFlowPreparedContentFrame } from "../preparedContentFrame";
import type {
  GpuFlowLiveProjectionSample,
  GpuFlowProjectionLane,
  GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import type { GpuViewportInput } from "../viewportMath";
import type { GpuFlowNodeLayerFrameStatePublication } from "./flowFrameLifecycle";
import {
  createGpuFlowNodeLayerFrameNotRenderedResult,
  createGpuFlowNodeLayerFrameVisibleProjectionStateResult,
  type GpuFlowNodeLayerFrameResult,
  type GpuFlowNodeLayerPreparedContentFramePublicationResult,
} from "./flowFrameResult";
import {
  selectGpuFlowRetainedDisplayFollowUpFrameReason,
  type GpuFlowRetainedDisplayPublicationInput,
  type GpuFlowRetainedDisplayPublicationResult,
} from "./flowRetainedDisplayTransaction";
import {
  type GpuFlowPreparedContentFramePublicationFramePlan,
  type GpuFlowPreparedContentFramePublicationFramePlanResult,
  type GpuFlowRetainedDisplayOutcomeFrameResult,
  type GpuFlowRetainedDisplayPublicationFramePlan,
  type GpuFlowVisibleFramePresentationContentDecisionKernel,
} from "./visibleFrameActorAdapters/contentDecisionKernel";
import {
  createGpuFlowVisibleFramePresentationEvidence,
  type GpuFlowVisibleFramePresentationEvidence,
} from "./visibleFramePresentationEvidence";
import type {
  GpuFlowBlockedPresentationToken,
  GpuFlowBlockedVisibleReason,
} from "./visibleFramePresentationProofs";

export type GpuFlowPreparedContentBlockedCandidateResourceWork = {
  readonly deferWakeup: boolean;
  readonly timestamp: number;
  readonly workItems: readonly GpuFlowBrowserVisualResourceWorkRequest[];
};

export type GpuFlowBrowserVisualResourceWorkRequest = {
  readonly actorId: string | null;
  readonly blockedReason: string;
  readonly candidateResourceKey: string;
  readonly clipRect: GpuFlowBrowserVisualResourceWorkRect | null;
  readonly debtAgeFrames: number;
  readonly lastReadyResourceKey: string | null;
  readonly ownerFrameId: number;
  readonly readinessState: "requested";
  readonly representationKind: string;
  readonly sourceHostIdentity: string;
  readonly sourceRect: GpuFlowBrowserVisualResourceWorkRect | null;
  readonly wakeupSource: "blocked-presentation";
};

export type GpuFlowBrowserVisualResourceWorkRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type GpuFlowVisibleFrameBlockedPresentationCandidate = {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId: GpuFlowBlockedPresentationToken["frozenFrameId"];
};

export type GpuFlowContentPreparationFrameResult = {
  readonly blockedErrorMessage: string | null;
  readonly blockedPreparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly blockedPreparedContentFrameResourceWork: GpuFlowPreparedContentBlockedCandidateResourceWork | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly forceImmediateReducerDebtFrame: boolean;
  readonly heldPreparedContentFrame: GpuFlowPreparedContentFrame | null;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly presentationEvidence: GpuFlowVisibleFramePresentationEvidence | null;
  readonly rendered: boolean;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

type GpuFlowContentPreparationFrameResultInput = Pick<
  GpuFlowContentPreparationFrameResult,
  "rendered"
> &
  Partial<Omit<GpuFlowContentPreparationFrameResult, "rendered">>;

const EMPTY_GPU_FLOW_CONTENT_PREPARATION_FRAME_RESULT_FIELDS = Object.freeze({
  blockedErrorMessage: null,
  blockedPreparedContentFrame: null,
  blockedPreparedContentFrameResourceWork: null,
  blockedPreservePreparationSnapshot: false,
  blockedPresentationCandidate: null,
  preparedContentFrame: null,
  forceImmediateReducerDebtFrame: false,
  heldPreparedContentFrame: null,
  nodeLayerFrameStatePublication: null,
  presentationEvidence: null,
  retainedDisplayFrame: null,
  retainedDisplayFollowUpFrameReason: null,
  retainedRuntimeFrame: null,
  visibleProjectionState: null,
} satisfies Omit<GpuFlowContentPreparationFrameResult, "rendered">);

export type GpuFlowPreparedContentFramePresentationCandidate =
  | {
      readonly kind: "present";
    }
  | {
      readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate;
      readonly candidateFrame: GpuFlowPreparedContentFrame;
      readonly errorMessage: string | null;
      readonly kind: "blocked";
      readonly preservePreparationSnapshot: boolean;
      readonly resourceWork: GpuFlowPreparedContentBlockedCandidateResourceWork;
    };

export type GpuFlowPreparedContentFramePresentationCandidateInput = {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly deferBrowserVisualWakeup?: boolean | undefined;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly contentWorkLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
};

export type GpuFlowPreparedContentFramePresentationCandidatePreparer = (
  input: GpuFlowPreparedContentFramePresentationCandidateInput,
) => GpuFlowPreparedContentFramePresentationCandidate;

export type GpuFlowPreparedContentFramePublicationFramePlanPreparation = {
  readonly candidate: GpuFlowPreparedContentFramePresentationCandidate;
  readonly preparedContentFramePublication: GpuFlowNodeLayerPreparedContentFramePublicationResult;
  readonly framePlan: GpuFlowPreparedContentFramePublicationFramePlan;
  readonly framePlanResult: GpuFlowPreparedContentFramePublicationFramePlanResult;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult | null;
  readonly shouldPrepareHtmlSurfaceOverlayTextures: boolean;
};

export type GpuFlowPreparedContentFramePublicationFramePlanPreparer = (
  input: GpuFlowPreparedContentFramePresentationCandidateInput,
) => GpuFlowPreparedContentFramePublicationFramePlanPreparation;

export type GpuFlowRetainedDisplayPreparedContentFramePreparer = (
  frame: RetainedDisplayFrame,
  options?:
    | {
        readonly gpuNativeVisuals:
          | readonly HtmlSurfaceSolidRoundedRectVisual[]
          | undefined;
        readonly viewport?: GpuViewportInput | undefined;
      }
    | undefined,
) => GpuFlowPreparedContentFrame | void;

type GpuFlowRetainedDisplayPreparedContentFramePublicationPreparation = {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
  readonly publicationPreparation: GpuFlowPreparedContentFramePublicationFramePlanPreparation;
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
      readonly blockedFrameResult: GpuFlowContentPreparationFrameResult;
      readonly kind: "blocked";
    }
  | {
      readonly kind: "published";
      readonly publishedOutcomeFrame: NonNullable<
        GpuFlowRetainedDisplayPublicationFramePlanPreparation["publishedOutcomeFrame"]
      >;
    };

export type GpuFlowPreparedContentFramePublicationContentStage =
  | {
      readonly blockedFrameResult: GpuFlowContentPreparationFrameResult;
      readonly kind: "blocked";
    }
  | {
      readonly kind: "published";
      readonly preparedContentFramePublication: GpuFlowNodeLayerPreparedContentFramePublicationResult;
    };

export type GpuFlowRetainedPreparedContentFramePublicationContentPublishedRetainedDisplay<
  Context,
> = {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly context: Context;
};

export type GpuFlowRetainedPreparedContentFramePublicationContentStageInput<
  RetainedContext,
  Result,
> = {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferBrowserVisualWakeup: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly onPreparedContentFrameCandidatePrepared?: (input: {
    readonly preparedContentFramePublicationPreparation: GpuFlowPreparedContentFramePublicationFramePlanPreparation;
    readonly context: RetainedContext;
    readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
    readonly publishedRetainedDisplayOutcomeFrame: NonNullable<
      GpuFlowRetainedDisplayPublicationFramePlanPreparation["publishedOutcomeFrame"]
    >;
    readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
    readonly retainedDisplayPublication: GpuFlowRetainedDisplayPublicationResult;
    readonly retainedDisplayPublicationPreparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  }) => void;
  readonly onPreparedContentFrameCandidateAccepted: (input: {
    readonly preparedContentFramePublication: GpuFlowNodeLayerPreparedContentFramePublicationResult;
    readonly preparedContentFramePublicationPreparation: GpuFlowPreparedContentFramePublicationFramePlanPreparation;
    readonly context: RetainedContext;
    readonly createContentPreparationFrameResultForVisibleProjectionState: GpuFlowContentPreparationFrameResultForVisibleProjectionStatePreparer;
    readonly createVisibleProjectionStateForRetainedPublication: GpuFlowRetainedPublicationVisibleProjectionStatePreparer;
    readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
    readonly publishedRetainedDisplayOutcomeFrame: NonNullable<
      GpuFlowRetainedDisplayPublicationFramePlanPreparation["publishedOutcomeFrame"]
    >;
    readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
    readonly retainedDisplayPublication: GpuFlowRetainedDisplayPublicationResult;
    readonly retainedDisplayPublicationPreparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  }) => Result;
  readonly onRetainedDisplayCandidateAccepted: (input: {
    readonly publishedRetainedDisplayOutcomeFrame: NonNullable<
      GpuFlowRetainedDisplayPublicationFramePlanPreparation["publishedOutcomeFrame"]
    >;
    readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
    readonly retainedDisplayPublication: GpuFlowRetainedDisplayPublicationResult;
    readonly retainedDisplayPublicationPreparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  }) => GpuFlowRetainedPreparedContentFramePublicationContentPublishedRetainedDisplay<RetainedContext>;
  readonly prepareContentFrame:
    | GpuFlowRetainedDisplayPreparedContentFramePreparer
    | undefined;
  readonly preparePreparedContentFramePublicationFramePlan: GpuFlowPreparedContentFramePublicationFramePlanPreparer;
  readonly prepareRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanPreparer;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly contentWorkLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly retainedDisplayPublicationInput: GpuFlowRetainedDisplayPublicationInput;
};

export type GpuFlowRetainedPreparedContentFramePublicationContentStageRunner = <
  RetainedContext,
  Result,
>(
  input: Omit<
    GpuFlowRetainedPreparedContentFramePublicationContentStageInput<
      RetainedContext,
      Result
    >,
    | "preparePreparedContentFramePublicationFramePlan"
    | "prepareRetainedDisplayPublicationFramePlan"
    | "contentDecisionKernel"
  >,
) => GpuFlowContentPreparationFrameResult | Result;

export type GpuFlowRetainedPublicationVisibleProjectionStatePreparer = (input: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
}) => GpuFlowVisibleProjectionState;

export type GpuFlowContentPreparationFrameResultForVisibleProjectionStatePreparer =
  (input: {
    readonly preparedContentFramePublication: GpuFlowNodeLayerPreparedContentFramePublicationResult;
    readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
    readonly retainedDisplayFrame: RetainedDisplayFrame | null;
    readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
    readonly visibleProjectionState: GpuFlowVisibleProjectionState;
  }) => GpuFlowContentPreparationFrameResult;

function applyGpuFlowRetainedDisplayPublicationContentStage<Result>({
  contentStage,
  onAccepted,
}: {
  readonly contentStage: GpuFlowRetainedDisplayPublicationContentStage;
  readonly onAccepted: (
    publishedOutcomeFrame: Extract<
      GpuFlowRetainedDisplayPublicationContentStage,
      { readonly kind: "published" }
    >["publishedOutcomeFrame"],
  ) => Result;
}): GpuFlowContentPreparationFrameResult | Result {
  if (contentStage.kind === "blocked") {
    return contentStage.blockedFrameResult;
  }
  return onAccepted(contentStage.publishedOutcomeFrame);
}

function applyGpuFlowPreparedContentFramePublicationContentStage<Result>({
  contentStage,
  onAccepted,
}: {
  readonly contentStage: GpuFlowPreparedContentFramePublicationContentStage;
  readonly onAccepted: (
    preparedContentFramePublication: Extract<
      GpuFlowPreparedContentFramePublicationContentStage,
      { readonly kind: "published" }
    >["preparedContentFramePublication"],
  ) => Result;
}): GpuFlowContentPreparationFrameResult | Result {
  if (contentStage.kind === "blocked") {
    return contentStage.blockedFrameResult;
  }
  return onAccepted(contentStage.preparedContentFramePublication);
}

function runGpuFlowRetainedDisplayPublicationContentStage<Result>({
  contentDecisionKernel,
  deferResolutionUpdates,
  onAccepted,
  preparation,
  previousVisibleProjectionState,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly onAccepted: (
    publishedOutcomeFrame: Extract<
      GpuFlowRetainedDisplayPublicationContentStage,
      { readonly kind: "published" }
    >["publishedOutcomeFrame"],
  ) => Result;
  readonly preparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPreparationFrameResult | Result {
  return applyGpuFlowRetainedDisplayPublicationContentStage({
    contentStage: createGpuFlowRetainedDisplayPublicationContentStage({
      contentDecisionKernel,
      deferResolutionUpdates,
      preparation,
      previousVisibleProjectionState,
    }),
    onAccepted,
  });
}

function runGpuFlowPreparedContentFramePublicationContentStage<Result>({
  contentDecisionKernel,
  deferResolutionUpdates,
  onAccepted,
  preparation,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly onAccepted: (
    preparedContentFramePublication: Extract<
      GpuFlowPreparedContentFramePublicationContentStage,
      { readonly kind: "published" }
    >["preparedContentFramePublication"],
  ) => Result;
  readonly preparation: GpuFlowPreparedContentFramePublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
}): GpuFlowContentPreparationFrameResult | Result {
  return applyGpuFlowPreparedContentFramePublicationContentStage({
    contentStage: createGpuFlowPreparedContentFramePublicationContentStage({
      contentDecisionKernel,
      deferResolutionUpdates,
      preparation,
      previousVisibleProjectionState,
      retainedDisplayFollowUpFrameReason,
    }),
    onAccepted,
  });
}

function prepareGpuFlowPreparedContentFramePublicationFramePlanForRetainedDisplay({
  committedGpuNativeVisuals,
  deferBrowserVisualWakeup,
  frameReasons,
  heldPreviousProjectionState,
  liveProjectionSample,
  prepareContentFrame,
  preparePreparedContentFramePublicationFramePlan,
  contentWorkLane,
  publishedRetainedFrame,
}: {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly deferBrowserVisualWakeup: boolean;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly prepareContentFrame:
    | GpuFlowRetainedDisplayPreparedContentFramePreparer
    | undefined;
  readonly preparePreparedContentFramePublicationFramePlan: GpuFlowPreparedContentFramePublicationFramePlanPreparer;
  readonly contentWorkLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
}): GpuFlowRetainedDisplayPreparedContentFramePublicationPreparation {
  const preparedContentFrame = prepareContentFrame?.(publishedRetainedFrame, {
    gpuNativeVisuals: committedGpuNativeVisuals,
    viewport: liveProjectionSample.viewport,
  });
  return Object.freeze({
    preparedContentFrame,
    publicationPreparation: preparePreparedContentFramePublicationFramePlan({
      committedGpuNativeVisuals,
      deferBrowserVisualWakeup,
      frameReasons,
      heldPreviousProjectionState,
      liveProjectionSample,
      contentWorkLane,
      preparedContentFrame,
      publishedRetainedFrame,
    }),
  });
}

export function runGpuFlowRetainedPreparedContentFramePublicationContentStage<
  RetainedContext,
  Result,
>({
  contentDecisionKernel,
  deferBrowserVisualWakeup,
  deferResolutionUpdates,
  frameReasons,
  liveProjectionSample,
  onPreparedContentFrameCandidatePrepared,
  onPreparedContentFrameCandidateAccepted,
  onRetainedDisplayCandidateAccepted,
  prepareContentFrame,
  preparePreparedContentFramePublicationFramePlan,
  prepareRetainedDisplayPublicationFramePlan,
  previousVisibleProjectionState,
  contentWorkLane,
  retainedDisplayPublicationInput,
}: GpuFlowRetainedPreparedContentFramePublicationContentStageInput<
  RetainedContext,
  Result
>): GpuFlowContentPreparationFrameResult | Result {
  const retainedDisplayPublicationPreparation =
    prepareRetainedDisplayPublicationFramePlan(retainedDisplayPublicationInput);
  const retainedDisplayPublication =
    retainedDisplayPublicationPreparation.publication;
  const retainedDisplayFollowUpFrameReason =
    retainedDisplayPublicationPreparation.followUpFrameReason;
  return runGpuFlowRetainedDisplayPublicationContentStage({
    contentDecisionKernel,
    deferResolutionUpdates,
    onAccepted: (publishedRetainedDisplayOutcomeFrame) => {
      const retainedDisplayContent = onRetainedDisplayCandidateAccepted({
        publishedRetainedDisplayOutcomeFrame,
        retainedDisplayFollowUpFrameReason,
        retainedDisplayPublication,
        retainedDisplayPublicationPreparation,
      });
      const preparedContentFramePreparation =
        prepareGpuFlowPreparedContentFramePublicationFramePlanForRetainedDisplay(
          {
            committedGpuNativeVisuals:
              retainedDisplayContent.committedGpuNativeVisuals,
            deferBrowserVisualWakeup,
            frameReasons,
            heldPreviousProjectionState: previousVisibleProjectionState,
            liveProjectionSample,
            prepareContentFrame,
            preparePreparedContentFramePublicationFramePlan,
            contentWorkLane,
            publishedRetainedFrame: publishedRetainedDisplayOutcomeFrame.frame,
          },
        );
      const preparedContentFramePublicationPreparation =
        preparedContentFramePreparation.publicationPreparation;
      onPreparedContentFrameCandidatePrepared?.({
        preparedContentFramePublicationPreparation,
        context: retainedDisplayContent.context,
        preparedContentFrame:
          preparedContentFramePreparation.preparedContentFrame,
        publishedRetainedDisplayOutcomeFrame,
        retainedDisplayFollowUpFrameReason,
        retainedDisplayPublication,
        retainedDisplayPublicationPreparation,
      });
      return runGpuFlowPreparedContentFramePublicationContentStage({
        contentDecisionKernel,
        deferResolutionUpdates,
        onAccepted: (preparedContentFramePublication) =>
          onPreparedContentFrameCandidateAccepted({
            preparedContentFramePublication,
            preparedContentFramePublicationPreparation,
            context: retainedDisplayContent.context,
            createContentPreparationFrameResultForVisibleProjectionState: (
              input,
            ) =>
              createGpuFlowContentPreparationFrameResultForVisibleProjectionState(
                {
                  ...input,
                  contentDecisionKernel,
                  deferResolutionUpdates,
                  previousVisibleProjectionState,
                  retainedDisplayFollowUpFrameReason,
                },
              ),
            createVisibleProjectionStateForRetainedPublication: (input) =>
              contentDecisionKernel.createVisibleProjectionStateForRetainedPublication(
                {
                  frameReasons,
                  liveProjectionSample,
                  contentWorkLane,
                  preparedContentFrame: input.preparedContentFrame,
                },
              ),
            preparedContentFrame:
              preparedContentFramePreparation.preparedContentFrame,
            publishedRetainedDisplayOutcomeFrame,
            retainedDisplayFollowUpFrameReason,
            retainedDisplayPublication,
            retainedDisplayPublicationPreparation,
          }),
        preparation: preparedContentFramePublicationPreparation,
        previousVisibleProjectionState,
        retainedDisplayFollowUpFrameReason,
      });
    },
    preparation: retainedDisplayPublicationPreparation,
    previousVisibleProjectionState,
  });
}

export function createGpuFlowRetainedPreparedContentFramePublicationContentStageRunner({
  contentDecisionKernel,
  preparePreparedContentFramePublicationFramePlan,
  prepareRetainedDisplayPublicationFramePlan,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly preparePreparedContentFramePublicationFramePlan: GpuFlowPreparedContentFramePublicationFramePlanPreparer;
  readonly prepareRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanPreparer;
}): GpuFlowRetainedPreparedContentFramePublicationContentStageRunner {
  return (input) =>
    runGpuFlowRetainedPreparedContentFramePublicationContentStage({
      ...input,
      contentDecisionKernel,
      preparePreparedContentFramePublicationFramePlan,
      prepareRetainedDisplayPublicationFramePlan,
    });
}

export function createGpuFlowContentPreparationFrameResult(
  input: GpuFlowContentPreparationFrameResultInput,
): GpuFlowContentPreparationFrameResult {
  return {
    ...EMPTY_GPU_FLOW_CONTENT_PREPARATION_FRAME_RESULT_FIELDS,
    ...input,
  };
}

function createGpuFlowContentPreparationFrameResultForRetainedDisplayPublicationPreparation({
  contentDecisionKernel,
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPreparationFrameResult | null {
  if (preparation.nodeLayerFrameResult === null) {
    return null;
  }
  return createGpuFlowContentPreparationFrameResultForNodeLayerFrame({
    contentDecisionKernel,
    deferResolutionUpdates,
    nodeLayerFrameResult: preparation.nodeLayerFrameResult,
    nodeLayerFrameStatePublication: null,
    previousVisibleProjectionState,
    retainedDisplayFollowUpFrameReason: preparation.followUpFrameReason,
    retainedDisplayFrame: null,
    retainedRuntimeFrame: null,
  });
}

function createGpuFlowRetainedDisplayPublicationContentStage({
  contentDecisionKernel,
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowRetainedDisplayPublicationContentStage {
  const frameResult =
    createGpuFlowContentPreparationFrameResultForRetainedDisplayPublicationPreparation(
      {
        contentDecisionKernel,
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

function createGpuFlowContentPreparationFrameResultForPreparedContentFramePublicationPreparation({
  contentDecisionKernel,
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowPreparedContentFramePublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
}): GpuFlowContentPreparationFrameResult | null {
  if (preparation.nodeLayerFrameResult === null) {
    return null;
  }
  return createGpuFlowContentPreparationFrameResultForNodeLayerFrame({
    contentDecisionKernel,
    deferResolutionUpdates,
    nodeLayerFrameResult: preparation.nodeLayerFrameResult,
    nodeLayerFrameStatePublication: null,
    previousVisibleProjectionState,
    retainedDisplayFollowUpFrameReason,
    retainedDisplayFrame: null,
    retainedRuntimeFrame: null,
  });
}

function createGpuFlowPreparedContentFramePublicationContentStage({
  contentDecisionKernel,
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowPreparedContentFramePublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
}): GpuFlowPreparedContentFramePublicationContentStage {
  const frameResult =
    createGpuFlowContentPreparationFrameResultForPreparedContentFramePublicationPreparation(
      {
        contentDecisionKernel,
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
    preparedContentFramePublication:
      preparation.preparedContentFramePublication,
    kind: "published",
  };
}

function createGpuFlowContentPreparationFrameResultForVisibleProjectionState({
  preparedContentFramePublication,
  contentDecisionKernel,
  deferResolutionUpdates,
  nodeLayerFrameStatePublication,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  visibleProjectionState,
}: {
  readonly preparedContentFramePublication: GpuFlowNodeLayerPreparedContentFramePublicationResult;
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowContentPreparationFrameResult {
  return createGpuFlowContentPreparationFrameResultForNodeLayerFrame({
    contentDecisionKernel,
    deferResolutionUpdates,
    nodeLayerFrameResult:
      createGpuFlowNodeLayerFrameVisibleProjectionStateResult(
        visibleProjectionState,
        { preparedContentFramePublication },
      ),
    nodeLayerFrameStatePublication,
    previousVisibleProjectionState,
    retainedDisplayFollowUpFrameReason,
    retainedDisplayFrame,
    retainedRuntimeFrame,
  });
}

function createGpuFlowContentPreparationFrameResultForNodeLayerFrame({
  contentDecisionKernel,
  deferResolutionUpdates,
  nodeLayerFrameResult,
  nodeLayerFrameStatePublication,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
}): GpuFlowContentPreparationFrameResult {
  const preparedContentFramePublication =
    nodeLayerFrameResult.preparedContentFramePublication;
  const blockedPresentationCandidate =
    contentDecisionKernel.selectContentPreparationBlockedCandidateForFrameResult(
      {
        nodeLayerFrameResult,
        previousVisibleProjectionState,
      },
    );
  const visibleProjectionState = nodeLayerFrameResult.visibleProjectionState;
  if (visibleProjectionState) {
    return createGpuFlowVisibleContentPreparationFrameResult({
      blockedPresentationCandidate,
      preparedContentFramePublication,
      deferResolutionUpdates,
      nodeLayerFrameStatePublication,
      retainedDisplayFrame,
      retainedDisplayFollowUpFrameReason,
      retainedRuntimeFrame,
      visibleProjectionState,
    });
  }
  return createGpuFlowNotVisibleContentPreparationFrameResult({
    blockedPresentationCandidate,
    nodeLayerFrameResult,
    nodeLayerFrameStatePublication,
    retainedDisplayFollowUpFrameReason,
    retainedRuntimeFrame,
  });
}

function createGpuFlowVisibleContentPreparationFrameResult({
  blockedPresentationCandidate,
  preparedContentFramePublication,
  deferResolutionUpdates,
  nodeLayerFrameStatePublication,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  visibleProjectionState,
}: {
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly preparedContentFramePublication: GpuFlowNodeLayerFrameResult["preparedContentFramePublication"];
  readonly deferResolutionUpdates: boolean;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowContentPreparationFrameResult {
  const heldPrevious =
    visibleProjectionState.transaction.kind === "held-previous";
  return createGpuFlowContentPreparationFrameResult({
    blockedPresentationCandidate,
    preparedContentFrame: preparedContentFramePublication.preparedContentFrame,
    forceImmediateReducerDebtFrame: heldPrevious && !deferResolutionUpdates,
    heldPreparedContentFrame:
      preparedContentFramePublication.heldPreparedContentFrame,
    nodeLayerFrameStatePublication,
    presentationEvidence: createGpuFlowVisibleFramePresentationEvidence({
      nodeLayerFrameStatePublication,
      visibleProjectionState,
    }),
    rendered: deferResolutionUpdates || !heldPrevious,
    retainedDisplayFrame,
    retainedDisplayFollowUpFrameReason,
    retainedRuntimeFrame,
    visibleProjectionState,
  });
}

function createGpuFlowNotVisibleContentPreparationFrameResult({
  blockedPresentationCandidate,
  nodeLayerFrameResult,
  nodeLayerFrameStatePublication,
  retainedDisplayFollowUpFrameReason,
  retainedRuntimeFrame,
}: {
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
}): GpuFlowContentPreparationFrameResult {
  const preparedContentFramePublication =
    nodeLayerFrameResult.preparedContentFramePublication;
  const blockedSurfacePublication =
    preparedContentFramePublication.blockedSurfacePublication;
  return createGpuFlowContentPreparationFrameResult({
    blockedErrorMessage: blockedSurfacePublication?.errorMessage ?? null,
    blockedPreparedContentFrame:
      blockedSurfacePublication?.candidateFrame ?? null,
    blockedPreparedContentFrameResourceWork:
      blockedSurfacePublication?.resourceWork ?? null,
    blockedPreservePreparationSnapshot:
      blockedSurfacePublication?.preservePreparationSnapshot ?? false,
    blockedPresentationCandidate,
    preparedContentFrame: preparedContentFramePublication.preparedContentFrame,
    heldPreparedContentFrame:
      preparedContentFramePublication.heldPreparedContentFrame,
    nodeLayerFrameStatePublication,
    rendered: false,
    retainedRuntimeFrame,
    retainedDisplayFollowUpFrameReason,
  });
}

export function createGpuFlowPreparedContentFramePublicationFramePlanPreparer({
  contentDecisionKernel,
  preparePreparedContentFramePresentationCandidate = contentDecisionKernel.preparePreparedContentFramePresentationCandidate,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly preparePreparedContentFramePresentationCandidate?: GpuFlowPreparedContentFramePresentationCandidatePreparer;
}): GpuFlowPreparedContentFramePublicationFramePlanPreparer {
  return (input) => {
    const candidate = preparePreparedContentFramePresentationCandidate(input);
    const framePlan =
      contentDecisionKernel.selectPreparedContentFramePublicationFramePlan({
        candidate,
        preparedContentFrame: input.preparedContentFrame,
      });
    const framePlanResult =
      contentDecisionKernel.resolvePreparedContentFramePublicationFramePlanResult(
        {
          framePlan,
        },
      );
    return Object.freeze({
      candidate,
      preparedContentFramePublication:
        framePlanResult.preparedContentFramePublication,
      framePlan,
      framePlanResult,
      nodeLayerFrameResult:
        resolveGpuFlowPreparedContentFramePublicationFramePlanNodeLayerResult({
          framePlanResult,
        }),
      shouldPrepareHtmlSurfaceOverlayTextures: candidate.kind !== "present",
    });
  };
}

function resolveGpuFlowPreparedContentFramePublicationFramePlanNodeLayerResult({
  framePlanResult,
}: {
  readonly framePlanResult: GpuFlowPreparedContentFramePublicationFramePlanResult;
}): GpuFlowNodeLayerFrameResult | null {
  if (
    framePlanResult.blockedPresentationCandidate === null &&
    framePlanResult.visibleProjectionState === null
  ) {
    return null;
  }
  const candidateResultOptions = {
    blockedPresentationCandidate: framePlanResult.blockedPresentationCandidate,
    preparedContentFramePublication:
      framePlanResult.preparedContentFramePublication,
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
  contentDecisionKernel,
  previousVisibleProjectionState,
  prepareRetainedDisplayPresentationCandidate,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly prepareRetainedDisplayPresentationCandidate: GpuFlowRetainedDisplayPublicationPreparer;
}): GpuFlowRetainedDisplayPublicationFramePlanPreparer {
  return (input) => {
    const publication = prepareRetainedDisplayPresentationCandidate(input);
    const framePlan =
      contentDecisionKernel.selectRetainedDisplayPublicationFramePlan({
        previousVisibleProjectionState,
        retainedDisplayOutcome: publication.retainedDisplayOutcome,
      });
    const framePlanResult =
      contentDecisionKernel.resolveRetainedDisplayPublicationFramePlanResult({
        framePlan,
      });
    return Object.freeze({
      followUpFrameReason:
        framePlanResult.publishedOutcomeFrame === null
          ? null
          : selectGpuFlowRetainedDisplayFollowUpFrameReason({
              deferResolutionUpdates: input.deferResolutionUpdates,
              outcomeKind: framePlanResult.publishedOutcomeFrame.outcomeKind,
              trueHoleRectCount:
                framePlanResult.publishedOutcomeFrame.frame.diagnostics
                  ?.trueHoleRectCount ?? 0,
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

function resolveGpuFlowRetainedDisplayPublicationFramePlanNodeLayerResult({
  framePlanResult,
}: {
  readonly framePlanResult: GpuFlowRetainedDisplayOutcomeFrameResult;
}): GpuFlowNodeLayerFrameResult | null {
  if (!framePlanResult.blockedPresentationCandidate) {
    return null;
  }
  return createGpuFlowNodeLayerFrameNotRenderedResult({
    blockedPresentationCandidate: framePlanResult.blockedPresentationCandidate,
  });
}
