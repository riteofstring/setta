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

export function isNonBackgroundColor(red, green, blue) {
  return (
    Math.abs(red - backgroundRed) > 3 ||
    Math.abs(green - backgroundGreen) > 3 ||
    Math.abs(blue - backgroundBlue) > 3
  );
}

export function drawGrid(grid) {
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

export function screenPointFromPointer(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

export function screenPointFromWheel(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
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

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
