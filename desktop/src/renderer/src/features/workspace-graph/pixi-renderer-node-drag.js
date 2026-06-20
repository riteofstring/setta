/* global performance */

import { nodeCursor, nodeIsMovable } from "./pixi-renderer-helpers";

export function createWorkflowGraphNodeDragController({
  animationCoordinator,
  handlers,
  labels,
  nodeBodies,
  nodeContainers,
  nodeOpenClickTracker,
  nodes,
  nodesById,
  redrawEdges,
  requireNode,
  sceneGraph,
  selectOnlyNode,
  selectedNodeIds,
  spatialQueries,
  viewport,
}) {
  let draggingNode = null;
  let nodeDragUpdateCount = 0;
  let nodeDragStartCount = 0;
  let nodeDragBlockedCount = 0;
  let lastNodeDragAdmission = null;

  return {
    active: () => Boolean(draggingNode),
    cancel,
    clearForGraphUpdate,
    debugSnapshot,
    finish,
    move,
    start,
    syncNodeBodyCursors,
  };

  function start(nodeId, screen) {
    const node = requireNode(nodeId);
    if (!nodeIsMovable(node)) {
      nodeDragBlockedCount += 1;
      lastNodeDragAdmission = nodeDragAdmissionSnapshot("blocked", node);
      if (!selectedNodeIds.has(node.id)) {
        selectOnlyNode(node.id);
      }
      return;
    }
    nodeDragStartCount += 1;
    lastNodeDragAdmission = nodeDragAdmissionSnapshot("started", node);
    const world = viewport.toWorld(screen);
    if (!selectedNodeIds.has(node.id)) {
      selectOnlyNode(node.id);
    }
    let draggedNodes = nodes.filter((candidate) => selectedNodeIds.has(candidate.id));
    if (draggedNodes.some((candidate) => !nodeIsMovable(candidate))) {
      selectOnlyNode(node.id);
      draggedNodes = [node];
    }
    for (const draggedNode of draggedNodes) {
      sceneGraph.ensureNodeMaterialized(draggedNode.id);
    }
    draggingNode = {
      nodes: draggedNodes.map((candidate) => ({
        nodeId: candidate.id,
        offsetX: world.x - candidate.x,
        offsetY: world.y - candidate.y,
        startX: candidate.x,
        startY: candidate.y,
      })),
      moved: false,
      primaryNodeId: node.id,
      startScreenX: screen.x,
      startScreenY: screen.y,
    };
    for (const draggedNode of draggedNodes) {
      const body = nodeBodies.get(draggedNode.id);
      if (body) {
        body.cursor = "grabbing";
      }
    }
    viewport.plugins.pause("decelerate");
  }

  function move(screen) {
    if (!draggingNode) {
      return;
    }
    const world = viewport.toWorld(screen);
    for (const draggedNode of draggingNode.nodes) {
      const node = requireNode(draggedNode.nodeId);
      const container = nodeContainers.get(draggedNode.nodeId);
      if (!container) {
        throw new Error(`dragged node container is missing: ${draggedNode.nodeId}`);
      }
      node.x = world.x - draggedNode.offsetX;
      node.y = world.y - draggedNode.offsetY;
      container.x = node.x;
      container.y = node.y;
      spatialQueries.updateNode(node);
      labels.syncLabelPosition(node.id);
    }
    animationCoordinator.markStaticGlowDirty();
    animationCoordinator.syncActiveSet({ forceStaticGlow: true });
    draggingNode.moved = true;
    labels.syncLabelVisibility();
    nodeDragUpdateCount += 1;
    redrawEdges();
  }

  function cancel() {
    const canceledDrag = draggingNode;
    if (!canceledDrag) {
      return;
    }
    restoreDraggedNodePositions(canceledDrag);
    viewport.plugins.resume("decelerate");
    draggingNode = null;
    syncNodeBodyCursors();
  }

  function finish() {
    const completedDrag = draggingNode;
    const shouldPersistPositions = completedDrag?.moved === true;
    const movedNodeIds = new Set(completedDrag?.nodes.map((node) => node.nodeId) ?? []);
    viewport.plugins.resume("decelerate");
    draggingNode = null;
    syncNodeBodyCursors();
    if (shouldPersistPositions && handlers.onNodePositionsChange) {
      nodeOpenClickTracker.clear();
      handlers.onNodePositionsChange(
        nodes.map((node) => ({
          moved: movedNodeIds.has(node.id),
          nodeId: node.id,
          x: Math.round(node.x),
          y: Math.round(node.y),
        })),
      );
      return;
    }
    if (completedDrag) {
      nodeOpenClickTracker.record(completedDrag.primaryNodeId, {
        x: completedDrag.startScreenX,
        y: completedDrag.startScreenY,
      });
    }
  }

  function clearForGraphUpdate() {
    draggingNode = null;
    syncNodeBodyCursors();
  }

  function restoreDraggedNodePositions(completedDrag) {
    for (const draggedNode of completedDrag.nodes) {
      const node = requireNode(draggedNode.nodeId);
      const container = nodeContainers.get(draggedNode.nodeId);
      if (!container) {
        throw new Error(`dragged node container is missing: ${draggedNode.nodeId}`);
      }
      node.x = draggedNode.startX;
      node.y = draggedNode.startY;
      container.x = node.x;
      container.y = node.y;
      spatialQueries.updateNode(node);
      labels.syncLabelPosition(node.id);
    }
    animationCoordinator.markStaticGlowDirty();
    animationCoordinator.syncActiveSet({ forceStaticGlow: true });
    labels.syncLabelVisibility();
    redrawEdges();
  }

  function syncNodeBodyCursors() {
    for (const [nodeId, body] of nodeBodies) {
      const node = nodesById.get(nodeId);
      if (node) {
        body.cursor = nodeCursor(node);
      }
    }
  }

  function debugSnapshot() {
    return {
      lastNodeDragAdmission,
      nodeDragBlockedCount,
      nodeDragStartCount,
      nodeDragUpdateCount,
    };
  }
}

function nodeDragAdmissionSnapshot(status, node) {
  return {
    at: Math.round(performance.now()),
    movementOwner: node.movementOwner ?? null,
    nodeId: node.id,
    status,
  };
}
