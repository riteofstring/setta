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
import type { GpuViewportInput } from "../viewportMath";
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
  type GpuFlowCommittedSurfacePublicationFramePlan,
  type GpuFlowCommittedSurfacePublicationFramePlanResult,
  type GpuFlowRetainedDisplayOutcomeFrameResult,
  type GpuFlowRetainedDisplayPublicationFramePlan,
  type GpuFlowVisiblePublicationContentDecisionKernel,
} from "./visibleFrameActorAdapters/contentDecisionKernel";
import {
  createGpuFlowVisiblePublicationPresentationEvidence,
  type GpuFlowVisiblePublicationPresentationEvidence,
} from "./visibleFramePresentationEvidence";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowBlockedVisibleReason,
} from "./visibleFramePresentationProofs";

export type GpuFlowCommittedSurfaceBlockedCandidateResourceWork = {
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
  readonly wakeupSource: "blocked-publication";
};

export type GpuFlowBrowserVisualResourceWorkRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type GpuFlowVisibleFrameBlockedPublicationCandidate = {
  readonly blockedReasons: readonly GpuFlowBlockedVisibleReason[];
  readonly frozenFrameId: GpuFlowBlockedPublicationToken["frozenFrameId"];
};

export type GpuFlowContentPublicationFrameResult = {
  readonly blockedErrorMessage: string | null;
  readonly blockedPreparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreparedContentFrameResourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly forceImmediatePublicationDebtFrame: boolean;
  readonly heldPreparedContentFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly presentationEvidence: GpuFlowVisiblePublicationPresentationEvidence | null;
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
  blockedPreparedContentFrame: null,
  blockedPreparedContentFrameResourceWork: null,
  blockedPreservePreparationSnapshot: false,
  blockedPublicationCandidate: null,
  committedSurfaceFrame: null,
  forceImmediatePublicationDebtFrame: false,
  heldPreparedContentFrame: null,
  nodeLayerFrameStatePublication: null,
  presentationEvidence: null,
  retainedDisplayFrame: null,
  retainedDisplayFollowUpFrameReason: null,
  retainedRuntimeFrame: null,
  visibleProjectionState: null,
} satisfies Omit<GpuFlowContentPublicationFrameResult, "rendered">);

export type GpuFlowCommittedSurfacePublicationCandidate =
  | {
      readonly kind: "publish";
    }
  | {
      readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate;
      readonly candidateFrame: GpuFlowCommittedSurfaceFrame;
      readonly errorMessage: string | null;
      readonly kind: "nonpublishable";
      readonly preservePreparationSnapshot: boolean;
      readonly resourceWork: GpuFlowCommittedSurfaceBlockedCandidateResourceWork;
    };

export type GpuFlowCommittedSurfacePublicationCandidateInput = {
  readonly committedGpuNativeVisuals:
    | readonly HtmlSurfaceSolidRoundedRectVisual[]
    | undefined;
  readonly deferBrowserVisualWakeup?: boolean | undefined;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly preparedContentFrame: GpuFlowCommittedSurfaceFrame | void;
  readonly publishedRetainedFrame: RetainedDisplayFrame;
};

export type GpuFlowCommittedSurfacePublicationCandidatePreparer = (
  input: GpuFlowCommittedSurfacePublicationCandidateInput,
) => GpuFlowCommittedSurfacePublicationCandidate;

export type GpuFlowCommittedSurfacePublicationFramePlanPreparation = {
  readonly candidate: GpuFlowCommittedSurfacePublicationCandidate;
  readonly preparedContentFramePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
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
        readonly viewport?: GpuViewportInput | undefined;
      }
    | undefined,
) => GpuFlowCommittedSurfaceFrame | void;

