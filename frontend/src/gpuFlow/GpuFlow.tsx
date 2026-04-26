import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { GpuEdgeBufferInput } from "./edges/edgeGpuBuffers";
import type { GpuEdgeScene } from "./edges/edgeSources";
import {
  areGpuActiveNodeOverlaySnapshotsEqual,
  GpuActiveNodeOverlay,
  resolveGpuActiveNodeOverlaySnapshot,
  type GpuActiveNodeOverlaySnapshot,
} from "./GpuActiveNodeOverlay";
import type { GpuFlowRuntime } from "./gpuDevice";
import "./gpuFlow.css";
import {
  GpuNodeLayer,
  markGpuNodeLayerPaintDirty,
  renderGpuNodeLayerFrame,
  type GpuNodeLayerProps,
  type GpuNodeLayout,
  type GpuNodeUploadBudget,
  type RenderGpuNodeLayerFrameResult,
} from "./GpuNodeLayer";
import { GpuNodeQuadRenderer, type GpuGridInput } from "./gpuPipelines";
import { measureGpuCanvasClientSize, type GpuCanvasSize } from "./gpuRenderer";
import {
  GpuSurface,
  type GpuSurfaceHandle,
  type GpuSurfaceProps,
} from "./GpuSurface";
import {
  attachGpuEdgeInteractionController,
  type GpuEdgeInteractionControllerOptions,
} from "./interactions/edges";
import {
  attachGpuNodeDragController,
  type GpuNodeDragControllerOptions,
} from "./interactions/nodeDrag";
import {
  attachGpuPanZoomController,
  type GpuPanZoomControllerOptions,
} from "./interactions/panZoom";
import {
  attachGpuSelectionController,
  type GpuSelectionControllerOptions,
} from "./interactions/selection";
import {
  createGpuNodeInteractionDirtyController,
  type GpuNodeInteractionDirtyController,
  type GpuNodeInteractionState,
} from "./nodeInteractionDirty";
import {
  createNodeTextureManager,
  type NodeTextureManager,
} from "./nodeTextures";
import type { GpuViewportInput } from "./viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
  type GpuUserSelectionRect,
} from "./viewportStore";

type GpuFlowProps = Pick<
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
  edgeScene?: GpuEdgeScene | undefined;
  edges?: readonly GpuEdgeBufferInput[] | undefined;
  forceVisibleNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  grid?: GpuGridInput | undefined;
  marginCssPx?: number | undefined;
  nodeClassName?: string | undefined;
  onNodeElementChange?:
    | ((nodeId: string, element: HTMLElement | null) => void)
    | undefined;
  nodeVisibility?: GpuNodeLayerProps["nodeVisibility"];
  nodes?: readonly GpuNodeLayout[] | undefined;
  nodeDrag?:
    | false
    | Omit<
        GpuNodeDragControllerOptions,
        "element" | "getNodes" | "requestFrame" | "store"
      >
    | undefined;
  onNodeLayerFrame?:
    | ((result: RenderGpuNodeLayerFrameResult) => void)
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

type GpuFlowCallbacks = Pick<
  GpuFlowProps,
  | "onFrame"
  | "onNodeElementChange"
  | "onNodeLayerFrame"
  | "onPaint"
  | "onReady"
  | "onResize"
>;

type GpuFlowNodeLayerState = {
  readonly edgeScene: GpuEdgeScene | undefined;
  readonly edges: readonly GpuEdgeBufferInput[] | undefined;
  readonly forceVisibleNodeIds:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly grid: GpuGridInput | undefined;
  readonly marginCssPx: number | undefined;
  readonly nodes: readonly GpuNodeLayout[] | undefined;
  readonly uploadBudget: GpuNodeUploadBudget | undefined;
  readonly viewport: GpuViewportInput;
};

const EMPTY_GPU_NODE_LAYOUTS: readonly GpuNodeLayout[] = [];

