import { type MutableRefObject } from "react";

import type { GpuFlowRuntime } from "../gpuDevice";

import {
  renderHtmlSurfaceFrame,
  type GpuNodeDomTransformSyncCache,
  type GpuNodeLayout,
  type RenderHtmlSurfaceFrameResult,
} from "../htmlSurfaces/frame";
import type { HtmlSurfaceSolidRoundedRectVisual } from "../htmlSurfaces/visualScene";

import { HtmlSurfaceRenderer } from "../htmlSurfaces/renderer";

import {
  measureGpuCanvasClientSize,
  type GpuCanvasSize,
  type GpuFrameReason,
} from "../gpuRenderer";

import { type GpuSurfaceHandle } from "../GpuSurface";

import {
  type GpuNodeInteractionDirtyController,
  type GpuNodeInteractionState,
} from "../nodeInteractionDirty";

import {
  createGpuFlowFramePerformanceEvent,
  type GpuFlowFramePhaseDiagnostics,
  type GpuFlowRetainedTexturePageFrameMetrics,
} from "../framePerformance";
import {
  createHtmlSurfaceTextureManager,
  type HtmlSurfaceTextureManager,
} from "../htmlSurfaces/textures";
import {
  createGpuFlowInteractionDiagnosticsSnapshot,
  type MutableGpuFlowInteractionDiagnostics,
} from "../interactionDiagnostics";
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
import {
  createRetainedDisplayFrameInput,
  resolveRetainedDisplayFrameTransaction,
  type RetainedDisplayFrame,
} from "../retainedDisplayFrame";
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
import type { GpuFlowNodeLayerState } from "./flowLayerState";
import {
  shouldReuseGpuFlowRetainedContentFrameCache,
  type GpuFlowRetainedContentFrameCache,
} from "./flowRetainedContentFrameCache";
import {
  markGpuFlowRetainedContentFrameFreshnessDirty,
  sampleGpuFlowRetainedContentSwitchAnimationSurface,
  settleGpuFlowRetainedContentFrameSwitchAnimationSurfaces,
} from "./flowRetainedContentFreshness";
import {
  postGpuFlowRetainedContentVisualStateChromeReproEvent,
  postGpuFlowRetainedDisplayFrameChromeReproEvent,
  postGpuFlowRetainedDomControlChromeReproEvent,
} from "./flowRetainedFrameDiagnostics";
import { resolveGpuFlowRetainedPageMaintenanceAfterPublish } from "./flowRetainedPageMaintenance";
import { combineGpuFlowRetainedTexturePageMetrics } from "./flowRetainedTextureMetrics";
import {
  EMPTY_GPU_NODE_LAYOUTS,
  type GpuFlowCallbacks,
} from "./flowSurfaceTypes";

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

function combineGpuFlowHtmlSurfaceNativeVisuals(
  baseVisuals: readonly HtmlSurfaceSolidRoundedRectVisual[] | null | undefined,
  ...visualGroups: readonly (readonly HtmlSurfaceSolidRoundedRectVisual[])[]
): readonly HtmlSurfaceSolidRoundedRectVisual[] | undefined {
  const transientVisuals = visualGroups.flat();
  if (!baseVisuals?.length && transientVisuals.length === 0) {
    return undefined;
  }
  if (!baseVisuals?.length) {
    return transientVisuals;
  }
  if (transientVisuals.length === 0) {
    return baseVisuals;
  }
  return [...baseVisuals, ...transientVisuals];
}

export function nextFrame(frameRef: MutableRefObject<number>): number {
  frameRef.current += 1;
  return frameRef.current;
}

