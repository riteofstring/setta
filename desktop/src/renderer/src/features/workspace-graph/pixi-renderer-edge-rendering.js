import { drawEdgeLabel } from "./pixi-renderer-edge-labels";
import { rendererEdgeLayer } from "./pixi-renderer-layers";
import { drawDiagnosticDiamond } from "./pixi-renderer-node-geometry";
import { drawCurvedEdge, portWorldPosition, requirePort } from "./pixi-renderer-helpers";
import { workflowEdgeStrokeStyle, workspaceNeonTheme } from "./workspace-neon-theme";

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
  drawCurvedEdge(target, start, end, {
    alpha: edge.alpha ?? 0.65,
    color: edge.color ?? 0xe2e8f0,
    width: edge.width ?? 2.5,
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
