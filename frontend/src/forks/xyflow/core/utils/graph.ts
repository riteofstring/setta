import type { Selection as D3Selection } from "d3";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import {
  useLocalStorage,
  useNodeInternals,
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
  const activeSectionIds = getActiveSectionUIIds();
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
  const nodeInternals = useNodeInternals.getState().x;
  const handledSectionIds = new Set<string>();

  for (const node of nodeInternals.values()) {
    const isVisible = hasMeasuredNodeBounds(node)
      ? isNodeOverlappingWithRect(node, rectToLookInside, partially)
      : isSectionOverlappingWithRect(node.id, rectToLookInside, partially);

    if (isVisible) {
      visibleNodes.push(node.id);
    }
    handledSectionIds.add(node.id);
  }

  for (const sectionId of Object.keys(useProjectState.getState().sections)) {
    if (handledSectionIds.has(sectionId)) {
      continue;
    }
    if (isSectionOverlappingWithRect(sectionId, rectToLookInside, partially)) {
      visibleNodes.push(sectionId);
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
    return getCanvasEngineSectionRect(sectionId);
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
  const nodeInternals = useNodeInternals.getState().x;
  const sections = sectionIds.flatMap((sectionId) => {
    const node = nodeInternals.get(sectionId);
    if (node && hasPositiveRectBounds(node.width, node.height)) {
      return [
        {
          position: { x: node.position.x, y: node.position.y },
          width: node.width,
          height: node.height,
        },
      ];
    }

    const rect = getSectionRect(sectionId, ignoreGrid);
    if (!rect) {
      return [];
    }
    const { x, y, width, height } = rect;
    if (!hasPositiveRectBounds(width, height)) {
      return [];
    }
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
): Rect {
  if (!s.domNode) {
    return {
      x: (-s.transform[0] + overviewWidth) / s.transform[2],
      y: -s.transform[1] / s.transform[2],
      width: s.width / s.transform[2],
      height: s.height / s.transform[2],
    };
  }

  const bounds = s.domNode.getBoundingClientRect();
  const visibleWidth = Math.max(
    bounds.width - overviewWidth - uiEditorWidth,
    0,
  );
  const visibleHeight = Math.max(bounds.height, 0);
  const topLeft = screenToFlowPosition(
    { x: bounds.left + overviewWidth, y: bounds.top },
    true,
  );
  const bottomRight = screenToFlowPosition(
    {
      x: bounds.left + overviewWidth + visibleWidth,
      y: bounds.top + visibleHeight,
    },
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
  const rect = getSectionRect(sectionId, true);
  if (!rect) {
    return false;
  }

  const { x, y, width, height } = rect;
  if (!hasPositiveRectBounds(width, height)) {
    return false;
  }

  const nodeRect = {
    x,
    y,
    width,
    height,
  };
  const overlappingArea = getOverlappingArea(otherRect, nodeRect);
  const partiallyVisible = partially && overlappingArea > 0;
  const area = width * height;
  return partiallyVisible || overlappingArea >= area;
}

function isNodeOverlappingWithRect(
  node: Node,
  otherRect: Rect,
  partially: boolean,
) {
  const width = node.width;
  const height = node.height;
  if (!hasPositiveRectBounds(width, height)) {
    return false;
  }
  const nodeRect = {
    x: node.position.x,
    y: node.position.y,
    width,
    height,
  };
  const overlappingArea = getOverlappingArea(otherRect, nodeRect);
  const partiallyVisible = partially && overlappingArea > 0;
  const area = width * height;
  return partiallyVisible || overlappingArea >= area;
}

function hasMeasuredNodeBounds(node: Node) {
  return hasPositiveRectBounds(node.width, node.height);
}

function getCanvasEngineSectionRect(sectionId: string): Rect | null {
  const topLevelLayout =
    useProjectState.getState().projectConfig.topLevelSections[sectionId];
  if (
    topLevelLayout &&
    hasPositiveRectBounds(topLevelLayout.w, topLevelLayout.h)
  ) {
    return {
      x: topLevelLayout.x,
      y: topLevelLayout.y,
      width: topLevelLayout.w,
      height: topLevelLayout.h,
    };
  }

  const nestedPreviewRect = useReactFlow
    .getState()
    .canvasEngineNestedPreviewRects.find((rect) => rect.id === sectionId);
  if (!nestedPreviewRect) {
    return null;
  }
  if (
    !hasPositiveRectBounds(nestedPreviewRect.width, nestedPreviewRect.height)
  ) {
    return null;
  }
  return {
    x: nestedPreviewRect.x,
    y: nestedPreviewRect.y,
    width: nestedPreviewRect.width,
    height: nestedPreviewRect.height,
  };
}

function hasPositiveRectBounds(
  width: number | null | undefined,
  height: number | null | undefined,
) {
  return (
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0
  );
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
