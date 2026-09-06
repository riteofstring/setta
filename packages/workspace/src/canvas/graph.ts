import {
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
} from "../document/stores";
import type { Node, Viewport } from "../document/types";
import type { WorkspaceHost } from "../workspaceHost";
import {
  resolveActiveSectionsBounds,
  resolveSectionRect,
} from "./activeSectionBounds";
import { getNodesBounds, hasPositiveRectBounds } from "./nodeBounds";
import type { ReactFlowState, Rect, Transform, ViewportInsets } from "./types";
import { clamp, getOverlappingArea } from "./utils";
import { EMPTY_VIEWPORT_INSETS, getVisibleCanvasRect } from "./viewportInsets";
import { screenToFlowPosition } from "./viewportPosition";

export { getNodesBounds } from "./nodeBounds";

export function getActiveSectionsBounds(
  host: WorkspaceHost,
  ignoreGrid = false,
) {
  return resolveActiveSectionsBounds(
    host,
    (position, shouldIgnoreGrid) =>
      screenToFlowPosition(host, position, shouldIgnoreGrid),
    ignoreGrid,
  );
}

export function getSectionRect(
  host: WorkspaceHost,
  sectionId: string,
  ignoreGrid = false,
): Rect | null {
  return resolveSectionRect(
    host,
    sectionId,
    (position, shouldIgnoreGrid) =>
      screenToFlowPosition(host, position, shouldIgnoreGrid),
    ignoreGrid,
  );
}

export function getNodesInside(
  host: WorkspaceHost,
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
  const nodeInternals = getNodeInternalsStore(host).getState().x;
  const handledSectionIds = new Set<string>();

  for (const node of nodeInternals.values()) {
    const isVisible = hasMeasuredNodeBounds(node)
      ? isNodeOverlappingWithRect(node, rectToLookInside, partially)
      : isSectionOverlappingWithRect(
          host,
          node.id,
          rectToLookInside,
          partially,
        );

    if (isVisible) {
      visibleNodes.push(node.id);
    }
    handledSectionIds.add(node.id);
  }

  for (const sectionId of Object.keys(
    getWorkspaceDocumentStore(host).getState().sections,
  )) {
    if (handledSectionIds.has(sectionId)) {
      continue;
    }
    if (
      isSectionOverlappingWithRect(host, sectionId, rectToLookInside, partially)
    ) {
      visibleNodes.push(sectionId);
    }
  }

  return visibleNodes;
}

export function getPaneRect(host: WorkspaceHost, s: ReactFlowState): Rect {
  const visibleCanvas = getVisibleCanvasRect(s, s.viewportInsets);
  if (!s.domNode) {
    return {
      x: (visibleCanvas.x - s.transform[0]) / s.transform[2],
      y: (visibleCanvas.y - s.transform[1]) / s.transform[2],
      width: visibleCanvas.width / s.transform[2],
      height: visibleCanvas.height / s.transform[2],
    };
  }

  const bounds = s.domNode.getBoundingClientRect();
  const topLeft = screenToFlowPosition(
    host,
    { x: bounds.left + visibleCanvas.x, y: bounds.top + visibleCanvas.y },
    true,
  );
  const bottomRight = screenToFlowPosition(
    host,
    {
      x: bounds.left + visibleCanvas.x + visibleCanvas.width,
      y: bounds.top + visibleCanvas.y + visibleCanvas.height,
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

export const getViewportForBounds = (
  bounds: Rect,
  width: number,
  height: number,
  zoomLimits: { minZoom: number; maxZoom: number },
  {
    padding = 0.1,
    viewportInsets = EMPTY_VIEWPORT_INSETS,
  }: { padding?: number; viewportInsets?: ViewportInsets } = {},
): Viewport => {
  const visibleCanvas = getVisibleCanvasRect({ width, height }, viewportInsets);
  if (visibleCanvas.width <= 0 || visibleCanvas.height <= 0) {
    throw new Error(
      "Cannot fit bounds before the canvas has measurable bounds.",
    );
  }
  const xZoom = visibleCanvas.width / (bounds.width * (1 + padding));
  const yZoom = visibleCanvas.height / (bounds.height * (1 + padding));
  const zoom = clamp(
    Math.min(xZoom, yZoom),
    zoomLimits.minZoom,
    zoomLimits.maxZoom,
  );
  const boundsCenterX = bounds.x + bounds.width / 2;
  const boundsCenterY = bounds.y + bounds.height / 2;
  const x = visibleCanvas.x + visibleCanvas.width / 2 - boundsCenterX * zoom;
  const y = visibleCanvas.y + visibleCanvas.height / 2 - boundsCenterY * zoom;

  return { x, y, zoom };
};

function isSectionOverlappingWithRect(
  host: WorkspaceHost,
  sectionId: string,
  otherRect: Rect,
  partially: boolean,
) {
  const rect = getSectionRect(host, sectionId, true);
  if (!rect) {
    return false;
  }

  const { x, y, width, height } = rect;
  if (!hasPositiveRectBounds(width, height)) {
    return false;
  }

  const nodeRect = { x, y, width, height };
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
  const { width, height } = node;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    width <= 0 ||
    height <= 0
  ) {
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
