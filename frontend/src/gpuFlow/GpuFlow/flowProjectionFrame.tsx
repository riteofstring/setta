import { type MutableRefObject } from "react";

import type { GpuFlowRuntime } from "../gpuDevice";
import { type GpuCanvasSize, type GpuFrameReason } from "../gpuRenderer";
import { getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces } from "../GpuRetainedContentPageFrameSurfaces";
import { getGpuRetainedContentSourceSurfaces } from "../GpuRetainedContentSurfaces";
import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  renderHtmlSurfaceFrame,
  type GpuNodeDomTransformSyncCache,
} from "../htmlSurfaces/frame";
import type { HtmlSurfaceRenderer } from "../htmlSurfaces/renderer";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { HtmlSurfaceFlatVisual } from "../htmlSurfaces/visualScene";
import type { MutableGpuFlowInteractionDiagnostics } from "../interactionDiagnostics";
import { createGpuFlowInteractionDiagnosticsSnapshot } from "../interactionDiagnostics";
import { type GpuNodeInteractionDirtyController } from "../nodeInteractionDirty";
import {
  getGpuRetainedContentRuntimeScrollOffsets,
  type GpuRetainedContentRuntimeState,
} from "../retainedContentRuntimeState";
import type { GpuRetainedContentScrollOffsetMap } from "../retainedContentScroll";
import type {
  RetainedContentTexturePageFrameSurface,
  RetainedContentTexturePageManager,
} from "../retainedContentTexturePageManager";
import type { RetainedContentTextureResources } from "../retainedContentTextureResources";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import type { RetainedTexturePageDrawQuad } from "../retainedTexturePageGrid";
import { createRetainedTexturePageFlatVisuals } from "../retainedTexturePageVisuals";
import type { GpuFlowScene } from "../scene";
import type { GpuRect } from "../viewportMath";
import type { GpuFlowViewportStoreApi } from "../viewportStore";
import {
  nextFrame,
  reportGpuFlowNodeLayerFramePerformance,
  resolveRenderableGpuFlowLayerFrameInput,
  updateGpuFlowNodeLayerFrameState,
} from "./flowFrame";
import {
  resolveActiveGpuFlowNodeId,
  resolveGpuFlowNodeInteractionActiveNodeId,
} from "./flowFrameInteractionState";
import type { GpuFlowNodeLayerState } from "./flowLayerState";
import type { GpuFlowCallbacks } from "./flowSurfaceTypes";

export function shouldRenderGpuFlowProjectionOnlyFrame(
  reasons: readonly string[],
): boolean {
  return (
    reasons.length > 0 &&
    reasons.every(
      (reason) => reason === "viewport" || reason === "retained-scroll",
    )
  );
}

