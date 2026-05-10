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
  type GpuFlowRetainedTexturePageFrameMetrics,
} from "../framePerformance";
import {
  getGpuRetainedContentSourceRectForRows,
  type GpuRetainedContentSourceSurface,
} from "../GpuRetainedContentSurfaces";
import {
  createHtmlSurfaceTextureManager,
  type HtmlSurfaceTextureManager,
} from "../htmlSurfaces/textures";
import {
  createGpuFlowInteractionDiagnosticsSnapshot,
  type MutableGpuFlowInteractionDiagnostics,
} from "../interactionDiagnostics";
import { createGpuRetainedContentFrameGeneration } from "../retainedContentFrameGeneration";
import type { GpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import { getGpuRetainedContentSwitchAnimationVisuals } from "../retainedContentSwitchVisuals";
import { RetainedContentTexturePageManager } from "../retainedContentTexturePageManager";
import { RetainedTextLikePreviewPageManager } from "../retainedTextLikePreviewPageManager";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import { normalizeGpuViewport } from "../viewportMath";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

import type { GpuFlowNodeLayerState } from "./flowLayerState";
import {
  postGpuFlowRetainedContentVisualStateChromeReproEvent,
  postGpuFlowRetainedTextLikePreviewChromeReproEvent,
  postGpuFlowRetainedTextLikePreviewMaintenanceChromeReproEvent,
} from "./flowRetainedFrameDiagnostics";
import { combineGpuFlowRetainedTexturePageMetrics } from "./flowRetainedTextureMetrics";
import { EMPTY_GPU_NODE_LAYOUTS, type GpuFlowCallbacks } from "./flowSurface";

function resolveRenderableGpuFlowLayerFrameInput({
  canvasSizeRef,
  nodeLayerRef,
  htmlSurfaceRendererRef,
  retainedContentPageManagerRef,
  retainedTextLikePreviewPageManagerRef,
  runtime,
  textureManagerRef,
}: {
  readonly canvasSizeRef: MutableRefObject<GpuCanvasSize | null>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
  readonly htmlSurfaceRendererRef: MutableRefObject<HtmlSurfaceRenderer | null>;
  readonly runtime: GpuFlowRuntime;
  readonly retainedContentPageManagerRef: MutableRefObject<RetainedContentTexturePageManager | null>;
  readonly retainedTextLikePreviewPageManagerRef: MutableRefObject<RetainedTextLikePreviewPageManager | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
}): {
  readonly canvasSize: GpuCanvasSize;
  readonly layer: GpuFlowNodeLayerState;
  readonly nodes: readonly GpuNodeLayout[];
  readonly resources: {
    readonly htmlSurfaceRenderer: HtmlSurfaceRenderer;
    readonly retainedContentPageManager: RetainedContentTexturePageManager;
    readonly retainedTextLikePreviewPageManager: RetainedTextLikePreviewPageManager;
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
      retainedTextLikePreviewPageManagerRef,
      runtime,
      textureManagerRef,
    }),
  };
}

