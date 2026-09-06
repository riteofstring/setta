import type { Position } from "../document/types";
import type { WorkspaceInteractionOptions } from "./options";
import type { ReactFlowState, Transform } from "./types";

function pointToRendererPoint(
  { x, y }: Position,
  [tx, ty, tScale]: Transform,
  snapToGrid: boolean,
  [snapX, snapY]: [number, number],
  ignoreGrid: boolean,
): Position {
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
}

export function resolveScreenToFlowPosition(
  position: Position,
  canvas: Pick<ReactFlowState, "domNode" | "transform">,
  options: Pick<WorkspaceInteractionOptions, "snapGrid" | "snapToGrid">,
  ignoreGrid = false,
): Position {
  if (!canvas.domNode) {
    return position;
  }

  const { x: domX, y: domY } = canvas.domNode.getBoundingClientRect();
  return pointToRendererPoint(
    { x: position.x - domX, y: position.y - domY },
    canvas.transform,
    options.snapToGrid,
    options.snapGrid,
    ignoreGrid,
  );
}
