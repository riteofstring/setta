import { drawDiagnosticDiamond } from "./pixi-renderer-node-geometry";
import {
  resolveWorkflowEdgeVisualState,
  workflowEdgeVisualFingerprint,
} from "./pixi-renderer-visual-state";
import { drawCurvedEdge, portWorldPosition, requirePort } from "./pixi-renderer-helpers";

export function redrawWorkspaceEdges({ edgeGraphics, edgeLabels, edges, getNode, redrawGraphics }) {
  const edgeEndpoints = edges.map((edge) => edgeWithEndpoints(edge, getNode));
  let rematerialized = 0;
  if (redrawGraphics) {
    edgeGraphics.clear();
    for (const { edge, end, start } of edgeEndpoints) {
      const visualState = resolveWorkflowEdgeVisualState(edge);
      drawCurvedEdge(edgeGraphics, start, end, {
        alpha: visualState.channels.strokeAlpha,
        color: visualState.channels.stroke,
        width: visualState.channels.strokeWidth,
      });
      drawEdgeDiagnosticMarker(edgeGraphics, edge, start, end);
      rematerialized += 1;
    }
  }
  const labels = edgeLabels.sync(edgeEndpoints);
  return {
    graphics: {
      rematerialized,
      redrawn: redrawGraphics,
      skipped: !redrawGraphics,
    },
    labels: {
      ...labels,
      rematerialized: 0,
    },
  };
}

function edgeWithEndpoints(edge, getNode) {
  const source = getNode(edge.sourceNodeId);
  const target = getNode(edge.targetNodeId);
  return {
    edge,
    end: portWorldPosition(target, requireEdgePort(target, edge, "targetPortId")),
    start: portWorldPosition(source, requireEdgePort(source, edge, "sourcePortId")),
  };
}

export function edgeGraphicsRedrawRequired(update) {
  return (
    update.edgeAddCount > 0 ||
    update.edgeRemoveCount > 0 ||
    update.edgeEndpointUpdateCount > 0 ||
    update.edgeOrderUpdateCount > 0 ||
    update.edgeStyleUpdateCount > 0 ||
    update.edgeTopologyUpdateCount > 0
  );
}

export function edgeGraphicsInvalidationForGraphUpdate(
  previousNodes,
  previousEdges,
  nextNodes,
  nextEdges,
) {
  const previousNodesById = new Map(previousNodes.map((node) => [node.id, node]));
  const nextNodesById = new Map(nextNodes.map((node) => [node.id, node]));
  const previousEdgesById = new Map(previousEdges.map((edge) => [edge.id, edge]));
  const nextEdgesById = new Map(nextEdges.map((edge) => [edge.id, edge]));
  const invalidation = emptyEdgeGraphicsInvalidation();
  invalidation.edgeOrderUpdateCount = edgeOrderUpdateCountForRetainedEdges(
    previousEdges,
    nextEdges,
    previousEdgesById,
    nextEdgesById,
  );
  invalidation.edgeRemoveCount = edgeRemoveCountForGraphUpdate(previousEdgesById, nextEdgesById);

  for (const [edgeId, nextEdge] of nextEdgesById) {
    recordNextEdgeInvalidation(invalidation, {
      edgeId,
      nextEdge,
      nextNodesById,
      previousEdgesById,
      previousNodesById,
    });
  }
  return invalidation;
}

function emptyEdgeGraphicsInvalidation() {
  return {
    edgeAddCount: 0,
    edgeEndpointUpdateCount: 0,
    edgeOrderUpdateCount: 0,
    edgeRemoveCount: 0,
    edgeRetainCount: 0,
    edgeStyleUpdateCount: 0,
    edgeTopologyUpdateCount: 0,
    edgeUpdateCount: 0,
  };
}

