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
  type GpuFlowNodeLayerPreparedContentFramePresentationResult,
} from "./flowFrameResult";
import {
  selectGpuFlowRetainedDisplayFollowUpFrameReason,
  type GpuFlowRetainedDisplayPublicationInput,
  type GpuFlowRetainedDisplayPublicationResult,
} from "./flowRetainedDisplayTransaction";
import {
  type GpuFlowPreparedContentFramePresentationFramePlan,
  type GpuFlowPreparedContentFramePresentationFramePlanResult,
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

export type GpuFlowPreparedContentFramePresentationFramePlanPreparation = {
  readonly candidate: GpuFlowPreparedContentFramePresentationCandidate;
  readonly preparedContentFramePresentation: GpuFlowNodeLayerPreparedContentFramePresentationResult;
  readonly framePlan: GpuFlowPreparedContentFramePresentationFramePlan;
  readonly framePlanResult: GpuFlowPreparedContentFramePresentationFramePlanResult;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult | null;
  readonly shouldPrepareHtmlSurfaceOverlayTextures: boolean;
};

export type GpuFlowPreparedContentFramePresentationFramePlanPreparer = (
  input: GpuFlowPreparedContentFramePresentationCandidateInput,
) => GpuFlowPreparedContentFramePresentationFramePlanPreparation;

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

type GpuFlowRetainedDisplayPreparedContentFramePresentationPreparation = {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
  readonly presentationPreparation: GpuFlowPreparedContentFramePresentationFramePlanPreparation;
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

export type GpuFlowPreparedContentFramePresentationContentStage =
  | {
      readonly blockedFrameResult: GpuFlowContentPreparationFrameResult;
      readonly kind: "blocked";
    }
  | {
      readonly kind: "published";
      readonly preparedContentFramePresentation: GpuFlowNodeLayerPreparedContentFramePresentationResult;
    };

export type GpuFlowRetainedPreparedContentFramePresentationContentPublishedRetainedDisplay<
  Context,
> = {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly context: Context;
};

export type GpuFlowRetainedPreparedContentFramePresentationContentStageInput<
  RetainedContext,
  Result,
> = {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferBrowserVisualWakeup: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly onPreparedContentFrameCandidatePrepared?: (input: {
    readonly preparedContentFramePresentationPreparation: GpuFlowPreparedContentFramePresentationFramePlanPreparation;
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
    readonly preparedContentFramePresentation: GpuFlowNodeLayerPreparedContentFramePresentationResult;
    readonly preparedContentFramePresentationPreparation: GpuFlowPreparedContentFramePresentationFramePlanPreparation;
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
  }) => GpuFlowRetainedPreparedContentFramePresentationContentPublishedRetainedDisplay<RetainedContext>;
  readonly prepareContentFrame:
    | GpuFlowRetainedDisplayPreparedContentFramePreparer
    | undefined;
  readonly preparePreparedContentFramePresentationFramePlan: GpuFlowPreparedContentFramePresentationFramePlanPreparer;
  readonly prepareRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanPreparer;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly contentWorkLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly retainedDisplayPublicationInput: GpuFlowRetainedDisplayPublicationInput;
};

export type GpuFlowRetainedPreparedContentFramePresentationContentStageRunner =
  <RetainedContext, Result>(
    input: Omit<
      GpuFlowRetainedPreparedContentFramePresentationContentStageInput<
        RetainedContext,
        Result
      >,
      | "preparePreparedContentFramePresentationFramePlan"
      | "prepareRetainedDisplayPublicationFramePlan"
      | "contentDecisionKernel"
    >,
  ) => GpuFlowContentPreparationFrameResult | Result;

export type GpuFlowRetainedPublicationVisibleProjectionStatePreparer = (input: {
  readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
}) => GpuFlowVisibleProjectionState;

export type GpuFlowContentPreparationFrameResultForVisibleProjectionStatePreparer =
  (input: {
    readonly preparedContentFramePresentation: GpuFlowNodeLayerPreparedContentFramePresentationResult;
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

function applyGpuFlowPreparedContentFramePresentationContentStage<Result>({
  contentStage,
  onAccepted,
}: {
  readonly contentStage: GpuFlowPreparedContentFramePresentationContentStage;
  readonly onAccepted: (
    preparedContentFramePresentation: Extract<
      GpuFlowPreparedContentFramePresentationContentStage,
      { readonly kind: "published" }
    >["preparedContentFramePresentation"],
  ) => Result;
}): GpuFlowContentPreparationFrameResult | Result {
  if (contentStage.kind === "blocked") {
    return contentStage.blockedFrameResult;
  }
  return onAccepted(contentStage.preparedContentFramePresentation);
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

function runGpuFlowPreparedContentFramePresentationContentStage<Result>({
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
    preparedContentFramePresentation: Extract<
      GpuFlowPreparedContentFramePresentationContentStage,
      { readonly kind: "published" }
    >["preparedContentFramePresentation"],
  ) => Result;
  readonly preparation: GpuFlowPreparedContentFramePresentationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
}): GpuFlowContentPreparationFrameResult | Result {
  return applyGpuFlowPreparedContentFramePresentationContentStage({
    contentStage: createGpuFlowPreparedContentFramePresentationContentStage({
      contentDecisionKernel,
      deferResolutionUpdates,
      preparation,
      previousVisibleProjectionState,
      retainedDisplayFollowUpFrameReason,
    }),
    onAccepted,
  });
}

function prepareGpuFlowPreparedContentFramePresentationFramePlanForRetainedDisplay({
  committedGpuNativeVisuals,
  deferBrowserVisualWakeup,
  frameReasons,
  heldPreviousProjectionState,
  liveProjectionSample,
  prepareContentFrame,
  preparePreparedContentFramePresentationFramePlan,
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
  readonly preparePreparedContentFramePresentationFramePlan: GpuFlowPreparedContentFramePresentationFramePlanPreparer;
  readonly contentWorkLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
}): GpuFlowRetainedDisplayPreparedContentFramePresentationPreparation {
  const preparedContentFrame = prepareContentFrame?.(publishedRetainedFrame, {
    gpuNativeVisuals: committedGpuNativeVisuals,
    viewport: liveProjectionSample.viewport,
  });
  return Object.freeze({
    preparedContentFrame,
    presentationPreparation: preparePreparedContentFramePresentationFramePlan({
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

export function runGpuFlowRetainedPreparedContentFramePresentationContentStage<
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
  preparePreparedContentFramePresentationFramePlan,
  prepareRetainedDisplayPublicationFramePlan,
  previousVisibleProjectionState,
  contentWorkLane,
  retainedDisplayPublicationInput,
}: GpuFlowRetainedPreparedContentFramePresentationContentStageInput<
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
        prepareGpuFlowPreparedContentFramePresentationFramePlanForRetainedDisplay(
          {
            committedGpuNativeVisuals:
              retainedDisplayContent.committedGpuNativeVisuals,
            deferBrowserVisualWakeup,
            frameReasons,
            heldPreviousProjectionState: previousVisibleProjectionState,
            liveProjectionSample,
            prepareContentFrame,
            preparePreparedContentFramePresentationFramePlan,
            contentWorkLane,
            publishedRetainedFrame: publishedRetainedDisplayOutcomeFrame.frame,
          },
        );
      const preparedContentFramePresentationPreparation =
        preparedContentFramePreparation.presentationPreparation;
      onPreparedContentFrameCandidatePrepared?.({
        preparedContentFramePresentationPreparation,
        context: retainedDisplayContent.context,
        preparedContentFrame:
          preparedContentFramePreparation.preparedContentFrame,
        publishedRetainedDisplayOutcomeFrame,
        retainedDisplayFollowUpFrameReason,
        retainedDisplayPublication,
        retainedDisplayPublicationPreparation,
      });
      return runGpuFlowPreparedContentFramePresentationContentStage({
        contentDecisionKernel,
        deferResolutionUpdates,
        onAccepted: (preparedContentFramePresentation) =>
          onPreparedContentFrameCandidateAccepted({
            preparedContentFramePresentation,
            preparedContentFramePresentationPreparation,
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
        preparation: preparedContentFramePresentationPreparation,
        previousVisibleProjectionState,
        retainedDisplayFollowUpFrameReason,
      });
    },
    preparation: retainedDisplayPublicationPreparation,
    previousVisibleProjectionState,
  });
}

export function createGpuFlowRetainedPreparedContentFramePresentationContentStageRunner({
  contentDecisionKernel,
  preparePreparedContentFramePresentationFramePlan,
  prepareRetainedDisplayPublicationFramePlan,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly preparePreparedContentFramePresentationFramePlan: GpuFlowPreparedContentFramePresentationFramePlanPreparer;
  readonly prepareRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanPreparer;
}): GpuFlowRetainedPreparedContentFramePresentationContentStageRunner {
  return (input) =>
    runGpuFlowRetainedPreparedContentFramePresentationContentStage({
      ...input,
      contentDecisionKernel,
      preparePreparedContentFramePresentationFramePlan,
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

function createGpuFlowContentPreparationFrameResultForPreparedContentFramePresentationPreparation({
  contentDecisionKernel,
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowPreparedContentFramePresentationFramePlanPreparation;
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

function createGpuFlowPreparedContentFramePresentationContentStage({
  contentDecisionKernel,
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowPreparedContentFramePresentationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
}): GpuFlowPreparedContentFramePresentationContentStage {
  const frameResult =
    createGpuFlowContentPreparationFrameResultForPreparedContentFramePresentationPreparation(
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
    preparedContentFramePresentation:
      preparation.preparedContentFramePresentation,
    kind: "published",
  };
}

function createGpuFlowContentPreparationFrameResultForVisibleProjectionState({
  preparedContentFramePresentation,
  contentDecisionKernel,
  deferResolutionUpdates,
  nodeLayerFrameStatePublication,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  visibleProjectionState,
}: {
  readonly preparedContentFramePresentation: GpuFlowNodeLayerPreparedContentFramePresentationResult;
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
        { preparedContentFramePresentation },
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
  const preparedContentFramePresentation =
    nodeLayerFrameResult.preparedContentFramePresentation;
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
      preparedContentFramePresentation,
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
  preparedContentFramePresentation,
  deferResolutionUpdates,
  nodeLayerFrameStatePublication,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  visibleProjectionState,
}: {
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly preparedContentFramePresentation: GpuFlowNodeLayerFrameResult["preparedContentFramePresentation"];
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
    preparedContentFrame: preparedContentFramePresentation.preparedContentFrame,
    forceImmediateReducerDebtFrame: heldPrevious && !deferResolutionUpdates,
    heldPreparedContentFrame:
      preparedContentFramePresentation.heldPreparedContentFrame,
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
  const preparedContentFramePresentation =
    nodeLayerFrameResult.preparedContentFramePresentation;
  const blockedSurfacePresentation =
    preparedContentFramePresentation.blockedSurfacePresentation;
  return createGpuFlowContentPreparationFrameResult({
    blockedErrorMessage: blockedSurfacePresentation?.errorMessage ?? null,
    blockedPreparedContentFrame:
      blockedSurfacePresentation?.candidateFrame ?? null,
    blockedPreparedContentFrameResourceWork:
      blockedSurfacePresentation?.resourceWork ?? null,
    blockedPreservePreparationSnapshot:
      blockedSurfacePresentation?.preservePreparationSnapshot ?? false,
    blockedPresentationCandidate,
    preparedContentFrame: preparedContentFramePresentation.preparedContentFrame,
    heldPreparedContentFrame:
      preparedContentFramePresentation.heldPreparedContentFrame,
    nodeLayerFrameStatePublication,
    rendered: false,
    retainedRuntimeFrame,
    retainedDisplayFollowUpFrameReason,
  });
}

export function createGpuFlowPreparedContentFramePresentationFramePlanPreparer({
  contentDecisionKernel,
  preparePreparedContentFramePresentationCandidate = contentDecisionKernel.preparePreparedContentFramePresentationCandidate,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly preparePreparedContentFramePresentationCandidate?: GpuFlowPreparedContentFramePresentationCandidatePreparer;
}): GpuFlowPreparedContentFramePresentationFramePlanPreparer {
  return (input) => {
    const candidate = preparePreparedContentFramePresentationCandidate(input);
    const framePlan =
      contentDecisionKernel.selectPreparedContentFramePresentationFramePlan({
        candidate,
        preparedContentFrame: input.preparedContentFrame,
      });
    const framePlanResult =
      contentDecisionKernel.resolvePreparedContentFramePresentationFramePlanResult(
        {
          framePlan,
        },
      );
    return Object.freeze({
      candidate,
      preparedContentFramePresentation:
        framePlanResult.preparedContentFramePresentation,
      framePlan,
      framePlanResult,
      nodeLayerFrameResult:
        resolveGpuFlowPreparedContentFramePresentationFramePlanNodeLayerResult({
          framePlanResult,
        }),
      shouldPrepareHtmlSurfaceOverlayTextures: candidate.kind !== "present",
    });
  };
}

function resolveGpuFlowPreparedContentFramePresentationFramePlanNodeLayerResult({
  framePlanResult,
}: {
  readonly framePlanResult: GpuFlowPreparedContentFramePresentationFramePlanResult;
}): GpuFlowNodeLayerFrameResult | null {
  if (
    framePlanResult.blockedPresentationCandidate === null &&
    framePlanResult.visibleProjectionState === null
  ) {
    return null;
  }
  const candidateResultOptions = {
    blockedPresentationCandidate: framePlanResult.blockedPresentationCandidate,
    preparedContentFramePresentation:
      framePlanResult.preparedContentFramePresentation,
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
