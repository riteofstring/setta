import { type MutableRefObject } from "react";

import {
  createGpuFlowFramePerformanceEvent,
  type GpuFlowFramePerformanceInput,
  type GpuFlowFramePhaseDiagnostics,
  type GpuFlowRetainedTexturePageFrameMetrics,
} from "../framePerformance";
import { type GpuSurfaceHandle } from "../GpuSurface";
import {
  type HtmlSurfaceFrameCanvasSubmission,
  type RenderHtmlSurfaceFrameResult,
} from "../htmlSurfaces/frame";
import type { HtmlSurfaceTextureEvictionResult } from "../htmlSurfaces/textures";
import { createGpuFlowInteractionDiagnosticsSnapshot } from "../interactionDiagnostics";
import { type GpuNodeInteractionDirtyController } from "../nodeInteractionDirty";
import { type GpuRetainedRuntimeFrame } from "../retainedRuntimeFrame";

import type { GpuFlowNodeLayerState } from "./flowLayerState";
import { type GpuFlowCallbacks } from "./flowSurfaceTypes";
import { markTransformOnlyPaintNodesForViewportFrame } from "./flowTransformOnlyPaintNodes";
import {
  assertGpuFlowVisibleFramePresentationTokenBrand,
  type GpuFlowVisibleFramePresentationToken,
} from "./visibleFramePresentationProofs";

export type GpuFlowNodeLayerFramePerformanceReport = Omit<
  GpuFlowFramePerformanceInput,
  "layerResult"
> & {
  readonly interactionDiagnostics: ReturnType<
    typeof createGpuFlowInteractionDiagnosticsSnapshot
  >;
  readonly phaseDiagnostics: GpuFlowFramePhaseDiagnostics;
  readonly retainedTexturePages:
    | GpuFlowRetainedTexturePageFrameMetrics
    | undefined;
};

function reportGpuFlowPresentedNodeLayerFramePerformance({
  callbacksRef,
  layerResult,
  performanceReport,
  token,
}: {
  readonly callbacksRef: MutableRefObject<GpuFlowCallbacks>;
  readonly layerResult: RenderHtmlSurfaceFrameResult;
  readonly performanceReport:
    | GpuFlowNodeLayerFramePerformanceReport
    | null
    | undefined;
  readonly token: GpuFlowVisibleFramePresentationToken;
}) {
  assertGpuFlowVisibleFramePresentationTokenBrand({ token });
  if (!performanceReport) {
    return;
  }
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
      ...performanceReport,
      layerResult,
    }),
  );
}

export type GpuFlowNodeLayerFrameStatePresentation = {
  readonly callbacksRef: MutableRefObject<GpuFlowCallbacks>;
  readonly layerResult: RenderHtmlSurfaceFrameResult;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
  readonly performanceReport?: GpuFlowNodeLayerFramePerformanceReport | null;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
  readonly retainedTexturePageFollowUpFrame: boolean;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly switchAnimationFollowUpFrame: boolean;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
  readonly viewport: GpuFlowNodeLayerState["viewport"];
  readonly viewportFrame: boolean;
  readonly visibleNodeIdsRef: MutableRefObject<ReadonlySet<string>>;
};

export function presentGpuFlowNodeLayerFrameState({
  token,
  ...presentation
}: GpuFlowNodeLayerFrameStatePresentation & {
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  assertGpuFlowVisibleFramePresentationTokenBrand({ token });
  const layerResult = submitGpuFlowHtmlSurfaceFrameSubmissions({
    layerResult: presentation.layerResult,
    token,
  });
  reportGpuFlowPresentedNodeLayerFramePerformance({
    callbacksRef: presentation.callbacksRef,
    layerResult,
    performanceReport: presentation.performanceReport,
    token,
  });
  updateGpuFlowNodeLayerFrameState({
    ...presentation,
    layerResult,
  });
}

export function submitGpuFlowNodeLayerFrameCanvasSubmission({
  nodeLayerFrameStatePresentation,
  token,
}: {
  readonly nodeLayerFrameStatePresentation: GpuFlowNodeLayerFrameStatePresentation | null;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): GpuFlowNodeLayerFrameStatePresentation | null {
  assertGpuFlowVisibleFramePresentationTokenBrand({ token });
  if (nodeLayerFrameStatePresentation === null) {
    return null;
  }
  return {
    ...nodeLayerFrameStatePresentation,
    layerResult: submitGpuFlowHtmlSurfaceFrameSubmissions({
      layerResult: nodeLayerFrameStatePresentation.layerResult,
      token,
    }),
  };
}

function submitGpuFlowHtmlSurfaceFrameSubmissions({
  layerResult,
  token,
}: {
  readonly layerResult: RenderHtmlSurfaceFrameResult;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): RenderHtmlSurfaceFrameResult {
  const canvasSubmission = layerResult.canvasSubmission ?? null;
  const domTransformSubmission = layerResult.domTransformSubmission ?? null;
  const textureEvictionSubmission =
    layerResult.textureEvictionSubmission ?? null;
  let submittedLayerResult = layerResult;
  if (canvasSubmission) {
    submitGpuFlowHtmlSurfaceCanvasFrame({
      canvasSubmission,
      token,
    });
    submittedLayerResult = {
      ...submittedLayerResult,
      canvasSubmission: null,
    };
  }
  if (domTransformSubmission) {
    submitGpuFlowHtmlSurfaceDomTransformFrame({
      domTransformSubmission,
      token,
    });
    submittedLayerResult = {
      ...submittedLayerResult,
      domTransformSubmission: null,
    };
  }
  if (textureEvictionSubmission) {
    const evictionResult = submitGpuFlowHtmlSurfaceTextureEvictionFrame({
      textureEvictionSubmission,
      token,
    });
    submittedLayerResult = {
      ...submittedLayerResult,
      evictedTextureBytes: evictionResult.evictedBytes,
      evictedTextureNodeIds: evictionResult.evictedSurfaceIds,
      textureEvictionSubmission: null,
      textureMemory: evictionResult.memory,
      textureMemoryBeforeEviction: evictionResult.memoryBefore,
    };
  }
  return submittedLayerResult;
}

function submitGpuFlowHtmlSurfaceCanvasFrame({
  canvasSubmission,
  token,
}: {
  readonly canvasSubmission: HtmlSurfaceFrameCanvasSubmission;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  assertGpuFlowVisibleFramePresentationTokenBrand({ token });
  canvasSubmission.submit();
}

function submitGpuFlowHtmlSurfaceDomTransformFrame({
  domTransformSubmission,
  token,
}: {
  readonly domTransformSubmission: NonNullable<
    RenderHtmlSurfaceFrameResult["domTransformSubmission"]
  >;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): void {
  assertGpuFlowVisibleFramePresentationTokenBrand({ token });
  domTransformSubmission.submit({
    contentFrameId: String(token.contentFrameId),
    presentationId: String(token.presentationId),
    projectionSampleId: String(token.projectionSampleId),
    transactionId: token.transactionId,
  });
}

function submitGpuFlowHtmlSurfaceTextureEvictionFrame({
  textureEvictionSubmission,
  token,
}: {
  readonly textureEvictionSubmission: NonNullable<
    RenderHtmlSurfaceFrameResult["textureEvictionSubmission"]
  >;
  readonly token: GpuFlowVisibleFramePresentationToken;
}): HtmlSurfaceTextureEvictionResult {
  assertGpuFlowVisibleFramePresentationTokenBrand({ token });
  return textureEvictionSubmission.submit();
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
}: GpuFlowNodeLayerFrameStatePresentation) {
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
    surfaceRef.current?.requestFrame("retained-native-visual");
  }
}
