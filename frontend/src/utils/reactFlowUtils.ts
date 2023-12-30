import { zoomIdentity } from "d3-zoom";
import { REACT_FLOW_STORE } from "utils/constants";

// https://github.com/xyflow/xyflow/blob/main/packages/system/src/utils/general.ts
function snapPosition(position, snapGrid = [1, 1]) {
  return {
    x: snapGrid[0] * Math.round(position.x / snapGrid[0]),
    y: snapGrid[1] * Math.round(position.y / snapGrid[1]),
  };
}

// https://github.com/xyflow/xyflow/blob/main/packages/system/src/utils/general.ts
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

// https://github.com/xyflow/xyflow/blob/main/packages/react/src/hooks/useViewportHelper.ts
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

const getD3Transition = (selection, duration = 0) =>
  typeof duration === "number" && duration > 0
    ? selection.transition().duration(duration)
    : selection;

// https://github.com/xyflow/xyflow/blob/main/packages/react/src/hooks/useViewportHelper.ts
export function setCenter(x, y, options) {
  const { width, height, maxZoom, d3Zoom, d3Selection } =
    REACT_FLOW_STORE.store.getState();
  const nextZoom =
    typeof options?.zoom !== "undefined" ? options.zoom : maxZoom;
  const centerX = width / 2 - x * nextZoom;
  const centerY = height / 2 - y * nextZoom;
  const transform = zoomIdentity.translate(centerX, centerY).scale(nextZoom);

  d3Zoom.transform(getD3Transition(d3Selection, options?.duration), transform);
}
