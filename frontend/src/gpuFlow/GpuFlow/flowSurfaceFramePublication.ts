import type { MutableRefObject } from "react";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import type { GpuFlowRuntime } from "../gpuDevice";
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
import type { GpuFlowViewportRuntime } from "../viewportRuntime";
import { renderGpuFlowNodeLayerFrame } from "./flowFrame";
import { renderGpuFlowNodeLayerProjectionFrame } from "./flowProjectionFrame";
import {
  createGpuFlowRetainedRuntimeFrameOverlayRenderSignature,
  createGpuFlowRetainedRuntimeFrameSourceRenderSignature,
} from "./flowRetainedRuntimeFrameSignatures";
import { sampleGpuFlowRetainedContentRuntimeScene } from "./retainedContentRuntimeSceneSampling";

type GpuFlowNodeLayerFrameInput = Parameters<
  typeof renderGpuFlowNodeLayerFrame
>[0];
type GpuFlowSurfaceFrameEvent = Parameters<
  NonNullable<GpuSurfaceProps["onFrame"]>
>[1];

export type RenderGpuFlowSurfaceFrameInput = Omit<
  GpuFlowNodeLayerFrameInput,
  | "deferResolutionUpdates"
  | "frameReasons"
  | "heldPreviousProjectionState"
  | "liveProjectionSample"
  | "onRetainedDisplayFrame"
  | "onRetainedPreparedRuntimeFrame"
  | "onRetainedRuntimeFrame"
  | "publicationLane"
  | "viewportFrame"
> & {
  readonly committedSurfaceFrameRef: MutableRefObject<GpuFlowCommittedSurfaceFrame | null>;
  readonly event: GpuFlowSurfaceFrameEvent;
  readonly initialRetainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly liveProjectionSamplerRef: MutableRefObject<
    ReturnType<typeof createGpuFlowLiveProjectionSampler>
  >;
  readonly publishCommittedSurfaceFrame: NonNullable<
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
  const liveProjectionSample = input.liveProjectionSamplerRef.current.capture({
    canvasSize: input.canvasSizeRef.current,
    gestureOwner:
      getGpuWheelGestureOwnershipArbiter(viewportStore).getState().owner,
    retainedContentRuntimeState,
    timestamp: event.timestamp,
    viewport: nodeLayerRef.current.viewport,
  });
  const publicationDecision =
    input.visiblePublicationSchedulerRef.current.selectFrame({
      hasCommittedContentFrame: input.retainedDisplayFrameRef.current !== null,
      rawReasons: event.reasons,
      sample: liveProjectionSample,
      timestamp: event.timestamp,
      viewportInteractionActive,
    });
  const viewportFrame = isGpuFlowViewportFrame({
    reasons: event.reasons,
    runtimeViewportFrame: runtimeFrame.viewportFrame,
  });
  const deferResolutionUpdates = shouldDeferGpuFlowResolutionUpdates({
    lane: publicationDecision.lane,
    viewportFrame,
    viewportInteractionActive,
  });
  const renderedProjectionOnlyFrame = renderGpuFlowSurfaceMotionProjectionFrame(
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
  const renderedContentPublicationFrame =
    renderGpuFlowSurfaceContentPublicationFrame({
      ...input,
      deferResolutionUpdates,
      event,
      liveProjectionSample,
      nodeLayerRef,
      publicationDecision,
      renderedProjectionOnlyFrame,
      retainedContentRuntimeState,
      runtime,
      viewportFrame,
      viewportStore,
    });
  completeGpuFlowSurfacePublicationFrame({
    publicationDecision,
    renderedVisibleFrame:
      renderedProjectionOnlyFrame || renderedContentPublicationFrame,
    surfaceRef: input.surfaceRef,
    visiblePublicationSchedulerRef: input.visiblePublicationSchedulerRef,
  });
  viewportRuntime.applyOverlayTransforms();
  input.callbacksRef.current.onFrame?.(runtime, event);
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

function shouldDeferGpuFlowResolutionUpdates({
  lane,
  viewportFrame,
  viewportInteractionActive,
}: {
  readonly lane: GpuFlowVisiblePublicationDecision["lane"];
  readonly viewportFrame: boolean;
  readonly viewportInteractionActive: boolean;
}): boolean {
  return viewportInteractionActive || (viewportFrame && lane !== "maintenance");
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
}): boolean {
  if (publicationDecision.lane !== "motion") {
    return false;
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
  if (rendered.rendered) {
    const visibleCommittedFrame =
      rendered.transaction.kind === "held-previous"
        ? input.visibleProjectionStateRef.current?.committedFrame ??
          committedFrame
        : committedFrame;
    input.visibleProjectionStateRef.current =
      createGpuFlowVisibleProjectionState({
        committedFrame: visibleCommittedFrame,
        heldPreviousProjection: rendered.heldPreviousProjection,
        transaction: rendered.transaction,
      });
  }
  return rendered.rendered;
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
}): boolean {
  if (
    !shouldPublishGpuFlowContentFrame(
      publicationDecision,
      renderedProjectionOnlyFrame,
    )
  ) {
    return false;
  }
  const visibleProjectionState = renderGpuFlowNodeLayerFrame({
    activeResizeNodeIdRef: input.activeResizeNodeIdRef,
    callbacksRef: input.callbacksRef,
    canvasSizeRef: input.canvasSizeRef,
    deferResolutionUpdates,
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
    onRetainedDisplayFrame: input.publishCommittedSurfaceFrame,
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
    input.visibleProjectionStateRef.current = visibleProjectionState;
    return true;
  }
  return false;
}

function shouldPublishGpuFlowContentFrame(
  publicationDecision: GpuFlowVisiblePublicationDecision,
  renderedProjectionOnlyFrame: boolean,
): boolean {
  return !renderedProjectionOnlyFrame && publicationDecision.lane !== "idle";
}

function getGpuFlowContentPublicationLane(
  lane: GpuFlowVisiblePublicationDecision["lane"],
): Extract<GpuFlowProjectionLane, "content" | "maintenance"> {
  return lane === "maintenance" ? "maintenance" : "content";
}

function completeGpuFlowSurfacePublicationFrame({
  publicationDecision,
  renderedVisibleFrame,
  surfaceRef,
  visiblePublicationSchedulerRef,
}: {
  readonly publicationDecision: GpuFlowVisiblePublicationDecision;
  readonly renderedVisibleFrame: boolean;
  readonly surfaceRef: RenderGpuFlowSurfaceFrameInput["surfaceRef"];
  readonly visiblePublicationSchedulerRef: RenderGpuFlowSurfaceFrameInput["visiblePublicationSchedulerRef"];
}) {
  const completion = visiblePublicationSchedulerRef.current.completeFrame(
    publicationDecision,
    {
      published: renderedVisibleFrame,
    },
  );
  if (hasGpuFlowVisiblePublicationDebt(completion.debt)) {
    surfaceRef.current?.requestFrame(
      getGpuFlowVisiblePublicationDebtReason(completion.debt),
    );
  }
}
