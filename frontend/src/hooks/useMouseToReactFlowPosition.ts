import { REACT_FLOW_STORE } from "utils/constants";

function snapPosition(position, snapGrid = [1, 1]) {
  return {
    x: snapGrid[0] * Math.round(position.x / snapGrid[0]),
    y: snapGrid[1] * Math.round(position.y / snapGrid[1]),
  };
}

function pointToRendererPoint(
  { x, y },
  [tx, ty, tScale],
  snapToGrid = false,
  snapGrid = [1, 1]
) {
  const position = {
    x: (x - tx) / tScale,
    y: (y - ty) / tScale,
  };

  return snapToGrid ? snapPosition(position, snapGrid) : position;
}

export function screenToFlowPosition(position) {
  const { transform, snapToGrid, snapGrid, domNode } =
    REACT_FLOW_STORE.store.getState();

  if (!domNode) {
    return position;
  }

  const { x: domX, y: domY } = domNode.getBoundingClientRect();

  const correctedPosition = {
    x: position.x - domX,
    y: position.y - domY,
  };

  return pointToRendererPoint(
    correctedPosition,
    transform,
    snapToGrid,
    snapGrid || [1, 1]
  );
}
