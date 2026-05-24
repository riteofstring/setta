import type { GpuRect } from "./viewportMath";

export type GpuNodeBoundsInput = {
  readonly height?: number | null | undefined;
  readonly position: {
    readonly x: number;
    readonly y: number;
  };
  readonly width?: number | null | undefined;
};

type MeasuredGpuNodeBoundsInput = GpuNodeBoundsInput & {
  readonly height: number;
  readonly width: number;
};

export function isMeasuredGpuNodeBoundsInput(
  node: GpuNodeBoundsInput,
): node is MeasuredGpuNodeBoundsInput {
  return (
    typeof node.width === "number" &&
    typeof node.height === "number" &&
    Number.isFinite(node.width) &&
    Number.isFinite(node.height) &&
    node.width > 0 &&
    node.height > 0
  );
}

export function getGpuNodesBounds(
  nodes: readonly GpuNodeBoundsInput[],
): GpuRect {
  let bounds: GpuRect | null = null;
  for (const node of nodes) {
    if (!isMeasuredGpuNodeBoundsInput(node)) {
      continue;
    }
    const rect = {
      height: node.height,
      width: node.width,
      x: node.position.x,
      y: node.position.y,
    };
    bounds = bounds ? getBoundsOfGpuRects(bounds, rect) : rect;
  }
  return bounds ?? { height: 0, width: 0, x: 0, y: 0 };
}

export function getBoundsOfGpuRects(left: GpuRect, right: GpuRect): GpuRect {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const x2 = Math.max(left.x + left.width, right.x + right.width);
  const y2 = Math.max(left.y + left.height, right.y + right.height);
  return {
    height: y2 - y,
    width: x2 - x,
    x,
    y,
  };
}
