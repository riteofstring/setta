import type { Selection as D3Selection } from "d3";
import {
  useLocalStorage,
  useProjectState,
  useSectionRefs,
} from "state/definitions";
import { Position } from "utils/generatedTypes";
import { clamp } from "utils/utils";
import { screenToFlowPosition } from "../hooks/useViewportHelper";
import { useReactFlow } from "../store";
import type { Node, ReactFlowState, Rect, Transform, Viewport } from "../types";
import {
  boxToRect,
  getBoundsOfBoxes,
  getOverlappingArea,
  rectToBox,
} from "../utils";

export const pointToRendererPoint = (
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

export const rendererPointToPoint = (
  { x, y }: Position,
  [tx, ty, tScale]: Transform,
): Position => {
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

export function getActiveSectionsBounds(ignoreGrid = false) {
  const activeSectionIds = useProjectState.getState().projectConfig.activeIds;
  return (
    getSectionBounds(activeSectionIds, ignoreGrid) ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    }
  );
}

export function getNodesInside(
  rect: Rect,
  [tx, ty, tScale]: Transform = [0, 0, 1],
  partially = false,
): Array<string> {
  const rectToLookInside = {
    x: (rect.x - tx) / tScale,
    y: (rect.y - ty) / tScale,
    width: rect.width / tScale,
    height: rect.height / tScale,
  };

  const visibleNodes = [];

  for (const section of Object.values(useProjectState.getState().sections)) {
    const isVisible = isSectionOverlappingWithRect(
      section.id,
      rectToLookInside,
      partially,
    );

    if (isVisible) {
      visibleNodes.push(section.id);
    }
  }

  return visibleNodes;
}

export const getViewportForBounds = (
  bounds: Rect,
  width: number,
  height: number,
  minZoom: number,
  maxZoom: number,
  padding = 0.1,
  keepCurrZoomIfPossible = false,
): Viewport => {
  const xZoom = width / (bounds.width * (1 + padding));
  const yZoom = height / (bounds.height * (1 + padding));
  const unclampedZoom = Math.min(xZoom, yZoom);
  const clampedZoom = clamp(unclampedZoom, minZoom, maxZoom);
  const boundsCenterX = bounds.x + bounds.width / 2;
  const boundsCenterY = bounds.y + bounds.height / 2;

  let zoom = clampedZoom;
  if (keepCurrZoomIfPossible) {
    const currZoom = useReactFlow.getState().transform[2];
    // if we have to zoom out to view the whole bounds
    // or if we have to zoom in to reach a "reasonable" zoom level
    zoom =
      unclampedZoom < currZoom || clampedZoom > currZoom
        ? clampedZoom
        : currZoom;
  }

  const x =
    width / 2 -
    boundsCenterX * zoom +
    useLocalStorage.getState().overviewTrueWidth;
  const y = height / 2 - boundsCenterY * zoom;

  return { x, y, zoom };
};

export const getD3Transition = (
  selection: D3Selection<Element, unknown, null, undefined>,
  duration = 0,
) => {
  return selection.transition().duration(duration);
};

export function getSectionRect(sectionId: string, ignoreGrid = false) {
  const ref =
    useSectionRefs.getState().selfOnly[sectionId] ??
    useSectionRefs.getState().withNested[sectionId];
  if (!ref) {
    return null;
  }

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

export function getSectionBounds(
  sectionIds: Array<string>,
  ignoreGrid = false,
): Rect | null {
  const sections = sectionIds.flatMap((sectionId) => {
    const rect = getSectionRect(sectionId, ignoreGrid);
    if (!rect) {
      return [];
    }
    const { x, y, width, height } = rect;
    return [{ position: { x, y }, width, height }];
  });

  if (sections.length === 0) {
    return null;
  }

  return getNodesBounds(sections);
}

export function getPaneRect(
  s: ReactFlowState,
  overviewWidth: number,
  uiEditorWidth: number,
  transformOverride?: Transform,
): Rect {
  const transform = transformOverride ?? s.transform;
  if (!s.domNode) {
    return {
      x: (-transform[0] + overviewWidth) / transform[2],
      y: -transform[1] / transform[2],
      width: s.width / transform[2],
      height: s.height / transform[2],
    };
  }

  const bounds = s.domNode.getBoundingClientRect();
  const visibleWidth = Math.max(
    bounds.width - overviewWidth - uiEditorWidth,
    0,
  );
  const visibleHeight = Math.max(bounds.height, 0);
  const topLeft = pointToRendererPoint(
    { x: overviewWidth, y: 0 },
    transform,
    false,
    [1, 1],
    true,
  );
  const bottomRight = pointToRendererPoint(
    { x: overviewWidth + visibleWidth, y: visibleHeight },
    transform,
    false,
    [1, 1],
    true,
  );

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

function isSectionOverlappingWithRect(
  sectionId: string,
  otherRect: Rect,
  partially: boolean,
) {
  const rect = getSectionRect(sectionId);
  if (!rect) {
    return false;
  }

  const { x, y, width, height } = rect;

  const nodeRect = {
    x,
    y,
    width: width || 0,
    height: height || 0,
  };
  const overlappingArea = getOverlappingArea(otherRect, nodeRect);
  const notInitialized =
    typeof width === "undefined" ||
    typeof height === "undefined" ||
    width === null ||
    height === null;

  const partiallyVisible = partially && overlappingArea > 0;
  const area = (width || 0) * (height || 0);
  return notInitialized || partiallyVisible || overlappingArea >= area;
}

export function movePaneToIncludeElement(element: HTMLElement) {
  const point = screenToFlowPosition(element.getBoundingClientRect());
  const paneRect = getPaneRect(
    useReactFlow.getState(),
    useLocalStorage.getState().overviewTrueWidth,
    useLocalStorage.getState().uiEditorTrueWidth,
  );
  const { x, y, isInside } = getRectTranslation(point, paneRect, 100);
  if (!isInside) {
    const { d3Zoom, d3Selection } = useReactFlow.getState();
    d3Zoom.translateBy(d3Selection, -x, -y);
  }
}

function getRectTranslation(point: Position, rect: Rect, padding = 0) {
  // Calculate the boundaries with padding
  const minX = rect.x + padding;
  const maxX = rect.x + rect.width - padding;
  const minY = rect.y + padding;
  const maxY = rect.y + rect.height - padding;

  let translateX = 0;
  let translateY = 0;

  // Calculate required X translation
  if (point.x < minX) {
    translateX = point.x - minX; // negative: move rectangle left
  } else if (point.x > maxX) {
    translateX = point.x - maxX; // positive: move rectangle right
  }

  // Calculate required Y translation
  if (point.y < minY) {
    translateY = point.y - minY; // negative: move rectangle up
  } else if (point.y > maxY) {
    translateY = point.y - maxY; // positive: move rectangle down
  }

  return {
    x: translateX,
    y: translateY,
    isInside: translateX === 0 && translateY === 0,
  };
}