function edgeRemoveCountForGraphUpdate(previousEdgesById, nextEdgesById) {
  let edgeRemoveCount = 0;
  for (const edgeId of previousEdgesById.keys()) {
    if (!nextEdgesById.has(edgeId)) {
      edgeRemoveCount += 1;
    }
  }
  return edgeRemoveCount;
}

function recordNextEdgeInvalidation(
  invalidation,
  { edgeId, nextEdge, nextNodesById, previousEdgesById, previousNodesById },
) {
  const previousEdge = previousEdgesById.get(edgeId);
  if (!previousEdge) {
    invalidation.edgeAddCount += 1;
    return;
  }
  const changed = edgeChangeFlags({
    nextEdge,
    nextNodesById,
    previousEdge,
    previousNodesById,
  });
  if (!changed.endpoint && !changed.style && !changed.topology) {
    invalidation.edgeRetainCount += 1;
    return;
  }
  invalidation.edgeUpdateCount += 1;
  recordEdgeChangeFlags(invalidation, changed);
}

function edgeChangeFlags({ nextEdge, nextNodesById, previousEdge, previousNodesById }) {
  return {
    endpoint: edgeEndpointsChanged({
      nextEdge,
      nextNodesById,
      previousEdge,
      previousNodesById,
    }),
    style: edgeStyleSignature(previousEdge) !== edgeStyleSignature(nextEdge),
    topology:
      previousEdge.sourceNodeId !== nextEdge.sourceNodeId ||
      previousEdge.sourcePortId !== nextEdge.sourcePortId ||
      previousEdge.targetNodeId !== nextEdge.targetNodeId ||
      previousEdge.targetPortId !== nextEdge.targetPortId,
  };
}

function recordEdgeChangeFlags(invalidation, changed) {
  if (changed.endpoint) {
    invalidation.edgeEndpointUpdateCount += 1;
  }
  if (changed.style) {
    invalidation.edgeStyleUpdateCount += 1;
  }
  if (changed.topology) {
    invalidation.edgeTopologyUpdateCount += 1;
  }
}

function edgeOrderUpdateCountForRetainedEdges(
  previousEdges,
  nextEdges,
  previousEdgesById,
  nextEdgesById,
) {
  if (previousEdges.length !== nextEdges.length) {
    return 0;
  }
  for (const edgeId of previousEdgesById.keys()) {
    if (!nextEdgesById.has(edgeId)) {
      return 0;
    }
  }
  let changedPositions = 0;
  for (let index = 0; index < previousEdges.length; index += 1) {
    if (previousEdges[index]?.id !== nextEdges[index]?.id) {
      changedPositions += 1;
    }
  }
  return changedPositions;
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

function edgeEndpointsChanged({ nextEdge, nextNodesById, previousEdge, previousNodesById }) {
  const previousSource = previousNodesById.get(previousEdge.sourceNodeId);
  const previousTarget = previousNodesById.get(previousEdge.targetNodeId);
  const nextSource = nextNodesById.get(nextEdge.sourceNodeId);
  const nextTarget = nextNodesById.get(nextEdge.targetNodeId);
  if (!previousSource || !previousTarget || !nextSource || !nextTarget) {
    return true;
  }
  const previousStart = portWorldPosition(
    previousSource,
    requireEdgePort(previousSource, previousEdge, "sourcePortId"),
  );
  const previousEnd = portWorldPosition(
    previousTarget,
    requireEdgePort(previousTarget, previousEdge, "targetPortId"),
  );
  const nextStart = portWorldPosition(
    nextSource,
    requireEdgePort(nextSource, nextEdge, "sourcePortId"),
  );
  const nextEnd = portWorldPosition(
    nextTarget,
    requireEdgePort(nextTarget, nextEdge, "targetPortId"),
  );
  return (
    previousStart.x !== nextStart.x ||
    previousStart.y !== nextStart.y ||
    previousEnd.x !== nextEnd.x ||
    previousEnd.y !== nextEnd.y
  );
}

function edgeStyleSignature(edge) {
  return workflowEdgeVisualFingerprint(edge);
}
