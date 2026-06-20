/* global performance */
import { Rectangle } from "pixi.js";
import { Viewport } from "pixi-viewport";
import * as rendererApplication from "./pixi-renderer-application";
import { createWorkflowGraphAnimationCoordinator } from "./pixi-renderer-animation-coordinator";
import { createWorkflowGraphAnimationState } from "./pixi-renderer-animation";
import { createWorkflowGraphCameraFrameControls } from "./pixi-renderer-camera-frame-controls";
import { createWorkflowGraphCameraControls } from "./pixi-renderer-camera-controls";
import { createWorkflowGraphCameraSceneSync } from "./pixi-renderer-camera-scene-sync";
import { createWorkflowGraphCameraSync } from "./pixi-renderer-camera-sync";
import { createSemanticCellAnimationController } from "./pixi-renderer-cell-animation";
import { createRendererContainerFactories } from "./pixi-renderer-container-factories";
import * as rendererDebugSurface from "./pixi-renderer-debug-surface";
import { createWorkflowGraphDebugSnapshot } from "./pixi-renderer-debug-snapshot";
import { createWorkflowGraphDebugMetrics } from "./pixi-renderer-debug-metrics";
import { addWorkflowGraphDomListeners } from "./pixi-renderer-dom-listeners";
import { createWorkflowGraphEdgeSceneRenderer } from "./pixi-renderer-edge-scene";
import { createWorkflowGraphEdgeInteractions } from "./pixi-renderer-edge-interactions";
import { createWorkflowGraphFilterAreaSync } from "./pixi-renderer-filter-areas";
import { foundationStyleForGraph, syncRendererFoundationStyle } from "./pixi-renderer-foundation";
import { createWorkflowGraphFrameOwner } from "./pixi-renderer-frame-owner";
import { createWorkflowGraphFrameRuntime } from "./pixi-renderer-frame-runtime";
import { createDynamicCanvasContextMenuHandler, rendererHandlers } from "./pixi-renderer-handlers";
import { createWorkflowGraphInteractionScheduler } from "./pixi-renderer-interaction-scheduler";
import * as rendererLabelFont from "./pixi-renderer-label-font";
import { createWorkflowGraphLabelManager } from "./pixi-renderer-labels";
import { destroyInitializedApp } from "./pixi-renderer-lifecycle";
import { createWorkflowGraphRendererLayers } from "./pixi-renderer-layer-setup";
import {
  createNodeGeometryContextFactory,
  drawWorkspaceBackdrop,
  drawWorkspaceGrid,
  drawWorkspaceVignette,
  workspaceGridBoundsForNodes,
} from "./pixi-renderer-node-geometry";
import { createWorkflowGraphNodeOpenClickTracker } from "./pixi-renderer-node-open-click-tracker";
import { createWorkflowGraphSceneGraphUpdater } from "./pixi-renderer-scene-graph";
import { createWorkflowGraphSpatialQueries } from "./pixi-renderer-spatial-queries";
import { createWorkflowGraphTrajectoryRuntime } from "./pixi-renderer-trajectory-runtime";
import {
  cameraState,
  commitEdgeConnection,
  configureViewportNavigation,
  createPortVisualStateSync,
  drawMarqueeSelection,
  drawTemporaryEdge,
  edgeConnection,
  hostScreenSize,
  hitTestPortCandidateAtScreen,
  hitTestTopNodeAtScreen,
  interactivePortsForNode,
  marqueeBounds,
  notifyNodeSelectionChange,
  parsePortKey,
  portKey,
  portWorldPosition,
  releasePointer,
  requireWorkflowGraphNode,
  screenPointFromPointer,
  setsEqual,
} from "./pixi-renderer-helpers";
import * as rendererInputHandlers from "./pixi-renderer-input-handlers";
import { createWorkflowGraphNodeDragController } from "./pixi-renderer-node-drag";
import { rendererOptionsWithDefaults, workflowGraphRendererLimits } from "./pixi-renderer-options";
import { observeWorkflowGraphRendererResize } from "./pixi-renderer-resize-observer";
import { createWorkflowGraphSceneVisitCounters } from "./pixi-renderer-scene-visit-counters";
import { createWorkflowGraphWheelHandler } from "./pixi-renderer-wheel-handler";
import { createWorkflowGraphWheelResponsivenessTracker } from "./pixi-renderer-wheel-responsiveness";
const limits = workflowGraphRendererLimits;
let nextRendererInstanceId = 1;
export async function createWorkflowGraphRenderer(options) {
  const {
    abortSignal,
    animationEnabled,
    debugEnabled,
    debugSurfaceId,
    graph,
    host: initialHost,
    initialCameraState,
    onCameraStateChange,
    onCanvasContextMenu,
    onEdgeCreate,
    onEdgeDelete,
    onEdgeSelectionChange,
    onNodeDelete,
    onNodeOpen,
    onNodePositionsChange,
    onNodeSelectionChange,
    reactRenderCount,
    reduceMotion,
  } = rendererOptionsWithDefaults(options);
  let host = initialHost;
  const rendererInstanceId = nextRendererInstanceId++;
  let foundationStyle = foundationStyleForGraph(graph);
  let backgroundColor = foundationStyle.background;
  const { app, loadedNodeLabelFont, screenSize } =
    await rendererApplication.initializeWorkflowGraphApplication({
      abortSignal,
      backgroundColor,
      host,
    });
  rendererApplication.attachWorkflowGraphCanvas(host, app.canvas);
  const debugMetrics = createWorkflowGraphDebugMetrics({ app, enabled: debugEnabled });
  const interactionScheduler = createWorkflowGraphInteractionScheduler({ debugMetrics });
  const viewport = new Viewport({
    events: app.renderer.events,
    screenHeight: screenSize.height,
    screenWidth: screenSize.width,
    worldHeight: 4000,
    worldWidth: 4000,
  });
  viewport.forceHitArea = new Rectangle(0, 0, screenSize.width, screenSize.height);
  configureViewportNavigation(viewport, initialCameraState, limits);
  const layers = createWorkflowGraphRendererLayers({ app, foundationStyle, viewport });
  let backdropGradient = layers.backdropGradient;
  const {
    animatedGlow,
    backdrop,
    backgroundLayer,
    cellAnimationGraphics,
    edgeFlowGraphics,
    edgeGraphics,
    edgeHighlightGraphics,
    edgeLabelLayer,
    edgeLayer,
    effectsLayer,
    filteredGraphics,
    grid,
    interactionLayer,
    labelLayer,
    marqueeGraphics,
    nodeGlowLayer,
    nodeLayer,
    staticGlow,
    temporaryEdgeGraphics,
    trajectoryLayer,
    vignette,
    vignetteGradient,
  } = layers;
  const handlers = rendererHandlers({
    onCameraStateChange,
    onCanvasContextMenu,
    onEdgeCreate,
    onEdgeDelete,
    onEdgeSelectionChange,
    onNodeDelete,
    onNodeOpen,
    onNodePositionsChange,
    onNodeSelectionChange,
    reactRenderCount,
  });
  const nodes = [];
  const nodesById = new Map();
  const edges = [];
  const sceneVisitCounters = createWorkflowGraphSceneVisitCounters();
  const spatialQueries = createWorkflowGraphSpatialQueries({
    nodes,
    sceneVisitCounters,
    viewport,
  });
  const nodeGeometry = createNodeGeometryContextFactory();
  const nodeActivityMarkers = new Map();
  const nodeContainers = new Map();
  const nodeDiagnosticMarkers = new Map();
  const nodeBodies = new Map();
  const nodeShadows = new Map();
  const nodeLabels = new Map();
  const nodeLabelFontSizeModes = new Map();
  const nodeLabelVisibilityReasons = new Map();
  const nodeOutlines = new Map();
  const portVisuals = new Map();
  const portVisualStates = new Map();
  const selectedNodeIds = new Set();
  const requireNode = (nodeId) => requireWorkflowGraphNode(nodesById, nodeId);
  const setPortVisualState = createPortVisualStateSync({
    getNode: requireNode,
    portVisuals,
    portVisualStates,
  });
  const labels = createWorkflowGraphLabelManager({
    debugMetrics,
    getNode: (nodeId) => nodesById.get(nodeId) ?? null,
    labelLayer,
    loadedNodeLabelFont,
    nodeLabels,
    nodeLabelFontSizeModes,
    nodeLabelVisibilityReasons,
    sceneVisitCounters,
    selectedNodeIds,
    spatialQueries,
    viewport,
  });
  const containerFactories = createRendererContainerFactories({
    drawingEdgeActive: () => Boolean(drawingEdge),
    nodeActivityMarkers,
    nodeBodies,
    nodeDiagnosticMarkers,
    nodeGeometry,
    nodeOutlines,
    nodeShadows,
    onNodePointerOut: () => setHoveredNodeId(null),
    onNodePointerOver: (nodeId) => setHoveredNodeId(nodeId),
    portHitRadius: limits.portHitRadiusScreen,
    portVisuals,
    portVisualStates,
    setPortVisualState,
  });
  const sceneGraph = createWorkflowGraphSceneGraphUpdater({
    acquireLabel: labels.acquireLabel,
    createNodeContainer: containerFactories.nodeContainer,
    debugMetrics,
    edges,
    nodeActivityMarkers,
    nodeBodies,
    nodeContainers,
    nodeDiagnosticMarkers,
    nodeLayer,
    nodeOutlines,
    nodesById,
    nodeShadows,
    nodes,
    portVisuals,
    portVisualStates,
    deactivateLabel: labels.deactivateLabel,
    destroyLabel: labels.destroyLabel,
    requireNodeLabel: labels.requireNodeLabel,
    spatialQueries,
  });
  const hoveredNodeIds = new Set();
  let drawingEdge = null;
  let [drawingMarquee, panningCamera, activeTargetPortKey] = [null, null, null];
  let destroyed = false;
  let edgeRedrawCount = 0;
  let [marqueeUpdateCount, edgeCommitCount, nextEdgeSequence] = [0, 0, 1];
  let [pointerPanUpdateCount, selectionChangeCount, temporaryEdgeUpdateCount] = [0, 0, 0];
  let [wheelPanUpdateCount, wheelZoomUpdateCount, gridDrawCount] = [0, 0, 0];
  let nodeOutlineVisibilityUpdateCount = 0;
  let currentWorkflow = graph.workflow ?? null;
  const workflowTransitionHistory = [];
  let rendererDestroyCount = 0;
  const inputResponsiveness = createWorkflowGraphWheelResponsivenessTracker();
  const nodeOpenClickTracker = createWorkflowGraphNodeOpenClickTracker({ limits });
  const inputResponsivenessRenderProbe = {
    postrender() {
      inputResponsiveness.recordPixiRenderFrame(performance.now());
    },
  };
  app.renderer.runners.postrender.add(inputResponsivenessRenderProbe);
  const filterAreas = createWorkflowGraphFilterAreaSync({
    debugMetrics,
    filteredGraphics,
    sceneVisitCounters,
    viewport,
  });
  let edgeScene = null;
  const edgeInteractions = createWorkflowGraphEdgeInteractions({
    edges,
    getNode: requireNode,
    onSelectionChange: (edgeIds) => {
      if (handlers.onEdgeSelectionChange) {
        handlers.onEdgeSelectionChange([...edgeIds]);
      }
    },
    redrawHighlights: () => edgeScene?.redrawEdgeHighlights(),
    viewport,
  });
  edgeScene = createWorkflowGraphEdgeSceneRenderer({
    debugMetrics,
    edgeGraphics,
    edgeHighlightGraphics,
    edgeLabelLayer,
    edgeSelection: edgeInteractions,
    edges,
    fontFamily: loadedNodeLabelFont.fontFamily,
    fontSize: rendererLabelFont.compactSelectedNodeLabelBitmapFontSize,
    getNode: requireNode,
    hoveredNodeIds,
    sceneVisitCounters,
    sceneGraph,
    selectedNodeIds,
    validateGlyphs: rendererLabelFont.validateNodeLabelGlyphs,
    viewport,
  });
  const animationState = createWorkflowGraphAnimationState({
    animationEnabled,
    reduceMotion,
  });
  const cellAnimation = createSemanticCellAnimationController({
    cellAnimationGraphics,
    getNode: (nodeId) => nodesById.get(nodeId) ?? null,
    nodeContainers,
  });
  const animationCoordinator = createWorkflowGraphAnimationCoordinator({
    animatedGlow,
    animationState,
    cellAnimation,
    debugMetrics,
    edgeFlowGraphics,
    edges,
    getNode: requireNode,
    sceneVisitCounters,
    spatialQueries,
    staticGlow,
  });
  const nodeDrag = createWorkflowGraphNodeDragController({
    animationCoordinator,
    handlers,
    labels,
    nodeBodies,
    nodeContainers,
    nodeOpenClickTracker,
    nodes,
    nodesById,
    redrawEdges,
    requireNode,
    sceneGraph,
    selectOnlyNode,
    selectedNodeIds,
    spatialQueries,
    viewport,
  });
  const syncVisibleSceneForCamera = createWorkflowGraphCameraSceneSync({
    drawAllNodeOutlines,
    edgeScene,
    redrawEdges,
    sceneGraph,
  });
  const cameraSync = createWorkflowGraphCameraSync({
    animationCoordinator,
    debugMetrics,
    handlers,
    inputResponsiveness,
    interactionScheduler,
    labelLayer,
    labels,
    sceneVisitCounters,
    syncFilterAreas: filterAreas.sync,
    syncVisibleScene: syncVisibleSceneForCamera,
    viewport,
  });
  const trajectoryRuntime = createWorkflowGraphTrajectoryRuntime({
    cameraSync,
    debugMetrics,
    getNode: (nodeId) => nodesById.get(nodeId) ?? null,
    interactionScheduler,
    loadedNodeLabelFont,
    trajectoryLayer,
    viewport,
  });
  const cameraControls = createWorkflowGraphCameraControls({
    cameraSync,
    getHost: () => host,
    limits,
    nodes,
    viewport,
  });
  const frameRuntime = createWorkflowGraphFrameRuntime({
    animationCoordinator,
    animationState,
    cameraSync,
    interactionScheduler,
    isDirectManipulationActive: () => Boolean(nodeDrag.active() || drawingEdge || drawingMarquee),
    replaceSceneGraph,
    sceneVisitCounters,
    trajectoryRuntime,
    viewport,
  });
  const frameOwner = createWorkflowGraphFrameOwner({
    app,
    onFrame: frameRuntime.runFrame,
    shouldContinue: frameRuntime.shouldContinue,
  });
  const cameraFrameControls = createWorkflowGraphCameraFrameControls({
    cameraControls,
    requestFrame: (reason) => frameOwner.request(reason),
  });
  filterAreas.sync({ force: true });
  drawWorkspaceBackdrop(backdrop, screenSize, foundationStyle);
  redrawGridForNodes(graph.nodes);
  drawWorkspaceVignette(vignette, screenSize, vignetteGradient, foundationStyle);
  replaceSceneGraph(graph, { countUpdate: false });
  const resizeObserver = observeWorkflowGraphRendererResize({
    app,
    backdrop,
    getFoundationStyle: () => foundationStyle,
    host,
    isDestroyed: () => destroyed,
    labels,
    onResize: () => {
      filterAreas.sync({ force: true });
      frameOwner.request("resize");
    },
    vignette,
    vignetteGradient,
    viewport,
  });
  const pointerDown = rendererInputHandlers.createWorkflowGraphPointerDownHandler({
    canvas: app.canvas,
    clearLastNodeClick: nodeOpenClickTracker.clear,
    clearSelection,
    edgeInteractions,
    handlers,
    hitTestNodeAtScreen: (screen) => hitTestTopNodeAtScreen(spatialQueries, screen),
    hitTestPortAtScreen,
    repeatedNodeOpenRequested: (nodeId, screen) =>
      handlers.onNodeOpen !== null && nodeOpenClickTracker.repeatedOpenRequested(nodeId, screen),
    selectOnlyNode,
    setSelectedNodeIds,
    startCameraPanning,
    startEdgeDrawing,
    startMarqueeSelection,
    startNodeDragging: nodeDrag.start,
    toggleNodeSelection,
  });
  const pointerMove = (event) => {
    const screen = screenPointFromPointer(app.canvas, event);
    if (drawingEdge) {
      const world = viewport.toWorld(screen);
      drawingEdge.endX = world.x;
      drawingEdge.endY = world.y;
      temporaryEdgeUpdateCount += 1;
      updateActiveTargetPort(screen);
      drawTemporaryEdge(temporaryEdgeGraphics, drawingEdge);
      return;
    }
    if (drawingMarquee) {
      updateMarqueeSelection(screen);
      return;
    }
    if (nodeDrag.active()) {
      nodeDrag.move(screen);
      return;
    }
    if (panningCamera) {
      moveCameraPan(screen);
      return;
    }
    syncHoverAtScreen(screen);
  };
  const pointerUp = (event) => {
    if (drawingEdge) {
      const targetPort =
        event && typeof event.clientX === "number"
          ? hitTestPortAtScreen(screenPointFromPointer(app.canvas, event), {
              excludeNodeId: drawingEdge.sourceNodeId,
              role: "target",
            })
          : null;
      if (targetPort) {
        commitEdge(drawingEdge, targetPort);
      }
      finishEdgeDrawing();
      releasePointer(event);
      return;
    }
    if (drawingMarquee) {
      commitMarqueeSelection();
      releasePointer(event);
      return;
    }
    if (nodeDrag.active()) {
      nodeDrag.finish();
      releasePointer(event);
      return;
    }
    if (panningCamera) {
      cameraSync.endCameraInteraction({ interactionKind: "pointer-pan" });
      panningCamera = null;
      viewport.plugins.resume("decelerate");
      releasePointer(event);
    }
  };
  const pointerCancel = (event) => {
    if (drawingEdge) {
      finishEdgeDrawing();
      releasePointer(event);
      return;
    }
    if (drawingMarquee) {
      cancelMarqueeSelection();
      releasePointer(event);
      return;
    }
    if (nodeDrag.active()) {
      nodeDrag.cancel();
      releasePointer(event);
      return;
    }
    pointerUp(event ?? null);
  };
  const pointerLeave = () => {
    setHoveredNodeId(null);
    edgeInteractions.setHovered(null);
  };
  const wheel = createWorkflowGraphWheelHandler({
    canvas: app.canvas,
    inputResponsiveness,
    interactionsBlockWheel: () => Boolean(drawingEdge || drawingMarquee || nodeDrag.active()),
    panCameraByScreenDelta: cameraFrameControls.panCameraByScreenDelta,
    recordWheelPan: () => {
      wheelPanUpdateCount += 1;
    },
    recordWheelZoom: () => {
      wheelZoomUpdateCount += 1;
    },
    viewport,
    zoomCameraAtScreen: cameraFrameControls.zoomCameraAtScreen,
  });
  const contextMenu = createDynamicCanvasContextMenuHandler({
    canvas: app.canvas,
    handlers,
    viewport,
  });
  const keyDown = rendererInputHandlers.createWorkflowGraphKeyDownHandler({
    cancelMarqueeSelection,
    clearSelection,
    edgeInteractions,
    finishEdgeDrawing,
    handlers,
    isDrawingEdge: () => Boolean(drawingEdge),
    isDrawingMarquee: () => Boolean(drawingMarquee),
    isDraggingNode: nodeDrag.active,
    isPanningCamera: () => Boolean(panningCamera),
    selectedNodeIds,
  });
  const removeDomListeners = addWorkflowGraphDomListeners({
    canvas: app.canvas,
    contextMenu,
    keyDown,
    pointerCancel,
    pointerDown,
    pointerLeave,
    pointerMove,
    pointerUp,
    wheel,
  });
  const debugAnimationFrameRenderer =
    rendererDebugSurface.createWorkflowGraphDebugAnimationFrameRenderer({
      animationCoordinator,
      animationState,
      app,
      frameOwner,
    });
  const unregisterDebugSurface = rendererDebugSurface.registerWorkflowGraphDebugSurfaceIfEnabled({
    debugEnabled,
    debugSurfaceId,
    fitToGraph: cameraFrameControls.fitCameraToGraph,
    getSnapshot: createWorkflowGraphDebugSnapshot({
      app,
      backgroundColor: () => backgroundColor,
      debugSurfaceId,
      edges,
      loadedNodeLabelFont,
      nodeBodies,
      nodeContainers,
      nodeLabels,
      nodeLabelFontSizeModes,
      nodeLabelVisibilityReasons,
      nodeGeometryContextCounts: nodeGeometry.counts,
      nodeOutlines,
      nodes,
      nodeShadows,
      portVisuals,
      reactRenderCount: () => handlers.reactRenderCount(),
      recentFrameMs: frameRuntime.recentFrameMs,
      debugMetrics,
      sceneVisitCounters,
      // prettier-ignore
      displayObjectLayers: {
        background: backgroundLayer, edge: edgeLayer, edgeLabels: edgeLabelLayer,
        effects: effectsLayer, interaction: interactionLayer, labels: labelLayer, nodeGlow: nodeGlowLayer,
        nodes: nodeLayer, stage: app.stage, trajectory: trajectoryLayer, viewport,
      },
      // prettier-ignore
      renderState: () => ({
        canvasCreationCount: 1, drawingEdge: Boolean(drawingEdge),
        drawingMarquee: Boolean(drawingMarquee), edgeCommitCount, edgeRedrawCount,
        edgeSelectionChangeCount: edgeInteractions.selectionChangeCount(),
        gridDrawCount, labelSyncCount: labels.syncCount(), marqueeUpdateCount,
        nodeOutlineVisibilityUpdateCount, pointerPanUpdateCount,
        rendererDestroyCount, rendererInstanceId, selectedNodeId: selectedNodeIds.values().next().value ?? null,
        selectedEdgeId: edgeInteractions.firstSelectedEdgeId(), selectedEdgeIds: edgeInteractions.selectedEdgeIds, selectedNodeIds,
        selectionChangeCount, temporaryEdgeUpdateCount, wheelPanUpdateCount, wheelZoomUpdateCount,
        workflow: currentWorkflow, workflowTransitionHistory: [...workflowTransitionHistory],
        ...nodeDrag.debugSnapshot(), ...edgeScene.debugSnapshot(), ...cameraSync.debugSnapshot(), ...filterAreas.debugSnapshot(),
        ...labels.debugSnapshot(), ...frameRuntime.debugSnapshot(),
        ...frameOwner.debugSnapshot(), ...interactionScheduler.debugSnapshot(), ...animationCoordinator.debugSnapshot(),
        ...trajectoryRuntime.debugSnapshot(), ...animationState.debugSnapshot(), ...inputResponsiveness.debugSnapshot(),
        ...sceneGraph.debugSnapshot(), ...sceneGraph.updateCounts(),
      }),
      spatialQueries,
      viewport,
    }),
    releaseAnimationFrame: debugAnimationFrameRenderer.releaseAnimationFrame,
    renderAnimationFrame: debugAnimationFrameRenderer.renderAnimationFrame,
  });
  return {
    cameraState: () => cameraState(viewport),
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      rendererDestroyCount += 1;
      frameOwner.destroy();
      resizeObserver.disconnect();
      removeDomListeners();
      unregisterDebugSurface?.();
      app.renderer.runners.postrender.remove(inputResponsivenessRenderProbe);
      debugMetrics.destroy();
      vignette.clear();
      vignetteGradient.destroy();
      sceneGraph.destroy();
      trajectoryRuntime.destroy();
      destroyInitializedApp(app);
    },
    activate: () => frameOwner.release("activate"),
    isCameraMoving: () => cameraSync.isCameraMoving(),
    resize: () => {
      resizeObserver.resizeNow();
      frameOwner.request("resize");
    },
    setHandlers: (nextHandlers) => void Object.assign(handlers, rendererHandlers(nextHandlers)),
    suspend: () => frameOwner.suspend("suspend"),
    transferHost: (nextHost) => {
      if (host === nextHost) {
        return;
      }
      host = nextHost;
      rendererApplication.attachWorkflowGraphCanvas(host, app.canvas);
      resizeObserver.transferHost(host);
      frameOwner.request("host-transfer");
    },
    updateGraph: (nextGraph) => {
      const applied = frameRuntime.queueOrApplyGraphUpdate(nextGraph);
      if (!applied) {
        frameOwner.request("deferred-graph-update");
      }
    },
    updateTrajectoryRuntime: (frame) => {
      trajectoryRuntime.updateFrame(frame);
      frameOwner.request("trajectory-update");
    },
  };
  function replaceSceneGraph(nextGraph, { countUpdate }) {
    interactionScheduler.runLane("background-recompute", () => {
      if (destroyed) {
        return;
      }
      cancelActiveInteractionsForGraphUpdate();
      syncFoundationStyle(nextGraph);
      const update = sceneGraph.replaceGraph(nextGraph, { countUpdate });
      currentWorkflow = update.workflow;
      recordWorkflowTransition(currentWorkflow, countUpdate ? "graph-update" : "initial-graph");
      nextEdgeSequence = update.nextEdgeSequence;
      spatialQueries.rebuild(nodes);
      sceneGraph.resetVisibleScene();
      sceneGraph.syncVisibleScene({ force: true });
      nodeDrag.syncNodeBodyCursors();
      labels.resetVisibleLabels();
      animationCoordinator.resetVisibility();
      animationCoordinator.syncActiveSet();
      trajectoryRuntime.syncPositions();
      pruneSelectionForNodes(nodes);
      edgeInteractions.prune(edges);
      redrawGridForNodes(nodes);
      drawAllNodeOutlines();
      labels.syncVisibleLabels();
      redrawEdges();
      frameOwner.request(countUpdate ? "graph-update" : "initial-graph");
    });
  }
  function syncFoundationStyle(nextGraph) {
    const update = syncRendererFoundationStyle({
      app,
      backdrop,
      backdropGradient,
      foundationStyle,
      grid,
      host,
      nextGraph,
    });
    if (!update.changed) {
      return;
    }
    foundationStyle = update.foundationStyle;
    backgroundColor = update.backgroundColor;
    backdropGradient = update.backdropGradient;
    drawWorkspaceVignette(vignette, hostScreenSize(host), vignetteGradient, foundationStyle);
    gridDrawCount += 1;
  }
  function cancelActiveInteractionsForGraphUpdate() {
    if (panningCamera) {
      cameraSync.endCameraInteraction({ interactionKind: "pointer-pan" });
    }
    drawingEdge = null;
    drawingMarquee = null;
    nodeDrag.clearForGraphUpdate();
    panningCamera = null;
    activeTargetPortKey = null;
    temporaryEdgeGraphics.clear();
    marqueeGraphics.clear();
    viewport.plugins.resume("decelerate");
  }
  function pruneSelectionForNodes(nextNodes) {
    const nextNodeIds = new Set(nextNodes.map((node) => node.id));
    const previousSelectedNodeIds = new Set(selectedNodeIds);
    for (const nodeId of previousSelectedNodeIds) {
      if (!nextNodeIds.has(nodeId)) {
        selectedNodeIds.delete(nodeId);
      }
    }
    for (const nodeId of [...hoveredNodeIds]) {
      if (!nextNodeIds.has(nodeId)) {
        hoveredNodeIds.delete(nodeId);
      }
    }
    if (!setsEqual(previousSelectedNodeIds, selectedNodeIds)) {
      selectionChangeCount += 1;
      edgeScene.redrawEdgeHighlights();
      notifyNodeSelectionChange(handlers.onNodeSelectionChange, selectedNodeIds);
    }
  }
  function recordWorkflowTransition(workflow, reason) {
    workflowTransitionHistory.push(workflowTransitionSnapshot(workflow, reason));
    if (workflowTransitionHistory.length > 16) {
      workflowTransitionHistory.shift();
    }
  }
  function workflowTransitionSnapshot(workflow, reason) {
    const at = Math.round(performance.now());
    if (!workflow) {
      return {
        at,
        definitionId: "",
        editable: null,
        executionId: "",
        reason,
        versionId: "",
        viewMode: "",
      };
    }
    return {
      at,
      definitionId: workflow.definitionId,
      editable: workflow.editable,
      executionId: workflow.executionId,
      reason,
      versionId: workflow.definitionVersionId,
      viewMode: workflow.viewMode,
    };
  }
  function startCameraPanning(screen) {
    panningCamera = {
      lastX: screen.x,
      lastY: screen.y,
    };
    cameraSync.beginCameraInteraction({ interactionKind: "pointer-pan" });
    viewport.plugins.pause("decelerate");
  }
  function moveCameraPan(screen) {
    if (!panningCamera) {
      return;
    }
    const deltaX = screen.x - panningCamera.lastX;
    const deltaY = screen.y - panningCamera.lastY;
    panningCamera.lastX = screen.x;
    panningCamera.lastY = screen.y;
    cameraFrameControls.panCameraByScreenDelta(-deltaX, -deltaY, {
      interactionKind: "pointer-pan",
    });
    pointerPanUpdateCount += 1;
  }
  function selectOnlyNode(nodeId) {
    edgeInteractions.clearSelection();
    setSelectedNodeIds([nodeId]);
  }
  function clearSelection() {
    edgeInteractions.clearSelection();
    setSelectedNodeIds([]);
  }
  function toggleNodeSelection(nodeId) {
    edgeInteractions.clearSelection();
    const nextSelectedNodeIds = new Set(selectedNodeIds);
    if (nextSelectedNodeIds.has(nodeId)) {
      nextSelectedNodeIds.delete(nodeId);
    } else {
      nextSelectedNodeIds.add(nodeId);
    }
    setSelectedNodeIds(nextSelectedNodeIds);
  }
  function setSelectedNodeIds(nextNodeIds) {
    const nextSelectedNodeIds = new Set(nextNodeIds);
    if (setsEqual(selectedNodeIds, nextSelectedNodeIds)) {
      return;
    }
    selectedNodeIds.clear();
    for (const nodeId of nextSelectedNodeIds) {
      selectedNodeIds.add(nodeId);
    }
    selectionChangeCount += 1;
    drawAllNodeOutlines();
    edgeScene.redrawEdgeHighlights();
    labels.syncLabelVisibility();
    notifyNodeSelectionChange(handlers.onNodeSelectionChange, selectedNodeIds);
  }
  function drawAllNodeOutlines() {
    for (const candidate of nodes) {
      syncNodeOutlineVisibility(candidate.id);
    }
  }
  function syncHoverAtScreen(screen) {
    interactionScheduler.runLane("hover-selection-feedback", () => {
      const nodeId = hitTestTopNodeAtScreen(spatialQueries, screen)?.id ?? null;
      setHoveredNodeId(nodeId);
      edgeInteractions.setHovered(
        nodeId === null ? (edgeInteractions.hitTestAtScreen(screen)?.id ?? null) : null,
      );
    });
  }
  function setHoveredNodeId(nodeId) {
    const nextHoveredNodeIds = new Set(nodeId ? [nodeId] : []);
    if (setsEqual(hoveredNodeIds, nextHoveredNodeIds)) {
      return;
    }
    const affectedNodeIds = new Set([...hoveredNodeIds, ...nextHoveredNodeIds]);
    hoveredNodeIds.clear();
    for (const hoveredNodeId of nextHoveredNodeIds) {
      hoveredNodeIds.add(hoveredNodeId);
    }
    for (const affectedNodeId of affectedNodeIds) {
      syncNodeOutlineVisibility(affectedNodeId);
    }
    edgeScene.redrawEdgeHighlights();
  }
  function syncNodeOutlineVisibility(nodeId) {
    const outlines = nodeOutlines.get(nodeId);
    if (!outlines) {
      return;
    }
    const selected = selectedNodeIds.has(nodeId);
    const hovered = hoveredNodeIds.has(nodeId);
    outlines.selectedOutline.visible = selected;
    outlines.hoverOutline.visible = !selected && hovered;
    nodeOutlineVisibilityUpdateCount += 1;
  }
  function redrawEdges() {
    edgeScene.redrawEdges();
    edgeRedrawCount += 1;
  }
  function startEdgeDrawing(sourceNodeId, sourcePortId) {
    const source = requireNode(sourceNodeId);
    sceneGraph.ensureNodeMaterialized(sourceNodeId);
    const start = portWorldPosition(source, sourcePortId);
    drawingEdge = {
      endX: start.x,
      endY: start.y,
      sourceNodeId,
      sourcePortId,
      startX: start.x,
      startY: start.y,
    };
    selectOnlyNode(sourceNodeId);
    viewport.plugins.pause("decelerate");
    setPortVisualState(sourceNodeId, sourcePortId, "active");
    temporaryEdgeUpdateCount += 1;
    drawTemporaryEdge(temporaryEdgeGraphics, drawingEdge);
  }
  function finishEdgeDrawing() {
    drawingEdge = null;
    activeTargetPortKey = null;
    temporaryEdgeGraphics.clear();
    viewport.plugins.resume("decelerate");
    for (const node of nodes) {
      for (const port of interactivePortsForNode(node)) {
        setPortVisualState(node.id, port.id, "idle");
      }
    }
  }
  function startMarqueeSelection(screen) {
    const world = viewport.toWorld(screen);
    drawingMarquee = {
      endX: world.x,
      endY: world.y,
      startX: world.x,
      startY: world.y,
    };
    viewport.plugins.pause("decelerate");
    marqueeUpdateCount += 1;
    drawMarqueeSelection(marqueeGraphics, drawingMarquee);
  }
  function updateMarqueeSelection(screen) {
    if (!drawingMarquee) {
      return;
    }
    const world = viewport.toWorld(screen);
    drawingMarquee.endX = world.x;
    drawingMarquee.endY = world.y;
    marqueeUpdateCount += 1;
    drawMarqueeSelection(marqueeGraphics, drawingMarquee);
  }
  function commitMarqueeSelection() {
    if (!drawingMarquee) {
      return;
    }
    const bounds = marqueeBounds(drawingMarquee);
    const candidateNodeIds = spatialQueries.marqueeCandidateIds(bounds);
    const intersectingNodeIds = nodes
      .filter((node) => candidateNodeIds.has(node.id))
      .map((node) => node.id);
    edgeInteractions.clearSelection();
    setSelectedNodeIds(intersectingNodeIds);
    finishMarqueeSelection();
  }
  function cancelMarqueeSelection() {
    if (!drawingMarquee) {
      return;
    }
    finishMarqueeSelection();
  }
  function finishMarqueeSelection() {
    drawingMarquee = null;
    marqueeGraphics.clear();
    marqueeUpdateCount += 1;
    viewport.plugins.resume("decelerate");
  }
  function updateActiveTargetPort(screen) {
    const targetPort = hitTestPortAtScreen(screen, {
      excludeNodeId: drawingEdge?.sourceNodeId ?? null,
      role: "target",
    });
    const nextKey = targetPort ? portKey(targetPort.nodeId, targetPort.portId) : null;
    if (nextKey === activeTargetPortKey) {
      return;
    }
    if (activeTargetPortKey) {
      const previous = parsePortKey(activeTargetPortKey);
      setPortVisualState(previous.nodeId, previous.portId, "idle");
    }
    activeTargetPortKey = nextKey;
    if (targetPort) {
      setPortVisualState(targetPort.nodeId, targetPort.portId, "target");
    }
  }
  function commitEdge(edgeDrawing, targetPort) {
    const connection = edgeConnection(edgeDrawing, targetPort);
    commitEdgeConnection(connection, {
      edges,
      onEdgeCreate: handlers.onEdgeCreate,
      redrawEdges,
      sequence: nextEdgeSequence,
    });
    nextEdgeSequence += 1;
    edgeCommitCount += 1;
  }
  function hitTestPortAtScreen(screen, { excludeNodeId, role }) {
    return hitTestPortCandidateAtScreen({
      excludeNodeId,
      portHitRadiusScreen: limits.portHitRadiusScreen,
      role,
      screen,
      spatialQueries,
      viewport,
    });
  }
  function redrawGridForNodes(gridNodes) {
    debugMetrics.measure("grid-redraw", () => {
      drawWorkspaceGrid(grid, foundationStyle, workspaceGridBoundsForNodes(gridNodes));
    });
    gridDrawCount += 1;
  }
}
