/* global ResizeObserver, performance, window */

import { Container, Graphics, Rectangle } from "pixi.js";
import { Viewport } from "pixi-viewport";

import {
  attachWorkflowGraphCanvas,
  initializeWorkflowGraphApplication,
} from "./pixi-renderer-application";
import { createWorkflowGraphAnimationState } from "./pixi-renderer-animation";
import { registerWorkflowGraphDebugSurfaceIfEnabled } from "./pixi-renderer-debug-surface";
import { createWorkflowGraphDebugSnapshot } from "./pixi-renderer-debug-snapshot";
import {
  redrawWorkspaceEdgeHighlights,
  redrawWorkspaceEdges,
} from "./pixi-renderer-edge-rendering";
import { createWorkflowGraphEdgeInteractions } from "./pixi-renderer-edge-interactions";
import { createDynamicCanvasContextMenuHandler, rendererHandlers } from "./pixi-renderer-handlers";
import {
  compactSelectedNodeLabelBitmapFontSize,
  validateNodeLabelGlyphs,
} from "./pixi-renderer-label-font";
import { createWorkflowGraphLabelManager } from "./pixi-renderer-labels";
import { destroyInitializedApp } from "./pixi-renderer-lifecycle";
import {
  createWorkspaceVignetteGradient,
  createNodeGeometryContextFactory,
  drawWorkspaceGrid,
  drawWorkspaceVignette,
} from "./pixi-renderer-node-geometry";
import { createWorkflowGraphNodeContainer } from "./pixi-renderer-node-container";
import { createWorkflowGraphPortContainer } from "./pixi-renderer-port-container";
import { createWorkflowGraphSceneGraphUpdater } from "./pixi-renderer-scene-graph";
import { createWorkflowGraphSpatialQueries } from "./pixi-renderer-spatial-queries";
import {
  cameraState,
  cameraStatesDiffer,
  clamp,
  commitEdgeConnection,
  configureViewportNavigation,
  drawMarqueeSelection,
  drawPortVisualState,
  drawTemporaryEdge,
  drawWorkspaceGlow,
  edgeConnection,
  hostScreenSize,
  interactivePortsForNode,
  isZoomWheel,
  marqueeBounds,
  normalizedWheelDelta,
  notifyNodeSelectionChange,
  parsePortKey,
  pointInsideNodeBounds,
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
import {
  createWorkflowGraphKeyDownHandler,
  createWorkflowGraphPointerDownHandler,
} from "./pixi-renderer-input-handlers";
import { rendererOptionsWithDefaults } from "./pixi-renderer-options";
import { workspaceNeonTheme } from "./workspace-neon-theme";

const backgroundColor = workspaceNeonTheme.foundation.background;
const maxZoom = 4;
const minZoom = 0.25;
const nodeOpenClickDistanceScreen = 6;
const nodeOpenClickIntervalMs = 500;
const portHitRadiusScreen = 18;
let nextRendererInstanceId = 1;

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
  const { app, loadedNodeLabelFont, screenSize } = await initializeWorkflowGraphApplication({
    abortSignal,
    backgroundColor,
    host,
  });
  attachWorkflowGraphCanvas(host, app.canvas);

  const viewport = new Viewport({
    events: app.renderer.events,
    screenHeight: screenSize.height,
    screenWidth: screenSize.width,
    worldHeight: 4000,
    worldWidth: 4000,
  });
  viewport.forceHitArea = new Rectangle(0, 0, screenSize.width, screenSize.height);
  configureViewportNavigation(viewport, initialCameraState, { maxZoom, minZoom });
  const vignette = new Graphics();
  const vignetteGradient = createWorkspaceVignetteGradient();
  vignette.eventMode = "none";
  vignette.interactiveChildren = false;
  const labelLayer = new Container();
  labelLayer.eventMode = "none";
  labelLayer.interactiveChildren = false;
  app.stage.addChild(viewport, vignette, labelLayer);

  const backgroundLayer = new Container();
  const edgeLayer = new Container();
  const edgeLabelLayer = new Container();
  const nodeLayer = new Container();
  const interactionLayer = new Container();
  const effectsLayer = new Container();
  edgeLabelLayer.eventMode = "none";
  edgeLabelLayer.interactiveChildren = false;
  viewport.addChild(backgroundLayer, edgeLayer, nodeLayer, interactionLayer, effectsLayer);

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
    nodeLayer,
    nodeOutlines,
    nodeShadows,
    nodes,
    portVisuals,
    portVisualStates,
    releaseLabel: labels.releaseLabel,
    requireNodeLabel: labels.requireNodeLabel,
  });
  const edgeGraphics = new Graphics();
  const edgeHighlightGraphics = new Graphics();
  const temporaryEdgeGraphics = new Graphics();
  const marqueeGraphics = new Graphics();
  const grid = new Graphics();
  const glow = new Graphics();
  const hoveredNodeIds = new Set();
  let draggingNode = null;
  let drawingEdge = null;
  let lastNodeClick = null;
  let drawingMarquee = null;
  let panningCamera = null;
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
  let lastCameraState = cameraState(viewport);
  let currentWorkflow = graph.workflow ?? null;
  const canvasCreationCount = 1;
  let rendererDestroyCount = 0;
  const recentFrameMs = [];
  const edgeInteractions = createWorkflowGraphEdgeInteractions({
    edges,
    getNode: requireNode,
    onSelectionChange: (edgeIds) => {
      if (handlers.onEdgeSelectionChange) {
        handlers.onEdgeSelectionChange([...edgeIds]);
      }
    },
    redrawHighlights: redrawEdgeHighlights,
    viewport,
  });
  const animationState = createWorkflowGraphAnimationState({
    animationEnabled,
    reduceMotion,
  });

  backgroundLayer.addChild(grid);
  edgeLayer.addChild(edgeGraphics, edgeHighlightGraphics, edgeLabelLayer);
  interactionLayer.addChild(marqueeGraphics, temporaryEdgeGraphics);
  effectsLayer.addChild(glow);
  drawWorkspaceGrid(grid);
  drawWorkspaceVignette(vignette, screenSize, vignetteGradient);
  gridDrawCount += 1;
  replaceSceneGraph(graph, { countUpdate: false });

  const resizeObserver = new ResizeObserver(() => {
    if (destroyed) {
      return;
    }
    const nextSize = hostScreenSize(host);
    app.renderer.resize(nextSize.width, nextSize.height);
    viewport.resize(nextSize.width, nextSize.height, 4000, 4000);
    viewport.forceHitArea = new Rectangle(0, 0, nextSize.width, nextSize.height);
    drawWorkspaceVignette(vignette, nextSize, vignetteGradient);
    labels.syncAllLabels();
  });
  resizeObserver.observe(host);

  const pointerDown = createWorkflowGraphPointerDownHandler({
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
    if (draggingNode) {
      finishNodeDragging();
      releasePointer(event);
      return;
    }
    if (panningCamera) {
      panningCamera = null;
      viewport.plugins.resume("decelerate");
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
  const wheel = (event) => {
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
  const keyDown = createWorkflowGraphKeyDownHandler({
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
  app.canvas.addEventListener("pointerdown", pointerDown, true);
  app.canvas.addEventListener("pointermove", pointerMove);
  app.canvas.addEventListener("pointerleave", pointerLeave);
  app.canvas.addEventListener("contextmenu", contextMenu);
  app.canvas.addEventListener("wheel", wheel, { capture: true, passive: false });
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerCancel);
  window.addEventListener("keydown", keyDown);

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
    if (cameraStatesDiffer(nextCameraState, lastCameraState)) {
      commitCameraChange(nextCameraState);
    }
    animationState.tick(now);
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
      renderState: () => ({
        cameraUpdateCount,
        canvasCreationCount,
        drawingEdge: Boolean(drawingEdge),
        drawingMarquee: Boolean(drawingMarquee),
        edgeCommitCount,
        edgeRedrawCount,
        edgeSelectionChangeCount: edgeInteractions.selectionChangeCount(),
        frameCount,
        gridDrawCount,
        labelSyncCount: labels.syncCount(),
        marqueeUpdateCount,
        nodeDragUpdateCount,
        nodeOutlineVisibilityUpdateCount,
        pointerPanUpdateCount,
        rendererDestroyCount,
        rendererInstanceId,
        selectedNodeId: firstSelectedNodeId(),
        selectedEdgeId: edgeInteractions.firstSelectedEdgeId(),
        selectedEdgeIds: edgeInteractions.selectedEdgeIds,
        selectedNodeIds,
        selectionChangeCount,
        temporaryEdgeUpdateCount,
        wheelPanUpdateCount,
        wheelZoomUpdateCount,
        workflow: currentWorkflow,
        ...animationState.debugSnapshot(),
        ...sceneGraph.updateCounts(),
      }),
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
      resizeObserver.disconnect();
      app.canvas.removeEventListener("pointerdown", pointerDown, true);
      app.canvas.removeEventListener("pointermove", pointerMove);
      app.canvas.removeEventListener("pointerleave", pointerLeave);
      app.canvas.removeEventListener("contextmenu", contextMenu);
      app.canvas.removeEventListener("wheel", wheel, true);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerCancel);
      window.removeEventListener("keydown", keyDown);
      unregisterDebugSurface?.();
      vignette.clear();
      vignetteGradient.destroy();
      for (const nodeId of [...nodeLabels.keys()]) {
        labels.releaseLabel(nodeId);
      }
      destroyInitializedApp(app);
    },
    setHandlers: (nextHandlers) => {
      Object.assign(handlers, rendererHandlers(nextHandlers));
    },
    updateGraph: (nextGraph) => {
      replaceSceneGraph(nextGraph, { countUpdate: true });
    },
  };
  function replaceSceneGraph(nextGraph, { countUpdate }) {
    if (destroyed) {
      return;
    }
    cancelActiveInteractionsForGraphUpdate();
    const update = sceneGraph.replaceGraph(nextGraph, { countUpdate });
    currentWorkflow = update.workflow;
    nextEdgeSequence = update.nextEdgeSequence;
    spatialQueries.rebuild(nodes);
    syncAnimationActiveSet();
    pruneSelectionForNodes(nodes);
    edgeInteractions.prune(edges);
    drawAllNodeOutlines();
    redrawGlow();
    labels.syncAllLabels();
    redrawEdges();
  }
  function cancelActiveInteractionsForGraphUpdate() {
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
    syncAnimationActiveSet();
    draggingNode.moved = true;
    labels.syncLabelVisibility();
    nodeDragUpdateCount += 1;
    redrawEdges();
    redrawGlow();
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
    return elapsed <= nodeOpenClickIntervalMs && distance <= nodeOpenClickDistanceScreen;
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
  function startCameraPanning(screen) {
    panningCamera = {
      lastX: screen.x,
      lastY: screen.y,
    };
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
    panCameraByScreenDelta(-deltaX, -deltaY);
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
    labels.syncLabelVisibility();
    notifyNodeSelectionChange(handlers.onNodeSelectionChange, selectedNodeIds);
  }
  function drawAllNodeOutlines() {
    for (const candidate of nodes) {
      syncNodeOutlineVisibility(candidate.id);
    }
  }
  function syncHoverAtScreen(screen) {
    const nodeId = hitTestNodeAtScreen(screen)?.id ?? null;
    setHoveredNodeId(nodeId);
    edgeInteractions.setHovered(
      nodeId === null ? (edgeInteractions.hitTestAtScreen(screen)?.id ?? null) : null,
    );
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
  function redrawEdges() {
    redrawWorkspaceEdges({
      edgeGraphics,
      edgeLabelLayer,
      edges,
      fontFamily: loadedNodeLabelFont.fontFamily,
      fontSize: compactSelectedNodeLabelBitmapFontSize,
      getNode: requireNode,
      validateGlyphs: validateNodeLabelGlyphs,
    });
    redrawEdgeHighlights();
    edgeRedrawCount += 1;
  }
  function redrawEdgeHighlights() {
    redrawWorkspaceEdgeHighlights({
      edgeHighlightGraphics,
      edges,
      getNode: requireNode,
      hoveredEdgeIds: edgeInteractions.hoveredEdgeIds,
      selectedEdgeIds: edgeInteractions.selectedEdgeIds,
    });
  }
  function redrawGlow() {
    drawWorkspaceGlow(glow, nodes, performance.now());
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
    let bestPort = null;
    let bestDistance = Infinity;
    const candidates = spatialQueries.portHitCandidatesAtScreen(screen, portHitRadiusScreen);
    for (const node of candidates) {
      if (node.connectable === false) {
        continue;
      }
      if (node.id === excludeNodeId) {
        continue;
      }
      for (const port of interactivePortsForNode(node)) {
        if (port.role !== role) {
          continue;
        }
        const world = portWorldPosition(node, port.id);
        const portScreen = viewport.toScreen(world.x, world.y);
        const distance = Math.hypot(screen.x - portScreen.x, screen.y - portScreen.y);
        if (distance <= portHitRadiusScreen && distance < bestDistance) {
          bestDistance = distance;
          bestPort = { nodeId: node.id, portId: port.id };
        }
      }
    }
    return bestPort;
  }

  function hitTestNodeAtScreen(screen) {
    const { candidates, world } = spatialQueries.nodeHitCandidatesAtScreen(screen);
    let picked = null;
    for (const node of candidates) {
      if (pointInsideNodeBounds(world, node)) {
        picked = node;
      }
    }
    return picked;
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
    syncAnimationActiveSet();
  }

  function syncAnimationActiveSet() {
    animationState.recompute({
      edges,
      nodes,
      visibleNodeIds: spatialQueries.visibleNodeIds(),
    });
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
  function firstSelectedNodeId() {
    return selectedNodeIds.values().next().value ?? null;
  }
  function requireNode(nodeId) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      throw new Error(`workspace edge references missing node: ${nodeId}`);
    }
    return node;
  }
}
