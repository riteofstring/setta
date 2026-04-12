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

export function coerceClientRect(value: unknown): ClientRect | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const rect = value as RectLike;
  if (typeof rect.width !== "number" || typeof rect.height !== "number") {
    return null;
  }

  if (typeof rect.left === "number" && typeof rect.top === "number") {
    const right =
      typeof rect.right === "number" ? rect.right : rect.left + rect.width;
    const bottom =
      typeof rect.bottom === "number" ? rect.bottom : rect.top + rect.height;
    return {
      top: rect.top,
      left: rect.left,
      right,
      bottom,
      width: rect.width,
      height: rect.height,
    };
  }

  if (typeof rect.x === "number" && typeof rect.y === "number") {
    return {
      top: rect.y,
      left: rect.x,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
      width: rect.width,
      height: rect.height,
    };
  }

  return null;
}
