import type { Node, NodeDragItem } from "forks/xyflow/core/types";
import type { Position } from "utils/generatedTypes";

export function getCanvasFlowDragItems({
  activeIds,
  nodeId,
  nodes,
  pointer,
}: {
  activeIds: Array<string>;
  nodeId?: string;
  nodes: Map<string, Node>;
  pointer: Position;
}): Array<NodeDragItem> {
  const draggedNodeIsActive =
    nodeId !== undefined && activeIds.includes(nodeId);
  return Array.from(nodes.values())
    .filter((node) => {
      if (!nodeId) {
        return activeIds.includes(node.id);
      }
      if (draggedNodeIsActive) {
        return activeIds.includes(node.id);
      }
      return node.id === nodeId;
    })
    .map((node) => ({
      id: node.id,
      position: node.position ?? { x: 0, y: 0 },
      distance: {
        x: pointer.x - (node.position?.x ?? 0),
        y: pointer.y - (node.position?.y ?? 0),
      },
      width: node.width,
      height: node.height,
    }));
}

export function moveCanvasFlowDragItems({
  dragEnd = false,
  dragItems,
  pointer,
  snapGrid,
  snapToGrid,
}: {
  dragEnd?: boolean;
  dragItems: Array<NodeDragItem>;
  pointer: Position;
  snapGrid: [number, number];
  snapToGrid: boolean;
}): { changed: boolean; dragItems: Array<NodeDragItem> } {
  let changed = false;
  const nextItems = dragItems.map((item) => {
    const position = {
      x: pointer.x - item.distance.x,
      y: pointer.y - item.distance.y,
    };
    if (dragEnd && snapToGrid) {
      position.x = snapGrid[0] * Math.round(position.x / snapGrid[0]);
      position.y = snapGrid[1] * Math.round(position.y / snapGrid[1]);
    }
    changed =
      changed ||
      item.position.x !== position.x ||
      item.position.y !== position.y;
    return {
      ...item,
      position,
    };
  });
  return { changed, dragItems: nextItems };
}

export function shouldShiftCanvasFlowSelection({
  activeIds,
  dragItems,
}: {
  activeIds: Array<string>;
  dragItems: Array<NodeDragItem>;
}): boolean {
  if (activeIds.length === 0 || dragItems.length === 0) {
    return false;
  }
  const draggedIds = new Set(dragItems.map((item) => item.id));
  return activeIds.every((activeId) => draggedIds.has(activeId));
}
