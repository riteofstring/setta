/* global ResizeObserver, performance, window */

import { Application, Container, Graphics, Point, Rectangle, Text } from "pixi.js";
import { Viewport } from "pixi-viewport";

const backgroundColor = 0x07080d;
const backgroundRed = 7;
const backgroundGreen = 8;
const backgroundBlue = 13;
const initialNodes = [
  {
    color: 0x14b8a6,
    height: 82,
    id: "source",
    label: "Source",
    width: 168,
    x: -360,
    y: -140,
  },
  {
    color: 0x8b5cf6,
    height: 90,
    id: "reason",
    label: "Reason",
    width: 184,
    x: -70,
    y: -40,
  },
  {
    color: 0xf59e0b,
    height: 82,
    id: "output",
    label: "Output",
    width: 168,
    x: 260,
    y: -150,
  },
  {
    color: 0x38bdf8,
    height: 76,
    id: "review",
    label: "Review",
    width: 160,
    x: 110,
    y: 150,
  },
];
const initialEdges = [
  { id: "source-reason", sourceNodeId: "source", targetNodeId: "reason" },
  { id: "reason-output", sourceNodeId: "reason", targetNodeId: "output" },
  { id: "reason-review", sourceNodeId: "reason", targetNodeId: "review" },
];

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
  viewport
    .drag({ mouseButtons: "left", pressDrag: true })
    .pinch()
    .wheel({ percent: 0.08, trackpadPinch: true, wheelZoom: true })
    .decelerate({ friction: 0.88 });
  viewport.moveCenter(0, 20);
  app.stage.addChild(viewport);

  const backgroundLayer = new Container();
  const edgeLayer = new Container();
  const nodeLayer = new Container();
  const interactionLayer = new Container();
  const effectsLayer = new Container();
  viewport.addChild(backgroundLayer, edgeLayer, nodeLayer, interactionLayer, effectsLayer);

  const nodes = initialNodes.map((node) => ({ ...node }));
  const edges = initialEdges.map((edge) => ({ ...edge }));
  const nodeContainers = new Map();
  const nodeOutlines = new Map();
  const edgeGraphics = new Graphics();
  const grid = new Graphics();
  const glow = new Graphics();
  let selectedNodeId = null;
  let draggingNode = null;
  let destroyed = false;
  let frameCount = 0;
  let lastFrameAt = performance.now();
  let cameraUpdateCount = 0;
  let nodeDragUpdateCount = 0;
  let edgeRedrawCount = 0;
  let lastCameraState = cameraState(viewport);
  const recentFrameMs = [];

  backgroundLayer.addChild(grid);
  edgeLayer.addChild(edgeGraphics);
  effectsLayer.addChild(glow);
  drawGrid(grid);
  for (const node of nodes) {
    const container = nodeContainer(node);
    nodeContainers.set(node.id, container);
    nodeLayer.addChild(container);
  }
  redrawEdges();

  const resizeObserver = new ResizeObserver(() => {
    const nextSize = hostScreenSize(host);
    app.renderer.resize(nextSize.width, nextSize.height);
    viewport.resize(nextSize.width, nextSize.height, 4000, 4000);
    viewport.forceHitArea = new Rectangle(0, 0, nextSize.width, nextSize.height);
  });
  resizeObserver.observe(host);

  const pointerMove = (event) => {
    if (!draggingNode) {
      return;
    }
    const node = nodes.find((candidate) => candidate.id === draggingNode?.nodeId);
    const container = nodeContainers.get(draggingNode.nodeId);
    if (!node || !container) {
      throw new Error(`dragged node is missing: ${draggingNode.nodeId}`);
    }
    const world = viewport.toWorld(screenPointFromPointer(app.canvas, event));
    node.x = world.x - draggingNode.offsetX;
    node.y = world.y - draggingNode.offsetY;
    container.x = node.x;
    container.y = node.y;
    nodeDragUpdateCount += 1;
    redrawEdges();
  };
  const pointerUp = () => {
    if (!draggingNode) {
      return;
    }
    viewport.plugins.resume("drag");
    draggingNode = null;
    for (const container of nodeContainers.values()) {
      container.cursor = "grab";
    }
  };
  app.canvas.addEventListener("pointermove", pointerMove);
  window.addEventListener("pointerup", pointerUp);

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
            nodeCount: nodes.length,
            nodes: nodes.map((node) => {
              const screen = viewport.toScreen(node.x + node.width / 2, node.y + node.height / 2);
              return {
                height: node.height,
                id: node.id,
                screenX: screen.x,
                screenY: screen.y,
                width: node.width,
                x: node.x,
                y: node.y,
              };
            }),
          },
          interaction: {
            drawingEdge: false,
            selectedNodeId,
          },
          render: {
            averageFrameMs: frameAverage,
            cameraUpdateCount,
            edgeRedrawCount,
            frameCount,
            nodeDragUpdateCount,
            reactRenderCount: reactRenderCount(),
            recentFrameMs: [...recentFrameMs],
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
      app.canvas.removeEventListener("pointermove", pointerMove);
      window.removeEventListener("pointerup", pointerUp);
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
    container.eventMode = "static";
    container.cursor = "grab";
    container.hitArea = new Rectangle(0, 0, node.width, node.height);

    const body = new Graphics()
      .roundRect(0, 0, node.width, node.height, 8)
      .fill({ alpha: 0.92, color: node.color })
      .roundRect(0, 0, node.width, node.height, 8)
      .stroke({ alpha: 0.55, color: 0xffffff, width: 1.5 });
    const shadow = new Graphics()
      .roundRect(7, 9, node.width, node.height, 8)
      .fill({ alpha: 0.14, color: 0x000000 });
    const label = new Text({
      style: {
        fill: 0xf8fafc,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        fontSize: 16,
        fontWeight: "700",
      },
      text: node.label,
    });
    label.x = 18;
    label.y = 18;
    const port = new Graphics().circle(node.width - 20, node.height / 2, 6).fill(0xf8fafc);
    const inputPort = new Graphics().circle(20, node.height / 2, 6).fill(0xf8fafc);
    const outline = new Graphics();
    nodeOutlines.set(node.id, outline);

    container.addChild(shadow, body, label, inputPort, port, outline);
    container.on("pointerover", () => {
      drawNodeOutline(node.id, 0xffffff, 0.42);
    });
    container.on("pointerout", () => {
      if (selectedNodeId !== node.id) {
        drawNodeOutline(node.id, 0xffffff, 0);
      }
    });
    container.on("pointerdown", (event) => {
      event.stopPropagation();
      selectedNodeId = node.id;
      for (const candidate of nodes) {
        drawNodeOutline(candidate.id, 0xffffff, candidate.id === selectedNodeId ? 0.95 : 0);
      }
      const world = viewport.toWorld(event.global);
      draggingNode = {
        nodeId: node.id,
        offsetX: world.x - node.x,
        offsetY: world.y - node.y,
      };
      container.cursor = "grabbing";
      viewport.plugins.pause("drag");
    });

    return container;
  }

  function drawNodeOutline(nodeId, color, alpha) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    const outline = nodeOutlines.get(nodeId);
    if (!node || !outline) {
      throw new Error(`node outline target is missing: ${nodeId}`);
    }
    outline.clear();
    if (alpha <= 0) {
      return;
    }
    outline.roundRect(-5, -5, node.width + 10, node.height + 10, 12).stroke({
      alpha,
      color,
      width: selectedNodeId === nodeId ? 3 : 2,
    });
  }

  function redrawEdges() {
    edgeGraphics.clear();
    for (const edge of edges) {
      const source = requireNode(edge.sourceNodeId);
      const target = requireNode(edge.targetNodeId);
      const start = new Point(source.x + source.width, source.y + source.height / 2);
      const end = new Point(target.x, target.y + target.height / 2);
      const controlOffset = Math.max(80, Math.abs(end.x - start.x) * 0.35);
      edgeGraphics
        .moveTo(start.x, start.y)
        .bezierCurveTo(start.x + controlOffset, start.y, end.x - controlOffset, end.y, end.x, end.y)
        .stroke({ alpha: 0.65, color: 0xe2e8f0, width: 2.5 });
    }
    edgeRedrawCount += 1;
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

  function requireNode(nodeId) {
    const node = nodes.find((candidate) => candidate.id === nodeId);
    if (!node) {
      throw new Error(`workspace edge references missing node: ${nodeId}`);
    }
    return node;
  }
}

