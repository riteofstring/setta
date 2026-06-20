import { clamp, portWorldPosition, setsEqual } from "./pixi-renderer-helpers";

const edgeHitRadiusScreen = 8;
const edgeHitSamples = 28;

export function createWorkflowGraphEdgeInteractions({
  edges,
  getNode,
  onSelectionChange,
  redrawHighlights,
  viewport,
}) {
  const selectedEdgeIds = new Set();
  const hoveredEdgeIds = new Set();
  let selectionChangeCount = 0;

  return {
    clearSelection: () => setSelectedEdgeIds([]),
    firstSelectedEdgeId: () => selectedEdgeIds.values().next().value ?? null,
    hitTestAtScreen,
    hoveredEdgeIds,
    prune,
    selectOnly,
    selectedEdgeIds,
    selectionChangeCount: () => selectionChangeCount,
    setHovered,
    toggle,
  };

  function selectOnly(edgeId, clearNodeSelection) {
    clearNodeSelection();
    setSelectedEdgeIds([edgeId]);
  }

  function toggle(edgeId, clearNodeSelection) {
    clearNodeSelection();
    const nextSelectedEdgeIds = new Set(selectedEdgeIds);
    if (nextSelectedEdgeIds.has(edgeId)) {
      nextSelectedEdgeIds.delete(edgeId);
    } else {
      nextSelectedEdgeIds.add(edgeId);
    }
    setSelectedEdgeIds(nextSelectedEdgeIds);
  }

  function setHovered(edgeId) {
    const nextHoveredEdgeIds = new Set(edgeId ? [edgeId] : []);
    if (setsEqual(hoveredEdgeIds, nextHoveredEdgeIds)) {
      return;
    }
    hoveredEdgeIds.clear();
    for (const hoveredEdgeId of nextHoveredEdgeIds) {
      hoveredEdgeIds.add(hoveredEdgeId);
    }
    redrawHighlights();
  }

  function prune(nextEdges) {
    const nextEdgeIds = new Set(nextEdges.map((edge) => edge.id));
    const previousSelectedEdgeIds = new Set(selectedEdgeIds);
    for (const edgeId of previousSelectedEdgeIds) {
      if (!nextEdgeIds.has(edgeId)) {
        selectedEdgeIds.delete(edgeId);
      }
    }
    for (const edgeId of [...hoveredEdgeIds]) {
      if (!nextEdgeIds.has(edgeId)) {
        hoveredEdgeIds.delete(edgeId);
      }
    }
    if (!setsEqual(previousSelectedEdgeIds, selectedEdgeIds)) {
      selectionChangeCount += 1;
      onSelectionChange(selectedEdgeIds);
    }
  }

  function setSelectedEdgeIds(nextEdgeIds) {
    const nextSelectedEdgeIds = new Set(nextEdgeIds);
    if (setsEqual(selectedEdgeIds, nextSelectedEdgeIds)) {
      return;
    }
    selectedEdgeIds.clear();
    for (const edgeId of nextSelectedEdgeIds) {
      selectedEdgeIds.add(edgeId);
    }
    selectionChangeCount += 1;
    redrawHighlights();
    onSelectionChange(selectedEdgeIds);
  }

  function hitTestAtScreen(screen) {
    let picked = null;
    let pickedDistance = Infinity;
    for (const edge of edges) {
      const source = getNode(edge.sourceNodeId);
      const target = getNode(edge.targetNodeId);
      const start = portWorldPosition(source, edge.sourcePortId);
      const end = portWorldPosition(target, edge.targetPortId);
      const distance = edgeDistanceToScreenPoint(screen, start, end, viewport);
      if (distance <= edgeHitRadiusScreen && distance < pickedDistance) {
        picked = edge;
        pickedDistance = distance;
      }
    }
    return picked;
  }
}

function edgeDistanceToScreenPoint(screen, start, end, viewport) {
  let previous = edgeScreenPointAt(start, end, 0, viewport);
  let bestDistance = Infinity;
  for (let index = 1; index <= edgeHitSamples; index += 1) {
    const next = edgeScreenPointAt(start, end, index / edgeHitSamples, viewport);
    bestDistance = Math.min(bestDistance, pointToSegmentDistance(screen, previous, next));
    previous = next;
  }
  return bestDistance;
}

function edgeScreenPointAt(start, end, t, viewport) {
  const controlOffset = Math.max(80, Math.abs(end.x - start.x) * 0.35);
  const oneMinusT = 1 - t;
  const oneMinusTSquared = oneMinusT * oneMinusT;
  const tSquared = t * t;
  const world = {
    x:
      oneMinusTSquared * oneMinusT * start.x +
      3 * oneMinusTSquared * t * (start.x + controlOffset) +
      3 * oneMinusT * tSquared * (end.x - controlOffset) +
      tSquared * t * end.x,
    y:
      oneMinusTSquared * oneMinusT * start.y +
      3 * oneMinusTSquared * t * start.y +
      3 * oneMinusT * tSquared * end.y +
      tSquared * t * end.y,
  };
  return viewport.toScreen(world.x, world.y);
}

function pointToSegmentDistance(point, start, end) {
  const segmentX = end.x - start.x;
  const segmentY = end.y - start.y;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const t = clamp(
    ((point.x - start.x) * segmentX + (point.y - start.y) * segmentY) / lengthSquared,
    0,
    1,
  );
  const projectedX = start.x + t * segmentX;
  const projectedY = start.y + t * segmentY;
  return Math.hypot(point.x - projectedX, point.y - projectedY);
}
