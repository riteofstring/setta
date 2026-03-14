import type { CanvasEngineNestedPreviewRect } from "canvas-engine/types";
import type { Node } from "forks/xyflow/core/types";
import type { TopLevelSectionLayout } from "utils/generatedTypes";

type OverviewNodesParams = {
  topLevelSections: Record<string, TopLevelSectionLayout>;
  nestedPreviewRects: CanvasEngineNestedPreviewRect[];
};

const DEFAULT_TOP_LEVEL_WIDTH = 320;
const DEFAULT_TOP_LEVEL_HEIGHT = 200;

export function getCanvasEngineOverviewNodes({
  topLevelSections,
  nestedPreviewRects,
}: OverviewNodesParams): Node[] {
  const topLevelNodes = Object.entries(topLevelSections).map(
    ([sectionId, layout]) => {
      const zIndex = typeof layout.zIndex === "number" ? layout.zIndex : 0;
      return {
        id: sectionId,
        position: {
          x: typeof layout.x === "number" ? layout.x : 0,
          y: typeof layout.y === "number" ? layout.y : 0,
        },
        width:
          typeof layout.w === "number" ? layout.w : DEFAULT_TOP_LEVEL_WIDTH,
        height:
          typeof layout.h === "number" ? layout.h : DEFAULT_TOP_LEVEL_HEIGHT,
        zIndex,
        tempZIndex: zIndex,
        type: "default",
      } satisfies Node;
    },
  );
  const topLevelIds = new Set(topLevelNodes.map((node) => node.id));
  const nestedNodes = nestedPreviewRects
    .filter((rect) => !topLevelIds.has(rect.id))
    .map((rect) => {
      const parentLayout = topLevelSections[rect.parentSectionId];
      const parentZIndex =
        typeof parentLayout?.zIndex === "number" ? parentLayout.zIndex : 0;
      const zIndex = parentZIndex + 0.5;
      return {
        id: rect.id,
        position: {
          x: rect.x,
          y: rect.y,
        },
        width: rect.width,
        height: rect.height,
        zIndex,
        tempZIndex: zIndex,
        type: "canvas-engine-nested-preview",
        style: {
          background: getCanvasEngineOverviewNodeColorCss(rect.color),
        },
      } satisfies Node;
    });

  const nodes = [...topLevelNodes, ...nestedNodes];
  nodes.sort((left, right) => {
    const leftZIndex = left.zIndex ?? 0;
    const rightZIndex = right.zIndex ?? 0;
    if (leftZIndex !== rightZIndex) {
      return leftZIndex - rightZIndex;
    }
    return left.id.localeCompare(right.id);
  });
  return nodes;
}

export function getCanvasEngineOverviewNodeColorCss(
  color: [number, number, number],
): string {
  return `rgb(${color.map((value) => Math.round(value * 255)).join(" ")})`;
}
