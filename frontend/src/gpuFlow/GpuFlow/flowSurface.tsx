import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveGpuNodePointerHandoffTarget,
  resolveGpuNodeWheelHandoffTarget,
} from "../activeNodeTargeting";
import { type GpuCanvasSize } from "../gpuRenderer";
import { type GpuSurfaceHandle, type GpuSurfaceProps } from "../GpuSurface";
import {
  clearGpuNodeDomTransformSyncCache,
  createGpuNodeDomTransformSyncCache,
  markHtmlSurfaceFramePaintDirty,
  type GpuNodeDomTransformSyncCache,
} from "../htmlSurfaces/frame";
import { createHtmlSurfaceInteractionProjector } from "../htmlSurfaces/interactionProjector";
import { HtmlSurfaceRenderer } from "../htmlSurfaces/renderer";
import { createHtmlSurfaceShaderEffectProjectors } from "../htmlSurfaces/shaderEffects";
import {
  createHtmlSurfaceTextureManager,
  type HtmlSurfaceTextureManager,
} from "../htmlSurfaces/textures";
import { createGpuFlowInteractionDiagnosticsState } from "../interactionDiagnostics";
import { attachGpuEdgeReconnectController } from "../interactions/edgeReconnect";
import { attachGpuEdgeInteractionController } from "../interactions/edges";
import { attachGpuNodeDragController } from "../interactions/nodeDrag";
import { attachGpuPanZoomController } from "../interactions/panZoom";
import { attachGpuSectionSceneScrollController } from "../interactions/sceneScroll";
import { attachGpuSelectionController } from "../interactions/selection";
import { useGpuFlowLayoutStoreNodes } from "../layoutHooks";
import {
  createGpuNodeInteractionDirtyController,
  type GpuNodeInteractionDirtyController,
} from "../nodeInteractionDirty";
import {
  createGpuFlowLiveProjectionSampler,
  createGpuFlowVisiblePublicationScheduler,
  type GpuFlowVisibleProjectionState,
} from "../projectionRuntime";
import { createGpuRetainedContentRuntimeState } from "../retainedContentRuntimeState";
import { createGpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { RetainedContentTexturePageManager } from "../retainedContentTexturePageManager";
import type { RetainedDisplayFrame } from "../retainedDisplayFrame";
import { getGpuFlowSceneDomSectionNodes } from "../scene";
import { registerGpuFlowViewportRuntime } from "../viewportRuntimeRegistry";
import { gpuFlowViewportStore } from "../viewportStore";
import { useGpuFlowCommittedSurfaceFrameState } from "./committedSurfaceFrameState";
import {
  resolveGpuFlowEdgeDrawInputs,
  validateGpuFlowEdgeInput,
} from "./edgeInput";
import { resolveGpuFlowCanvasCursor } from "./flowCanvasCursor";
import {
  destroyNodeInteractionResources,
  destroyNodeLayerResources,
  nextFrame,
  syncGpuFlowNodeInteractionState,
  type GpuFlowRetainedContentFrameCache,
} from "./flowFrame";
import { createInitialGpuFlowRetainedRuntimeFrame } from "./flowInitialRetainedRuntimeFrame";
import type { GpuFlowNodeLayerState } from "./flowLayerState";
import { attachGpuFlowNodeResizeController } from "./flowNodeResizeController";
import { useGpuFlowOverlaySources } from "./flowOverlays";
import { syncGpuFlowNodeLayerSceneState } from "./flowSceneStateSync";
import { renderGpuFlowSurfaceFrame } from "./flowSurfaceFramePublication";
import {
  useGpuFlowNodeElementChangeHandler,
  useGpuFlowNodeScreenRectDebug,
  useGpuFlowSurfaceResourceCleanup,
  useGpuFlowViewportRuntime,
} from "./flowSurfaceRuntimeHooks";
import {
  EMPTY_GPU_NODE_LAYOUTS,
  type GpuFlowCallbacks,
  type GpuFlowProps,
} from "./flowSurfaceTypes";
import { GpuFlowSurfaceView } from "./flowSurfaceView";
import { useGpuFlowPortLocalRectSync } from "./portLocalRectSync";
import { resolveGpuFlowRenderableNodes } from "./renderableNodes";
import { useGpuFlowRetainedContentControllers } from "./retainedContentControllers";
import { useGpuFlowDebugGlobals } from "./retainedRowsDebug";
import {
  getGpuFlowSelectionDragPrimaryNodeId,
  useGpuFlowSelectionDragLayer,
} from "./selectionDragLayer";
import {
  clearGpuFlowNodeHoverSourceProjection,
  projectGpuFlowNodeHoverSourceForPointerEvent,
  projectGpuFlowNodeSourceForPointerEvent,
} from "./sourceInteraction";

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
  onDomControlActivation,
  onNodeElementChange,
  onNodeLayerFrame,
  onPaint,
  onReady,
  onRetainedRuntimeFrame,
  onResize,
  panZoom,
  portals,
  retainedContentInteraction,
  retainedContentConnection,
  retainedContentKeyboard,
  retainedContentRuntimeState,
  retainedContentScroll,
  renderDomIsland,
  renderNode,
  renderRetainedDomControl,
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
  const nodes = useMemo(
    () =>
      resolveGpuFlowRenderableNodes({
        sceneNodes,
        storeNodes,
      }),
    [sceneNodes, storeNodes],
  );
  const drawEdges = resolveGpuFlowEdgeDrawInputs({ edgeScene, edges });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<GpuSurfaceHandle | null>(null);
  const [sourceInteractionProjector] = useState(() =>
    createHtmlSurfaceInteractionProjector(),
  );
  const { requestSurfaceFrame, viewportRuntime } = useGpuFlowViewportRuntime({
    surfaceRef,
    viewportStore,
  });
  const [htmlSurfaceEffectProjectors] = useState(() =>
    createHtmlSurfaceShaderEffectProjectors(),
  );
  const nodeResizeRef = useRef<GpuFlowProps["nodeResize"]>(nodeResize);
  const retainedContentInteractionRef = useRef(retainedContentInteraction);
  const activeInteractionNodeIdRef = useRef<string | null>(null);
  const canvasSizeRef = useRef<GpuCanvasSize | null>(null);
  const frameRef = useRef(0);
  const interactionDiagnosticsRef = useRef(
    createGpuFlowInteractionDiagnosticsState(),
  );
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
  const retainedContentPageManagerRef =
    useRef<RetainedContentTexturePageManager | null>(null);
  const retainedContentFrameCacheRef =
    useRef<GpuFlowRetainedContentFrameCache | null>(null);
  const retainedDisplayFrameRef = useRef<RetainedDisplayFrame | null>(null);
  const [retainedContentSwitchAnimations] = useState(() =>
    createGpuRetainedContentSwitchAnimationStore(),
  );
  const [defaultRetainedContentRuntimeState] = useState(() =>
    createGpuRetainedContentRuntimeState(),
  );
  const activeRetainedContentRuntimeState =
    retainedContentRuntimeState ?? defaultRetainedContentRuntimeState;
  const liveProjectionSamplerRef = useRef(createGpuFlowLiveProjectionSampler());
  const visiblePublicationSchedulerRef = useRef(
    createGpuFlowVisiblePublicationScheduler(),
  );
  const visibleProjectionStateRef =
    useRef<GpuFlowVisibleProjectionState | null>(null);
  const getRetainedDomControlScrollOffset = useCallback(
    (surfaceId: string) =>
      visibleProjectionStateRef.current?.sample.retainedScrollOffsets.get(
        surfaceId,
      ) ??
      activeRetainedContentRuntimeState.scrollOffsets.get(surfaceId) ??
      null,
    [activeRetainedContentRuntimeState],
  );
  const retainedRuntimeFrameRenderSignatureRef = useRef<string | null>(null);
  const retainedPreparationRuntimeFrameRenderSignatureRef = useRef<
    string | null
  >(null);
  const retainedPreparationRuntimeFrameScrollRevisionRef = useRef<
    number | null
  >(null);
  const initialRetainedRuntimeFrame = useMemo(
    () =>
      createInitialGpuFlowRetainedRuntimeFrame({
        retainedContentRuntimeState: activeRetainedContentRuntimeState,
        scene,
        viewport,
        viewportRuntime,
        viewportStore,
      }),
    [
      activeRetainedContentRuntimeState,
      scene,
      viewport,
      viewportRuntime,
      viewportStore,
    ],
  );
  retainedPreparationRuntimeFrameScrollRevisionRef.current ??=
    initialRetainedRuntimeFrame.input.scrollRevision;
  const {
    committedSurfaceFrameRef,
    publishCommittedSurfaceFrame,
    resetCommittedSurfaceFrame,
    visibleCommittedSurfaceFrame,
  } = useGpuFlowCommittedSurfaceFrameState({
    initialRetainedRuntimeFrame,
  });
  const overlayRetainedRuntimeFrame =
    visibleCommittedSurfaceFrame.retainedRuntimeFrame;
  const transformOnlyPaintNodeIdsRef = useRef<Set<string>>(new Set());
  const visibleNodeIdsRef = useRef<ReadonlySet<string>>(new Set());
  nodeResizeRef.current = nodeResize;
  retainedContentInteractionRef.current = retainedContentInteraction;
  const nodeResizeEnabled = nodeResize !== false;
  const {
    edgeLabelSourceElement,
    htmlSurfaceNativeVisuals,
    htmlSurfaceOverlays,
    nodeDragPreviewSourceElement,
    nodeResizeOverlaySourceElement,
    retainedDomControlSnapshotSourceElement,
    selectionOverlaySourceElement,
  } = useGpuFlowOverlaySources({
    edgeScene,
    layoutStore,
    nodeDomTransformSyncCacheRef,
    nodeElementByIdRef,
    nodes,
    primaryNodeId: getGpuFlowSelectionDragPrimaryNodeId(selectionDrag),
    renderRetainedDomControl,
    retainedRuntimeFrame: overlayRetainedRuntimeFrame,
    surfaceRef,
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
    onRetainedRuntimeFrame,
    onResize,
    framePerformanceReporter,
  });
  const nodeLayerRef = useRef<GpuFlowNodeLayerState>({
    edgeScene,
    edgePalette,
    edges: drawEdges,
    edgeLabelSurfaces: htmlSurfaceOverlays,
    htmlSurfaceNativeVisuals,
    forceVisibleNodeIds,
    grid,
    marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes,
    scene,
    uploadBudget,
    viewport: viewport ?? viewportRuntime.getViewportTuple(),
  });
  const sceneContextValue = useMemo(
    () => ({
      getScene: () => nodeLayerRef.current.scene,
    }),
    [],
  );
  useEffect(() => {
    viewportRuntime.connectStore();
    const unregisterRuntime = registerGpuFlowViewportRuntime(
      viewportStore,
      viewportRuntime,
    );
    return () => {
      unregisterRuntime();
      viewportRuntime.disconnectStore();
    };
  }, [viewportRuntime, viewportStore]);

  useEffect(() => {
    callbacksRef.current = {
      onFrame,
      onNodeElementChange,
      onNodeLayerFrame,
      onPaint,
      onReady,
      onRetainedRuntimeFrame,
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
    onRetainedRuntimeFrame,
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
    viewportRuntime.applyViewportCommand(viewport);
  }, [viewport, viewportRuntime]);
  useGpuFlowDebugGlobals({
    activeResizeNodeIdRef,
    containerRef,
    getCommittedSurfaceFrame: () => committedSurfaceFrameRef.current,
    getViewport: () => viewportRuntime.getViewportTuple(),
    interactionDiagnosticsRef,
    nodeInteractionRef,
    nodeLayerRef,
    retainedContentRuntimeState: activeRetainedContentRuntimeState,
    viewportStore,
  });
  useEffect(() => {
    syncGpuFlowNodeLayerSceneState({
      activeRetainedContentRuntimeState,
      edgeInteraction,
      edgePalette,
      edgeReconnect,
      edgeScene,
      edges,
      forceVisibleNodeIds,
      grid,
      htmlSurfaceNativeVisuals,
      htmlSurfaceOverlays,
      htmlSurfaceRendererRef,
      marginCssPx,
      nodeDomTransformSyncCacheRef,
      nodeLayerRef,
      nodes,
      nodeTextureMemoryBudgetBytes,
      retainedContentPageManagerRef,
      scene,
      sourceInteractionProjector,
      surfaceRef,
      textureManagerRef,
      transformOnlyPaintNodeIdsRef,
      uploadBudget,
      viewport: viewportRuntime.getViewportTuple(),
      visibleNodeIdsRef,
    });
  }, [
    activeRetainedContentRuntimeState,
    edgeInteraction,
    edgeReconnect,
    edgePalette,
    edgeScene,
    edges,
    forceVisibleNodeIds,
    grid,
    htmlSurfaceNativeVisuals,
    htmlSurfaceOverlays,
    marginCssPx,
    nodes,
    nodeTextureMemoryBudgetBytes,
    scene,
    sourceInteractionProjector,
    uploadBudget,
    viewportRuntime,
  ]);
  useGpuFlowNodeScreenRectDebug({
    containerRef,
    nodeLayerRef,
  });
  useEffect(() => {
    if (scene) {
      return;
    }
    retainedDisplayFrameRef.current = null;
    visibleProjectionStateRef.current = null;
    resetCommittedSurfaceFrame();
    retainedPreparationRuntimeFrameRenderSignatureRef.current = null;
    retainedRuntimeFrameRenderSignatureRef.current = null;
  }, [resetCommittedSurfaceFrame, scene]);

  useEffect(() => {
    if (!nodeResizeEnabled) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    if (!layoutStore) {
      throw new Error("GpuFlow node resize requires a layout store.");
    }
    return attachGpuFlowNodeResizeController({
      activeResizeNodeIdRef,
      element: container,
      htmlSurfaceEffectProjectors,
      layoutStore,
      nodeElementByIdRef,
      nodeLayerRef,
      nodeResizeRef,
      sourceInteractionProjector,
      surfaceRef,
      viewportStore,
    });
  }, [
    htmlSurfaceEffectProjectors,
    layoutStore,
    nodeResizeEnabled,
    sourceInteractionProjector,
    viewportStore,
  ]);

  useGpuFlowRetainedContentControllers({
    containerRef,
    interactionDiagnosticsRef,
    layoutStore,
    nodeElementByIdRef,
    nodeLayerRef,
    retainedContentConnection,
    retainedContentInteraction,
    retainedContentKeyboard,
    retainedContentPageManagerRef,
    retainedContentRuntimeState: activeRetainedContentRuntimeState,
    visibleProjectionStateRef,
    retainedContentScroll,
    retainedContentSwitchAnimations,
    scenePortConnection,
    surfaceRef,
    textureManagerRef,
    viewportRuntime,
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
      viewportRuntime,
    });
  }, [panZoom, viewportRuntime, viewportStore]);

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

  useGpuFlowSurfaceResourceCleanup({
    htmlSurfaceRendererRef,
    nodeDomTransformSyncCacheRef,
    nodeInteractionCleanupRef,
    nodeInteractionRef,
    retainedContentPageManagerRef,
    retainedContentSwitchAnimations,
    sourceInteractionProjector,
    textureManagerRef,
    viewportRuntime,
  });

  const handleNodeElementChange = useGpuFlowNodeElementChangeHandler({
    callbacksRef,
    nodeDomTransformSyncCacheRef,
    nodeElementByIdRef,
    nodeInteractionRef,
    sourceInteractionProjector,
    surfaceRef,
    textureManagerRef,
    transformOnlyPaintNodeIdsRef,
  });

  const handleReady = useCallback<NonNullable<GpuSurfaceProps["onReady"]>>(
    (runtime) => {
      clearGpuNodeDomTransformSyncCache(nodeDomTransformSyncCacheRef.current);
      destroyNodeLayerResources(
        textureManagerRef,
        htmlSurfaceRendererRef,
        retainedContentPageManagerRef,
      );
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
        clearProjectedHoverInteraction: (nodeId) => {
          clearGpuFlowNodeHoverSourceProjection({
            nodeElementById: nodeElementByIdRef.current,
            nodeId,
            projector: sourceInteractionProjector,
          });
        },
        deferPassiveDirty: () =>
          viewportStore.getState().viewportInteractionActive,
        elementByNodeId: () => nodeElementByIdRef.current,
        getFrame: () => nextFrame(frameRef),
        onStateChange: (state) => {
          const deactivatedNodeIds = syncGpuFlowNodeInteractionState({
            nodeElementByIdRef,
            previousActiveNodeIdRef: activeInteractionNodeIdRef,
            state,
          });
          if (!state.activeNodeId) {
            sourceInteractionProjector.clearSource();
          }
          let queued = false;
          for (const nodeId of deactivatedNodeIds) {
            queued =
              Boolean(
                textureManagerRef.current?.markSurfaceTextureDirty({
                  content: true,
                  frame: nextFrame(frameRef),
                  priority: "visible",
                  reason: "content",
                  surfaceId: nodeId,
                }),
              ) || queued;
          }
          if (queued) {
            surfaceRef.current?.requestFrame("texture-upload");
          }
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
        projectHoverInteraction: (event, previousNodeId) =>
          projectGpuFlowNodeHoverSourceForPointerEvent({
            effectProjectors: htmlSurfaceEffectProjectors,
            event,
            nodeElementById: nodeElementByIdRef.current,
            nodes: nodeLayerRef.current.nodes ?? EMPTY_GPU_NODE_LAYOUTS,
            previousNodeId,
            projector: sourceInteractionProjector,
            surfaceElement: containerRef.current ?? runtime.canvas,
            viewport: nodeLayerRef.current.viewport,
            visualScene: nodeLayerRef.current.visualScene,
          }),
        requestFrame: (reason) => {
          surfaceRef.current?.requestFrame(reason);
        },
        resolveCanvasCursor: (event) => {
          const surfaceElement = containerRef.current ?? runtime.canvas;
          return resolveGpuFlowCanvasCursor({
            event,
            getRetainedRuntimeFrame: () =>
              nodeLayerRef.current.retainedRuntimeFrame ?? null,
            getScene: () => nodeLayerRef.current.scene,
            nodes: nodeLayerRef.current.nodes ?? EMPTY_GPU_NODE_LAYOUTS,
            retainedContentInteraction: retainedContentInteractionRef.current,
            store: viewportStore,
            surfaceElement,
            viewport: nodeLayerRef.current.viewport,
          });
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
      const interactionElement =
        containerRef.current ??
        (runtime.canvas.parentElement instanceof HTMLElement
          ? runtime.canvas.parentElement
          : runtime.canvas);
      nodeInteractionCleanupRef.current =
        nodeInteraction.attach(interactionElement);
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
      renderGpuFlowSurfaceFrame({
        activeResizeNodeIdRef,
        callbacksRef,
        canvasSizeRef,
        committedSurfaceFrameRef,
        event,
        frameRef,
        htmlSurfaceRendererRef,
        initialRetainedRuntimeFrame,
        interactionDiagnosticsRef,
        liveProjectionSamplerRef,
        nodeDomTransformSyncCacheRef,
        nodeElementByIdRef,
        nodeInteractionRef,
        nodeLayerRef,
        publishCommittedSurfaceFrame,
        retainedContentFrameCacheRef,
        retainedContentPageManagerRef,
        retainedContentRuntimeState: activeRetainedContentRuntimeState,
        retainedContentSwitchAnimations,
        retainedDisplayFrameRef,
        retainedPreparationRuntimeFrameRenderSignatureRef,
        retainedPreparationRuntimeFrameScrollRevisionRef,
        retainedRuntimeFrameRenderSignatureRef,
        runtime,
        surfaceRef,
        textureManagerRef,
        transformOnlyPaintNodeIdsRef,
        visibleCommittedSurfaceFrame,
        visibleNodeIdsRef,
        visibleProjectionStateRef,
        visiblePublicationSchedulerRef,
        viewportRuntime,
        viewportStore,
      });
    },
    [
      activeRetainedContentRuntimeState,
      initialRetainedRuntimeFrame,
      publishCommittedSurfaceFrame,
      retainedContentSwitchAnimations,
      visibleCommittedSurfaceFrame,
      viewportRuntime,
      viewportStore,
    ],
  );
  useGpuFlowSelectionDragLayer({
    containerRef,
    layoutStore,
    requestFrame: requestSurfaceFrame,
    selectionDrag,
    viewportStore,
  });
  return (
    <GpuFlowSurfaceView
      className={className}
      containerRef={containerRef}
      deviceOptions={deviceOptions}
      edgeLabelSourceElement={edgeLabelSourceElement}
      getRetainedDomControlScrollOffset={getRetainedDomControlScrollOffset}
      handleFrame={handleFrame}
      handlePaint={handlePaint}
      handleReady={handleReady}
      handleResize={handleResize}
      layoutStore={layoutStore}
      nodeClassName={nodeClassName}
      nodeDragPreviewSourceElement={nodeDragPreviewSourceElement}
      nodeResizeOverlaySourceElement={nodeResizeOverlaySourceElement}
      retainedDomControlSnapshotSourceElement={
        retainedDomControlSnapshotSourceElement
      }
      nodes={nodes ?? EMPTY_GPU_NODE_LAYOUTS}
      onNodeElementChange={handleNodeElementChange}
      onDomControlActivation={onDomControlActivation}
      portals={portals}
      renderDomIsland={renderDomIsland}
      renderNode={renderNode}
      renderRetainedDomControl={renderRetainedDomControl}
      sceneContextValue={sceneContextValue}
      selectionDrag={selectionDrag}
      selectionOverlaySourceElement={selectionOverlaySourceElement}
      style={style}
      surfaceClassName={surfaceClassName}
      surfaceRef={surfaceRef}
      viewportRuntime={viewportRuntime}
      viewportStore={viewportStore}
      visibleCommittedSurfaceFrame={visibleCommittedSurfaceFrame}
      children={children}
    />
  );
}
