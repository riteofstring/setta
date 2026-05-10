import { type MutableRefObject } from "react";

import type { GpuFlowRuntime } from "../gpuDevice";

import {
  renderHtmlSurfaceFrame,
  type GpuNodeDomTransformSyncCache,
  type GpuNodeLayout,
  type RenderHtmlSurfaceFrameResult,
} from "../htmlSurfaces/frame";

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

import { createGpuFlowFramePerformanceEvent } from "../framePerformance";
import {
  createHtmlSurfaceTextureManager,
  type HtmlSurfaceTextureManager,
} from "../htmlSurfaces/textures";
import {
  createGpuFlowInteractionDiagnosticsSnapshot,
  type MutableGpuFlowInteractionDiagnostics,
} from "../interactionDiagnostics";
import { getGpuRetainedContentTexturePageFrameSurfaces } from "../GpuRetainedContentPageFrameSurfaces";
import { RetainedContentTexturePageManager } from "../retainedContentTexturePageManager";
import { chooseStableZoomBucket } from "../textureResolution";
import { normalizeGpuViewport } from "../viewportMath";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

import type { GpuFlowNodeLayerState } from "./flowLayerState";
import { EMPTY_GPU_NODE_LAYOUTS, type GpuFlowCallbacks } from "./flowSurface";

function resolveRenderableGpuFlowLayerFrameInput({
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
      layer.htmlSurfaceNativeVisuals?.length,
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

function requestRemainingTextureUploadFrame(
  surfaceRef: MutableRefObject<GpuSurfaceHandle | null>,
  layerResult: RenderHtmlSurfaceFrameResult,
) {
  if (layerResult.budgetExhausted) {
    surfaceRef.current?.requestFrame("texture-upload");
  }
}

export function nextFrame(frameRef: MutableRefObject<number>): number {
  frameRef.current += 1;
  return frameRef.current;
}

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
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
  visibleNodeIdsRef,
  viewportStore,
  viewportFrame,
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
  const retainedPageResult = resources.retainedContentPageManager.renderFrame({
    darkMode: isGpuFlowFrameDarkMode(runtime.canvas),
    devicePixelRatio: canvasSize.devicePixelRatio,
    frame,
    surfaces: getGpuRetainedContentTexturePageFrameSurfaces(
      layer.scene?.contentSurfaces,
      {
        viewportZoomBucket: chooseStableZoomBucket(
          normalizeGpuViewport(layer.viewport).zoom,
        ),
      },
    ),
    viewportInteractionActive: deferResolutionUpdates,
    viewportZoomBucket: chooseStableZoomBucket(
      normalizeGpuViewport(layer.viewport).zoom,
    ),
  });
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
    htmlSurfaceNativeVisuals: layer.htmlSurfaceNativeVisuals,
    htmlSurfacePageVisuals: retainedPageResult.flatSurfaces,
    marginCssPx: layer.marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes: layer.nodeTextureMemoryBudgetBytes,
    renderer: resources.htmlSurfaceRenderer,
    textureManager: resources.textureManager,
    uploadBudget: layer.uploadBudget,
    viewport: layer.viewport,
  });
  const combinedLayerResult = {
    ...layerResult,
    budgetExhausted:
      layerResult.budgetExhausted || retainedPageResult.budgetExhausted,
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
        nodeInteractionRef.current?.getActiveNodeId() ?? null,
      ownerDocument: runtime.canvas.ownerDocument,
      viewportState: viewportStore.getState(),
    }),
    layerResult: combinedLayerResult,
    renderDurationMs: performance.now() - renderStartedAt,
    viewport: layer.viewport,
    viewportFrame,
  });
  updateGpuFlowNodeLayerFrameState({
    callbacksRef,
    layerResult: combinedLayerResult,
    nodeInteractionRef,
    nodeLayerRef,
    surfaceRef,
    transformOnlyPaintNodeIdsRef,
    viewportFrame,
    visibleNodeIdsRef,
  });
}

function isGpuFlowFrameDarkMode(canvas: HTMLCanvasElement): boolean {
  return Boolean(
    canvas.closest(".dark") ??
      canvas.ownerDocument.documentElement.closest(".dark"),
  );
}

function resolveActiveGpuFlowNodeId({
  activeResizeNodeIdRef,
  nodeInteractionRef,
}: {
  readonly activeResizeNodeIdRef: MutableRefObject<string | null>;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
}): string | null {
  return (
    nodeInteractionRef.current?.getActiveNodeId() ??
    activeResizeNodeIdRef.current
  );
}

function reportGpuFlowNodeLayerFramePerformance({
  callbacksRef,
  deferResolutionUpdates,
  frame,
  frameReasons,
  interactionDiagnostics,
  layerResult,
  renderDurationMs,
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
  readonly renderDurationMs: number;
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
      renderDurationMs,
      viewport,
      viewportFrame,
    }),
  );
}

function updateGpuFlowNodeLayerFrameState({
  callbacksRef,
  layerResult,
  nodeInteractionRef,
  nodeLayerRef,
  surfaceRef,
  transformOnlyPaintNodeIdsRef,
  viewportFrame,
  visibleNodeIdsRef,
}: {
  readonly callbacksRef: MutableRefObject<GpuFlowCallbacks>;
  readonly layerResult: RenderHtmlSurfaceFrameResult;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
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
    visualScene: layerResult.visualScene,
  };
  visibleNodeIdsRef.current = new Set(layerResult.visibleNodeIds);
  completeGpuNodeInteractionFrame(nodeInteractionRef, layerResult);
  callbacksRef.current.onNodeLayerFrame?.(layerResult);
  requestRemainingTextureUploadFrame(surfaceRef, layerResult);
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
