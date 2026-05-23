import type { MutableRefObject } from "react";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowRuntime } from "../gpuDevice";
import { startGpuFlowPerformanceMeasure } from "../gpuFlowPerformanceMarks";
import type { GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceProps } from "../GpuSurface";
import { getGpuWheelGestureOwnershipArbiter } from "../interactions/wheelOwnership";
import {
  createGpuFlowLiveProjectionSampler,
  createGpuFlowProjectionTransaction,
  createGpuFlowVisibleProjectionState,
  createGpuFlowVisiblePublicationScheduler,
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
import { completeGpuFlowSurfacePublicationFrame } from "./flowSurfacePublicationCompletion";
import { renderGpuFlowNodeLayerFrame } from "./flowFrame";
import type { GpuFlowNodeLayerFrameStatePublication } from "./flowFrameLifecycle";
import type { GpuFlowNodeLayerFrameResult } from "./flowFrameResult";
import {
  renderGpuFlowNodeLayerProjectionFrame,
  resolveGpuFlowProjectionFrameTransactionFromPublicationDecision,
  resolveGpuFlowRetainedProjectionFrame,
} from "./flowProjectionFrame";
import { createGpuFlowRetainedRuntimeFrameSourceRenderSignature } from "./flowRetainedRuntimeFrameSignatures";
import { sampleGpuFlowRetainedContentRuntimeScene } from "./retainedContentRuntimeSceneSampling";
import type { GpuFlowColdStartShellFrame } from "./visibleFramePublicationAuthority";
import {
  createGpuFlowBrowserVisualBlockedPublicationCandidate,
  createGpuFlowRetainedProjectionBlockedPublicationCandidate,
  decideGpuFlowRetainedProjectionPublicationTransaction,
  hasActiveGpuFlowRetainedDomControlPublicationProof,
  prepareGpuFlowCommittedSurfacePublicationCandidate,
  prepareGpuFlowRetainedDisplayPublicationCandidate,
  runGpuFlowVisibleFramePublicationCandidateSetKernel,
  type GpuFlowCommittedSurfacePublicationEffect,
  type GpuFlowVisibleFrameBlockedPublicationCandidate,
  type GpuFlowVisibleFramePublicationPreparedCandidateSetFrame,
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

type GpuFlowMotionProjectionFrameResult = {
  readonly blockedProjectionReason: string | null;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly rendered: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
};

export type GpuFlowSurfacePublicationPreparedFrame =
  GpuFlowVisibleFramePublicationPreparedCandidateSetFrame<
    GpuFlowContentPublicationFrameResult,
    GpuFlowMotionProjectionFrameResult
  >;

export type RenderGpuFlowSurfaceFrameInput = Omit<
  GpuFlowNodeLayerFrameInput,
  | "deferResolutionUpdates"
  | "deferBrowserVisualRetry"
  | "frameReasons"
  | "heldPreviousProjectionState"
  | "liveProjectionSample"
  | "onNodeLayerFrameStatePublishable"
  | "onRetainedDisplayFrame"
  | "onRetainedDisplayFramePublishable"
  | "onRetainedDisplayFollowUpFrameNeeded"
  | "onRetainedPreparedRuntimeFrame"
  | "onRetainedRuntimeFrame"
  | "prepareCommittedSurfacePublicationCandidate"
  | "prepareRetainedDisplayPublicationCandidate"
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
    runGpuFlowVisibleFramePublicationCandidateSetKernel({
      hasCommittedContentFrame: input.retainedDisplayFrameRef.current !== null,
      prepareMotionProjectionFrame: ({
        publicationDecision,
        publicationFrameContext,
      }) => {
        frameMeasureDetail.lane = publicationDecision.lane;
        frameMeasureDetail.schedulerState = publicationDecision.schedulerState;
        frameMeasureDetail.viewportFrame = publicationFrameContext.viewportFrame;
        frameMeasureDetail.deferResolutionUpdates =
          publicationFrameContext.deferResolutionUpdates;
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
            viewportFrame: publicationFrameContext.viewportFrame,
            viewportStore,
          },
        );
        finishMotionMeasure();
        frameMeasureDetail.motionRendered = motionProjectionFrame.rendered;
        return motionProjectionFrame;
      },
      prepareContentPublicationFrame: ({
        motionProjectionFrame,
        publicationDecision,
        publicationFrameContext,
      }) => {
        const finishContentMeasure = startGpuFlowPerformanceMeasure(
          "surface-frame-content-publication",
          frameMeasureDetail,
        );
        const contentPublicationFrame =
          renderGpuFlowSurfaceContentPublicationFrame({
            ...input,
            deferResolutionUpdates:
              publicationFrameContext.deferResolutionUpdates,
            event,
            liveProjectionSample,
            nodeLayerRef,
            publicationDecision,
            renderedProjectionOnlyFrame: motionProjectionFrame.rendered,
            retainedContentRuntimeState,
            runtime,
            viewportFrame: publicationFrameContext.viewportFrame,
            viewportStore,
          });
        finishContentMeasure();
        frameMeasureDetail.contentRendered = contentPublicationFrame.rendered;
        finishCompletionMeasure = startGpuFlowPerformanceMeasure(
          "surface-frame-completion",
          frameMeasureDetail,
        );
        return contentPublicationFrame;
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
      runtimeViewportFrame: runtimeFrame.viewportFrame,
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
  const retainedDisplayFrame = input.retainedDisplayFrameRef.current;
  if (!retainedDisplayFrame) {
    return createGpuFlowMotionProjectionFrameResult({ rendered: false });
  }
  const requestedRetainedProjectionFrame =
    resolveGpuFlowRetainedProjectionFrame({
      layer: nodeLayerRef.current,
      retainedDisplayFrame,
      transaction: projectionTransaction,
    });
  const retainedProjectionPublicationDecision =
    decideGpuFlowRetainedProjectionPublicationTransaction({
      frameReasons: event.reasons,
      hasActiveRetainedDomControl:
        hasActiveGpuFlowRetainedDomControlPublicationProof(
          retainedDisplayFrame,
        ),
      heldPreviousProjectionState: input.visibleProjectionStateRef.current,
      projectionSchedulerKnobs:
        input.visiblePublicationSchedulerRef.current.getKnobs(),
      requestedProjectionCoverageMissing:
        requestedRetainedProjectionFrame.missingCoverageSurfaceIds.size > 0,
      requestedTransaction: projectionTransaction,
    });
  const projectionFrameTransaction =
    resolveGpuFlowProjectionFrameTransactionFromPublicationDecision({
      layer: nodeLayerRef.current,
      publicationDecision: retainedProjectionPublicationDecision,
      retainedDisplayFrame,
      requestedRetainedProjectionFrame,
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
    projectionFrameTransaction,
    requestedProjectionTransaction: projectionTransaction,
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
    !shouldRenderGpuFlowSurfaceContentPublicationFrame({
      deferResolutionUpdates,
      liveProjectionSample,
      nodeLayerRef,
      publicationDecision,
      renderedProjectionOnlyFrame,
      retainedContentFrameCacheRef: input.retainedContentFrameCacheRef,
      retainedDisplayFrameRef: input.retainedDisplayFrameRef,
      retainedPreparationRuntimeFrameRenderSignatureRef,
      retainedRuntimeFrameSourceRenderSignatureRef:
        input.retainedRuntimeFrameSourceRenderSignatureRef,
    })
  ) {
    return createGpuFlowContentPublicationFrameResult({ rendered: false });
  }
  let nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null =
    null;
  let retainedDisplayFrame: RetainedDisplayFrame | null = null;
  let retainedDisplayFollowUpFrameReason: GpuFrameReason | null = null;
  let retainedRuntimeFrame: GpuRetainedRuntimeFrame | null = null;
  const nodeLayerFrameResult = renderGpuFlowNodeLayerFrame({
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
    prepareCommittedSurfacePublicationCandidate:
      prepareGpuFlowCommittedSurfacePublicationCandidate,
    prepareRetainedDisplayPublicationCandidate:
      prepareGpuFlowRetainedDisplayPublicationCandidate,
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
  return createGpuFlowContentPublicationFrameResultForNodeLayerFrame({
    deferResolutionUpdates,
    heldPreviousProjectionState: input.visibleProjectionStateRef.current,
    nodeLayerFrameResult,
    nodeLayerFrameStatePublication,
    retainedDisplayFollowUpFrameReason,
    retainedDisplayFrame,
    retainedRuntimeFrame,
  });
}

function createGpuFlowContentPublicationFrameResultForNodeLayerFrame({
  deferResolutionUpdates,
  heldPreviousProjectionState,
  nodeLayerFrameResult,
  nodeLayerFrameStatePublication,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
}): GpuFlowContentPublicationFrameResult {
  const committedSurfacePublication =
    nodeLayerFrameResult.committedSurfacePublication;
  const blockedPublicationCandidate =
    createGpuFlowContentPublicationBlockedCandidateForNodeLayerFrame({
      heldPreviousProjectionState,
      nodeLayerFrameResult,
    });
  const visibleProjectionState = nodeLayerFrameResult.visibleProjectionState;
  if (visibleProjectionState) {
    return createGpuFlowVisibleContentPublicationFrameResult({
      committedSurfacePublication,
      deferResolutionUpdates,
      heldPreviousProjectionState,
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
  committedSurfacePublication,
  deferResolutionUpdates,
  heldPreviousProjectionState,
  nodeLayerFrameStatePublication,
  retainedDisplayFollowUpFrameReason,
  retainedDisplayFrame,
  retainedRuntimeFrame,
  visibleProjectionState,
}: {
  readonly committedSurfacePublication: GpuFlowNodeLayerFrameResult["committedSurfacePublication"];
  readonly deferResolutionUpdates: boolean;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly retainedDisplayFollowUpFrameReason: GpuFrameReason | null;
  readonly retainedDisplayFrame: RetainedDisplayFrame | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame | null;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowContentPublicationFrameResult {
  const heldPrevious =
    visibleProjectionState.transaction.kind === "held-previous";
  return createGpuFlowContentPublicationFrameResult({
    blockedPublicationCandidate:
      createGpuFlowHeldCommittedSurfaceBlockedPublicationCandidate({
        committedSurfacePublicationEffect:
          committedSurfacePublication.committedSurfacePublicationEffect,
        heldPreviousProjectionState,
      }),
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

function createGpuFlowContentPublicationBlockedCandidateForNodeLayerFrame({
  heldPreviousProjectionState,
  nodeLayerFrameResult,
}: {
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly nodeLayerFrameResult: GpuFlowNodeLayerFrameResult;
}): GpuFlowVisibleFrameBlockedPublicationCandidate | null {
  const blockedSurfacePublication =
    nodeLayerFrameResult.committedSurfacePublication.blockedSurfacePublication;
  if (blockedSurfacePublication) {
    return blockedSurfacePublication.blockedPublicationCandidate;
  }
  if (nodeLayerFrameResult.kind !== "retained-projection-blocked") {
    return null;
  }
  return createGpuFlowRetainedProjectionBlockedPublicationCandidate({
    blockedReason: nodeLayerFrameResult.retainedProjectionBlockedReason,
    heldPreviousProjectionState,
  });
}

function createGpuFlowHeldCommittedSurfaceBlockedPublicationCandidate({
  committedSurfacePublicationEffect,
  heldPreviousProjectionState,
}: {
  readonly committedSurfacePublicationEffect: GpuFlowCommittedSurfacePublicationEffect | null;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
}): GpuFlowVisibleFrameBlockedPublicationCandidate | null {
  if (committedSurfacePublicationEffect?.kind !== "held-previous") {
    return null;
  }
  return createGpuFlowBrowserVisualBlockedPublicationCandidate({
    frame: committedSurfacePublicationEffect.candidateFrame,
    heldPreviousProjectionState,
  });
}

function createGpuFlowContentPublicationFrameResult(
  input: GpuFlowContentPublicationFrameResultInput,
): GpuFlowContentPublicationFrameResult {
  return {
    ...EMPTY_GPU_FLOW_CONTENT_PUBLICATION_FRAME_RESULT_FIELDS,
    ...input,
  };
}

function shouldPublishGpuFlowContentFrame(
  publicationDecision: GpuFlowVisiblePublicationDecision,
  renderedProjectionOnlyFrame: boolean,
): boolean {
  return !renderedProjectionOnlyFrame && publicationDecision.lane !== "idle";
}

function shouldRenderGpuFlowSurfaceContentPublicationFrame({
  deferResolutionUpdates,
  liveProjectionSample,
  nodeLayerRef,
  publicationDecision,
  renderedProjectionOnlyFrame,
  retainedContentFrameCacheRef,
  retainedDisplayFrameRef,
  retainedPreparationRuntimeFrameRenderSignatureRef,
  retainedRuntimeFrameSourceRenderSignatureRef,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly nodeLayerRef: RenderGpuFlowSurfaceFrameInput["nodeLayerRef"];
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly renderedProjectionOnlyFrame: boolean;
  readonly retainedContentFrameCacheRef: RenderGpuFlowSurfaceFrameInput["retainedContentFrameCacheRef"];
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
  readonly retainedPreparationRuntimeFrameRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedPreparationRuntimeFrameRenderSignatureRef"];
  readonly retainedRuntimeFrameSourceRenderSignatureRef: RenderGpuFlowSurfaceFrameInput["retainedRuntimeFrameSourceRenderSignatureRef"];
}): boolean {
  if (
    !shouldPublishGpuFlowContentFrame(
      publicationDecision,
      renderedProjectionOnlyFrame,
    )
  ) {
    return false;
  }
  return !shouldSkipDeferredGpuFlowContentPublication({
    deferResolutionUpdates,
    liveProjectionSample,
    nodeLayerRef,
    publicationDecision,
    retainedContentFrameCacheRef,
    retainedDisplayFrameRef,
    retainedPreparationRuntimeFrameRenderSignatureRef,
    retainedRuntimeFrameSourceRenderSignatureRef,
  });
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
    !shouldConsiderDeferredGpuFlowContentPublication({
      deferResolutionUpdates,
      publicationDecision,
      retainedDisplayFrameRef,
    })
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
  return isReusableGpuFlowDeferredContentPublicationFrame({
    nodeLayerRef,
    preparedFrame,
    targetZoomBucket,
  });
}

function shouldConsiderDeferredGpuFlowContentPublication({
  deferResolutionUpdates,
  publicationDecision,
  retainedDisplayFrameRef,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
}): boolean {
  return (
    deferResolutionUpdates &&
    publicationDecision.schedulerState === "motion-settling" &&
    publicationDecision.lane !== "motion" &&
    retainedDisplayFrameRef.current !== null
  );
}

function isReusableGpuFlowDeferredContentPublicationFrame({
  nodeLayerRef,
  preparedFrame,
  targetZoomBucket,
}: {
  readonly nodeLayerRef: RenderGpuFlowSurfaceFrameInput["nodeLayerRef"];
  readonly preparedFrame: NonNullable<
    RenderGpuFlowSurfaceFrameInput["retainedContentFrameCacheRef"]["current"]
  >;
  readonly targetZoomBucket: ReturnType<typeof chooseZoomBucket>;
}): boolean {
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
    preparedSourceSignature !==
      retainedRuntimeFrameSourceRenderSignatureRef.current
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
