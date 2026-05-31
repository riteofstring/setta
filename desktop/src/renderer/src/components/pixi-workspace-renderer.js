/* global ResizeObserver, performance, window */

import { Application, Container, Graphics, Point, Rectangle, Text } from "pixi.js";
import { Viewport } from "pixi-viewport";

import { initialEdges, initialNodes } from "./pixi-workspace-fixture";
import {
  cameraState,
  capturePointer,
  clamp,
  drawGrid,
  hostScreenSize,
  isNonBackgroundColor,
  isSelectionToggleEvent,
  isZoomWheel,
  marqueeBounds,
  nodeBounds,
  normalizedWheelDelta,
  parsePortKey,
  portKey,
  ports,
  portLocalPosition,
  portWorldPosition,
  rectanglesIntersect,
  releasePointer,
  requirePort,
  screenPointFromPointer,
  screenPointFromWheel,
  setsEqual,
  stopNativeInteraction,
  zoomFactorFromWheel,
} from "./pixi-workspace-renderer-helpers";

const backgroundColor = 0x07080d;
const maxZoom = 4;
const minZoom = 0.25;
const portHitRadiusScreen = 18;

export async function createPixiWorkspaceRenderer({ debugEnabled, host, reactRenderCount }) {
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

  const nodes = initialNodes.map((node) => ({ ...node }));
  const edges = initialEdges.map((edge) => ({ ...edge }));
  const nodeContainers = new Map();
  const nodeBodies = new Map();
  const nodeLabels = new Map();
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
  let nextEdgeSequence = initialEdges.length + 1;
  let pointerPanUpdateCount = 0;
  let selectionChangeCount = 0;
  let temporaryEdgeUpdateCount = 0;
  let wheelPanUpdateCount = 0;
  let wheelZoomUpdateCount = 0;
  let lastCameraState = cameraState(viewport);
  const recentFrameMs = [];

  backgroundLayer.addChild(grid);
  edgeLayer.addChild(edgeGraphics);
  interactionLayer.addChild(marqueeGraphics, temporaryEdgeGraphics);
  effectsLayer.addChild(glow);
  drawGrid(grid);
  for (const node of nodes) {
    const container = nodeContainer(node);
    nodeContainers.set(node.id, container);
    nodeLayer.addChild(container);
    createNodeLabel(node);
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
      drawTemporaryEdge();
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
    }
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
    if (
      nextCameraState.x !== lastCameraState.x ||
      nextCameraState.y !== lastCameraState.y ||
      nextCameraState.zoom !== lastCameraState.zoom
    ) {
      cameraUpdateCount += 1;
      lastCameraState = nextCameraState;
      syncAllLabels();
    }
    drawGlow(glow, now);
  });

  if (debugEnabled) {
    window.__settaPixiWorkspaceDebug = {
      getSnapshot: () => {
        const visual = sampleVisualState();
        const camera = cameraState(viewport);
        const frameAverage =
          recentFrameMs.length === 0
            ? 0
            : recentFrameMs.reduce((total, value) => total + value, 0) / recentFrameMs.length;
        return {
          camera,
          canvas: {
            clientHeight: app.canvas.clientHeight,
            clientWidth: app.canvas.clientWidth,
            height: app.canvas.height,
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
                  globalX: labelGlobal.x,
                  globalY: labelGlobal.y,
                  screenX: label.x,
                  screenY: label.y,
                  scaleX: label.scale.x,
                  scaleY: label.scale.y,
                  text: label.text,
                  visible: label.visible,
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
          },
          interaction: {
            drawingEdge: Boolean(drawingEdge),
            drawingMarquee: Boolean(drawingMarquee),
            selectedNodeId: firstSelectedNodeId(),
            selectedNodeIds: [...selectedNodeIds],
          },
          render: {
            averageFrameMs: frameAverage,
            cameraUpdateCount,
            edgeCommitCount,
            edgeRedrawCount,
            frameCount,
            marqueeUpdateCount,
            nodeDragUpdateCount,
            pointerPanUpdateCount,
            reactRenderCount: reactRenderCount(),
            recentFrameMs: [...recentFrameMs],
            selectionChangeCount,
            temporaryEdgeUpdateCount,
            wheelPanUpdateCount,
            wheelZoomUpdateCount,
            worstFrameMs: recentFrameMs.length === 0 ? 0 : Math.max(...recentFrameMs),
          },
          visual,
        };
      },
    };
  }

  return {
    destroy: () => {
      destroyed = true;
      resizeObserver.disconnect();
      app.canvas.removeEventListener("pointerdown", pointerDown, true);
      app.canvas.removeEventListener("pointermove", pointerMove);
      app.canvas.removeEventListener("wheel", wheel, true);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerCancel);
      window.removeEventListener("keydown", keyDown);
      if (debugEnabled) {
        delete window.__settaPixiWorkspaceDebug;
      }
      app.destroy(true, { children: true, texture: true });
    },
  };

  function nodeContainer(node) {
    const container = new Container();
    container.x = node.x;
    container.y = node.y;

    const body = new Graphics()
      .roundRect(0, 0, node.width, node.height, 8)
      .fill({ alpha: 0.92, color: node.color })
      .roundRect(0, 0, node.width, node.height, 8)
      .stroke({ alpha: 0.55, color: 0xffffff, width: 1.5 });
    body.eventMode = "static";
    body.cursor = "grab";
    body.hitArea = new Rectangle(0, 0, node.width, node.height);
    nodeBodies.set(node.id, body);
    const shadow = new Graphics()
      .roundRect(7, 9, node.width, node.height, 8)
      .fill({ alpha: 0.14, color: 0x000000 });
    const outline = new Graphics();
    const portContainers = ports.map((port) => portContainer(node, port));
    nodeOutlines.set(node.id, outline);

    container.addChild(shadow, body, outline, ...portContainers);
    body.on("pointerover", () => {
      hoveredNodeIds.add(node.id);
      drawNodeOutline(node.id);
    });
    body.on("pointerout", () => {
      hoveredNodeIds.delete(node.id);
      drawNodeOutline(node.id);
    });

    return container;
  }

  function createNodeLabel(node) {
    const label = new Text({
      style: {
        align: "center",
        fill: 0xf8fafc,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 16,
        fontWeight: "700",
      },
      text: node.label,
    });
    label.anchor.set(0.5);
    label.eventMode = "none";
    label.roundPixels = true;
    nodeLabels.set(node.id, label);
    labelLayer.addChild(label);
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
      syncLabelPosition(node.id);
    }
    nodeDragUpdateCount += 1;
    redrawEdges();
  }

  function finishNodeDragging() {
    viewport.plugins.resume("decelerate");
    draggingNode = null;
    for (const body of nodeBodies.values()) {
      body.cursor = "grab";
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
  }

  function drawAllNodeOutlines() {
    for (const candidate of nodes) {
      drawNodeOutline(candidate.id);
    }
  }

  function drawNodeOutline(nodeId) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    const outline = nodeOutlines.get(nodeId);
    if (!node || !outline) {
      throw new Error(`node outline target is missing: ${nodeId}`);
    }
    const selected = selectedNodeIds.has(nodeId);
    const hovered = hoveredNodeIds.has(nodeId);
    outline.clear();
    if (!selected && !hovered) {
      return;
    }
    const alpha = selected ? 0.95 : 0.42;
    outline.roundRect(-5, -5, node.width + 10, node.height + 10, 12).stroke({
      alpha,
      color: 0xffffff,
      width: selected ? 3 : 2,
    });
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
    drawTemporaryEdge();
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
    drawMarqueeSelection();
  }

  function updateMarqueeSelection(screen) {
    if (!drawingMarquee) {
      return;
    }
    const world = viewport.toWorld(screen);
    drawingMarquee.endX = world.x;
    drawingMarquee.endY = world.y;
    marqueeUpdateCount += 1;
    drawMarqueeSelection();
  }

  function commitMarqueeSelection() {
    if (!drawingMarquee) {
      return;
    }
    const bounds = marqueeBounds(drawingMarquee);
    const intersectingNodeIds = nodes
      .filter((node) => rectanglesIntersect(bounds, nodeBounds(node)))
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

  function drawMarqueeSelection() {
    marqueeGraphics.clear();
    if (!drawingMarquee) {
      return;
    }
    const bounds = marqueeBounds(drawingMarquee);
    marqueeGraphics
      .rect(bounds.x, bounds.y, bounds.width, bounds.height)
      .fill({ alpha: 0.14, color: 0x38bdf8 })
      .rect(bounds.x, bounds.y, bounds.width, bounds.height)
      .stroke({ alpha: 0.9, color: 0xbae6fd, width: 2 });
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

  function drawTemporaryEdge() {
    temporaryEdgeGraphics.clear();
    if (!drawingEdge) {
      return;
    }
    const start = new Point(drawingEdge.startX, drawingEdge.startY);
    const end = new Point(drawingEdge.endX, drawingEdge.endY);
    drawCurvedEdge(temporaryEdgeGraphics, start, end, {
      alpha: 0.94,
      color: 0x67e8f9,
      width: 3.5,
    });
    temporaryEdgeGraphics
      .circle(start.x, start.y, 5.5)
      .fill({ alpha: 0.92, color: 0x67e8f9 })
      .circle(end.x, end.y, 5.5)
      .stroke({ alpha: 0.82, color: 0x67e8f9, width: 2.5 });
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
    for (const node of nodes) {
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
    const world = viewport.toWorld(screen);
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
      const node = nodes[index];
      if (
        world.x >= node.x &&
        world.x <= node.x + node.width &&
        world.y >= node.y &&
        world.y <= node.y + node.height
      ) {
        return node;
      }
    }
    return null;
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
  }

  function syncLabelPosition(nodeId) {
    const node = requireNode(nodeId);
    const label = requireNodeLabel(nodeId);
    const screen = viewport.toScreen(node.x + node.width / 2, node.y + node.height / 2);
    label.position.set(Math.round(screen.x), Math.round(screen.y));
    label.scale.set(1);
  }

  function setPortVisualState(nodeId, portId, state) {
    const key = portKey(nodeId, portId);
    const visual = portVisuals.get(key);
    if (!visual) {
      throw new Error(`workspace port visual is missing: ${key}`);
    }
    portVisualStates.set(key, state);
    visual.clear();
    const port = requirePort(portId);
    const color = port.role === "source" ? 0x67e8f9 : 0xc4b5fd;
    const alpha = state === "idle" ? 0.82 : 1;
    const ringAlpha = state === "idle" ? 0.34 : 0.88;
    const ringRadius = state === "active" || state === "target" ? 13 : 10;
    visual
      .circle(0, 0, ringRadius)
      .stroke({ alpha: ringAlpha, color, width: state === "idle" ? 1.5 : 2.5 })
      .circle(0, 0, 6)
      .fill({ alpha, color: 0xf8fafc });
  }

  function drawCurvedEdge(target, start, end, stroke) {
    const controlOffset = Math.max(80, Math.abs(end.x - start.x) * 0.35);
    target
      .moveTo(start.x, start.y)
      .bezierCurveTo(start.x + controlOffset, start.y, end.x - controlOffset, end.y, end.x, end.y)
      .stroke(stroke);
  }

  function drawGlow(target, now) {
    if (destroyed) {
      return;
    }
    target.clear();
    const pulse = 0.35 + Math.sin(now / 450) * 0.15;
    for (const node of nodes) {
      target
        .circle(node.x + node.width / 2, node.y + node.height / 2, 58 + pulse * 16)
        .stroke({ alpha: 0.08 + pulse * 0.05, color: node.color, width: 2 });
    }
  }

  function sampleVisualState() {
    const sample = app.renderer.extract.pixels({
      clearColor: backgroundColor,
      resolution: 0.25,
      target: app.stage,
    });
    const pixelStride = Math.max(1, Math.floor((sample.width * sample.height) / 6000));
    const colorSamples = new Set();
    let nonBackgroundPixelCount = 0;
    let sampledPixelCount = 0;
    for (let pixelIndex = 0; pixelIndex < sample.width * sample.height; pixelIndex += pixelStride) {
      const offset = pixelIndex * 4;
      const red = sample.pixels[offset] ?? 0;
      const green = sample.pixels[offset + 1] ?? 0;
      const blue = sample.pixels[offset + 2] ?? 0;
      const alpha = sample.pixels[offset + 3] ?? 0;
      if (alpha === 0) {
        continue;
      }
      sampledPixelCount += 1;
      colorSamples.add(`${red},${green},${blue},${alpha}`);
      if (isNonBackgroundColor(red, green, blue)) {
        nonBackgroundPixelCount += 1;
      }
    }
    return {
      hasNonBackgroundPixels: nonBackgroundPixelCount > 0,
      nonBackgroundPixelCount,
      sampledColorCount: colorSamples.size,
      sampledPixelCount,
    };
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
