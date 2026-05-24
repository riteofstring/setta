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
import type { GpuFlowNodeLayerFrameStatePresentation } from "./flowFrameLifecycle";
import {
  createGpuFlowNodeLayerFrameNotRenderedResult,
  createGpuFlowNodeLayerFrameVisibleProjectionStateResult,
  type GpuFlowNodeLayerFrameResult,
  type GpuFlowNodeLayerPreparedContentFramePresentationResult,
} from "./flowFrameResult";
import {
  selectGpuFlowRetainedDisplayFollowUpFrameReason,
  type GpuFlowRetainedDisplayPresentationInput,
  type GpuFlowRetainedDisplayPresentationResult,
} from "./flowRetainedDisplayTransaction";
import {
  type GpuFlowPreparedContentFramePresentationFramePlan,
  type GpuFlowPreparedContentFramePresentationFramePlanResult,
  type GpuFlowRetainedDisplayOutcomeFrameResult,
  type GpuFlowRetainedDisplayPresentationFramePlan,
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
  readonly nodeLayerFrameStatePresentation: GpuFlowNodeLayerFrameStatePresentation | null;
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
  nodeLayerFrameStatePresentation: null,
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
  readonly presentedGpuNativeVisuals:
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
  readonly presentedRetainedFrame: RetainedDisplayFrame;
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

export type GpuFlowRetainedDisplayPresentationPreparer = (
  input: GpuFlowRetainedDisplayPresentationInput,
) => GpuFlowRetainedDisplayPresentationResult;

export type GpuFlowRetainedDisplayPresentationFramePlanPreparation = {
  readonly followUpFrameReason: GpuFrameReason | null;
  readonly framePlan: GpuFlowRetainedDisplayPresentationFramePlan;
  readonly framePlanResult: GpuFlowRetainedDisplayOutcomeFrameResult;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult | null;
  readonly presentation: GpuFlowRetainedDisplayPresentationResult;
  readonly presentedOutcomeFrame: GpuFlowRetainedDisplayOutcomeFrameResult["presentedOutcomeFrame"];
};

export type GpuFlowRetainedDisplayPresentationFramePlanPreparer = (
  input: GpuFlowRetainedDisplayPresentationInput,
) => GpuFlowRetainedDisplayPresentationFramePlanPreparation;

export type GpuFlowRetainedDisplayPresentationContentStage =
  | {
      readonly blockedFrameResult: GpuFlowContentPreparationFrameResult;
      readonly kind: "blocked";
    }
  | {
      readonly kind: "presented";
      readonly presentedOutcomeFrame: NonNullable<
        GpuFlowRetainedDisplayPresentationFramePlanPreparation["presentedOutcomeFrame"]
      >;
    };

export type GpuFlowPreparedContentFramePresentationContentStage =
  | {
      readonly blockedFrameResult: GpuFlowContentPreparationFrameResult;
      readonly kind: "blocked";
    }
  | {
      readonly kind: "presented";
      readonly preparedContentFramePresentation: GpuFlowNodeLayerPreparedContentFramePresentationResult;
    };

export type GpuFlowRetainedPreparedContentFramePresentationContentPresentedRetainedDisplay<
  Context,
> = {
  readonly presentedGpuNativeVisuals:
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
    readonly presentedRetainedDisplayOutcomeFrame: NonNullable<
      GpuFlowRetainedDisplayPresentationFramePlanPreparation["presentedOutcomeFrame"]
    >;
    readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
    readonly retainedDisplayPresentation: GpuFlowRetainedDisplayPresentationResult;
    readonly retainedDisplayPresentationPreparation: GpuFlowRetainedDisplayPresentationFramePlanPreparation;
  }) => void;
  readonly onPreparedContentFrameCandidateAccepted: (input: {
    readonly preparedContentFramePresentation: GpuFlowNodeLayerPreparedContentFramePresentationResult;
    readonly preparedContentFramePresentationPreparation: GpuFlowPreparedContentFramePresentationFramePlanPreparation;
    readonly context: RetainedContext;
    readonly createContentPreparationFrameResultForVisibleProjectionState: GpuFlowContentPreparationFrameResultForVisibleProjectionStatePreparer;
    readonly createVisibleProjectionStateForRetainedPresentation: GpuFlowRetainedPresentationVisibleProjectionStatePreparer;
    readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
    readonly presentedRetainedDisplayOutcomeFrame: NonNullable<
      GpuFlowRetainedDisplayPresentationFramePlanPreparation["presentedOutcomeFrame"]
    >;
    readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
    readonly retainedDisplayPresentation: GpuFlowRetainedDisplayPresentationResult;
    readonly retainedDisplayPresentationPreparation: GpuFlowRetainedDisplayPresentationFramePlanPreparation;
  }) => Result;
  readonly onRetainedDisplayCandidateAccepted: (input: {
    readonly presentedRetainedDisplayOutcomeFrame: NonNullable<
      GpuFlowRetainedDisplayPresentationFramePlanPreparation["presentedOutcomeFrame"]
    >;
    readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
    readonly retainedDisplayPresentation: GpuFlowRetainedDisplayPresentationResult;
    readonly retainedDisplayPresentationPreparation: GpuFlowRetainedDisplayPresentationFramePlanPreparation;
  }) => GpuFlowRetainedPreparedContentFramePresentationContentPresentedRetainedDisplay<RetainedContext>;
  readonly prepareContentFrame:
    | GpuFlowRetainedDisplayPreparedContentFramePreparer
    | undefined;
  readonly preparePreparedContentFramePresentationFramePlan: GpuFlowPreparedContentFramePresentationFramePlanPreparer;
  readonly prepareRetainedDisplayPresentationFramePlan: GpuFlowRetainedDisplayPresentationFramePlanPreparer;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly contentWorkLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly retainedDisplayPresentationInput: GpuFlowRetainedDisplayPresentationInput;
};

