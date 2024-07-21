/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Selection as D3Selection } from "d3";
import { setActiveSectionIds } from "state/actions/activeSection";
import { useSectionInfos } from "state/definitions";
import { useSectionRefs } from "state/definitions/sectionRefs";
import { localStorageFns } from "state/hooks/localStorageHooks";
import { screenToFlowPosition } from "../hooks/useViewportHelper";
import { Node, Rect, Transform, Viewport, XYPosition } from "../types";
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
  ignoreGrid,
): XYPosition => {
  const position: XYPosition = {
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

export const rendererPointToPoint = (
  { x, y }: XYPosition,
  [tx, ty, tScale]: Transform,
): XYPosition => {
  return {
    x: x * tScale + tx,
    y: y * tScale + ty,
  };
};

export const getNodesBounds = (nodes: Node[]): Rect => {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const box = nodes.reduce(
    (currBox, node) => {
      const { x, y } = node.position;
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

export function getNodesInside(
  rect,
  [tx, ty, tScale] = [0, 0, 1],
  partially = false,
  // set excludeNonSelectableNodes if you want to pay attention to the nodes "selectable" attribute
  excludeNonSelectableNodes = false,
) {
  const paneRect = {
    x: (rect.x - tx) / tScale,
    y: (rect.y - ty) / tScale,
    width: rect.width / tScale,
    height: rect.height / tScale,
  };

  const visibleNodes = [];

  for (const section of Object.values(useSectionInfos.getState().x)) {
    const { x, y, width, height } = getSectionRect(section.id);

    const nodeRect = {
      x,
      y,
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

    if (isVisible) {
      visibleNodes.push(section.id);
    }
  }

  setActiveSectionIds(visibleNodes);
  return visibleNodes;
}

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
  const x =
    width / 2 -
    boundsCenterX * clampedZoom +
    localStorageFns.overviewTrueWidth.state()[0];
  const y = height / 2 - boundsCenterY * clampedZoom;

  return { x, y, zoom: clampedZoom };
};

export const getD3Transition = (
  selection: D3Selection<Element, unknown, null, undefined>,
  duration = 0,
) => {
  return selection.transition().duration(duration);
};

export function getSectionRect(sectionId, ignoreGrid = false) {
  const ref =
    useSectionRefs.getState().selfOnly[sectionId] ??
    useSectionRefs.getState().withNested[sectionId];
  const { clientWidth: width, clientHeight: height } = ref;
  const { x: _x, y: _y } = ref.getBoundingClientRect();
  const { x, y } = screenToFlowPosition(
    {
      x: _x,
      y: _y,
    },
    ignoreGrid,
  );
  return { x, y, width, height };
}

export function getSectionRectWithNested(sectionId) {
  const ref = useSectionRefs.getState().withNested[sectionId];
  const { clientWidth: width, clientHeight: height } = ref;
  return { width, height };
}
