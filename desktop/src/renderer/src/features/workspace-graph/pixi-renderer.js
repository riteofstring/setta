/* global performance */
import { Rectangle } from "pixi.js";
import { Viewport } from "pixi-viewport";
import * as rendererApplication from "./pixi-renderer-application";
import { createWorkflowGraphAnimationCoordinator } from "./pixi-renderer-animation-coordinator";
import { createWorkflowGraphAnimationState } from "./pixi-renderer-animation";
import { createWorkflowGraphCameraControls } from "./pixi-renderer-camera-controls";
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
import { createDynamicCanvasContextMenuHandler, rendererHandlers } from "./pixi-renderer-handlers";
import { createWorkflowGraphInteractionScheduler } from "./pixi-renderer-interaction-scheduler";
import * as rendererLabelFont from "./pixi-renderer-label-font";
import { createWorkflowGraphLabelManager } from "./pixi-renderer-labels";
import { destroyInitializedApp } from "./pixi-renderer-lifecycle";
import { createWorkflowGraphRendererLayers } from "./pixi-renderer-layer-setup";
import { createWorkflowGraphPerformanceRecorder } from "./pixi-renderer-performance-recorder";
import {
  createNodeGeometryContextFactory,
  drawWorkspaceBackdrop,
  drawWorkspaceGrid,
  drawWorkspaceVignette,
  workspaceGridBoundsForNodes,
} from "./pixi-renderer-node-geometry";
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
  frameSampleStats,
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
import { rendererOptionsWithDefaults, workflowGraphRendererLimits } from "./pixi-renderer-options";
import { observeWorkflowGraphRendererResize } from "./pixi-renderer-resize-observer";
import { createWorkflowGraphWheelHandler } from "./pixi-renderer-wheel-handler";
import { createWorkflowGraphWheelResponsivenessTracker } from "./pixi-renderer-wheel-responsiveness";
const limits = workflowGraphRendererLimits;
let nextRendererInstanceId = 1;
const activeRendererInstancesBySurface = new Map();
export async function createWorkflowGraphRenderer(options) {
  const {
    abortSignal,
    animationEnabled,
    debugEnabled,
    debugSurfaceId,
    graph,
    host,
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
  const rendererInstanceId = nextRendererInstanceId;
  nextRendererInstanceId += 1;
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
  const spatialQueries = createWorkflowGraphSpatialQueries({ nodes, viewport });
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
  let [draggingNode, drawingEdge, lastNodeClick] = [null, null, null];
  let [drawingMarquee, panningCamera, activeTargetPortKey] = [null, null, null];
  let [destroyed, frameCount, lastFrameAt] = [false, 0, performance.now()];
  let [nodeDragUpdateCount, edgeRedrawCount] = [0, 0];
  let [marqueeUpdateCount, edgeCommitCount, nextEdgeSequence] = [0, 0, 1];
  let [pointerPanUpdateCount, selectionChangeCount, temporaryEdgeUpdateCount] = [0, 0, 0];
  let [wheelPanUpdateCount, wheelZoomUpdateCount, gridDrawCount] = [0, 0, 0];
  let nodeOutlineVisibilityUpdateCount = 0;
  let currentWorkflow = graph.workflow ?? null;
  let rendererDestroyCount = 0;
  const recentFrameMs = [];
  const inputResponsiveness = createWorkflowGraphWheelResponsivenessTracker();
  const inputResponsivenessRenderProbe = {
    postrender() {
      inputResponsiveness.recordRenderedFrame(performance.now());
    },
  };
  app.renderer.runners.postrender.add(inputResponsivenessRenderProbe);
  const filterAreas = createWorkflowGraphFilterAreaSync({
    debugMetrics,
    filteredGraphics,
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
    spatialQueries,
    staticGlow,
  });
  const cameraSync = createWorkflowGraphCameraSync({
    animationCoordinator,
    debugMetrics,
    handlers,
    inputResponsiveness,
    interactionScheduler,
    labelLayer,
    labels,
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
  const performanceRecorder = createWorkflowGraphPerformanceRecorder({
    enabled: debugEnabled,
    getSample: workflowGraphPerformanceSample,
    surfaceId: debugSurfaceId,
  });
  const cameraControls = createWorkflowGraphCameraControls({
    cameraSync,
    host,
    limits,
    nodes,
    viewport,
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
    onResize: () => filterAreas.sync({ force: true }),
    vignette,
    vignetteGradient,
    viewport,
  });
  registerRendererInstance(debugSurfaceId, rendererInstanceId);
  performanceRecorder.recordLifecycle({
    now: performance.now(),
    reason: "renderer-created",
  });
  const pointerDown = rendererInputHandlers.createWorkflowGraphPointerDownHandler({
    canvas: app.canvas,
    clearLastNodeClick,
    clearSelection,
    edgeInteractions,
    handlers,
    hitTestNodeAtScreen,
    hitTestPortAtScreen,
    repeatedNodeOpenRequested,
    selectOnlyNode,
    setSelectedNodeIds,
    startCameraPanning,
    startEdgeDrawing,
    startMarqueeSelection,
    startNodeDragging,
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
    if (draggingNode) {
      moveDraggedNode(screen);
      return;
    }
    if (panningCamera) {
      moveCameraPan(screen, event);
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
    if (draggingNode) {
      finishNodeDragging();
      releasePointer(event);
      return;
    }
    if (panningCamera) {
      finishCameraPanning(event, "pointer-pan-end");
      releasePointer(event);
    }
  };
  const pointerCancel = (event) => {
    if (drawingMarquee) {
      cancelMarqueeSelection();
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
    interactionsBlockWheel: () => Boolean(drawingEdge || drawingMarquee || draggingNode),
    panCameraByScreenDelta: cameraControls.panCameraByScreenDelta,
    recordWheelPan: () => {
      wheelPanUpdateCount += 1;
    },
    recordWheelInput: (payload) => {
      performanceRecorder.recordInput(payload);
    },
    recordWheelZoom: () => {
      wheelZoomUpdateCount += 1;
    },
    viewport,
    zoomCameraAtScreen: cameraControls.zoomCameraAtScreen,
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
    isDraggingNode: () => Boolean(draggingNode),
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
  app.ticker.add(() => {
    if (destroyed) {
      return;
    }
    const now = performance.now();
    const frameMs = now - lastFrameAt;
    lastFrameAt = now;
    frameCount += 1;
    recentFrameMs.push(frameMs);
    if (recentFrameMs.length > 90) {
      recentFrameMs.shift();
    }
    const nextCameraState = cameraState(viewport);
    if (cameraSync.hasCameraChanged(nextCameraState)) {
      if (
        cameraSync.recordCameraState(nextCameraState, {
          interactionKind: "viewport-plugin",
          moving: true,
          now,
        })
      ) {
        cameraSync.scheduleCameraDependentSync();
      }
    }
    cameraSync.runCameraDependentSyncFrame(now);
    interactionScheduler.runLane(
      "semantic-runtime-visual",
      () => {
        animationCoordinator.tick(now, {
          cameraMotion: cameraSync.isCameraMoving() ? "moving" : "settled",
        });
      },
      { cameraMotion: cameraSync.isCameraMoving() ? "moving" : "settled" },
    );
    trajectoryRuntime.tick(now);
    performanceRecorder.recordFrame({
      cameraMoving: cameraSync.isCameraMoving(),
      frameMs,
      now,
    });
  });
  const debugAnimationFrameRenderer =
    rendererDebugSurface.createWorkflowGraphDebugAnimationFrameRenderer({
      animationCoordinator,
      animationState,
      app,
    });
  const unregisterDebugSurface = rendererDebugSurface.registerWorkflowGraphDebugSurfaceIfEnabled({
    debugEnabled,
    debugSurfaceId,
    fitToGraph: cameraControls.fitCameraToGraph,
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
      recentFrameMs,
      debugMetrics,
      // prettier-ignore
      displayObjectLayers: {
        background: backgroundLayer, edge: edgeLayer, edgeLabels: edgeLabelLayer,
        effects: effectsLayer, interaction: interactionLayer, labels: labelLayer,
        nodeGlow: nodeGlowLayer, nodes: nodeLayer, stage: app.stage,
        trajectory: trajectoryLayer, viewport,
      },
      // prettier-ignore
      renderState: () => ({
        canvasCreationCount: 1, drawingEdge: Boolean(drawingEdge),
        drawingMarquee: Boolean(drawingMarquee), edgeCommitCount, edgeRedrawCount,
        edgeSelectionChangeCount: edgeInteractions.selectionChangeCount(), frameCount,
        gridDrawCount, labelSyncCount: labels.syncCount(), marqueeUpdateCount,
        nodeDragUpdateCount, nodeOutlineVisibilityUpdateCount, pointerPanUpdateCount,
        rendererDestroyCount, rendererInstanceId,
        selectedNodeId: selectedNodeIds.values().next().value ?? null,
        selectedEdgeId: edgeInteractions.firstSelectedEdgeId(),
        selectedEdgeIds: edgeInteractions.selectedEdgeIds, selectedNodeIds,
        selectionChangeCount, temporaryEdgeUpdateCount, wheelPanUpdateCount,
        wheelZoomUpdateCount, workflow: currentWorkflow,
        ...edgeScene.debugSnapshot(),
        ...cameraSync.debugSnapshot(), ...filterAreas.debugSnapshot(), ...labels.debugSnapshot(),
        ...interactionScheduler.debugSnapshot(),
        ...animationCoordinator.debugSnapshot(),
        ...trajectoryRuntime.debugSnapshot(),
        ...animationState.debugSnapshot(), ...inputResponsiveness.debugSnapshot(),
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
      unregisterRendererInstance(debugSurfaceId, rendererInstanceId);
      performanceRecorder.recordLifecycle({
        now: performance.now(),
        reason: "renderer-destroyed",
      });
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
    setHandlers: (nextHandlers) => {
      Object.assign(handlers, rendererHandlers(nextHandlers));
    },
    updateGraph: (nextGraph) => {
      replaceSceneGraph(nextGraph, { countUpdate: true });
    },
    updateTrajectoryRuntime: (frame) => {
      trajectoryRuntime.updateFrame(frame);
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
      nextEdgeSequence = update.nextEdgeSequence;
      spatialQueries.rebuild(nodes);
      sceneGraph.resetVisibleScene();
      sceneGraph.syncVisibleScene({ force: true });
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
    });
  }
  function workflowGraphPerformanceSample({ frameMs, now, reason }) {
    const frameStats = frameSampleStats(recentFrameMs);
    const timing = debugMetrics.snapshot();
    const camera = cameraSync.debugSnapshot();
    const labelsSnapshot = labels.debugSnapshot();
    const sceneSnapshot = sceneGraph.debugSnapshot();
    const scheduler = interactionScheduler.debugSnapshot();
    const wheel = inputResponsiveness.debugSnapshot();
    return {
      at: now,
      animation: {
        ...animationState.debugSnapshot(),
        ...animationCoordinator.debugSnapshot(),
      },
      camera: {
        ...cameraState(viewport),
        ...camera,
      },
      frame: {
        averageFrameMs: frameStats.average,
        frameCount,
        frameMs,
        p95FrameMs: frameStats.p95,
        recentFrameMs: recentFrameMs.slice(-30),
        worstFrameMs: frameStats.worst,
      },
      graph: {
        edgeCount: edges.length,
        labelObjectCount: nodeLabels.size,
        nodeCount: nodes.length,
        portGraphicsCount: portVisuals.size,
        ...sceneSnapshot,
        ...sceneGraph.updateCounts(),
      },
      input: {
        pointerPanUpdateCount,
        wheelInput: {
          ...wheel.wheelInput,
          samples: wheel.wheelInput.samples.slice(-40),
        },
        wheelInputEventCount: wheel.wheelInputEventCount,
        wheelInputGestureCount: wheel.wheelInputGestureCount,
        wheelInputLastEventToSettleRestoreMs: wheel.wheelInputLastEventToSettleRestoreMs,
        wheelInputTailCandidateDurationMs: wheel.wheelInputTailCandidateDurationMs,
        wheelInputTailCandidateEventCount: wheel.wheelInputTailCandidateEventCount,
        wheelPanUpdateCount,
        wheelZoomUpdateCount,
      },
      labels: labelsSnapshot,
      lifecycle: {
        activeRendererInstanceCount: activeRendererInstanceIds(debugSurfaceId).length,
        activeRendererInstanceIds: activeRendererInstanceIds(debugSurfaceId),
        destroyed,
        rendererDestroyCount,
      },
      reason,
      rendererInstanceId,
      scheduler: {
        laneCounts: scheduler.interactionSchedulerLaneCounts,
        lastLanePriority: scheduler.interactionSchedulerLastLanePriority,
        recentLaneRuns: scheduler.interactionSchedulerRecentLaneRuns,
        runCount: scheduler.interactionSchedulerRunCount,
      },
      surfaceId: debugSurfaceId,
      timing: {
        timingBuckets: timing.timingBuckets,
        timingSampleLimit: timing.timingSampleLimit,
        timingSamples: timing.timingSamples.slice(-60),
      },
      trajectory: trajectoryRuntime.debugSnapshot(),
    };
  }
  function syncVisibleSceneForCamera({ force = false, zoomChanged = false } = {}) {
    const update = sceneGraph.syncVisibleScene({ force });
    if (update.changed || zoomChanged || edgeScene.edgeLevelOfDetailChanged()) {
      drawAllNodeOutlines();
      redrawEdges();
    }
    return update.changed;
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
    draggingNode = null;
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
  function startNodeDragging(nodeId, screen) {
    const node = requireNode(nodeId);
    const world = viewport.toWorld(screen);
    if (!selectedNodeIds.has(node.id)) {
      selectOnlyNode(node.id);
    }
    for (const selectedNodeId of selectedNodeIds) {
      sceneGraph.ensureNodeMaterialized(selectedNodeId);
    }
    const draggedNodes = nodes.filter((candidate) => selectedNodeIds.has(candidate.id));
    draggingNode = {
      nodes: draggedNodes.map((candidate) => ({
        nodeId: candidate.id,
        offsetX: world.x - candidate.x,
        offsetY: world.y - candidate.y,
      })),
      moved: false,
      primaryNodeId: node.id,
      startScreenX: screen.x,
      startScreenY: screen.y,
    };
    for (const draggedNode of draggedNodes) {
      const body = nodeBodies.get(draggedNode.id);
      if (body) {
        body.cursor = "grabbing";
      }
    }
    viewport.plugins.pause("decelerate");
  }
  function moveDraggedNode(screen) {
    if (!draggingNode) {
      return;
    }
    const world = viewport.toWorld(screen);
    for (const draggedNode of draggingNode.nodes) {
      const node = requireNode(draggedNode.nodeId);
      const container = nodeContainers.get(draggedNode.nodeId);
      if (!container) {
        throw new Error(`dragged node container is missing: ${draggedNode.nodeId}`);
      }
      node.x = world.x - draggedNode.offsetX;
      node.y = world.y - draggedNode.offsetY;
      container.x = node.x;
      container.y = node.y;
      spatialQueries.updateNode(node);
      labels.syncLabelPosition(node.id);
    }
    animationCoordinator.markStaticGlowDirty();
    animationCoordinator.syncActiveSet({ forceStaticGlow: true });
    draggingNode.moved = true;
    labels.syncLabelVisibility();
    nodeDragUpdateCount += 1;
    redrawEdges();
  }
  function finishNodeDragging() {
    const completedDrag = draggingNode;
    const shouldPersistPositions = completedDrag?.moved === true;
    const movedNodeIds = new Set(completedDrag?.nodes.map((node) => node.nodeId) ?? []);
    viewport.plugins.resume("decelerate");
    draggingNode = null;
    for (const body of nodeBodies.values()) {
      body.cursor = "grab";
    }
    if (shouldPersistPositions && handlers.onNodePositionsChange) {
      clearLastNodeClick();
      handlers.onNodePositionsChange(
        nodes.map((node) => ({
          moved: movedNodeIds.has(node.id),
          nodeId: node.id,
          x: Math.round(node.x),
          y: Math.round(node.y),
        })),
      );
      return;
    }
    if (completedDrag) {
      recordNodeClick(completedDrag.primaryNodeId, {
        x: completedDrag.startScreenX,
        y: completedDrag.startScreenY,
      });
    }
  }
  function repeatedNodeOpenRequested(nodeId, screen) {
    if (handlers.onNodeOpen === null || lastNodeClick === null || lastNodeClick.nodeId !== nodeId) {
      return false;
    }
    const elapsed = performance.now() - lastNodeClick.time;
    const distance = Math.hypot(screen.x - lastNodeClick.x, screen.y - lastNodeClick.y);
    return (
      elapsed <= limits.nodeOpenClickIntervalMs && distance <= limits.nodeOpenClickDistanceScreen
    );
  }
  function recordNodeClick(nodeId, screen) {
    lastNodeClick = {
      nodeId,
      time: performance.now(),
      x: screen.x,
      y: screen.y,
    };
  }
  function clearLastNodeClick() {
    lastNodeClick = null;
  }
  function startCameraPanning(screen, event) {
    const startedAt = performance.now();
    const cameraBefore = cameraState(viewport);
    panningCamera = {
      lastX: screen.x,
      lastY: screen.y,
      startedAt,
      startX: screen.x,
      startY: screen.y,
    };
    cameraSync.beginCameraInteraction({ interactionKind: "pointer-pan" });
    viewport.plugins.pause("decelerate");
    recordGraphInput("pointer-pan-start", {
      cameraAfter: cameraState(viewport),
      cameraBefore,
      cameraChanged: false,
      event: pointerEventDiagnostics(event, startedAt),
      handlerDurationMs: performance.now() - startedAt,
      kind: "pointer-pan",
      screen: pointDiagnostics(screen),
    });
  }
  function moveCameraPan(screen, event) {
    if (!panningCamera) {
      return;
    }
    const startedAt = performance.now();
    const cameraBefore = cameraState(viewport);
    const deltaX = screen.x - panningCamera.lastX;
    const deltaY = screen.y - panningCamera.lastY;
    panningCamera.lastX = screen.x;
    panningCamera.lastY = screen.y;
    const cameraChanged = cameraControls.panCameraByScreenDelta(-deltaX, -deltaY, {
      interactionKind: "pointer-pan",
    });
    const cameraAfter = cameraState(viewport);
    pointerPanUpdateCount += 1;
    recordGraphInput("pointer-pan-move", {
      cameraAfter,
      cameraBefore,
      cameraChanged,
      cameraDelta: cameraStateDelta(cameraBefore, cameraAfter),
      event: pointerEventDiagnostics(event, startedAt),
      handlerDurationMs: performance.now() - startedAt,
      kind: "pointer-pan",
      panCameraDeltaScreen: { x: -deltaX, y: -deltaY },
      screen: pointDiagnostics(screen),
      screenDelta: { x: deltaX, y: deltaY },
    });
  }
  function finishCameraPanning(event, reason) {
    if (!panningCamera) {
      return;
    }
    const startedAt = performance.now();
    const cameraBefore = cameraState(viewport);
    const totalScreenDelta = {
      x: panningCamera.lastX - panningCamera.startX,
      y: panningCamera.lastY - panningCamera.startY,
    };
    const durationMs = startedAt - panningCamera.startedAt;
    cameraSync.endCameraInteraction({ interactionKind: "pointer-pan" });
    panningCamera = null;
    viewport.plugins.resume("decelerate");
    const cameraAfter = cameraState(viewport);
    recordGraphInput(reason, {
      cameraAfter,
      cameraBefore,
      cameraChanged: false,
      cameraDelta: cameraStateDelta(cameraBefore, cameraAfter),
      durationMs,
      event: pointerEventDiagnostics(event, startedAt),
      handlerDurationMs: performance.now() - startedAt,
      kind: "pointer-pan",
      totalScreenDelta,
    });
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
      const nodeId = hitTestNodeAtScreen(screen)?.id ?? null;
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
  function hitTestNodeAtScreen(screen) {
    return hitTestTopNodeAtScreen(spatialQueries, screen);
  }
  function redrawGridForNodes(gridNodes) {
    debugMetrics.measure("grid-redraw", () => {
      drawWorkspaceGrid(grid, foundationStyle, workspaceGridBoundsForNodes(gridNodes));
    });
    gridDrawCount += 1;
  }
  function recordGraphInput(reason, sample) {
    performanceRecorder.recordInput({
      now: performance.now(),
      reason,
      sample: {
        ...sample,
        frameCount,
        rendererInstanceId,
        surfaceId: debugSurfaceId,
      },
    });
  }
  function pointerEventDiagnostics(event, now) {
    if (!event) {
      return null;
    }
    return {
      altKey: Boolean(event.altKey),
      button: event.button,
      buttons: event.buttons,
      cancelable: Boolean(event.cancelable),
      clientX: event.clientX,
      clientY: event.clientY,
      ctrlKey: Boolean(event.ctrlKey),
      eventTimestampDeltaMs:
        typeof event.timeStamp === "number" && Number.isFinite(event.timeStamp)
          ? now - event.timeStamp
          : null,
      isPrimary: event.isPrimary,
      metaKey: Boolean(event.metaKey),
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      pressure: event.pressure,
      shiftKey: Boolean(event.shiftKey),
      timeStamp: typeof event.timeStamp === "number" ? event.timeStamp : null,
    };
  }
  function pointDiagnostics(point) {
    return {
      x: point.x,
      y: point.y,
    };
  }
  function cameraStateDelta(before, after) {
    return {
      x: after.x - before.x,
      y: after.y - before.y,
      zoom: after.zoom - before.zoom,
      zoomRatio: before.zoom === 0 ? null : after.zoom / before.zoom,
    };
  }
}

function registerRendererInstance(surfaceId, rendererInstanceId) {
  const activeInstances = activeRendererInstancesBySurface.get(surfaceId) ?? new Set();
  activeInstances.add(rendererInstanceId);
  activeRendererInstancesBySurface.set(surfaceId, activeInstances);
}

function unregisterRendererInstance(surfaceId, rendererInstanceId) {
  const activeInstances = activeRendererInstancesBySurface.get(surfaceId);
  if (!activeInstances) {
    return;
  }
  activeInstances.delete(rendererInstanceId);
  if (activeInstances.size === 0) {
    activeRendererInstancesBySurface.delete(surfaceId);
  }
}

function activeRendererInstanceIds(surfaceId) {
  return [...(activeRendererInstancesBySurface.get(surfaceId) ?? [])];
}
