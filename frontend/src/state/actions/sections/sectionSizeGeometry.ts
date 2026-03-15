import { type SectionSize } from "utils/generatedTypes";

export function adjustSizeToBeAtLeastMin(
  height: number,
  width: number,
  minHeight: number,
  minWidth: number,
): { height: number; width: number } {
  const aspectRatio = width / height;

  if (height < minHeight || width < minWidth) {
    if (height < minHeight) {
      height = minHeight;
      width = height * aspectRatio;
    }

    if (width < minWidth) {
      width = minWidth;
      height = width / aspectRatio;
    }

    return {
      height: Math.round(height),
      width: Math.round(width),
    };
  }

  return { height, width };
}

export function adjustAspectRatio(
  height: SectionSize["height"],
  width: SectionSize["width"],
  imgHeight: number,
  imgWidth: number,
): { height: number; width: number } {
  if (height === "auto" && width === "auto") {
    return { height: imgHeight, width: imgWidth };
  }

  const imgAspectRatio = imgWidth / imgHeight;

  if (height === "auto") {
    return { height: width / imgAspectRatio, width };
  }

  if (width === "auto") {
    return { height, width: height * imgAspectRatio };
  }

  const currentAspectRatio = width / height;

  if (currentAspectRatio > imgAspectRatio) {
    return { height, width: height * imgAspectRatio };
  }
  if (currentAspectRatio < imgAspectRatio) {
    return { height: width / imgAspectRatio, width };
  }
  return { height, width };
}

export type ResizeHandleDirection =
  | "bottom"
  | "bottomLeft"
  | "bottomRight"
  | "left"
  | "right"
  | "top"
  | "topLeft"
  | "topRight";

const RESIZE_WIDTH_DIRECTIONS = new Set<ResizeHandleDirection>([
  "right",
  "bottomRight",
  "topRight",
]);
const RESIZE_HEIGHT_DIRECTIONS = new Set<ResizeHandleDirection>([
  "bottom",
  "bottomRight",
  "bottomLeft",
]);

export function isHeightResizeDirection(
  direction: ResizeHandleDirection,
): boolean {
  return RESIZE_HEIGHT_DIRECTIONS.has(direction);
}

export function getResizeStartAutoSizeUpdate({
  size,
  direction,
  rect,
}: {
  size: SectionSize;
  direction: ResizeHandleDirection;
  rect: { width: number; height: number };
}): Partial<SectionSize> | null {
  const nextSize: Partial<SectionSize> = {};
  if (size.width === "auto" && RESIZE_WIDTH_DIRECTIONS.has(direction)) {
    nextSize.width = Math.round(rect.width);
  }
  if (size.height === "auto" && RESIZE_HEIGHT_DIRECTIONS.has(direction)) {
    nextSize.height = Math.round(rect.height);
  }
  return Object.keys(nextSize).length > 0 ? nextSize : null;
}
