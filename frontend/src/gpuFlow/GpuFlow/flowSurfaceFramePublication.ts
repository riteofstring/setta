import type { MutableRefObject } from "react";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowRuntime } from "../gpuDevice";
import { startGpuFlowPerformanceMeasure } from "../gpuFlowPerformanceMarks";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceProps } from "../GpuSurface";
import { getGpuWheelGestureOwnershipArbiter } from "../interactions/wheelOwnership";
import {
  applyGpuFlowProjectionDebugAttributes,
  createGpuFlowLiveProjectionSampler,
  createGpuFlowProjectionTransaction,
  createGpuFlowVisibleProjectionState,
  createGpuFlowVisiblePublicationScheduler,
  getGpuFlowVisiblePublicationDebtReason,
  hasGpuFlowVisiblePublicationDebt,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionLane,
  type GpuFlowVisibleProjectionState,
  type GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import { chooseZoomBucket } from "../textureResolution";
import { normalizeGpuViewport, type GpuViewportInput } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import {
  applyGpuFlowCommittedSurfacePublicationGateEffect,
  recordGpuFlowBlockedVisiblePublication,
  type GpuFlowCommittedSurfacePublicationGateEffect,
} from "./flowCommittedSurfacePublication";
import { renderGpuFlowNodeLayerFrame } from "./flowFrame";
import {
  updateGpuFlowNodeLayerFrameState,
  type GpuFlowNodeLayerFrameStatePublication,
} from "./flowFrameLifecycle";
import { renderGpuFlowNodeLayerProjectionFrame } from "./flowProjectionFrame";
import {
  createGpuFlowRetainedRuntimeFrameOverlayRenderSignature,
  createGpuFlowRetainedRuntimeFrameSourceRenderSignature,
} from "./flowRetainedRuntimeFrameSignatures";
import {
  getDelayedGpuFlowPublicationDebtRequestMs,
  scheduleDelayedGpuFlowPublicationDebtFrame,
} from "./flowSurfacePublicationDebtFrame";
import { createGpuFlowVisibleOverlayProjectionKey } from "./flowVisibleOverlayProjectionKey";
import { publishGpuFlowVisibleProjectionState } from "./flowVisibleProjectionStatePublication";
import { recordGpuFlowBlockedPublicationGuard } from "./flowVisiblePublicationBlockedGuard";
import { postGpuFlowVisiblePublicationOutcomeChromeReproEvent } from "./flowVisiblePublicationOutcomeChromeRepro";
import { assertGpuFlowSingleVisiblePublicationOutcome } from "./flowVisiblePublicationOutcomeGuard";
import { sampleGpuFlowRetainedContentRuntimeScene } from "./retainedContentRuntimeSceneSampling";
import type { GpuFlowColdStartShellFrame } from "./visibleFramePublicationAuthority";
import {
  createGpuFlowBrowserVisualBlockedPublicationCandidate,
  createGpuFlowRetainedProjectionBlockedPublicationCandidate,
  runGpuFlowVisibleFramePublicationKernel,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
  type GpuFlowVisibleFramePublicationKernelResult,
  type GpuFlowVisibleFramePublicationPreparedFrame,
  type GpuFlowVisiblePublicationOutcome,
} from "./visibleFramePublicationKernel";
import type {
  GpuFlowBlockedPublicationToken,
  GpuFlowCommitPublicationToken,
  GpuFlowHoldPreviousToken,
} from "./visibleFramePublicationTokens";

type GpuFlowNodeLayerFrameInput = Parameters<
  typeof renderGpuFlowNodeLayerFrame
>[0];
type GpuFlowSurfaceFrameEvent = Parameters<
  NonNullable<GpuSurfaceProps["onFrame"]>
>[1];

type GpuFlowContentPublicationFrameResult = {
  readonly blockedErrorMessage: string | null;
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null;
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly committedSurfacePublicationGateEffect: GpuFlowCommittedSurfacePublicationGateEffect | null;
  readonly forceImmediatePublicationDebtFrame: boolean;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly rendered: boolean;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

type GpuFlowMotionProjectionFrameResult = {
  readonly blockedProjectionReason: string | null;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly rendered: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

type GpuFlowSurfacePublicationPreparedFrame =
  GpuFlowVisibleFramePublicationPreparedFrame & {
    readonly contentPublicationFrame: GpuFlowContentPublicationFrameResult;
    readonly motionProjectionFrame: GpuFlowMotionProjectionFrameResult;
  };

type RenderGpuFlowSurfaceFrameInput = Omit<
  GpuFlowNodeLayerFrameInput,
  | "deferResolutionUpdates"
  | "deferBrowserVisualRetry"
  | "frameReasons"
  | "heldPreviousProjectionState"
  | "liveProjectionSample"
  | "onBlockedSurfacePublication"
  | "onCommittedSurfaceFramePublishable"
  | "onCommittedSurfacePublicationGateEffect"
  | "onNodeLayerFrameStatePublishable"
  | "onPreparedCommittedSurfaceFrameBlocked"
  | "onPreparedCommittedSurfaceFrameHeld"
  | "onRetainedDisplayFrame"
  | "onRetainedDisplayFramePublishable"
  | "onRetainedDisplayFollowUpFrameNeeded"
  | "onRetainedProjectionPublicationBlocked"
  | "onRetainedPreparedRuntimeFrame"
  | "onRetainedRuntimeFrame"
  | "publicationLane"
  | "viewportFrame"
> & {
  readonly abortPreparedCommittedSurfaceFrame: (
    token: GpuFlowBlockedPublicationToken | GpuFlowHoldPreviousToken,
    frame: GpuFlowCommittedSurfaceFrame,
    options?:
      | {
          readonly preservePreparationSnapshot?: boolean | undefined;
        }
      | undefined,
  ) => void;
  readonly committedSurfaceFrameRef: MutableRefObject<GpuFlowCommittedSurfaceFrame | null>;
  readonly event: GpuFlowSurfaceFrameEvent;
  readonly initialRetainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly liveProjectionSamplerRef: MutableRefObject<
    ReturnType<typeof createGpuFlowLiveProjectionSampler>
  >;
  readonly commitPreparedCommittedSurfaceFrame: (
    token: GpuFlowCommitPublicationToken,
    frame: GpuFlowCommittedSurfaceFrame,
  ) => boolean;
  readonly prepareCommittedSurfaceFrame: NonNullable<
    GpuFlowNodeLayerFrameInput["onRetainedDisplayFrame"]
  >;
  readonly projectCommittedBrowserVisualActors: (
    token: GpuFlowCommitPublicationToken,
    viewport?: GpuViewportInput | undefined,
  ) => void;
  readonly publishColdStartShellFrame: (publication: {
    readonly frame: GpuFlowColdStartShellFrame | null;
    readonly token:
      | GpuFlowBlockedPublicationToken
      | GpuFlowCommitPublicationToken
      | GpuFlowHoldPreviousToken;
  }) => void;
  readonly retainedPreparationRuntimeFrameRenderSignatureRef: MutableRefObject<
    string | null
  >;
  readonly retainedPreparationRuntimeFrameScrollRevisionRef: MutableRefObject<
    number | null
  >;
  readonly retainedRuntimeFrameRenderSignatureRef: MutableRefObject<
    string | null
  >;
  readonly retainedRuntimeFrameSourceRenderSignatureRef: MutableRefObject<
    string | null
  >;
  readonly runtime: GpuFlowRuntime;
  readonly visibleCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame;
  readonly visibleOverlayProjectionKeyRef: MutableRefObject<string | null>;
  readonly visibleProjectionStateRef: MutableRefObject<GpuFlowVisibleProjectionState | null>;
  readonly visiblePublicationSchedulerRef: MutableRefObject<
    ReturnType<typeof createGpuFlowVisiblePublicationScheduler>
  >;
  readonly viewportRuntime: GpuFlowViewportRuntime;
};

export function renderGpuFlowSurfaceFrame({
  event,
  nodeLayerRef,
  retainedContentRuntimeState,
  runtime,
  viewportRuntime,
  viewportStore,
  ...input
}: RenderGpuFlowSurfaceFrameInput) {
  const frameMeasureDetail: Record<
    string,
    boolean | number | string | null | undefined
  > = {
    frame: input.frameRef.current,
    reasons: event.reasons.join("+") || "none",
  };
  const finishFrameMeasure = startGpuFlowPerformanceMeasure(
    "surface-frame",
    frameMeasureDetail,
  );
  try {
    const finishSetupMeasure = startGpuFlowPerformanceMeasure(
      "surface-frame-setup",
      frameMeasureDetail,
    );
    const runtimeFrame = viewportRuntime.runFrame(event.timestamp);
    nodeLayerRef.current = {
      ...nodeLayerRef.current,
      viewport: viewportRuntime.getViewportTuple(),
    };
    sampleGpuFlowRetainedContentRuntimeScene({
      nodeLayerRef,
      retainedContentRuntimeState,
    });
    const viewportInteractionActive =
      viewportStore.getState().viewportInteractionActive;
    const liveProjectionSample = input.liveProjectionSamplerRef.current.capture(
      {
        canvasSize: input.canvasSizeRef.current,
        gestureOwner:
          getGpuWheelGestureOwnershipArbiter(viewportStore).getState().owner,
        retainedContentRuntimeState,
        timestamp: event.timestamp,
        viewport: nodeLayerRef.current.viewport,
      },
    );
    const previousVisibleProjectionState =
      input.visibleProjectionStateRef.current;
    let finishCompletionMeasure: () => number = () => 0;
    runGpuFlowVisibleFramePublicationKernel({
      hasCommittedContentFrame: input.retainedDisplayFrameRef.current !== null,
      prepare: (publicationDecision) => {
        frameMeasureDetail.lane = publicationDecision.lane;
        frameMeasureDetail.schedulerState = publicationDecision.schedulerState;
        const viewportFrame = isGpuFlowViewportFrame({
          reasons: event.reasons,
          runtimeViewportFrame: runtimeFrame.viewportFrame,
        });
        frameMeasureDetail.viewportFrame = viewportFrame;
        const deferResolutionUpdates = shouldDeferGpuFlowResolutionUpdates({
          lane: publicationDecision.lane,
          schedulerState: publicationDecision.schedulerState,
          viewportFrame,
          viewportInteractionActive,
        });
        frameMeasureDetail.deferResolutionUpdates = deferResolutionUpdates;
        finishSetupMeasure();
        const finishMotionMeasure = startGpuFlowPerformanceMeasure(
          "surface-frame-motion-projection",
          frameMeasureDetail,
        );
        const motionProjectionFrame = renderGpuFlowSurfaceMotionProjectionFrame(
          {
            ...input,
            event,
            liveProjectionSample,
            nodeLayerRef,
            publicationDecision,
            retainedContentRuntimeState,
            runtime,
            viewportFrame,
            viewportStore,
          },
        );
        finishMotionMeasure();
        frameMeasureDetail.motionRendered = motionProjectionFrame.rendered;
        const finishContentMeasure = startGpuFlowPerformanceMeasure(
          "surface-frame-content-publication",
          frameMeasureDetail,
        );
        const contentPublicationFrame =
          renderGpuFlowSurfaceContentPublicationFrame({
            ...input,
            deferResolutionUpdates,
            event,
            liveProjectionSample,
            nodeLayerRef,
            publicationDecision,
            renderedProjectionOnlyFrame: motionProjectionFrame.rendered,
            retainedContentRuntimeState,
            runtime,
            viewportFrame,
            viewportStore,
          });
        finishContentMeasure();
        frameMeasureDetail.contentRendered = contentPublicationFrame.rendered;
        finishCompletionMeasure = startGpuFlowPerformanceMeasure(
          "surface-frame-completion",
          frameMeasureDetail,
        );
        const selectedVisibleProjectionState =
          selectGpuFlowSurfaceVisibleProjectionState({
            contentPublicationFrame,
            motionProjectionFrame,
          });
        return {
          blockedPublicationToken: null,
          blockedPublicationCandidate:
            contentPublicationFrame.blockedPublicationCandidate ??
            createGpuFlowMotionProjectionBlockedPublicationCandidate({
              blockedProjectionReason:
                motionProjectionFrame.blockedProjectionReason,
              heldPreviousProjectionState:
                input.visibleProjectionStateRef.current,
            }),
          contentPublicationFrame,
          motionProjectionFrame,
          renderedVisibleFrame: selectedVisibleProjectionState !== null,
          visibleProjectionState: selectedVisibleProjectionState,
        };
      },
      previousVisibleProjectionState,
      publish: (transaction) => {
        completeGpuFlowSurfacePublicationFrame({
          abortPreparedCommittedSurfaceFrame:
            input.abortPreparedCommittedSurfaceFrame,
          callbacksRef: input.callbacksRef,
          commitPreparedCommittedSurfaceFrame:
            input.commitPreparedCommittedSurfaceFrame,
          projectCommittedBrowserVisualActors:
            input.projectCommittedBrowserVisualActors,
          publicationTransaction: transaction,
          publishColdStartShellFrame: input.publishColdStartShellFrame,
          retainedDisplayFrameRef: input.retainedDisplayFrameRef,
          retainedRuntimeFrameRenderSignatureRef:
            input.retainedRuntimeFrameRenderSignatureRef,
          retainedRuntimeFrameSourceRenderSignatureRef:
            input.retainedRuntimeFrameSourceRenderSignatureRef,
          runtimeCanvas: runtime.canvas,
          surfaceRef: input.surfaceRef,
          viewportRuntime,
          visibleOverlayProjectionKeyRef: input.visibleOverlayProjectionKeyRef,
          visibleProjectionStateRef: input.visibleProjectionStateRef,
          visiblePublicationSchedulerRef: input.visiblePublicationSchedulerRef,
        });
      },
      rawReasons: event.reasons,
      sample: liveProjectionSample,
      scheduler: input.visiblePublicationSchedulerRef.current,
      timestamp: event.timestamp,
      viewportInteractionActive,
    });
    finishCompletionMeasure();
    const visibleProjectionState = input.visibleProjectionStateRef.current;
    input.callbacksRef.current.onFrame?.(runtime, event);
    return {
      visibleProjectionState,
    };
  } finally {
    finishFrameMeasure();
  }
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

function selectGpuFlowSurfaceVisibleProjectionState({
  contentPublicationFrame,
  motionProjectionFrame,
}: {
  readonly contentPublicationFrame: GpuFlowContentPublicationFrameResult;
  readonly motionProjectionFrame: GpuFlowMotionProjectionFrameResult;
}): GpuFlowVisibleProjectionState | null {
  return (
    contentPublicationFrame.visibleProjectionState ??
    motionProjectionFrame.visibleProjectionState
  );
}

function isGpuFlowViewportFrame({
  reasons,
  runtimeViewportFrame,
}: {
  readonly reasons: readonly GpuFrameReason[];
  readonly runtimeViewportFrame: boolean;
}): boolean {
  return reasons.includes("viewport") || runtimeViewportFrame;
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

function renderGpuFlowSurfaceMotionProjectionFrame({
  committedSurfaceFrameRef,
  event,
  liveProjectionSample,
  nodeLayerRef,
  publicationDecision,
  runtime,
  visibleCommittedSurfaceFrame,
  viewportFrame,
  viewportStore,
  ...input
}: Omit<
  RenderGpuFlowSurfaceFrameInput,
  "initialRetainedRuntimeFrame" | "viewportRuntime"
> & {
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly viewportFrame: boolean;
}): GpuFlowMotionProjectionFrameResult {
  if (publicationDecision.lane !== "motion") {
    return createGpuFlowMotionProjectionFrameResult({ rendered: false });
  }
  const committedFrame =
    committedSurfaceFrameRef.current ?? visibleCommittedSurfaceFrame;
  const projectionTransaction = createGpuFlowProjectionTransaction({
    committedFrame,
    kind: "motion-projection",
    lane: "motion",
    rawReasons: event.reasons,
    sample: liveProjectionSample,
  });
  let nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null =
    null;
  const rendered = renderGpuFlowNodeLayerProjectionFrame({
    activeResizeNodeIdRef: input.activeResizeNodeIdRef,
    callbacksRef: input.callbacksRef,
    canvasSizeRef: input.canvasSizeRef,
    frameReasons: event.reasons,
    frameRef: input.frameRef,
    interactionDiagnosticsRef: input.interactionDiagnosticsRef,
    nodeElementByIdRef: input.nodeElementByIdRef,
    nodeDomTransformSyncCacheRef: input.nodeDomTransformSyncCacheRef,
    nodeInteractionRef: input.nodeInteractionRef,
    nodeLayerRef,
    projectionTransaction,
    projectionSchedulerKnobs:
      input.visiblePublicationSchedulerRef.current.getKnobs(),
    heldPreviousProjectionState: input.visibleProjectionStateRef.current,
    htmlSurfaceRendererRef: input.htmlSurfaceRendererRef,
    retainedContentPageManagerRef: input.retainedContentPageManagerRef,
    retainedDisplayFrameRef: input.retainedDisplayFrameRef,
    runtime,
    surfaceRef: input.surfaceRef,
    textureManagerRef: input.textureManagerRef,
    transformOnlyPaintNodeIdsRef: input.transformOnlyPaintNodeIdsRef,
    visibleNodeIdsRef: input.visibleNodeIdsRef,
    viewportStore,
    viewportFrame,
    onNodeLayerFrameStatePublishable: (publication) => {
      nodeLayerFrameStatePublication = publication;
    },
  });
  if (!rendered.rendered) {
    return createGpuFlowMotionProjectionFrameResult({
      blockedProjectionReason: rendered.blockedProjectionReason,
      rendered: false,
    });
  }
  const visibleCommittedFrame =
    rendered.transaction.kind === "held-previous"
      ? input.visibleProjectionStateRef.current?.committedFrame ??
        committedFrame
      : committedFrame;
  return createGpuFlowMotionProjectionFrameResult({
    nodeLayerFrameStatePublication,
    rendered: true,
    visibleProjectionState: createGpuFlowVisibleProjectionState({
      committedFrame: visibleCommittedFrame,
      heldPreviousProjection: rendered.heldPreviousProjection,
      transaction: rendered.transaction,
    }),
  });
}

function createGpuFlowMotionProjectionFrameResult({
  blockedProjectionReason = null,
  nodeLayerFrameStatePublication = null,
  rendered,
  visibleProjectionState = null,
}: {
  readonly blockedProjectionReason?: string | null | undefined;
  readonly nodeLayerFrameStatePublication?:
    | GpuFlowNodeLayerFrameStatePublication
    | null
    | undefined;
  readonly rendered: boolean;
  readonly visibleProjectionState?:
    | GpuFlowVisibleProjectionState
    | null
    | undefined;
}): GpuFlowMotionProjectionFrameResult {
  return {
    blockedProjectionReason,
    nodeLayerFrameStatePublication,
    rendered,
    visibleProjectionState,
  };
}

function renderGpuFlowSurfaceContentPublicationFrame({
  deferResolutionUpdates,
  event,
  liveProjectionSample,
  nodeLayerRef,
  publicationDecision,
  renderedProjectionOnlyFrame,
  retainedContentRuntimeState,
  retainedPreparationRuntimeFrameRenderSignatureRef,
  retainedPreparationRuntimeFrameScrollRevisionRef,
  runtime,
  viewportFrame,
  viewportStore,
  ...input
}: Omit<RenderGpuFlowSurfaceFrameInput, "viewportRuntime"> & {
  readonly deferResolutionUpdates: boolean;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly renderedProjectionOnlyFrame: boolean;
  readonly viewportFrame: boolean;
}): GpuFlowContentPublicationFrameResult {
  if (
    !shouldPublishGpuFlowContentFrame(
      publicationDecision,
      renderedProjectionOnlyFrame,
    )
  ) {
    return createGpuFlowContentPublicationFrameResult({ rendered: false });
  }
  if (
    shouldSkipDeferredGpuFlowContentPublication({
      deferResolutionUpdates,
      liveProjectionSample,
      nodeLayerRef,
      publicationDecision,
      retainedContentFrameCacheRef: input.retainedContentFrameCacheRef,
      retainedDisplayFrameRef: input.retainedDisplayFrameRef,
      retainedPreparationRuntimeFrameRenderSignatureRef,
      retainedRuntimeFrameSourceRenderSignatureRef:
        input.retainedRuntimeFrameSourceRenderSignatureRef,
    })
  ) {
    return createGpuFlowContentPublicationFrameResult({ rendered: false });
  }
  let blockedPublicationCandidate: GpuFlowVisibleFrameBlockedPublicationCandidate | null =
    null;
  let blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null =
    null;
  let blockedErrorMessage: string | null = null;
  let blockedPreservePreparationSnapshot = false;
  let committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null = null;
  let committedSurfacePublicationGateEffect: GpuFlowCommittedSurfacePublicationGateEffect | null =
    null;
  let heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null =
    null;
  let nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null =
    null;
  let retainedDisplayFrame: RetainedDisplayFrame | null = null;
  let retainedDisplayFollowUpFrameReason: GpuFrameReason | null = null;
  let retainedRuntimeFrame: GpuRetainedRuntimeFrame | null = null;
  const visibleProjectionState = renderGpuFlowNodeLayerFrame({
    activeResizeNodeIdRef: input.activeResizeNodeIdRef,
    callbacksRef: input.callbacksRef,
    canvasSizeRef: input.canvasSizeRef,
    deferResolutionUpdates,
    deferBrowserVisualRetry: shouldDeferGpuFlowBrowserVisualRetry({
      deferResolutionUpdates,
      publicationDecision,
    }),
    frameReasons: event.reasons,
    frameRef: input.frameRef,
    interactionDiagnosticsRef: input.interactionDiagnosticsRef,
    nodeElementByIdRef: input.nodeElementByIdRef,
    nodeDomTransformSyncCacheRef: input.nodeDomTransformSyncCacheRef,
    nodeInteractionRef: input.nodeInteractionRef,
    nodeLayerRef,
    htmlSurfaceRendererRef: input.htmlSurfaceRendererRef,
    retainedContentPageManagerRef: input.retainedContentPageManagerRef,
    retainedContentFrameCacheRef: input.retainedContentFrameCacheRef,
    retainedContentRuntimeState,
    retainedDisplayFrameRef: input.retainedDisplayFrameRef,
    retainedContentSwitchAnimations: input.retainedContentSwitchAnimations,
    heldPreviousProjectionState: input.visibleProjectionStateRef.current,
    liveProjectionSample,
    publicationLane: getGpuFlowContentPublicationLane(publicationDecision.lane),
    runtime,
    surfaceRef: input.surfaceRef,
    textureManagerRef: input.textureManagerRef,
    transformOnlyPaintNodeIdsRef: input.transformOnlyPaintNodeIdsRef,
    visibleNodeIdsRef: input.visibleNodeIdsRef,
    viewportStore,
    viewportFrame,
    onRetainedPreparedRuntimeFrame: (nextRetainedRuntimeFrame) => {
      const nextSignature =
        createGpuFlowRetainedRuntimeFrameSourceRenderSignature(
          nextRetainedRuntimeFrame,
        );
      if (
        retainedPreparationRuntimeFrameRenderSignatureRef.current ===
        nextSignature
      ) {
        return;
      }
      retainedPreparationRuntimeFrameRenderSignatureRef.current = nextSignature;
      retainedPreparationRuntimeFrameScrollRevisionRef.current =
        nextRetainedRuntimeFrame.input.scrollRevision;
    },
    onCommittedSurfaceFramePublishable: (frame) => {
      committedSurfaceFrame = frame;
    },
    onCommittedSurfacePublicationGateEffect: (effect) => {
      committedSurfacePublicationGateEffect = effect;
    },
    onBlockedSurfacePublication: (publication) => {
      blockedPublicationCandidate = publication.blockedPublicationCandidate;
      blockedPreparedCommittedSurfaceFrame = publication.candidateFrame;
      blockedErrorMessage = publication.errorMessage;
      blockedPreservePreparationSnapshot =
        publication.preservePreparationSnapshot;
    },
    onRetainedProjectionPublicationBlocked: (blockedReason) => {
      blockedPublicationCandidate =
        createGpuFlowRetainedProjectionBlockedPublicationCandidate({
          blockedReason,
          heldPreviousProjectionState: input.visibleProjectionStateRef.current,
        });
    },
    onPreparedCommittedSurfaceFrameHeld: (frame) => {
      heldPreparedCommittedSurfaceFrame = frame;
    },
    onNodeLayerFrameStatePublishable: (publication) => {
      nodeLayerFrameStatePublication = publication;
    },
    onRetainedDisplayFrame: input.prepareCommittedSurfaceFrame,
    onRetainedDisplayFramePublishable: (frame) => {
      retainedDisplayFrame = frame;
    },
    onRetainedDisplayFollowUpFrameNeeded: (reason) => {
      retainedDisplayFollowUpFrameReason = reason;
    },
    onRetainedRuntimeFrame: (nextRetainedRuntimeFrame) => {
      retainedRuntimeFrame = nextRetainedRuntimeFrame;
    },
  });
  if (visibleProjectionState) {
    const heldPrevious =
      visibleProjectionState.transaction.kind === "held-previous";
    return createGpuFlowContentPublicationFrameResult({
      blockedPublicationCandidate:
        createGpuFlowHeldCommittedSurfaceBlockedPublicationCandidate({
          committedSurfacePublicationGateEffect,
          heldPreviousProjectionState: input.visibleProjectionStateRef.current,
        }),
      committedSurfaceFrame,
      committedSurfacePublicationGateEffect,
      forceImmediatePublicationDebtFrame:
        heldPrevious && !deferResolutionUpdates,
      heldPreparedCommittedSurfaceFrame,
      nodeLayerFrameStatePublication,
      rendered: deferResolutionUpdates || !heldPrevious,
      retainedDisplayFrame,
      retainedDisplayFollowUpFrameReason,
      retainedRuntimeFrame,
      visibleProjectionState,
    });
  }
  return createGpuFlowContentPublicationFrameResult({
    blockedErrorMessage,
    blockedPreparedCommittedSurfaceFrame,
    blockedPreservePreparationSnapshot,
    blockedPublicationCandidate,
    committedSurfaceFrame,
    committedSurfacePublicationGateEffect,
    heldPreparedCommittedSurfaceFrame,
    nodeLayerFrameStatePublication,
    rendered: false,
    retainedRuntimeFrame,
    retainedDisplayFollowUpFrameReason,
  });
}

function createGpuFlowHeldCommittedSurfaceBlockedPublicationCandidate({
  committedSurfacePublicationGateEffect,
  heldPreviousProjectionState,
}: {
  readonly committedSurfacePublicationGateEffect: GpuFlowCommittedSurfacePublicationGateEffect | null;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameBlockedPublicationCandidate | null {
  if (committedSurfacePublicationGateEffect?.kind !== "held-previous") {
    return null;
  }
  return createGpuFlowBrowserVisualBlockedPublicationCandidate({
    frame: committedSurfacePublicationGateEffect.candidateFrame,
    heldPreviousProjectionState,
  });
}

function createGpuFlowContentPublicationFrameResult({
  blockedErrorMessage = null,
  blockedPreparedCommittedSurfaceFrame = null,
  blockedPreservePreparationSnapshot = false,
  blockedPublicationCandidate = null,
  committedSurfaceFrame = null,
  committedSurfacePublicationGateEffect = null,
  forceImmediatePublicationDebtFrame = false,
  heldPreparedCommittedSurfaceFrame = null,
  nodeLayerFrameStatePublication = null,
  rendered,
  retainedDisplayFrame = null,
  retainedDisplayFollowUpFrameReason = null,
  retainedRuntimeFrame = null,
  visibleProjectionState = null,
}: {
  readonly blockedErrorMessage?: string | null | undefined;
  readonly blockedPreparedCommittedSurfaceFrame?:
    | GpuFlowCommittedSurfaceFrame
    | null
    | undefined;
  readonly blockedPreservePreparationSnapshot?: boolean | undefined;
  readonly blockedPublicationCandidate?:
    | GpuFlowVisibleFrameBlockedPublicationCandidate
    | null
    | undefined;
  readonly committedSurfaceFrame?:
    | GpuFlowCommittedSurfaceFrame
    | null
    | undefined;
  readonly committedSurfacePublicationGateEffect?:
    | GpuFlowCommittedSurfacePublicationGateEffect
    | null
    | undefined;
  readonly forceImmediatePublicationDebtFrame?: boolean | undefined;
  readonly heldPreparedCommittedSurfaceFrame?:
    | GpuFlowCommittedSurfaceFrame
    | null
    | undefined;
  readonly nodeLayerFrameStatePublication?:
    | GpuFlowNodeLayerFrameStatePublication
    | null
    | undefined;
  readonly rendered: boolean;
  readonly retainedDisplayFrame?: RetainedDisplayFrame | null | undefined;
  readonly retainedDisplayFollowUpFrameReason?:
    | GpuFrameReason
    | null
    | undefined;
  readonly retainedRuntimeFrame?: GpuRetainedRuntimeFrame | null | undefined;
  readonly visibleProjectionState?:
    | GpuFlowVisibleProjectionState
    | null
    | undefined;
}): GpuFlowContentPublicationFrameResult {
  return {
    blockedErrorMessage,
    blockedPreparedCommittedSurfaceFrame,
    blockedPreservePreparationSnapshot,
    blockedPublicationCandidate,
    committedSurfaceFrame,
    committedSurfacePublicationGateEffect,
    forceImmediatePublicationDebtFrame,
    heldPreparedCommittedSurfaceFrame,
    nodeLayerFrameStatePublication,
    rendered,
    retainedDisplayFrame,
    retainedDisplayFollowUpFrameReason,
    retainedRuntimeFrame,
    visibleProjectionState,
  };
}

function shouldPublishGpuFlowContentFrame(
  publicationDecision: GpuFlowVisiblePublicationDecision,
  renderedProjectionOnlyFrame: boolean,
): boolean {
  return !renderedProjectionOnlyFrame && publicationDecision.lane !== "idle";
}

function shouldSkipDeferredGpuFlowContentPublication({
  deferResolutionUpdates,
  liveProjectionSample,
  nodeLayerRef,
  publicationDecision,
  retainedContentFrameCacheRef,
  retainedDisplayFrameRef,
  retainedPreparationRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly nodeLayerRef: RenderGpuFlowSurfaceFrameInput["nodeLayerRef"];
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly retainedContentFrameCacheRef: RenderGpuFlowSurfaceFrameInput["retainedContentFrameCacheRef"];
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly retainedPreparationRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedPreparationRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
}): boolean {
  if (
    !deferResolutionUpdates ||
    publicationDecision.schedulerState !== "motion-settling" ||
    publicationDecision.lane === "motion" ||
    retainedDisplayFrameRef.current === null
  ) {
    return false;
  }
  const preparedFrame = retainedContentFrameCacheRef.current;
  if (!preparedFrame) {
    return false;
  }
  if (
    hasUnpublishedGpuFlowRetainedRuntimeSourceFrame({
      retainedPreparationRuntimeFrameRenderSignatureRef,
      retainedRuntimeFrameSourceRenderSignatureRef,
    })
  ) {
    return false;
  }
  const targetZoomBucket = chooseZoomBucket(
    normalizeGpuViewport(liveProjectionSample.viewport).zoom,
  );
  return (
    preparedFrame.sceneRevision ===
      (nodeLayerRef.current.scene?.revision ?? 0) &&
    preparedFrame.viewportZoomBucket === targetZoomBucket
  );
}

function hasUnpublishedGpuFlowRetainedRuntimeSourceFrame({
  retainedPreparationRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
}: {
  readonly retainedPreparationRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedPreparationRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
}): boolean {
  const preparedSourceSignature =
    retainedPreparationRuntimeFrameRenderSignatureRef.current;
  return (
    preparedSourceSignature !== null &&
    preparedSourceSignature !== retainedRuntimeFrameSourceRenderSignatureRef.current
  );
}

function shouldDeferGpuFlowBrowserVisualRetry({
  deferResolutionUpdates,
  publicationDecision,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}): boolean {
  return (
    deferResolutionUpdates ||
    (publicationDecision.schedulerState === "motion-active" &&
      publicationDecision.lane !== "motion")
  );
}

function getGpuFlowContentPublicationLane(
  lane: GpuFlowVisiblePublicationDecision["lane"],
): Extract<GpuFlowProjectionLane, "content" | "maintenance"> {
  return lane === "maintenance" ? "maintenance" : "content";
}

function completeGpuFlowSurfacePublicationFrame({
  abortPreparedCommittedSurfaceFrame,
  callbacksRef,
  commitPreparedCommittedSurfaceFrame,
  projectCommittedBrowserVisualActors,
  publicationTransaction,
  publishColdStartShellFrame,
  retainedDisplayFrameRef,
  retainedRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
  runtimeCanvas,
  surfaceRef,
  viewportRuntime,
  visibleOverlayProjectionKeyRef,
  visibleProjectionStateRef,
  visiblePublicationSchedulerRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly commitPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["commitPreparedCommittedSurfaceFrame"];
  readonly projectCommittedBrowserVisualActors: RenderGpuFlowSurfaceFrameInput["projectCommittedBrowserVisualActors"];
  readonly publicationTransaction: GpuFlowVisibleFramePublicationKernelResult<GpuFlowSurfacePublicationPreparedFrame>;
  readonly publishColdStartShellFrame: RenderGpuFlowSurfaceFrameInput["publishColdStartShellFrame"];
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly retainedRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly visibleOverlayProjectionKeyRef: RenderGpuFlowSurfaceFrameInput["visibleOverlayProjectionKeyRef"];
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
  readonly visiblePublicationSchedulerRef: RenderGpuFlowSurfaceFrameInput["visiblePublicationSchedulerRef"];
}) {
  const {
    completion,
    outcome,
    preparedFrame: {
      contentPublicationFrame: {
        blockedErrorMessage,
        blockedPreparedCommittedSurfaceFrame,
        blockedPreservePreparationSnapshot,
        committedSurfaceFrame,
        committedSurfacePublicationGateEffect,
        forceImmediatePublicationDebtFrame,
        heldPreparedCommittedSurfaceFrame,
        nodeLayerFrameStatePublication: contentNodeLayerFrameStatePublication,
        retainedDisplayFrame,
        retainedDisplayFollowUpFrameReason,
        retainedRuntimeFrame,
      },
      motionProjectionFrame: {
        nodeLayerFrameStatePublication: motionNodeLayerFrameStatePublication,
      },
      visibleProjectionState: selectedVisibleProjectionState,
    },
    publicationDecision,
  } = publicationTransaction;
  const nodeLayerFrameStatePublication =
    contentNodeLayerFrameStatePublication ??
    motionNodeLayerFrameStatePublication;
  assertGpuFlowSingleVisiblePublicationOutcome({
    outcome,
    publicationDecision,
    surface: surfaceRef.current,
  });
  publishGpuFlowSurfaceVisibleProjectionState({
    abortPreparedCommittedSurfaceFrame,
    callbacksRef,
    committedSurfaceFrame,
    committedSurfacePublicationGateEffect,
    commitPreparedCommittedSurfaceFrame,
    blockedErrorMessage,
    blockedPreparedCommittedSurfaceFrame,
    blockedPreservePreparationSnapshot,
    heldPreparedCommittedSurfaceFrame,
    nodeLayerFrameStatePublication,
    outcome,
    projectCommittedBrowserVisualActors,
    retainedDisplayFrame,
    retainedDisplayFrameRef,
    retainedRuntimeFrame,
    retainedRuntimeFrameRenderSignatureRef,
    retainedRuntimeFrameSourceRenderSignatureRef,
    runtimeCanvas,
    selectedVisibleProjectionState,
    surfaceRef,
    viewportRuntime,
    visibleOverlayProjectionKeyRef,
    visibleProjectionStateRef,
  });
  publishGpuFlowColdStartShellFrame({
    outcome,
    publishColdStartShellFrame,
  });
  postGpuFlowVisiblePublicationOutcomeChromeReproEvent({
    completion,
    outcome,
    publicationDecision,
    previousCommittedFrameId: publicationTransaction.previousCommittedFrameId,
    visibleProjectionState: selectedVisibleProjectionState,
  });
  recordGpuFlowBlockedPublicationGuard({
    outcome,
    publicationDecision,
    surface: surfaceRef.current,
  });
  if (retainedDisplayFollowUpFrameReason) {
    surfaceRef.current?.requestFrame(retainedDisplayFollowUpFrameReason);
  }
  if (hasGpuFlowVisiblePublicationDebt(completion.debt)) {
    const frameReason = getGpuFlowSurfacePublicationDebtFrameReason({
      completion,
      outcome,
    });
    const delayedDebtRequestMs = getDelayedGpuFlowPublicationDebtRequestMs({
      publicationDecision,
      schedulerMotionSettleWindowMs:
        visiblePublicationSchedulerRef.current.getKnobs().motionSettleWindowMs,
    });
    if (
      !forceImmediatePublicationDebtFrame &&
      !shouldRequestGpuFlowSurfacePublicationDebtFrameImmediately(outcome) &&
      delayedDebtRequestMs !== null &&
      scheduleDelayedGpuFlowPublicationDebtFrame({
        delayMs: delayedDebtRequestMs,
        frameReason,
        surfaceRef,
      })
    ) {
      return;
    }
    surfaceRef.current?.requestFrame(frameReason);
  }
}

function publishGpuFlowColdStartShellFrame({
  outcome,
  publishColdStartShellFrame,
}: {
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly publishColdStartShellFrame: RenderGpuFlowSurfaceFrameInput["publishColdStartShellFrame"];
}): void {
  publishColdStartShellFrame({
    frame:
      outcome.kind === "blocked" &&
      outcome.token.frozenFrame.kind === "cold-start-shell"
        ? outcome.token.frozenFrame.frame
        : null,
    token: outcome.token,
  });
}

function getGpuFlowSurfacePublicationDebtFrameReason({
  completion,
  outcome,
}: {
  readonly completion: GpuFlowVisibleFramePublicationKernelResult<GpuFlowSurfacePublicationPreparedFrame>["completion"];
  readonly outcome: GpuFlowVisiblePublicationOutcome;
}): GpuFrameReason {
  if (isGpuFlowRetainedProjectionBlockedOutcome(outcome)) {
    return "texture-upload";
  }
  return getGpuFlowVisiblePublicationDebtReason(completion.debt);
}

function shouldRequestGpuFlowSurfacePublicationDebtFrameImmediately(
  outcome: GpuFlowVisiblePublicationOutcome,
): boolean {
  return isGpuFlowRetainedProjectionBlockedOutcome(outcome);
}

function isGpuFlowRetainedProjectionBlockedOutcome(
  outcome: GpuFlowVisiblePublicationOutcome,
): boolean {
  return (
    outcome.kind === "blocked" &&
    outcome.token.blockedReasons.some(
      (reason) => reason.family === "retained-projection",
    )
  );
}

function publishGpuFlowSurfaceVisibleProjectionState({
  abortPreparedCommittedSurfaceFrame,
  blockedErrorMessage,
  blockedPreparedCommittedSurfaceFrame,
  blockedPreservePreparationSnapshot,
  callbacksRef,
  committedSurfaceFrame,
  committedSurfacePublicationGateEffect,
  commitPreparedCommittedSurfaceFrame,
  heldPreparedCommittedSurfaceFrame,
  nodeLayerFrameStatePublication,
  outcome,
  projectCommittedBrowserVisualActors,
  retainedDisplayFrame,
  retainedDisplayFrameRef,
  retainedRuntimeFrame,
  retainedRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
  runtimeCanvas,
  selectedVisibleProjectionState,
  surfaceRef,
  viewportRuntime,
  visibleOverlayProjectionKeyRef,
  visibleProjectionStateRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly committedSurfacePublicationGateEffect: GpuFlowCommittedSurfacePublicationGateEffect | null;
  readonly commitPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["commitPreparedCommittedSurfaceFrame"];
  readonly blockedErrorMessage: string | null;
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly projectCommittedBrowserVisualActors: RenderGpuFlowSurfaceFrameInput["projectCommittedBrowserVisualActors"];
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly retainedRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly visibleOverlayProjectionKeyRef: RenderGpuFlowSurfaceFrameInput["visibleOverlayProjectionKeyRef"];
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): void {
  switch (outcome.kind) {
    case "commit":
      publishGpuFlowCommittedSurfaceVisibleProjectionState({
        callbacksRef,
        committedSurfaceFrame,
        committedSurfacePublicationGateEffect,
        commitPreparedCommittedSurfaceFrame,
        nodeLayerFrameStatePublication,
        outcome,
        projectCommittedBrowserVisualActors,
        retainedDisplayFrame,
        retainedDisplayFrameRef,
        retainedRuntimeFrame,
        retainedRuntimeFrameRenderSignatureRef,
        retainedRuntimeFrameSourceRenderSignatureRef,
        runtimeCanvas,
        selectedVisibleProjectionState,
        surfaceRef,
        viewportRuntime,
        visibleOverlayProjectionKeyRef,
        visibleProjectionStateRef,
      });
      return;
    case "hold-previous":
      publishGpuFlowHeldPreviousSurfaceVisibleProjectionState({
        abortPreparedCommittedSurfaceFrame,
        heldPreparedCommittedSurfaceFrame,
        nodeLayerFrameStatePublication,
        committedSurfacePublicationGateEffect,
        outcome,
        retainedDisplayFrame,
        retainedDisplayFrameRef,
        runtimeCanvas,
        selectedVisibleProjectionState,
        surfaceRef,
        viewportRuntime,
        visibleOverlayProjectionKeyRef,
        visibleProjectionStateRef,
      });
      return;
    case "blocked":
      publishGpuFlowBlockedSurfaceVisibleProjectionState({
        abortPreparedCommittedSurfaceFrame,
        blockedErrorMessage,
        blockedPreparedCommittedSurfaceFrame:
          resolveGpuFlowBlockedPreparedCommittedSurfaceFrame({
            blockedPreparedCommittedSurfaceFrame,
            committedSurfaceFrame,
            heldPreparedCommittedSurfaceFrame,
            outcome,
            selectedVisibleProjectionState,
          }),
        blockedPreservePreparationSnapshot:
          resolveGpuFlowBlockedPreparedCommittedSurfaceFramePreservation({
            blockedPreparedCommittedSurfaceFrame,
            blockedPreservePreparationSnapshot,
            heldPreparedCommittedSurfaceFrame,
            outcome,
            selectedVisibleProjectionState,
          }),
        committedSurfacePublicationGateEffect,
        outcome,
        runtimeCanvas,
        surfaceRef,
      });
      return;
  }
}

function resolveGpuFlowBlockedPreparedCommittedSurfaceFrame({
  blockedPreparedCommittedSurfaceFrame,
  committedSurfaceFrame,
  heldPreparedCommittedSurfaceFrame,
  outcome,
  selectedVisibleProjectionState,
}: {
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowCommittedSurfaceFrame | null {
  if (blockedPreparedCommittedSurfaceFrame) {
    return blockedPreparedCommittedSurfaceFrame;
  }
  if (
    !isGpuFlowBlockedHeldPreviousPublicationOutcomeForVisibleState({
      outcome,
      selectedVisibleProjectionState,
    })
  ) {
    return null;
  }
  return heldPreparedCommittedSurfaceFrame ?? committedSurfaceFrame;
}

function resolveGpuFlowBlockedPreparedCommittedSurfaceFramePreservation({
  blockedPreparedCommittedSurfaceFrame,
  blockedPreservePreparationSnapshot,
  heldPreparedCommittedSurfaceFrame,
  outcome,
  selectedVisibleProjectionState,
}: {
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): boolean {
  if (blockedPreparedCommittedSurfaceFrame) {
    return blockedPreservePreparationSnapshot;
  }
  if (
    heldPreparedCommittedSurfaceFrame &&
    isGpuFlowBlockedHeldPreviousPublicationOutcomeForVisibleState({
      outcome,
      selectedVisibleProjectionState,
    })
  ) {
    return true;
  }
  return false;
}

function isGpuFlowBlockedHeldPreviousPublicationOutcomeForVisibleState({
  outcome,
  selectedVisibleProjectionState,
}: {
  readonly outcome: GpuFlowVisiblePublicationOutcome;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
}): boolean {
  return (
    outcome.kind === "blocked" &&
    selectedVisibleProjectionState?.transaction.kind === "held-previous"
  );
}

function publishGpuFlowCommittedSurfaceVisibleProjectionState({
  callbacksRef,
  committedSurfaceFrame,
  committedSurfacePublicationGateEffect,
  commitPreparedCommittedSurfaceFrame,
  nodeLayerFrameStatePublication,
  outcome,
  projectCommittedBrowserVisualActors,
  retainedDisplayFrame,
  retainedDisplayFrameRef,
  retainedRuntimeFrame,
  retainedRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
  runtimeCanvas,
  selectedVisibleProjectionState,
  surfaceRef,
  viewportRuntime,
  visibleOverlayProjectionKeyRef,
  visibleProjectionStateRef,
}: {
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly committedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly committedSurfacePublicationGateEffect: GpuFlowCommittedSurfacePublicationGateEffect | null;
  readonly commitPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["commitPreparedCommittedSurfaceFrame"];
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly outcome: Extract<
    GpuFlowVisiblePublicationOutcome,
    { readonly kind: "commit" }
  >;
  readonly projectCommittedBrowserVisualActors: RenderGpuFlowSurfaceFrameInput["projectCommittedBrowserVisualActors"];
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly retainedRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly visibleOverlayProjectionKeyRef: RenderGpuFlowSurfaceFrameInput["visibleOverlayProjectionKeyRef"];
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): void {
  if (!selectedVisibleProjectionState) {
    throw new Error(
      "GPU Flow visible publication commit requires selected visible projection state.",
    );
  }
  if (
    selectedVisibleProjectionState.transaction.kind === "content-publication" &&
    !committedSurfaceFrame
  ) {
    throw new Error(
      "GPU Flow content publication commit requires the prepared committed surface frame.",
    );
  }
  if (committedSurfaceFrame) {
    commitPreparedCommittedSurfaceFrame(outcome.token, committedSurfaceFrame);
  }
  publishGpuFlowRetainedDisplayFrame({
    retainedDisplayFrame,
    retainedDisplayFrameRef,
    token: outcome.token,
  });
  applyGpuFlowCommittedSurfacePublicationGateEffect({
    effect: committedSurfacePublicationGateEffect,
    runtimeCanvas,
    surfaceRef,
    token: outcome.token,
  });
  applyGpuFlowProjectionDebugAttributes({
    canvas: runtimeCanvas,
    debugState: selectedVisibleProjectionState.debugState,
    token: outcome.token,
  });
  projectCommittedBrowserVisualActors(
    outcome.token,
    selectedVisibleProjectionState.sample.viewport,
  );
  publishGpuFlowVisibleProjectionState({
    commitPublicationToken: outcome.token,
    holdPreviousToken: null,
    visibleProjectionState: selectedVisibleProjectionState,
    visibleProjectionStateRef,
  });
  publishGpuFlowVisibleOverlayProjectionTransform({
    viewportRuntime,
    visibleOverlayProjectionKeyRef,
    visibleProjectionState: selectedVisibleProjectionState,
  });
  publishGpuFlowNodeLayerFrameState({
    nodeLayerFrameStatePublication,
    token: outcome.token,
  });
  publishGpuFlowRetainedRuntimeFrame({
    callbacksRef,
    retainedRuntimeFrame,
    retainedRuntimeFrameRenderSignatureRef,
    retainedRuntimeFrameSourceRenderSignatureRef,
  });
}

function publishGpuFlowHeldPreviousSurfaceVisibleProjectionState({
  abortPreparedCommittedSurfaceFrame,
  committedSurfacePublicationGateEffect,
  heldPreparedCommittedSurfaceFrame,
  nodeLayerFrameStatePublication,
  outcome,
  retainedDisplayFrame,
  retainedDisplayFrameRef,
  runtimeCanvas,
  selectedVisibleProjectionState,
  surfaceRef,
  viewportRuntime,
  visibleOverlayProjectionKeyRef,
  visibleProjectionStateRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly committedSurfacePublicationGateEffect: GpuFlowCommittedSurfacePublicationGateEffect | null;
  readonly heldPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly outcome: Extract<
    GpuFlowVisiblePublicationOutcome,
    { readonly kind: "hold-previous" }
  >;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly selectedVisibleProjectionState: GpuFlowVisibleProjectionState | null;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly visibleOverlayProjectionKeyRef: RenderGpuFlowSurfaceFrameInput["visibleOverlayProjectionKeyRef"];
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
}): void {
  if (!selectedVisibleProjectionState) {
    return;
  }
  publishGpuFlowRetainedDisplayFrame({
    retainedDisplayFrame,
    retainedDisplayFrameRef,
    token: outcome.token,
  });
  applyGpuFlowCommittedSurfacePublicationGateEffect({
    effect: committedSurfacePublicationGateEffect,
    runtimeCanvas,
    surfaceRef,
    token: outcome.token,
  });
  if (heldPreparedCommittedSurfaceFrame) {
    abortPreparedCommittedSurfaceFrame(
      outcome.token,
      heldPreparedCommittedSurfaceFrame,
      {
        preservePreparationSnapshot: true,
      },
    );
  }
  publishGpuFlowVisibleProjectionState({
    commitPublicationToken: null,
    holdPreviousToken: outcome.token,
    visibleProjectionState: selectedVisibleProjectionState,
    visibleProjectionStateRef,
  });
  publishGpuFlowVisibleOverlayProjectionTransform({
    viewportRuntime,
    visibleOverlayProjectionKeyRef,
    visibleProjectionState: selectedVisibleProjectionState,
  });
  publishGpuFlowNodeLayerFrameState({
    nodeLayerFrameStatePublication,
    token: outcome.token,
  });
  applyGpuFlowProjectionDebugAttributes({
    canvas: runtimeCanvas,
    debugState: selectedVisibleProjectionState.debugState,
    token: outcome.token,
  });
}

function publishGpuFlowNodeLayerFrameState(publication: {
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly token: GpuFlowCommitPublicationToken | GpuFlowHoldPreviousToken;
}): void {
  const { nodeLayerFrameStatePublication } = publication;
  if (nodeLayerFrameStatePublication === null) {
    return;
  }
  updateGpuFlowNodeLayerFrameState(nodeLayerFrameStatePublication);
}

function publishGpuFlowVisibleOverlayProjectionTransform({
  viewportRuntime,
  visibleOverlayProjectionKeyRef,
  visibleProjectionState,
}: {
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly visibleOverlayProjectionKeyRef: RenderGpuFlowSurfaceFrameInput["visibleOverlayProjectionKeyRef"];
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): void {
  const overlayProjectionKey = createGpuFlowVisibleOverlayProjectionKey(
    visibleProjectionState,
  );
  if (visibleOverlayProjectionKeyRef.current === overlayProjectionKey) {
    return;
  }
  visibleOverlayProjectionKeyRef.current = overlayProjectionKey;
  viewportRuntime.applyOverlayTransforms(
    visibleProjectionState.sample.viewport,
  );
}

function publishGpuFlowRetainedDisplayFrame(publication: {
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly token: GpuFlowCommitPublicationToken | GpuFlowHoldPreviousToken;
}): void {
  const { retainedDisplayFrame, retainedDisplayFrameRef } = publication;
  if (retainedDisplayFrame === null) {
    return;
  }
  retainedDisplayFrameRef.current = retainedDisplayFrame;
}

function publishGpuFlowBlockedSurfaceVisibleProjectionState({
  abortPreparedCommittedSurfaceFrame,
  blockedErrorMessage,
  blockedPreparedCommittedSurfaceFrame,
  blockedPreservePreparationSnapshot,
  committedSurfacePublicationGateEffect,
  outcome,
  runtimeCanvas,
  surfaceRef,
}: {
  readonly abortPreparedCommittedSurfaceFrame: RenderGpuFlowSurfaceFrameInput["abortPreparedCommittedSurfaceFrame"];
  readonly blockedErrorMessage: string | null;
  readonly blockedPreparedCommittedSurfaceFrame: GpuFlowCommittedSurfaceFrame | null;
  readonly blockedPreservePreparationSnapshot: boolean;
  readonly committedSurfacePublicationGateEffect: GpuFlowCommittedSurfacePublicationGateEffect | null;
  readonly outcome: Extract<
    GpuFlowVisiblePublicationOutcome,
    { readonly kind: "blocked" }
  >;
  readonly runtimeCanvas: HTMLCanvasElement;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
}): void {
  if (blockedPreparedCommittedSurfaceFrame) {
    abortPreparedCommittedSurfaceFrame(
      outcome.token,
      blockedPreparedCommittedSurfaceFrame,
      {
        preservePreparationSnapshot: blockedPreservePreparationSnapshot,
      },
    );
  }
  applyGpuFlowCommittedSurfacePublicationGateEffect({
    effect: committedSurfacePublicationGateEffect,
    runtimeCanvas,
    surfaceRef,
    token: outcome.token,
  });
  recordGpuFlowBlockedVisiblePublication({
    frame: blockedPreparedCommittedSurfaceFrame,
    runtimeCanvas,
    token: outcome.token,
  });
  if (blockedErrorMessage) {
    throw new Error(blockedErrorMessage);
  }
}

function publishGpuFlowRetainedRuntimeFrame({
  callbacksRef,
  retainedRuntimeFrame,
  retainedRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
}: {
  readonly callbacksRef: RenderGpuFlowSurfaceFrameInput["callbacksRef"];
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly retainedRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
}): void {
  if (retainedRuntimeFrame === null) {
    return;
  }
  callbacksRef.current.onRetainedRuntimeFrame?.(retainedRuntimeFrame);
  retainedRuntimeFrameSourceRenderSignatureRef.current =
    createGpuFlowRetainedRuntimeFrameSourceRenderSignature(
      retainedRuntimeFrame,
    );
  const nextSignature =
    createGpuFlowRetainedRuntimeFrameOverlayRenderSignature(
      retainedRuntimeFrame,
    );
  if (retainedRuntimeFrameRenderSignatureRef.current === nextSignature) {
    return;
  }
  retainedRuntimeFrameRenderSignatureRef.current = nextSignature;
}
