export const EDGE_STRIP_BASE_HEIGHT = 48;
export const EDGE_STRIP_DATA_EDGE_HANDLE_EDGE_OFFSET_PX = 1;
export const EDGE_PORT_ROW_HEIGHT = 24;
export const EDGE_PORT_ROW_GAP = 4;

function getEdgeStripEstimatedHeight(
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
  return Math.ceil(
    getEdgeStripEstimatedHeight(inputPortCount, outputPortCount),
  );
}

export function resolveEdgeStripOutputPortAnchorLocalPosition({
  portIndex,
  sectionWidth,
  stripLocalY,
}: {
  readonly portIndex: number;
  readonly sectionWidth: number;
  readonly stripLocalY: number;
}): { readonly x: number; readonly y: number } {
  if (!Number.isInteger(portIndex) || portIndex < 0) {
    throw new Error("Edge strip output port index must be non-negative.");
  }
  assertFiniteNumber("Edge strip section width", sectionWidth);
  assertFiniteNumber("Edge strip local y", stripLocalY);
  return {
    x: sectionWidth + EDGE_STRIP_DATA_EDGE_HANDLE_EDGE_OFFSET_PX,
    y:
      stripLocalY +
      EDGE_STRIP_BASE_HEIGHT +
      portIndex * (EDGE_PORT_ROW_HEIGHT + EDGE_PORT_ROW_GAP) +
      EDGE_PORT_ROW_HEIGHT / 2,
  };
}

export function resolveEdgeStripInputPortAnchorLocalPosition({
  portIndex,
  stripLocalY,
}: {
  readonly portIndex: number;
  readonly stripLocalY: number;
}): { readonly x: number; readonly y: number } {
  if (!Number.isInteger(portIndex) || portIndex < 0) {
    throw new Error("Edge strip input port index must be non-negative.");
  }
  assertFiniteNumber("Edge strip local y", stripLocalY);
  return {
    x: -EDGE_STRIP_DATA_EDGE_HANDLE_EDGE_OFFSET_PX,
    y:
      stripLocalY +
      EDGE_STRIP_BASE_HEIGHT +
      portIndex * (EDGE_PORT_ROW_HEIGHT + EDGE_PORT_ROW_GAP) +
      EDGE_PORT_ROW_HEIGHT / 2,
  };
}

function assertFiniteNumber(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite.`);
  }
}
