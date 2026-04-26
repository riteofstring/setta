import type { Rect } from "forks/xyflow/core/types";
import type { Position } from "utils/generatedTypes";
import type { CanvasFlowSize, CanvasFlowViewport } from "./canvasFlowTypes";

export function clampZoom(zoom: number, minZoom: number, maxZoom: number) {
  return Math.min(Math.max(zoom, minZoom), maxZoom);
}

export function screenToWorldPoint(
  point: Position,
  viewport: CanvasFlowViewport,
): Position {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function worldToScreenPoint(
  point: Position,
  viewport: CanvasFlowViewport,
): Position {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y,
  };
}

export function panViewportByScreenDelta(
  viewport: CanvasFlowViewport,
  delta: Position,
): CanvasFlowViewport {
  return {
    x: viewport.x + delta.x,
    y: viewport.y + delta.y,
    zoom: viewport.zoom,
  };
}

export function zoomViewportAroundScreenPoint({
  viewport,
  screenPoint,
  nextZoom,
}: {
  viewport: CanvasFlowViewport;
  screenPoint: Position;
  nextZoom: number;
}): CanvasFlowViewport {
  const worldPoint = screenToWorldPoint(screenPoint, viewport);
  return {
    x: screenPoint.x - worldPoint.x * nextZoom,
    y: screenPoint.y - worldPoint.y * nextZoom,
    zoom: nextZoom,
  };
}

export function getVisibleWorldRect(
  size: Pick<CanvasFlowSize, "cssWidth" | "cssHeight">,
  viewport: CanvasFlowViewport,
): Rect {
  return {
    x: -viewport.x / viewport.zoom,
    y: -viewport.y / viewport.zoom,
    width: size.cssWidth / viewport.zoom,
    height: size.cssHeight / viewport.zoom,
  };
}

export function expandWorldRect(rect: Rect, overscan: number): Rect {
  return {
    x: rect.x - overscan,
    y: rect.y - overscan,
    width: rect.width + overscan * 2,
    height: rect.height + overscan * 2,
  };
}

export function canvasFlowViewportToTransform(
  viewport: CanvasFlowViewport,
): [number, number, number] {
  return [viewport.x, viewport.y, viewport.zoom];
}

export function transformToCanvasFlowViewport(
  transform: [number, number, number],
): CanvasFlowViewport {
  return {
    x: transform[0],
    y: transform[1],
    zoom: transform[2],
  };
}