function isNonBackgroundColor(red, green, blue) {
  return (
    Math.abs(red - backgroundRed) > 3 ||
    Math.abs(green - backgroundGreen) > 3 ||
    Math.abs(blue - backgroundBlue) > 3
  );
}

function drawGrid(grid) {
  grid.clear();
  for (let position = -2000; position <= 2000; position += 48) {
    grid.moveTo(position, -2000).lineTo(position, 2000);
    grid.moveTo(-2000, position).lineTo(2000, position);
  }
  grid.stroke({ alpha: 0.22, color: 0x334155, width: 1 });
  for (let position = -2000; position <= 2000; position += 240) {
    grid.moveTo(position, -2000).lineTo(position, 2000);
    grid.moveTo(-2000, position).lineTo(2000, position);
  }
  grid.stroke({ alpha: 0.28, color: 0x64748b, width: 1.5 });
}

function hostScreenSize(host) {
  return {
    height: Math.max(1, Math.floor(host.clientHeight || window.innerHeight || 1)),
    width: Math.max(1, Math.floor(host.clientWidth || window.innerWidth || 1)),
  };
}

function cameraState(viewport) {
  const corner = viewport.corner;
  return {
    x: corner.x,
    y: corner.y,
    zoom: viewport.scaled,
  };
}

function screenPointFromPointer(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}