export function GpuFlow({
  children,
  className = "setta-gpu-flow",
  deviceOptions,
  edgeInteraction,
  edgeScene,
  edges,
  forceVisibleNodeIds,
  grid,
  marginCssPx,
  nodeClassName,
  nodeDrag,
  nodeVisibility,
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
  const [activeNodeOverlaySnapshot, setActiveNodeOverlaySnapshot] =
    useState<GpuActiveNodeOverlaySnapshot | null>(null);
  const [userSelectionRect, setUserSelectionRect] =
    useState<GpuUserSelectionRect | null>(() =>
      getVisibleGpuUserSelectionRect(viewportStore.getState()),
    );
  const canvasSizeRef = useRef<GpuCanvasSize | null>(null);
  const frameRef = useRef(0);
  const nodeElementByIdRef = useRef(new Map<string, HTMLElement>());
  const nodeInteractionCleanupRef = useRef<(() => void) | null>(null);
  const nodeInteractionRef = useRef<GpuNodeInteractionDirtyController | null>(
    null,
  );
  const nodeQuadRendererRef = useRef<GpuNodeQuadRenderer | null>(null);
  const textureManagerRef = useRef<NodeTextureManager | null>(null);
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
    edges: drawEdges,
    forceVisibleNodeIds,
    grid,
    marginCssPx,
    nodes,
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
      edges: nextEdges,
      forceVisibleNodeIds,
      grid,
      marginCssPx,
      nodes,
      uploadBudget,
      viewport: viewportStore.getState().transform,
    };
    if (!nodes && !nextEdges && !grid) {
      visibleNodeIdsRef.current = new Set();
      setActiveNodeOverlaySnapshot(null);
      destroyNodeLayerResources(textureManagerRef, nodeQuadRendererRef);
    }
    surfaceRef.current?.requestFrame("viewport");
  }, [
    edgeInteraction,
    edgeScene,
    edges,
    forceVisibleNodeIds,
    grid,
    marginCssPx,
    nodes,
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
      destroyNodeInteractionResources(
        nodeInteractionRef,
        nodeInteractionCleanupRef,
      );
      destroyNodeLayerResources(textureManagerRef, nodeQuadRendererRef);
    };
  }, []);

  const handleNodeElementChange = useCallback(
    (nodeId: string, element: HTMLElement | null) => {
      callbacksRef.current.onNodeElementChange?.(nodeId, element);
      if (!element) {
        nodeElementByIdRef.current.delete(nodeId);
        nodeInteractionRef.current?.clearNode(nodeId);
        setActiveNodeOverlaySnapshot((snapshot) =>
          snapshot?.nodeId === nodeId ? null : snapshot,
        );
        textureManagerRef.current?.destroyNodeTexture(nodeId);
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
      destroyNodeLayerResources(textureManagerRef, nodeQuadRendererRef);
      if (nodeLayerRef.current.nodes) {
        textureManagerRef.current = createNodeTextureManager(runtime);
        nodeQuadRendererRef.current = new GpuNodeQuadRenderer(runtime);
      }
      destroyNodeInteractionResources(
        nodeInteractionRef,
        nodeInteractionCleanupRef,
      );
      const nodeInteraction = createGpuNodeInteractionDirtyController({
        elementByNodeId: () => nodeElementByIdRef.current,
        getFrame: () => nextFrame(frameRef),
        onStateChange: (state) => {
          syncGpuFlowNodeInteractionState({
            nodeElementByIdRef,
            state,
          });
          surfaceRef.current?.requestFrame("texture-upload");
        },
        requestFrame: (reason) => {
          surfaceRef.current?.requestFrame(reason);
        },
        textureManager: () => textureManagerRef.current,
      });
      nodeInteractionRef.current = nodeInteraction;
      nodeInteractionCleanupRef.current = nodeInteraction.attach(
        runtime.canvas,
      );
      callbacksRef.current.onReady?.(runtime);
    },
    [],
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
        markGpuNodeLayerPaintDirty({
          changedElements: event.changedElements,
          elementByNodeId: nodeElementByIdRef.current,
          fallbackNodeIds: visibleNodeIdsRef.current,
          frame: nextFrame(frameRef),
          textureManager,
        });
      }
      callbacksRef.current.onPaint?.(runtime, event);
    },
    [],
  );

  const handleFrame = useCallback<NonNullable<GpuSurfaceProps["onFrame"]>>(
    (runtime, event) => {
      renderGpuFlowNodeLayerFrame({
        callbacksRef,
        canvasSizeRef,
        frameRef,
        nodeElementByIdRef,
        nodeInteractionRef,
        nodeLayerRef,
        nodeQuadRendererRef,
        runtime,
        setActiveNodeOverlaySnapshot,
        surfaceRef,
        textureManagerRef,
        visibleNodeIdsRef,
      });
      callbacksRef.current.onFrame?.(runtime, event);
    },
    [],
  );
  const nodeLayerElement = renderGpuFlowNodeLayerElement({
    nodeClassName,
    nodeVisibility,
    nodes,
    onNodeElementChange: handleNodeElementChange,
    renderNode,
  });
  const activeNodeOverlayElement = (
    <GpuActiveNodeOverlay snapshot={activeNodeOverlaySnapshot} />
  );
  const userSelectionElement = (
    <GpuUserSelectionOverlay rect={userSelectionRect} />
  );

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
      {activeNodeOverlayElement}
    </div>
  );
}