export type GpuFlowRetainedPreparedContentFramePresentationContentStageRunner =
  <RetainedContext, Result>(
    input: Omit<
      GpuFlowRetainedPreparedContentFramePresentationContentStageInput<
        RetainedContext,
        Result
      >,
      | "preparePreparedContentFramePresentationFramePlan"
      | "prepareRetainedDisplayPresentationFramePlan"
      | "contentDecisionKernel"
    >,
  ) => GpuFlowContentPreparationFrameResult | Result;

export type GpuFlowRetainedPresentationVisibleProjectionStatePreparer =
  (input: {
    readonly preparedContentFrame: GpuFlowPreparedContentFrame | void;
  }) => GpuFlowVisibleProjectionState;

export type GpuFlowContentPreparationFrameResultForVisibleProjectionStatePreparer =
  (input: {
    readonly preparedContentFramePresentation: GpuFlowNodeLayerPreparedContentFramePresentationResult;
    readonly nodeLayerFrameStatePresentation: GpuFlowNodeLayerFrameStatePresentation | null;
    readonly retainedDisplayFrame: RetainedDisplayFrame | null;
    readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
    readonly visibleProjectionState: GpuFlowVisibleProjectionState;
  }) => GpuFlowContentPreparationFrameResult;

function applyGpuFlowRetainedDisplayPresentationContentStage<Result>({
  contentStage,
  onAccepted,
}: {
  readonly contentStage: GpuFlowRetainedDisplayPresentationContentStage;
  readonly onAccepted: (
    presentedOutcomeFrame: Extract<
      GpuFlowRetainedDisplayPresentationContentStage,
      { readonly kind: "presented" }
    >["presentedOutcomeFrame"],
  ) => Result;
}): GpuFlowContentPreparationFrameResult | Result {
  if (contentStage.kind === "blocked") {
    return contentStage.blockedFrameResult;
  }
  return onAccepted(contentStage.presentedOutcomeFrame);
}

function applyGpuFlowPreparedContentFramePresentationContentStage<Result>({
  contentStage,
  onAccepted,
}: {
  readonly contentStage: GpuFlowPreparedContentFramePresentationContentStage;
  readonly onAccepted: (
    preparedContentFramePresentation: Extract<
      GpuFlowPreparedContentFramePresentationContentStage,
      { readonly kind: "presented" }
    >["preparedContentFramePresentation"],
  ) => Result;
}): GpuFlowContentPreparationFrameResult | Result {
  if (contentStage.kind === "blocked") {
    return contentStage.blockedFrameResult;
  }
  return onAccepted(contentStage.preparedContentFramePresentation);
}