export type GpuFlowPreparedCommittedSurfacePublicationFramePlan = {
  readonly preparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
  readonly publicationPreparation: GpuFlowCommittedSurfacePublicationFramePlanPreparation;
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
      readonly preparedContentFramePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
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
  readonly contentDecisionKernel: GpuFlowVisiblePublicationContentDecisionKernel;
  readonly deferBrowserVisualWakeup: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly onCommittedSurfaceCandidatePrepared?: (input: {
    readonly preparedContentFramePublicationPreparation: GpuFlowCommittedSurfacePublicationFramePlanPreparation;
    readonly context: RetainedContext;
    readonly preparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
    readonly publishedRetainedDisplayOutcomeFrame: NonNullable<
      GpuFlowRetainedDisplayPublicationFramePlanPreparation["publishedOutcomeFrame"]
    >;
    readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
    readonly retainedDisplayPublication: GpuFlowRetainedDisplayPublicationResult;
    readonly retainedDisplayPublicationPreparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  }) => void;
  readonly onCommittedSurfaceCandidateAccepted: (input: {
    readonly preparedContentFramePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
    readonly preparedContentFramePublicationPreparation: GpuFlowCommittedSurfacePublicationFramePlanPreparation;
    readonly context: RetainedContext;
    readonly createContentPublicationFrameResultForVisibleProjectionState: GpuFlowContentPublicationFrameResultForVisibleProjectionStatePreparer;
    readonly createVisibleProjectionStateForRetainedPublication: GpuFlowRetainedPublicationVisibleProjectionStatePreparer;
    readonly preparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | void;
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
    | "contentDecisionKernel"
  >,
) => GpuFlowContentPublicationFrameResult | Result;

export type GpuFlowRetainedPublicationVisibleProjectionStatePreparer = (input: {
  readonly preparedContentFrame: GpuFlowCommittedSurfaceFrame | void;
}) => GpuFlowVisibleProjectionState;

export type GpuFlowContentPublicationFrameResultForVisibleProjectionStatePreparer =
  (input: {
    readonly preparedContentFramePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
    readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
    readonly retainedDisplayFrame: RetainedDisplayFrame | null;
    readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
    readonly visibleProjectionState: GpuFlowVisibleProjectionState;
  }) => GpuFlowContentPublicationFrameResult;

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
}): GpuFlowContentPublicationFrameResult | Result {
  if (contentStage.kind === "blocked") {
    return contentStage.blockedFrameResult;
  }
  return onAccepted(contentStage.publishedOutcomeFrame);
}

function applyGpuFlowCommittedSurfacePublicationContentStage<Result>({
  contentStage,
  onAccepted,
}: {
  readonly contentStage: GpuFlowCommittedSurfacePublicationContentStage;
  readonly onAccepted: (
    preparedContentFramePublication: Extract<
      GpuFlowCommittedSurfacePublicationContentStage,
      { readonly kind: "published" }
    >["preparedContentFramePublication"],
  ) => Result;
}): GpuFlowContentPublicationFrameResult | Result {
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
  readonly contentDecisionKernel: GpuFlowVisiblePublicationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly onAccepted: (
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
      contentDecisionKernel,
      deferResolutionUpdates,
      preparation,
      previousVisibleProjectionState,
    }),
    onAccepted,
  });
}

function runGpuFlowCommittedSurfacePublicationContentStage<Result>({
  contentDecisionKernel,
  deferResolutionUpdates,
  onAccepted,
  preparation,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
}: {
  readonly contentDecisionKernel: GpuFlowVisiblePublicationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly onAccepted: (
    preparedContentFramePublication: Extract<
      GpuFlowCommittedSurfacePublicationContentStage,
      { readonly kind: "published" }
    >["preparedContentFramePublication"],
  ) => Result;
  readonly preparation: GpuFlowCommittedSurfacePublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
}): GpuFlowContentPublicationFrameResult | Result {
  return applyGpuFlowCommittedSurfacePublicationContentStage({
    contentStage: createGpuFlowCommittedSurfacePublicationContentStage({
      contentDecisionKernel,
      deferResolutionUpdates,
      preparation,
      previousVisibleProjectionState,
      retainedDisplayFollowUpFrameReason,
    }),
    onAccepted,
  });
}

function prepareGpuFlowCommittedSurfacePublicationFramePlanForRetainedDisplay({
  committedGpuNativeVisuals,
  deferBrowserVisualWakeup,
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
  readonly deferBrowserVisualWakeup: boolean;
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
      viewport: liveProjectionSample.viewport,
    },
  );
  return Object.freeze({
    preparedCommittedSurfaceFrame,
    publicationPreparation: prepareCommittedSurfacePublicationFramePlan({
      committedGpuNativeVisuals,
      deferBrowserVisualWakeup,
      frameReasons,
      heldPreviousProjectionState,
      liveProjectionSample,
      publicationLane,
      preparedContentFrame: preparedCommittedSurfaceFrame,
      publishedRetainedFrame,
    }),
  });
}

export function runGpuFlowRetainedCommittedSurfacePublicationContentStage<
  RetainedContext,
  Result,
