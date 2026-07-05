/* global ResizeObserver, performance, window */

import {
  attachWorkflowGraphCanvas,
  initializeWorkflowGraphApplication,
} from "./pixi-renderer-application";
import { createWorkspaceActivityMarkerManager } from "./pixi-renderer-activity-markers";
import {
  backgroundColor,
  maxZoom,
  minZoom,
  portHitRadiusScreen,
  rendererOptionsWithDefaults,
} from "./pixi-renderer-config";
import { registerWorkflowGraphDebugSurfaceIfEnabled } from "./pixi-renderer-debug-surface";
import { createWorkflowGraphDebugSnapshot } from "./pixi-renderer-debug-snapshot";
import {
  edgeGraphicsInvalidationForGraphUpdate,
  edgeGraphicsRedrawRequired,
  redrawWorkspaceEdges,
} from "./pixi-renderer-edge-rendering";
import { createWorkspaceEdgeLabelManager } from "./pixi-renderer-edge-labels";
import {
  createGraphUpdateAccounting,
  requireGraphUpdateMetadataSource,
} from "./pixi-renderer-graph-update-accounting";
import { createDynamicCanvasContextMenuHandler, rendererHandlers } from "./pixi-renderer-handlers";
import {
  hitTestWorkflowGraphNodeAtScreen,
  hitTestWorkflowGraphPortAtScreen,
} from "./pixi-renderer-hit-testing";
import {
  compactSelectedNodeLabelBitmapFontSize,
  validateNodeLabelGlyphs,
} from "./pixi-renderer-label-font";
import { interactionCancellationForGraphUpdate } from "./pixi-renderer-interaction-cancellation";
import { createWorkflowGraphLabelManager } from "./pixi-renderer-labels";
import {
  destroyWorkflowGraphRenderer,
  registerWorkflowGraphRendererEvents,
} from "./pixi-renderer-lifecycle";
import { createWorkflowGraphLayers } from "./pixi-renderer-layers";
import { createNodeGeometryContextFactory, drawWorkspaceGrid } from "./pixi-renderer-node-geometry";
import { createWorkflowGraphNodeContainer } from "./pixi-renderer-node-container";
import { createWorkflowGraphPortContainer } from "./pixi-renderer-port-container";
import { createWorkflowGraphPointerDownHandler } from "./pixi-renderer-pointer-down";
import { createWorkflowGraphPointerClicks } from "./pixi-renderer-pointer-clicks";
import { createWorkflowGraphRuntimeState } from "./pixi-renderer-runtime-state";
import { createWorkflowGraphSceneGraphUpdater } from "./pixi-renderer-scene-graph";
import { createWorkflowGraphSpatialQueries } from "./pixi-renderer-spatial-queries";
import {
  cameraState,
  cameraStatesDiffer,
  clamp,
  commitEdgeConnection,
  drawMarqueeSelection,
  drawPortVisualState,
  drawTemporaryEdge,
  drawWorkspaceGlow,
  edgeConnection,
  hostScreenSize,
  interactivePortsForNode,
  isZoomWheel,
  marqueeBounds,
  nodeDeleteRequested,
  normalizedWheelDelta,
  notifyNodeSelectionChange,
  parsePortKey,
  portKey,
  portWorldPosition,
  releasePointer,
  requirePort,
  screenPointFromPointer,
  screenPointFromWheel,
  setsEqual,
  stopNativeInteraction,
  zoomFactorFromWheel,
} from "./pixi-renderer-helpers";
import { createWorkflowGraphViewport, resizeWorkflowGraphViewport } from "./pixi-renderer-viewport";

