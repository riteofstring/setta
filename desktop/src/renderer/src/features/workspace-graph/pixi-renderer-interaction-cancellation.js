import { parsePortKey, requirePort } from "./pixi-renderer-helpers";

export function interactionCancellationForGraphUpdate(
  { activeTargetPortKey, draggingNode, drawingEdge },
  nextGraph,
) {
  const cancelDrawingEdge = Boolean(
    drawingEdge && !graphHasPort(nextGraph, drawingEdge.sourceNodeId, drawingEdge.sourcePortId),
  );
  const clearActiveTargetPortKey = Boolean(
    activeTargetPortKey && (cancelDrawingEdge || !graphHasPortKey(nextGraph, activeTargetPortKey)),
  );
  const cancelDraggingNode = Boolean(
    draggingNode && draggingNode.nodes.some((node) => !graphHasNode(nextGraph, node.nodeId)),
  );
  return {
    cancelDraggingNode,
    cancelDrawingEdge,
    clearActiveTargetPortKey,
    interactionCancelled: cancelDrawingEdge || cancelDraggingNode,
  };
}

function graphHasNode(graph, nodeId) {
  return graph.nodes.some((node) => node.id === nodeId);
}

function graphHasPort(graph, nodeId, portId) {
  const node = graph.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    return false;
  }
  try {
    requirePort(node, portId);
    return true;
  } catch {
    return false;
  }
}

function graphHasPortKey(graph, key) {
  const parsed = parsePortKey(key);
  return graphHasPort(graph, parsed.nodeId, parsed.portId);
}
