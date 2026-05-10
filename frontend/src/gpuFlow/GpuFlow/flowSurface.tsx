import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  resolveGpuNodePointerHandoffTarget,
  resolveGpuNodeWheelHandoffTarget,
} from "../activeNodeTargeting";
import { type GpuCanvasSize, type GpuFrameReason } from "../gpuRenderer";
import {
  GpuSurface,
  type GpuSurfaceHandle,
  type GpuSurfaceProps,
} from "../GpuSurface";
import {
  clearGpuNodeDomTransformSyncCache,
  clearGpuNodeDomTransformSyncCacheNode,
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
import { GpuFlowLayoutStoreContext } from "../layoutStoreContext";
import {
  createGpuNodeInteractionDirtyController,
  type GpuNodeInteractionDirtyController,
} from "../nodeInteractionDirty";
import {
  assertGpuFlowPortalGroupsRenderable,
  GpuFlowPortalLayer,
  partitionGpuFlowPortals,
} from "../portals/portalManager";
import {
  createGpuRetainedContentRuntimeState,
  type GpuRetainedContentRuntimeState,
} from "../retainedContentRuntimeState";
import { createGpuRetainedContentSwitchAnimationStore } from "../retainedContentSwitchAnimation";
import type { RetainedContentTexturePageManager } from "../retainedContentTexturePageManager";
import { getGpuFlowSceneDomSectionNodes, type GpuFlowScene } from "../scene";
import { GpuFlowSceneContext } from "../sceneContext";
import {
  createGpuFlowViewportRuntime,
  type GpuFlowViewportRuntime,
} from "../viewportRuntime";
import { registerGpuFlowViewportRuntime } from "../viewportRuntimeRegistry";
import { gpuFlowViewportStore } from "../viewportStore";
import { GpuFlowDomIslandLayer } from "./domIslandLayer";
import {
  resolveGpuFlowEdgeDrawInputs,
  validateGpuFlowEdgeInput,
} from "./edgeInput";
import { resolveGpuFlowCanvasCursor } from "./flowCanvasCursor";
import {
  destroyNodeInteractionResources,
  destroyNodeLayerResources,
  nextFrame,
  renderGpuFlowNodeLayerFrame,
  syncGpuFlowNodeInteractionState,
} from "./flowFrame";
import type { GpuFlowNodeLayerState } from "./flowLayerState";
import { attachGpuFlowNodeResizeController } from "./flowNodeResizeController";
import { useGpuFlowOverlaySources } from "./flowOverlays";
import {
  syncGpuFlowNodeLayerRetainedContentRuntimeState,
  syncGpuFlowNodeLayerSceneState,
} from "./flowSceneStateSync";
import {
  EMPTY_GPU_NODE_LAYOUTS,
  type GpuFlowCallbacks,
  type GpuFlowProps,
} from "./flowSurfaceTypes";
import { renderGpuFlowNodeLayerElement } from "./nodeLayerElement";
import { useGpuFlowPortLocalRectSync } from "./portLocalRectSync";
import { resolveGpuFlowRenderableNodes } from "./renderableNodes";
import { useGpuFlowRetainedContentControllers } from "./retainedContentControllers";
import { GpuFlowRetainedScrollSourceLayer } from "./retainedContentScrollSourceLayer";
import { useGpuFlowDebugGlobals } from "./retainedRowsDebug";
import {
  getGpuFlowSelectionDragPrimaryNodeId,
  useGpuFlowSelectionDragLayer,
} from "./selectionDragLayer";
import {
  clearGpuFlowNodeElement,
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
  retainedContentRuntimeState,
  retainedContentScroll,
  renderDomIsland,
  renderNode,
  renderRetainedTextLikeRowSnapshot,
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
  const requestSurfaceFrame = useCallback((reason: GpuFrameReason) => {
    surfaceRef.current?.requestFrame(reason);
  }, []);
  const [sourceInteractionProjector] = useState(() =>
    createHtmlSurfaceInteractionProjector(),
  );
  const viewportRuntime = useMemo<GpuFlowViewportRuntime>(
    () =>
      createGpuFlowViewportRuntime({
        requestFrame: requestSurfaceFrame,
        store: viewportStore,
      }),
    [requestSurfaceFrame, viewportStore],
  );
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
  const retainedTextLikeRowSnapshotElementByIdRef = useRef(
    new Map<string, HTMLElement>(),
  );
  const [retainedContentSwitchAnimations] = useState(() =>
    createGpuRetainedContentSwitchAnimationStore(),
  );
  const defaultRetainedContentRuntimeStateRef =
    useRef<GpuRetainedContentRuntimeState | null>(null);
  if (!defaultRetainedContentRuntimeStateRef.current) {
    defaultRetainedContentRuntimeStateRef.current =
      createGpuRetainedContentRuntimeState();
  }
  const activeRetainedContentRuntimeState =
    retainedContentRuntimeState ??
    defaultRetainedContentRuntimeStateRef.current;
  const [retainedContentSnapshotScene, setRetainedContentSnapshotScene] =
    useState<GpuFlowScene | undefined>(scene);
  const transformOnlyPaintNodeIdsRef = useRef<Set<string>>(new Set());
  const visibleNodeIdsRef = useRef<ReadonlySet<string>>(new Set());
  nodeResizeRef.current = nodeResize;
  retainedContentInteractionRef.current = retainedContentInteraction;
  const handleRetainedContentSceneChange = useCallback(
    (nextScene: GpuFlowScene | undefined) => {
      setRetainedContentSnapshotScene(nextScene);
    },
    [],
  );
  const nodeResizeEnabled = nodeResize !== false;
  const {
    edgeLabelSourceElement,
    htmlSurfaceNativeVisuals,
    htmlSurfaceOverlays,
    nodeDragPreviewSourceElement,
    nodeResizeOverlaySourceElement,
    retainedTextLikeRowSnapshotSourceElement,
    selectionOverlaySourceElement,
  } = useGpuFlowOverlaySources({
    edgeScene,
    layoutStore,
    retainedTextLikeRowSnapshotElementByIdRef,
    nodeDomTransformSyncCacheRef,
    nodeElementByIdRef,
    nodes,
    primaryNodeId: getGpuFlowSelectionDragPrimaryNodeId(selectionDrag),
    renderRetainedTextLikeRowSnapshot,
    scene: retainedContentSnapshotScene,
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
    viewportRuntime.setFrameRequester(requestSurfaceFrame);
  }, [requestSurfaceFrame, viewportRuntime]);
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
    viewportRuntime.applyViewportCommand(viewport);
  }, [viewport, viewportRuntime]);
  useGpuFlowDebugGlobals({
    activeResizeNodeIdRef,
    containerRef,
    getViewport: () => viewportRuntime.getViewportTuple(),
    interactionDiagnosticsRef,
    nodeInteractionRef,
    nodeLayerRef,
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
      retainedTextLikeRowSnapshotElementByIdRef,
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
  useEffect(() => {
    setRetainedContentSnapshotScene(nodeLayerRef.current.scene);
  }, [scene, activeRetainedContentRuntimeState]);

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
    retainedContentScroll,
    onRetainedContentSceneChange: handleRetainedContentSceneChange,
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
      retainedTextLikeRowSnapshotElementByIdRef.current.clear();
      destroyNodeLayerResources(
        textureManagerRef,
        htmlSurfaceRendererRef,
        retainedContentPageManagerRef,
      );
      viewportRuntime.destroy();
    };
  }, [retainedContentSwitchAnimations, viewportRuntime]);

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
        requestFrame: (reason) => {
          surfaceRef.current?.requestFrame(reason);
        },
        resolveCanvasCursor: (event) => {
          const surfaceElement = containerRef.current ?? runtime.canvas;
          return resolveGpuFlowCanvasCursor({
            event,
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
      const runtimeFrame = viewportRuntime.runFrame(event.timestamp);
      nodeLayerRef.current = {
        ...nodeLayerRef.current,
        viewport: viewportRuntime.getViewportTuple(),
      };
      syncGpuFlowNodeLayerRetainedContentRuntimeState({
        activeRetainedContentRuntimeState,
        nodeLayerRef,
      });
      const viewportFrame =
        event.reasons.includes("viewport") || runtimeFrame.viewportFrame;
      renderGpuFlowNodeLayerFrame({
        callbacksRef,
        canvasSizeRef,
        deferResolutionUpdates:
          viewportFrame || viewportStore.getState().viewportInteractionActive,
        frameReasons: event.reasons,
        frameRef,
        activeResizeNodeIdRef,
        interactionDiagnosticsRef,
        nodeElementByIdRef,
        nodeDomTransformSyncCacheRef,
        nodeInteractionRef,
        nodeLayerRef,
        htmlSurfaceRendererRef,
        retainedContentPageManagerRef,
        retainedTextLikeRowSnapshotElementByIdRef,
        retainedContentSwitchAnimations,
        runtime,
        surfaceRef,
        textureManagerRef,
        transformOnlyPaintNodeIdsRef,
        visibleNodeIdsRef,
        viewportStore,
        viewportFrame,
      });
      viewportRuntime.applyOverlayTransforms();
      callbacksRef.current.onFrame?.(runtime, event);
    },
    [retainedContentSwitchAnimations, viewportRuntime, viewportStore],
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
            {children}
            <GpuFlowPortalLayer portals={portalGroups.sourceLocal} />
            {edgeLabelSourceElement}
            {selectionOverlaySourceElement}
            {nodeResizeOverlaySourceElement}
            {nodeDragPreviewSourceElement}
            {retainedTextLikeRowSnapshotSourceElement}
          </GpuSurface>
          <GpuFlowRetainedScrollSourceLayerHost
            activeRetainedContentRuntimeState={
              activeRetainedContentRuntimeState
            }
            requestFrame={() => {
              surfaceRef.current?.requestFrame("viewport");
            }}
            retainedContentScroll={retainedContentScroll}
            retainedContentSnapshotScene={retainedContentSnapshotScene}
            viewportRuntime={viewportRuntime}
            viewportStore={viewportStore}
          />
          <GpuFlowDomIslandLayer
            getScene={() => nodeLayerRef.current.scene}
            renderDomIsland={renderDomIsland}
            scene={retainedContentSnapshotScene}
            viewportStore={viewportStore}
            viewportRuntime={viewportRuntime}
          />
          <GpuFlowPortalLayer portals={portalGroups.viewport} />
        </div>
      </GpuFlowSceneContext.Provider>
    </GpuFlowLayoutStoreContext.Provider>
  );
}

function GpuFlowRetainedScrollSourceLayerHost({
  activeRetainedContentRuntimeState,
  requestFrame,
  retainedContentScroll,
  retainedContentSnapshotScene,
  viewportRuntime,
  viewportStore,
}: {
  readonly activeRetainedContentRuntimeState: GpuRetainedContentRuntimeState;
  readonly requestFrame: () => void;
  readonly retainedContentScroll: GpuFlowProps["retainedContentScroll"];
  readonly retainedContentSnapshotScene: GpuFlowScene | undefined;
  readonly viewportRuntime: GpuFlowViewportRuntime;
  readonly viewportStore: NonNullable<GpuFlowProps["viewportStore"]>;
}) {
  if (retainedContentScroll === false || !retainedContentScroll) {
    return null;
  }
  return (
    <GpuFlowRetainedScrollSourceLayer
      onScrollOffsetsCommit={retainedContentScroll.onScrollOffsetsCommit}
      requestFrame={requestFrame}
      runtimeState={activeRetainedContentRuntimeState}
      scene={retainedContentSnapshotScene}
      viewportRuntime={viewportRuntime}
      viewportStore={viewportStore}
    />
  );
}
