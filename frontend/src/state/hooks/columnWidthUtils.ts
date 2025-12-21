import { clamp } from "utils/utils";

function getMarginPx(maxNestedDepth: number): number {
  return 72 + Math.max(0, 12 * (maxNestedDepth - 1));
}

export function calculateBoundedWidth(
  width: number,
  containerWidth: number,
  maxNestedDepth: number,
): number {
  const marginPx = getMarginPx(maxNestedDepth);
  return clamp(width, marginPx, containerWidth - marginPx);
}

export function getDefaultColumnWidth(containerWidth: number): number {
  return containerWidth / 2;
}
