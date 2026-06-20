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
  recordGraphInteraction,
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
      recordNodeDragInteraction(
        recordGraphInteraction,
        nodeDragInteractionForNode(node, "blocked"),
      );
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
    const draggedNodes = draggedNodesForStart(node);
    for (const draggedNode of draggedNodes) {
      sceneGraph.ensureNodeMaterialized(draggedNode.id);
    }
    draggingNode = draggingNodeForStart({ draggedNodes, node, screen, world });
    recordNodeDragInteraction(
      recordGraphInteraction,
      nodeDragInteractionForDrag(draggingNode, "start", "pointerdown"),
    );
    setDraggedNodeCursors(draggedNodes);
    viewport.plugins.pause("decelerate");
  }

  function draggedNodesForStart(node) {
    let draggedNodes = nodes.filter((candidate) => selectedNodeIds.has(candidate.id));
    if (!draggedNodes.some((candidate) => !nodeIsMovable(candidate))) {
      return draggedNodes;
    }
    selectOnlyNode(node.id);
    return [node];
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
    recordNodeDragInteraction(
      recordGraphInteraction,
      nodeDragInteractionForDrag(draggingNode, "update", "pointermove"),
    );
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
    recordNodeDragInteraction(
      recordGraphInteraction,
      nodeDragInteractionForDrag(canceledDrag, "cancel", "pointercancel"),
    );
  }

  function finish() {
    const completedDrag = draggingNode;
    const shouldPersistPositions = dragMoved(completedDrag);
    const movedNodeIds = draggedNodeIdSet(completedDrag);
    viewport.plugins.resume("decelerate");
    draggingNode = null;
    syncNodeBodyCursors();
    recordCompletedNodeDrag(recordGraphInteraction, completedDrag, shouldPersistPositions);
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

  function setDraggedNodeCursors(draggedNodes) {
    for (const draggedNode of draggedNodes) {
      const body = nodeBodies.get(draggedNode.id);
      if (body) {
        body.cursor = "grabbing";
      }
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

function draggingNodeForStart({ draggedNodes, node, screen, world }) {
  return {
    nodes: draggedNodes.map((candidate) => ({
      movementOwner: candidate.movementOwner?.kind ?? "",
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
}

function nodeDragInteractionForNode(node, phase) {
  return {
    affectedNodeIds: [node.id],
    kind: "node_drag",
    movementOwner: node.movementOwner?.kind ?? "",
    phase,
    reason: "missing_movement_owner",
  };
}

function nodeDragInteractionForDrag(drag, phase, reason) {
  return {
    affectedNodeIds: drag.nodes.map((node) => node.nodeId),
    kind: "node_drag",
    movementOwner: movementOwnerForDrag(drag),
    phase,
    reason,
  };
}

function recordCompletedNodeDrag(recordGraphInteraction, completedDrag, shouldPersistPositions) {
  if (!completedDrag) {
    return;
  }
  recordNodeDragInteraction(
    recordGraphInteraction,
    nodeDragInteractionForDrag(
      completedDrag,
      shouldPersistPositions ? "commit" : "cancel",
      shouldPersistPositions ? "pointerup" : "click_without_move",
    ),
  );
}

function recordNodeDragInteraction(recordGraphInteraction, interaction) {
  if (!recordGraphInteraction) {
    return;
  }
  recordGraphInteraction(interaction);
}

function dragMoved(drag) {
  return drag?.moved === true;
}

function draggedNodeIdSet(drag) {
  return new Set(drag?.nodes.map((node) => node.nodeId) ?? []);
}

function movementOwnerForDrag(drag) {
  const owners = [...new Set(drag.nodes.map((node) => node.movementOwner).filter(Boolean))];
  if (owners.length === 0) {
    return "";
  }
  return owners.length === 1 ? owners[0] : "multiple";
}
