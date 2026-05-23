import { type MutableRefObject } from "react";

import type { GpuFlowRuntime } from "../gpuDevice";
import { startGpuFlowPerformanceMeasure } from "../gpuFlowPerformanceMarks";
import { type GpuCanvasSize, type GpuFrameReason } from "../gpuRenderer";
import { getGpuRetainedContentTexturePageFrameSurfacesFromSourceSurfaces } from "../GpuRetainedContentPageFrameSurfaces";
import { getGpuRetainedContentSourceSurfaces } from "../GpuRetainedContentSurfaces";
import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  renderHtmlSurfaceFrame,
  type GpuNodeDomTransformSyncCache,
  type RenderHtmlSurfaceFrameResult,
} from "../htmlSurfaces/frame";
import type { HtmlSurfaceRenderer } from "../htmlSurfaces/renderer";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { HtmlSurfaceFlatVisual } from "../htmlSurfaces/visualScene";
import type { MutableGpuFlowInteractionDiagnostics } from "../interactionDiagnostics";
import { createGpuFlowInteractionDiagnosticsSnapshot } from "../interactionDiagnostics";
import { type GpuNodeInteractionDirtyController } from "../nodeInteractionDirty";
import {
  createGpuFlowProjectionDebugState,
  type GpuFlowHeldPreviousProjection,
  type GpuFlowProjectionLane,
  type GpuFlowProjectionTransaction,
  type GpuFlowProjectionTransactionKind,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
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
  resolveRenderableGpuFlowLayerFrameInput,
} from "./flowFrame";
import {
  resolveActiveGpuFlowNodeId,
  resolveGpuFlowNodeInteractionActiveNodeId,
} from "./flowFrameInteractionState";
import {
  reportGpuFlowNodeLayerFramePerformance,
  type GpuFlowNodeLayerFrameStatePublication,
} from "./flowFrameLifecycle";
import type { GpuFlowNodeLayerState } from "./flowLayerState";
import type { GpuFlowCallbacks } from "./flowSurfaceTypes";
import { projectGpuRetainedDomControlSnapshotSurfaceLayouts } from "./retainedDomControlSnapshotSources";
import type { GpuFlowProjectionFrameRenderablePlan } from "./visibleFramePublicationKernel";

export type GpuFlowRetainedProjectionFrame = {
  readonly flatSurfaces: readonly HtmlSurfaceFlatVisual[];
  readonly missingCoverageSurfaceIds: ReadonlySet<string>;
  readonly needsRetainedPageMaintenance: boolean;
};

type RenderGpuFlowNodeLayerProjectionFrameResult =
  | {
      readonly rendered: false;
    }
  | {
      readonly rendered: true;
      readonly heldPreviousProjection: GpuFlowHeldPreviousProjection | null;
      readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
      readonly transaction: GpuFlowProjectionTransaction;
    };

