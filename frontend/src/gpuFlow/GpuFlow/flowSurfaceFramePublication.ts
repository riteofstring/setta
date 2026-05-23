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
  getGpuFlowVisiblePublicationDebtReason,
  hasGpuFlowVisiblePublicationDebt,
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionLane,
  type GpuFlowVisibleProjectionState,
  type GpuFlowVisiblePublicationDecision,
} from "../projectionRuntime";
import type { GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";
import { chooseZoomBucket } from "../textureResolution";
import { normalizeGpuViewport } from "../viewportMath";
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import { renderGpuFlowNodeLayerFrame } from "./flowFrame";
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
import {
  createGpuFlowCommitPublicationToken,
  createGpuFlowHoldPreviousToken,
  createGpuFlowPresentableCommit,
} from "./visibleFramePublicationAuthority";
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
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly commitPublicationToken: GpuFlowCommitPublicationToken | null;
  readonly forceImmediatePublicationDebtFrame: boolean;
  readonly holdPreviousToken: GpuFlowHoldPreviousToken | null;
  readonly rendered: boolean;
};

type GpuFlowMotionProjectionFrameResult = {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly commitPublicationToken: GpuFlowCommitPublicationToken | null;
  readonly holdPreviousToken: GpuFlowHoldPreviousToken | null;
  readonly rendered: boolean;
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
  | "onPreparedCommittedSurfaceFrameBlocked"
  | "onPreparedCommittedSurfaceFrameHeld"
  | "onRetainedDisplayFrame"
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
  readonly retainedPreparationRuntimeFrameRenderSignatureRef: MutableRefObject<
    string | null
  >;
  readonly retainedPreparationRuntimeFrameScrollRevisionRef: MutableRefObject<
    number | null
  >;
  readonly retainedRuntimeFrameRenderSignatureRef: MutableRefObject<
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
    const publicationDecision =
      input.visiblePublicationSchedulerRef.current.selectFrame({
        hasCommittedContentFrame:
          input.retainedDisplayFrameRef.current !== null,
        rawReasons: event.reasons,
        sample: liveProjectionSample,
        timestamp: event.timestamp,
        viewportInteractionActive,
      });
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
    const motionProjectionFrame = renderGpuFlowSurfaceMotionProjectionFrame({
      ...input,
      event,
      liveProjectionSample,
      nodeLayerRef,
      publicationDecision,
      retainedContentRuntimeState,
      runtime,
      viewportFrame,
      viewportStore,
    });
    finishMotionMeasure();
    frameMeasureDetail.motionRendered = motionProjectionFrame.rendered;
    const finishContentMeasure = startGpuFlowPerformanceMeasure(
      "surface-frame-content-publication",
      frameMeasureDetail,
    );
    const renderedContentPublicationFrame =
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
    frameMeasureDetail.contentRendered =
      renderedContentPublicationFrame.rendered;
    const finishCompletionMeasure = startGpuFlowPerformanceMeasure(
      "surface-frame-completion",
      frameMeasureDetail,
    );
    const visiblePublicationTokens = selectGpuFlowVisiblePublicationTokens({
      contentPublicationFrame: renderedContentPublicationFrame,
      motionProjectionFrame,
      visibleProjectionState: input.visibleProjectionStateRef.current,
    });
    const blockedPublicationToken =
      renderedContentPublicationFrame.blockedPublicationToken ??
      motionProjectionFrame.blockedPublicationToken;
    completeGpuFlowSurfacePublicationFrame({
      forceImmediatePublicationDebtFrame:
        renderedContentPublicationFrame.forceImmediatePublicationDebtFrame,
      publicationDecision,
      renderedVisibleFrame:
        motionProjectionFrame.rendered ||
        renderedContentPublicationFrame.rendered,
      blockedPublicationToken,
      commitPublicationToken: visiblePublicationTokens.commitPublicationToken,
      holdPreviousToken: visiblePublicationTokens.holdPreviousToken,
      surfaceRef: input.surfaceRef,
      visibleProjectionStateRef: input.visibleProjectionStateRef,
      visiblePublicationSchedulerRef: input.visiblePublicationSchedulerRef,
    });
    finishCompletionMeasure();
    const finishOverlayMeasure = startGpuFlowPerformanceMeasure(
      "surface-frame-overlay",
      frameMeasureDetail,
    );
    const visibleProjectionState = input.visibleProjectionStateRef.current;
    if (visibleProjectionState) {
      const overlayProjectionKey = createGpuFlowVisibleOverlayProjectionKey(
        visibleProjectionState,
      );
      if (
        input.visibleOverlayProjectionKeyRef.current !== overlayProjectionKey
      ) {
        input.visibleOverlayProjectionKeyRef.current = overlayProjectionKey;
        viewportRuntime.applyOverlayTransforms(
          visibleProjectionState.sample.viewport,
        );
      }
    }
    finishOverlayMeasure();
    input.callbacksRef.current.onFrame?.(runtime, event);
    return {
      coldStartShellFrame:
        blockedPublicationToken?.frozenFrame.kind === "cold-start-shell"
          ? blockedPublicationToken.frozenFrame.frame
          : null,
      visibleProjectionState,
    };
  } finally {
    finishFrameMeasure();
  }
}

