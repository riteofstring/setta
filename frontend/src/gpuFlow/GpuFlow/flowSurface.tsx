import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from "react";

import {
  resolveGpuNodePointerHandoffTarget,
  resolveGpuNodeWheelHandoffTarget,
} from "../activeNodeTargeting";

import { postGpuFlowFrameChromeReproEvent } from "../chromeReproPerf";

import type { GpuEdgeBufferInput } from "../edges/edgeGpuBuffers";

import type {
  GpuEdgeReconnectAnchor,
  GpuEdgeScene,
  GpuEdgeSceneLabel,
} from "../edges/edgeSources";

import type { GpuFlowRuntime } from "../gpuDevice";

import { GpuEdgeLabelLayer } from "../GpuEdgeLabels";

import {
  GpuEdgeReconnectAnchorLayer,
  type GpuEdgeReconnectOptions,
} from "../GpuEdgeReconnectAnchors";

import {
  clearGpuNodeDomTransformSyncCache,
  clearGpuNodeDomTransformSyncCacheNode,
  createGpuNodeDomTransformSyncCache,
  HtmlSurfaceNodeLayer,
  markHtmlSurfaceFramePaintDirty,
  renderHtmlSurfaceFrame,
  type GpuNodeDomTransformSyncCache,
  type GpuNodeLayout,
  type GpuNodeUploadBudget,
  type RenderHtmlSurfaceFrameResult,
} from "../htmlSurfaces/frame";

import { type GpuEdgePaletteInput, type GpuGridInput } from "../gpuPipelines";

import { type GpuCanvasSize, type GpuFrameReason } from "../gpuRenderer";

import {
  GpuSurface,
  type GpuSurfaceHandle,
  type GpuSurfaceProps,
} from "../GpuSurface";

import { createHtmlSurfaceInteractionProjector } from "../htmlSurfaces/interactionProjector";

import { HtmlSurfaceRenderer } from "../htmlSurfaces/renderer";

import { createHtmlSurfaceShaderEffectProjectors } from "../htmlSurfaces/shaderEffects";

import type { HtmlSurfaceVisualScene } from "../htmlSurfaces/visualScene";

import {
  attachGpuEdgeInteractionController,
  type GpuEdgeInteractionControllerOptions,
} from "../interactions/edges";

import {
  attachGpuNodeDragController,
  type GpuNodeDragControllerOptions,
} from "../interactions/nodeDrag";

import {
  attachGpuPanZoomController,
  type GpuPanZoomControllerOptions,
} from "../interactions/panZoom";

import {
  attachGpuSelectionController,
  type GpuSelectionControllerOptions,
} from "../interactions/selection";

import {
  createGpuNodeInteractionDirtyController,
  type GpuNodeInteractionDirtyController,
} from "../nodeInteractionDirty";

import {
  createHtmlSurfaceTextureManager,
  type HtmlSurfaceTextureManager,
} from "../htmlSurfaces/textures";

import type { GpuViewportInput } from "../viewportMath";

import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
  type GpuUserSelectionRect,
} from "../viewportStore";

import {
  completeGpuNodeInteractionFrame,
  destroyNodeInteractionResources,
  destroyNodeLayerResources,
  nextFrame,
  requestRemainingTextureUploadFrame,
  resolveRenderableGpuFlowLayerFrameInput,
  syncGpuFlowNodeInteractionState,
} from "./flowFrame";

import {
  clearGpuFlowNodeElement,
  projectGpuFlowNodeSourceForPointerEvent,
} from "./sourceInteraction";

export type GpuFlowProps = Pick<
  GpuSurfaceProps,
  "deviceOptions" | "onFrame" | "onPaint" | "onReady" | "onResize"
