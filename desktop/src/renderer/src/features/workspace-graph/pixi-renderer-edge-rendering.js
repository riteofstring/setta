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
    drawCurvedEdge(edgeGraphics, start, end, {
      alpha: edge.alpha ?? 0.65,
      color: edge.color ?? 0xe2e8f0,
      width: edge.width ?? 2.5,
    });
    drawEdgeDiagnosticMarker(edgeGraphics, edge, start, end);
    drawEdgeLabel(edgeLabelLayer, edge, start, end, {
      fontFamily,
      fontSize,
      validateGlyphs,
    });
  }
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
