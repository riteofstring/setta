import { useLocalStorage, useSettings } from "state/definitions";
import { Position } from "utils/generatedTypes";
import { useReactFlow } from "../store";
import type { Viewport } from "../types";
import { pointToRendererPoint } from "../utils/graph";

export function getViewport(): Viewport {
  const [x, y, zoom] = useReactFlow.getState().transform;
  return { x, y, zoom };
}

export function screenToFlowPosition(position: Position, ignoreGrid = false) {
  const { transform, domNode } = useReactFlow.getState();
  const { snapGrid } = useSettings.getState().gui;
  const snapToGrid = useLocalStorage.getState().snapToGrid;

  if (!domNode) {
    return position;
  }

  const { x: domX, y: domY } = domNode.getBoundingClientRect();
  const relativePosition = {
    x: position.x - domX,
    y: position.y - domY,
  };

  return pointToRendererPoint(
    relativePosition,
    transform,
    snapToGrid,
    snapGrid,
    ignoreGrid,
  );
}