function resolveGpuFlowRetainedContentFrame({
  contentSurfaces,
  deferResolutionUpdates,
  devicePixelRatio,
  frame,
  retainedContentFrameCacheRef,
  retainedContentPageManager,
  retainedContentRuntimeState,
  sceneRevision,
  layer,
  viewportZoomBucket,
}: {
  readonly contentSurfaces: readonly GpuContentSurface[] | undefined;
  readonly deferResolutionUpdates: boolean;
  readonly devicePixelRatio: number;
  readonly frame: number;
  readonly layer: GpuFlowNodeLayerState;
  readonly retainedContentFrameCacheRef: MutableRefObject<GpuFlowRetainedContentFrameCache | null>;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly sceneRevision: number;
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
      viewportZoomBucket,
      allowCoveredRefinementBacklog: deferResolutionUpdates,
    })
  ) {
    const retainedRuntimeFrameStart = performance.now();
    const retainedRuntimeFrame =
      cachedFrame.nativeVisualSignature === nativeVisualSignature
        ? cachedFrame.retainedRuntimeFrame
        : createGpuFlowRetainedRuntimeFrameForLayer({
            devicePixelRatio,
            frame,
            layer,
            scrollOffsets,
            scrollRevision,
            scrollRevisions,
            viewportZoomBucket,
          });
    const retainedRuntimeFrameMs =
      performance.now() - retainedRuntimeFrameStart;
    const retainedPageFrameStart = performance.now();
    const preparedFrame = {
      ...cachedFrame.preparedFrame,
      frame,
    };
    const retainedPageFrameMs = performance.now() - retainedPageFrameStart;
    retainedContentFrameCacheRef.current = {
      ...cachedFrame,
      nativeVisualSignature,
      preparedFrame,
      retainedRuntimeFrame,
    };
    return {
      phaseDiagnostics: {
        retainedPageFrameMs,
        retainedRuntimeFrameMs,
      },
      preparedFrame,
      retainedRuntimeFrame,
    };
  }

  const retainedRuntimeFrameStart = performance.now();
  const retainedRuntimeFrame = createGpuFlowRetainedRuntimeFrameForLayer({
    devicePixelRatio,
    frame,
    layer,
    scrollOffsets,
    scrollRevision,
    scrollRevisions,
    viewportZoomBucket,
  });
  const retainedRuntimeFrameMs = performance.now() - retainedRuntimeFrameStart;
  const retainedPageFrameStart = performance.now();
  const preparedFrame = retainedContentPageManager.prepareFrame({
    devicePixelRatio,
    frame,
    surfaces: retainedRuntimeFrame.descriptors.contentPageSurfaces,
    viewportZoomBucket,
  });
  const retainedPageFrameMs = performance.now() - retainedPageFrameStart;
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
  };
  return {
    phaseDiagnostics: {
      retainedPageFrameMs,
      retainedRuntimeFrameMs,
    },
    preparedFrame,
    retainedRuntimeFrame,
  };
}

function createGpuFlowRetainedRuntimeFrameForLayer({
  devicePixelRatio,
  frame,
  layer,
  scrollOffsets,
  scrollRevision,
  scrollRevisions,
  viewportZoomBucket,
}: {
  readonly devicePixelRatio: number;
  readonly frame: number;
  readonly layer: GpuFlowNodeLayerState;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly scrollRevision: number;
  readonly scrollRevisions: ReadonlyMap<string, number>;
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
    viewport: layer.viewport,
    viewportZoomBucket,
  });
}

function createGpuFlowRetainedContentNativeVisualSignature(
  layer: GpuFlowNodeLayerState,
): string {
  return JSON.stringify({
    rowHoverTarget: layer.retainedContentRowHoverTarget ?? null,
    scrollbarVisualState: layer.retainedContentScrollbarVisualState ?? null,
  });
}

export {
  shouldReuseGpuFlowRetainedContentFrameCache,
  type GpuFlowRetainedContentFrameCache,
} from "./flowRetainedContentFrameCache";
export { shouldDeferGpuFlowRetainedContentPostSubmitMaintenance } from "./flowRetainedPageMaintenance";

