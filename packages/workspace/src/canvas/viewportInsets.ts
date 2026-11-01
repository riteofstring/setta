import type { Dimensions, Rect, ViewportInsets } from "./types.js";

export const EMPTY_VIEWPORT_INSETS: ViewportInsets = {
  bottom: 0,
  left: 0,
  right: 0,
  top: 0,
};

export function getPhysicalViewportInsets({
  direction,
  leading,
  trailing,
}: {
  direction: "ltr" | "rtl";
  leading: number;
  trailing: number;
}): ViewportInsets {
  if (
    ![leading, trailing].every((value) => Number.isFinite(value) && value >= 0)
  ) {
    throw new Error(
      "Workspace viewport pane insets must be finite, non-negative numbers.",
    );
  }
  return direction === "rtl"
    ? { bottom: 0, left: trailing, right: leading, top: 0 }
    : { bottom: 0, left: leading, right: trailing, top: 0 };
}

export function areViewportInsetsEqual(
  left: ViewportInsets,
  right: ViewportInsets,
): boolean {
  return (
    left.top === right.top &&
    left.right === right.right &&
    left.bottom === right.bottom &&
    left.left === right.left
  );
}

export function getVisibleCanvasRect(
  dimensions: Dimensions,
  insets: ViewportInsets,
): Rect {
  const values = [
    dimensions.width,
    dimensions.height,
    ...Object.values(insets),
  ];
  if (!values.every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error(
      "Workspace viewport dimensions and insets must be finite and non-negative.",
    );
  }

  const width = dimensions.width - insets.left - insets.right;
  const height = dimensions.height - insets.top - insets.bottom;
  if (width <= 0 || height <= 0) {
    return { x: 0, y: 0, width: dimensions.width, height: dimensions.height };
  }

  return { x: insets.left, y: insets.top, width, height };
}