type GpuFlowRetainedProjectionVisualsBySurfaceId = {
  readonly missingCoverageSurfaceIds: ReadonlySet<string>;
  readonly projectedVisualsBySurfaceId: ReadonlyMap<
    string,
    readonly HtmlSurfaceFlatVisual[]
  >;
};

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
  projectionFrameRenderPlan,
  requestedProjectionTransaction,
  heldPreviousProjectionState,
  htmlSurfaceRendererRef,
  retainedContentPageManagerRef,
  retainedDisplayFrameRef,
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
  readonly projectionFrameRenderPlan: GpuFlowProjectionFrameRenderablePlan;
  readonly requestedProjectionTransaction: GpuFlowProjectionTransaction;
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly htmlSurfaceRendererRef: MutableRefObject<HtmlSurfaceRenderer | null>;
  readonly retainedContentPageManagerRef: MutableRefObject<RetainedContentTexturePageManager | null>;
  readonly retainedDisplayFrameRef: MutableRefObject<RetainedDisplayFrame | null>;
  readonly runtime: GpuFlowRuntime;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
  readonly visibleNodeIdsRef: MutableRefObject<ReadonlySet<string>>;
  readonly viewportStore: GpuFlowViewportStoreApi;
  readonly viewportFrame: boolean;
}): RenderGpuFlowNodeLayerProjectionFrameResult {
  const retainedDisplayFrame = retainedDisplayFrameRef.current;
  if (!retainedDisplayFrame) {
    return { rendered: false };
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
    return {
      heldPreviousProjection: null,
      nodeLayerFrameStatePublication: null,
      rendered: true,
      transaction: requestedProjectionTransaction,
    };
  }
  const { canvasSize, layer, nodes, resources } = frameInput;
  const frame = nextFrame(frameRef);
  const renderStartedAt = performance.now();
  const retainedRuntimeFrame = retainedDisplayFrame.retainedRuntimeFrame;
  const finishProjectionResolveMeasure = startGpuFlowPerformanceMeasure(
    "projection-surface-resolve",
    {
      frame,
      transactionId: requestedProjectionTransaction.id,
    },
  );
  const { heldPreviousProjection, retainedProjectionFrame, transaction } =
    projectionFrameRenderPlan;
  const projectionViewport = transaction.sample.viewport;
  const projectionRetainedRuntimeFrame =
    resolveGpuFlowProjectionRetainedRuntimeFrame({
      fallbackRetainedRuntimeFrame: retainedRuntimeFrame,
      heldPreviousProjectionState,
      transaction,
    });
  const retainedPageVisuals = retainedProjectionFrame.flatSurfaces;
  const htmlSurfaceOverlays =
    projectGpuRetainedDomControlSnapshotSurfaceLayouts({
      controls: projectionRetainedRuntimeFrame.descriptors.domControlSources,
      getRetainedScrollOffset: (surfaceId) =>
        transaction.sample.retainedScrollOffsets.get(surfaceId) ?? null,
      overlays: layer.edgeLabelSurfaces,
    });
  const projectionSurfaceResolveMs = finishProjectionResolveMeasure();
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
    htmlSurfaceOverlays,
    htmlSurfaceNativeVisuals:
      projectionRetainedRuntimeFrame.descriptors.htmlSurfaceNativeVisuals,
    htmlSurfacePageVisuals: retainedPageVisuals,
    marginCssPx: layer.marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes: layer.nodeTextureMemoryBudgetBytes,
    renderer: resources.htmlSurfaceRenderer,
    textureManager: resources.textureManager,
    textureWorkMode: "projection",
    uploadBudget: layer.uploadBudget,
    viewport: projectionViewport,
  });
  assertGpuFlowMotionProjectionFrameWork({
    layerResult,
    projectionLane: transaction.lane,
    transactionKind: transaction.kind,
  });
  const projectionDebugState = createGpuFlowProjectionDebugState(
    transaction,
    heldPreviousProjection,
  );
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
    projectionDebugState,
    renderDurationMs: performance.now() - renderStartedAt,
    retainedTexturePages: undefined,
    viewport: projectionViewport,
    viewportFrame,
  });
  const nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication =
    {
      callbacksRef,
      layerResult,
      nodeInteractionRef,
      nodeLayerRef,
      retainedRuntimeFrame: projectionRetainedRuntimeFrame,
      retainedTexturePageFollowUpFrame:
        retainedProjectionFrame.needsRetainedPageMaintenance,
      surfaceRef,
      switchAnimationFollowUpFrame: false,
      transformOnlyPaintNodeIdsRef,
      viewport: projectionViewport,
      viewportFrame,
      visibleNodeIdsRef,
    };
  return {
    heldPreviousProjection,
    nodeLayerFrameStatePublication,
    rendered: true,
    transaction,
  };
}

function resolveGpuFlowProjectionRetainedRuntimeFrame({
  fallbackRetainedRuntimeFrame,
  heldPreviousProjectionState,
  transaction,
}: {
  readonly fallbackRetainedRuntimeFrame: RetainedDisplayFrame["retainedRuntimeFrame"];
  readonly heldPreviousProjectionState: GpuFlowVisibleProjectionState | null;
  readonly transaction: GpuFlowProjectionTransaction;
}): RetainedDisplayFrame["retainedRuntimeFrame"] {
  if (transaction.kind !== "held-previous") {
    return fallbackRetainedRuntimeFrame;
  }
  return (
    heldPreviousProjectionState?.committedFrame.retainedRuntimeFrame ??
    fallbackRetainedRuntimeFrame
  );
}