function selectGpuFlowVisiblePublicationTokens({
  contentPublicationFrame,
  motionProjectionFrame,
  visibleProjectionState,
}: {
  readonly contentPublicationFrame: GpuFlowContentPublicationFrameResult;
  readonly motionProjectionFrame: GpuFlowMotionProjectionFrameResult;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}): {
  readonly commitPublicationToken: GpuFlowCommitPublicationToken | null;
  readonly holdPreviousToken: GpuFlowHoldPreviousToken | null;
} {
  if (!visibleProjectionState) {
    return {
      commitPublicationToken: null,
      holdPreviousToken: null,
    };
  }
  return {
    commitPublicationToken: selectGpuFlowVisibleCommitPublicationToken({
      tokens: [
        contentPublicationFrame.commitPublicationToken,
        motionProjectionFrame.commitPublicationToken,
      ],
      visibleProjectionState,
    }),
    holdPreviousToken: selectGpuFlowVisibleHoldPreviousToken({
      tokens: [
        contentPublicationFrame.holdPreviousToken,
        motionProjectionFrame.holdPreviousToken,
      ],
      visibleProjectionState,
    }),
  };
}

function selectGpuFlowVisibleCommitPublicationToken({
  tokens,
  visibleProjectionState,
}: {
  readonly tokens: readonly (GpuFlowCommitPublicationToken | null)[];
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowCommitPublicationToken | null {
  return (
    tokens.find(
      (token) =>
        token !== null &&
        token.committedFrameId ===
          visibleProjectionState.committedFrame.displayFrameId &&
        token.projectionSampleId === visibleProjectionState.sample.id,
    ) ?? null
  );
}

function selectGpuFlowVisibleHoldPreviousToken({
  tokens,
  visibleProjectionState,
}: {
  readonly tokens: readonly (GpuFlowHoldPreviousToken | null)[];
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}): GpuFlowHoldPreviousToken | null {
  const heldPreviousProjection = visibleProjectionState.heldPreviousProjection;
  if (
    visibleProjectionState.transaction.kind !== "held-previous" ||
    heldPreviousProjection === null
  ) {
    return null;
  }
  return (
    tokens.find(
      (token) =>
        token !== null &&
        token.committedFrameId ===
          visibleProjectionState.committedFrame.displayFrameId &&
        token.holdAgeFrames === heldPreviousProjection.consecutiveFrameCount &&
        token.holdAgeMs === heldPreviousProjection.heldDurationMs &&
        token.projectionSampleId ===
          heldPreviousProjection.requestedProjectionSampleId,
    ) ?? null
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
    projectionCommittedSurfaceFrame: committedFrame,
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
  });
  if (!rendered.rendered) {
    return createGpuFlowMotionProjectionFrameResult({
      blockedPublicationToken: rendered.blockedPublicationToken ?? null,
      rendered: false,
    });
  }
  if (rendered.rendered) {
    const visibleCommittedFrame =
      rendered.transaction.kind === "held-previous"
        ? input.visibleProjectionStateRef.current?.committedFrame ??
          committedFrame
        : committedFrame;
    publishGpuFlowVisibleProjectionState({
      commitPublicationToken: rendered.commitPublicationToken,
      holdPreviousToken: rendered.holdPreviousToken,
      visibleProjectionState: createGpuFlowVisibleProjectionState({
        committedFrame: visibleCommittedFrame,
        heldPreviousProjection: rendered.heldPreviousProjection,
        transaction: rendered.transaction,
      }),
      visibleProjectionStateRef: input.visibleProjectionStateRef,
    });
  }
  return createGpuFlowMotionProjectionFrameResult({
    commitPublicationToken: rendered.commitPublicationToken,
    holdPreviousToken: rendered.holdPreviousToken,
    rendered: true,
  });
}

function createGpuFlowMotionProjectionFrameResult({
  blockedPublicationToken = null,
  commitPublicationToken = null,
  holdPreviousToken = null,
  rendered,
}: {
  readonly blockedPublicationToken?:
    | GpuFlowBlockedPublicationToken
    | null
    | undefined;
  readonly commitPublicationToken?:
    | GpuFlowCommitPublicationToken
    | null
    | undefined;
  readonly holdPreviousToken?: GpuFlowHoldPreviousToken | null | undefined;
  readonly rendered: boolean;
}): GpuFlowMotionProjectionFrameResult {
  return {
    blockedPublicationToken,
    commitPublicationToken,
    holdPreviousToken,
    rendered,
  };
}

function renderGpuFlowSurfaceContentPublicationFrame({
  deferResolutionUpdates,
  event,
  initialRetainedRuntimeFrame,
  liveProjectionSample,
  nodeLayerRef,
  publicationDecision,
  renderedProjectionOnlyFrame,
  retainedContentRuntimeState,
  retainedPreparationRuntimeFrameRenderSignatureRef,
  retainedPreparationRuntimeFrameScrollRevisionRef,
  retainedRuntimeFrameRenderSignatureRef,
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
    })
  ) {
    return createGpuFlowContentPublicationFrameResult({ rendered: false });
  }
  let blockedPublicationToken: GpuFlowBlockedPublicationToken | null = null;
  let commitPublicationToken: GpuFlowCommitPublicationToken | null = null;
  let holdPreviousToken: GpuFlowHoldPreviousToken | null = null;
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
      const previousScrollRevision =
        retainedPreparationRuntimeFrameScrollRevisionRef.current ??
        initialRetainedRuntimeFrame.input.scrollRevision;
      if (
        deferResolutionUpdates &&
        nextRetainedRuntimeFrame.input.scrollRevision === previousScrollRevision
      ) {
        return;
      }
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
    onCommittedSurfaceFramePublishable: (token, frame) => {
      commitPublicationToken = token;
      input.commitPreparedCommittedSurfaceFrame(token, frame);
    },
    onBlockedSurfacePublication: (token) => {
      blockedPublicationToken = token;
    },
    onPreparedCommittedSurfaceFrameBlocked: (token, frame, options) => {
      input.abortPreparedCommittedSurfaceFrame(token, frame, options);
    },
    onPreparedCommittedSurfaceFrameHeld: (token, frame, options) => {
      holdPreviousToken = token;
      input.abortPreparedCommittedSurfaceFrame(token, frame, options);
    },
    onRetainedDisplayFrame: input.prepareCommittedSurfaceFrame,
    onRetainedRuntimeFrame: (nextRetainedRuntimeFrame) => {
      input.callbacksRef.current.onRetainedRuntimeFrame?.(
        nextRetainedRuntimeFrame,
      );
      const nextSignature =
        createGpuFlowRetainedRuntimeFrameOverlayRenderSignature(
          nextRetainedRuntimeFrame,
        );
      if (retainedRuntimeFrameRenderSignatureRef.current === nextSignature) {
        return;
      }
      retainedRuntimeFrameRenderSignatureRef.current = nextSignature;
    },
  });
  if (visibleProjectionState) {
    publishGpuFlowVisibleProjectionState({
      commitPublicationToken,
      holdPreviousToken,
      visibleProjectionState,
      visibleProjectionStateRef: input.visibleProjectionStateRef,
    });
    const heldPrevious =
      visibleProjectionState.transaction.kind === "held-previous";
    return createGpuFlowContentPublicationFrameResult({
      commitPublicationToken,
      forceImmediatePublicationDebtFrame:
        heldPrevious && !deferResolutionUpdates,
      holdPreviousToken,
      rendered: deferResolutionUpdates || !heldPrevious,
    });
  }
  return createGpuFlowContentPublicationFrameResult({
    blockedPublicationToken,
    commitPublicationToken,
    holdPreviousToken,
    rendered: false,
  });
}

