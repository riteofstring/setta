import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type MutableRefObject,
  type ReactNode,
} from "react";
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
import { GpuNodeQuadRenderer } from "./gpuPipelines";
import { measureGpuCanvasClientSize, type GpuCanvasSize } from "./gpuRenderer";
import {
  GpuSurface,
  type GpuSurfaceHandle,
  type GpuSurfaceProps,
} from "./GpuSurface";
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

export type GpuFlowProps = Pick<
  GpuSurfaceProps,
  "deviceOptions" | "onFrame" | "onPaint" | "onReady" | "onResize"
> & {
  children?: ReactNode;
  className?: string | undefined;
  forceVisibleNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  marginCssPx?: number | undefined;
  nodeClassName?: string | undefined;
  nodeVisibility?: GpuNodeLayerProps["nodeVisibility"];
  nodes?: readonly GpuNodeLayout[] | undefined;
  onNodeLayerFrame?:
    | ((result: RenderGpuNodeLayerFrameResult) => void)
    | undefined;
  renderNode?: ((node: GpuNodeLayout) => ReactNode) | undefined;
  style?: CSSProperties | undefined;
  surfaceClassName?: string | undefined;
  uploadBudget?: GpuNodeUploadBudget | undefined;
  viewport?: GpuViewportInput | undefined;
};

type GpuFlowCallbacks = Pick<
  GpuFlowProps,
  "onFrame" | "onNodeLayerFrame" | "onPaint" | "onReady" | "onResize"
>;

type GpuFlowNodeLayerState = {
  readonly forceVisibleNodeIds:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly marginCssPx: number | undefined;
  readonly nodes: readonly GpuNodeLayout[] | undefined;
  readonly uploadBudget: GpuNodeUploadBudget | undefined;
  readonly viewport: GpuViewportInput;
};

export function GpuFlow({
  children,
  className = "setta-gpu-flow",
  deviceOptions,
  forceVisibleNodeIds,
  marginCssPx,
  nodeClassName,
  nodeVisibility,
  nodes,
  onFrame,
  onNodeLayerFrame,
  onPaint,
  onReady,
  onResize,
  renderNode,
  style,
  surfaceClassName,
  uploadBudget,
  viewport = [0, 0, 1],
}: GpuFlowProps) {
  const surfaceRef = useRef<GpuSurfaceHandle | null>(null);
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
    onNodeLayerFrame,
    onPaint,
    onReady,
    onResize,
  });
  const nodeLayerRef = useRef<GpuFlowNodeLayerState>({
    forceVisibleNodeIds,
    marginCssPx,
    nodes,
    uploadBudget,
    viewport,
  });

  useEffect(() => {
    callbacksRef.current = {
      onFrame,
      onNodeLayerFrame,
      onPaint,
      onReady,
      onResize,
    };
  }, [onFrame, onNodeLayerFrame, onPaint, onReady, onResize]);

  useEffect(() => {
    nodeLayerRef.current = {
      forceVisibleNodeIds,
      marginCssPx,
      nodes,
      uploadBudget,
      viewport,
    };
    if (!nodes) {
      visibleNodeIdsRef.current = new Set();
      destroyNodeLayerResources(textureManagerRef, nodeQuadRendererRef);
    }
    surfaceRef.current?.requestFrame("viewport");
  }, [forceVisibleNodeIds, marginCssPx, nodes, uploadBudget, viewport]);

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
      if (!element) {
        nodeElementByIdRef.current.delete(nodeId);
        nodeInteractionRef.current?.clearNode(nodeId);
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
      callbacksRef.current.onResize?.(runtime, size);
    },
    [],
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

  return (
    <div className={className} data-tab-scope="canvas" style={style}>
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
    </div>
  );
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
  readonly surfaceRef: MutableRefObject<GpuSurfaceHandle | null>;
  readonly textureManagerRef: MutableRefObject<NodeTextureManager | null>;
  readonly visibleNodeIdsRef: MutableRefObject<ReadonlySet<string>>;
}) {
  const layer = nodeLayerRef.current;
  if (!layer.nodes) {
    return;
  }
  const resources = ensureNodeLayerResources({
    nodeQuadRendererRef,
    runtime,
    textureManagerRef,
  });
  const canvasSize =
    canvasSizeRef.current ?? measureGpuCanvasClientSize(runtime.canvas);
  if (canvasSize.cssWidth <= 0 || canvasSize.cssHeight <= 0) {
    return;
  }

  const layerResult = renderGpuNodeLayerFrame({
    activeNodeId: nodeInteractionRef.current?.getActiveNodeId(),
    canvasSize,
    elementByNodeId: nodeElementByIdRef.current,
    forceVisibleNodeIds: layer.forceVisibleNodeIds,
    frame: nextFrame(frameRef),
    marginCssPx: layer.marginCssPx,
    nodes: layer.nodes,
    overlayNodeId: nodeInteractionRef.current?.getOverlayNodeId(),
    renderer: resources.nodeQuadRenderer,
    textureManager: resources.textureManager,
    uploadBudget: layer.uploadBudget,
    viewport: layer.viewport,
  });
  visibleNodeIdsRef.current = new Set(layerResult.visibleNodeIds);
  completeGpuNodeInteractionFrame(nodeInteractionRef, layerResult);
  callbacksRef.current.onNodeLayerFrame?.(layerResult);
  requestRemainingTextureUploadFrame(surfaceRef, layerResult);
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