export function renderGpuFlowNodeLayerProjectionFrame({
  activeResizeNodeIdRef,
  callbacksRef,
  canvasSizeRef,
  frameReasons,
  frameRef,
  interactionDiagnosticsRef,
  nodeDomTransformSyncCacheRef,
  nodeElementByIdRef,
  nodeInteractionRef,
  nodeLayerRef,
  htmlSurfaceRendererRef,
  retainedContentPageManagerRef,
  retainedDisplayFrameRef,
  retainedContentRuntimeState,
  runtime,
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
  readonly frameReasons: readonly GpuFrameReason[];
  readonly frameRef: MutableRefObject<number>;
  readonly interactionDiagnosticsRef: MutableRefObject<MutableGpuFlowInteractionDiagnostics>;
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
  readonly htmlSurfaceRendererRef: MutableRefObject<HtmlSurfaceRenderer | null>;
  readonly retainedContentPageManagerRef: MutableRefObject<RetainedContentTexturePageManager | null>;
  readonly retainedDisplayFrameRef: MutableRefObject<RetainedDisplayFrame | null>;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly runtime: GpuFlowRuntime;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
  readonly visibleNodeIdsRef: MutableRefObject<ReadonlySet<string>>;
  readonly viewportStore: GpuFlowViewportStoreApi;
  readonly viewportFrame: boolean;
}): boolean {
  const retainedDisplayFrame = retainedDisplayFrameRef.current;
  if (!retainedDisplayFrame) {
    return false;
  }
  const frameInput = resolveRenderableGpuFlowLayerFrameInput({
    canvasSizeRef,
    nodeLayerRef,
    htmlSurfaceRendererRef,
    retainedContentPageManagerRef,
    runtime,
    textureManagerRef,
  });
  if (!frameInput) {
    return true;
  }
  const { canvasSize, layer, nodes, resources } = frameInput;
  const frame = nextFrame(frameRef);
  const renderStartedAt = performance.now();
  const retainedRuntimeFrame = retainedDisplayFrame.retainedRuntimeFrame;
  const projectionSurfaceResolveStart = performance.now();
  const retainedPageVisuals = frameReasons.includes("retained-scroll")
    ? projectGpuFlowRetainedDisplayFrameFlatSurfaces({
        layer,
        retainedDisplayFrame,
        retainedContentRuntimeState,
      })
    : retainedDisplayFrame.flatSurfaces;
  const projectionSurfaceResolveMs =
    performance.now() - projectionSurfaceResolveStart;
  const htmlSurfaceFrameStart = performance.now();
  const layerResult = renderHtmlSurfaceFrame({
    activeNodeId: resolveActiveGpuFlowNodeId({
      activeResizeNodeIdRef,
      nodeInteractionRef,
    }),
    canvasSize,
    deferResolutionUpdates: true,
    domTransformCache: nodeDomTransformSyncCacheRef.current,
    edges: layer.edges,
    edgePalette: layer.edgePalette,
    elementByNodeId: nodeElementByIdRef.current,
    forceVisibleNodeIds: layer.forceVisibleNodeIds,
    frame,
    grid: layer.grid,
    htmlSurfaceOverlays: layer.edgeLabelSurfaces,
    htmlSurfaceNativeVisuals:
      retainedRuntimeFrame.descriptors.htmlSurfaceNativeVisuals,
    htmlSurfacePageVisuals: retainedPageVisuals,
    marginCssPx: layer.marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes: layer.nodeTextureMemoryBudgetBytes,
    renderer: resources.htmlSurfaceRenderer,
    textureManager: resources.textureManager,
    textureWorkMode: "projection",
    uploadBudget: layer.uploadBudget,
    viewport: layer.viewport,
  });
  const htmlSurfaceFrameMs = performance.now() - htmlSurfaceFrameStart;
  reportGpuFlowNodeLayerFramePerformance({
    callbacksRef,
    deferResolutionUpdates: true,
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
    layerResult,
    phaseDiagnostics: {
      committedContentPublishMs: 0,
      diagnosticsMs: 0,
      domTextActorProjectionMs: 0,
      frameMode: "projection",
      htmlSurfaceFrameMs,
      projectionSurfaceResolveMs,
      retainedDisplayTransactionMs: 0,
      retainedPageFrameMs: 0,
      retainedPageMaintenanceMs: 0,
      retainedRuntimeFrameMs: 0,
      schedulingMs: 0,
    },
    renderDurationMs: performance.now() - renderStartedAt,
    retainedTexturePages: undefined,
    viewport: layer.viewport,
    viewportFrame,
  });
  updateGpuFlowNodeLayerFrameState({
    callbacksRef,
    layerResult,
    nodeInteractionRef,
    nodeLayerRef,
    retainedRuntimeFrame,
    retainedTexturePageFollowUpFrame: false,
    surfaceRef,
    switchAnimationFollowUpFrame: false,
    transformOnlyPaintNodeIdsRef,
    viewport: layer.viewport,
    viewportFrame,
    visibleNodeIdsRef,
  });
  return true;
}

function projectGpuFlowRetainedDisplayFrameFlatSurfaces({
  layer,
  retainedContentRuntimeState,
  retainedDisplayFrame,
}: {
  readonly layer: GpuFlowNodeLayerState;
  readonly retainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
}): readonly HtmlSurfaceFlatVisual[] {
  if (!layer.scene) {
    return retainedDisplayFrame.flatSurfaces;
  }
  const scrollOffsets = getGpuRetainedContentRuntimeScrollOffsets(
    retainedContentRuntimeState,
  );
  const changedSurfaceIds = getGpuFlowRetainedProjectionChangedSurfaceIds({
    currentScrollOffsets: scrollOffsets,
    retainedDisplayFrame,
  });
  if (changedSurfaceIds.size === 0) {
    return retainedDisplayFrame.flatSurfaces;
  }
  const projectedVisualsBySurfaceId =
    createGpuFlowRetainedProjectionVisualsBySurfaceId({
      changedSurfaceIds,
      layerScene: layer.scene,
      retainedDisplayFrame,
      scrollOffsets,
    });
  if (projectedVisualsBySurfaceId.size === 0) {
    return retainedDisplayFrame.flatSurfaces;
  }
  return mergeGpuFlowRetainedProjectionFlatSurfaces({
    changedSurfaceIds,
    projectedVisualsBySurfaceId,
    retainedDisplayFrame,
  });
}

function createGpuFlowRetainedProjectionVisualsBySurfaceId({
  changedSurfaceIds,
  layerScene,
  retainedDisplayFrame,
  scrollOffsets,
}: {
  readonly changedSurfaceIds: ReadonlySet<string>;
  readonly layerScene: GpuFlowScene;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
}): ReadonlyMap<string, readonly HtmlSurfaceFlatVisual[]> {
  const viewportZoomBucket =
    retainedDisplayFrame.retainedRuntimeFrame.input.viewportZoomBucket;
  const sourceSurfaces = getGpuRetainedContentSourceSurfaces(
    layerScene.contentSurfaces.filter((surface) =>
      changedSurfaceIds.has(surface.id),
    ),
    {
      scrollOffsets,
      viewportZoomBucket,
    },
  );
  const currentSurfaces =
    getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces(
      sourceSurfaces,
      {
        viewportZoomBucket,
      },
    );
  const pagesBySurfaceId = collectGpuFlowRetainedProjectionPagesBySurfaceId({
    changedSurfaceIds,
    retainedDisplayFrame,
  });
  const projectedVisualsBySurfaceId = new Map<
    string,
    readonly HtmlSurfaceFlatVisual[]
  >();
  for (const surface of currentSurfaces) {
    const pages = pagesBySurfaceId.get(surface.surfaceId);
    if (!pages) {
      continue;
    }
    projectedVisualsBySurfaceId.set(
      surface.surfaceId,
      createGpuFlowRetainedProjectionFlatVisuals({
        pages,
        surface,
      }),
    );
  }
  return projectedVisualsBySurfaceId;
}

