/* global ResizeObserver, performance, window */

import { Application, BitmapText, Container, Graphics, Point, Rectangle } from "pixi.js";
import { Viewport } from "pixi-viewport";

import { initialEdges, initialNodes } from "./pixi-workspace-fixture";
import {
  compactSelectedNodeLabelBitmapFontSize,
  nodeLabelBitmapFontSize,
  validateNodeLabelGlyphs,
} from "./pixi-workspace-label-font";
import { loadNodeLabelBitmapFont } from "./pixi-workspace-label-font-loader";
import {
  labelVisibilityModeForZoom,
  syncNodeLabelVisibility,
} from "./pixi-workspace-label-visibility";
import { registerPixiWorkspaceDebugSurface } from "./pixi-workspace-debug-registry";
import {
  countNodeOutlineGraphics,
  drawWorkspaceGrid,
  nodeBodyContextFor,
  nodeGeometryContextCounts,
  nodeOutlineContextFor,
  nodeShadowContextFor,
} from "./pixi-workspace-node-geometry";
import { createPixiWorkspaceSpatialQueries } from "./pixi-workspace-renderer-spatial-queries";
import {
  cameraState,
  cameraStatesDiffer,
  capturePointer,
  clamp,
  countMapValues,
  createCanvasContextMenuHandler,
  drawCurvedEdge,
  drawMarqueeSelection,
  drawPortVisualState,
  drawTemporaryEdge,
  drawWorkspaceGlow,
  frameSampleStats,
  hostScreenSize,
  isSelectionToggleEvent,
  isZoomWheel,
  marqueeBounds,
  normalizedWheelDelta,
  parsePortKey,
  pointInsideNodeBounds,
  portKey,
  ports,
  portLocalPosition,
  portWorldPosition,
  releasePointer,
  requirePort,
  samplePixiVisualState,
  screenPointFromPointer,
  screenPointFromWheel,
  setsEqual,
  stopNativeInteraction,
  totalDisplayObjectCount,
  visibleDisplayObjectCount,
  zoomFactorFromWheel,
} from "./pixi-workspace-renderer-helpers";

const backgroundColor = 0x07080d;
const maxZoom = 4;
const minZoom = 0.25;
const portHitRadiusScreen = 18;