let nextRendererInstanceId = 1;
export async function createWorkflowGraphRenderer(options) {
  const rendererOptions = rendererOptionsWithDefaults(options);
  const { abortSignal, debugEnabled, debugSurfaceId, graph, host, initialCameraState } =
    rendererOptions;
  const rendererInstanceId = nextRendererInstanceId;
  nextRendererInstanceId += 1;
  const { app, loadedNodeLabelFont, screenSize } = await initializeWorkflowGraphApplication({
    abortSignal,
    backgroundColor,
    host,
  });
  attachWorkflowGraphCanvas(host, app.canvas);

  const viewport = createWorkflowGraphViewport({
    events: app.renderer.events,
    initialCameraState,
    maxZoom,
    minZoom,
    screenSize,
  });
  const {
    edgeGraphics,
    edgeLabelLayer,
    glow,
    grid,
    labelLayer,
    marqueeGraphics,
    nodeLayer,
    temporaryEdgeGraphics,
  } = createWorkflowGraphLayers({ stage: app.stage, viewport });

  const handlers = rendererHandlers(rendererOptions);
  const nodes = [];
  const edges = [];
  const spatialQueries = createWorkflowGraphSpatialQueries({ nodes, viewport });
  const workspaceActivityMarkers = createWorkspaceActivityMarkerManager({
    loadedNodeLabelFont,
    nodes,
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
  const labels = createWorkflowGraphLabelManager({
    labelLayer,
    loadedNodeLabelFont,
    nodeLabels,
    nodeLabelFontSizeModes,
    nodeLabelVisibilityReasons,
    nodes,
    selectedNodeIds,
    spatialQueries,
    viewport,
  });
  const sceneGraph = createWorkflowGraphSceneGraphUpdater({
    acquireLabel: labels.acquireLabel,
    createNodeContainer: nodeContainer,
    edges,
    nodeActivityMarkers,
    nodeBodies,
    nodeContainers,
    nodeDiagnosticMarkers,
    nodeGeometry,
    nodeLayer,
    nodeOutlines,
    nodeShadows,
    nodes,
    portVisuals,
    portVisualStates,
    releaseLabel: labels.releaseLabel,
    requireNodeLabel: labels.requireNodeLabel,
  });
  const edgeLabels = createWorkspaceEdgeLabelManager({
    edgeLabelLayer,
    fontFamily: loadedNodeLabelFont.fontFamily,
    fontSize: compactSelectedNodeLabelBitmapFontSize,
    validateGlyphs: validateNodeLabelGlyphs,
  });
  const hoveredNodeIds = new Set();
  let draggingNode = null;
  let drawingEdge = null;
  let drawingMarquee = null;
  let panningCamera = null;
  const { activityChips, nodeClicks } = createWorkflowGraphPointerClicks({
    getHandlers: () => handlers,
    hitTestChipAtScreen: (screen) => workspaceActivityMarkers.hitTestChipAtScreen(screen),
    moveCameraPan,
    startCameraPanning,
  });
  let activeTargetPortKey = null;
  let destroyed = false;
  let frameCount = 0;
  let lastFrameAt = performance.now();
  let cameraUpdateCount = 0;
  let nodeDragUpdateCount = 0;
  let edgeRedrawCount = 0;
  let marqueeUpdateCount = 0;
  let edgeCommitCount = 0;
  let nextEdgeSequence = 1;
  let pointerPanUpdateCount = 0;
  let selectionChangeCount = 0;
  let temporaryEdgeUpdateCount = 0;
  let wheelPanUpdateCount = 0;
  let wheelZoomUpdateCount = 0;
  let gridDrawCount = 0;
  let nodeOutlineVisibilityUpdateCount = 0;
  let deferredResizeSize = null;
  let lastCameraState = cameraState(viewport);
  let currentWorkflow = graph.workflow ?? null;
  const canvasCreationCount = 1;
  let rendererResizeCount = 0;
  let rendererDestroyCount = 0;
  let tickerFramesWhileFrozen = 0;
  let edgeGraphicsRedrawSkipCount = 0;
  const graphUpdateAccounting = createGraphUpdateAccounting();
  const recentFrameMs = [];
  const runtimeState = createWorkflowGraphRuntimeState({
    canvas: app.canvas,
    now: () => performance.now(),
    onTickerStart: (startedAt) => {
      lastFrameAt = startedAt;
    },
    ticker: app.ticker,
    viewportPlugins: viewport.plugins,
  });

  drawWorkspaceGrid(grid);
  gridDrawCount += 1;
  replaceSceneGraph(graph, {
    countUpdate: false,
    metadata: { source: "initial-mount" },
  });

  const resizeObserver = new ResizeObserver(() => {
    if (destroyed) {
      return;
    }
    const nextSize = hostScreenSize(host);
    if (runtimeState.isFrozen()) {
      deferredResizeSize = nextSize;
      return;
    }
    applyRendererSize(nextSize);
  });
  resizeObserver.observe(host);

  const pointerDown = createWorkflowGraphPointerDownHandler({
    beginActivityChipClick: activityChips.begin,
    canvas: app.canvas,
    clearLastNodeClick: nodeClicks.clear,
    clearSelection,
    frozen: () => runtimeState.isFrozen(),
    graphHandlers: handlers,
    hitTestActivityChipAtScreen: activityChips.hitTest,
    hitTestNodeAtScreen,
    hitTestPortAtScreen,
    repeatedNodeOpenRequested: nodeClicks.repeatedOpenRequested,
    selectOnlyNode,
    startCameraPanning,
    startEdgeDrawing,
    startMarqueeSelection,
    startNodeDragging,
    toggleNodeSelection,
  });
  const pointerMove = (event) => {
    if (runtimeState.isFrozen()) {
      return;
    }
    const screen = screenPointFromPointer(app.canvas, event);
    if (activityChips.handlePointerMove(screen)) {
      return;
    }
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
      moveCameraPan(screen);
      return;
    }
    syncHoveredNodeAtScreen(screen);
  };
  const pointerUp = (event) => {
    if (runtimeState.isFrozen()) {
      return;
    }
    if (activityChips.handlePointerUp(event)) {
      return;
    }
    if (drawingEdge) {
      commitDrawingEdgeAtPointer(event);
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
      panningCamera = null;
      syncViewportDecelerationForInteractions();
      releasePointer(event);
    }
  };
  const pointerCancel = (event) => {
    if (runtimeState.isFrozen()) {
      return;
    }
    if (activityChips.handlePointerCancel(event)) {
      return;
    }
    if (drawingMarquee) {
      cancelMarqueeSelection();
      releasePointer(event);
      return;
    }
    pointerUp(event ?? null);
  };
  const pointerLeave = () => {
    if (runtimeState.isFrozen()) {
      return;
    }
    setHoveredNodeId(null);
  };
  const wheel = (event) => {
    if (runtimeState.isFrozen()) {
      stopNativeInteraction(event);
      return;
    }
    if (drawingEdge || drawingMarquee || draggingNode) {
      return;
    }
    stopNativeInteraction(event);
    const screen = screenPointFromWheel(app.canvas, event);
    const delta = normalizedWheelDelta(event);
    if (isZoomWheel(event, delta)) {
      zoomCameraAtScreen(screen, zoomFactorFromWheel(event, delta));
      wheelZoomUpdateCount += 1;
      return;
    }
    panCameraByScreenDelta(delta.x, delta.y);
    wheelPanUpdateCount += 1;
  };
  const contextMenu = createDynamicCanvasContextMenuHandler({
    canvas: app.canvas,
    handlers,
    viewport,
  });
  const keyDown = (event) => {
    if (runtimeState.isFrozen()) {
      return;
    }
    if (nodeDeleteRequested(event, handlers.onNodeDelete, selectedNodeIds)) {
      handlers.onNodeDelete([...selectedNodeIds]);
      stopNativeInteraction(event);
      return;
    }
    if (event.key !== "Escape") {
      return;
    }
    if (drawingEdge) {
      finishEdgeDrawing();
      stopNativeInteraction(event);
      return;
    }
    if (drawingMarquee) {
      cancelMarqueeSelection();
      stopNativeInteraction(event);
      return;
    }
    if (draggingNode || panningCamera) {
      return;
    }
    if (selectedNodeIds.size > 0) {
      clearSelection();
      stopNativeInteraction(event);
    }
  };
  // prettier-ignore
  const unregisterRendererEvents = registerWorkflowGraphRendererEvents({ canvas: app.canvas, contextMenu, keyDown, pointerCancel, pointerDown, pointerLeave, pointerMove, pointerUp, wheel });
  app.ticker.add(() => {
    if (destroyed) {
      return;
    }
    if (runtimeState.isFrozen()) {
      tickerFramesWhileFrozen += 1;
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
    if (cameraStatesDiffer(nextCameraState, lastCameraState)) {
      commitCameraChange(nextCameraState);
    }
  });

  const unregisterDebugSurface = registerWorkflowGraphDebugSurfaceIfEnabled({
    debugEnabled,
    debugSurfaceId,
    getSnapshot: createWorkflowGraphDebugSnapshot({
      app,
      backgroundColor,
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
      // prettier-ignore
      renderState: () => ({ activityChipDebug: workspaceActivityMarkers.chipDebugSnapshot(), activityChipLayout: workspaceActivityMarkers.layoutSnapshot(), activityChipStatesById: workspaceActivityMarkers.chipStatesById(), activityChipTextObjectCount: workspaceActivityMarkers.textObjectCount(), activityChipViewCount: workspaceActivityMarkers.count(), activityMarkerGraphicsCount: workspaceActivityMarkers.count(), activityMarkerVisualStatesById: workspaceActivityMarkers.visualStatesById(), cameraUpdateCount, canvasCreationCount, drawingEdge: Boolean(drawingEdge), drawingMarquee: Boolean(drawingMarquee), edgeCommitCount, edgeGraphicsRedrawSkipCount, edgeLabelObjectCount: edgeLabels.count(), edgeRedrawCount, frameCount, gridDrawCount, graphUpdateAccounting: graphUpdateAccounting.snapshot(), labelSyncCount: labels.syncCount(), marqueeUpdateCount, nodeDragUpdateCount, nodeOutlineVisibilityUpdateCount, panningCamera: Boolean(panningCamera), pixiAppCreationCount: 1, pointerPanUpdateCount, rendererLayerCreationCount: 1, rendererResizeCount, rendererDestroyCount, frozen: runtimeState.isFrozen(), rendererInstanceId, selectedNodeId: selectedNodeIds.values().next().value ?? null, selectedNodeIds, selectionChangeCount, temporaryEdgeUpdateCount, tickerFramesWhileFrozen, wheelPanUpdateCount, wheelZoomUpdateCount, workflow: currentWorkflow, ...sceneGraph.updateCounts() }),
      requireNodeLabel: labels.requireNodeLabel,
      spatialQueries,
      viewport,
    }),
  });

  return {
    cameraState: () => cameraState(viewport),
    destroy: () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      rendererDestroyCount += 1;
      runtimeState.destroy();
      resizeObserver.disconnect();
      // prettier-ignore
      destroyWorkflowGraphRenderer({ app, edgeLabels, labels, nodeLabels, unregisterDebugSurface, unregisterRendererEvents });
    },
    setFocused: (nextFocused) => {
      setRendererFocused(nextFocused);
    },
    setFrozen: (nextFrozen) => {
      setRendererFrozen(nextFrozen);
    },
    setHandlers: (nextHandlers) => {
      Object.assign(handlers, rendererHandlers(nextHandlers));
    },
    updateActivityMarkers: (markers) => workspaceActivityMarkers.update(markers),
    updateGraph: (nextGraph, metadata) => {
      replaceSceneGraph(nextGraph, { countUpdate: true, metadata });
    },
  };
  function setRendererFrozen(nextFrozen) {
    if (destroyed || !runtimeState.setFrozen(nextFrozen)) {
      return;
    }
    if (runtimeState.isFrozen()) {
      cancelActiveInteractionsForFreeze();
      runtimeState.syncTicker();
      return;
    }
    if (deferredResizeSize !== null) {
      applyRendererSize(deferredResizeSize);
      deferredResizeSize = null;
    }
    syncViewportDecelerationForInteractions();
    runtimeState.syncTicker();
  }
  function setRendererFocused(nextFocused) {
    if (destroyed || !runtimeState.setFocused(nextFocused)) {
      return;
    }
    syncViewportDecelerationForInteractions();
    runtimeState.syncTicker();
  }
  function applyRendererSize(nextSize) {
    resizeWorkflowGraphViewport({
      app,
      devicePixelRatio: window.devicePixelRatio || 1,
      nextSize,
      viewport,
    });
    rendererResizeCount += 1;
    labels.syncAllLabels();
    // Re-flow retained activity chips into the resized viewport so they do not strand off-screen.
    workspaceActivityMarkers.syncPositions();
  }
  function cancelActiveInteractionsForFreeze() {
    drawingEdge = null;
    drawingMarquee = null;
    draggingNode = null;
    panningCamera = null;
    activeTargetPortKey = null;
    temporaryEdgeGraphics.clear();
    marqueeGraphics.clear();
    runtimeState.pauseDeceleration();
  }
  function replaceSceneGraph(nextGraph, { countUpdate, metadata }) {
    if (destroyed) {
      return;
    }
    const source = requireGraphUpdateMetadataSource(metadata);
    const cameraMoving = Boolean(panningCamera);
    const edgeUpdate = edgeGraphicsInvalidationForGraphUpdate(
      nodes,
      edges,
      nextGraph.nodes,
      nextGraph.edges,
    );
    const interactionCancelled = cancelActiveInteractionsForGraphUpdate(nextGraph);
    const update = sceneGraph.replaceGraph(nextGraph, { countUpdate, edgeUpdate });
    currentWorkflow = update.workflow;
    nextEdgeSequence = update.nextEdgeSequence;
    spatialQueries.rebuild(nodes);
    workspaceActivityMarkers.syncPositions();
    pruneSelectionForNodes(nodes);
    drawAllNodeOutlines();
    drawWorkspaceGlow(glow, nodes, performance.now());
    labels.syncAllLabels();
    const edgeRender = redrawEdges({
      redrawGraphics: !countUpdate || edgeGraphicsRedrawRequired(edgeUpdate),
      source,
    });
    graphUpdateAccounting.record({
      cameraMoving,
      edgeRender,
      edgeUpdate,
      interactionCancelled,
      source,
    });
  }
  function cancelActiveInteractionsForGraphUpdate(nextGraph) {
    const cancellation = interactionCancellationForGraphUpdate(
      { activeTargetPortKey, draggingNode, drawingEdge },
      nextGraph,
    );
    if (cancellation.cancelDrawingEdge) {
      drawingEdge = null;
      activeTargetPortKey = null;
      temporaryEdgeGraphics.clear();
    }
    if (cancellation.clearActiveTargetPortKey) {
      activeTargetPortKey = null;
    }
    if (cancellation.cancelDraggingNode) {
      draggingNode = null;
      for (const body of nodeBodies.values()) {
        body.cursor = "grab";
      }
    }
    syncViewportDecelerationForInteractions();
    return cancellation.interactionCancelled;
  }
  function syncViewportDecelerationForInteractions() {
    runtimeState.syncDeceleration(
      Boolean(drawingEdge || drawingMarquee || draggingNode || panningCamera),
    );
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
      notifyNodeSelectionChange(handlers.onNodeSelectionChange, selectedNodeIds);
    }
  }
  function nodeContainer(node) {
    return createWorkflowGraphNodeContainer({
      node,
      nodeActivityMarkers,
      nodeBodies,
      nodeDiagnosticMarkers,
      nodeGeometry,
      nodeOutlines,
      nodeShadows,
      onPointerOut: () => setHoveredNodeId(null),
      onPointerOver: () => setHoveredNodeId(node.id),
      portContainers: interactivePortsForNode(node).map((port) => portContainer(node, port)),
    });
  }
  function portContainer(node, port) {
    return createWorkflowGraphPortContainer({
      drawingEdgeActive: () => Boolean(drawingEdge),
      node,
      port,
      portHitRadiusScreen,
      portVisuals,
      portVisualStates,
      setPortVisualState,
    });
  }
  function startNodeDragging(nodeId, screen) {
    const node = requireNode(nodeId);
    const world = viewport.toWorld(screen);
    if (!selectedNodeIds.has(node.id)) {
      selectOnlyNode(node.id);
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
    runtimeState.pauseDeceleration();
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
    workspaceActivityMarkers.syncPositions();
    draggingNode.moved = true;
    labels.syncLabelVisibility();
    nodeDragUpdateCount += 1;
    redrawEdges();
    drawWorkspaceGlow(glow, nodes, performance.now());
  }
  function finishNodeDragging() {
    const completedDrag = draggingNode;
    const shouldPersistPositions = completedDrag?.moved === true;
    const movedNodeIds = new Set(completedDrag?.nodes.map((node) => node.nodeId) ?? []);
    draggingNode = null;
    syncViewportDecelerationForInteractions();
    for (const body of nodeBodies.values()) {
      body.cursor = "grab";
    }
    if (shouldPersistPositions && handlers.onNodePositionsChange) {
      nodeClicks.clear();
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
      nodeClicks.record(completedDrag.primaryNodeId, {
        x: completedDrag.startScreenX,
        y: completedDrag.startScreenY,
      });
    }
  }
  function startCameraPanning(screen) {
    panningCamera = {
      lastX: screen.x,
      lastY: screen.y,
    };
    runtimeState.pauseDeceleration();
  }
  function moveCameraPan(screen) {
    if (!panningCamera) {
      return;
    }
    const deltaX = screen.x - panningCamera.lastX;
    const deltaY = screen.y - panningCamera.lastY;
    panningCamera.lastX = screen.x;
    panningCamera.lastY = screen.y;
    panCameraByScreenDelta(-deltaX, -deltaY);
    pointerPanUpdateCount += 1;
  }
  function selectOnlyNode(nodeId) {
    setSelectedNodeIds([nodeId]);
  }
  function clearSelection() {
    setSelectedNodeIds([]);
  }
  function toggleNodeSelection(nodeId) {
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
    labels.syncLabelVisibility();
    notifyNodeSelectionChange(handlers.onNodeSelectionChange, selectedNodeIds);
  }
  function drawAllNodeOutlines() {
    for (const candidate of nodes) {
      syncNodeOutlineVisibility(candidate.id);
    }
  }
  function syncHoveredNodeAtScreen(screen) {
    setHoveredNodeId(hitTestNodeAtScreen(screen)?.id ?? null);
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
  }
  function syncNodeOutlineVisibility(nodeId) {
    const outlines = nodeOutlines.get(nodeId);
    if (!outlines) {
      throw new Error(`node outline target is missing: ${nodeId}`);
    }
    const selected = selectedNodeIds.has(nodeId);
    const hovered = hoveredNodeIds.has(nodeId);
    outlines.selectedOutline.visible = selected;
    outlines.hoverOutline.visible = !selected && hovered;
    nodeOutlineVisibilityUpdateCount += 1;
  }
  function redrawEdges({ redrawGraphics = true } = {}) {
    const result = redrawWorkspaceEdges({
      edgeGraphics,
      edgeLabels,
      edges,
      getNode: requireNode,
      redrawGraphics,
    });
    if (redrawGraphics) {
      edgeRedrawCount += 1;
    } else {
      edgeGraphicsRedrawSkipCount += 1;
    }
    return result;
  }
  function startEdgeDrawing(sourceNodeId, sourcePortId) {
    const source = requireNode(sourceNodeId);
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
    runtimeState.pauseDeceleration();
    setPortVisualState(sourceNodeId, sourcePortId, "active");
    temporaryEdgeUpdateCount += 1;
    drawTemporaryEdge(temporaryEdgeGraphics, drawingEdge);
  }
  function finishEdgeDrawing() {
    drawingEdge = null;
    activeTargetPortKey = null;
    temporaryEdgeGraphics.clear();
    syncViewportDecelerationForInteractions();
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
    runtimeState.pauseDeceleration();
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
    syncViewportDecelerationForInteractions();
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
  function commitDrawingEdgeAtPointer(event) {
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
  }
  function hitTestPortAtScreen(screen, { excludeNodeId, role }) {
    return hitTestWorkflowGraphPortAtScreen({
      excludeNodeId,
      role,
      screen,
      spatialQueries,
      viewport,
    });
  }
  function hitTestNodeAtScreen(screen) {
    return hitTestWorkflowGraphNodeAtScreen({ screen, spatialQueries });
  }
  function panCameraByScreenDelta(deltaX, deltaY) {
    if (deltaX === 0 && deltaY === 0) {
      return;
    }
    const corner = viewport.corner;
    viewport.moveCorner(corner.x + deltaX / viewport.scaled, corner.y + deltaY / viewport.scaled);
    commitCameraChange();
  }
  function zoomCameraAtScreen(screen, factor) {
    const nextZoom = clamp(viewport.scaled * factor, minZoom, maxZoom);
    if (nextZoom === viewport.scaled) {
      return;
    }
    const worldBefore = viewport.toWorld(screen);
    viewport.setZoom(nextZoom);
    const screenAfter = viewport.toScreen(worldBefore);
    viewport.x += screen.x - screenAfter.x;
    viewport.y += screen.y - screenAfter.y;
    commitCameraChange();
  }
  function commitCameraChange(nextCameraState = cameraState(viewport)) {
    if (!cameraStatesDiffer(nextCameraState, lastCameraState)) {
      return;
    }
    cameraUpdateCount += 1;
    lastCameraState = nextCameraState;
    handlers.onCameraStateChange(nextCameraState);
    labels.syncAllLabels();
    workspaceActivityMarkers.syncPositions();
  }
  function setPortVisualState(nodeId, portId, state) {
    const key = portKey(nodeId, portId);
    const visual = portVisuals.get(key);
    if (!visual) {
      throw new Error(`workspace port visual is missing: ${key}`);
    }
    portVisualStates.set(key, state);
    drawPortVisualState(visual, requirePort(requireNode(nodeId), portId), state);
  }
  function requireNode(nodeId) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      throw new Error(`workspace edge references missing node: ${nodeId}`);
    }
    return node;
  }
}
