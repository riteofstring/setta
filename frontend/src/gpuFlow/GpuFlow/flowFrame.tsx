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
import { getGpuRetainedContentScrollbarVisuals } from "../GpuRetainedContentScrollbarVisuals";
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
import {
  createGpuRetainedContentFrameGeneration,
  type GpuRetainedContentFrameGeneration,
} from "../retainedContentFrameGeneration";
import {
  getGpuRetainedContentRowHoverStateVisuals,
  getGpuRetainedContentRowHoverVisuals,
} from "../retainedContentRowHover";
import { createGpuRetainedContentSampledSceneForSurface } from "../retainedContentRuntimeSampling";
import {
  getGpuRetainedContentRuntimeScrollOffsets,
  getGpuRetainedContentRuntimeScrollRevision,
  type GpuRetainedContentRuntimeState,
} from "../retainedContentRuntimeState";
import type { GpuRetainedContentScrollOffsetMap } from "../retainedContentScroll";
import type { GpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import { getGpuRetainedContentSwitchAnimationVisuals } from "../retainedContentSwitchVisuals";
import {
  RetainedContentTexturePageManager,
  type RetainedContentTexturePagePreparedFrame,
} from "../retainedContentTexturePageManager";
import type { GpuContentSurface, GpuFlowScene } from "../scene";
import { normalizeGpuViewport } from "../viewportMath";
import type { GpuFlowViewportStoreApi } from "../viewportStore";

import type { GpuFlowNodeLayerState } from "./flowLayerState";
import {
  postGpuFlowRetainedContentVisualStateChromeReproEvent,
  postGpuFlowRetainedTextLikeRowSnapshotChromeReproEvent,
  postGpuFlowRetainedTextLikeRowSnapshotMaintenanceChromeReproEvent,
} from "./flowRetainedFrameDiagnostics";
import { combineGpuFlowRetainedTexturePageMetrics } from "./flowRetainedTextureMetrics";
import {
  EMPTY_GPU_NODE_LAYOUTS,
  type GpuFlowCallbacks,
} from "./flowSurfaceTypes";

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

function getGpuFlowRetainedContentRuntimeNativeVisuals({
  layer,
  scrollOffsets,
}: {
  readonly layer: GpuFlowNodeLayerState;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
}): readonly HtmlSurfaceSolidRoundedRectVisual[] | undefined {
  const scene = layer.scene;
  if (!scene) {
    return layer.htmlSurfaceNativeVisuals;
  }
  const rowHoverTarget = layer.retainedContentRowHoverTarget ?? null;
  return [
    ...getGpuRetainedContentScrollbarVisuals(scene.contentSurfaces, {
      scrollOffsets,
      visualState: layer.retainedContentScrollbarVisualState,
    }),
    ...(rowHoverTarget
      ? getGpuRetainedContentRowHoverVisuals({
          scene,
          scrollOffsets,
          target: rowHoverTarget,
        })
      : getGpuRetainedContentRowHoverStateVisuals({
          scene,
          scrollOffsets,
        })),
  ];
}

export function nextFrame(frameRef: MutableRefObject<number>): number {
  frameRef.current += 1;
  return frameRef.current;
}

export type GpuFlowRetainedContentFrameCache = {
  readonly contentSurfaces: readonly GpuContentSurface[] | undefined;
  readonly devicePixelRatio: number;
  readonly generation: GpuRetainedContentFrameGeneration;
  readonly pageDrawableRevision: number;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
  readonly sceneRevision: number;
  readonly scrollRevision: number;
  readonly viewportZoomBucket: number;
};

function resolveGpuFlowRetainedContentFrame({
  contentSurfaces,
  devicePixelRatio,
  frame,
  retainedContentFrameCacheRef,
  retainedContentPageManager,
  retainedContentRuntimeState,
  sceneRevision,
  viewportZoomBucket,
}: {
  readonly contentSurfaces: readonly GpuContentSurface[] | undefined;
  readonly devicePixelRatio: number;
  readonly frame: number;
  readonly retainedContentFrameCacheRef: MutableRefObject<GpuFlowRetainedContentFrameCache | null>;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly sceneRevision: number;
  readonly viewportZoomBucket: number;
}): {
  readonly generation: GpuRetainedContentFrameGeneration;
  readonly preparedFrame: RetainedContentTexturePagePreparedFrame;
} {
  const cachedFrame = retainedContentFrameCacheRef.current;
  const scrollOffsets = getGpuRetainedContentRuntimeScrollOffsets(
    retainedContentRuntimeState,
  );
  const scrollRevision = getGpuRetainedContentRuntimeScrollRevision(
    retainedContentRuntimeState,
  );
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
    })
  ) {
    return {
      generation: cachedFrame.generation,
      preparedFrame: {
        ...cachedFrame.preparedFrame,
        frame,
      },
    };
  }

  const generation = createGpuRetainedContentFrameGeneration({
    contentSurfaces,
    scrollOffsets,
    viewportZoomBucket,
  });
  const preparedFrame = retainedContentPageManager.prepareFrame({
    devicePixelRatio,
    frame,
    surfaces: generation.contentPageSurfaces,
    viewportZoomBucket,
  });
  retainedContentFrameCacheRef.current = {
    contentSurfaces,
    devicePixelRatio,
    generation,
    pageDrawableRevision,
    preparedFrame,
    sceneRevision,
    scrollRevision,
    viewportZoomBucket,
  };
  return { generation, preparedFrame };
}

