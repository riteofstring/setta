import type { Position } from "../document/types";
import { useWorkspaceOptions } from "./options";
import { useReactFlow } from "./store";
import type { Transform } from "./types";

// The reference's `pointToRendererPoint`/`screenToFlowPosition` pair from the fork's viewport
// helper. `ignoreGrid` skips snap-to-grid so DOM-measured rectangles convert without being
// rounded onto the grid.
const pointToRendererPoint = (
  { x, y }: Position,
  [tx, ty, tScale]: Transform,
  snapToGrid: boolean,
  [snapX, snapY]: [number, number],
  ignoreGrid?: boolean,
): Position => {
  const position: Position = {
    x: (x - tx) / tScale,
    y: (y - ty) / tScale,
  };

  if (!ignoreGrid && snapToGrid) {
    return {
      x: snapX * Math.round(position.x / snapX),
      y: snapY * Math.round(position.y / snapY),
    };
  }

  return position;
};

export function screenToFlowPosition(position: Position, ignoreGrid = false): Position {
  const { transform, domNode } = useReactFlow.getState();
  const { snapGrid, snapToGrid } = useWorkspaceOptions.getState();

  if (!domNode) {
    return position;
  }

  const { x: domX, y: domY } = domNode.getBoundingClientRect();
  const relativePosition = {
    x: position.x - domX,
    y: position.y - domY,
  };

  return pointToRendererPoint(relativePosition, transform, snapToGrid, snapGrid, ignoreGrid);
}
