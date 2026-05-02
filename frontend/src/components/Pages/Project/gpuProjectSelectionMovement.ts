import type { NodeDragItem } from "gpuFlow/flowTypes";

type ProjectSelectionNudgeNode = Pick<
  NodeDragItem,
  "height" | "id" | "position" | "width"
>;

type ProjectSelectionKeyboardNudgePlan = {
  readonly delta: { readonly x: number; readonly y: number };
  readonly forceRefreshBounds: boolean;
  readonly items: NodeDragItem[];
};

export function buildProjectSelectionKeyboardNudgePlan({
  direction,
  isShiftPressed,
  selectedNodes,
  snapGrid,
  snapToGrid,
}: {
  readonly direction: { readonly x: number; readonly y: number };
  readonly isShiftPressed: boolean;
  readonly selectedNodes: readonly ProjectSelectionNudgeNode[];
  readonly snapGrid: readonly [number, number];
  readonly snapToGrid: boolean;
}): ProjectSelectionKeyboardNudgePlan | null {
  if (selectedNodes.length === 0) {
    return null;
  }
  const xVelocity = snapToGrid ? snapGrid[0] : 5;
  const yVelocity = snapToGrid ? snapGrid[1] : 5;
  const factor = isShiftPressed ? 4 : 1;
  const delta = {
    x: direction.x * xVelocity * factor,
    y: direction.y * yVelocity * factor,
  };
  return {
    delta,
    forceRefreshBounds: snapToGrid,
    items: selectedNodes.map((node) => {
      const nextPosition = {
        x: node.position.x + delta.x,
        y: node.position.y + delta.y,
      };
      return {
        distance: { x: 0, y: 0 },
        height: node.height,
        id: node.id,
        position: snapToGrid
          ? snapProjectNodePosition(nextPosition, snapGrid)
          : nextPosition,
        width: node.width,
      };
    }),
  };
}

export function snapProjectNodePosition(
  position: { readonly x: number; readonly y: number },
  snapGrid: readonly [number, number],
) {
  return {
    x: snapGrid[0] * Math.round(position.x / snapGrid[0]),
    y: snapGrid[1] * Math.round(position.y / snapGrid[1]),
  };
}
