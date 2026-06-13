import { drawEdgeLabel } from "./pixi-renderer-edge-labels";
import { rendererEdgeLayer } from "./pixi-renderer-layers";
import { drawDiagnosticDiamond } from "./pixi-renderer-node-geometry";
import {
  drawCurvedEdge,
  portWorldPosition,
  requirePort,
  sampleCurvedEdge,
} from "./pixi-renderer-helpers";
import { workflowEdgeStrokeStyle, workspaceNeonTheme } from "./workspace-neon-theme";

const edgeFlowHashMax = 0x100000000;

export function redrawWorkspaceEdges({
  edgeGraphics,
  edgeLabelLayer,
  edges,
  fontFamily,
  fontSize,
  getNode,
  validateGlyphs,
}) {
  edgeGraphics.clear();
  edgeLabelLayer.removeChildren().forEach((child) => child.destroy());
  for (const edge of edges) {
    const source = getNode(edge.sourceNodeId);
    const target = getNode(edge.targetNodeId);
    const start = portWorldPosition(source, requireEdgePort(source, edge, "sourcePortId"));
    const end = portWorldPosition(target, requireEdgePort(target, edge, "targetPortId"));
    drawEdge(edgeGraphics, edge, start, end);
    drawEdgeDiagnosticMarker(edgeGraphics, edge, start, end);
    drawEdgeLabel(edgeLabelLayer, edge, start, end, {
      fontFamily,
      fontSize,
      validateGlyphs,
    });
  }
}

export function redrawWorkspaceEdgeHighlights({
  edgeHighlightGraphics,
  edges,
  getNode,
  hoveredEdgeIds,
  selectedEdgeIds,
}) {
  edgeHighlightGraphics.clear();
  for (const edge of edges) {
    if (!hoveredEdgeIds.has(edge.id) || selectedEdgeIds.has(edge.id)) {
      continue;
    }
    drawHighlightedEdge(edgeHighlightGraphics, edge, getNode, {
      alpha: 0.72,
      color: workspaceNeonTheme.foundation.selection.hovered.color,
      width: 4.5,
    });
  }
  for (const edge of edges) {
    if (!selectedEdgeIds.has(edge.id)) {
      continue;
    }
    drawHighlightedEdge(edgeHighlightGraphics, edge, getNode, {
      alpha: 0.95,
      color: workspaceNeonTheme.foundation.selection.selected.color,
      width: 5.5,
    });
  }
}

export function redrawWorkspaceEdgeFlow({
  edgeFlowGraphics,
  edges,
  getNode,
  now,
  visibleNodeIds = null,
}) {
  edgeFlowGraphics.clear();
  for (const edge of edges) {
    if (!edgeHasWorkflowFlow(edge, visibleNodeIds)) {
      continue;
    }
    const source = getNode(edge.sourceNodeId);
    const target = getNode(edge.targetNodeId);
    const start = portWorldPosition(source, requireEdgePort(source, edge, "sourcePortId"));
    const end = portWorldPosition(target, requireEdgePort(target, edge, "targetPortId"));
    drawWorkflowEdgeFlow(edgeFlowGraphics, edge, start, end, now);
  }
}

export function workflowEdgeFlowPhase(edgeId) {
  return unitHashForId(edgeId);
}

