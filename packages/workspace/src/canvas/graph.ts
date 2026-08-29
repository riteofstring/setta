import type { Selection as D3Selection } from "d3-selection";

import "d3-transition";
import { getActiveSectionIds } from "../document/activeSections";
import { getRootSelectedSectionIds } from "../document/sectionSelection";
import {
  getNodeInternalsStore,
  getWorkspaceDocumentStore,
} from "../document/stores";
import type { Node, Viewport } from "../document/types";
import { getSectionRefsStore } from "../section/sectionRefs";
import { resolveWorkspaceMotionDuration } from "../styles/motion";
import type { WorkspaceHost } from "../workspaceHost";
import type { ReactFlowState, Rect, Transform, ViewportInsets } from "./types";
import {
  boxToRect,
  clamp,
  getBoundsOfBoxes,
  getOverlappingArea,
  rectToBox,
} from "./utils";
import { EMPTY_VIEWPORT_INSETS, getVisibleCanvasRect } from "./viewportInsets";
import { screenToFlowPosition } from "./viewportPosition";

export const getNodesBounds = (
  nodes: Array<Pick<Node, "position" | "width" | "height">>,
): Rect => {
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

export function getActiveSectionsBounds(
  host: WorkspaceHost,
  ignoreGrid = false,
) {
  const activeSectionIds = getActiveSectionIds(host);
  const { rootIds } = getRootSelectedSectionIds(
    getWorkspaceDocumentStore(host).getState(),
    activeSectionIds,
  );
  return (
    getSectionBounds(host, rootIds, ignoreGrid) ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    }
  );
}

export function getSectionRect(
  host: WorkspaceHost,
  sectionId: string,
  ignoreGrid = false,
): Rect | null {
  const ref =
    getSectionRefsStore(host).getState().selfOnly[sectionId] ??
    getSectionRefsStore(host).getState().withNested[sectionId];
  if (!ref) {
    return null;
  }

  const { clientWidth: width, clientHeight: height } = ref;
  const { x: _x, y: _y } = ref.getBoundingClientRect();
  const { x, y } = screenToFlowPosition(host, { x: _x, y: _y }, ignoreGrid);
  return { x, y, width, height };
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

export const getD3Transition = (
  selection: D3Selection<Element, unknown, null, undefined>,
  duration = 0,
) => {
  return selection
    .transition()
    .duration(resolveWorkspaceMotionDuration(duration));
};

function getSectionBounds(
  host: WorkspaceHost,
  sectionIds: Array<string>,
  ignoreGrid = false,
): Rect | null {
  const nodeInternals = getNodeInternalsStore(host).getState().x;
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

    const rect = getSectionRect(host, sectionId, ignoreGrid);
    if (!rect || !hasPositiveRectBounds(rect.width, rect.height)) {
      return [];
    }
    return [
      {
        position: { x: rect.x, y: rect.y },
        width: rect.width,
        height: rect.height,
      },
    ];
  });

  if (sections.length === 0) {
    return null;
  }

  return getNodesBounds(sections);
}

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

function hasPositiveRectBounds(
  width: number | null | undefined,
  height: number | null | undefined,
): boolean {
  return (
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0
  );
}
