import type { Selection as D3Selection } from "d3-selection";
// Augments the d3 selection with `.transition()` (the runtime patch ships with d3-zoom's own
// d3-transition dependency).
import "d3-transition";
import { getActiveSectionIds } from "../document/activeSections";
import { useNodeInternals, useWorkspaceDocument } from "../document/stores";
import type { Node, Viewport } from "../document/types";
import { useSectionRefs } from "../section/sectionRefs";
import { resolveWorkspaceMotionDuration } from "../styles/motion";
import type { ReactFlowState, Rect, Transform } from "./types";
import { boxToRect, clamp, getBoundsOfBoxes, getOverlappingArea, rectToBox } from "./utils";
import { screenToFlowPosition } from "./viewportPosition";

export const getNodesBounds = (nodes: Array<Pick<Node, "position" | "width" | "height">>): Rect => {
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
  const activeSectionIds = getActiveSectionIds();
  return (
    getSectionBounds(activeSectionIds, ignoreGrid) ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    }
  );
}

// Measures a section through its registered DOM ref: the fallback for nested sections and
// nodes that have not been measured yet.
export function getSectionRect(sectionId: string, ignoreGrid = false): Rect | null {
  const ref =
    useSectionRefs.getState().selfOnly[sectionId] ??
    useSectionRefs.getState().withNested[sectionId];
  if (!ref) {
    return null;
  }

  const { clientWidth: width, clientHeight: height } = ref;
  const { x: _x, y: _y } = ref.getBoundingClientRect();
  const { x, y } = screenToFlowPosition({ x: _x, y: _y }, ignoreGrid);
  return { x, y, width, height };
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

  // Nested sections have no node-internals entry; measure them through their registered DOM
  // refs so a marquee can select them, as the reference does with its project sections sweep.
  for (const sectionId of Object.keys(useWorkspaceDocument.getState().sections)) {
    if (handledSectionIds.has(sectionId)) {
      continue;
    }
    if (isSectionOverlappingWithRect(sectionId, rectToLookInside, partially)) {
      visibleNodes.push(sectionId);
    }
  }

  return visibleNodes;
}

// The visible pane in flow coordinates, from the reference's `utils/graph.ts`. Seam adaptation
// shared with fit-view centering and edge auto-pan: the reference subtracts its Overview and
// UI-editor rail widths, which are app chrome outside the package seam — the package pane is
// the canvas wrapper alone.
export function getPaneRect(s: ReactFlowState): Rect {
  if (!s.domNode) {
    return {
      x: -s.transform[0] / s.transform[2],
      y: -s.transform[1] / s.transform[2],
      width: s.width / s.transform[2],
      height: s.height / s.transform[2],
    };
  }

  const bounds = s.domNode.getBoundingClientRect();
  const visibleWidth = Math.max(bounds.width, 0);
  const visibleHeight = Math.max(bounds.height, 0);
  const topLeft = screenToFlowPosition({ x: bounds.left, y: bounds.top }, true);
  const bottomRight = screenToFlowPosition(
    { x: bounds.left + visibleWidth, y: bounds.top + visibleHeight },
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
  padding = 0.1,
): Viewport => {
  const xZoom = width / (bounds.width * (1 + padding));
  const yZoom = height / (bounds.height * (1 + padding));
  const zoom = clamp(Math.min(xZoom, yZoom), zoomLimits.minZoom, zoomLimits.maxZoom);
  const boundsCenterX = bounds.x + bounds.width / 2;
  const boundsCenterY = bounds.y + bounds.height / 2;
  const x = width / 2 - boundsCenterX * zoom;
  const y = height / 2 - boundsCenterY * zoom;

  return { x, y, zoom };
};

export const getD3Transition = (
  selection: D3Selection<Element, unknown, null, undefined>,
  duration = 0,
) => {
  return selection.transition().duration(resolveWorkspaceMotionDuration(duration));
};

function getSectionBounds(sectionIds: Array<string>, ignoreGrid = false): Rect | null {
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
    if (!rect || !hasPositiveRectBounds(rect.width, rect.height)) {
      return [];
    }
    return [{ position: { x: rect.x, y: rect.y }, width: rect.width, height: rect.height }];
  });

  if (sections.length === 0) {
    return null;
  }

  return getNodesBounds(sections);
}

function isSectionOverlappingWithRect(sectionId: string, otherRect: Rect, partially: boolean) {
  const rect = getSectionRect(sectionId, true);
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

function isNodeOverlappingWithRect(node: Node, otherRect: Rect, partially: boolean) {
  const { width, height } = node;
  if (typeof width !== "number" || typeof height !== "number" || width <= 0 || height <= 0) {
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
  return typeof width === "number" && typeof height === "number" && width > 0 && height > 0;
}