export function shouldReuseGpuFlowRetainedContentFrameCache({
  cachedFrame,
  contentSurfaces,
  devicePixelRatio,
  pageDrawableRevision,
  sceneRevision,
  scrollRevision,
  viewportZoomBucket,
}: {
  readonly cachedFrame: GpuFlowRetainedContentFrameCache;
  readonly contentSurfaces: readonly GpuContentSurface[] | undefined;
  readonly devicePixelRatio: number;
  readonly pageDrawableRevision: number;
  readonly sceneRevision: number;
  readonly scrollRevision: number;
  readonly viewportZoomBucket: number;
}): boolean {
  return (
    cachedFrame.contentSurfaces === contentSurfaces &&
    cachedFrame.devicePixelRatio === devicePixelRatio &&
    cachedFrame.pageDrawableRevision === pageDrawableRevision &&
    cachedFrame.preparedFrame.missingPageCount === 0 &&
    cachedFrame.preparedFrame.uncoveredRectCount === 0 &&
    cachedFrame.sceneRevision === sceneRevision &&
    cachedFrame.scrollRevision === scrollRevision &&
    cachedFrame.viewportZoomBucket === viewportZoomBucket
  );
}

export function shouldDeferGpuFlowRetainedContentPostSubmitMaintenance({
  deferResolutionUpdates,
  preparedFrame,
}: {
  readonly deferResolutionUpdates: boolean;
  readonly preparedFrame: Pick<
    RetainedContentTexturePagePreparedFrame,
    "uncoveredRectCount"
  >;
}): boolean {
  return deferResolutionUpdates && preparedFrame.uncoveredRectCount === 0;
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
  retainedContentRuntimeState,
  retainedTextLikeRowSnapshotElementByIdRef,
  retainedContentSwitchAnimations,
  retainedContentFrameCacheRef,
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
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly retainedTextLikeRowSnapshotElementByIdRef: MutableRefObject<
    Map<string, HTMLElement>
  >;
  readonly retainedContentSwitchAnimations: GpuRetainedContentSwitchAnimationStore;
  readonly retainedContentFrameCacheRef: MutableRefObject<GpuFlowRetainedContentFrameCache | null>;
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
  const darkMode = isGpuFlowFrameDarkMode(runtime.canvas);
  postGpuFlowRetainedContentVisualStateChromeReproEvent({
    frame,
    scene: layer.scene,
    viewportInteractionActive: deferResolutionUpdates,
  });
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
  const retainedFrame = resolveGpuFlowRetainedContentFrame({
    contentSurfaces: layer.scene?.contentSurfaces,
    devicePixelRatio: canvasSize.devicePixelRatio,
    frame,
    retainedContentFrameCacheRef,
    retainedContentPageManager: resources.retainedContentPageManager,
    retainedContentRuntimeState,
    sceneRevision: layer.scene?.revision ?? 0,
    viewportZoomBucket,
  });
  const retainedFrameGeneration = retainedFrame.generation;
  const retainedPagePreparedFrame = retainedFrame.preparedFrame;
  postGpuFlowRetainedTextLikeRowSnapshotChromeReproEvent({
    frame,
    preparedFrame: retainedPagePreparedFrame,
    snapshotSources: retainedFrameGeneration.textLikeRowSnapshotSources,
    viewportInteractionActive: deferResolutionUpdates,
  });
  markGpuFlowRetainedContentSwitchFreshnessDirty({
    frame,
    retainedContentPageManager: resources.retainedContentPageManager,
    scrollOffsets: runtimeScrollOffsets,
    sourceSurfaces: retainedFrameGeneration.sourceSurfaces,
    switchAnimations: retainedContentSwitchAnimations,
  });
  const switchAnimationNativeVisuals =
    getGpuRetainedContentSwitchAnimationVisuals({
      darkMode,
      nowMs: renderStartedAt,
      scrollOffsets: runtimeScrollOffsets,
      scene: layer.scene,
      switchAnimations: retainedContentSwitchAnimations,
    });
  const retainedRuntimeNativeVisuals =
    getGpuFlowRetainedContentRuntimeNativeVisuals({
      layer,
      scrollOffsets: runtimeScrollOffsets,
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
      retainedRuntimeNativeVisuals,
      switchAnimationNativeVisuals,
    ),
    htmlSurfacePageVisuals: retainedPagePreparedFrame.flatSurfaces,
    marginCssPx: layer.marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes: layer.nodeTextureMemoryBudgetBytes,
    renderer: resources.htmlSurfaceRenderer,
    textureManager: resources.textureManager,
    uploadBudget: layer.uploadBudget,
    viewport: layer.viewport,
  });
  const deferRetainedPageMaintenance =
    shouldDeferGpuFlowRetainedContentPostSubmitMaintenance({
      deferResolutionUpdates,
      preparedFrame: retainedPagePreparedFrame,
    });
  const retainedPageResult = deferRetainedPageMaintenance
    ? resources.retainedContentPageManager.deferPostSubmitMaintenance({
        preparedFrame: retainedPagePreparedFrame,
      })
    : resources.retainedContentPageManager.runPostSubmitMaintenance({
        darkMode,
        preparedFrame: retainedPagePreparedFrame,
        // Switch transitions are composited below as native visuals, so texture
        // pages must cache only the static scene state.
        textLikeSnapshotElementById:
          retainedTextLikeRowSnapshotElementByIdRef.current,
        viewportInteractionActive: deferResolutionUpdates,
      });
  postGpuFlowRetainedTextLikeRowSnapshotMaintenanceChromeReproEvent({
    elementBySourceId: retainedTextLikeRowSnapshotElementByIdRef.current,
    frame,
    maintenanceResult: retainedPageResult,
    snapshotSources: retainedFrameGeneration.textLikeRowSnapshotSources,
    viewportInteractionActive: deferResolutionUpdates,
  });
  if (!deferRetainedPageMaintenance) {
    settleGpuFlowRetainedContentCompletedSwitchAnimationSurfaces({
      nowMs: renderStartedAt,
      retainedContentPageManager: resources.retainedContentPageManager,
      scrollOffsets: runtimeScrollOffsets,
      sourceSurfaces: retainedFrameGeneration.sourceSurfaces,
      switchAnimations: retainedContentSwitchAnimations,
    });
  }
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
    }),
    viewport: layer.viewport,
    viewportFrame,
  });
  updateGpuFlowNodeLayerFrameState({
    callbacksRef,
    layerResult: combinedLayerResult,
    nodeInteractionRef,
    nodeLayerRef,
    retainedTexturePageFollowUpFrame: retainedPageResult.needsFollowUpFrame,
    surfaceRef,
    switchAnimationFollowUpFrame: switchAnimationNeedsFollowUpFrame,
    transformOnlyPaintNodeIdsRef,
    viewport: layer.viewport,
    viewportFrame,
    visibleNodeIdsRef,
  });
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

