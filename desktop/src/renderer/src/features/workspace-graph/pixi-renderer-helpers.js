/* global window */

import { Point } from "pixi.js";

import { rendererNodeLayer } from "./pixi-renderer-layers";
import { workspaceNeonTheme } from "./workspace-neon-theme";

const backgroundRgb = hexToRgb(workspaceNeonTheme.foundation.background);
const backgroundRed = backgroundRgb.red;
const backgroundGreen = backgroundRgb.green;
const backgroundBlue = backgroundRgb.blue;
const lineWheelPixelSize = 20;
const mouseWheelZoomSensitivity = 0.0016;
const notchedWheelDeltaThreshold = 80;
const trackpadPinchZoomSensitivity = 0.018;

const defaultPorts = [
  { id: "input", label: "", role: "target", xOffset: 20, yRatio: 0.5 },
  { id: "output", label: "", role: "source", xOffset: -20, yRatio: 0.5 },
];

export function isSelectionToggleEvent(event) {
  return Boolean(event.metaKey || event.ctrlKey);
}

export function nodeOpenRequested(event, onNodeOpen) {
  return event.detail >= 2 && onNodeOpen !== null;
}

export function nodeDeleteRequested(event, onNodeDelete, selectedNodeIds) {
  return (
    isDeleteKey(event.key) &&
    selectedNodeIds.size > 0 &&
    typeof onNodeDelete === "function" &&
    !keyboardEventTargetsEditableText(event)
  );
}

export function edgeDeleteRequested(event, onEdgeDelete, selectedEdgeIds) {
  return (
    isDeleteKey(event.key) &&
    selectedEdgeIds.size > 0 &&
    typeof onEdgeDelete === "function" &&
    !keyboardEventTargetsEditableText(event)
  );
}

export function notifyNodeSelectionChange(onNodeSelectionChange, selectedNodeIds) {
  if (onNodeSelectionChange !== null) {
    onNodeSelectionChange([...selectedNodeIds]);
  }
}

function isDeleteKey(key) {
  return key === "Delete" || key === "Backspace";
}

function keyboardEventTargetsEditableText(event) {
  const target = event.target;
  if (!target || typeof target.closest !== "function") {
    return false;
  }
  if (target.closest("input, textarea, select") !== null) {
    return true;
  }
  const editable = target.closest("[contenteditable]");
  return Boolean(editable?.isContentEditable);
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
  const port = requirePort(node, portId);
  return {
    x: port.xOffset >= 0 ? port.xOffset : node.width + port.xOffset,
    y: node.height * port.yRatio,
  };
}

function portsForNode(node) {
  return Array.isArray(node.ports) ? node.ports : defaultPorts;
}

export function interactivePortsForNode(node) {
  if (node.connectable === false) {
    return [];
  }
  return portsForNode(node);
}

