import { type MutableRefObject } from "react";

import type { GpuFlowRuntime } from "../gpuDevice";
import { startGpuFlowPerformanceMeasure } from "../gpuFlowPerformanceMarks";
import { type GpuCanvasSize, type GpuFrameReason } from "../gpuRenderer";
import type { GpuSurfaceHandle } from "../GpuSurface";
import {
  renderHtmlSurfaceFrame,
  type GpuNodeDomTransformSyncCache,
} from "../htmlSurfaces/frame";
import type { HtmlSurfaceRenderer } from "../htmlSurfaces/renderer";
import type { HtmlSurfaceTextureManager } from "../htmlSurfaces/textures";
import type { MutableGpuFlowInteractionDiagnostics } from "../interactionDiagnostics";
import { createGpuFlowInteractionDiagnosticsSnapshot } from "../interactionDiagnostics";
import { type GpuNodeInteractionDirtyController } from "../nodeInteractionDirty";
import {
  createGpuFlowProjectionDebugState,
  type GpuFlowHeldPreviousProjection,
  type GpuFlowProjectionTransaction,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import type { RetainedContentTexturePageManager } from "../retainedContentTexturePageManager";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
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
import type {
  GpuFlowMotionProjectionFrameWorkReport,
  GpuFlowProjectionFrameRenderablePlan,
} from "./visibleFrameKernel";

type RenderGpuFlowNodeLayerProjectionFrameResult =
  | {
      readonly rendered: false;
    }
  | {
      readonly rendered: true;
      readonly heldPreviousProjection: GpuFlowHeldPreviousProjection | null;
      readonly nodeLayerFrameStatePublication: GpuFlowNodeLayerFrameStatePublication | null;
      readonly projectionOnlyFrameWork?: GpuFlowMotionProjectionFrameWorkReport | null;
      readonly transaction: GpuFlowProjectionTransaction;
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
    canvasSubmissionMode: "deferred",
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
  const projectionOnlyFrameWork = {
    layerResult,
    projectionLane: transaction.lane,
    transactionKind: transaction.kind,
  } satisfies GpuFlowMotionProjectionFrameWorkReport;
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
    projectionOnlyFrameWork,
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