function runGpuFlowRetainedDisplayPresentationContentStage<Result>({
  contentDecisionKernel,
  deferResolutionUpdates,
  onAccepted,
  preparation,
  previousVisibleProjectionState,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly onAccepted: (
    presentedOutcomeFrame: Extract<
      GpuFlowRetainedDisplayPresentationContentStage,
      { readonly kind: "presented" }
    >["presentedOutcomeFrame"],
  ) => Result;
  readonly preparation: GpuFlowRetainedDisplayPresentationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPreparationFrameResult | Result {
  return applyGpuFlowRetainedDisplayPresentationContentStage({
    contentStage: createGpuFlowRetainedDisplayPresentationContentStage({
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
      { readonly kind: "presented" }
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
  presentedGpuNativeVisuals,
  deferBrowserVisualWakeup,
  frameReasons,
  heldPreviousProjectionState,
  liveProjectionSample,
  prepareContentFrame,
  preparePreparedContentFramePresentationFramePlan,
  contentWorkLane,
  presentedRetainedFrame,
}: {
  readonly presentedGpuNativeVisuals:
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
  readonly presentedRetainedFrame: RetainedDisplayFrame;
}): GpuFlowRetainedDisplayPreparedContentFramePresentationPreparation {
  const preparedContentFrame = prepareContentFrame?.(presentedRetainedFrame, {
    gpuNativeVisuals: presentedGpuNativeVisuals,
    viewport: liveProjectionSample.viewport,
  });
  return Object.freeze({
    preparedContentFrame,
    presentationPreparation: preparePreparedContentFramePresentationFramePlan({
      presentedGpuNativeVisuals,
      deferBrowserVisualWakeup,
      frameReasons,
      heldPreviousProjectionState,
      liveProjectionSample,
      contentWorkLane,
      preparedContentFrame,
      presentedRetainedFrame,
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
  prepareRetainedDisplayPresentationFramePlan,
  previousVisibleProjectionState,
  contentWorkLane,
  retainedDisplayPresentationInput,
}: GpuFlowRetainedPreparedContentFramePresentationContentStageInput<
  RetainedContext,
  Result
>): GpuFlowContentPreparationFrameResult | Result {
  const retainedDisplayPresentationPreparation =
    prepareRetainedDisplayPresentationFramePlan(
      retainedDisplayPresentationInput,
    );
  const retainedDisplayPresentation =
    retainedDisplayPresentationPreparation.presentation;
  const retainedDisplayFollowUpFrameReason =
    retainedDisplayPresentationPreparation.followUpFrameReason;
  return runGpuFlowRetainedDisplayPresentationContentStage({
    contentDecisionKernel,
    deferResolutionUpdates,
    onAccepted: (presentedRetainedDisplayOutcomeFrame) => {
      const retainedDisplayContent = onRetainedDisplayCandidateAccepted({
        presentedRetainedDisplayOutcomeFrame,
        retainedDisplayFollowUpFrameReason,
        retainedDisplayPresentation,
        retainedDisplayPresentationPreparation,
      });
      const preparedContentFramePreparation =
        prepareGpuFlowPreparedContentFramePresentationFramePlanForRetainedDisplay(
          {
            presentedGpuNativeVisuals:
              retainedDisplayContent.presentedGpuNativeVisuals,
            deferBrowserVisualWakeup,
            frameReasons,
            heldPreviousProjectionState: previousVisibleProjectionState,
            liveProjectionSample,
            prepareContentFrame,
            preparePreparedContentFramePresentationFramePlan,
            contentWorkLane,
            presentedRetainedFrame: presentedRetainedDisplayOutcomeFrame.frame,
          },
        );
      const preparedContentFramePresentationPreparation =
        preparedContentFramePreparation.presentationPreparation;
      onPreparedContentFrameCandidatePrepared?.({
        preparedContentFramePresentationPreparation,
        context: retainedDisplayContent.context,
        preparedContentFrame:
          preparedContentFramePreparation.preparedContentFrame,
        presentedRetainedDisplayOutcomeFrame,
        retainedDisplayFollowUpFrameReason,
        retainedDisplayPresentation,
        retainedDisplayPresentationPreparation,
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
            createVisibleProjectionStateForRetainedPresentation: (input) =>
              contentDecisionKernel.createVisibleProjectionStateForRetainedPresentation(
                {
                  frameReasons,
                  liveProjectionSample,
                  contentWorkLane,
                  preparedContentFrame: input.preparedContentFrame,
                },
              ),
            preparedContentFrame:
              preparedContentFramePreparation.preparedContentFrame,
            presentedRetainedDisplayOutcomeFrame,
            retainedDisplayFollowUpFrameReason,
            retainedDisplayPresentation,
            retainedDisplayPresentationPreparation,
          }),
        preparation: preparedContentFramePresentationPreparation,
        previousVisibleProjectionState,
        retainedDisplayFollowUpFrameReason,
      });
    },
    preparation: retainedDisplayPresentationPreparation,
    previousVisibleProjectionState,
  });
}

export function createGpuFlowRetainedPreparedContentFramePresentationContentStageRunner({
  contentDecisionKernel,
  preparePreparedContentFramePresentationFramePlan,
  prepareRetainedDisplayPresentationFramePlan,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly preparePreparedContentFramePresentationFramePlan: GpuFlowPreparedContentFramePresentationFramePlanPreparer;
  readonly prepareRetainedDisplayPresentationFramePlan: GpuFlowRetainedDisplayPresentationFramePlanPreparer;
}): GpuFlowRetainedPreparedContentFramePresentationContentStageRunner {
  return (input) =>
    runGpuFlowRetainedPreparedContentFramePresentationContentStage({
      ...input,
      contentDecisionKernel,
      preparePreparedContentFramePresentationFramePlan,
      prepareRetainedDisplayPresentationFramePlan,
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

function createGpuFlowContentPreparationFrameResultForRetainedDisplayPresentationPreparation({
  contentDecisionKernel,
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowRetainedDisplayPresentationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPreparationFrameResult | null {
  if (preparation.nodeLayerFrameResult === null) {
    return null;
  }
  return createGpuFlowContentPreparationFrameResultForNodeLayerFrame({
    contentDecisionKernel,
    deferResolutionUpdates,
    nodeLayerFrameResult: preparation.nodeLayerFrameResult,
    nodeLayerFrameStatePresentation: null,
    previousVisibleProjectionState,
    retainedDisplayFollowUpFrameReason: preparation.followUpFrameReason,
    retainedDisplayFrame: null,
    retainedRuntimeFrame: null,
  });
}

function createGpuFlowRetainedDisplayPresentationContentStage({
  contentDecisionKernel,
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowRetainedDisplayPresentationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowRetainedDisplayPresentationContentStage {
  const frameResult =
    createGpuFlowContentPreparationFrameResultForRetainedDisplayPresentationPreparation(
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
    kind: "presented",
    presentedOutcomeFrame: requireGpuFlowRetainedDisplayPresentedOutcomeFrame({
      preparation,
    }),
  };
}

function requireGpuFlowRetainedDisplayPresentedOutcomeFrame({
  preparation,
}: {
  readonly preparation: GpuFlowRetainedDisplayPresentationFramePlanPreparation;
}): NonNullable<
  GpuFlowRetainedDisplayPresentationFramePlanPreparation["presentedOutcomeFrame"]
> {
  if (preparation.presentedOutcomeFrame === null) {
    throw new Error(
      "GPU Flow retained display content plan must provide a presented outcome frame after candidate resolution.",
    );
  }
  return preparation.presentedOutcomeFrame;
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
    nodeLayerFrameStatePresentation: null,
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
    kind: "presented",
  };
}

function createGpuFlowContentPreparationFrameResultForVisibleProjectionState({
  preparedContentFramePresentation,
  contentDecisionKernel,
  deferResolutionUpdates,
  nodeLayerFrameStatePresentation,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  visibleProjectionState,
}: {
  readonly preparedContentFramePresentation: GpuFlowNodeLayerPreparedContentFramePresentationResult;
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly nodeLayerFrameStatePresentation: GpuFlowNodeLayerFrameStatePresentation | null;
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
    nodeLayerFrameStatePresentation,
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
  nodeLayerFrameStatePresentation,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly nodeLayerFrameStatePresentation: GpuFlowNodeLayerFrameStatePresentation | null;
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
      nodeLayerFrameStatePresentation,
      retainedDisplayFrame,
      retainedDisplayFollowUpFrameReason,
      retainedRuntimeFrame,
      visibleProjectionState,
    });
  }
  return createGpuFlowNotVisibleContentPreparationFrameResult({
    blockedPresentationCandidate,
    nodeLayerFrameResult,
    nodeLayerFrameStatePresentation,
    retainedDisplayFollowUpFrameReason,
    retainedRuntimeFrame,
  });
}

function createGpuFlowVisibleContentPreparationFrameResult({
  blockedPresentationCandidate,
  preparedContentFramePresentation,
  deferResolutionUpdates,
  nodeLayerFrameStatePresentation,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  visibleProjectionState,
}: {
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly preparedContentFramePresentation: GpuFlowNodeLayerFrameResult["preparedContentFramePresentation"];
  readonly deferResolutionUpdates: boolean;
  readonly nodeLayerFrameStatePresentation: GpuFlowNodeLayerFrameStatePresentation | null;
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
    nodeLayerFrameStatePresentation,
    presentationEvidence: createGpuFlowVisibleFramePresentationEvidence({
      nodeLayerFrameStatePresentation,
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
  nodeLayerFrameStatePresentation,
  retainedDisplayFollowUpFrameReason,
  retainedRuntimeFrame,
}: {
  readonly blockedPresentationCandidate: GpuFlowVisibleFrameBlockedPresentationCandidate | null;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly nodeLayerFrameStatePresentation: GpuFlowNodeLayerFrameStatePresentation | null;
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
    nodeLayerFrameStatePresentation,
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

export function createGpuFlowRetainedDisplayPresentationFramePlanPreparer({
  contentDecisionKernel,
  previousVisibleProjectionState,
  prepareRetainedDisplayPresentationCandidate,
}: {
  readonly contentDecisionKernel: GpuFlowVisibleFramePresentationContentDecisionKernel;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly prepareRetainedDisplayPresentationCandidate: GpuFlowRetainedDisplayPresentationPreparer;
}): GpuFlowRetainedDisplayPresentationFramePlanPreparer {
  return (input) => {
    const presentation = prepareRetainedDisplayPresentationCandidate(input);
    const framePlan =
      contentDecisionKernel.selectRetainedDisplayPresentationFramePlan({
        previousVisibleProjectionState,
        retainedDisplayOutcome: presentation.retainedDisplayOutcome,
      });
    const framePlanResult =
      contentDecisionKernel.resolveRetainedDisplayPresentationFramePlanResult({
        framePlan,
      });
    return Object.freeze({
      followUpFrameReason:
        framePlanResult.presentedOutcomeFrame === null
          ? null
          : selectGpuFlowRetainedDisplayFollowUpFrameReason({
              deferResolutionUpdates: input.deferResolutionUpdates,
              outcomeKind: framePlanResult.presentedOutcomeFrame.outcomeKind,
              trueHoleRectCount:
                framePlanResult.presentedOutcomeFrame.frame.diagnostics
                  ?.trueHoleRectCount ?? 0,
            }),
      framePlan,
      framePlanResult,
      nodeLayerFrameResult:
        resolveGpuFlowRetainedDisplayPresentationFramePlanNodeLayerResult({
          framePlanResult,
        }),
      presentation,
      presentedOutcomeFrame: framePlanResult.presentedOutcomeFrame,
    });
  };
}

function resolveGpuFlowRetainedDisplayPresentationFramePlanNodeLayerResult({
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
