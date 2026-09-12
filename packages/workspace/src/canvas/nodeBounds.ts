import type { Node } from "../document/types";
import type { Rect } from "./types";
import { boxToRect, getBoundsOfBoxes, rectToBox } from "./utils";

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

export function hasPositiveRectBounds(
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