function GpuUserSelectionOverlay({
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

function getVisibleGpuUserSelectionRect(
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

function validateGpuFlowEdgeInput({
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

function renderGpuFlowNodeLayerElement({
  nodeClassName,
  nodeVisibility,
  nodes,
  onNodeElementChange,
  renderNode,
}: {
  readonly nodeClassName: string | undefined;
  readonly nodeVisibility: GpuNodeLayerProps["nodeVisibility"];
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
    <GpuNodeLayer
      className={nodeClassName}
      nodeVisibility={nodeVisibility}
      nodes={nodes}
      onNodeElementChange={onNodeElementChange}
      renderNode={renderNode}
    />
  );
}

function renderGpuFlowNodeLayerFrame({
  callbacksRef,
  canvasSizeRef,
  frameRef,
  nodeElementByIdRef,
  nodeInteractionRef,
  nodeLayerRef,
  nodeQuadRendererRef,
  runtime,
  setActiveNodeOverlaySnapshot,
  surfaceRef,
  textureManagerRef,
  visibleNodeIdsRef,
}: {
  readonly callbacksRef: MutableRefObject<GpuFlowCallbacks>;
  readonly canvasSizeRef: MutableRefObject<GpuCanvasSize | null>;
  readonly frameRef: MutableRefObject<number>;
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>;
  readonly nodeLayerRef: MutableRefObject<GpuFlowNodeLayerState>;
  readonly nodeQuadRendererRef: MutableRefObject<GpuNodeQuadRenderer | null>;
  readonly runtime: GpuFlowRuntime;
  readonly setActiveNodeOverlaySnapshot: Dispatch<
    SetStateAction<GpuActiveNodeOverlaySnapshot | null>
  >;
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<NodeTextureManager | null>;
  readonly visibleNodeIdsRef: MutableRefObject<ReadonlySet<string>>;
}) {
  const layer = nodeLayerRef.current;
  if (!hasRenderableGpuFlowLayer(layer)) {
    return;
  }
  const nodes = layer.nodes ?? EMPTY_GPU_NODE_LAYOUTS;
  const resources = ensureNodeLayerResources({
    nodeQuadRendererRef,
    runtime,
    textureManagerRef,
  });
  const canvasSize =
    canvasSizeRef.current ?? measureGpuCanvasClientSize(runtime.canvas);
  if (!hasRenderableGpuFlowCanvasSize(canvasSize)) {
    return;
  }

  const frame = nextFrame(frameRef);
  const nodeInteraction = nodeInteractionRef.current;
  const layerResult = renderGpuNodeLayerFrame({
    activeNodeId: nodeInteraction?.getActiveNodeId(),
    canvasSize,
    edges: layer.edges,
    elementByNodeId: nodeElementByIdRef.current,
    forceVisibleNodeIds: layer.forceVisibleNodeIds,
    frame,
    grid: layer.grid,
    marginCssPx: layer.marginCssPx,
    nodes,
    overlayNodeId: nodeInteraction?.getOverlayNodeId(),
    renderer: resources.nodeQuadRenderer,
    textureManager: resources.textureManager,
    uploadBudget: layer.uploadBudget,
    viewport: layer.viewport,
  });
  visibleNodeIdsRef.current = new Set(layerResult.visibleNodeIds);
  completeGpuNodeInteractionFrame(nodeInteractionRef, layerResult);
  updateGpuFlowActiveNodeOverlaySnapshot({
    elementByNodeId: nodeElementByIdRef.current,
    frame,
    layer,
    overlayNodeId: resolveGpuFlowOverlayNodeId(
      nodeInteractionRef.current,
      layerResult,
    ),
    setActiveNodeOverlaySnapshot,
  });
  callbacksRef.current.onNodeLayerFrame?.(layerResult);
  requestRemainingTextureUploadFrame(surfaceRef, layerResult);
}

function hasRenderableGpuFlowLayer(layer: GpuFlowNodeLayerState): boolean {
  return Boolean(layer.nodes || layer.edges || layer.grid);
}

function hasRenderableGpuFlowCanvasSize(canvasSize: GpuCanvasSize): boolean {
  return canvasSize.cssWidth > 0 && canvasSize.cssHeight > 0;
}

function resolveGpuFlowOverlayNodeId(
  nodeInteraction: GpuNodeInteractionDirtyController | null,
  layerResult: RenderGpuNodeLayerFrameResult,
): string | null {
  return nodeInteraction?.getOverlayNodeId() ?? layerResult.overlayNodeId;
}

function updateGpuFlowActiveNodeOverlaySnapshot({
  elementByNodeId,
  frame,
  layer,
  overlayNodeId,
  setActiveNodeOverlaySnapshot,
}: {
  readonly elementByNodeId: ReadonlyMap<string, HTMLElement>;
  readonly frame: number;
  readonly layer: GpuFlowNodeLayerState;
  readonly overlayNodeId: string | null;
  readonly setActiveNodeOverlaySnapshot: Dispatch<
    SetStateAction<GpuActiveNodeOverlaySnapshot | null>
  >;
}) {
  const nextSnapshot = resolveGpuActiveNodeOverlaySnapshot({
    elementByNodeId,
    frame,
    nodes: layer.nodes,
    overlayNodeId,
    viewport: layer.viewport,
  });
  setActiveNodeOverlaySnapshot((previousSnapshot) =>
    areGpuActiveNodeOverlaySnapshotsEqual(previousSnapshot, nextSnapshot)
      ? previousSnapshot
      : nextSnapshot,
  );
}

function ensureNodeLayerResources({
  nodeQuadRendererRef,
  runtime,
  textureManagerRef,
}: {
  readonly nodeQuadRendererRef: MutableRefObject<GpuNodeQuadRenderer | null>;
  readonly runtime: GpuFlowRuntime;
  readonly textureManagerRef: MutableRefObject<NodeTextureManager | null>;
}) {
  if (!textureManagerRef.current) {
    textureManagerRef.current = createNodeTextureManager(runtime);
  }
  if (!nodeQuadRendererRef.current) {
    nodeQuadRendererRef.current = new GpuNodeQuadRenderer(runtime);
  }

  return {
    nodeQuadRenderer: nodeQuadRendererRef.current,
    textureManager: textureManagerRef.current,
  };
}

function destroyNodeLayerResources(
  textureManagerRef: MutableRefObject<NodeTextureManager | null>,
  nodeQuadRendererRef: MutableRefObject<GpuNodeQuadRenderer | null>,
) {
  textureManagerRef.current?.destroy();
  textureManagerRef.current = null;
  nodeQuadRendererRef.current?.destroy();
  nodeQuadRendererRef.current = null;
}

function destroyNodeInteractionResources(
  nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>,
  nodeInteractionCleanupRef: MutableRefObject<(() => void) | null>,
) {
  nodeInteractionCleanupRef.current?.();
  nodeInteractionCleanupRef.current = null;
  nodeInteractionRef.current = null;
}

function syncGpuFlowNodeInteractionState({
  nodeElementByIdRef,
  state,
}: {
  readonly nodeElementByIdRef: MutableRefObject<Map<string, HTMLElement>>;
  readonly state: GpuNodeInteractionState;
}) {
  for (const [nodeId, element] of nodeElementByIdRef.current) {
    const interactive = state.activeNodeId === nodeId;
    const overlayActive = state.overlayNodeId === nodeId;
    element.dataset.gpuFlowInteractive = interactive ? "true" : "false";
    element.dataset.gpuFlowOverlay = overlayActive ? "active" : "none";
    element.classList.toggle("setta-gpu-flow__node--interactive", interactive);
    element.classList.toggle(
      "setta-gpu-flow__node--overlay-active",
      overlayActive,
    );
  }
}

function completeGpuNodeInteractionFrame(
  nodeInteractionRef: MutableRefObject<GpuNodeInteractionDirtyController | null>,
  layerResult: RenderGpuNodeLayerFrameResult,
) {
  nodeInteractionRef.current?.completeFrame(layerResult);
}

function requestRemainingTextureUploadFrame(
  surfaceRef: MutableRefObject<GpuSurfaceHandle | null>,
  layerResult: RenderGpuNodeLayerFrameResult,
) {
  if (layerResult.budgetExhausted) {
    surfaceRef.current?.requestFrame("texture-upload");
  }
}

function nextFrame(frameRef: MutableRefObject<number>): number {
  frameRef.current += 1;
  return frameRef.current;
}
