import { type MutableRefObject } from "react";

import type { GpuFlowRuntime } from "../gpuDevice";

import {
  prepareHtmlSurfaceOverlayTextures,
  renderHtmlSurfaceFrame,
  type GpuNodeDomTransformSyncCache,
  type GpuNodeLayout,
} from "../htmlSurfaces/frame";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";

import { HtmlSurfaceRenderer } from "../htmlSurfaces/renderer";

import {
  measureGpuCanvasClientSize,
  type GpuCanvasSize,
  type GpuFrameReason,
} from "../gpuRenderer";

import { type GpuSurfaceHandle } from "../GpuSurface";
import { startGpuFlowFramePerformanceMeasure as startFrameMeasure } from "../gpuFlowPerformanceMarks";

import {
  type GpuNodeInteractionDirtyController,
  type GpuNodeInteractionState,
} from "../nodeInteractionDirty";

import type { GpuFlowCommittedSurfaceFrame } from "../committedSurfaceFrame";
import { type GpuFlowFramePhaseDiagnostics } from "../framePerformance";
import {
  createHtmlSurfaceTextureManager,
  type HtmlSurfaceTextureManager,
} from "../htmlSurfaces/textures";
import {
  createGpuFlowInteractionDiagnosticsSnapshot,
  type MutableGpuFlowInteractionDiagnostics,
} from "../interactionDiagnostics";
import {
  type GpuFlowLiveProjectionSample,
  type GpuFlowProjectionLane,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import {
  getGpuRetainedContentRuntimeScrollOffsets,
  getGpuRetainedContentRuntimeScrollRevision,
  getGpuRetainedContentRuntimeScrollRevisions,
  type GpuRetainedContentRuntimeState,
} from "../retainedContentRuntimeState";
import type { GpuRetainedContentScrollOffsetMap } from "../retainedContentScroll";
import type { GpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import { getGpuRetainedContentSwitchAnimationVisuals } from "../retainedContentSwitchVisuals";
import {
  RetainedContentTexturePageManager,
  type RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";
import { type RetainedDisplayFrame } from "../retainedDisplayFrame";
import {
  createGpuRetainedRuntimeFrame,
  type GpuRetainedRuntimeFrame,
} from "../retainedRuntimeFrame";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import { normalizeGpuViewport } from "../viewportMath";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

import {
  resolveActiveGpuFlowNodeId,
  resolveGpuFlowNodeInteractionActiveNodeId,
} from "./flowFrameInteractionState";
import {
  reportGpuFlowNodeLayerFramePerformance,
  type GpuFlowNodeLayerFrameStatePublication,
} from "./flowFrameLifecycle";
import {
  createGpuFlowNodeLayerFrameNotRenderedResult,
  createGpuFlowNodeLayerFrameVisibleProjectionStateResult,
  type GpuFlowNodeLayerFrameResult,
} from "./flowFrameResult";
import {
  combineGpuFlowHtmlSurfaceNativeVisuals,
  createGpuFlowRetainedContentNativeVisualSignature,
} from "./flowFrameVisuals";
import type { GpuFlowNodeLayerState } from "./flowLayerState";
import { getGpuFlowCommittedSurfaceProtectedTextureSurfaceIds } from "./flowProtectedTextureSurfaceIds";
import {
  shouldReuseGpuFlowRetainedContentFrameCache,
  shouldReuseGpuFlowRetainedRuntimeFrameForSample,
  type GpuFlowRetainedContentFrameCache,
} from "./flowRetainedContentFrameCache";
import {
  markGpuFlowRetainedContentFrameFreshnessDirty,
  settleGpuFlowRetainedContentFrameSwitchAnimationSurfaces,
} from "./flowRetainedContentFreshness";
import {
  postGpuFlowRetainedContentVisualStateChromeReproEvent,
  postGpuFlowRetainedDisplayFrameChromeReproEvent,
  postGpuFlowRetainedDomControlChromeReproEvent,
} from "./flowRetainedFrameDiagnostics";
import { resolveGpuFlowRetainedPageMaintenanceAfterPublish } from "./flowRetainedPageMaintenance";
import {
  hasGpuFlowRetainedContentActiveSwitchAnimationSurfaces,
  syncGpuFlowRetainedContentSwitchAnimationSurfaces,
} from "./flowRetainedSwitchAnimationFrame";
import { combineGpuFlowRetainedTexturePageMetrics } from "./flowRetainedTextureMetrics";
import {
  EMPTY_GPU_NODE_LAYOUTS,
  type GpuFlowCallbacks,
} from "./flowSurfaceTypes";
import { createGpuFlowVisibleProjectionStateForRetainedPublication } from "./flowVisibleProjectionState";
import { projectGpuRetainedDomControlSnapshotSurfaceLayouts } from "./retainedDomControlSnapshotSources";
import {
  assertGpuFlowCommittedSurfacePublicationCandidatePublished,
  type GpuFlowCommittedSurfacePublicationCandidate,
  type GpuFlowCommittedSurfacePublicationCandidatePreparer,
  type GpuFlowCommittedSurfacePublicationFramePlanSelector,
  type GpuFlowRetainedDisplayFollowUpFrameNotifier,
  type GpuFlowRetainedDisplayPublicationFramePlanSelector,
  type GpuFlowRetainedDisplayPublicationPreparer,
} from "./visibleFramePublicationKernel";

export function resolveRenderableGpuFlowLayerFrameInput({
  canvasSizeRef,
  nodeLayerRef,
  htmlSurfaceRendererRef,
  retainedContentPageManagerRef,
  runtime,
  textureManagerRef,
}: {
  readonly canvasSizeRef: MutableRefObject<GpuCanvasSize | null>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
  readonly htmlSurfaceRendererRef: MutableRefObject<HtmlSurfaceRenderer | null>;
  readonly runtime: GpuFlowRuntime;
  readonly retainedContentPageManagerRef: MutableRefObject<RetainedContentTexturePageManager | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
}): {
  readonly canvasSize: GpuCanvasSize;
  readonly layer: GpuFlowNodeLayerState;
  readonly nodes: readonly GpuNodeLayout[];
  readonly resources: {
    readonly htmlSurfaceRenderer: HtmlSurfaceRenderer;
    readonly retainedContentPageManager: RetainedContentTexturePageManager;
    readonly textureManager: HtmlSurfaceTextureManager;
  };
} | null {
  const layer = nodeLayerRef.current;
  if (!hasRenderableGpuFlowLayer(layer)) {
    return null;
  }
  const canvasSize =
    canvasSizeRef.current ?? measureGpuCanvasClientSize(runtime.canvas);
  if (!hasRenderableGpuFlowCanvasSize(canvasSize)) {
    return null;
  }
  return {
    canvasSize,
    layer,
    nodes: layer.nodes ?? EMPTY_GPU_NODE_LAYOUTS,
    resources: ensureNodeLayerResources({
      htmlSurfaceRendererRef,
      retainedContentPageManagerRef,
      runtime,
      textureManagerRef,
    }),
  };
}

function ensureNodeLayerResources({
  htmlSurfaceRendererRef,
  retainedContentPageManagerRef,
  runtime,
  textureManagerRef,
}: {
  readonly htmlSurfaceRendererRef: MutableRefObject<HtmlSurfaceRenderer | null>;
  readonly retainedContentPageManagerRef: MutableRefObject<RetainedContentTexturePageManager | null>;
  readonly runtime: GpuFlowRuntime;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
}) {
  if (!textureManagerRef.current) {
    textureManagerRef.current = createHtmlSurfaceTextureManager(runtime);
  }
  if (!htmlSurfaceRendererRef.current) {
    htmlSurfaceRendererRef.current = new HtmlSurfaceRenderer(runtime);
  }
  if (!retainedContentPageManagerRef.current) {
    retainedContentPageManagerRef.current =
      new RetainedContentTexturePageManager(
        runtime.device,
        runtime.canvas.ownerDocument,
      );
  }

  return {
    htmlSurfaceRenderer: htmlSurfaceRendererRef.current,
    retainedContentPageManager: retainedContentPageManagerRef.current,
    textureManager: textureManagerRef.current,
  };
}

function hasRenderableGpuFlowLayer(layer: GpuFlowNodeLayerState): boolean {
  return Boolean(
    layer.nodes ||
      layer.edges ||
      layer.grid ||
      layer.edgeLabelSurfaces?.length ||
      layer.htmlSurfaceNativeVisuals?.length ||
      layer.scene?.contentSurfaces.length,
  );
}

function hasRenderableGpuFlowCanvasSize(canvasSize: GpuCanvasSize): boolean {
  return canvasSize.cssWidth > 0 && canvasSize.cssHeight > 0;
}

export function destroyNodeLayerResources(
  textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>,
  htmlSurfaceRendererRef: MutableRefObject<HtmlSurfaceRenderer | null>,
  retainedContentPageManagerRef?: MutableRefObject<RetainedContentTexturePageManager | null>,
) {
  textureManagerRef.current?.destroy();
  textureManagerRef.current = null;
  htmlSurfaceRendererRef.current?.destroy();
  htmlSurfaceRendererRef.current = null;
  retainedContentPageManagerRef?.current?.destroy();
  if (retainedContentPageManagerRef) {
    retainedContentPageManagerRef.current = null;
  }
}

export function destroyNodeInteractionResources(
  nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>,
  nodeInteractionCleanupRef: MutableRefObject<(() => void) | null>,
) {
  nodeInteractionCleanupRef.current?.();
  nodeInteractionCleanupRef.current = null;
  nodeInteractionRef.current = null;
}

export function syncGpuFlowNodeInteractionState({
  nodeElementByIdRef,
  previousActiveNodeIdRef,
  state,
}: {
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly previousActiveNodeIdRef: MutableRefObject<string | null>;
  readonly state: GpuNodeInteractionState;
}): readonly string[] {
  const previousActiveNodeId = previousActiveNodeIdRef.current;
  const deactivatedNodeIds: string[] = [];
  if (previousActiveNodeId && previousActiveNodeId !== state.activeNodeId) {
    const previousElement =
      nodeElementByIdRef.current.get(previousActiveNodeId);
    if (previousElement) {
      setGpuFlowNodeInteractionElementState(previousElement, false);
      deactivatedNodeIds.push(previousActiveNodeId);
    }
  }
  if (state.activeNodeId) {
    const activeElement = nodeElementByIdRef.current.get(state.activeNodeId);
    if (activeElement) {
      setGpuFlowNodeInteractionElementState(activeElement, true);
    }
  }
  previousActiveNodeIdRef.current = state.activeNodeId;
  return deactivatedNodeIds;
}

function setGpuFlowNodeInteractionElementState(
  element: HTMLElement,
  interactive: boolean,
) {
  element.dataset.gpuFlowInteractive = interactive ? "true" : "false";
  element.classList.toggle("setta-gpu-flow__node--interactive", interactive);
}

export function nextFrame(frameRef: MutableRefObject<number>): number {
  frameRef.current += 1;
  return frameRef.current;
}

function resolveGpuFlowRetainedContentFrame({
  canvasSize,
  contentSurfaces,
  deferResolutionUpdates,
  devicePixelRatio,
  frame,
  retainedContentFrameCacheRef,
  retainedContentPageManager,
  retainedContentRuntimeState,
  sceneRevision,
  layer,
  viewport,
  viewportZoomBucket,
}: {
  readonly canvasSize: GpuCanvasSize;
  readonly contentSurfaces: readonly GpuContentSurface[] | undefined;
  readonly deferResolutionUpdates: boolean;
  readonly devicePixelRatio: number;
  readonly frame: number;
  readonly layer: GpuFlowNodeLayerState;
  readonly retainedContentFrameCacheRef: MutableRefObject<GpuFlowRetainedContentFrameCache | null>;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly sceneRevision: number;
  readonly viewport: GpuFlowLiveProjectionSample["viewport"];
  readonly viewportZoomBucket: number;
}): {
  readonly phaseDiagnostics: Pick<
    GpuFlowFramePhaseDiagnostics,
    "retainedPageFrameMs" | "retainedRuntimeFrameMs"
  >;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly retainedRuntimeFrame: GpuRetainedRuntimeFrame;
} {
  const cachedFrame = retainedContentFrameCacheRef.current;
  const scrollOffsets = getGpuRetainedContentRuntimeScrollOffsets(
    retainedContentRuntimeState,
  );
  const scrollRevision = getGpuRetainedContentRuntimeScrollRevision(
    retainedContentRuntimeState,
  );
  const scrollRevisions = getGpuRetainedContentRuntimeScrollRevisions(
    retainedContentRuntimeState,
  );
  const nativeVisualSignature =
    createGpuFlowRetainedContentNativeVisualSignature(layer);
  const pageDrawableRevision = retainedContentPageManager.getDrawableRevision();
  if (
    cachedFrame &&
    shouldReuseGpuFlowRetainedContentFrameCache({
      cachedFrame,
      contentSurfaces,
      devicePixelRatio,
      pageDrawableRevision,
      sceneRevision,
      scrollRevision,
      viewportSize: {
        height: canvasSize.cssHeight,
        width: canvasSize.cssWidth,
      },
      viewportZoomBucket,
      allowCoveredRefinementBacklog: deferResolutionUpdates,
    })
  ) {
    const finishRetainedRuntimeFrameMeasure = startFrameMeasure(
      "retained-runtime-frame",
      frame,
      { cacheHit: true },
    );
    const retainedRuntimeFrame =
      shouldReuseGpuFlowRetainedRuntimeFrameForSample({
        cachedFrame,
        nativeVisualSignature,
        viewport,
      })
        ? cachedFrame.retainedRuntimeFrame
        : createGpuFlowRetainedRuntimeFrameForLayer({
            canvasSize,
            devicePixelRatio,
            frame,
            layer,
            scrollOffsets,
            scrollRevision,
            scrollRevisions,
            viewport,
            viewportZoomBucket,
          });
    const retainedRuntimeFrameMs = finishRetainedRuntimeFrameMeasure();
    const finishRetainedPageFrameMeasure = startFrameMeasure(
      "retained-page-frame",
      frame,
      { cacheHit: true },
    );
    const preparedFrame = {
      ...cachedFrame.preparedFrame,
      frame,
    };
    const retainedPageFrameMs = finishRetainedPageFrameMeasure();
    retainedContentFrameCacheRef.current = {
      ...cachedFrame,
      nativeVisualSignature,
      preparedFrame,
      retainedRuntimeFrame,
    };
    return {
      phaseDiagnostics: { retainedPageFrameMs, retainedRuntimeFrameMs },
      preparedFrame,
      retainedRuntimeFrame,
    };
  }

  const finishRetainedRuntimeFrameMeasure = startFrameMeasure(
    "retained-runtime-frame",
    frame,
    { cacheHit: false },
  );
  const retainedRuntimeFrame = createGpuFlowRetainedRuntimeFrameForLayer({
    canvasSize,
    devicePixelRatio,
    frame,
    layer,
    scrollOffsets,
    scrollRevision,
    scrollRevisions,
    viewport,
    viewportZoomBucket,
  });
  const retainedRuntimeFrameMs = finishRetainedRuntimeFrameMeasure();
  const finishRetainedPageFrameMeasure = startFrameMeasure(
    "retained-page-frame",
    frame,
    { cacheHit: false },
  );
  const preparedFrame = retainedContentPageManager.prepareFrame({
    devicePixelRatio,
    frame,
    surfaces: retainedRuntimeFrame.descriptors.contentPageSurfaces,
    viewportZoomBucket,
  });
  const retainedPageFrameMs = finishRetainedPageFrameMeasure();
  retainedContentFrameCacheRef.current = {
    contentSurfaces,
    devicePixelRatio,
    pageDrawableRevision,
    preparedFrame,
    retainedRuntimeFrame,
    sceneRevision,
    scrollRevision,
    nativeVisualSignature,
    viewportZoomBucket,
    viewportSize: {
      height: canvasSize.cssHeight,
      width: canvasSize.cssWidth,
    },
  };
  return {
    phaseDiagnostics: { retainedPageFrameMs, retainedRuntimeFrameMs },
    preparedFrame,
    retainedRuntimeFrame,
  };
}

function createGpuFlowRetainedRuntimeFrameForLayer({
  canvasSize,
  devicePixelRatio,
  frame,
  layer,
  scrollOffsets,
  scrollRevision,
  scrollRevisions,
  viewport,
  viewportZoomBucket,
}: {
  readonly canvasSize: GpuCanvasSize;
  readonly devicePixelRatio: number;
  readonly frame: number;
  readonly layer: GpuFlowNodeLayerState;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly scrollRevision: number;
  readonly scrollRevisions: ReadonlyMap<string, number>;
  readonly viewport: GpuFlowLiveProjectionSample["viewport"];
  readonly viewportZoomBucket: number;
}): GpuRetainedRuntimeFrame {
  return createGpuRetainedRuntimeFrame({
    devicePixelRatioBucket: devicePixelRatio,
    frameId: frame,
    rowHoverTarget: layer.retainedContentRowHoverTarget ?? null,
    scene: layer.scene,
    scrollbarVisualState: layer.retainedContentScrollbarVisualState,
    scrollOffsets,
    scrollRevision,
    scrollRevisions,
    viewport,
    viewportSize: {
      height: canvasSize.cssHeight,
      width: canvasSize.cssWidth,
    },
    viewportZoomBucket,
  });
}

export {
  shouldReuseGpuFlowRetainedContentFrameCache,
  shouldReuseGpuFlowRetainedRuntimeFrameForSample,
  type GpuFlowRetainedContentFrameCache,
} from "./flowRetainedContentFrameCache";
export { shouldDeferGpuFlowRetainedContentPostSubmitMaintenance } from "./flowRetainedPageMaintenance";

export function renderGpuFlowNodeLayerFrame({
  activeResizeNodeIdRef,
  callbacksRef,
  canvasSizeRef,
  deferBrowserVisualRetry,
  deferResolutionUpdates,
  frameReasons,
  frameRef,
  interactionDiagnosticsRef,
  nodeElementByIdRef,
  nodeDomTransformSyncCacheRef,
  nodeInteractionRef,
  nodeLayerRef,
  htmlSurfaceRendererRef,
  runtime,
  retainedContentPageManagerRef,
  retainedContentRuntimeState,
  retainedDisplayFrameRef,
  retainedContentSwitchAnimations,
  retainedContentFrameCacheRef,
  heldPreviousProjectionState,
  liveProjectionSample,
  publicationLane,
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
  visibleNodeIdsRef,
  viewportStore,
  viewportFrame,
  onRetainedPreparedRuntimeFrame,
  onRetainedRuntimeFrame,
  onRetainedDisplayFrame,
  onRetainedDisplayFramePublishable,
  onRetainedDisplayFollowUpFrameNeeded,
  onNodeLayerFrameStatePublishable,
  notifyRetainedDisplayFollowUpFrameNeeded,
  prepareCommittedSurfacePublicationCandidate,
  prepareRetainedDisplayPublicationCandidate,
  selectCommittedSurfacePublicationFramePlan,
  selectRetainedDisplayPublicationFramePlan,
}: {
  readonly activeResizeNodeIdRef: MutableRefObject<string | null>;
  readonly callbacksRef: MutableRefObject<GpuFlowCallbacks>;
  readonly canvasSizeRef: MutableRefObject<GpuCanvasSize | null>;
  readonly deferBrowserVisualRetry: boolean;
  readonly deferResolutionUpdates: boolean;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly frameRef: MutableRefObject<number>;
  readonly interactionDiagnosticsRef: MutableRefObject<MutableGpuFlowInteractionDiagnostics>;
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
  readonly htmlSurfaceRendererRef: MutableRefObject<HtmlSurfaceRenderer | null>;
  readonly runtime: GpuFlowRuntime;
  readonly retainedContentPageManagerRef: MutableRefObject<RetainedContentTexturePageManager | null>;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly retainedDisplayFrameRef: MutableRefObject<RetainedDisplayFrame | null>;
  readonly retainedContentSwitchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly retainedContentFrameCacheRef: MutableRefObject<GpuFlowRetainedContentFrameCache | null>;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly liveProjectionSample: GpuFlowLiveProjectionSample;
  readonly publicationLane: Extract<
    GpuFlowProjectionLane,
    "content" | "maintenance"
  >;
  readonly onRetainedRuntimeFrame?:
    | ((frame: GpuRetainedRuntimeFrame) => void)
    | undefined;
  readonly onRetainedDisplayFrame?:
    | ((
        frame: RetainedDisplayFrame,
        options?:
          | {
              readonly gpuNativeVisuals:
                | readonly HtmlSurfaceSolidRoundedRectVisual[]
                | undefined;
            }
          | undefined,
      ) => GpuFlowCommittedSurfaceFrame | void)
    | undefined;
  readonly onRetainedDisplayFramePublishable?:
    | ((frame: RetainedDisplayFrame) => void)
    | undefined;
  readonly onRetainedDisplayFollowUpFrameNeeded?:
    | ((reason: GpuFrameReason) => void)
    | undefined;
  readonly onNodeLayerFrameStatePublishable?:
    | ((publication: GpuFlowNodeLayerFrameStatePublication) => void)
    | undefined;
  readonly notifyRetainedDisplayFollowUpFrameNeeded: GpuFlowRetainedDisplayFollowUpFrameNotifier;
  readonly prepareCommittedSurfacePublicationCandidate: GpuFlowCommittedSurfacePublicationCandidatePreparer;
  readonly prepareRetainedDisplayPublicationCandidate: GpuFlowRetainedDisplayPublicationPreparer;
  readonly selectCommittedSurfacePublicationFramePlan: GpuFlowCommittedSurfacePublicationFramePlanSelector;
  readonly selectRetainedDisplayPublicationFramePlan: GpuFlowRetainedDisplayPublicationFramePlanSelector;
  readonly onRetainedPreparedRuntimeFrame?:
    | ((frame: GpuRetainedRuntimeFrame) => void)
    | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
  readonly visibleNodeIdsRef: MutableRefObject<ReadonlySet<string>>;
  readonly viewportStore: GpuFlowViewportStoreApi;
  readonly viewportFrame: boolean;
}): GpuFlowNodeLayerFrameResult {
  const frameInput = resolveRenderableGpuFlowLayerFrameInput({
    canvasSizeRef,
    nodeLayerRef,
    htmlSurfaceRendererRef,
    retainedContentPageManagerRef,
    runtime,
    textureManagerRef,
  });
  if (!frameInput) {
    return createGpuFlowNodeLayerFrameNotRenderedResult();
  }
  const { canvasSize, layer, nodes, resources } = frameInput;
  const frame = nextFrame(frameRef);
  const renderStartedAt = performance.now();
  let committedContentPublishMs = 0;
  let diagnosticsMs = 0;
  let htmlSurfaceFrameMs = 0;
  let retainedDisplayTransactionMs = 0;
  let retainedPageMaintenanceMs = 0;
  const darkMode = isGpuFlowFrameDarkMode(runtime.canvas);
  const visualStateDiagnosticsStart = performance.now();
  postGpuFlowRetainedContentVisualStateChromeReproEvent({
    frame,
    scene: layer.scene,
    viewportInteractionActive: deferResolutionUpdates,
  });
  diagnosticsMs += performance.now() - visualStateDiagnosticsStart;
  const runtimeScrollOffsets = getGpuRetainedContentRuntimeScrollOffsets(
    retainedContentRuntimeState,
  );
  syncGpuFlowRetainedContentSwitchAnimationSurfaces({
    nowMs: renderStartedAt,
    scrollOffsets: runtimeScrollOffsets,
    scene: layer.scene,
    switchAnimations: retainedContentSwitchAnimations,
  });
  const viewportZoomBucket =
    resources.retainedContentPageManager.resolveFrameViewportZoomBucket({
      viewportInteractionActive: deferResolutionUpdates,
      zoom: normalizeGpuViewport(liveProjectionSample.viewport).zoom,
    });
  const retainedSceneInput = createGpuFlowRetainedContentFrameSceneInput(
    layer.scene,
  );
  const retainedFrame = resolveGpuFlowRetainedContentFrame({
    canvasSize,
    contentSurfaces: retainedSceneInput.contentSurfaces,
    deferResolutionUpdates,
    devicePixelRatio: canvasSize.devicePixelRatio,
    frame,
    layer,
    retainedContentFrameCacheRef,
    retainedContentPageManager: resources.retainedContentPageManager,
    retainedContentRuntimeState,
    sceneRevision: retainedSceneInput.sceneRevision,
    viewport: liveProjectionSample.viewport,
    viewportZoomBucket,
  });
  const retainedRuntimeFrame = retainedFrame.retainedRuntimeFrame;
  let retainedPagePreparedFrame = retainedFrame.preparedFrame;
  notifyGpuFlowRetainedRuntimeFrame(
    onRetainedPreparedRuntimeFrame,
    retainedRuntimeFrame,
  );
  const previousRetainedDisplayFrame = retainedDisplayFrameRef.current;
  const retainedDisplayPublication = prepareRetainedDisplayPublicationCandidate(
    {
      darkMode,
      deferResolutionUpdates,
      nowMs: renderStartedAt,
      preparedFrame: retainedPagePreparedFrame,
      previousRetainedDisplayFrame,
      retainedContentPageManager: resources.retainedContentPageManager,
      retainedRuntimeFrame,
    },
  );
  retainedPagePreparedFrame =
    retainedDisplayPublication.retainedPagePreparedFrame;
  const prePublishRetainedPageMaintenance =
    retainedDisplayPublication.prePublishRetainedPageMaintenance;
  retainedDisplayTransactionMs +=
    retainedDisplayPublication.retainedDisplayTransactionMs;
  retainedPageMaintenanceMs +=
    retainedDisplayPublication.retainedPageMaintenanceMs;
  const retainedDisplayPublicationFramePlan =
    selectRetainedDisplayPublicationFramePlan({
      retainedDisplayOutcome: retainedDisplayPublication.retainedDisplayOutcome,
    });
  if (retainedDisplayPublicationFramePlan.kind === "blocked") {
    return retainedDisplayPublicationFramePlan.frameResult;
  }
  const publishedRetainedDisplayOutcomeFrame =
    retainedDisplayPublicationFramePlan.publishedOutcomeFrame;
  notifyRetainedDisplayFollowUpFrameNeeded({
    deferResolutionUpdates,
    onRetainedDisplayFollowUpFrameNeeded,
    outcomeKind: publishedRetainedDisplayOutcomeFrame.outcomeKind,
  });
  const publishedRetainedFrame = publishedRetainedDisplayOutcomeFrame.frame;
  const publishedRetainedRuntimeFrame =
    publishedRetainedFrame.retainedRuntimeFrame;
  const publishedRetainedPageFrame = publishedRetainedFrame.pageFrame;
  const switchAnimationNativeVisuals =
    getGpuRetainedContentSwitchAnimationVisuals({
      darkMode,
      nowMs: renderStartedAt,
      scrollOffsets: publishedRetainedRuntimeFrame.input.scrollOffsets,
      scene: layer.scene,
      switchAnimations: retainedContentSwitchAnimations,
    });
  const retainedRuntimeNativeVisuals =
    publishedRetainedRuntimeFrame.descriptors.htmlSurfaceNativeVisuals;
  const committedGpuNativeVisuals = combineGpuFlowHtmlSurfaceNativeVisuals(
    retainedRuntimeNativeVisuals,
    switchAnimationNativeVisuals,
  );
  const finishCommittedPublishMeasure = startFrameMeasure(
    "committed-surface-frame-publication",
    frame,
    { retainedDisplayFrameId: publishedRetainedFrame.id },
  );
  const publishedCommittedSurfaceFrame = onRetainedDisplayFrame?.(
    publishedRetainedFrame,
    {
      gpuNativeVisuals: committedGpuNativeVisuals,
    },
  );
  committedContentPublishMs += finishCommittedPublishMeasure();
  const retainedDiagnosticsStart = performance.now();
  postGpuFlowRetainedDisplayFrameChromeReproEvent({
    frame,
    preparedFrame: retainedPagePreparedFrame,
    publishedFrame: publishedRetainedFrame,
    viewportInteractionActive: deferResolutionUpdates,
  });
  postGpuFlowRetainedDomControlChromeReproEvent({
    frame,
    preparedFrame: publishedRetainedPageFrame,
    sources: publishedRetainedRuntimeFrame.descriptors.domControlSources,
    viewportInteractionActive: deferResolutionUpdates,
  });
  diagnosticsMs += performance.now() - retainedDiagnosticsStart;
  const committedSurfacePublicationCandidate =
    prepareCommittedSurfacePublicationCandidate({
      committedGpuNativeVisuals,
      deferBrowserVisualRetry,
      frameReasons,
      heldPreviousProjectionState,
      liveProjectionSample,
      publicationLane,
      publishedCommittedSurfaceFrame,
      publishedRetainedFrame,
    });
  const getRetainedDomControlRuntimeScrollOffset = (surfaceId: string) =>
    runtimeScrollOffsets.get(surfaceId) ?? null;
  prepareHtmlSurfaceOverlayTexturesForCommittedSurfaceCandidate({
    input: {
      canvasSize,
      deferResolutionUpdates,
      elementByNodeId: nodeElementByIdRef.current,
      frame,
      htmlSurfaceOverlays: layer.edgeLabelSurfaces,
      marginCssPx: layer.marginCssPx,
      textureManager: resources.textureManager,
      uploadBudget: layer.uploadBudget,
      viewport: liveProjectionSample.viewport,
    },
    publicationKind: committedSurfacePublicationCandidate.kind,
  });
  const committedSurfacePublicationFramePlan =
    selectCommittedSurfacePublicationFramePlan({
      candidate: committedSurfacePublicationCandidate,
      publishedCommittedSurfaceFrame,
    });
  if (committedSurfacePublicationFramePlan.kind === "frame-result") {
    return committedSurfacePublicationFramePlan.frameResult;
  }
  const committedSurfacePublication =
    committedSurfacePublicationFramePlan.committedSurfacePublication;
  markGpuFlowRetainedContentFrameFreshnessDirty({
    deferResolutionUpdates,
    frame,
    retainedContentPageManager: resources.retainedContentPageManager,
    rowHoverTarget: resolveGpuFlowRetainedContentRowHoverTarget(layer),
    scrollOffsets: runtimeScrollOffsets,
    sourceSurfaces: retainedRuntimeFrame.descriptors.sourceSurfaces,
    switchAnimations: retainedContentSwitchAnimations,
  });
  const htmlSurfaceOverlays =
    projectGpuRetainedDomControlSnapshotSurfaceLayouts({
      controls: publishedRetainedRuntimeFrame.descriptors.domControlSources,
      getRetainedScrollOffset: getRetainedDomControlRuntimeScrollOffset,
      overlays: layer.edgeLabelSurfaces,
    });
  const htmlSurfaceFrameStart = performance.now();
  const layerResult = renderHtmlSurfaceFrame({
    activeNodeId: resolveActiveGpuFlowNodeId({
      activeResizeNodeIdRef,
      nodeInteractionRef,
    }),
    canvasSize,
    deferResolutionUpdates,
    domTransformCache: nodeDomTransformSyncCacheRef.current,
    edges: layer.edges,
    edgePalette: layer.edgePalette,
    elementByNodeId: nodeElementByIdRef.current,
    forceVisibleNodeIds: layer.forceVisibleNodeIds,
    frame,
    grid: layer.grid,
    htmlSurfaceOverlays,
    htmlSurfaceNativeVisuals: committedGpuNativeVisuals,
    htmlSurfacePageVisuals: publishedRetainedPageFrame.flatSurfaces,
    marginCssPx: layer.marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes: layer.nodeTextureMemoryBudgetBytes,
    protectedTextureSurfaceIds:
      getGpuFlowCommittedSurfaceProtectedTextureSurfaceIds(
        publishedCommittedSurfaceFrame,
      ),
    renderer: resources.htmlSurfaceRenderer,
    textureManager: resources.textureManager,
    uploadBudget: layer.uploadBudget,
    viewport: liveProjectionSample.viewport,
  });
  htmlSurfaceFrameMs += performance.now() - htmlSurfaceFrameStart;
  const retainedPageMaintenanceStart = performance.now();
  const retainedPageMaintenance =
    resolveGpuFlowRetainedPageMaintenanceAfterPublish({
      darkMode,
      deferResolutionUpdates,
      existingMaintenance: prePublishRetainedPageMaintenance,
      forceDeferPostSubmitMaintenance: deferResolutionUpdates,
      preparedFrame: retainedPagePreparedFrame,
      publishedProtectedPageKeys: publishedRetainedPageFrame.protectedPageKeys,
      retainedContentPageManager: resources.retainedContentPageManager,
    });
  const deferRetainedPageMaintenance = retainedPageMaintenance.deferred;
  const retainedPageResult = retainedPageMaintenance.result;
  settleGpuFlowRetainedContentFrameSwitchAnimationSurfaces({
    deferRetainedPageMaintenance,
    nowMs: renderStartedAt,
    retainedContentPageManager: resources.retainedContentPageManager,
    scrollOffsets: runtimeScrollOffsets,
    sourceSurfaces: retainedRuntimeFrame.descriptors.sourceSurfaces,
    switchAnimations: retainedContentSwitchAnimations,
  });
  retainedPageMaintenanceMs += performance.now() - retainedPageMaintenanceStart;
  const switchAnimationNeedsFollowUpFrame =
    hasGpuFlowRetainedContentActiveSwitchAnimationSurfaces({
      nowMs: renderStartedAt,
      scene: layer.scene,
      switchAnimations: retainedContentSwitchAnimations,
    });
  const combinedLayerResult = {
    ...layerResult,
    budgetExhausted: layerResult.budgetExhausted,
  };
  const visibleProjectionState =
    createGpuFlowVisibleProjectionStateForRetainedPublication({
      committedGpuNativeVisuals,
      frameReasons,
      heldPreviousProjectionState,
      liveProjectionSample,
      publicationLane,
      publishedCommittedSurfaceFrame,
      publishedRetainedFrame,
      retainedDisplayOutcomeKind:
        publishedRetainedDisplayOutcomeFrame.outcomeKind,
    });
  reportGpuFlowNodeLayerFramePerformance({
    callbacksRef,
    deferResolutionUpdates,
    frame,
    frameReasons,
    interactionDiagnostics: createGpuFlowInteractionDiagnosticsSnapshot({
      activeResizeNodeId: activeResizeNodeIdRef.current,
      diagnostics: interactionDiagnosticsRef.current,
      nodeInteractionActiveNodeId:
        resolveGpuFlowNodeInteractionActiveNodeId(nodeInteractionRef),
      ownerDocument: runtime.canvas.ownerDocument,
      viewportState: viewportStore.getState(),
    }),
    layerResult: combinedLayerResult,
    phaseDiagnostics: {
      committedContentPublishMs,
      diagnosticsMs,
      domTextActorProjectionMs: 0,
      frameMode: "content",
      htmlSurfaceFrameMs,
      projectionSurfaceResolveMs: 0,
      retainedDisplayTransactionMs,
      retainedPageFrameMs: retainedFrame.phaseDiagnostics.retainedPageFrameMs,
      retainedPageMaintenanceMs,
      retainedRuntimeFrameMs:
        retainedFrame.phaseDiagnostics.retainedRuntimeFrameMs,
      schedulingMs: 0,
    },
    projectionDebugState: visibleProjectionState.debugState,
    renderDurationMs: performance.now() - renderStartedAt,
    retainedTexturePages: combineGpuFlowRetainedTexturePageMetrics({
      retainedDisplayFrame: publishedRetainedFrame,
      retainedPageResult,
    }),
    viewport: liveProjectionSample.viewport,
    viewportFrame,
  });
  onNodeLayerFrameStatePublishable?.({
    callbacksRef,
    layerResult: combinedLayerResult,
    nodeInteractionRef,
    nodeLayerRef,
    retainedRuntimeFrame: publishedRetainedRuntimeFrame,
    retainedTexturePageFollowUpFrame: retainedPageResult.needsFollowUpFrame,
    surfaceRef,
    switchAnimationFollowUpFrame: switchAnimationNeedsFollowUpFrame,
    transformOnlyPaintNodeIdsRef,
    viewport: liveProjectionSample.viewport,
    viewportFrame,
    visibleNodeIdsRef,
  });
  assertGpuFlowCommittedSurfacePublicationCandidatePublished(
    committedSurfacePublicationCandidate,
  );
  onRetainedDisplayFramePublishable?.(publishedRetainedFrame);
  notifyGpuFlowRetainedRuntimeFrame(
    onRetainedRuntimeFrame,
    publishedRetainedRuntimeFrame,
  );
  return createGpuFlowNodeLayerFrameVisibleProjectionStateResult(
    visibleProjectionState,
    { committedSurfacePublication },
  );
}

function createGpuFlowRetainedContentFrameSceneInput(
  scene: GpuFlowScene | null | undefined,
): {
  readonly contentSurfaces: readonly GpuContentSurface[] | undefined;
  readonly sceneRevision: number;
} {
  return {
    contentSurfaces: scene?.contentSurfaces,
    sceneRevision: scene?.revision ?? 0,
  };
}

function resolveGpuFlowRetainedContentRowHoverTarget(
  layer: GpuFlowNodeLayerState,
): GpuFlowNodeLayerState["retainedContentRowHoverTarget"] | null {
  return layer.retainedContentRowHoverTarget ?? null;
}

function notifyGpuFlowRetainedRuntimeFrame(
  callback: ((frame: GpuRetainedRuntimeFrame) => void) | undefined,
  frame: GpuRetainedRuntimeFrame,
) {
  callback?.(frame);
}

function prepareHtmlSurfaceOverlayTexturesForCommittedSurfaceCandidate({
  input,
  publicationKind,
}: {
  readonly input: Parameters<typeof prepareHtmlSurfaceOverlayTextures>[0];
  readonly publicationKind: GpuFlowCommittedSurfacePublicationCandidate["kind"];
}) {
  if (publicationKind === "publish") {
    return;
  }
  prepareHtmlSurfaceOverlayTextures(input);
}

function isGpuFlowFrameDarkMode(canvas: HTMLCanvasElement): boolean {
  const root = canvas.ownerDocument.documentElement;
  return Boolean(canvas.closest(".dark") ?? root.closest(".dark"));
}