export function assertGpuFlowMotionProjectionFrameWork({
  layerResult,
  projectionLane,
  transactionKind,
}: {
  readonly layerResult: Pick<
    RenderHtmlSurfaceFrameResult,
    | "budgetExhausted"
    | "deferredNodeIds"
    | "evictedTextureBytes"
    | "evictedTextureNodeIds"
    | "missingElementNodeIds"
    | "remainingDirtyNodeIds"
    | "skippedNodeIds"
    | "uploadedNodeIds"
  >;
  readonly projectionLane: GpuFlowProjectionLane;
  readonly transactionKind: GpuFlowProjectionTransactionKind;
}): void {
  if (
    projectionLane !== "motion" ||
    (transactionKind !== "motion-projection" &&
      transactionKind !== "held-previous")
  ) {
    return;
  }
  const blockedWork = {
    deferredNodeIds: layerResult.deferredNodeIds,
    evictedTextureBytes: layerResult.evictedTextureBytes,
    evictedTextureNodeIds: layerResult.evictedTextureNodeIds,
    missingElementNodeIds: layerResult.missingElementNodeIds,
    remainingDirtyNodeIds: layerResult.remainingDirtyNodeIds,
    skippedNodeIds: layerResult.skippedNodeIds,
    uploadedNodeIds: layerResult.uploadedNodeIds,
  };
  if (
    hasGpuFlowProjectionOnlyForbiddenContentWork({
      budgetExhausted: layerResult.budgetExhausted,
      blockedWork,
    })
  ) {
    throw new Error(
      `GPU Flow motion projection frame performed forbidden content work: ${JSON.stringify(
        blockedWork,
      )}`,
    );
  }
}

function hasGpuFlowProjectionOnlyForbiddenContentWork({
  blockedWork,
  budgetExhausted,
}: {
  readonly blockedWork: {
    readonly deferredNodeIds: readonly string[];
    readonly evictedTextureBytes: number;
    readonly evictedTextureNodeIds: readonly string[];
    readonly missingElementNodeIds: readonly string[];
    readonly remainingDirtyNodeIds: readonly string[];
    readonly skippedNodeIds: readonly string[];
    readonly uploadedNodeIds: readonly string[];
  };
  readonly budgetExhausted: boolean;
}): boolean {
  return [
    budgetExhausted,
    blockedWork.evictedTextureBytes > 0,
    blockedWork.evictedTextureNodeIds.length > 0,
    blockedWork.uploadedNodeIds.length > 0,
  ].some(Boolean);
}

export function resolveGpuFlowRetainedProjectionFrame({
  layer,
  retainedDisplayFrame,
  transaction,
}: {
  readonly layer: GpuFlowNodeLayerState;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
  readonly transaction: GpuFlowProjectionTransaction;
}): GpuFlowRetainedProjectionFrame {
  if (
    !hasGpuFlowRetainedProjectionScrollSampleChanged({
      retainedDisplayFrame,
      scrollOffsets: transaction.sample.retainedScrollOffsets,
    })
  ) {
    return {
      flatSurfaces: retainedDisplayFrame.flatSurfaces,
      missingCoverageSurfaceIds: new Set(),
      needsRetainedPageMaintenance: false,
    };
  }
  return projectGpuFlowRetainedDisplayFrameFlatSurfaces({
    layer,
    retainedDisplayFrame,
    scrollOffsets: transaction.sample.retainedScrollOffsets,
  });
}

function hasGpuFlowRetainedProjectionScrollSampleChanged({
  retainedDisplayFrame,
  scrollOffsets,
}: {
  readonly retainedDisplayFrame: RetainedDisplayFrame;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
}): boolean {
  return (
    getGpuFlowRetainedProjectionChangedSurfaceIds({
      currentScrollOffsets: scrollOffsets,
      retainedDisplayFrame,
    }).size > 0
  );
}