> & {
  children?: ReactNode;
  className?: string | undefined;
  edgeInteraction?:
    | false
    | Omit<
        GpuEdgeInteractionControllerOptions,
        "element" | "getScene" | "store"
      >
    | undefined;
  edgePalette?: GpuEdgePaletteInput | undefined;
  edgeReconnect?: false | GpuEdgeReconnectOptions | undefined;
  edgeScene?: GpuEdgeScene | undefined;
  edges?: readonly GpuEdgeBufferInput[] | undefined;
  forceVisibleNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  grid?: GpuGridInput | undefined;
  marginCssPx?: number | undefined;
  nodeClassName?: string | undefined;
  nodeTextureMemoryBudgetBytes?: number | undefined;
  onNodeElementChange?:
    | ((nodeId: string, element: HTMLElement | null) => void)
    | undefined;
  nodes?: readonly GpuNodeLayout[] | undefined;
  nodeDrag?:
    | false
    | Omit<
        GpuNodeDragControllerOptions,
        "element" | "getNodes" | "requestFrame" | "store"
      >
    | undefined;
  onNodeLayerFrame?:
    | ((result: RenderHtmlSurfaceFrameResult) => void)
    | undefined;
  panZoom?:
    | false
    | Omit<GpuPanZoomControllerOptions, "element" | "requestFrame" | "store">
    | undefined;
  renderNode?: ((node: GpuNodeLayout) => ReactNode) | undefined;
  selection?:
    | false
    | Omit<GpuSelectionControllerOptions, "element" | "getNodes" | "store">
    | undefined;
  style?: CSSProperties | undefined;
  surfaceClassName?: string | undefined;
  uploadBudget?: GpuNodeUploadBudget | undefined;
  viewport?: GpuViewportInput | undefined;
  viewportStore?: GpuFlowViewportStoreApi | undefined;
};

export type GpuFlowCallbacks = Pick<
  GpuFlowProps,
  | "onFrame"
  | "onNodeElementChange"
  | "onNodeLayerFrame"
  | "onPaint"
  | "onReady"
  | "onResize"
>;

export type GpuFlowNodeLayerState = {
  readonly edgeScene: GpuEdgeScene | undefined;
  readonly edgePalette: GpuEdgePaletteInput | undefined;
  readonly edges: readonly GpuEdgeBufferInput[] | undefined;
  readonly forceVisibleNodeIds:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly grid: GpuGridInput | undefined;
  readonly marginCssPx: number | undefined;
  readonly nodes: readonly GpuNodeLayout[] | undefined;
  readonly nodeTextureMemoryBudgetBytes: number | undefined;
  readonly uploadBudget: GpuNodeUploadBudget | undefined;
  readonly viewport: GpuViewportInput;
  readonly visualScene?: HtmlSurfaceVisualScene | undefined;
};

export const EMPTY_GPU_NODE_LAYOUTS: readonly GpuNodeLayout[] = [];

export const EMPTY_EDGE_LABELS: readonly GpuEdgeSceneLabel[] = [];

export const EMPTY_EDGE_RECONNECT_ANCHORS: readonly GpuEdgeReconnectAnchor[] =
  [];