>({
  contentDecisionKernel,
  deferBrowserVisualWakeup,
  deferResolutionUpdates,
  frameReasons,
  liveProjectionSample,
  onCommittedSurfaceCandidatePrepared,
  onCommittedSurfaceCandidateAccepted,
  onRetainedDisplayCandidateAccepted,
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
    contentDecisionKernel,
    deferResolutionUpdates,
    onAccepted: (publishedRetainedDisplayOutcomeFrame) => {
      const retainedDisplayContent = onRetainedDisplayCandidateAccepted({
        publishedRetainedDisplayOutcomeFrame,
        retainedDisplayFollowUpFrameReason,
        retainedDisplayPublication,
        retainedDisplayPublicationPreparation,
      });
      const committedSurfacePreparation =
        prepareGpuFlowCommittedSurfacePublicationFramePlanForRetainedDisplay({
          committedGpuNativeVisuals:
            retainedDisplayContent.committedGpuNativeVisuals,
          deferBrowserVisualWakeup,
          frameReasons,
          heldPreviousProjectionState: previousVisibleProjectionState,
          liveProjectionSample,
          prepareCommittedSurfaceFrame,
          prepareCommittedSurfacePublicationFramePlan,
          publicationLane,
          publishedRetainedFrame: publishedRetainedDisplayOutcomeFrame.frame,
        });
      const preparedContentFramePublicationPreparation =
        committedSurfacePreparation.publicationPreparation;
      onCommittedSurfaceCandidatePrepared?.({
        preparedContentFramePublicationPreparation,
        context: retainedDisplayContent.context,
        preparedCommittedSurfaceFrame:
          committedSurfacePreparation.preparedCommittedSurfaceFrame,
        publishedRetainedDisplayOutcomeFrame,
        retainedDisplayFollowUpFrameReason,
        retainedDisplayPublication,
        retainedDisplayPublicationPreparation,
      });
      return runGpuFlowCommittedSurfacePublicationContentStage({
        contentDecisionKernel,
        deferResolutionUpdates,
        onAccepted: (preparedContentFramePublication) =>
          onCommittedSurfaceCandidateAccepted({
            preparedContentFramePublication,
            preparedContentFramePublicationPreparation,
            context: retainedDisplayContent.context,
            createContentPublicationFrameResultForVisibleProjectionState: (
              input,
            ) =>
              createGpuFlowContentPublicationFrameResultForVisibleProjectionState(
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
                  publicationLane,
                  preparedContentFrame: input.preparedContentFrame,
                },
              ),
            preparedCommittedSurfaceFrame:
              committedSurfacePreparation.preparedCommittedSurfaceFrame,
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

export function createGpuFlowRetainedCommittedSurfacePublicationContentStageRunner({
  contentDecisionKernel,
  prepareCommittedSurfacePublicationFramePlan,
  prepareRetainedDisplayPublicationFramePlan,
}: {
  readonly contentDecisionKernel: GpuFlowVisiblePublicationContentDecisionKernel;
  readonly prepareCommittedSurfacePublicationFramePlan: GpuFlowCommittedSurfacePublicationFramePlanPreparer;
  readonly prepareRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanPreparer;
}): GpuFlowRetainedCommittedSurfacePublicationContentStageRunner {
  return (input) =>
    runGpuFlowRetainedCommittedSurfacePublicationContentStage({
      ...input,
      contentDecisionKernel,
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

function createGpuFlowContentPublicationFrameResultForRetainedDisplayPublicationPreparation({
  contentDecisionKernel,
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
}: {
  readonly contentDecisionKernel: GpuFlowVisiblePublicationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowContentPublicationFrameResult | null {
  if (preparation.nodeLayerFrameResult === null) {
    return null;
  }
  return createGpuFlowContentPublicationFrameResultForNodeLayerFrame({
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
  readonly contentDecisionKernel: GpuFlowVisiblePublicationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowRetainedDisplayPublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowRetainedDisplayPublicationContentStage {
  const frameResult =
    createGpuFlowContentPublicationFrameResultForRetainedDisplayPublicationPreparation(
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

function createGpuFlowContentPublicationFrameResultForCommittedSurfacePublicationPreparation({
  contentDecisionKernel,
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
}: {
  readonly contentDecisionKernel: GpuFlowVisiblePublicationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowCommittedSurfacePublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
}): GpuFlowContentPublicationFrameResult | null {
  if (preparation.nodeLayerFrameResult === null) {
    return null;
  }
  return createGpuFlowContentPublicationFrameResultForNodeLayerFrame({
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

function createGpuFlowCommittedSurfacePublicationContentStage({
  contentDecisionKernel,
  deferResolutionUpdates,
  preparation,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
}: {
  readonly contentDecisionKernel: GpuFlowVisiblePublicationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly preparation: GpuFlowCommittedSurfacePublicationFramePlanPreparation;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
}): GpuFlowCommittedSurfacePublicationContentStage {
  const frameResult =
    createGpuFlowContentPublicationFrameResultForCommittedSurfacePublicationPreparation(
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

function createGpuFlowContentPublicationFrameResultForVisibleProjectionState({
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
  readonly preparedContentFramePublication: GpuFlowNodeLayerCommittedSurfacePublicationResult;
  readonly contentDecisionKernel: GpuFlowVisiblePublicationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowContentPublicationFrameResult {
  return createGpuFlowContentPublicationFrameResultForNodeLayerFrame({
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

function createGpuFlowContentPublicationFrameResultForNodeLayerFrame({
  contentDecisionKernel,
  deferResolutionUpdates,
  nodeLayerFrameResult,
  nodeLayerFrameStatePublication,
  previousVisibleProjectionState,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
}: {
  readonly contentDecisionKernel: GpuFlowVisiblePublicationContentDecisionKernel;
  readonly deferResolutionUpdates: boolean;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
}): GpuFlowContentPublicationFrameResult {
  const preparedContentFramePublication =
    nodeLayerFrameResult.preparedContentFramePublication;
  const blockedPublicationCandidate =
    contentDecisionKernel.selectContentPublicationBlockedCandidateForFrameResult(
      {
        nodeLayerFrameResult,
        previousVisibleProjectionState,
      },
    );
  const visibleProjectionState = nodeLayerFrameResult.visibleProjectionState;
  if (visibleProjectionState) {
    return createGpuFlowVisibleContentPublicationFrameResult({
      blockedPublicationCandidate,
      preparedContentFramePublication,
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
  preparedContentFramePublication,
  deferResolutionUpdates,
  nodeLayerFrameStatePublication,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  visibleProjectionState,
}: {
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly preparedContentFramePublication: GpuFlowNodeLayerFrameResult["preparedContentFramePublication"];
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
    committedSurfaceFrame:
      preparedContentFramePublication.committedSurfaceFrame,
    forceImmediatePublicationDebtFrame: heldPrevious && !deferResolutionUpdates,
    heldPreparedContentFrame:
      preparedContentFramePublication.heldPreparedContentFrame,
    nodeLayerFrameStatePublication,
    presentationEvidence: createGpuFlowVisiblePublicationPresentationEvidence({
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
  const preparedContentFramePublication =
    nodeLayerFrameResult.preparedContentFramePublication;
  const blockedSurfacePublication =
    preparedContentFramePublication.blockedSurfacePublication;
  return createGpuFlowContentPublicationFrameResult({
    blockedErrorMessage: blockedSurfacePublication?.errorMessage ?? null,
    blockedPreparedContentFrame:
      blockedSurfacePublication?.candidateFrame ?? null,
    blockedPreparedContentFrameResourceWork:
      blockedSurfacePublication?.resourceWork ?? null,
    blockedPreservePreparationSnapshot:
      blockedSurfacePublication?.preservePreparationSnapshot ?? false,
    blockedPublicationCandidate,
    committedSurfaceFrame:
      preparedContentFramePublication.committedSurfaceFrame,
    heldPreparedContentFrame:
      preparedContentFramePublication.heldPreparedContentFrame,
    nodeLayerFrameStatePublication,
    rendered: false,
    retainedRuntimeFrame,
    retainedDisplayFollowUpFrameReason,
  });
}

export function createGpuFlowCommittedSurfacePublicationFramePlanPreparer({
  contentDecisionKernel,
  prepareCommittedSurfacePublicationCandidate = contentDecisionKernel.prepareCommittedSurfacePublicationCandidate,
}: {
  readonly contentDecisionKernel: GpuFlowVisiblePublicationContentDecisionKernel;
  readonly prepareCommittedSurfacePublicationCandidate?: GpuFlowCommittedSurfacePublicationCandidatePreparer;
}): GpuFlowCommittedSurfacePublicationFramePlanPreparer {
  return (input) => {
    const candidate = prepareCommittedSurfacePublicationCandidate(input);
    const framePlan =
      contentDecisionKernel.selectCommittedSurfacePublicationFramePlan({
        candidate,
        preparedContentFrame: input.preparedContentFrame,
      });
    const framePlanResult =
      contentDecisionKernel.resolveCommittedSurfacePublicationFramePlanResult({
        framePlan,
      });
    return Object.freeze({
      candidate,
      preparedContentFramePublication:
        framePlanResult.preparedContentFramePublication,
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

function resolveGpuFlowCommittedSurfacePublicationFramePlanNodeLayerResult({
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
  prepareRetainedDisplayPublicationCandidate,
}: {
  readonly contentDecisionKernel: GpuFlowVisiblePublicationContentDecisionKernel;
  readonly previousVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly prepareRetainedDisplayPublicationCandidate: GpuFlowRetainedDisplayPublicationPreparer;
}): GpuFlowRetainedDisplayPublicationFramePlanPreparer {
  return (input) => {
    const publication = prepareRetainedDisplayPublicationCandidate(input);
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
  if (!framePlanResult.blockedPublicationCandidate) {
    return null;
  }
  return createGpuFlowNodeLayerFrameNotRenderedResult({
    blockedPublicationCandidate: framePlanResult.blockedPublicationCandidate,
  });
}