function projectGpuFlowRetainedDisplayFrameFlatSurfaces({
  layer,
  retainedDisplayFrame,
  scrollOffsets,
}: {
  readonly layer: GpuFlowNodeLayerState;
  readonly retainedDisplayFrame: RetainedDisplayFrame;
  readonly scrollOffsets: GpuRetainedContentScrollOffsetMap;
}): GpuFlowRetainedProjectionFrame {
  if (!layer.scene) {
    return {
      flatSurfaces: retainedDisplayFrame.flatSurfaces,
      missingCoverageSurfaceIds: new Set(),
      needsRetainedPageMaintenance: false,
    };
  }
  const changedSurfaceIds = getGpuFlowRetainedProjectionChangedSurfaceIds({
    currentScrollOffsets: scrollOffsets,
    retainedDisplayFrame,
  });
  if (changedSurfaceIds.size === 0) {
    return {
      flatSurfaces: retainedDisplayFrame.flatSurfaces,
      missingCoverageSurfaceIds: new Set(),
      needsRetainedPageMaintenance: false,
    };
  }
  const { missingCoverageSurfaceIds, projectedVisualsBySurfaceId } =
    createGpuFlowRetainedProjectionVisualsBySurfaceId({
      changedSurfaceIds,
      layerScene: layer.scene,
      retainedDisplayFrame,
      scrollOffsets,
    });
  if (projectedVisualsBySurfaceId.size === 0) {
    return {
      flatSurfaces: retainedDisplayFrame.flatSurfaces,
      missingCoverageSurfaceIds,
      needsRetainedPageMaintenance: missingCoverageSurfaceIds.size > 0,
    };
  }
  return {
    flatSurfaces: mergeGpuFlowRetainedProjectionFlatSurfaces({
      changedSurfaceIds,
      projectedVisualsBySurfaceId,
      retainedDisplayFrame,
    }),
    missingCoverageSurfaceIds,
    needsRetainedPageMaintenance: missingCoverageSurfaceIds.size > 0,
  };
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
}): GpuFlowRetainedProjectionVisualsBySurfaceId {
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
  const missingCoverageSurfaceIds = new Set<string>();
  for (const surface of currentSurfaces) {
    const pages = pagesBySurfaceId.get(surface.surfaceId);
    if (!pages) {
      missingCoverageSurfaceIds.add(surface.surfaceId);
      continue;
    }
    if (
      !isGpuFlowRetainedProjectionSurfaceCovered({
        pages,
        surface,
      })
    ) {
      missingCoverageSurfaceIds.add(surface.surfaceId);
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
  return {
    missingCoverageSurfaceIds,
    projectedVisualsBySurfaceId,
  };
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
    const projectedVisuals = projectedVisualsBySurfaceId.get(visual.surfaceId);
    if (!projectedVisuals) {
      visuals.push(visual);
      continue;
    }
    if (projectedSurfaceIds.has(visual.surfaceId)) {
      continue;
    }
    projectedSurfaceIds.add(visual.surfaceId);
    visuals.push(...projectedVisuals);
  }
  return visuals.length > 0 ? visuals : retainedDisplayFrame.flatSurfaces;
}

export function isGpuFlowRetainedProjectionSurfaceCovered({
  pages,
  surface,
}: {
  readonly pages: ReadonlyMap<
    string,
    RetainedDisplayFrame["drawRegions"][number]["page"]
  >;
  readonly surface: RetainedContentTexturePageFrameSurface;
}): boolean {
  let missingRects: readonly GpuRect[] = [surface.visibleSourceRectCss];
  for (const page of pages.values()) {
    missingRects = missingRects.flatMap((missing) =>
      subtractGpuFlowProjectionRect(missing, page.descriptor.sourceRectCss),
    );
    if (missingRects.length === 0) {
      return true;
    }
  }
  return false;
}

function subtractGpuFlowProjectionRect(
  target: GpuRect,
  covered: GpuRect,
): readonly GpuRect[] {
  const overlap = intersectGpuFlowProjectionRects(target, covered);
  if (!overlap) {
    return [target];
  }
  const rects: GpuRect[] = [];
  const targetRight = target.x + target.width;
  const targetBottom = target.y + target.height;
  const overlapRight = overlap.x + overlap.width;
  const overlapBottom = overlap.y + overlap.height;
  if (overlap.y > target.y) {
    rects.push({
      height: overlap.y - target.y,
      width: target.width,
      x: target.x,
      y: target.y,
    });
  }
  if (overlapBottom < targetBottom) {
    rects.push({
      height: targetBottom - overlapBottom,
      width: target.width,
      x: target.x,
      y: overlapBottom,
    });
  }
  if (overlap.x > target.x) {
    rects.push({
      height: overlap.height,
      width: overlap.x - target.x,
      x: target.x,
      y: overlap.y,
    });
  }
  if (overlapRight < targetRight) {
    rects.push({
      height: overlap.height,
      width: targetRight - overlapRight,
      x: overlapRight,
      y: overlap.y,
    });
  }
  return rects.filter((rect) => rect.width > 0 && rect.height > 0);
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
