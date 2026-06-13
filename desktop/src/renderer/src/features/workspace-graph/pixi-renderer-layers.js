export function rendererNodeLayer(node) {
  if (node.layer === "workflow" || node.layer === "semantic") {
    return node.layer;
  }
  throw new Error(`workspace graph node is missing renderer layer: ${node.id}`);
}

export function rendererEdgeLayer(edge) {
  if (edge.layer === "workflow" || edge.layer === "semantic") {
    return edge.layer;
  }
  throw new Error(`workspace graph edge is missing renderer layer: ${edge.id}`);
}
