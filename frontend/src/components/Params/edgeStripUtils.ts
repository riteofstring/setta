export const EDGE_STRIP_BASE_HEIGHT = 48;
export const EDGE_PORT_ROW_HEIGHT = 24;
export const EDGE_PORT_ROW_GAP = 4;

export function getEdgeStripEstimatedHeight(
  inputPortCount: number,
  outputPortCount: number,
): number {
  if (inputPortCount <= 0 && outputPortCount <= 0) {
    return 0;
  }
  const rowCount = Math.max(inputPortCount, outputPortCount, 1);
  return (
    EDGE_STRIP_BASE_HEIGHT +
    EDGE_PORT_ROW_HEIGHT * rowCount +
    EDGE_PORT_ROW_GAP * Math.max(rowCount - 1, 0)
  );
}

type ResolveEdgeStripHeightInput = {
  measuredHeight: number | null | undefined;
  inputPortCount: number;
  outputPortCount: number;
};

export function resolveEdgeStripHeight({
  measuredHeight,
  inputPortCount,
  outputPortCount,
}: ResolveEdgeStripHeightInput): number {
  if (typeof measuredHeight === "number" && measuredHeight > 0) {
    return Math.ceil(measuredHeight);
  }
  return Math.ceil(getEdgeStripEstimatedHeight(inputPortCount, outputPortCount));
}