function ensureNodeLayerResources({
  htmlSurfaceRendererRef,
  retainedContentPageManagerRef,
  retainedTextLikePreviewPageManagerRef,
  runtime,
  textureManagerRef,
}: {
  readonly htmlSurfaceRendererRef: MutableRefObject<HtmlSurfaceRenderer | null>;
  readonly retainedContentPageManagerRef: MutableRefObject<RetainedContentTexturePageManager | null>;
  readonly retainedTextLikePreviewPageManagerRef: MutableRefObject<RetainedTextLikePreviewPageManager | null>;
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
  if (!retainedTextLikePreviewPageManagerRef.current) {
    retainedTextLikePreviewPageManagerRef.current =
      new RetainedTextLikePreviewPageManager(runtime.device);
  }

  return {
    htmlSurfaceRenderer: htmlSurfaceRendererRef.current,
    retainedContentPageManager: retainedContentPageManagerRef.current,
    retainedTextLikePreviewPageManager:
      retainedTextLikePreviewPageManagerRef.current,
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
  retainedTextLikePreviewPageManagerRef?: MutableRefObject<RetainedTextLikePreviewPageManager | null>,
) {
  textureManagerRef.current?.destroy();
  textureManagerRef.current = null;
  htmlSurfaceRendererRef.current?.destroy();
  htmlSurfaceRendererRef.current = null;
  retainedContentPageManagerRef?.current?.destroy();
  if (retainedContentPageManagerRef) {
    retainedContentPageManagerRef.current = null;
  }
  retainedTextLikePreviewPageManagerRef?.current?.destroy();
  if (retainedTextLikePreviewPageManagerRef) {
    retainedTextLikePreviewPageManagerRef.current = null;
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
  transientVisuals: readonly HtmlSurfaceSolidRoundedRectVisual[],
): readonly HtmlSurfaceSolidRoundedRectVisual[] | undefined {
  if (transientVisuals.length === 0) {
    return baseVisuals ?? undefined;
  }
  if (!baseVisuals?.length) {
    return transientVisuals;
  }
  return [...baseVisuals, ...transientVisuals];
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
  retainedTextLikePreviewElementByIdRef,
  retainedTextLikePreviewPageManagerRef,
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
  readonly retainedTextLikePreviewElementByIdRef: MutableRefObject<
    Map<string, HTMLElement>
  >;
  readonly retainedTextLikePreviewPageManagerRef: MutableRefObject<RetainedTextLikePreviewPageManager | null>;
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
    retainedTextLikePreviewPageManagerRef,
    runtime,
    textureManagerRef,
  });
  if (!frameInput) {
    return;
  }
  const { canvasSize, layer, nodes, resources } = frameInput;
  const frame = nextFrame(frameRef);
  const renderStartedAt = performance.now();
  const darkMode = isGpuFlowFrameDarkMode(runtime.canvas);
  postGpuFlowRetainedContentVisualStateChromeReproEvent({
    frame,
    scene: layer.scene,
  });
  syncGpuFlowRetainedContentSwitchAnimationSurfaces({
    nowMs: renderStartedAt,
    scene: layer.scene,
    switchAnimations: retainedContentSwitchAnimations,
  });
  const viewportZoomBucket =
    resources.retainedContentPageManager.resolveFrameViewportZoomBucket({
      viewportInteractionActive: deferResolutionUpdates,
      zoom: normalizeGpuViewport(layer.viewport).zoom,
    });
  const retainedFrameGeneration = createGpuRetainedContentFrameGeneration({
    contentSurfaces: layer.scene?.contentSurfaces,
    viewportZoomBucket,
  });
  const retainedPagePreparedFrame =
    resources.retainedContentPageManager.prepareFrame({
      devicePixelRatio: canvasSize.devicePixelRatio,
      frame,
      surfaces: retainedFrameGeneration.contentPageSurfaces,
      viewportZoomBucket,
    });
  const retainedTextLikePreviewPreparedFrame =
    resources.retainedTextLikePreviewPageManager.prepareFrame({
      baseDrawQuads: retainedPagePreparedFrame.drawQuads,
      baseTargetDescriptors: retainedPagePreparedFrame.targetDescriptors,
      frame,
      surfaces: retainedFrameGeneration.textLikePreviewPageSurfaces,
    });
  postGpuFlowRetainedTextLikePreviewChromeReproEvent({
    frame,
    preparedFrame: retainedTextLikePreviewPreparedFrame,
    previewSources: retainedFrameGeneration.textLikePreviewSources,
    previewSurfaces: retainedFrameGeneration.textLikePreviewPageSurfaces,
  });
  markGpuFlowRetainedContentSwitchFreshnessDirty({
    frame,
    retainedContentPageManager: resources.retainedContentPageManager,
    sourceSurfaces: retainedFrameGeneration.sourceSurfaces,
    switchAnimations: retainedContentSwitchAnimations,
  });
  const switchAnimationNativeVisuals =
    getGpuRetainedContentSwitchAnimationVisuals({
      darkMode,
      nowMs: renderStartedAt,
      scene: layer.scene,
      switchAnimations: retainedContentSwitchAnimations,
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
    htmlSurfaceNativeVisuals: combineGpuFlowHtmlSurfaceNativeVisuals(
      layer.htmlSurfaceNativeVisuals,
      switchAnimationNativeVisuals,
    ),
    htmlSurfacePageVisuals: [
      ...retainedPagePreparedFrame.flatSurfaces,
      ...retainedTextLikePreviewPreparedFrame.flatSurfaces,
    ],
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
      darkMode,
      preparedFrame: retainedPagePreparedFrame,
      // Switch transitions are composited below as native visuals, so texture
      // pages must cache only the static scene state.
      viewportInteractionActive: deferResolutionUpdates,
    });
  const retainedTextLikePreviewResult =
    resources.retainedTextLikePreviewPageManager.runPostSubmitMaintenance({
      elementBySourceId: retainedTextLikePreviewElementByIdRef.current,
      preparedFrame: retainedTextLikePreviewPreparedFrame,
      viewportInteractionActive: deferResolutionUpdates,
    });
  postGpuFlowRetainedTextLikePreviewMaintenanceChromeReproEvent({
    elementBySourceId: retainedTextLikePreviewElementByIdRef.current,
    frame,
    maintenanceResult: retainedTextLikePreviewResult,
    preparedFrame: retainedTextLikePreviewPreparedFrame,
    previewSources: retainedFrameGeneration.textLikePreviewSources,
    viewportInteractionActive: deferResolutionUpdates,
  });
  settleGpuFlowRetainedContentCompletedSwitchAnimationSurfaces({
    nowMs: renderStartedAt,
    retainedContentPageManager: resources.retainedContentPageManager,
    sourceSurfaces: retainedFrameGeneration.sourceSurfaces,
    switchAnimations: retainedContentSwitchAnimations,
  });
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
        nodeInteractionRef.current?.getActiveNodeId() ?? null,
      ownerDocument: runtime.canvas.ownerDocument,
      viewportState: viewportStore.getState(),
    }),
    layerResult: combinedLayerResult,
    renderDurationMs: performance.now() - renderStartedAt,
    retainedTexturePages: combineGpuFlowRetainedTexturePageMetrics({
      retainedPageResult,
      retainedTextLikePreviewResult,
    }),
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
      retainedTextLikePreviewResult.needsFollowUpFrame,
    surfaceRef,
    switchAnimationFollowUpFrame: switchAnimationNeedsFollowUpFrame,
    transformOnlyPaintNodeIdsRef,
    viewportFrame,
    visibleNodeIdsRef,
  });
}

