import { drawEdgeLabel } from "./pixi-workspace-edge-labels";
import { drawCurvedEdge, portWorldPosition, requirePort } from "./pixi-workspace-renderer-helpers";

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
    drawCurvedEdge(edgeGraphics, start, end, { alpha: 0.65, color: 0xe2e8f0, width: 2.5 });
    drawEdgeLabel(edgeLabelLayer, edge, start, end, {
      fontFamily,
      fontSize,
      validateGlyphs,
    });
  }
}

function requireEdgePort(node, edge, field) {
  const portId = edge[field];
  if (!portId) {
    throw new Error(`workspace edge ${edge.id} is missing ${field}`);
  }
  requirePort(node, portId);
  return portId;
}
