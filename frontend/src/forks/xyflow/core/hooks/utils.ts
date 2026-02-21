import type { RefObject } from "react";

import { useProjectState, ZustandNodeInternalsState } from "state/definitions";
import { Position } from "utils/generatedTypes";
import type { NodeDragItem } from "../types";

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
  nodeInternals: ZustandNodeInternalsState["x"],
  mousePos: Position,
  nodeId?: string,
): NodeDragItem[] {
  const { activeIds: activeSections } =
    useProjectState.getState().projectConfig;
  const draggedNodeIsActive = activeSections.includes(nodeId);
  return Array.from(nodeInternals.values())
    .filter(
      (n) =>
        !n.hidden &&
        ((!nodeId && activeSections.includes(n.id)) ||
          (draggedNodeIsActive && activeSections.includes(n.id)) ||
          (!draggedNodeIsActive && n.id === nodeId)),
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
