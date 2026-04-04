import {
  fitViewportToWorldRect,
  screenPointToWorldPoint,
  worldPointToScreenPoint,
} from "components/Pages/Project/graphSubstrate/viewportTransform";
import type { Selection as D3Selection } from "d3";
import { getActiveSectionUIIds } from "state/activeSectionUI";
import {
  useLocalStorage,
  useNodeInternals,
  useProjectState,
  useSectionRefs,
} from "state/definitions";
import { Position } from "utils/generatedTypes";
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
  const position = screenPointToWorldPoint(
    { x, y },
    { x: tx, y: ty, zoom: tScale },
  );

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
  return worldPointToScreenPoint({ x, y }, { x: tx, y: ty, zoom: tScale });
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
  return fitViewportToWorldRect(
    bounds,
    { width, height },
    {
      minZoom,
      maxZoom,
      padding,
      keepCurrentZoomIfPossible: keepCurrZoomIfPossible,
      currentZoom: useReactFlow.getState().transform[2],
      centerScreenPoint: {
        x: width / 2 + useLocalStorage.getState().overviewTrueWidth,
        y: height / 2,
      },
    },
  );
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
  const reactFlowState = useReactFlow.getState();
  const elementRect = element.getBoundingClientRect();
  const paneRect = getPaneScreenRect(
    reactFlowState,
    useLocalStorage.getState().overviewTrueWidth,
    useLocalStorage.getState().uiEditorTrueWidth,
  );
  const { x, y, isInside } = getRectTranslation(elementRect, paneRect, 100);
  if (!isInside) {
    const {
      d3Zoom,
      d3Selection,
      transform: [viewportX, viewportY, zoom],
      viewportController,
    } = reactFlowState;
    if (
      d3Zoom &&
      d3Selection &&
      hasActiveD3ViewportTarget(d3Selection, reactFlowState.domNode)
    ) {
      d3Zoom.translateBy(d3Selection, -x / zoom, -y / zoom);
      return;
    }
    viewportController?.setViewport({
      x: viewportX - x,
      y: viewportY - y,
    });
  }
}

type ScreenRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

function getPaneScreenRect(
  s: ReactFlowState,
  overviewWidth: number,
  uiEditorWidth: number,
): ScreenRect {
  if (s.domNode) {
    const bounds = s.domNode.getBoundingClientRect();
    const visibleWidth = Math.max(
      bounds.width - overviewWidth - uiEditorWidth,
      0,
    );
    const visibleHeight = Math.max(bounds.height, 0);

    return {
      left: bounds.left + overviewWidth,
      top: bounds.top,
      right: bounds.left + overviewWidth + visibleWidth,
      bottom: bounds.top + visibleHeight,
      width: visibleWidth,
      height: visibleHeight,
    };
  }

  const visibleWidth = Math.max(s.width, 0);
  const visibleHeight = Math.max(s.height, 0);
  return {
    left: overviewWidth,
    top: 0,
    right: overviewWidth + visibleWidth,
    bottom: visibleHeight,
    width: visibleWidth,
    height: visibleHeight,
  };
}

export function hasActiveD3ViewportTarget(
  d3Selection: D3Selection<Element, unknown, null, undefined>,
  domNode: HTMLDivElement | null,
) {
  if (typeof Element === "undefined") {
    return false;
  }
  const paneElement = d3Selection.node();
  if (!(paneElement instanceof Element) || !paneElement.isConnected) {
    return false;
  }
  if (!domNode) {
    return true;
  }
  return domNode.contains(paneElement);
}

function getRectTranslation(
  rect: ScreenRect,
  paneRect: ScreenRect,
  padding = 0,
) {
  const minX = paneRect.left + padding;
  const maxX = paneRect.right - padding;
  const minY = paneRect.top + padding;
  const maxY = paneRect.bottom - padding;
  const availableWidth = Math.max(maxX - minX, 0);
  const availableHeight = Math.max(maxY - minY, 0);

  let translateX = 0;
  let translateY = 0;

  if (availableWidth > 0 && rect.width > availableWidth) {
    const paneCenterX = paneRect.left + paneRect.width / 2;
    const rectCenterX = rect.left + rect.width / 2;
    translateX = rectCenterX - paneCenterX;
  } else if (rect.left < minX) {
    translateX = rect.left - minX;
  } else if (rect.right > maxX) {
    translateX = rect.right - maxX;
  }

  if (availableHeight > 0 && rect.height > availableHeight) {
    const paneCenterY = paneRect.top + paneRect.height / 2;
    const rectCenterY = rect.top + rect.height / 2;
    translateY = rectCenterY - paneCenterY;
  } else if (rect.top < minY) {
    translateY = rect.top - minY;
  } else if (rect.bottom > maxY) {
    translateY = rect.bottom - maxY;
  }

  return {
    x: translateX,
    y: translateY,
    isInside: translateX === 0 && translateY === 0,
  };
}
