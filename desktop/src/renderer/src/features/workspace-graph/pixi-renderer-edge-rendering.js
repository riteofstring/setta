import { drawEdgeLabel } from "./pixi-renderer-edge-labels";
import { drawDiagnosticDiamond } from "./pixi-renderer-node-geometry";
import { drawCurvedEdge, portWorldPosition, requirePort } from "./pixi-renderer-helpers";

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
      color: 0x93c5fd,
      width: 4.5,
    });
  }
  for (const edge of edges) {
    if (!selectedEdgeIds.has(edge.id)) {
      continue;
    }
    drawHighlightedEdge(edgeHighlightGraphics, edge, getNode, {
      alpha: 0.95,
      color: 0x67e8f9,
      width: 5.5,
    });
  }
}

function drawEdge(target, edge, start, end) {
  drawCurvedEdge(target, start, end, {
    alpha: edge.alpha ?? 0.65,
    color: edge.color ?? 0xe2e8f0,
    width: edge.width ?? 2.5,
  });
}

function drawHighlightedEdge(target, edge, getNode, stroke) {
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