function markGpuFlowRetainedContentSwitchFreshnessDirty({
  frame,
  retainedContentPageManager,
  scrollOffsets,
  sourceSurfaces,
  switchAnimations,
}: {
  readonly frame: number;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly sourceSurfaces: readonly GpuRetainedContentSourceSurface[];
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}) {
  for (const surface of sourceSurfaces) {
    const sampledSurface = sampleGpuFlowRetainedContentSwitchAnimationSurface({
      scrollOffsets,
      surface,
    });
    const sourceRect = getGpuRetainedContentSourceRectForRows({
      rowIds:
        switchAnimations.getFreshnessProtectedSurfaceRowIds(sampledSurface),
      surface: sampledSurface,
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
  scrollOffsets,
  sourceSurfaces,
  switchAnimations,
}: {
  readonly nowMs: number;
  readonly retainedContentPageManager: RetainedContentTexturePageManager;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly sourceSurfaces: readonly GpuRetainedContentSourceSurface[];
  readonly switchAnimations: GpuRetainedContentSwitchAnimationStore;
}) {
  for (const surface of sourceSurfaces) {
    const sampledSurface = sampleGpuFlowRetainedContentSwitchAnimationSurface({
      scrollOffsets,
      surface,
    });
    switchAnimations.settleCompletedSurfaceTransitions({
      isRowFresh: (rowId) => {
        const sourceRect = getGpuRetainedContentSourceRectForRows({
          rowIds: [rowId],
          surface: sampledSurface,
        });
        return sourceRect
          ? retainedContentPageManager.hasFreshSurfaceContentForRect({
              sourceRect,
              surfaceId: sampledSurface.id,
            })
          : true;
      },
      nowMs,
      surface: sampledSurface,
    });
  }
}

function sampleGpuFlowRetainedContentSwitchAnimationSurface<
  TSurface extends GpuContentSurface & {
    readonly retainedScene: NonNullable<GpuContentSurface["retainedScene"]>;
  },
>({
  scrollOffsets,
  surface,
}: {
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly surface: TSurface;
}): TSurface {
  return {
    ...surface,
    retainedScene: createGpuRetainedContentSampledSceneForSurface({
      scrollOffsets,
      surface,
    }),
  };
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
  viewport,
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
