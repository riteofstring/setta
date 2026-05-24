import { getZoom } from "gpuFlow/viewportActions";
import type { Transform } from "./types";

function getZoomScale(): number {
  return getZoom();
}

export function applyZoomToTransform(
  transform: Transform | null,
): Transform | null {
  if (!transform) {
    return null;
  }

  const zoom = getZoomScale();
  return {
    ...transform,
    x: transform.x / zoom,
    y: transform.y / zoom,
  };
}

export function transformToString(transform: Transform | null): string {
  if (!transform) {
    return "";
  }

  const { x, y, scaleX, scaleY } = transform;
  const translate = `translate3d(${x}px, ${y}px, 0)`;

  if (scaleX === 1 && scaleY === 1) {
    return translate;
  }

  return `${translate} scaleX(${scaleX}) scaleY(${scaleY})`;
}
