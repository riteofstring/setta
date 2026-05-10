import { type MutableRefObject } from "react";

import {
  isChromeReproActive,
  postChromeReproEvent,
  roundChromeReproMs,
} from "state/actions/chromeRepro";

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

import {
  createGpuFlowFramePerformanceEvent,
  type GpuFlowRetainedTexturePageFrameMetrics,
} from "../framePerformance";
import { getGpuRetainedContentTexturePageFrameSurfaces } from "../GpuRetainedContentPageFrameSurfaces";
import {
  createHtmlSurfaceTextureManager,
  type HtmlSurfaceTextureManager,
} from "../htmlSurfaces/textures";
import {
  createGpuFlowInteractionDiagnosticsSnapshot,
  type MutableGpuFlowInteractionDiagnostics,
} from "../interactionDiagnostics";
import type { GpuRetainedContentDrawCommand } from "../retainedContentScene";
import type { GpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import { RetainedContentTexturePageManager } from "../retainedContentTexturePageManager";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import { normalizeGpuViewport, type GpuRect } from "../viewportMath";
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

function requestRemainingTextureUploadFrame({
  layerResult,
  retainedTexturePageFollowUpFrame,
  surfaceRef,
}: {
  readonly layerResult: RenderHtmlSurfaceFrameResult;
  readonly retainedTexturePageFollowUpFrame: boolean;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
}) {
  if (layerResult.budgetExhausted || retainedTexturePageFollowUpFrame) {
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
  retainedContentSwitchAnimations,
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
  readonly retainedContentSwitchAnimations: GpuRetainedContentSwitchAnimationStore;
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
  postGpuFlowRetainedContentVisualStateChromeReproEvent({
    frame,
    scene: layer.scene,
  });
  syncGpuFlowRetainedContentSwitchAnimationSurfaces({
    scene: layer.scene,
    switchAnimations: retainedContentSwitchAnimations,
  });
  const viewportZoomBucket =
    resources.retainedContentPageManager.resolveFrameViewportZoomBucket({
      viewportInteractionActive: deferResolutionUpdates,
      zoom: normalizeGpuViewport(layer.viewport).zoom,
    });
  const retainedPagePreparedFrame =
    resources.retainedContentPageManager.prepareFrame({
      devicePixelRatio: canvasSize.devicePixelRatio,
      frame,
      surfaces: getGpuRetainedContentTexturePageFrameSurfaces(
        layer.scene?.contentSurfaces,
        {
          viewportZoomBucket,
        },
      ),
      viewportZoomBucket,
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
    htmlSurfacePageVisuals: retainedPagePreparedFrame.flatSurfaces,
    marginCssPx: layer.marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes: layer.nodeTextureMemoryBudgetBytes,
    renderer: resources.htmlSurfaceRenderer,
    textureManager: resources.textureManager,
    uploadBudget: layer.uploadBudget,
    viewport: layer.viewport,
  });
  const retainedPageResult =
    resources.retainedContentPageManager.runPostSubmitMaintenance({
      darkMode: isGpuFlowFrameDarkMode(runtime.canvas),
      preparedFrame: retainedPagePreparedFrame,
      switchAnimations: retainedContentSwitchAnimations,
      viewportInteractionActive: deferResolutionUpdates,
    });
  const switchAnimationNeedsFollowUpFrame =
    markGpuFlowRetainedContentSwitchAnimationSurfacesDirty({
      frame,
      pageManager: resources.retainedContentPageManager,
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
        nodeInteractionRef.current?.getActiveNodeId() ?? null,
      ownerDocument: runtime.canvas.ownerDocument,
      viewportState: viewportStore.getState(),
    }),
    layerResult: combinedLayerResult,
    renderDurationMs: performance.now() - renderStartedAt,
    retainedTexturePages: {
      budgetExhausted: retainedPageResult.budgetExhausted,
      coverageCandidateCount: retainedPageResult.coverageCandidateCount,
      diagnosticCount: retainedPageResult.diagnostics.length,
      drawQuadCount: retainedPageResult.drawQuadCount,
      evictedBytes: retainedPageResult.evicted.evictedBytes,
      evictedCount: retainedPageResult.evicted.evictedKeys.length,
      fallbackDrawQuadCount: retainedPageResult.fallbackDrawQuadCount,
      memoryCommittedBytes: retainedPageResult.memory.committedBytes,
      memoryCommittedCount: retainedPageResult.memory.committedCount,
      memoryRetiredBytes: retainedPageResult.memory.retiredBytes,
      memoryRetiredCount: retainedPageResult.memory.retiredCount,
      memoryTotalBytes: retainedPageResult.memory.totalBytes,
      mergedDrawQuadCount: retainedPageResult.mergedDrawQuadCount,
      missingPageCount: retainedPageResult.missingPageCount,
      rasterMs: retainedPageResult.rasterMs,
      staleFallbackDrawQuadCount: retainedPageResult.staleFallbackDrawQuadCount,
      targetDescriptorCount: retainedPageResult.targetDescriptorCount,
      uncoveredRectCount: retainedPageResult.uncoveredRectCount,
      uploadedBytes: retainedPageResult.uploadedBytes,
      uploadedDrawCommandCount: retainedPageResult.uploadedDrawCommandCount,
      uploadCount: retainedPageResult.uploadCount,
      uploadMs: retainedPageResult.uploadMs,
    },
    viewport: layer.viewport,
    viewportFrame,
  });
  updateGpuFlowNodeLayerFrameState({
    callbacksRef,
    layerResult: combinedLayerResult,
    nodeInteractionRef,
    nodeLayerRef,
    retainedTexturePageFollowUpFrame:
      retainedPageResult.needsFollowUpFrame ||
      switchAnimationNeedsFollowUpFrame,
    surfaceRef,
    transformOnlyPaintNodeIdsRef,
    viewportFrame,
    visibleNodeIdsRef,
  });
}