function collectGpuFlowRetainedProjectionPagesBySurfaceId({
  changedSurfaceIds,
  retainedDisplayFrame,
}: {
  readonly changedSurfaceIds: ReadonlySet<string>;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
}): ReadonlyMap<
  string,
  ReadonlyMap<string, RetainedDisplayFrame["drawRegions"][number]["page"]>
> {
  const pagesBySurfaceId = new Map<
    string,
    Map<string, RetainedDisplayFrame["drawRegions"][number]["page"]>
  >();
  for (const region of retainedDisplayFrame.drawRegions) {
    if (!changedSurfaceIds.has(region.page.descriptor.surfaceId)) {
      continue;
    }
    const surfacePages =
      pagesBySurfaceId.get(region.page.descriptor.surfaceId) ?? new Map();
    surfacePages.set(region.page.key, region.page);
    pagesBySurfaceId.set(region.page.descriptor.surfaceId, surfacePages);
  }
  return pagesBySurfaceId;
}

function createGpuFlowRetainedProjectionFlatVisuals({
  pages,
  surface,
}: {
  readonly pages: ReadonlyMap<
    string,
    RetainedDisplayFrame["drawRegions"][number]["page"]
  >;
  readonly surface: RetainedContentTexturePageFrameSurface;
}): readonly HtmlSurfaceFlatVisual[] {
  const drawQuads: RetainedTexturePageDrawQuad<RetainedContentTextureResources>[] =
    [];
  for (const page of pages.values()) {
    const sampleRectCss = intersectGpuFlowProjectionRects(
      page.descriptor.sourceRectCss,
      surface.visibleSourceRectCss,
    );
    if (!sampleRectCss) {
      continue;
    }
    drawQuads.push({
      coverageKind: "compatible",
      desiredDescriptor: page.descriptor,
      fidelityState: "compatible-mapped-region",
      page,
      sampleRectCss,
      staleContent: false,
    });
  }
  return createRetainedTexturePageFlatVisuals({
    drawQuads,
    layout: surface.layout,
  });
}

function mergeGpuFlowRetainedProjectionFlatSurfaces({
  changedSurfaceIds,
  projectedVisualsBySurfaceId,
  retainedDisplayFrame,
}: {
  readonly changedSurfaceIds: ReadonlySet<string>;
  readonly projectedVisualsBySurfaceId: ReadonlyMap<
    string,
    readonly HtmlSurfaceFlatVisual[]
  >;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
}): readonly HtmlSurfaceFlatVisual[] {
  const projectedSurfaceIds = new Set<string>();
  const visuals: HtmlSurfaceFlatVisual[] = [];
  for (const visual of retainedDisplayFrame.flatSurfaces) {
    if (!changedSurfaceIds.has(visual.surfaceId)) {
      visuals.push(visual);
      continue;
    }
    if (projectedSurfaceIds.has(visual.surfaceId)) {
      continue;
    }
    projectedSurfaceIds.add(visual.surfaceId);
    visuals.push(...(projectedVisualsBySurfaceId.get(visual.surfaceId) ?? []));
  }
  return visuals.length > 0 ? visuals : retainedDisplayFrame.flatSurfaces;
}

function getGpuFlowRetainedProjectionChangedSurfaceIds({
  currentScrollOffsets,
  retainedDisplayFrame,
}: {
  readonly currentScrollOffsets: GpuRetainedContentScrollOffsetMap;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
}): ReadonlySet<string> {
  const previousScrollOffsets =
    retainedDisplayFrame.retainedRuntimeFrame.input.scrollOffsets;
  const changedSurfaceIds = new Set<string>();
  for (const [surfaceId, currentOffset] of currentScrollOffsets) {
    const previousOffset = previousScrollOffsets.get(surfaceId);
    if (
      !previousOffset ||
      previousOffset.x !== currentOffset.x ||
      previousOffset.y !== currentOffset.y
    ) {
      changedSurfaceIds.add(surfaceId);
    }
  }
  for (const [surfaceId, previousOffset] of previousScrollOffsets) {
    const currentOffset = currentScrollOffsets.get(surfaceId);
    if (
      !currentOffset ||
      currentOffset.x !== previousOffset.x ||
      currentOffset.y !== previousOffset.y
    ) {
      changedSurfaceIds.add(surfaceId);
    }
  }
  return changedSurfaceIds;
}

function intersectGpuFlowProjectionRects(
  left: GpuRect,
  right: GpuRect,
): GpuRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  const width = Math.max(0, rightEdge - x);
  const height = Math.max(0, bottomEdge - y);
  return width > 0 && height > 0 ? { height, width, x, y } : null;
}
