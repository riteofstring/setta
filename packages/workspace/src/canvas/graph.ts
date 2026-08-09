import type { Selection as D3Selection } from "d3-selection";
// Augments the d3 selection with `.transition()` (the runtime patch ships with d3-zoom's own
// d3-transition dependency).
import "d3-transition";
import { getActiveSectionIds } from "../document/activeSections";
import { useNodeInternals } from "../document/stores";
import type { Node, Viewport } from "../document/types";
import type { Rect, Transform } from "./types";
import { boxToRect, clamp, getBoundsOfBoxes, getOverlappingArea, rectToBox } from "./utils";

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

export function getActiveSectionsBounds() {
  const activeSectionIds = getActiveSectionIds();
  return (
    getSectionBounds(activeSectionIds) ?? {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    }
  );
}

// The reference falls back to section DOM refs for unmeasured or nested sections; that fallback
// arrives with the section-container batch that owns the package section-ref registry. Until
// then only measured top-level nodes participate in marquee hit testing and selection bounds.
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

  for (const node of nodeInternals.values()) {
    if (
      hasMeasuredNodeBounds(node) &&
      isNodeOverlappingWithRect(node, rectToLookInside, partially)
    ) {
      visibleNodes.push(node.id);
    }
  }

  return visibleNodes;
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
  return selection.transition().duration(duration);
};

function getSectionBounds(sectionIds: Array<string>): Rect | null {
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
    return [];
  });

  if (sections.length === 0) {
    return null;
  }

  return getNodesBounds(sections);
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
