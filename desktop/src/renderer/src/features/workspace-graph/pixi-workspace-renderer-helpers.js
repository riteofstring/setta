/* global window */

import { Point } from "pixi.js";

const backgroundRed = 7;
const backgroundGreen = 8;
const backgroundBlue = 13;
const lineWheelPixelSize = 20;
const mouseWheelZoomSensitivity = 0.0016;
const notchedWheelDeltaThreshold = 80;
const trackpadPinchZoomSensitivity = 0.018;

export const ports = [
  { id: "input", role: "target", xOffset: 20, yRatio: 0.5 },
  { id: "output", role: "source", xOffset: -20, yRatio: 0.5 },
];

export function isSelectionToggleEvent(event) {
  return Boolean(event.metaKey || event.ctrlKey);
}

export function setsEqual(left, right) {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

export function marqueeBounds(marquee) {
  const x = Math.min(marquee.startX, marquee.endX);
  const y = Math.min(marquee.startY, marquee.endY);
  return {
    height: Math.abs(marquee.endY - marquee.startY),
    width: Math.abs(marquee.endX - marquee.startX),
    x,
    y,
  };
}

export function nodeBounds(node) {
  return {
    height: node.height,
    width: node.width,
    x: node.x,
    y: node.y,
  };
}

export function pointInsideNodeBounds(point, node) {
  return (
    point.x >= node.x &&
    point.x <= node.x + node.width &&
    point.y >= node.y &&
    point.y <= node.y + node.height
  );
}

export function rectanglesIntersect(left, right) {
  return (
    left.x <= right.x + right.width &&
    left.x + left.width >= right.x &&
    left.y <= right.y + right.height &&
    left.y + left.height >= right.y
  );
}

export function portWorldPosition(node, portId) {
  const position = portLocalPosition(node, portId);
  return new Point(node.x + position.x, node.y + position.y);
}

export function portLocalPosition(node, portId) {
  const port = requirePort(portId);
  return {
    x: port.xOffset >= 0 ? port.xOffset : node.width + port.xOffset,
    y: node.height * port.yRatio,
  };
}

export function requirePort(portId) {
  const port = ports.find((candidate) => candidate.id === portId);
  if (!port) {
    throw new Error(`unknown workspace port: ${portId}`);
  }
  return port;
}

export function portKey(nodeId, portId) {
  return `${nodeId}:${portId}`;
}

export function parsePortKey(key) {
  const [nodeId, portId] = key.split(":");
  if (!nodeId || !portId) {
    throw new Error(`invalid workspace port key: ${key}`);
  }
  return { nodeId, portId };
}

function isNonBackgroundColor(red, green, blue) {
  return (
    Math.abs(red - backgroundRed) > 3 ||
    Math.abs(green - backgroundGreen) > 3 ||
    Math.abs(blue - backgroundBlue) > 3
  );
}

export function samplePixiVisualState(renderer, stage, clearColor) {
  const sample = renderer.extract.pixels({
    clearColor,
    resolution: 0.25,
    target: stage,
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

export function drawCurvedEdge(target, start, end, stroke) {
  const controlOffset = Math.max(80, Math.abs(end.x - start.x) * 0.35);
  target
    .moveTo(start.x, start.y)
    .bezierCurveTo(start.x + controlOffset, start.y, end.x - controlOffset, end.y, end.x, end.y)
    .stroke(stroke);
}

export function drawMarqueeSelection(target, marquee) {
  target.clear();
  if (!marquee) {
    return;
  }
  const bounds = marqueeBounds(marquee);
  target
    .rect(bounds.x, bounds.y, bounds.width, bounds.height)
    .fill({ alpha: 0.14, color: 0x38bdf8 })
    .rect(bounds.x, bounds.y, bounds.width, bounds.height)
    .stroke({ alpha: 0.9, color: 0xbae6fd, width: 2 });
}

export function drawTemporaryEdge(target, edgeDrawing) {
  target.clear();
  if (!edgeDrawing) {
    return;
  }
  const start = new Point(edgeDrawing.startX, edgeDrawing.startY);
  const end = new Point(edgeDrawing.endX, edgeDrawing.endY);
  drawCurvedEdge(target, start, end, {
    alpha: 0.94,
    color: 0x67e8f9,
    width: 3.5,
  });
  target
    .circle(start.x, start.y, 5.5)
    .fill({ alpha: 0.92, color: 0x67e8f9 })
    .circle(end.x, end.y, 5.5)
    .stroke({ alpha: 0.82, color: 0x67e8f9, width: 2.5 });
}

export function drawPortVisualState(target, port, state) {
  target.clear();
  const color = port.role === "source" ? 0x67e8f9 : 0xc4b5fd;
  const alpha = state === "idle" ? 0.82 : 1;
  const ringAlpha = state === "idle" ? 0.34 : 0.88;
  const ringRadius = state === "active" || state === "target" ? 13 : 10;
  target
    .circle(0, 0, ringRadius)
    .stroke({ alpha: ringAlpha, color, width: state === "idle" ? 1.5 : 2.5 })
    .circle(0, 0, 6)
    .fill({ alpha, color: 0xf8fafc });
}

export function drawWorkspaceGlow(target, nodes, now) {
  target.clear();
  const pulse = 0.35 + Math.sin(now / 450) * 0.15;
  for (const node of nodes) {
    target
      .circle(node.x + node.width / 2, node.y + node.height / 2, 58 + pulse * 16)
      .stroke({ alpha: 0.08 + pulse * 0.05, color: node.color, width: 2 });
  }
}

export function visibleDisplayObjectCount(displayObjects) {
  let count = 0;
  for (const displayObject of displayObjects) {
    if (displayObject.visible) {
      count += 1;
    }
  }
  return count;
}

export function totalDisplayObjectCount(displayObject) {
  let count = 1;
  const children = displayObject.children;
  if (!Array.isArray(children)) {
    return count;
  }
  for (const child of children) {
    count += totalDisplayObjectCount(child);
  }
  return count;
}

export function hostScreenSize(host) {
  return {
    height: Math.max(1, Math.floor(host.clientHeight || window.innerHeight || 1)),
    width: Math.max(1, Math.floor(host.clientWidth || window.innerWidth || 1)),
  };
}

export function cameraState(viewport) {
  const corner = viewport.corner;
  return {
    x: corner.x,
    y: corner.y,
    zoom: viewport.scaled,
  };
}

export function cameraStatesDiffer(left, right) {
  return left.x !== right.x || left.y !== right.y || left.zoom !== right.zoom;
}

export function configureViewportNavigation(viewport, initialCameraState, { maxZoom, minZoom }) {
  viewport.pinch({ percent: 1.6 }).decelerate({ friction: 0.88 });
  if (!initialCameraState) {
    viewport.moveCenter(0, 20);
    return;
  }
  viewport.setZoom(clamp(initialCameraState.zoom, minZoom, maxZoom));
  viewport.moveCorner(initialCameraState.x, initialCameraState.y);
}

export function screenPointFromPointer(canvas, event) {
  return canvasLocalPointFromClient(canvas, event.clientX, event.clientY);
}

export function screenPointFromWheel(canvas, event) {
  return canvasLocalPointFromClient(canvas, event.clientX, event.clientY);
}

function canvasLocalPointFromClient(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.clientWidth > 0 && rect.width > 0 ? canvas.clientWidth / rect.width : 1;
  const scaleY = canvas.clientHeight > 0 && rect.height > 0 ? canvas.clientHeight / rect.height : 1;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  };
}

export function normalizedWheelDelta(event) {
  const multiplier = event.deltaMode === 1 ? lineWheelPixelSize : 1;
  return {
    x: event.deltaX * multiplier,
    y: event.deltaY * multiplier,
  };
}

export function isZoomWheel(event, delta) {
  if (event.ctrlKey || event.metaKey) {
    return true;
  }
  return Math.abs(delta.x) < 1 && Math.abs(delta.y) >= notchedWheelDeltaThreshold;
}

export function zoomFactorFromWheel(event, delta) {
  const sensitivity =
    event.ctrlKey || event.metaKey ? trackpadPinchZoomSensitivity : mouseWheelZoomSensitivity;
  return Math.exp(-delta.y * sensitivity);
}

export function capturePointer(event) {
  if (event.pointerId === undefined || event.currentTarget?.setPointerCapture === undefined) {
    return;
  }
  event.currentTarget.setPointerCapture(event.pointerId);
}

export function releasePointer(event) {
  if (
    !event ||
    event.pointerId === undefined ||
    event.currentTarget?.releasePointerCapture === undefined ||
    !event.currentTarget.hasPointerCapture(event.pointerId)
  ) {
    return;
  }
  event.currentTarget.releasePointerCapture(event.pointerId);
}

export function stopNativeInteraction(event) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

export function createCanvasContextMenuHandler({ canvas, onCanvasContextMenu, viewport }) {
  return (event) => {
    if (!onCanvasContextMenu) {
      return;
    }
    stopNativeInteraction(event);
    const screen = screenPointFromPointer(canvas, event);
    const world = viewport.toWorld(screen);
    onCanvasContextMenu({
      clientX: event.clientX,
      clientY: event.clientY,
      worldX: Math.round(world.x),
      worldY: Math.round(world.y),
    });
  };
}

export function countMapValues(map, expected) {
  return [...map.values()].filter((value) => value === expected).length;
}

export function frameSampleStats(samples) {
  if (samples.length === 0) {
    return { average: 0, worst: 0 };
  }
  return {
    average: samples.reduce((total, value) => total + value, 0) / samples.length,
    worst: Math.max(...samples),
  };
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
