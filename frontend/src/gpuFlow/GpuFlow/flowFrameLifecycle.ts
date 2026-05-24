import { type MutableRefObject } from "react";

import {
  createGpuFlowFramePerformanceEvent,
  type GpuFlowFramePhaseDiagnostics,
  type GpuFlowRetainedTexturePageFrameMetrics,
} from "../framePerformance";
import { type GpuFrameReason } from "../gpuRenderer";
import { type GpuSurfaceHandle } from "../GpuSurface";
import {
  type HtmlSurfaceFrameCanvasSubmission,
  type RenderHtmlSurfaceFrameResult,
} from "../htmlSurfaces/frame";
import { createGpuFlowInteractionDiagnosticsSnapshot } from "../interactionDiagnostics";
import { type GpuNodeInteractionDirtyController } from "../nodeInteractionDirty";
import { type GpuFlowProjectionDebugState } from "../projectionRuntime";
import { type GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";

import type { GpuFlowNodeLayerState } from "./flowLayerState";
import { type GpuFlowCallbacks } from "./flowSurfaceTypes";
import { markTransformOnlyPaintNodesForViewportFrame } from "./flowTransformOnlyPaintNodes";
import {
  assertGpuFlowCommitPublicationTokenBrand,
  type GpuFlowCommitPublicationToken,
} from "./visibleFramePresentationProofs";

export function reportGpuFlowNodeLayerFramePerformance({
  callbacksRef,
  deferResolutionUpdates,
  frame,
  frameReasons,
  interactionDiagnostics,
  layerResult,
  phaseDiagnostics,
  projectionDebugState,
  renderDurationMs,
  retainedTexturePages,
  viewport,
  viewportFrame,
}: {
  readonly callbacksRef: MutableRefObject<GpuFlowCallbacks>;
  readonly deferResolutionUpdates: boolean;
  readonly frame: number;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly interactionDiagnostics: ReturnType<
    typeof createGpuFlowInteractionDiagnosticsSnapshot
  >;
  readonly layerResult: RenderHtmlSurfaceFrameResult;
  readonly phaseDiagnostics: GpuFlowFramePhaseDiagnostics;
  readonly projectionDebugState?: GpuFlowProjectionDebugState | undefined;
  readonly renderDurationMs: number;
  readonly retainedTexturePages:
    | GpuFlowRetainedTexturePageFrameMetrics
    | undefined;
  readonly viewport: GpuFlowNodeLayerState["viewport"];
  readonly viewportFrame: boolean;
}) {
  const framePerformanceReporter =
    callbacksRef.current.framePerformanceReporter;
  if (
    !framePerformanceReporter ||
    framePerformanceReporter.isEnabled?.() === false
  ) {
    return;
  }
  framePerformanceReporter.onFrame(
    createGpuFlowFramePerformanceEvent({
      deferResolutionUpdates,
      frame,
      frameReasons,
      interactionDiagnostics,
      layerResult,
      phaseDiagnostics,
      projectionDebugState,
      renderDurationMs,
      retainedTexturePages,
      viewport,
      viewportFrame,
    }),
  );
}

export type GpuFlowNodeLayerFrameStatePublication = {
  readonly callbacksRef: MutableRefObject<GpuFlowCallbacks>;
  readonly layerResult: RenderHtmlSurfaceFrameResult;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly retainedTexturePageFollowUpFrame: boolean;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly switchAnimationFollowUpFrame: boolean;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
  readonly viewport: GpuFlowNodeLayerState["viewport"];
  readonly viewportFrame: boolean;
  readonly visibleNodeIdsRef: MutableRefObject<ReadonlySet<string>>;
};

export function publishGpuFlowNodeLayerFrameState({
  token,
  ...publication
}: GpuFlowNodeLayerFrameStatePublication & {
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  assertGpuFlowCommitPublicationTokenBrand({ token });
  updateGpuFlowNodeLayerFrameState({
    ...publication,
    layerResult: publishGpuFlowHtmlSurfaceCanvasSubmission({
      layerResult: publication.layerResult,
      token,
    }),
  });
}

export function submitGpuFlowNodeLayerFrameCanvasSubmission({
  nodeLayerFrameStatePublication,
  token,
}: {
  readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
  readonly token: GpuFlowCommitPublicationToken;
}): GpuFlowNodeLayerFrameStatePublication | null {
  assertGpuFlowCommitPublicationTokenBrand({ token });
  if (nodeLayerFrameStatePublication === null) {
    return null;
  }
  return {
    ...nodeLayerFrameStatePublication,
    layerResult: publishGpuFlowHtmlSurfaceCanvasSubmission({
      layerResult: nodeLayerFrameStatePublication.layerResult,
      token,
    }),
  };
}

function publishGpuFlowHtmlSurfaceCanvasSubmission({
  layerResult,
  token,
}: {
  readonly layerResult: RenderHtmlSurfaceFrameResult;
  readonly token: GpuFlowCommitPublicationToken;
}): RenderHtmlSurfaceFrameResult {
  const canvasSubmission = layerResult.canvasSubmission ?? null;
  if (!canvasSubmission) {
    return layerResult;
  }
  submitGpuFlowHtmlSurfaceCanvasFrame({
    canvasSubmission,
    token,
  });
  return {
    ...layerResult,
    canvasSubmission: null,
  };
}

function submitGpuFlowHtmlSurfaceCanvasFrame({
  canvasSubmission,
  token,
}: {
  readonly canvasSubmission: HtmlSurfaceFrameCanvasSubmission;
  readonly token: GpuFlowCommitPublicationToken;
}): void {
  assertGpuFlowCommitPublicationTokenBrand({ token });
  canvasSubmission.submit();
}

function updateGpuFlowNodeLayerFrameState({
  callbacksRef,
  layerResult,
  nodeInteractionRef,
  nodeLayerRef,
  retainedRuntimeFrame,
  retainedTexturePageFollowUpFrame,
  surfaceRef,
  switchAnimationFollowUpFrame,
  transformOnlyPaintNodeIdsRef,
  viewport,
  viewportFrame,
  visibleNodeIdsRef,
}: GpuFlowNodeLayerFrameStatePublication) {
  markTransformOnlyPaintNodesForViewportFrame({
    layerResult,
    transformOnlyPaintNodeIdsRef,
    viewportFrame,
  });
  nodeLayerRef.current = {
    ...nodeLayerRef.current,
    retainedRuntimeFrame,
    visualScene: layerResult.visualScene,
    visualSceneViewport: viewport,
  };
  visibleNodeIdsRef.current = new Set(layerResult.visibleNodeIds);
  completeGpuNodeInteractionFrame(nodeInteractionRef, layerResult);
  callbacksRef.current.onNodeLayerFrame?.(layerResult);
  requestRemainingGpuFlowFrame({
    layerResult,
    retainedTexturePageFollowUpFrame,
    surfaceRef,
    switchAnimationFollowUpFrame,
  });
}

function completeGpuNodeInteractionFrame(
  nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>,
  layerResult: RenderHtmlSurfaceFrameResult,
) {
  nodeInteractionRef.current?.completeFrame(layerResult);
}

function requestRemainingGpuFlowFrame({
  layerResult,
  retainedTexturePageFollowUpFrame,
  switchAnimationFollowUpFrame,
  surfaceRef,
}: {
  readonly layerResult: RenderHtmlSurfaceFrameResult;
  readonly retainedTexturePageFollowUpFrame: boolean;
  readonly switchAnimationFollowUpFrame: boolean;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}) {
  if (layerResult.budgetExhausted || retainedTexturePageFollowUpFrame) {
    surfaceRef.current?.requestFrame("texture-upload");
  } else if (switchAnimationFollowUpFrame) {
    surfaceRef.current?.requestFrame("animation");
  }
}