export function renderGpuFlowNodeLayerFrame({
  activeResizeNodeIdRef,
  callbacksRef,
  canvasSizeRef,
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
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
  visibleNodeIdsRef,
  viewportStore,
  viewportFrame,
  onRetainedPreparedRuntimeFrame,
  onRetainedRuntimeFrame,
  onRetainedDisplayFrame,
}: {
  readonly activeResizeNodeIdRef: MutableRefObject<string | null>;
  readonly callbacksRef: MutableRefObject<GpuFlowCallbacks>;
  readonly canvasSizeRef: MutableRefObject<GpuCanvasSize | null>;
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
      ) => void)
    | undefined;
  readonly onRetainedPreparedRuntimeFrame?:
    | ((frame: GpuRetainedRuntimeFrame) => void)
    | undefined;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
  readonly visibleNodeIdsRef: MutableRefObject<ReadonlySet<string>>;
  readonly viewportStore: GpuFlowViewportStoreApi;
  readonly viewportFrame: boolean;
}) {
  const frameInput = resolveRenderableGpuFlowLayerFrameInput({
    canvasSizeRef,
    nodeLayerRef,
    htmlSurfaceRendererRef,
    retainedContentPageManagerRef,
    runtime,
    textureManagerRef,
  });
  if (!frameInput) {
    return;
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
      zoom: normalizeGpuViewport(layer.viewport).zoom,
    });
  const retainedSceneInput = createGpuFlowRetainedContentFrameSceneInput(
    layer.scene,
  );
  const retainedFrame = resolveGpuFlowRetainedContentFrame({
    contentSurfaces: retainedSceneInput.contentSurfaces,
    deferResolutionUpdates,
    devicePixelRatio: canvasSize.devicePixelRatio,
    frame,
    layer,
    retainedContentFrameCacheRef,
    retainedContentPageManager: resources.retainedContentPageManager,
    retainedContentRuntimeState,
    sceneRevision: retainedSceneInput.sceneRevision,
    viewportZoomBucket,
  });
  let retainedRuntimeFrame = retainedFrame.retainedRuntimeFrame;
  let retainedPagePreparedFrame = retainedFrame.preparedFrame;
  notifyGpuFlowRetainedRuntimeFrame(
    onRetainedPreparedRuntimeFrame,
    retainedRuntimeFrame,
  );
  const retainedDisplayTransactionStart = performance.now();
  const retainedDisplayOutcome = resolveRetainedDisplayFrameTransaction({
    allowColdPlaceholder: retainedDisplayFrameRef.current === null,
    nowMs: renderStartedAt,
    prepared: createRetainedDisplayFrameInput({
      pageFrame: retainedPagePreparedFrame,
      retainedRuntimeFrame,
    }),
    previous: retainedDisplayFrameRef.current,
  });
  retainedDisplayTransactionMs +=
    performance.now() - retainedDisplayTransactionStart;
  if (retainedDisplayOutcome.kind === "block-cold-first-coverage") {
    surfaceRef.current?.requestFrame("texture-upload");
    return;
  }
  const publishedRetainedFrame = retainedDisplayOutcome.frame;
  retainedDisplayFrameRef.current = publishedRetainedFrame;
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
  const committedContentPublishStart = performance.now();
  onRetainedDisplayFrame?.(publishedRetainedFrame, {
    gpuNativeVisuals: committedGpuNativeVisuals,
  });
  committedContentPublishMs += performance.now() - committedContentPublishStart;
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
  markGpuFlowRetainedContentFrameFreshnessDirty({
    deferResolutionUpdates,
    frame,
    retainedContentPageManager: resources.retainedContentPageManager,
    rowHoverTarget: resolveGpuFlowRetainedContentRowHoverTarget(layer),
    scrollOffsets: runtimeScrollOffsets,
    sourceSurfaces: retainedRuntimeFrame.descriptors.sourceSurfaces,
    switchAnimations: retainedContentSwitchAnimations,
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
    htmlSurfaceOverlays: layer.edgeLabelSurfaces,
    htmlSurfaceNativeVisuals: committedGpuNativeVisuals,
    htmlSurfacePageVisuals: publishedRetainedPageFrame.flatSurfaces,
    marginCssPx: layer.marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes: layer.nodeTextureMemoryBudgetBytes,
    renderer: resources.htmlSurfaceRenderer,
    textureManager: resources.textureManager,
    uploadBudget: layer.uploadBudget,
    viewport: layer.viewport,
  });
  htmlSurfaceFrameMs += performance.now() - htmlSurfaceFrameStart;
  const retainedPageMaintenanceStart = performance.now();
  const retainedPageMaintenance =
    resolveGpuFlowRetainedPageMaintenanceAfterPublish({
      darkMode,
      deferResolutionUpdates,
      existingMaintenance: null,
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
    renderDurationMs: performance.now() - renderStartedAt,
    retainedTexturePages: combineGpuFlowRetainedTexturePageMetrics({
      retainedDisplayFrame: publishedRetainedFrame,
      retainedPageResult,
    }),
    viewport: layer.viewport,
    viewportFrame,
  });
  updateGpuFlowNodeLayerFrameState({
    callbacksRef,
    layerResult: combinedLayerResult,
    nodeInteractionRef,
    nodeLayerRef,
    retainedRuntimeFrame: publishedRetainedRuntimeFrame,
    retainedTexturePageFollowUpFrame: retainedPageResult.needsFollowUpFrame,
    surfaceRef,
    switchAnimationFollowUpFrame: switchAnimationNeedsFollowUpFrame,
    transformOnlyPaintNodeIdsRef,
    viewport: layer.viewport,
    viewportFrame,
    visibleNodeIdsRef,
  });
  notifyGpuFlowRetainedRuntimeFrame(
    onRetainedRuntimeFrame,
    publishedRetainedRuntimeFrame,
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

function syncGpuFlowRetainedContentSwitchAnimationSurfaces({
  nowMs,
  scrollOffsets,
  scene,
  switchAnimations,
}: {
  readonly nowMs: number;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly scene: GpuFlowScene | undefined;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}) {
  if (!scene) {
    return;
  }
  for (const surface of scene.contentSurfaces) {
    if (!isGpuFlowRetainedContentSwitchAnimationSurface(surface)) {
      continue;
    }
    const sampledSurface = sampleGpuFlowRetainedContentSwitchAnimationSurface({
      scrollOffsets,
      surface,
    });
    switchAnimations.syncSurface(sampledSurface, nowMs);
  }
}

function hasGpuFlowRetainedContentActiveSwitchAnimationSurfaces({
  nowMs,
  scene,
  switchAnimations,
}: {
  readonly nowMs: number;
  readonly scene: GpuFlowScene | undefined;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}): boolean {
  if (!scene) {
    return false;
  }
  let hasActiveSurface = false;
  for (const surface of scene.contentSurfaces) {
    if (
      !isGpuFlowRetainedContentSwitchAnimationSurface(surface) ||
      !switchAnimations.hasActiveSurface(surface.id, nowMs)
    ) {
      continue;
    }
    hasActiveSurface = true;
  }
  return hasActiveSurface;
}

function isGpuFlowRetainedContentSwitchAnimationSurface(
  surface: GpuContentSurface,
): surface is GpuContentSurface & {
  readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
} {
  return (
    surface.renderer.kind === "canvas-content" && Boolean(surface.retainedScene)
  );
}

function isGpuFlowFrameDarkMode(canvas: HTMLCanvasElement): boolean {
  return Boolean(
    canvas.closest(".dark") ??
      canvas.ownerDocument.documentElement.closest(".dark"),
  );
}

export function reportGpuFlowNodeLayerFramePerformance({
  callbacksRef,
  deferResolutionUpdates,
  frame,
  frameReasons,
  interactionDiagnostics,
  layerResult,
  phaseDiagnostics,
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
      renderDurationMs,
      retainedTexturePages,
      viewport,
      viewportFrame,
    }),
  );
}

export function updateGpuFlowNodeLayerFrameState({
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
}: {
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
}) {
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
function markTransformOnlyPaintNodesForViewportFrame({
  layerResult,
  transformOnlyPaintNodeIdsRef,
  viewportFrame,
}: {
  readonly layerResult: RenderHtmlSurfaceFrameResult;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
  readonly viewportFrame: boolean;
}) {
  if (!viewportFrame) {
    return;
  }
  for (const nodeId of layerResult.domTransformUpdatedNodeIds) {
    transformOnlyPaintNodeIdsRef.current.add(nodeId);
  }
  for (const nodeId of layerResult.domTransformParkedNodeIds) {
    transformOnlyPaintNodeIdsRef.current.add(nodeId);
  }
}