export function requirePort(node, portId) {
  const port = portsForNode(node).find((candidate) => candidate.id === portId);
  if (!port) {
    throw new Error(`unknown workspace port ${node.id}:${portId}`);
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
  const controlOffset = curvedEdgeControlOffset(start, end);
  target
    .moveTo(start.x, start.y)
    .bezierCurveTo(start.x + controlOffset, start.y, end.x - controlOffset, end.y, end.x, end.y)
    .stroke(stroke);
}

export function sampleCurvedEdge(start, end, t) {
  const clampedT = clamp(t, 0, 1);
  const controlOffset = curvedEdgeControlOffset(start, end);
  const firstControl = { x: start.x + controlOffset, y: start.y };
  const secondControl = { x: end.x - controlOffset, y: end.y };
  const inverseT = 1 - clampedT;
  const inverseSquared = inverseT * inverseT;
  const tSquared = clampedT * clampedT;
  return new Point(
    inverseSquared * inverseT * start.x +
      3 * inverseSquared * clampedT * firstControl.x +
      3 * inverseT * tSquared * secondControl.x +
      tSquared * clampedT * end.x,
    inverseSquared * inverseT * start.y +
      3 * inverseSquared * clampedT * firstControl.y +
      3 * inverseT * tSquared * secondControl.y +
      tSquared * clampedT * end.y,
  );
}

function curvedEdgeControlOffset(start, end) {
  return Math.max(80, Math.abs(end.x - start.x) * 0.35);
}

export function drawMarqueeSelection(target, marquee) {
  target.clear();
  if (!marquee) {
    return;
  }
  const bounds = marqueeBounds(marquee);
  const style = workspaceNeonTheme.foundation.marquee;
  target
    .rect(bounds.x, bounds.y, bounds.width, bounds.height)
    .fill({ alpha: style.fillAlpha, color: style.fillColor })
    .rect(bounds.x, bounds.y, bounds.width, bounds.height)
    .stroke({ alpha: style.strokeAlpha, color: style.strokeColor, width: style.strokeWidth });
}

export function drawTemporaryEdge(target, edgeDrawing) {
  target.clear();
  if (!edgeDrawing) {
    return;
  }
  const start = new Point(edgeDrawing.startX, edgeDrawing.startY);
  const end = new Point(edgeDrawing.endX, edgeDrawing.endY);
  const style = workspaceNeonTheme.foundation.temporaryEdge;
  drawCurvedEdge(target, start, end, {
    alpha: style.glowAlpha,
    color: style.color,
    width: style.glowWidth,
  });
  drawCurvedEdge(target, start, end, {
    alpha: style.alpha,
    color: style.color,
    width: style.width,
  });
  target
    .circle(start.x, start.y, style.endpointRadius)
    .fill({ alpha: style.endpointAlpha, color: style.color })
    .circle(end.x, end.y, style.endpointRadius)
    .stroke({ alpha: 0.84, color: style.color, width: 2.5 });
}

export function drawPortVisualState(target, port, state) {
  target.clear();
  const portTheme = workspaceNeonTheme.foundation.port;
  const color = port.role === "source" ? portTheme.source : portTheme.target;
  const alpha = state === "idle" ? 0.82 : 1;
  const ringAlpha = state === "idle" ? 0.34 : 0.88;
  const ringRadius = state === "active" || state === "target" ? 13 : 10;
  target
    .circle(0, 0, ringRadius)
    .stroke({ alpha: ringAlpha, color, width: state === "idle" ? 1.5 : 2.5 })
    .circle(0, 0, 6)
    .fill({ alpha, color: portTheme.core });
}

export function drawWorkspaceGlow(target, nodes, now, { mode = "static" } = {}) {
  target.clear();
  const semanticPulse = workspaceGlowPulse(now, mode);
  for (const node of nodes) {
    switch (rendererNodeLayer(node)) {
      case "workflow":
        drawWorkflowNodeGlow(target, node, now, mode);
        break;
      case "semantic":
        drawSemanticNodeGlow(target, node, semanticPulse, mode);
        break;
      default:
        throw new Error(`unsupported workspace graph node layer: ${node.layer}`);
    }
  }
}

function workspaceGlowPulse(now, mode) {
  if (mode === "animated") {
    return 0.35 + Math.sin(now / 450) * 0.15;
  }
  if (mode === "steady") {
    return 0.42;
  }
  return 0.18;
}

function drawWorkflowNodeGlow(target, node, now, mode) {
  const style = workflowNodeAuraStyleFor(node);
  const aura = workflowNodeAuraRenderState(node, style, now, mode);
  const radius = Math.max(node.width, node.height) / 2 + style.radiusPadding + aura.radiusOffset;
  target
    .roundRect(node.x - 8, node.y - 8, node.width + 16, node.height + 16, 14)
    .stroke({ alpha: aura.alpha, color: node.color, width: aura.glowWidth })
    .circle(node.x + node.width / 2, node.y + node.height / 2, radius)
    .stroke({ alpha: aura.ringAlpha, color: node.color, width: style.ringWidth });
}

function workflowNodeAuraStyleFor(node) {
  return workspaceNeonTheme.workflow.nodeAura[node.status ?? "not_started"];
}

function workflowNodeAuraRenderState(node, style, now, mode) {
  if (mode === "animated" && style.animate) {
    const intensity = workflowNodeAuraIntensity(node, style, now);
    return {
      alpha: style.steadyAlpha + style.pulseAlpha * intensity,
      glowWidth: style.glowWidth,
      radiusOffset: style.pulseRadius * intensity,
      ringAlpha: style.steadyRingAlpha + style.pulseAlpha * 0.65 * intensity,
    };
  }
  if (mode === "steady") {
    return {
      alpha: style.steadyAlpha,
      glowWidth: style.glowWidth,
      radiusOffset: style.pulseRadius * 0.45,
      ringAlpha: style.steadyRingAlpha,
    };
  }
  return {
    alpha: style.baseAlpha,
    glowWidth: Math.max(3, style.glowWidth - 2),
    radiusOffset: 0,
    ringAlpha: style.baseRingAlpha,
  };
}

function workflowNodeAuraIntensity(node, style, now) {
  const phase = (now / style.periodMs + workflowNodeAuraSeed(node.id)) % 1;
  const wave = 0.5 + Math.sin(phase * Math.PI * 2) * 0.5;
  if (style.mode === "flicker") {
    const stutter = 0.5 + Math.sin((phase + 0.17) * Math.PI * 9.4) * 0.5;
    return clamp(wave * 0.58 + stutter * 0.42, 0.18, 1);
  }
  return wave;
}

function workflowNodeAuraSeed(nodeId) {
  let hash = 2166136261;
  for (let index = 0; index < nodeId.length; index += 1) {
    hash ^= nodeId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x100000000;
}

function drawSemanticNodeGlow(target, node, pulse, mode) {
  const cell = workspaceNeonTheme.semantic.cell;
  const animated = mode === "animated";
  const steady = mode === "steady";
  const cellRadius = Math.min(node.width, node.height) / 2;
  const radius = cellRadius + 15 + (animated ? pulse * 10 : steady ? 5 : 0);
  const baseAlpha = node.dismissed ? cell.dismissed.auraAlpha : cell.auraAlpha;
  const alpha = animated || steady ? baseAlpha + pulse * 0.08 : baseAlpha * 0.58;
  target
    .circle(node.x + node.width / 2, node.y + node.height / 2, radius)
    .stroke({ alpha, color: node.color, width: animated || steady ? 2.6 : 1.8 });
}

function hexToRgb(color) {
  return {
    blue: color & 0xff,
    green: (color >> 8) & 0xff,
    red: (color >> 16) & 0xff,
  };
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

export function edgeConnection(edgeDrawing, targetPort) {
  return {
    sourceNodeId: edgeDrawing.sourceNodeId,
    sourcePortId: edgeDrawing.sourcePortId,
    targetNodeId: targetPort.nodeId,
    targetPortId: targetPort.portId,
  };
}

function drawnEdge(sequence, connection) {
  return { id: `drawn-${sequence}`, layer: "workflow", ...connection };
}

export function commitEdgeConnection(connection, { edges, onEdgeCreate, redrawEdges, sequence }) {
  if (onEdgeCreate) {
    onEdgeCreate(connection);
    return;
  }
  edges.push(drawnEdge(sequence, connection));
  redrawEdges();
}

export function hitTestPortCandidateAtScreen({
  excludeNodeId,
  portHitRadiusScreen,
  role,
  screen,
  spatialQueries,
  viewport,
}) {
  let bestPort = null;
  let bestDistance = Infinity;
  const candidates = spatialQueries.portHitCandidatesAtScreen(screen, portHitRadiusScreen);
  for (const node of candidates) {
    if (node.connectable === false || node.id === excludeNodeId) {
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
