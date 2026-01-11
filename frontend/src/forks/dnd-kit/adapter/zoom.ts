import type { DragOperation } from "@dnd-kit/abstract";
import { configurator, Modifier } from "@dnd-kit/abstract";
import type { Coordinates } from "@dnd-kit/geometry";
import { useReactFlow } from "forks/xyflow/core/store";
import type { Transform } from "./types";

export function getZoomScale(): number {
  return useReactFlow.getState().transform[2];
}

export function applyZoomToTransform(transform: Transform | null): Transform | null {
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

class ZoomModifier extends Modifier {
  apply({ transform }: DragOperation): Coordinates {
    const zoom = getZoomScale();
    if (!zoom || zoom === 1) {
      return transform;
    }
    return {
      x: transform.x / zoom,
      y: transform.y / zoom,
    };
  }
}

export const ZoomAwareModifier = configurator(ZoomModifier)();