function unitHashForId(edgeId) {
  let hash = 2166136261;
  for (let index = 0; index < edgeId.length; index += 1) {
    hash ^= edgeId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / edgeFlowHashMax;
}

function drawEdge(target, edge, start, end) {
  switch (rendererEdgeLayer(edge)) {
    case "workflow":
      drawWorkflowEdge(target, edge, start, end);
      return;
    case "semantic":
      drawSemanticEdge(target, edge, start, end);
      return;
  }
  throw new Error(`unsupported workspace graph edge layer: ${edge.layer}`);
}

function drawWorkflowEdge(target, edge, start, end) {
  const style = workflowEdgeStrokeStyle(edge.status);
  const color = edge.color ?? style.color;
  drawCurvedEdge(target, start, end, {
    alpha: style.glowAlpha,
    color,
    width: edge.width ? edge.width + style.glowWidth : style.glowWidth,
  });
  drawCurvedEdge(target, start, end, {
    alpha: edge.alpha ?? style.alpha,
    color,
    width: edge.width ?? style.width,
  });
  drawCurvedEdge(target, start, end, {
    alpha: Math.min(0.68, edge.alpha ?? style.alpha),
    color: workspaceNeonTheme.workflow.edgeCoreColor,
    width: Math.max(1, (edge.width ?? style.width) - 1.2),
  });
}

function drawSemanticEdge(target, edge, start, end) {
  const style = workspaceNeonTheme.semantic.tendril;
  const color = edge.color ?? 0xe2e8f0;
  drawCurvedEdge(target, start, end, {
    alpha: style.glowAlpha,
    color,
    width: (edge.width ?? style.width) + style.glowWidth,
  });
  drawSemanticTendrilPath({
    edge,
    end,
    start,
    stroke: {
      alpha: edge.alpha ?? style.strokeAlpha,
      color,
      width: edge.width ?? style.width,
    },
    target,
  });
  drawCurvedEdge(target, start, end, {
    alpha: style.coreAlpha,
    color: style.coreColor,
    width: style.coreWidth,
  });
  drawSemanticTendrilPath({
    amplitude: style.wobbleAmplitude,
    edge,
    end,
    start,
    stroke: {
      alpha: style.filamentAlpha,
      color,
      width: style.filamentWidth,
    },
    target,
  });
}

function drawSemanticTendrilPath({ amplitude = 0, edge, end, start, stroke, target }) {
  const samples = workspaceNeonTheme.semantic.tendril.filamentSamples;
  let previous = semanticTendrilPoint(edge, start, end, 0, amplitude);
  for (let sampleIndex = 1; sampleIndex <= samples; sampleIndex += 1) {
    const next = semanticTendrilPoint(edge, start, end, sampleIndex / samples, amplitude);
    target.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke(stroke);
    previous = next;
  }
}

function semanticTendrilPoint(edge, start, end, t, amplitude) {
  const point = sampleCurvedEdge(start, end, t);
  if (amplitude === 0) {
    return point;
  }
  const before = sampleCurvedEdge(start, end, Math.max(0, t - 0.025));
  const after = sampleCurvedEdge(start, end, Math.min(1, t + 0.025));
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const length = Math.hypot(dx, dy) || 1;
  const endpointFalloff = Math.sin(Math.PI * t);
  const wave = Math.sin((t * 1.7 + unitHashForId(edge.id)) * Math.PI * 2);
  const offset = wave * amplitude * endpointFalloff;
  return {
    x: point.x + (-dy / length) * offset,
    y: point.y + (dx / length) * offset,
  };
}

function edgeHasWorkflowFlow(edge, visibleNodeIds) {
  switch (rendererEdgeLayer(edge)) {
    case "workflow":
      break;
    case "semantic":
      return false;
  }
  if (edge.status !== "active") {
    return false;
  }
  return (
    visibleNodeIds === null ||
    (visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId))
  );
}

function drawWorkflowEdgeFlow(target, edge, start, end, now) {
  const style = workspaceNeonTheme.workflow.edgeFlow;
  const phase = (now / style.periodMs + workflowEdgeFlowPhase(edge.id)) % 1;
  for (let pulseIndex = 0; pulseIndex < style.pulseCount; pulseIndex += 1) {
    const headT = (phase + pulseIndex / style.pulseCount) % 1;
    drawWorkflowEdgeFlowPulse(target, start, end, headT, edge.color ?? style.color);
  }
}

function drawWorkflowEdgeFlowPulse(target, start, end, headT, color) {
  const style = workspaceNeonTheme.workflow.edgeFlow;
  const trailStartT = Math.max(0, headT - style.trailLength);
  const trailSpan = headT - trailStartT;
  if (trailSpan > 0) {
    let previous = sampleCurvedEdge(start, end, trailStartT);
    for (let sampleIndex = 1; sampleIndex <= style.trailSamples; sampleIndex += 1) {
      const segmentT = trailStartT + (trailSpan * sampleIndex) / style.trailSamples;
      const next = sampleCurvedEdge(start, end, segmentT);
      target
        .moveTo(previous.x, previous.y)
        .lineTo(next.x, next.y)
        .stroke({
          alpha: (style.trailAlpha * sampleIndex) / style.trailSamples,
          color,
          width: style.trailWidth,
        });
      previous = next;
    }
  }
  const head = sampleCurvedEdge(start, end, headT);
  target
    .circle(head.x, head.y, style.haloRadius)
    .fill({ alpha: style.haloAlpha, color })
    .circle(head.x, head.y, style.headRadius)
    .fill({ alpha: style.headAlpha, color: style.coreColor });
}

function drawHighlightedEdge(target, edge, getNode, stroke) {
  rendererEdgeLayer(edge);
  const source = getNode(edge.sourceNodeId);
  const targetNode = getNode(edge.targetNodeId);
  const start = portWorldPosition(source, requireEdgePort(source, edge, "sourcePortId"));
  const end = portWorldPosition(targetNode, requireEdgePort(targetNode, edge, "targetPortId"));
  drawCurvedEdge(target, start, end, stroke);
}

function drawEdgeDiagnosticMarker(target, edge, start, end) {
  if (!edge.diagnostic) {
    return;
  }
  drawDiagnosticDiamond(
    target,
    (start.x + end.x) / 2,
    (start.y + end.y) / 2 - 12,
    edge.diagnostic.severity,
  );
}

function requireEdgePort(node, edge, field) {
  const portId = edge[field];
  if (!portId) {
    throw new Error(`workspace edge ${edge.id} is missing ${field}`);
  }
  requirePort(node, portId);
  return portId;
}
