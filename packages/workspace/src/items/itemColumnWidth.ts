import type { WorkspaceSectionItemTree } from "../document/types";

export const ITEM_COLUMN_CENTER_OFFSET_PX = 18;
const MIN_ITEM_VALUE_COLUMN_WIDTH_PX = 100;

const BASE_ITEM_COLUMN_MARGIN_PX = 72;
const NESTED_ITEM_COLUMN_MARGIN_PX = 12;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function getItemColumnMargin(maxNestedDepth: number): number {
  return (
    BASE_ITEM_COLUMN_MARGIN_PX +
    Math.max(0, NESTED_ITEM_COLUMN_MARGIN_PX * (maxNestedDepth - 1))
  );
}

export function calculateBoundedItemColumnWidth(
  rawWidth: number,
  containerWidth: number,
  maxNestedDepth: number,
): number {
  const margin = getItemColumnMargin(maxNestedDepth);
  const maximum = Math.max(
    margin,
    containerWidth - MIN_ITEM_VALUE_COLUMN_WIDTH_PX,
  );
  return clamp(rawWidth, margin, maximum);
}

export function getDefaultItemColumnWidth(containerWidth: number): number {
  return containerWidth / 2;
}

export function getItemColumnCssWidth(rawWidth: number): number {
  return rawWidth - ITEM_COLUMN_CENTER_OFFSET_PX;
}

export function getDeepestItemDepth(
  itemTree: WorkspaceSectionItemTree,
): number {
  let maximumDepth = 1;
  const root = itemTree.items[itemTree.rootId];
  if (!root) {
    throw new Error(`Item tree is missing its root item ${itemTree.rootId}.`);
  }

  const pending = root.children.map((itemId) => ({ itemId, depth: 1 }));
  let next = pending.pop();
  while (next) {
    maximumDepth = Math.max(maximumDepth, next.depth);
    const item = itemTree.items[next.itemId];
    if (!item) {
      throw new Error(`Item tree is missing item ${next.itemId}.`);
    }
    for (const childId of item.children) {
      pending.push({ itemId: childId, depth: next.depth + 1 });
    }
    next = pending.pop();
  }
  return maximumDepth;
}
