import type { Rectangle } from "@dnd-kit/geometry";
import type { ClientRect } from "./types";

type RectLike = Partial<{
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  x: number;
  y: number;
}>;

type RectDimensions = {
  width: number;
  height: number;
};

export function rectFromBoundingRect(
  rect: Rectangle["boundingRectangle"],
): ClientRect {
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function getRectDimensions(rect: RectLike): RectDimensions | null {
  if (typeof rect.width !== "number" || typeof rect.height !== "number") {
    return null;
  }

  return {
    width: rect.width,
    height: rect.height,
  };
}

function coerceFromLeftTop(
  rect: RectLike,
  dimensions: RectDimensions,
): ClientRect | null {
  if (typeof rect.left !== "number" || typeof rect.top !== "number") {
    return null;
  }

  return {
    top: rect.top,
    left: rect.left,
    right:
      typeof rect.right === "number"
        ? rect.right
        : rect.left + dimensions.width,
    bottom:
      typeof rect.bottom === "number"
        ? rect.bottom
        : rect.top + dimensions.height,
    width: dimensions.width,
    height: dimensions.height,
  };
}

function coerceFromCoordinates(
  rect: RectLike,
  dimensions: RectDimensions,
): ClientRect | null {
  if (typeof rect.x !== "number" || typeof rect.y !== "number") {
    return null;
  }

  return {
    top: rect.y,
    left: rect.x,
    right: rect.x + dimensions.width,
    bottom: rect.y + dimensions.height,
    width: dimensions.width,
    height: dimensions.height,
  };
}

export function coerceClientRect(value: unknown): ClientRect | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rect = value as RectLike;
  const dimensions = getRectDimensions(rect);
  if (!dimensions) {
    return null;
  }

  return (
    coerceFromLeftTop(rect, dimensions) ??
    coerceFromCoordinates(rect, dimensions)
  );
}
