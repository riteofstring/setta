/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Selection as D3Selection } from "d3";

import {
  Node,
  NodeInternals,
  Rect,
  Transform,
  Viewport,
  XYPosition,
} from "../types";
import {
  boxToRect,
  clamp,
  getBoundsOfBoxes,
  getOverlappingArea,
  rectToBox,
} from "../utils";

export const pointToRendererPoint = (
  { x, y }: XYPosition,
  [tx, ty, tScale]: Transform,
  snapToGrid: boolean,
  [snapX, snapY]: [number, number],
): XYPosition => {
  const position: XYPosition = {
    x: (x - tx) / tScale,
    y: (y - ty) / tScale,
  };

  if (snapToGrid) {
    return {
      x: snapX * Math.round(position.x / snapX),
      y: snapY * Math.round(position.y / snapY),
    };
  }

  return position;
};

export const rendererPointToPoint = (
  { x, y }: XYPosition,
  [tx, ty, tScale]: Transform,
): XYPosition => {
  return {
    x: x * tScale + tx,
    y: y * tScale + ty,
  };
};

export const getNodePositionWithOrigin = (
  node: Node | undefined,
): XYPosition & { positionAbsolute: XYPosition } => {
  if (!node) {
    return {
      x: 0,
      y: 0,
      positionAbsolute: {
        x: 0,
        y: 0,
      },
    };
  }

  const position: XYPosition = {
    x: node.position.x,
    y: node.position.y,
  };

  return {
    ...position,
    positionAbsolute: node.positionAbsolute
      ? {
          x: node.positionAbsolute.x,
          y: node.positionAbsolute.y,
        }
      : position,
  };
};

export const getNodesBounds = (nodes: Node[]): Rect => {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const box = nodes.reduce(
    (currBox, node) => {
      const { x, y } = getNodePositionWithOrigin(node).positionAbsolute;
      return getBoundsOfBoxes(
        currBox,
        rectToBox({
          x,
          y,
          width: node.width || 0,
          height: node.height || 0,
        }),
      );
    },
    { x: Infinity, y: Infinity, x2: -Infinity, y2: -Infinity },
  );

  return boxToRect(box);
};

export const getNodesInside = (
  nodeInternals: NodeInternals,
  rect: Rect,
  [tx, ty, tScale]: Transform = [0, 0, 1],
  partially = false,
  // set excludeNonSelectableNodes if you want to pay attention to the nodes "selectable" attribute
  excludeNonSelectableNodes = false,
): Node[] => {
  const paneRect = {
    x: (rect.x - tx) / tScale,
    y: (rect.y - ty) / tScale,
    width: rect.width / tScale,
    height: rect.height / tScale,
  };

  const visibleNodes: Node[] = [];

  nodeInternals.forEach((node) => {
    const { width, height, selectable = true, hidden = false } = node;

    if ((excludeNonSelectableNodes && !selectable) || hidden) {
      return false;
    }

    const { positionAbsolute } = getNodePositionWithOrigin(node);

    const nodeRect = {
      x: positionAbsolute.x,
      y: positionAbsolute.y,
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
};

export const getViewportForBounds = (
  bounds: Rect,
  width: number,
  height: number,
  minZoom: number,
  maxZoom: number,
  padding = 0.1,
): Viewport => {
  const xZoom = width / (bounds.width * (1 + padding));
  const yZoom = height / (bounds.height * (1 + padding));
  const zoom = Math.min(xZoom, yZoom);
  const clampedZoom = clamp(zoom, minZoom, maxZoom);
  const boundsCenterX = bounds.x + bounds.width / 2;
  const boundsCenterY = bounds.y + bounds.height / 2;
  const x = width / 2 - boundsCenterX * clampedZoom;
  const y = height / 2 - boundsCenterY * clampedZoom;

  return { x, y, zoom: clampedZoom };
};

export const getD3Transition = (
  selection: D3Selection<Element, unknown, null, undefined>,
  duration = 0,
) => {
  return selection.transition().duration(duration);
};
