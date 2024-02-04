import type { RefObject } from "react";

import type {
  CoordinateExtent,
  Node,
  NodeDragItem,
  NodeInternals,
  NodeOrigin,
  OnError,
  XYPosition,
} from "../../types";
import { clampPosition } from "../../utils";

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
  return Array.from(nodeInternals.values())
    .filter(
      (n) =>
        (n.selected || n.id === nodeId) &&
        (n.draggable || (nodesDraggable && typeof n.draggable === "undefined")),
    )
    .map((n) => ({
      id: n.id,
      position: n.position || { x: 0, y: 0 },
      positionAbsolute: n.positionAbsolute || { x: 0, y: 0 },
      distance: {
        x: mousePos.x - (n.positionAbsolute?.x ?? 0),
        y: mousePos.y - (n.positionAbsolute?.y ?? 0),
      },
      delta: {
        x: 0,
        y: 0,
      },
      extent: n.extent,
      width: n.width,
      height: n.height,
    }));
}

function clampNodeExtent(node: NodeDragItem | Node, extent?: CoordinateExtent) {
  if (!extent) {
    return extent;
  }
  return [
    extent[0],
    [extent[1][0] - (node.width || 0), extent[1][1] - (node.height || 0)],
  ];
}

export function calcNextPosition(
  node: NodeDragItem | Node,
  nextPosition: XYPosition,
  nodeInternals: NodeInternals,
  nodeExtent?: CoordinateExtent,
  nodeOrigin: NodeOrigin = [0, 0],
  onError?: OnError,
): { position: XYPosition; positionAbsolute: XYPosition } {
  const clampedNodeExtent = clampNodeExtent(node, node.extent || nodeExtent);
  let currentExtent = clampedNodeExtent;

  const positionAbsolute = currentExtent
    ? clampPosition(nextPosition, currentExtent as CoordinateExtent)
    : nextPosition;

  return {
    position: {
      x: positionAbsolute.x,
      y: positionAbsolute.y,
    },
    positionAbsolute,
  };
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
      positionAbsolute: n.positionAbsolute,
    };
  });

  return [
    nodeId
      ? extentedDragItems.find((n) => n.id === nodeId)!
      : extentedDragItems[0],
    extentedDragItems,
  ];
}