function syncGpuFlowRetainedContentSwitchAnimationSurfaces({
  nowMs,
  scene,
  switchAnimations,
}: {
  readonly nowMs: number;
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
    switchAnimations.syncSurface(surface, nowMs);
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

function markGpuFlowRetainedContentSwitchFreshnessDirty({
  frame,
  retainedContentPageManager,
  sourceSurfaces,
  switchAnimations,
}: {
  readonly frame: number;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly sourceSurfaces: readonly GpuRetainedContentSourceSurface[];
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}) {
  for (const surface of sourceSurfaces) {
    const sourceRect = getGpuRetainedContentSourceRectForRows({
      rowIds: switchAnimations.getFreshnessProtectedSurfaceRowIds(surface),
      surface,
    });
    if (!sourceRect) {
      continue;
    }
    if (
      retainedContentPageManager.hasFreshSurfaceContentForRect({
        sourceRect,
        surfaceId: surface.id,
      })
    ) {
      continue;
    }
    retainedContentPageManager.markSurfaceContentDirty({
      frame,
      priority: "interactive",
      sourceRect,
      surfaceId: surface.id,
    });
  }
}

function settleGpuFlowRetainedContentCompletedSwitchAnimationSurfaces({
  nowMs,
  retainedContentPageManager,
  sourceSurfaces,
  switchAnimations,
}: {
  readonly nowMs: number;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly sourceSurfaces: readonly GpuRetainedContentSourceSurface[];
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}) {
  for (const surface of sourceSurfaces) {
    switchAnimations.settleCompletedSurfaceTransitions({
      isRowFresh: (rowId) => {
        const sourceRect = getGpuRetainedContentSourceRectForRows({
          rowIds: [rowId],
          surface,
        });
        return sourceRect
          ? retainedContentPageManager.hasFreshSurfaceContentForRect({
              sourceRect,
              surfaceId: surface.id,
            })
          : true;
      },
      nowMs,
      surface,
    });
  }
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
  switchAnimationFollowUpFrame,
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
  readonly switchAnimationFollowUpFrame: boolean;
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
