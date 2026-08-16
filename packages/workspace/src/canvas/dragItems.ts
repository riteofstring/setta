import type { RefObject } from "react";
import { getActiveSectionIds } from "../document/activeSections";
import type { NodeInternalsState } from "../document/stores";
import type { Position } from "../document/types";
import type { NodeDragItem } from "./types";

export function hasSelector(
  target: Element,
  selector: string,
  nodeRef: RefObject<Element | null>,
): boolean {
  let current: Element | null = target;

  do {
    if (current?.matches(selector)) return true;
    if (current === nodeRef.current) return false;
    current = current?.parentElement ?? null;
  } while (current);

  return false;
}

// looks for all selected nodes and creates a NodeDragItem for each of them
export function getDragItems(
  nodeInternals: NodeInternalsState["x"],
  mousePos: Position,
  nodeId?: string,
): Array<NodeDragItem> {
  const activeSections = getActiveSectionIds();
  const draggedNodeIsActive =
    nodeId !== undefined && activeSections.includes(nodeId);
  return Array.from(nodeInternals.values())
    .filter(
      (n) =>
        (!nodeId && activeSections.includes(n.id)) ||
        (draggedNodeIsActive && activeSections.includes(n.id)) ||
        (!draggedNodeIsActive && n.id === nodeId),
    )
    .map((n) => ({
      id: n.id,
      position: n.position || { x: 0, y: 0 },
      distance: {
        x: mousePos.x - (n.position?.x ?? 0),
        y: mousePos.y - (n.position?.y ?? 0),
      },
      width: n.width,
      height: n.height,
    }));
}
