import { useSectionRefs } from "models/sectionRefs";
import { REACT_FLOW_STORE } from "utils/constants";

export function getNodesInside(
  nodeInternals,
  rect,
  [tx, ty, tScale] = [0, 0, 1],
  partially = false,
  // set excludeNonSelectableNodes if you want to pay attention to the nodes "selectable" attribute
  excludeNonSelectableNodes = false,
  nodeOrigin = [0, 0],
) {
  const paneRect = {
    x: (rect.x - tx) / tScale,
    y: (rect.y - ty) / tScale,
    width: rect.width / tScale,
    height: rect.height / tScale,
  };

  const visibleNodes = [];

  nodeInternals.forEach((node) => {
    const ref = useSectionRefs.getState().x[node.id];
    const { selectable = true, hidden = false } = node;
    const { clientWidth: width, clientHeight: height } = ref;
    const { y: _y, x: _x } = ref.getBoundingClientRect();
    const { x, y } = REACT_FLOW_STORE.rf.screenToFlowPosition({ x: _x, y: _y });

    if ((excludeNonSelectableNodes && !selectable) || hidden) {
      return false;
    }

    const position = getNodePositionWithOrigin(
      { width, height, x, y },
      nodeOrigin,
    );

    const nodeRect = {
      x: position.x,
      y: position.y,
      width: width || 0,
      height: height || 0,
    };
    const overlappingArea = getOverlappingArea(paneRect, nodeRect);
    const notInitialized =
      typeof width === "undefined" ||
      typeof height === "undefined" ||
      width === null ||
      height === null;

    const partiallyVisible = partially && overlappingArea > 0;
    const area = (width || 0) * (height || 0);
    const isVisible =
      notInitialized || partiallyVisible || overlappingArea >= area;

    if (isVisible || node.dragging) {
      visibleNodes.push(node);
    }
  });

  return visibleNodes;
}

function getOverlappingArea(rectA, rectB) {
  const xOverlap = Math.max(
    0,
    Math.min(rectA.x + rectA.width, rectB.x + rectB.width) -
      Math.max(rectA.x, rectB.x),
  );
  const yOverlap = Math.max(
    0,
    Math.min(rectA.y + rectA.height, rectB.y + rectB.height) -
      Math.max(rectA.y, rectB.y),
  );

  return Math.ceil(xOverlap * yOverlap);
}

function getNodePositionWithOrigin(
  { width, height, x, y },
  nodeOrigin = [0, 0],
) {
  const offsetX = (width ?? 0) * nodeOrigin[0];
  const offsetY = (height ?? 0) * nodeOrigin[1];

  return {
    x: x - offsetX,
    y: y - offsetY,
  };
}