function syncGpuFlowRetainedContentSwitchAnimationSurfaces({
  scene,
  switchAnimations,
}: {
  readonly scene: GpuFlowScene | undefined;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}) {
  if (!scene) {
    return;
  }
  const nowMs = performance.now();
  for (const surface of scene.contentSurfaces) {
    if (!isGpuFlowRetainedContentSwitchAnimationSurface(surface)) {
      continue;
    }
    switchAnimations.syncSurface(surface, nowMs);
  }
}

function markGpuFlowRetainedContentSwitchAnimationSurfacesDirty({
  frame,
  pageManager,
  scene,
  switchAnimations,
}: {
  readonly frame: number;
  readonly pageManager: RetainedContentTexturePageManager;
  readonly scene: GpuFlowScene | undefined;
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}): boolean {
  if (!scene) {
    return false;
  }
  const nowMs = performance.now();
  let hasActiveSurface = false;
  for (const surface of scene.contentSurfaces) {
    if (
      !isGpuFlowRetainedContentSwitchAnimationSurface(surface) ||
      !switchAnimations.hasActiveSurface(surface.id, nowMs)
    ) {
      continue;
    }
    hasActiveSurface =
      pageManager.markSurfaceContentDirty({
        frame,
        priority: "visible",
        ...createGpuFlowRetainedContentSwitchAnimationDirtySourceRect(
          switchAnimations,
          surface,
        ),
        surfaceId: surface.id,
      }) || hasActiveSurface;
  }
  return hasActiveSurface;
}

