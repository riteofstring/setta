import type { NodeDragItem } from "gpuFlow/flowTypes";

type ProjectSelectionNudgeNode = {
  readonly height: number | null;
  readonly id: string;
  readonly position: NodeDragItem["position"];
  readonly width: number | null;
};

type ProjectSelectionKeyboardNudgePlan = {
  readonly delta: { readonly x: number; readonly y: number };
  readonly forceRefreshBounds: boolean;
  readonly items: NodeDragItem[];
};

type ProjectSelectionDragMovePlan = {
  readonly changed: boolean;
  readonly delta: { readonly x: number; readonly y: number };
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

export function moveProjectSelectionDragItems({
  items,
  lastFlowPoint,
  nextFlowPoint,
}: {
  readonly items: readonly NodeDragItem[];
  readonly lastFlowPoint: { readonly x: number; readonly y: number };
  readonly nextFlowPoint: { readonly x: number; readonly y: number };
}): ProjectSelectionDragMovePlan {
  const delta = {
    x: nextFlowPoint.x - lastFlowPoint.x,
    y: nextFlowPoint.y - lastFlowPoint.y,
  };
  if (delta.x === 0 && delta.y === 0) {
    return {
      changed: false,
      delta,
      items: [...items],
    };
  }
  return {
    changed: true,
    delta,
    items: items.map((item) => ({
      ...item,
      position: {
        x: item.position.x + delta.x,
        y: item.position.y + delta.y,
      },
    })),
  };
}

export function snapProjectSelectionDragItems({
  items,
  snapGrid,
}: {
  readonly items: readonly NodeDragItem[];
  readonly snapGrid: readonly [number, number];
}): ProjectSelectionDragMovePlan {
  const nextItems = items.map((item) => ({
    ...item,
    position: snapProjectNodePosition(item.position, snapGrid),
  }));
  return {
    changed: nextItems.some((item, index) => {
      const previousItem = items[index];
      return (
        previousItem !== undefined &&
        (item.position.x !== previousItem.position.x ||
          item.position.y !== previousItem.position.y)
      );
    }),
    delta: getProjectSelectionDragItemsDelta(items, nextItems),
    items: nextItems,
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

function getProjectSelectionDragItemsDelta(
  previousItems: readonly NodeDragItem[],
  nextItems: readonly NodeDragItem[],
) {
  const previousItem = previousItems[0];
  const nextItem = nextItems[0];
  if (!previousItem || !nextItem) {
    return { x: 0, y: 0 };
  }
  return {
    x: nextItem.position.x - previousItem.position.x,
    y: nextItem.position.y - previousItem.position.y,
  };
}
