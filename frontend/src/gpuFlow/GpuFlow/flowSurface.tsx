import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  resolveGpuNodePointerHandoffTarget,
  resolveGpuNodeWheelHandoffTarget,
} from "../activeNodeTargeting";

import type { GpuEdgeBufferInput } from "../edges/edgeGpuBuffers";

import type { GpuEdgeScene } from "../edges/edgeSources";

import { useGpuFlowLayoutStoreNodes } from "../layoutHooks";

import { GpuFlowLayoutStoreContext } from "../layoutStoreContext";

import type { GpuFlowLayoutStoreApi } from "../layoutStore";

import { GpuFlowSceneContext } from "../sceneContext";

import { getGpuFlowSceneDomSectionNodes, type GpuFlowScene } from "../scene";

import {
  clearGpuNodeDomTransformSyncCache,
  clearGpuNodeDomTransformSyncCacheNode,
  createGpuNodeDomTransformSyncCache,
  markHtmlSurfaceFramePaintDirty,
  type GpuHtmlSurfaceOverlayLayout,
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

import type { GpuFlowFramePerformanceReporter } from "../framePerformance";

import {
  attachGpuEdgeInteractionController,
  type GpuEdgeInteractionControllerOptions,
} from "../interactions/edges";

import {
  attachGpuEdgeReconnectController,
  type GpuEdgeReconnectOptions,
} from "../interactions/edgeReconnect";

import {
  attachGpuNodeDragController,
  type GpuNodeDragControllerOptions,
} from "../interactions/nodeDrag";

import {
  attachGpuNodeResizeController,
  type GpuNodeResizeControllerOptions,
} from "../interactions/nodeResize";

import {
  attachGpuPanZoomController,
  type GpuPanZoomControllerOptions,
} from "../interactions/panZoom";

import {
  attachGpuSectionSceneScrollController,
  type GpuSectionSceneScrollControllerOptions,
} from "../interactions/sceneScroll";

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

import { createGpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "../viewportStore";

import {
  destroyNodeInteractionResources,
  destroyNodeLayerResources,
  nextFrame,
  renderGpuFlowNodeLayerFrame,
  syncGpuFlowNodeInteractionState,
} from "./flowFrame";

import {
  GpuFlowDomIslandLayer,
  type GpuFlowDomIslandRenderer,
} from "./domIslandLayer";
import {
  resolveGpuFlowEdgeDrawInputs,
  validateGpuFlowEdgeInput,
} from "./edgeInput";
import { useGpuFlowOverlaySources } from "./flowOverlays";

import { renderGpuFlowNodeLayerElement } from "./nodeLayerElement";
import {
  useGpuFlowRetainedContentControllers,
  type GpuFlowRetainedContentConnectionOptions,
  type GpuFlowRetainedContentInteractionOptions,
  type GpuFlowRetainedContentKeyboardOptions,
  type GpuFlowRetainedContentScrollOptions,
  type GpuFlowScenePortConnectionOptions,
} from "./retainedContentControllers";

import {
  clearGpuFlowNodeElement,
  projectGpuFlowNodeSourceForPointerEvent,
} from "./sourceInteraction";

import {
  assertGpuFlowPortalGroupsRenderable,
  GpuFlowPortalLayer,
  partitionGpuFlowPortals,
  type GpuFlowPortalDescriptor,
} from "../portals/portalManager";
import {
  resolveGpuFlowNodeResizeCursor,
  resolveGpuFlowNodeResizeTarget,
} from "./nodeResizeTarget";
import { useGpuFlowPortLocalRectSync } from "./portLocalRectSync";
import {
  useGpuFlowSelectionDragLayer,
  type GpuFlowSelectionDragOptions,
} from "./selectionDragLayer";

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
  edgePalette?: GpuEdgePaletteInput | undefined;
  edgeReconnect?: false | GpuEdgeReconnectOptions | undefined;
  edgeScene?: GpuEdgeScene | undefined;
  edges?: readonly GpuEdgeBufferInput[] | undefined;
  framePerformanceReporter?: GpuFlowFramePerformanceReporter | undefined;
  forceVisibleNodeIds?: ReadonlySet<string> | readonly string[] | undefined;
  grid?: GpuGridInput | undefined;
  layoutStore?: GpuFlowLayoutStoreApi | undefined;
  marginCssPx?: number | undefined;
  nodeClassName?: string | undefined;
  nodeTextureMemoryBudgetBytes?: number | undefined;
  onNodeElementChange?:
    | ((nodeId: string, element: HTMLElement | null) => void)
    | undefined;
  nodeDrag?:
    | false
    | Omit<
        GpuNodeDragControllerOptions,
        "element" | "layoutStore" | "requestFrame" | "store"
      >
    | undefined;
  nodeResize?:
    | false
    | Omit<
        GpuNodeResizeControllerOptions,
        | "element"
        | "layoutStore"
        | "requestFrame"
        | "resolveResizeTarget"
        | "store"
      >
    | undefined;
  onNodeLayerFrame?:
    | ((result: RenderHtmlSurfaceFrameResult) => void)
    | undefined;
  panZoom?:
    | false
    | Omit<GpuPanZoomControllerOptions, "element" | "requestFrame" | "store">
    | undefined;
  portals?: readonly GpuFlowPortalDescriptor[] | undefined;
  renderNode?: ((node: GpuNodeLayout) => ReactNode) | undefined;
  selection?:
    | false
    | Omit<GpuSelectionControllerOptions, "element" | "getNodes" | "store">
    | undefined;
  selectionDrag?: GpuFlowSelectionDragOptions;
  scene?: GpuFlowScene | undefined;
  scenePortConnection?: GpuFlowScenePortConnectionOptions;
  sceneScroll?:
    | false
    | Omit<
        GpuSectionSceneScrollControllerOptions,
        "element" | "getScene" | "requestFrame" | "store"
      >
    | undefined;
  retainedContentInteraction?: GpuFlowRetainedContentInteractionOptions;
  retainedContentConnection?: GpuFlowRetainedContentConnectionOptions;
  retainedContentKeyboard?: GpuFlowRetainedContentKeyboardOptions;
  retainedContentScroll?: GpuFlowRetainedContentScrollOptions;
  renderDomIsland?: GpuFlowDomIslandRenderer | undefined;
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
> & {
  readonly framePerformanceReporter:
    | GpuFlowFramePerformanceReporter
    | undefined;
};

export type GpuFlowNodeLayerState = {
  readonly edgeScene: GpuEdgeScene | undefined;
  readonly edgePalette: GpuEdgePaletteInput | undefined;
  readonly edges: readonly GpuEdgeBufferInput[] | undefined;
  readonly forceVisibleNodeIds:
    | ReadonlySet<string>
    | readonly string[]
    | undefined;
  readonly grid: GpuGridInput | undefined;
  readonly edgeLabelSurfaces:
    | readonly GpuHtmlSurfaceOverlayLayout[]
    | undefined;
  readonly marginCssPx: number | undefined;
  readonly nodes: readonly GpuNodeLayout[] | undefined;
  readonly nodeTextureMemoryBudgetBytes: number | undefined;
  readonly uploadBudget: GpuNodeUploadBudget | undefined;
  readonly scene: GpuFlowScene | undefined;
  readonly viewport: GpuViewportInput;
  readonly visualScene?: HtmlSurfaceVisualScene | undefined;
};

export const EMPTY_GPU_NODE_LAYOUTS: readonly GpuNodeLayout[] = [];

export function GpuFlow({
  children,
  className = "setta-gpu-flow",
  deviceOptions,
  edgeInteraction,
  edgePalette,
  edgeReconnect,
  edgeScene,
  edges,
  framePerformanceReporter,
  forceVisibleNodeIds,
  grid,
  layoutStore,
  marginCssPx,
  nodeClassName,
  nodeTextureMemoryBudgetBytes,
  nodeDrag,
  nodeResize,
  onFrame,
  onNodeElementChange,
  onNodeLayerFrame,
  onPaint,
  onReady,
  onResize,
  panZoom,
  portals,
  retainedContentInteraction,
  retainedContentConnection,
  retainedContentKeyboard,
  retainedContentScroll,
  renderDomIsland,
  renderNode,
  selection,
  selectionDrag,
  scene,
  scenePortConnection,
  sceneScroll,
  style,
  surfaceClassName,
  uploadBudget,
  viewport,
  viewportStore = gpuFlowViewportStore,
}: GpuFlowProps) {
  validateGpuFlowEdgeInput({
    edgeInteraction,
    edgeReconnect,
    edgeScene,
    edges,
  });
  const storeNodes = useGpuFlowLayoutStoreNodes(layoutStore);
  const sceneNodes = useMemo(
    () => (scene ? getGpuFlowSceneDomSectionNodes(scene) : undefined),
    [scene],
  );
  const nodes = storeNodes ?? sceneNodes;
  const drawEdges = resolveGpuFlowEdgeDrawInputs({ edgeScene, edges });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<GpuSurfaceHandle | null>(null);
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
  const activeResizeNodeIdRef = useRef<string | null>(null);
  const nodeDomTransformSyncCacheRef = useRef<GpuNodeDomTransformSyncCache>(
    createGpuNodeDomTransformSyncCache(),
  );
  const textureManagerRef = useRef<HtmlSurfaceTextureManager | null>(null);
  const [retainedContentSwitchAnimations] = useState(() =>
    createGpuRetainedContentSwitchAnimationStore(),
  );
  const transformOnlyPaintNodeIdsRef = useRef<Set<string>>(new Set());
  const visibleNodeIdsRef = useRef<ReadonlySet<string>>(new Set());
  const {
    edgeLabelSourceElement,
    htmlSurfaceOverlays,
    nodeDragPreviewSourceElement,
    nodeResizeOverlaySourceElement,
    retainedContentSourceElement,
    selectionOverlaySourceElement,
  } = useGpuFlowOverlaySources({
    edgeScene,
    layoutStore,
    nodeDomTransformSyncCacheRef,
    nodeElementByIdRef,
    nodes,
    primaryNodeId: getGpuFlowSelectionDragPrimaryNodeId(selectionDrag),
    scene,
    surfaceRef,
    switchAnimations: retainedContentSwitchAnimations,
    textureManagerRef,
    transformOnlyPaintNodeIdsRef,
    viewportStore,
  });
  const callbacksRef = useRef<GpuFlowCallbacks>({
    onFrame,
    onNodeElementChange,
    onNodeLayerFrame,
    onPaint,
    onReady,
    onResize,
    framePerformanceReporter,
  });
  const nodeLayerRef = useRef<GpuFlowNodeLayerState>({
    edgeScene,
    edgePalette,
    edges: drawEdges,
    edgeLabelSurfaces: htmlSurfaceOverlays,
    forceVisibleNodeIds,
    grid,
    marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes,
    scene,
    uploadBudget,
    viewport: viewport ?? viewportStore.getState().transform,
  });
  const sceneContextValue = useMemo(
    () => ({
      getScene: () => nodeLayerRef.current.scene,
    }),
    [],
  );
  const requestSurfaceFrame = useCallback((reason: GpuFrameReason) => {
    surfaceRef.current?.requestFrame(reason);
  }, []);

  useEffect(() => {
    callbacksRef.current = {
      onFrame,
      onNodeElementChange,
      onNodeLayerFrame,
      onPaint,
      onReady,
      onResize,
      framePerformanceReporter,
    };
  }, [
    framePerformanceReporter,
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
    return viewportStore.subscribe((state, previousState) => {
      if (state.transform !== previousState.transform) {
        nodeLayerRef.current = {
          ...nodeLayerRef.current,
          viewport: state.transform,
        };
        surfaceRef.current?.requestFrame("viewport");
      }
    });
  }, [viewportStore]);

  useEffect(() => {
    validateGpuFlowEdgeInput({
      edgeInteraction,
      edgeReconnect,
      edgeScene,
      edges,
    });
    const nextEdges = resolveGpuFlowEdgeDrawInputs({ edgeScene, edges });
    nodeLayerRef.current = {
      edgeScene,
      edgePalette,
      edges: nextEdges,
      edgeLabelSurfaces: htmlSurfaceOverlays,
      forceVisibleNodeIds,
      grid,
      marginCssPx,
      nodes,
      nodeTextureMemoryBudgetBytes,
      scene,
      uploadBudget,
      viewport: viewportStore.getState().transform,
    };
    if (!nodes && !nextEdges && !grid && htmlSurfaceOverlays.length === 0) {
      visibleNodeIdsRef.current = new Set();
      clearGpuNodeDomTransformSyncCache(nodeDomTransformSyncCacheRef.current);
      transformOnlyPaintNodeIdsRef.current.clear();
      sourceInteractionProjector.destroy();
      destroyNodeLayerResources(textureManagerRef, htmlSurfaceRendererRef);
    }
    surfaceRef.current?.requestFrame("viewport");
  }, [
    edgeInteraction,
    edgeReconnect,
    edgePalette,
    edgeScene,
    edges,
    forceVisibleNodeIds,
    grid,
    htmlSurfaceOverlays,
    marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes,
    scene,
    uploadBudget,
    viewportStore,
  ]);

  useGpuFlowRetainedContentControllers({
    containerRef,
    layoutStore,
    nodeElementByIdRef,
    nodeLayerRef,
    retainedContentConnection,
    retainedContentInteraction,
    retainedContentKeyboard,
    retainedContentScroll,
    retainedContentSwitchAnimations,
    scenePortConnection,
    surfaceRef,
    textureManagerRef,
    viewportStore,
  });

  useEffect(() => {
    if (sceneScroll === false) {
      return;
    }
    const container = containerRef.current;
    if (!container || !sceneScroll) {
      return;
    }
    return attachGpuSectionSceneScrollController({
      ...sceneScroll,
      element: container,
      getScene: () => nodeLayerRef.current.scene,
      requestFrame: (reason) => {
        surfaceRef.current?.requestFrame(reason);
      },
      store: viewportStore,
    });
  }, [sceneScroll, viewportStore]);

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
    if (!layoutStore) {
      throw new Error("GpuFlow node drag requires a layout store.");
    }
    return attachGpuNodeDragController({
      ...nodeDrag,
      element: container,
      layoutStore,
      requestFrame: (reason) => {
        surfaceRef.current?.requestFrame(reason);
      },
      store: viewportStore,
    });
  }, [layoutStore, nodeDrag, viewportStore]);

  useEffect(() => {
    if (nodeResize === false) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    if (!layoutStore) {
      throw new Error("GpuFlow node resize requires a layout store.");
    }
    return attachGpuNodeResizeController({
      ...nodeResize,
      element: container,
      layoutStore,
      onNodeResize: (change) => {
        nodeResize?.onNodeResize?.(change);
      },
      onNodeResizeCancel: (change) => {
        nodeResize?.onNodeResizeCancel?.(change);
        activeResizeNodeIdRef.current = null;
      },
      onNodeResizeStart: (change) => {
        activeResizeNodeIdRef.current = change.nodeId;
        nodeResize?.onNodeResizeStart?.(change);
      },
      onNodeResizeStop: (change) => {
        nodeResize?.onNodeResizeStop?.(change);
        activeResizeNodeIdRef.current = null;
      },
      requestFrame: (reason) => {
        surfaceRef.current?.requestFrame(reason);
      },
      resolveResizeTarget: (event) =>
        resolveGpuFlowNodeResizeTarget({
          event,
          elementByNodeId: nodeElementByIdRef.current,
          effectProjectors: htmlSurfaceEffectProjectors,
          nodes: nodeLayerRef.current.nodes ?? EMPTY_GPU_NODE_LAYOUTS,
          sourceInteractionProjector,
          surfaceElement: container,
          viewport: nodeLayerRef.current.viewport,
          visualScene: nodeLayerRef.current.visualScene,
          requireVisualSceneHitSurfaces:
            nodeLayerRef.current.scene !== undefined,
        }),
      store: viewportStore,
    });
  }, [
    htmlSurfaceEffectProjectors,
    layoutStore,
    nodeResize,
    sourceInteractionProjector,
    viewportStore,
  ]);

  useGpuFlowPortLocalRectSync(layoutStore, { enabled: scene === undefined });

  useEffect(() => {
    if (!edgeReconnect) {
      return;
    }
    if (!edgeScene) {
      throw new Error("Setta GPU flow edge reconnect requires a GpuEdgeScene.");
    }
    if (!layoutStore) {
      throw new Error("Setta GPU flow edge reconnect requires a layout store.");
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    return attachGpuEdgeReconnectController({
      ...edgeReconnect,
      element: container,
      getFlowScene: () => nodeLayerRef.current.scene,
      getScene: () => nodeLayerRef.current.edgeScene,
      layoutStore,
      store: edgeReconnect.store ?? viewportStore,
    });
  }, [edgeReconnect, edgeScene, layoutStore, viewportStore]);

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
      retainedContentSwitchAnimations.clear();
      destroyNodeLayerResources(textureManagerRef, htmlSurfaceRendererRef);
    };
  }, [retainedContentSwitchAnimations]);

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
            requireVisualSceneHitSurfaces:
              nodeLayerRef.current.scene !== undefined,
            surfaceElement: containerRef.current ?? runtime.canvas,
            viewport: nodeLayerRef.current.viewport,
            visualScene: nodeLayerRef.current.visualScene,
          });
        },
        requestFrame: (reason) => {
          surfaceRef.current?.requestFrame(reason);
        },
        resolveCanvasCursor: (event) =>
          resolveGpuFlowNodeResizeCursor({
            event,
            nodes: nodeLayerRef.current.nodes ?? EMPTY_GPU_NODE_LAYOUTS,
            surfaceElement: containerRef.current ?? runtime.canvas,
            viewport: nodeLayerRef.current.viewport,
          }),
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
            requireVisualSceneHitSurfaces:
              nodeLayerRef.current.scene !== undefined,
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
            requireVisualSceneHitSurfaces:
              nodeLayerRef.current.scene !== undefined,
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
        activeResizeNodeIdRef,
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
  useGpuFlowSelectionDragLayer({
    containerRef,
    layoutStore,
    requestFrame: requestSurfaceFrame,
    selectionDrag,
    viewportStore,
  });
  const portalGroups = partitionGpuFlowPortals(portals);
  assertGpuFlowPortalGroupsRenderable(portalGroups);

  return (
    <GpuFlowLayoutStoreContext.Provider value={layoutStore ?? null}>
      <GpuFlowSceneContext.Provider value={sceneContextValue}>
        <div
          className={className}
          data-tab-scope="canvas"
          ref={containerRef}
          style={style}
          tabIndex={selectionDrag ? -1 : undefined}
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
            {retainedContentSourceElement}
            {children}
            <GpuFlowPortalLayer portals={portalGroups.sourceLocal} />
            {edgeLabelSourceElement}
            {selectionOverlaySourceElement}
            {nodeResizeOverlaySourceElement}
            {nodeDragPreviewSourceElement}
            <GpuFlowDomIslandLayer
              renderDomIsland={renderDomIsland}
              scene={scene}
              viewportStore={viewportStore}
            />
          </GpuSurface>
          <GpuFlowPortalLayer portals={portalGroups.viewport} />
        </div>
      </GpuFlowSceneContext.Provider>
    </GpuFlowLayoutStoreContext.Provider>
  );
}

function getGpuFlowSelectionDragPrimaryNodeId(
  selectionDrag: GpuFlowSelectionDragOptions,
): string | null {
  if (!selectionDrag) {
    return null;
  }
  return selectionDrag.primaryNodeId ?? null;
}
