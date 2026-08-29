import type { Position } from "../document/types";
import type { WorkspaceHost } from "../workspaceHost";
import { getWorkspaceOptionsStore } from "./options";
import { getReactFlowStore } from "./store";
import type { Transform } from "./types";

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

export function screenToFlowPosition(
  host: WorkspaceHost,
  position: Position,
  ignoreGrid = false,
): Position {
  const { transform, domNode } = getReactFlowStore(host).getState();
  const { snapGrid, snapToGrid } = getWorkspaceOptionsStore(host).getState();

  if (!domNode) {
    return position;
  }

  const { x: domX, y: domY } = domNode.getBoundingClientRect();
  const relativePosition = {
    x: position.x - domX,
    y: position.y - domY,
  };

  return pointToRendererPoint(
    relativePosition,
    transform,
    snapToGrid,
    snapGrid,
    ignoreGrid,
  );
}
