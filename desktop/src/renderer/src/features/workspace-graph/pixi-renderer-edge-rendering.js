/* global performance */

import { drawEdgeLabel } from "./pixi-renderer-edge-labels";
import { rendererEdgeLayer, rendererNodeLayer } from "./pixi-renderer-layers";
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
  debugMetrics,
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
  let edgeDrawMs = 0;
  let edgeLabelDrawMs = 0;
  for (const edge of edges) {
    const source = getNode(edge.sourceNodeId);
    const target = getNode(edge.targetNodeId);
    const start = portWorldPosition(source, requireEdgePort(source, edge, "sourcePortId"));
    const end = portWorldPosition(target, requireEdgePort(target, edge, "targetPortId"));
    const edgeStartedAt = performance.now();
    drawEdge(edgeGraphics, edge, start, end, edgeEndpointLayers(source, target));
    drawEdgeDiagnosticMarker(edgeGraphics, edge, start, end);
    edgeDrawMs += performance.now() - edgeStartedAt;
    const labelStartedAt = performance.now();
    drawEdgeLabel(edgeLabelLayer, edge, start, end, {
      fontFamily,
      fontSize,
      validateGlyphs,
    });
    edgeLabelDrawMs += performance.now() - labelStartedAt;
  }
  debugMetrics?.recordDuration("edge-redraw", edgeDrawMs, { edgeCount: edges.length });
  debugMetrics?.recordDuration("edge-label-redraw", edgeLabelDrawMs, {
    edgeCount: edges.length,
  });
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
  activeSemanticNodeIds = null,
  edgeFlowGraphics,
  edges,
  getNode,
  now,
  visibleNodeIds = null,
}) {
  edgeFlowGraphics.clear();
  for (const edge of edges) {
    switch (rendererEdgeLayer(edge)) {
      case "workflow":
        if (!edgeHasWorkflowFlow(edge, visibleNodeIds)) {
          continue;
        }
        drawWorkflowEdgeFlowForEdge({ edge, getNode, now, target: edgeFlowGraphics });
        break;
      case "semantic":
        if (!edgeHasSemanticTendrilFlow(edge, visibleNodeIds, activeSemanticNodeIds)) {
          continue;
        }
        {
          const source = getNode(edge.sourceNodeId);
          const targetNode = getNode(edge.targetNodeId);
          if (isSemanticBridgeEndpoint(edgeEndpointLayers(source, targetNode))) {
            continue;
          }
          drawSemanticTendrilFlowForNodes({
            edge,
            now,
            source,
            target: edgeFlowGraphics,
            targetNode,
          });
        }
        break;
      default:
        throw new Error(`unsupported workspace graph edge layer: ${edge.layer}`);
    }
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

function drawEdge(target, edge, start, end, endpointLayers) {
  switch (rendererEdgeLayer(edge)) {
    case "workflow":
      drawWorkflowEdge(target, edge, start, end);
      return;
    case "semantic":
      drawSemanticEdge(target, edge, start, end, endpointLayers);
      return;
  }
  throw new Error(`unsupported workspace graph edge layer: ${edge.layer}`);
}

function drawWorkflowEdge(target, edge, start, end) {
  const style = workflowEdgeStrokeStyle(edge.status);
  const color = edge.color ?? style.color;
  const glowColor = color;
  drawCurvedEdge(target, start, end, {
    alpha: Math.min(0.045, style.glowAlpha * 0.38),
    color: glowColor,
    width: edge.width ? edge.width + style.glowWidth * 2.2 : style.glowWidth * 2.2,
  });
  drawCurvedEdge(target, start, end, {
    alpha: style.glowAlpha,
    color: glowColor,
    width: edge.width ? edge.width + style.glowWidth : style.glowWidth,
  });
  drawCurvedEdge(target, start, end, {
    alpha: edge.alpha ?? style.alpha,
    color,
    width: edge.width ?? style.width,
  });
  drawCurvedEdge(target, start, end, {
    alpha: workflowEdgeCoreAlpha(edge, style),
    color: workspaceNeonTheme.workflow.edgeCoreColor,
    width: workflowEdgeCoreWidth(edge, style),
  });
  drawWorkflowEdgeBeacons(target, edge, start, end);
}

function workflowEdgeCoreAlpha(edge, style) {
  if (edge.status === "inactive") {
    return Math.min(0.42, (edge.alpha ?? style.alpha) * 1.05);
  }
  if (edge.status === "active") {
    return Math.min(0.72, (edge.alpha ?? style.alpha) * 0.78);
  }
  return Math.min(0.96, (edge.alpha ?? style.alpha) + 0.1);
}

function workflowEdgeCoreWidth(edge, style) {
  if (edge.status === "inactive") {
    return Math.max(0.9, (edge.width ?? style.width) * 0.47);
  }
  if (edge.status === "active") {
    return Math.max(1.25, (edge.width ?? style.width) - 0.9);
  }
  return Math.max(1.4, (edge.width ?? style.width) - 0.6);
}

function drawWorkflowEdgeBeacons(target, edge, start, end) {
  const color =
    edge.status === "inactive" ? 0xeaf6ff : workspaceNeonTheme.workflow.edgeFlow.coreColor;
  const alpha = edge.status === "inactive" ? 0.78 : 0.96;
  const radius = edge.status === "inactive" ? 1.9 : 2.35;
  const haloRadius = edge.status === "inactive" ? 3.2 : 3.2;
  const positions = edge.status === "active" ? [0.32, 0.68] : [0.25, 0.75];
  for (const t of positions) {
    const point = sampleCurvedEdge(start, end, t);
    target
      .circle(point.x, point.y, radius)
      .fill({ alpha, color })
      .circle(point.x, point.y, haloRadius)
      .stroke({ alpha: alpha * 0.1, color, width: 1.15 });
  }
}

function drawSemanticEdge(target, edge, start, end, endpointLayers) {
  const style = workspaceNeonTheme.semantic.tendril;
  const color = edge.color ?? 0xe2e8f0;
  if (isSemanticBridgeEndpoint(endpointLayers)) {
    drawSemanticBridgeEdge({ color, edge, end, start, style, target });
    return;
  }
  const alphaScale = semanticEdgeAlphaScale(edge, style.strokeAlpha);
  drawSemanticTendrilPath({
    amplitude: 0,
    edge,
    end,
    start,
    stroke: {
      alpha: style.glowAlpha * alphaScale,
      color,
      width: (edge.width ?? style.width) + style.glowWidth,
    },
    target,
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
  drawSemanticTendrilPath({
    amplitude: 0,
    edge,
    end,
    start,
    stroke: {
      alpha: style.coreAlpha * alphaScale,
      color: style.coreColor,
      width: style.coreWidth,
    },
    target,
  });
  drawSemanticTendrilPath({
    amplitude: style.wobbleAmplitude,
    edge,
    end,
    start,
    stroke: {
      alpha: style.filamentAlpha * alphaScale,
      color,
      width: style.filamentWidth,
    },
    target,
  });
}

function drawSemanticBridgeEdge({ color, edge, end, start, style, target }) {
  const alpha = edge.alpha ?? style.strokeAlpha;
  drawSemanticTendrilPath({
    amplitude: 0,
    edge,
    end,
    start,
    stroke: {
      alpha: alpha * 0.14,
      color,
      width: Math.max(1, (edge.width ?? style.width) * 0.8),
    },
    target,
  });
  const samples = 22;
  for (let sampleIndex = 1; sampleIndex <= samples; sampleIndex += 1) {
    const t = sampleIndex / (samples + 1);
    const point = semanticTendrilPoint({
      amplitude: style.wobbleAmplitude * 0.18,
      edge,
      end,
      phase: 0,
      start,
      t,
    });
    const pulse = 0.68 + Math.sin((t + unitHashForId(edge.id)) * Math.PI * 2) * 0.18;
    target
      .circle(point.x, point.y, sampleIndex % 5 === 0 ? 2.2 : 1.65)
      .fill({ alpha: Math.min(0.64, alpha * pulse * 1.75), color });
  }
}

function semanticEdgeAlphaScale(edge, baseAlpha) {
  if (edge.alpha === undefined) {
    return 1;
  }
  return Math.min(1, Math.max(0, edge.alpha / baseAlpha) ** 0.35);
}

function drawSemanticTendrilPath({ amplitude = 0, edge, end, start, stroke, target }) {
  const samples = workspaceNeonTheme.semantic.tendril.filamentSamples;
  let previous = semanticTendrilPoint({ amplitude, edge, end, phase: 0, start, t: 0 });
  for (let sampleIndex = 1; sampleIndex <= samples; sampleIndex += 1) {
    const next = semanticTendrilPoint({
      amplitude,
      edge,
      end,
      phase: 0,
      start,
      t: sampleIndex / samples,
    });
    target.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke(stroke);
    previous = next;
  }
}

function semanticTendrilPoint({ amplitude, edge, end, phase, start, t }) {
  const point = semanticBaseTendrilPoint(start, end, t);
  if (amplitude === 0) {
    return point;
  }
  const before = semanticBaseTendrilPoint(start, end, Math.max(0, t - 0.025));
  const after = semanticBaseTendrilPoint(start, end, Math.min(1, t + 0.025));
  const dx = after.x - before.x;
  const dy = after.y - before.y;
  const length = Math.hypot(dx, dy) || 1;
  const endpointFalloff = Math.sin(Math.PI * t);
  const wave = Math.sin((t * 1.7 + unitHashForId(edge.id) + phase) * Math.PI * 2);
  const offset = wave * amplitude * endpointFalloff;
  return {
    x: point.x + (-dy / length) * offset,
    y: point.y + (dx / length) * offset,
  };
}

function semanticBaseTendrilPoint(start, end, t) {
  const curved = sampleCurvedEdge(start, end, t);
  const linear = {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
  return {
    x: linear.x + (curved.x - linear.x) * 0.58,
    y: linear.y + (curved.y - linear.y) * 0.58,
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

function edgeHasSemanticTendrilFlow(edge, visibleNodeIds, activeSemanticNodeIds) {
  if (activeSemanticNodeIds === null || activeSemanticNodeIds.size === 0) {
    return false;
  }
  return (
    (activeSemanticNodeIds.has(edge.sourceNodeId) ||
      activeSemanticNodeIds.has(edge.targetNodeId)) &&
    (visibleNodeIds === null ||
      (visibleNodeIds.has(edge.sourceNodeId) && visibleNodeIds.has(edge.targetNodeId)))
  );
}

function edgeEndpointLayers(source, target) {
  return {
    source: rendererNodeLayer(source),
    target: rendererNodeLayer(target),
  };
}

function isSemanticBridgeEndpoint(endpointLayers) {
  return endpointLayers.source !== "semantic" || endpointLayers.target !== "semantic";
}

function drawWorkflowEdgeFlowForEdge({ edge, getNode, now, target }) {
  const source = getNode(edge.sourceNodeId);
  const targetNode = getNode(edge.targetNodeId);
  const start = portWorldPosition(source, requireEdgePort(source, edge, "sourcePortId"));
  const end = portWorldPosition(targetNode, requireEdgePort(targetNode, edge, "targetPortId"));
  drawWorkflowEdgeFlow(target, edge, start, end, now);
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

function drawSemanticTendrilFlowForNodes({ edge, now, source, target, targetNode }) {
  const start = portWorldPosition(source, requireEdgePort(source, edge, "sourcePortId"));
  const end = portWorldPosition(targetNode, requireEdgePort(targetNode, edge, "targetPortId"));
  drawSemanticTendrilFlow(target, edge, start, end, now);
}

function drawSemanticTendrilFlow(target, edge, start, end, now) {
  const style = workspaceNeonTheme.semantic.animation.tendril;
  const color = edge.color ?? 0x7dd3fc;
  const alphaScale = semanticEdgeAlphaScale(edge, workspaceNeonTheme.semantic.tendril.strokeAlpha);
  const phase = now / style.periodMs;
  drawAnimatedSemanticTendrilPath({
    amplitude: style.wobbleAmplitude,
    edge,
    end,
    phase,
    start,
    stroke: {
      alpha: style.filamentAlpha * alphaScale,
      color,
      width: style.filamentWidth,
    },
    target,
  });
  drawSemanticTendrilSignal({ alphaScale, color, edge, end, phase, start, target, now });
}

function drawAnimatedSemanticTendrilPath({ amplitude, edge, end, phase, start, stroke, target }) {
  const samples = workspaceNeonTheme.semantic.tendril.filamentSamples;
  let previous = semanticTendrilPoint({ amplitude, edge, end, phase, start, t: 0 });
  for (let sampleIndex = 1; sampleIndex <= samples; sampleIndex += 1) {
    const next = semanticTendrilPoint({
      amplitude,
      edge,
      end,
      phase,
      start,
      t: sampleIndex / samples,
    });
    target.moveTo(previous.x, previous.y).lineTo(next.x, next.y).stroke(stroke);
    previous = next;
  }
}

function drawSemanticTendrilSignal({ alphaScale, color, edge, end, phase, start, target, now }) {
  const style = workspaceNeonTheme.semantic.animation.tendril;
  const rawHeadT = (now / style.signalPeriodMs + unitHashForId(edge.id)) % 1;
  const headT = 0.12 + rawHeadT * 0.76;
  const trailStartT = Math.max(0.12, headT - style.signalTrailLength);
  const trailSpan = headT - trailStartT;
  if (trailSpan > 0) {
    let previous = semanticTendrilPoint({
      amplitude: style.wobbleAmplitude,
      edge,
      end,
      phase,
      start,
      t: trailStartT,
    });
    for (let sampleIndex = 1; sampleIndex <= style.signalSamples; sampleIndex += 1) {
      const segmentT = trailStartT + (trailSpan * sampleIndex) / style.signalSamples;
      const next = semanticTendrilPoint({
        amplitude: style.wobbleAmplitude,
        edge,
        end,
        phase,
        start,
        t: segmentT,
      });
      target
        .moveTo(previous.x, previous.y)
        .lineTo(next.x, next.y)
        .stroke({
          alpha: (style.signalTrailAlpha * alphaScale * sampleIndex) / style.signalSamples,
          color,
          width: style.signalTrailWidth,
        });
      previous = next;
    }
  }
  const head = semanticTendrilPoint({
    amplitude: style.wobbleAmplitude,
    edge,
    end,
    phase,
    start,
    t: headT,
  });
  target
    .circle(head.x, head.y, style.signalHaloRadius)
    .fill({ alpha: style.signalHaloAlpha * alphaScale, color })
    .circle(head.x, head.y, style.signalRadius)
    .fill({
      alpha: style.signalAlpha * alphaScale,
      color: workspaceNeonTheme.semantic.tendril.coreColor,
    });
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
