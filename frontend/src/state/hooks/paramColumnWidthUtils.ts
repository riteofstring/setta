import {
  calculateBoundedWidthWithMinRemainingWidth,
  getDefaultColumnWidth,
} from "./columnWidthUtils";

export const PARAM_COLUMN_CENTER_OFFSET_PX = 18;
export const PARAM_MIN_VALUE_COLUMN_WIDTH_PX = 100;

export function calculateBoundedParamColumnRawWidth({
  containerWidth,
  maxNestedDepth,
  rawWidth,
}: {
  readonly containerWidth: number;
  readonly maxNestedDepth: number;
  readonly rawWidth: number;
}): number {
  return calculateBoundedWidthWithMinRemainingWidth(
    rawWidth,
    containerWidth,
    maxNestedDepth,
    PARAM_MIN_VALUE_COLUMN_WIDTH_PX,
  );
}

export function resolveParamColumnWidth({
  containerWidth,
  maxNestedDepth,
  persistedColumnWidth,
}: {
  readonly containerWidth: number;
  readonly maxNestedDepth: number;
  readonly persistedColumnWidth?: number | null | undefined;
}): number {
  const rawWidth =
    persistedColumnWidth === null || persistedColumnWidth === undefined
      ? getDefaultColumnWidth(containerWidth)
      : persistedColumnWidth + PARAM_COLUMN_CENTER_OFFSET_PX;
  return Math.max(
    0,
    calculateBoundedParamColumnRawWidth({
      containerWidth,
      maxNestedDepth,
      rawWidth,
    }) - PARAM_COLUMN_CENTER_OFFSET_PX,
  );
}