function createGpuFlowRetainedContentSwitchAnimationDirtySourceRect(
  switchAnimations: GpuRetainedContentSwitchAnimationStore,
  surface: GpuContentSurface & {
    readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
  },
): { readonly sourceRect?: GpuRect } {
  const sourceRect = switchAnimations.getActiveSurfaceSourceRect(surface);
  return sourceRect ? { sourceRect } : {};
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

let lastRetainedContentVisualStateSignature: string | null = null;

function postGpuFlowRetainedContentVisualStateChromeReproEvent({
  frame,
  scene,
}: {
  readonly frame: number;
  readonly scene: GpuFlowScene | undefined;
}) {
  if (!isChromeReproActive() || !scene) {
    return;
  }
  const surfaces = scene.contentSurfaces
    .map(createGpuFlowRetainedContentSurfaceVisualState)
    .filter(
      (
        surface,
      ): surface is NonNullable<typeof surface> => surface !== null,
    );
  if (surfaces.length === 0) {
    return;
  }
  const signature = JSON.stringify(surfaces);
  if (signature === lastRetainedContentVisualStateSignature) {
    return;
  }
  lastRetainedContentVisualStateSignature = signature;
  postChromeReproEvent("gpu-flow-retained-content-visual-state", {
    frame,
    surfaces,
  });
}

function createGpuFlowRetainedContentSurfaceVisualState(
  surface: GpuContentSurface,
):
  | {
      readonly contentRect: GpuRect;
      readonly rect: GpuRect;
      readonly scrollbars: readonly {
        readonly axis: string;
        readonly state: unknown;
        readonly thumbRect: GpuRect;
        readonly trackRect: GpuRect;
      }[];
      readonly scrollOffset: { readonly x: number; readonly y: number };
      readonly surfaceId: string;
      readonly switches: readonly {
        readonly checked: boolean;
        readonly displayValue: string;
        readonly rect: GpuRect;
        readonly rowId: string;
      }[];
      readonly viewportRect: GpuRect;
      readonly zIndex: number;
    }
  | null {
  const retainedScene = surface.retainedScene;
  if (!retainedScene) {
    return null;
  }
  const switches = retainedScene.drawCommands
    .map(createGpuFlowRetainedContentSwitchVisualState)
    .filter(
      (
        command,
      ): command is NonNullable<typeof command> => command !== null,
    );
  const scrollbars = retainedScene.drawCommands
    .map(createGpuFlowRetainedContentScrollbarVisualState)
    .filter(
      (
        command,
      ): command is NonNullable<typeof command> => command !== null,
    );
  if (switches.length === 0 && scrollbars.length === 0) {
    return null;
  }
  return {
    contentRect: roundGpuFlowChromeReproRect(retainedScene.contentRect),
    rect: roundGpuFlowChromeReproRect(surface.rect),
    scrollbars,
    scrollOffset: {
      x: roundChromeReproMs(retainedScene.scrollOffset.x),
      y: roundChromeReproMs(retainedScene.scrollOffset.y),
    },
    surfaceId: surface.id,
    switches,
    viewportRect: roundGpuFlowChromeReproRect(retainedScene.viewportRect),
    zIndex: surface.zIndex,
  };
}

function createGpuFlowRetainedContentSwitchVisualState(
  command: GpuRetainedContentDrawCommand,
): {
  readonly checked: boolean;
  readonly displayValue: string;
  readonly rect: GpuRect;
  readonly rowId: string;
} | null {
  if (command.kind !== "row-control" || command.control.kind !== "switch") {
    return null;
  }
  return {
    checked: command.control.checked,
    displayValue: command.control.displayValue,
    rect: roundGpuFlowChromeReproRect(command.rect),
    rowId: command.rowId,
  };
}

function createGpuFlowRetainedContentScrollbarVisualState(
  command: GpuRetainedContentDrawCommand,
): {
  readonly axis: string;
  readonly state: unknown;
  readonly thumbRect: GpuRect;
  readonly trackRect: GpuRect;
} | null {
  if (command.kind !== "scrollbar") {
    return null;
  }
  return {
    axis: command.axis,
    state: command.state ?? null,
    thumbRect: roundGpuFlowChromeReproRect(command.thumbRect),
    trackRect: roundGpuFlowChromeReproRect(command.trackRect),
  };
}

function roundGpuFlowChromeReproRect(rect: GpuRect): GpuRect {
  return {
    height: roundChromeReproMs(rect.height),
    width: roundChromeReproMs(rect.width),
    x: roundChromeReproMs(rect.x),
    y: roundChromeReproMs(rect.y),
  };
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
  readonly renderDurationMs: number;
  readonly retainedTexturePages: GpuFlowRetainedTexturePageFrameMetrics;
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
      retainedTexturePages,
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
  retainedTexturePageFollowUpFrame,
  surfaceRef,
  transformOnlyPaintNodeIdsRef,
  viewportFrame,
  visibleNodeIdsRef,
}: {
  readonly callbacksRef: MutableRefObject<GpuFlowCallbacks>;
  readonly layerResult: RenderHtmlSurfaceFrameResult;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
  readonly retainedTexturePageFollowUpFrame: boolean;
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
  requestRemainingTextureUploadFrame({
    layerResult,
    retainedTexturePageFollowUpFrame,
    surfaceRef,
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