function createGpuFlowContentPublicationFrameResult({
  blockedPublicationToken = null,
  commitPublicationToken = null,
  forceImmediatePublicationDebtFrame = false,
  holdPreviousToken = null,
  rendered,
}: {
  readonly blockedPublicationToken?:
    | GpuFlowBlockedPublicationToken
    | null
    | undefined;
  readonly commitPublicationToken?:
    | GpuFlowCommitPublicationToken
    | null
    | undefined;
  readonly forceImmediatePublicationDebtFrame?: boolean | undefined;
  readonly holdPreviousToken?: GpuFlowHoldPreviousToken | null | undefined;
  readonly rendered: boolean;
}): GpuFlowContentPublicationFrameResult {
  return {
    blockedPublicationToken,
    commitPublicationToken,
    forceImmediatePublicationDebtFrame,
    holdPreviousToken,
    rendered,
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
}: {
  readonly deferResolutionUpdates: boolean;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly nodeLayerRef: RenderGpuFlowSurfaceFrameInput["nodeLayerRef"];
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly retainedContentFrameCacheRef: RenderGpuFlowSurfaceFrameInput["retainedContentFrameCacheRef"];
  readonly retainedDisplayFrameRef: RenderGpuFlowSurfaceFrameInput["retainedDisplayFrameRef"];
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
  const targetZoomBucket = chooseZoomBucket(
    normalizeGpuViewport(liveProjectionSample.viewport).zoom,
  );
  return (
    preparedFrame.sceneRevision ===
      (nodeLayerRef.current.scene?.revision ?? 0) &&
    preparedFrame.viewportZoomBucket === targetZoomBucket
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
  blockedPublicationToken,
  commitPublicationToken,
  forceImmediatePublicationDebtFrame,
  holdPreviousToken,
  publicationDecision,
  renderedVisibleFrame,
  surfaceRef,
  visibleProjectionStateRef,
  visiblePublicationSchedulerRef,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly commitPublicationToken: GpuFlowCommitPublicationToken | null;
  readonly forceImmediatePublicationDebtFrame: boolean;
  readonly holdPreviousToken: GpuFlowHoldPreviousToken | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly renderedVisibleFrame: boolean;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly visibleProjectionStateRef: RenderGpuFlowSurfaceFrameInput["visibleProjectionStateRef"];
  readonly visiblePublicationSchedulerRef: RenderGpuFlowSurfaceFrameInput["visiblePublicationSchedulerRef"];
}) {
  const outcome = createGpuFlowVisiblePublicationCompletionOutcome({
    publicationDecision,
    blockedPublicationToken,
    commitPublicationToken,
    holdPreviousToken,
    renderedVisibleFrame,
    visibleProjectionState: visibleProjectionStateRef.current,
  });
  assertGpuFlowSingleVisiblePublicationOutcome({
    outcome,
    publicationDecision,
    surface: surfaceRef.current,
  });
  const completion = visiblePublicationSchedulerRef.current.completeFrame(
    publicationDecision,
    outcome,
  );
  postGpuFlowVisiblePublicationOutcomeChromeReproEvent({
    completion,
    outcome,
    publicationDecision,
    visibleProjectionState: visibleProjectionStateRef.current,
  });
  recordGpuFlowBlockedPublicationGuard({
    outcome,
    publicationDecision,
    surface: surfaceRef.current,
  });
  if (hasGpuFlowVisiblePublicationDebt(completion.debt)) {
    const frameReason = getGpuFlowVisiblePublicationDebtReason(completion.debt);
    const delayedDebtRequestMs = getDelayedGpuFlowPublicationDebtRequestMs({
      publicationDecision,
      schedulerMotionSettleWindowMs:
        visiblePublicationSchedulerRef.current.getKnobs().motionSettleWindowMs,
    });
    if (
      !forceImmediatePublicationDebtFrame &&
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

function createGpuFlowVisiblePublicationCompletionOutcome({
  blockedPublicationToken,
  commitPublicationToken,
  holdPreviousToken,
  publicationDecision,
  renderedVisibleFrame,
  visibleProjectionState,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
  readonly commitPublicationToken: GpuFlowCommitPublicationToken | null;
  readonly holdPreviousToken: GpuFlowHoldPreviousToken | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly renderedVisibleFrame: boolean;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState | null;
}) {
  if (!renderedVisibleFrame) {
    return createGpuFlowUnrenderedPublicationCompletionOutcome({
      blockedPublicationToken,
    });
  }
  if (visibleProjectionState === null) {
    throw new Error(
      "GPU Flow visible publication completion cannot commit a rendered frame without visible projection state.",
    );
  }
  if (visibleProjectionState.transaction.kind === "held-previous") {
    return createGpuFlowHoldPreviousPublicationCompletionOutcome({
      holdPreviousToken,
      publicationDecision,
      visibleProjectionState,
    });
  }
  return createGpuFlowCommitPublicationCompletionOutcome({
    commitPublicationToken,
    publicationDecision,
    visibleProjectionState,
  });
}

function createGpuFlowUnrenderedPublicationCompletionOutcome({
  blockedPublicationToken,
}: {
  readonly blockedPublicationToken: GpuFlowBlockedPublicationToken | null;
}) {
  if (blockedPublicationToken) {
    return { kind: "blocked" as const, token: blockedPublicationToken };
  }
  return { kind: "not-published" as const };
}

function createGpuFlowHoldPreviousPublicationCompletionOutcome({
  holdPreviousToken,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly holdPreviousToken: GpuFlowHoldPreviousToken | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}) {
  const heldPreviousProjection = visibleProjectionState.heldPreviousProjection;
  if (
    heldPreviousProjection === null ||
    heldPreviousProjection.requestedProjectionSampleId !==
      publicationDecision.sample.id
  ) {
    throw new Error(
      "GPU Flow held-previous publication completion requires diagnostics for the selected projection sample.",
    );
  }
  return {
    kind: "hold-previous" as const,
    token:
      holdPreviousToken ??
      createGpuFlowHoldPreviousToken({
        committedFrameId: visibleProjectionState.committedFrame.displayFrameId,
        holdAgeFrames: heldPreviousProjection.consecutiveFrameCount,
        holdAgeMs: heldPreviousProjection.heldDurationMs,
        projectionSample: publicationDecision.sample,
      }),
  };
}

function createGpuFlowCommitPublicationCompletionOutcome({
  commitPublicationToken,
  publicationDecision,
  visibleProjectionState,
}: {
  readonly commitPublicationToken: GpuFlowCommitPublicationToken | null;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly visibleProjectionState: GpuFlowVisibleProjectionState;
}) {
  if (visibleProjectionState.sample.id !== publicationDecision.sample.id) {
    throw new Error(
      "GPU Flow committed publication completion requires visible projection state for the selected sample.",
    );
  }
  if (
    visibleProjectionState.transaction.kind === "content-publication" &&
    commitPublicationToken === null
  ) {
    throw new Error(
      "GPU Flow content publication completion requires the commit token that published the visible frame.",
    );
  }
  return {
    debtProof: createGpuFlowVisiblePublicationCommitDebtProof({
      committedFrame: visibleProjectionState.committedFrame,
      publicationDecision,
    }),
    kind: "commit" as const,
    token:
      commitPublicationToken ??
      createGpuFlowCommitPublicationToken({
        presentableCommit: createGpuFlowPresentableCommit({
          frame: visibleProjectionState.committedFrame,
          projectionSample: publicationDecision.sample,
        }),
      }),
  };
}

export function createGpuFlowVisiblePublicationCommitDebtProof({
  committedFrame,
  publicationDecision,
}: {
  readonly committedFrame: GpuFlowCommittedSurfaceFrame;
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
}) {
  const hasCompatiblePreviousCoverage =
    hasGpuFlowCommittedSurfaceCompatiblePreviousCoverage(committedFrame);
  return Object.freeze({
    content:
      publicationDecision.lane === "content" && !hasCompatiblePreviousCoverage,
    maintenance:
      publicationDecision.lane === "maintenance" &&
      !hasCompatiblePreviousCoverage,
    motion: publicationDecision.lane === "motion",
  });
}

function hasGpuFlowCommittedSurfaceCompatiblePreviousCoverage(
  frame: GpuFlowCommittedSurfaceFrame,
): boolean {
  return (
    frame.projectionHorizon.textActorCoverage.compatiblePreviousActorIds
      .length > 0 ||
    (frame.surfaceTransaction?.coverageProof.compatibleCoverage.length ?? 0) > 0
  );
}