export async function createPixiWorkspaceRenderer({
  debugEnabled,
  debugSurfaceId = "pixi-workspace",
  graph = { edges: initialEdges, nodes: initialNodes },
  host,
  onCanvasContextMenu = null,
  onNodePositionsChange = null,
  reactRenderCount,
}) {
  const app = new Application();
  const screenSize = hostScreenSize(host);
  await app.init({
    antialias: true,
    autoDensity: true,
    background: backgroundColor,
    height: screenSize.height,
    resolution: window.devicePixelRatio || 1,
    width: screenSize.width,
  });
  const loadedNodeLabelFont = await loadNodeLabelBitmapFont();

  host.appendChild(app.canvas);
  app.canvas.dataset.testid = "pixi-workspace-canvas";
  app.canvas.style.display = "block";
  app.canvas.style.height = "100%";
  app.canvas.style.width = "100%";

  const viewport = new Viewport({
    events: app.renderer.events,
    screenHeight: screenSize.height,
    screenWidth: screenSize.width,
    worldHeight: 4000,
    worldWidth: 4000,
  });
  viewport.forceHitArea = new Rectangle(0, 0, screenSize.width, screenSize.height);
  viewport.pinch({ percent: 1.6 }).decelerate({ friction: 0.88 });
  viewport.moveCenter(0, 20);
  const labelLayer = new Container();
  labelLayer.eventMode = "none";
  labelLayer.interactiveChildren = false;
  app.stage.addChild(viewport, labelLayer);

  const backgroundLayer = new Container();
  const edgeLayer = new Container();
  const nodeLayer = new Container();
  const interactionLayer = new Container();
  const effectsLayer = new Container();
  viewport.addChild(backgroundLayer, edgeLayer, nodeLayer, interactionLayer, effectsLayer);

  const nodes = graph.nodes.map((node) => ({ ...node }));
  const edges = graph.edges.map((edge) => ({ ...edge }));
  const spatialQueries = createPixiWorkspaceSpatialQueries({ nodes, viewport });
  const nodeContainers = new Map();
  const nodeBodies = new Map();
  const nodeShadows = new Map();
  const nodeLabels = new Map();
  const nodeLabelFontSizeModes = new Map();
  const nodeLabelVisibilityReasons = new Map();
  const nodeOutlines = new Map();
  const portVisuals = new Map();
  const portVisualStates = new Map();
  const edgeGraphics = new Graphics();
  const temporaryEdgeGraphics = new Graphics();
  const marqueeGraphics = new Graphics();
  const grid = new Graphics();
  const glow = new Graphics();
  const selectedNodeIds = new Set();
  const hoveredNodeIds = new Set();
  let draggingNode = null;
  let drawingEdge = null;
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
  let nextEdgeSequence = edges.length + 1;
  let pointerPanUpdateCount = 0;
  let selectionChangeCount = 0;
  let temporaryEdgeUpdateCount = 0;
  let wheelPanUpdateCount = 0;
  let wheelZoomUpdateCount = 0;
  let labelSyncCount = 0;
  let gridDrawCount = 0;
  let nodeOutlineVisibilityUpdateCount = 0;
  let lastCameraState = cameraState(viewport);
  const recentFrameMs = [];

  backgroundLayer.addChild(grid);
  edgeLayer.addChild(edgeGraphics);
  interactionLayer.addChild(marqueeGraphics, temporaryEdgeGraphics);
  effectsLayer.addChild(glow);
  drawWorkspaceGrid(grid);
  gridDrawCount += 1;
  for (const node of nodes) {
    const container = nodeContainer(node);
    nodeContainers.set(node.id, container);
    nodeLayer.addChild(container);
    acquireLabel(node.id);
  }
  syncAllLabels();
  redrawEdges();

  const resizeObserver = new ResizeObserver(() => {
    const nextSize = hostScreenSize(host);
    app.renderer.resize(nextSize.width, nextSize.height);
    viewport.resize(nextSize.width, nextSize.height, 4000, 4000);
    viewport.forceHitArea = new Rectangle(0, 0, nextSize.width, nextSize.height);
    syncAllLabels();
  });
  resizeObserver.observe(host);

  const pointerDown = (event) => {
    if (event.button !== 0) {
      return;
    }
    const screen = screenPointFromPointer(app.canvas, event);
    const sourcePort = hitTestPortAtScreen(screen, {
      excludeNodeId: null,
      role: "source",
    });
    if (sourcePort) {
      startEdgeDrawing(sourcePort.nodeId, sourcePort.portId);
      capturePointer(event);
      stopNativeInteraction(event);
      return;
    }
    const node = hitTestNodeAtScreen(screen);
    if (node) {
      if (isSelectionToggleEvent(event)) {
        toggleNodeSelection(node.id);
        capturePointer(event);
        stopNativeInteraction(event);
        return;
      }
      startNodeDragging(node.id, screen);
      capturePointer(event);
      stopNativeInteraction(event);
      return;
    }
    if (event.shiftKey) {
      startMarqueeSelection(screen);
      capturePointer(event);
      stopNativeInteraction(event);
      return;
    }
    if (isSelectionToggleEvent(event)) {
      stopNativeInteraction(event);
      return;
    }
    clearSelection();
    startCameraPanning(screen);
    capturePointer(event);
    stopNativeInteraction(event);
  };
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
    syncHoveredNodeAtScreen(screen);
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
  const contextMenu = createCanvasContextMenuHandler({
    canvas: app.canvas,
    onCanvasContextMenu,
    viewport,
  });
  const keyDown = (event) => {
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
  app.canvas.addEventListener("pointerdown", pointerDown, true);
  app.canvas.addEventListener("pointermove", pointerMove);
  app.canvas.addEventListener("pointerleave", pointerLeave);
  app.canvas.addEventListener("contextmenu", contextMenu);
  app.canvas.addEventListener("wheel", wheel, { capture: true, passive: false });
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerCancel);
  window.addEventListener("keydown", keyDown);

  app.ticker.add(() => {
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
      cameraUpdateCount += 1;
      lastCameraState = nextCameraState;
      syncAllLabels();
    }
    if (!destroyed) {
      drawWorkspaceGlow(glow, nodes, now);
    }
  });

  const unregisterDebugSurface = debugEnabled
    ? registerPixiWorkspaceDebugSurface(debugSurfaceId, () => {
        const canvasRect = app.canvas.getBoundingClientRect();
        const visual = samplePixiVisualState(app.renderer, app.stage, backgroundColor);
        const camera = cameraState(viewport);
        const nodeGeometryContexts = nodeGeometryContextCounts();
        const frameStats = frameSampleStats(recentFrameMs);
        return {
          camera,
          canvas: {
            bottom: canvasRect.bottom,
            clientHeight: app.canvas.clientHeight,
            clientWidth: app.canvas.clientWidth,
            height: app.canvas.height,
            left: canvasRect.left,
            right: canvasRect.right,
            top: canvasRect.top,
            width: app.canvas.width,
          },
          graph: {
            edgeCount: edges.length,
            edges: edges.map((edge) => ({
              id: edge.id,
              sourceNodeId: edge.sourceNodeId,
              sourcePortId: edge.sourcePortId,
              targetNodeId: edge.targetNodeId,
              targetPortId: edge.targetPortId,
            })),
            nodeCount: nodes.length,
            nodes: nodes.map((node) => {
              const screen = viewport.toScreen(node.x + node.width / 2, node.y + node.height / 2);
              const label = requireNodeLabel(node.id);
              const labelGlobal = label.getGlobalPosition(new Point());
              return {
                height: node.height,
                id: node.id,
                label: {
                  eventMode: label.eventMode,
                  fontDistanceFieldRange: loadedNodeLabelFont.distanceField.range,
                  fontDistanceFieldType: loadedNodeLabelFont.distanceField.type,
                  fontFamily: label.style.fontFamily,
                  fontSize: label.style.fontSize,
                  fontSizeMode: nodeLabelFontSizeModes.get(node.id) ?? "normal",
                  globalX: labelGlobal.x,
                  globalY: labelGlobal.y,
                  kind: "bitmap-text",
                  screenX: label.x,
                  screenY: label.y,
                  scaleX: label.scale.x,
                  scaleY: label.scale.y,
                  text: label.text,
                  visible: label.visible,
                  visibilityReason: nodeLabelVisibilityReasons.get(node.id) ?? "zoom-hidden",
                  worldScaleX: label.worldTransform.a,
                  worldScaleY: label.worldTransform.d,
                },
                ports: ports.map((port) => {
                  const world = portWorldPosition(node, port.id);
                  const portScreen = viewport.toScreen(world.x, world.y);
                  return {
                    id: port.id,
                    role: port.role,
                    screenX: portScreen.x,
                    screenY: portScreen.y,
                    x: world.x,
                    y: world.y,
                  };
                }),
                screenX: screen.x,
                screenY: screen.y,
                width: node.width,
                x: node.x,
                y: node.y,
              };
            }),
            workflow: graph.workflow ?? null,
          },
          interaction: {
            drawingEdge: Boolean(drawingEdge),
            drawingMarquee: Boolean(drawingMarquee),
            selectedNodeId: firstSelectedNodeId(),
            selectedNodeIds: [...selectedNodeIds],
          },
          render: {
            averageFrameMs: frameStats.average,
            cameraUpdateCount,
            edgeCommitCount,
            edgeGraphicsCount: 1,
            edgeRedrawCount,
            frameCount,
            gridDrawCount,
            compactSelectedLabelCount: countMapValues(nodeLabelFontSizeModes, "compact-selected"),
            labelObjectCount: nodeLabels.size,
            labelSyncCount,
            labelVisibilityMode: labelVisibilityModeForZoom(camera.zoom),
            marqueeUpdateCount,
            nodeBodyContextCount: nodeGeometryContexts.body,
            nodeBodyGraphicsCount: nodeBodies.size,
            nodeContainerCount: nodeContainers.size,
            nodeDragUpdateCount,
            nodeOutlineContextCount: nodeGeometryContexts.outline,
            nodeOutlineGraphicsCount: countNodeOutlineGraphics(nodeOutlines),
            nodeOutlineVisibilityUpdateCount,
            nodeShadowContextCount: nodeGeometryContexts.shadow,
            nodeShadowGraphicsCount: nodeShadows.size,
            pointerPanUpdateCount,
            portGraphicsCount: portVisuals.size,
            reactRenderCount: reactRenderCount(),
            recentFrameMs: [...recentFrameMs],
            selectionChangeCount,
            ...spatialQueries.debugSnapshot(),
            temporaryEdgeUpdateCount,
            totalPixiDisplayObjectCount: totalDisplayObjectCount(app.stage),
            visibleLabelCount: visibleDisplayObjectCount(nodeLabels.values()),
            wheelPanUpdateCount,
            wheelZoomUpdateCount,
            worstFrameMs: frameStats.worst,
          },
          surfaceId: debugSurfaceId,
          visual,
        };
      })
    : null;

  return {
    destroy: () => {
      destroyed = true;
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
      for (const nodeId of [...nodeLabels.keys()]) {
        releaseLabel(nodeId);
      }
      app.destroy(true, { children: true, texture: true });
    },
  };

  function nodeContainer(node) {
    const container = new Container();
    container.x = node.x;
    container.y = node.y;

    const body = new Graphics(nodeBodyContextFor(node));
    body.eventMode = "static";
    body.cursor = "grab";
    body.hitArea = new Rectangle(0, 0, node.width, node.height);
    nodeBodies.set(node.id, body);
    const shadow = new Graphics(nodeShadowContextFor(node));
    nodeShadows.set(node.id, shadow);
    const hoverOutline = new Graphics(nodeOutlineContextFor(node, "hovered"));
    hoverOutline.visible = false;
    const selectedOutline = new Graphics(nodeOutlineContextFor(node, "selected"));
    selectedOutline.visible = false;
    const portContainers = ports.map((port) => portContainer(node, port));
    nodeOutlines.set(node.id, { hoverOutline, selectedOutline });

    container.addChild(shadow, body, hoverOutline, selectedOutline, ...portContainers);
    body.on("pointerover", () => {
      setHoveredNodeId(node.id);
    });
    body.on("pointerout", () => {
      setHoveredNodeId(null);
    });

    return container;
  }

  function acquireLabel(nodeId) {
    const existingLabel = nodeLabels.get(nodeId);
    if (existingLabel) {
      return existingLabel;
    }
    const node = requireNode(nodeId);
    validateNodeLabelGlyphs(node.id, node.label);
    const label = new BitmapText({
      anchor: 0.5,
      style: {
        align: "center",
        fill: 0xf8fafc,
        fontFamily: loadedNodeLabelFont.fontFamily,
        fontSize: nodeLabelBitmapFontSize,
      },
      text: node.label,
    });
    label.eventMode = "none";
    label.roundPixels = true;
    nodeLabels.set(nodeId, label);
    nodeLabelFontSizeModes.set(nodeId, "normal");
    nodeLabelVisibilityReasons.set(nodeId, "zoom-hidden");
    labelLayer.addChild(label);
    return label;
  }

  function releaseLabel(nodeId) {
    const label = nodeLabels.get(nodeId);
    if (!label) {
      return;
    }
    nodeLabels.delete(nodeId);
    nodeLabelFontSizeModes.delete(nodeId);
    nodeLabelVisibilityReasons.delete(nodeId);
    label.removeFromParent();
    label.destroy();
  }

  function portContainer(node, port) {
    const position = portLocalPosition(node, port.id);
    const container = new Container();
    container.x = position.x;
    container.y = position.y;
    container.eventMode = "static";
    container.cursor = port.role === "source" ? "crosshair" : "copy";
    container.hitArea = new Rectangle(
      -portHitRadiusScreen,
      -portHitRadiusScreen,
      portHitRadiusScreen * 2,
      portHitRadiusScreen * 2,
    );
    const visual = new Graphics();
    const key = portKey(node.id, port.id);
    portVisuals.set(key, visual);
    container.addChild(visual);
    setPortVisualState(node.id, port.id, "idle");
    container.on("pointerover", () => {
      if (!drawingEdge) {
        setPortVisualState(node.id, port.id, "hover");
      }
    });
    container.on("pointerout", () => {
      if (!drawingEdge) {
        setPortVisualState(node.id, port.id, "idle");
      }
    });
    return container;
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
      syncLabelPosition(node.id);
    }
    draggingNode.moved = true;
    syncLabelVisibility();
    nodeDragUpdateCount += 1;
    redrawEdges();
  }
  function finishNodeDragging() {
    const shouldPersistPositions = draggingNode?.moved === true;
    viewport.plugins.resume("decelerate");
    draggingNode = null;
    for (const body of nodeBodies.values()) {
      body.cursor = "grab";
    }
    if (shouldPersistPositions && onNodePositionsChange) {
      onNodePositionsChange(
        nodes.map((node) => ({
          nodeId: node.id,
          x: Math.round(node.x),
          y: Math.round(node.y),
        })),
      );
    }
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
    syncLabelVisibility();
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

  function redrawEdges() {
    edgeGraphics.clear();
    for (const edge of edges) {
      const source = requireNode(edge.sourceNodeId);
      const target = requireNode(edge.targetNodeId);
      const start = portWorldPosition(source, requireEdgePort(edge, "sourcePortId"));
      const end = portWorldPosition(target, requireEdgePort(edge, "targetPortId"));
      drawCurvedEdge(edgeGraphics, start, end, { alpha: 0.65, color: 0xe2e8f0, width: 2.5 });
    }
    edgeRedrawCount += 1;
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
      for (const port of ports) {
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
    edges.push({
      id: `drawn-${nextEdgeSequence}`,
      sourceNodeId: edgeDrawing.sourceNodeId,
      sourcePortId: edgeDrawing.sourcePortId,
      targetNodeId: targetPort.nodeId,
      targetPortId: targetPort.portId,
    });
    nextEdgeSequence += 1;
    edgeCommitCount += 1;
    redrawEdges();
  }
  function hitTestPortAtScreen(screen, { excludeNodeId, role }) {
    let bestPort = null;
    let bestDistance = Infinity;
    const candidates = spatialQueries.portHitCandidatesAtScreen(screen, portHitRadiusScreen);
    for (const node of candidates) {
      if (node.id === excludeNodeId) {
        continue;
      }
      for (const port of ports) {
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
    syncAllLabels();
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
    syncAllLabels();
  }

  function syncAllLabels() {
    for (const node of nodes) {
      syncLabelPosition(node.id);
    }
    syncLabelVisibility();
  }

  function syncLabelPosition(nodeId) {
    const node = requireNode(nodeId);
    const label = requireNodeLabel(nodeId);
    const screen = viewport.toScreen(node.x + node.width / 2, node.y + node.height / 2);
    label.position.set(Math.round(screen.x), Math.round(screen.y));
    label.scale.set(1);
    labelSyncCount += 1;
  }

  function syncLabelVisibility() {
    syncNodeLabelVisibility({
      compactSelectedFontSize: compactSelectedNodeLabelBitmapFontSize,
      fontSizeModes: nodeLabelFontSizeModes,
      nodeLabels,
      nodes,
      normalFontSize: nodeLabelBitmapFontSize,
      selectedNodeIds,
      viewport,
      visibleNodeIds: spatialQueries.labelVisibleNodeIds(),
      visibilityReasons: nodeLabelVisibilityReasons,
    });
  }

  function setPortVisualState(nodeId, portId, state) {
    const key = portKey(nodeId, portId);
    const visual = portVisuals.get(key);
    if (!visual) {
      throw new Error(`workspace port visual is missing: ${key}`);
    }
    portVisualStates.set(key, state);
    drawPortVisualState(visual, requirePort(portId), state);
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

  function requireNodeLabel(nodeId) {
    const label = nodeLabels.get(nodeId);
    if (!label) {
      throw new Error(`workspace node label is missing: ${nodeId}`);
    }
    return label;
  }

  function requireEdgePort(edge, field) {
    const portId = edge[field];
    if (!portId) {
      throw new Error(`workspace edge ${edge.id} is missing ${field}`);
    }
    return portId;
  }
}