export function GpuFlow({
  children,
  className = "setta-gpu-flow",
  deviceOptions,
  edgeInteraction,
  edgePalette,
  edgeReconnect,
  edgeScene,
  edges,
  forceVisibleNodeIds,
  grid,
  marginCssPx,
  nodeClassName,
  nodeTextureMemoryBudgetBytes,
  nodeDrag,
  nodes,
  onFrame,
  onNodeElementChange,
  onNodeLayerFrame,
  onPaint,
  onReady,
  onResize,
  panZoom,
  renderNode,
  selection,
  style,
  surfaceClassName,
  uploadBudget,
  viewport,
  viewportStore = gpuFlowViewportStore,
}: GpuFlowProps) {
  validateGpuFlowEdgeInput({ edgeInteraction, edgeScene, edges });
  const drawEdges = resolveGpuFlowEdgeDrawInputs({ edgeScene, edges });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<GpuSurfaceHandle | null>(null);
  const [userSelectionRect, setUserSelectionRect] =
    useState<GpuUserSelectionRect | null>(() =>
      getVisibleGpuUserSelectionRect(viewportStore.getState()),
    );
  const [sourceInteractionProjector] = useState(() =>
    createHtmlSurfaceInteractionProjector(),
  );
  const [htmlSurfaceEffectProjectors] = useState(() =>
    createHtmlSurfaceShaderEffectProjectors(),
  );
  const activeInteractionNodeIdRef = useRef<string | null>(null);
  const canvasSizeRef = useRef<GpuCanvasSize | null>(null);
  const frameRef = useRef(0);
  const nodeElementByIdRef = useRef(new Map<string, HTMLElement>());
  const nodeInteractionCleanupRef = useRef<(() => void) | null>(null);
  const nodeInteractionRef = useRef<GpuNodeInteractionDirtyController | null>(
    null,
  );
  const htmlSurfaceRendererRef = useRef<HtmlSurfaceRenderer | null>(null);
  const nodeDomTransformSyncCacheRef = useRef<GpuNodeDomTransformSyncCache>(
    createGpuNodeDomTransformSyncCache(),
  );
  const textureManagerRef = useRef<HtmlSurfaceTextureManager | null>(null);
  const transformOnlyPaintNodeIdsRef = useRef<Set<string>>(new Set());
  const visibleNodeIdsRef = useRef<ReadonlySet<string>>(new Set());
  const callbacksRef = useRef<GpuFlowCallbacks>({
    onFrame,
    onNodeElementChange,
    onNodeLayerFrame,
    onPaint,
    onReady,
    onResize,
  });
  const nodeLayerRef = useRef<GpuFlowNodeLayerState>({
    edgeScene,
    edgePalette,
    edges: drawEdges,
    forceVisibleNodeIds,
    grid,
    marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes,
    uploadBudget,
    viewport: viewport ?? viewportStore.getState().transform,
  });

  useEffect(() => {
    callbacksRef.current = {
      onFrame,
      onNodeElementChange,
      onNodeLayerFrame,
      onPaint,
      onReady,
      onResize,
    };
  }, [
    onFrame,
    onNodeElementChange,
    onNodeLayerFrame,
    onPaint,
    onReady,
    onResize,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    viewportStore.getState().setDomNode(container);
    return () => {
      if (container) {
        viewportStore.getState().clearDomNode(container);
      }
    };
  }, [viewportStore]);

  useEffect(() => {
    if (!viewport) {
      return;
    }
    viewportStore.getState().setTransform(viewport);
  }, [viewport, viewportStore]);

  useEffect(() => {
    setUserSelectionRect(
      getVisibleGpuUserSelectionRect(viewportStore.getState()),
    );
    return viewportStore.subscribe((state, previousState) => {
      if (state.transform !== previousState.transform) {
        nodeLayerRef.current = {
          ...nodeLayerRef.current,
          viewport: state.transform,
        };
        surfaceRef.current?.requestFrame("viewport");
      }
      if (
        state.userSelectionActive !== previousState.userSelectionActive ||
        state.userSelectionRect !== previousState.userSelectionRect
      ) {
        setUserSelectionRect(getVisibleGpuUserSelectionRect(state));
      }
    });
  }, [viewportStore]);

  useEffect(() => {
    validateGpuFlowEdgeInput({ edgeInteraction, edgeScene, edges });
    const nextEdges = resolveGpuFlowEdgeDrawInputs({ edgeScene, edges });
    nodeLayerRef.current = {
      edgeScene,
      edgePalette,
      edges: nextEdges,
      forceVisibleNodeIds,
      grid,
      marginCssPx,
      nodes,
      nodeTextureMemoryBudgetBytes,
      uploadBudget,
      viewport: viewportStore.getState().transform,
    };
    if (!nodes && !nextEdges && !grid) {
      visibleNodeIdsRef.current = new Set();
      clearGpuNodeDomTransformSyncCache(nodeDomTransformSyncCacheRef.current);
      transformOnlyPaintNodeIdsRef.current.clear();
      sourceInteractionProjector.destroy();
      destroyNodeLayerResources(textureManagerRef, htmlSurfaceRendererRef);
    }
    surfaceRef.current?.requestFrame("viewport");
  }, [
    edgeInteraction,
    edgePalette,
    edgeScene,
    edges,
    forceVisibleNodeIds,
    grid,
    marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes,
    uploadBudget,
    viewportStore,
  ]);

  useEffect(() => {
    if (panZoom === false) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    return attachGpuPanZoomController({
      ...panZoom,
      element: container,
      requestFrame: (reason) => {
        surfaceRef.current?.requestFrame(reason);
      },
      store: viewportStore,
    });
  }, [panZoom, viewportStore]);

  useEffect(() => {
    if (selection === false) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    return attachGpuSelectionController({
      ...selection,
      element: container,
      getNodes: () => nodeLayerRef.current.nodes ?? [],
      store: viewportStore,
    });
  }, [selection, viewportStore]);

  useEffect(() => {
    if (nodeDrag === false) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    return attachGpuNodeDragController({
      ...nodeDrag,
      element: container,
      getNodes: () => nodeLayerRef.current.nodes ?? [],
      requestFrame: (reason) => {
        surfaceRef.current?.requestFrame(reason);
      },
      store: viewportStore,
    });
  }, [nodeDrag, viewportStore]);

  useEffect(() => {
    if (!edgeInteraction) {
      return;
    }
    if (!edgeScene) {
      throw new Error(
        "Setta GPU flow edge interaction requires a GpuEdgeScene.",
      );
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    return attachGpuEdgeInteractionController({
      ...edgeInteraction,
      element: container,
      getScene: () => nodeLayerRef.current.edgeScene,
      store: viewportStore,
    });
  }, [edgeInteraction, edgeScene, viewportStore]);

  useEffect(() => {
    return () => {
      sourceInteractionProjector.destroy();
      clearGpuNodeDomTransformSyncCache(nodeDomTransformSyncCacheRef.current);
      destroyNodeInteractionResources(
        nodeInteractionRef,
        nodeInteractionCleanupRef,
      );
      destroyNodeLayerResources(textureManagerRef, htmlSurfaceRendererRef);
    };
  }, []);

  const handleNodeElementChange = useCallback(
    (nodeId: string, element: HTMLElement | null) => {
      callbacksRef.current.onNodeElementChange?.(nodeId, element);
      clearGpuNodeDomTransformSyncCacheNode(
        nodeDomTransformSyncCacheRef.current,
        nodeId,
      );
      if (!element) {
        clearGpuFlowNodeElement({
          nodeElementByIdRef,
          nodeId,
          nodeInteractionRef,
          sourceInteractionProjector,
          textureManagerRef,
          transformOnlyPaintNodeIdsRef,
        });
        return;
      }

      nodeElementByIdRef.current.set(nodeId, element);
      surfaceRef.current?.requestPaint();
      surfaceRef.current?.requestFrame("manual");
    },
    [],
  );

  const handleReady = useCallback<NonNullable<GpuSurfaceProps["onReady"]>>(
    (runtime) => {
      clearGpuNodeDomTransformSyncCache(nodeDomTransformSyncCacheRef.current);
      destroyNodeLayerResources(textureManagerRef, htmlSurfaceRendererRef);
      if (nodeLayerRef.current.nodes) {
        textureManagerRef.current = createHtmlSurfaceTextureManager(runtime);
        htmlSurfaceRendererRef.current = new HtmlSurfaceRenderer(runtime);
      }
      destroyNodeInteractionResources(
        nodeInteractionRef,
        nodeInteractionCleanupRef,
      );
      const nodeInteraction = createGpuNodeInteractionDirtyController({
        clearProjectedInteraction: (nodeId) => {
          sourceInteractionProjector.clearSource(nodeId);
        },
        deferPassiveDirty: () =>
          viewportStore.getState().viewportInteractionActive,
        elementByNodeId: () => nodeElementByIdRef.current,
        getFrame: () => nextFrame(frameRef),
        onStateChange: (state) => {
          syncGpuFlowNodeInteractionState({
            nodeElementByIdRef,
            previousActiveNodeIdRef: activeInteractionNodeIdRef,
            state,
          });
          if (!state.activeNodeId) {
            sourceInteractionProjector.clearSource();
          }
          surfaceRef.current?.requestFrame("texture-upload");
        },
        projectPointerInteraction: (nodeId, event) => {
          projectGpuFlowNodeSourceForPointerEvent({
            effectProjectors: htmlSurfaceEffectProjectors,
            event,
            nodeElementById: nodeElementByIdRef.current,
            nodeId,
            nodes: nodeLayerRef.current.nodes ?? EMPTY_GPU_NODE_LAYOUTS,
            projector: sourceInteractionProjector,
            surfaceElement: containerRef.current ?? runtime.canvas,
            viewport: nodeLayerRef.current.viewport,
            visualScene: nodeLayerRef.current.visualScene,
          });
        },
        requestFrame: (reason) => {
          surfaceRef.current?.requestFrame(reason);
        },
        resolvePointerHandoffTarget: (event, options) => {
          const surfaceElement = containerRef.current ?? runtime.canvas;
          const shouldProjectSource = options?.projectSource ?? true;
          return resolveGpuNodePointerHandoffTarget({
            clientX: event.clientX,
            clientY: event.clientY,
            effectProjectors: htmlSurfaceEffectProjectors,
            elementByNodeId: nodeElementByIdRef.current,
            nodes: nodeLayerRef.current.nodes ?? EMPTY_GPU_NODE_LAYOUTS,
            ...(shouldProjectSource
              ? {
                  projectSourceForHitTesting: (projection) => {
                    sourceInteractionProjector.alignSourceToClientPoint({
                      localX: projection.localX,
                      localY: projection.localY,
                      sourceElement: projection.sourceElement,
                      sourceId: projection.nodeId,
                      surfaceX: projection.surfaceX,
                      surfaceY: projection.surfaceY,
                    });
                  },
                }
              : {}),
            surfaceElement,
            viewport: nodeLayerRef.current.viewport,
            visualScene: nodeLayerRef.current.visualScene,
          });
        },
        resolveWheelHandoffTarget: (event) => {
          if (
            viewportStore.getState().zoomActivationKeyPressed ||
            event.ctrlKey
          ) {
            return null;
          }
          const surfaceElement = containerRef.current ?? runtime.canvas;
          return resolveGpuNodeWheelHandoffTarget({
            clientX: event.clientX,
            clientY: event.clientY,
            effectProjectors: htmlSurfaceEffectProjectors,
            elementByNodeId: nodeElementByIdRef.current,
            nodes: nodeLayerRef.current.nodes ?? EMPTY_GPU_NODE_LAYOUTS,
            projectSourceForHitTesting: (projection) => {
              sourceInteractionProjector.alignSourceToClientPoint({
                localX: projection.localX,
                localY: projection.localY,
                sourceElement: projection.sourceElement,
                sourceId: projection.nodeId,
                surfaceX: projection.surfaceX,
                surfaceY: projection.surfaceY,
              });
            },
            surfaceElement,
            viewport: nodeLayerRef.current.viewport,
            visualScene: nodeLayerRef.current.visualScene,
          });
        },
        textureManager: () => textureManagerRef.current,
      });
      nodeInteractionRef.current = nodeInteraction;
      nodeInteractionCleanupRef.current = nodeInteraction.attach(
        containerRef.current ?? runtime.canvas,
      );
      callbacksRef.current.onReady?.(runtime);
    },
    [htmlSurfaceEffectProjectors, viewportStore],
  );

  const handleResize = useCallback<NonNullable<GpuSurfaceProps["onResize"]>>(
    (runtime, size) => {
      canvasSizeRef.current = size;
      viewportStore.getState().setViewportSize({
        height: size.cssHeight,
        width: size.cssWidth,
      });
      callbacksRef.current.onResize?.(runtime, size);
    },
    [viewportStore],
  );

  const handlePaint = useCallback<NonNullable<GpuSurfaceProps["onPaint"]>>(
    (runtime, event) => {
      const textureManager = textureManagerRef.current;
      if (textureManager) {
        markHtmlSurfaceFramePaintDirty({
          changedElements: event.changedElements,
          elementByNodeId: nodeElementByIdRef.current,
          frame: nextFrame(frameRef),
          ignoreDirectNodeIds: transformOnlyPaintNodeIdsRef.current,
          textureManager,
        });
      }
      callbacksRef.current.onPaint?.(runtime, event);
      if (event.changedElements?.length) {
        transformOnlyPaintNodeIdsRef.current.clear();
      }
    },
    [],
  );

  const handleFrame = useCallback<NonNullable<GpuSurfaceProps["onFrame"]>>(
    (runtime, event) => {
      renderGpuFlowNodeLayerFrame({
        callbacksRef,
        canvasSizeRef,
        deferResolutionUpdates:
          event.reasons.includes("viewport") ||
          viewportStore.getState().viewportInteractionActive,
        frameReasons: event.reasons,
        frameRef,
        nodeElementByIdRef,
        nodeDomTransformSyncCacheRef,
        nodeInteractionRef,
        nodeLayerRef,
        htmlSurfaceRendererRef,
        runtime,
        surfaceRef,
        textureManagerRef,
        transformOnlyPaintNodeIdsRef,
        visibleNodeIdsRef,
        viewportFrame: event.reasons.includes("viewport"),
      });
      callbacksRef.current.onFrame?.(runtime, event);
    },
    [viewportStore],
  );
  const nodeLayerElement = renderGpuFlowNodeLayerElement({
    nodeClassName,
    nodes,
    onNodeElementChange: handleNodeElementChange,
    renderNode,
  });
  const userSelectionElement = (
    <GpuUserSelectionOverlay rect={userSelectionRect} />
  );
  const edgeLabelElement = (
    <GpuEdgeLabelLayer
      labels={edgeScene?.labels ?? EMPTY_EDGE_LABELS}
      viewportStore={viewportStore}
    />
  );
  const edgeReconnectElement = edgeReconnect ? (
    <GpuEdgeReconnectAnchorLayer
      anchors={edgeScene?.reconnectAnchors ?? EMPTY_EDGE_RECONNECT_ANCHORS}
      options={edgeReconnect}
      viewportStore={viewportStore}
    />
  ) : null;

  return (
    <div
      className={className}
      data-tab-scope="canvas"
      ref={containerRef}
      style={style}
    >
      <GpuSurface
        className={surfaceClassName}
        deviceOptions={deviceOptions}
        onFrame={handleFrame}
        onPaint={handlePaint}
        onReady={handleReady}
        onResize={handleResize}
        ref={surfaceRef}
      >
        {nodeLayerElement}
        {children}
      </GpuSurface>
      {userSelectionElement}
      {edgeLabelElement}
      {edgeReconnectElement}
    </div>
  );
}

export function GpuUserSelectionOverlay({
  rect,
}: {
  readonly rect: GpuUserSelectionRect | null;
}) {
  if (!rect) {
    return null;
  }
  return (
    <div
      className="setta-gpu-flow__selection-layer"
      data-gpu-flow-selection-layer="true"
    >
      <div
        className="setta-gpu-flow__selection"
        data-gpu-flow-selection="true"
        style={{
          height: rect.height,
          transform: `translate(${rect.x}px, ${rect.y}px)`,
          width: rect.width,
        }}
      />
    </div>
  );
}

export function getVisibleGpuUserSelectionRect(
  state: ReturnType<GpuFlowViewportStoreApi["getState"]>,
): GpuUserSelectionRect | null {
  return state.userSelectionActive ? state.userSelectionRect : null;
}

export function resolveGpuFlowEdgeDrawInputs({
  edgeScene,
  edges,
}: {
  readonly edgeScene?: GpuEdgeScene | undefined;
  readonly edges?: readonly GpuEdgeBufferInput[] | undefined;
}): readonly GpuEdgeBufferInput[] | undefined {
  if (edgeScene && edges) {
    throw new Error(
      "Setta GPU flow accepts either edgeScene or edges, not both.",
    );
  }
  return edgeScene?.edges ?? edges;
}

export function validateGpuFlowEdgeInput({
  edgeInteraction,
  edgeScene,
  edges,
}: {
  readonly edgeInteraction: GpuFlowProps["edgeInteraction"];
  readonly edgeScene: GpuFlowProps["edgeScene"];
  readonly edges: GpuFlowProps["edges"];
}) {
  resolveGpuFlowEdgeDrawInputs({ edgeScene, edges });
  if (edgeInteraction && !edgeScene) {
    throw new Error("Setta GPU flow edge interaction requires a GpuEdgeScene.");
  }
}

export function renderGpuFlowNodeLayerElement({
  nodeClassName,
  nodes,
  onNodeElementChange,
  renderNode,
}: {
  readonly nodeClassName: string | undefined;
  readonly nodes: readonly GpuNodeLayout[] | undefined;
  readonly onNodeElementChange: (
    nodeId: string,
    element: HTMLElement | null,
  ) => void;
  readonly renderNode: ((node: GpuNodeLayout) => ReactNode) | undefined;
}) {
  if (!nodes && !renderNode) {
    return null;
  }
  if (!nodes || !renderNode) {
    throw new Error(
      "Setta GPU flow node rendering requires both nodes and renderNode.",
    );
  }
  return (
    <HtmlSurfaceNodeLayer
      className={nodeClassName}
      nodes={nodes}
      onNodeElementChange={onNodeElementChange}
      renderNode={renderNode}
    />
  );
}

export function renderGpuFlowNodeLayerFrame({
  callbacksRef,
  canvasSizeRef,
  deferResolutionUpdates,
  frameReasons,
  frameRef,
  nodeElementByIdRef,
  nodeDomTransformSyncCacheRef,
  nodeInteractionRef,
  nodeLayerRef,
  htmlSurfaceRendererRef,
  runtime,
  surfaceRef,
  textureManagerRef,
  transformOnlyPaintNodeIdsRef,
  visibleNodeIdsRef,
  viewportFrame,
}: {
  readonly callbacksRef: MutableRefObject<GpuFlowCallbacks>;
  readonly canvasSizeRef: MutableRefObject<GpuCanvasSize | null>;
  readonly deferResolutionUpdates: boolean;
  readonly frameReasons: readonly GpuFrameReason[];
  readonly frameRef: MutableRefObject<number>;
  readonly nodeDomTransformSyncCacheRef: MutableRefObject<GpuNodeDomTransformSyncCache>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
  readonly htmlSurfaceRendererRef: MutableRefObject<HtmlSurfaceRenderer | null>;
  readonly runtime: GpuFlowRuntime;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<HtmlSurfaceTextureManager | null>;
  readonly transformOnlyPaintNodeIdsRef: MutableRefObject<Set<string>>;
  readonly visibleNodeIdsRef: MutableRefObject<ReadonlySet<string>>;
  readonly viewportFrame: boolean;
}) {
  const frameInput = resolveRenderableGpuFlowLayerFrameInput({
    canvasSizeRef,
    nodeLayerRef,
    htmlSurfaceRendererRef,
    runtime,
    textureManagerRef,
  });
  if (!frameInput) {
    return;
  }
  const { canvasSize, layer, nodes, resources } = frameInput;

  const frame = nextFrame(frameRef);
  const nodeInteraction = nodeInteractionRef.current;
  const renderStartedAt = performance.now();
  const layerResult = renderHtmlSurfaceFrame({
    activeNodeId: nodeInteraction?.getActiveNodeId(),
    canvasSize,
    deferResolutionUpdates,
    domTransformCache: nodeDomTransformSyncCacheRef.current,
    edges: layer.edges,
    edgePalette: layer.edgePalette,
    elementByNodeId: nodeElementByIdRef.current,
    forceVisibleNodeIds: layer.forceVisibleNodeIds,
    frame,
    grid: layer.grid,
    marginCssPx: layer.marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes: layer.nodeTextureMemoryBudgetBytes,
    renderer: resources.htmlSurfaceRenderer,
    textureManager: resources.textureManager,
    uploadBudget: layer.uploadBudget,
    viewport: layer.viewport,
  });
  postGpuFlowFrameChromeReproEvent({
    deferResolutionUpdates,
    frame,
    frameReasons,
    layerResult,
    renderDurationMs: performance.now() - renderStartedAt,
    viewport: layer.viewport,
    viewportFrame,
  });
  if (viewportFrame) {
    for (const nodeId of layerResult.domTransformUpdatedNodeIds) {
      transformOnlyPaintNodeIdsRef.current.add(nodeId);
    }
    for (const nodeId of layerResult.domTransformParkedNodeIds) {
      transformOnlyPaintNodeIdsRef.current.add(nodeId);
    }
  }
  nodeLayerRef.current = {
    ...nodeLayerRef.current,
    visualScene: layerResult.visualScene,
  };
  visibleNodeIdsRef.current = new Set(layerResult.visibleNodeIds);
  completeGpuNodeInteractionFrame(nodeInteractionRef, layerResult);
  callbacksRef.current.onNodeLayerFrame?.(layerResult);
  requestRemainingTextureUploadFrame(surfaceRef, layerResult);
}

export function hasRenderableGpuFlowLayer(
  layer: GpuFlowNodeLayerState,
): boolean {
  return Boolean(layer.nodes || layer.edges || layer.grid);
}

export function hasRenderableGpuFlowCanvasSize(
  canvasSize: GpuCanvasSize,
): boolean {
  return canvasSize.cssWidth > 0 && canvasSize.cssHeight > 0;
}
