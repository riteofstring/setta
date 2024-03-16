import type { RefObject } from "react";

import type { Node, NodeDragItem, NodeInternals } from "../../types";
import { useActiveSection } from "models/activeSection";

export function hasSelector(
  target: Element,
  selector: string,
  nodeRef: RefObject<Element>,
): boolean {
  let current = target;

  do {
    if (current?.matches(selector)) return true;
    if (current === nodeRef.current) return false;
    current = current.parentElement as Element;
  } while (current);

  return false;
}

// looks for all selected nodes and created a NodeDragItem for each of them
export function getDragItems(
  nodeInternals: NodeInternals,
  nodesDraggable: boolean,
  mousePos: XYPosition,
  nodeId?: string,
): NodeDragItem[] {
  const activeSections = useActiveSection.getState().ids
  return Array.from(nodeInternals.values())
    .filter(
      (n) =>
        (n.id === nodeId || activeSections.includes(n.id)) &&
        (n.draggable || (nodesDraggable && typeof n.draggable === "undefined")),
    )
    .map((n) => ({
      id: n.id,
      position: n.position || { x: 0, y: 0 },
      distance: {
        x: mousePos.x - (n.position?.x ?? 0),
        y: mousePos.y - (n.position?.y ?? 0),
      },
      delta: {
        x: 0,
        y: 0,
      },
      width: n.width,
      height: n.height,
    }));
}

// returns two params:
// 1. the dragged node (or the first of the list, if we are dragging a node selection)
// 2. array of selected nodes (for multi selections)
export function getEventHandlerParams({
  nodeId,
  dragItems,
  nodeInternals,
}: {
  nodeId?: string;
  dragItems: NodeDragItem[];
  nodeInternals: NodeInternals;
}): [Node, Node[]] {
  const extentedDragItems: Node[] = dragItems.map((n) => {
    const node = nodeInternals.get(n.id)!;

    return {
      ...node,
      position: n.position,
    };
  });

  return [
    nodeId
      ? extentedDragItems.find((n) => n.id === nodeId)!
      : extentedDragItems[0],
    extentedDragItems,
  ];
}
