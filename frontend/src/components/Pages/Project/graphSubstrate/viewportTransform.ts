import { Position } from "utils/generatedTypes";
import { clamp } from "utils/utils";

export type GraphViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type GraphRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GraphViewportSize = {
  width: number;
  height: number;
};

type FitViewportToWorldRectOptions = {
  minZoom: number;
  maxZoom: number;
  padding?: number;
  centerScreenPoint?: Position;
  currentZoom?: number;
  keepCurrentZoomIfPossible?: boolean;
};

type CenterViewportOnWorldPointOptions = {
  worldPoint: Position;
  screenPoint: Position;
  zoom?: number;
};

export function worldPointToScreenPoint(
  point: Position,
  viewport: GraphViewport,
): Position {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y,
  };
}

export function screenPointToWorldPoint(
  point: Position,
  viewport: GraphViewport,
): Position {
  return {
    x: (point.x - viewport.x) / viewport.zoom,
    y: (point.y - viewport.y) / viewport.zoom,
  };
}

export function worldDeltaToScreenDelta(
  delta: Position,
  viewport: GraphViewport,
): Position {
  return {
    x: delta.x * viewport.zoom,
    y: delta.y * viewport.zoom,
  };
}

export function screenDeltaToWorldDelta(
  delta: Position,
  viewport: GraphViewport,
): Position {
  return {
    x: delta.x / viewport.zoom,
    y: delta.y / viewport.zoom,
  };
}

export function translateViewport(
  viewport: GraphViewport,
  screenDelta: Position,
): GraphViewport {
  return {
    x: viewport.x + screenDelta.x,
    y: viewport.y + screenDelta.y,
    zoom: viewport.zoom,
  };
}

export function centerViewportOnWorldPoint(
  viewport: GraphViewport,
  options: CenterViewportOnWorldPointOptions,
): GraphViewport {
  const zoom = options.zoom ?? viewport.zoom;
  return {
    x: options.screenPoint.x - options.worldPoint.x * zoom,
    y: options.screenPoint.y - options.worldPoint.y * zoom,
    zoom,
  };
}

export function zoomViewportAroundScreenPoint(
  viewport: GraphViewport,
  anchorScreenPoint: Position,
  zoom: number,
): GraphViewport {
  const anchorWorldPoint = screenPointToWorldPoint(anchorScreenPoint, viewport);
  return centerViewportOnWorldPoint(viewport, {
    worldPoint: anchorWorldPoint,
    screenPoint: anchorScreenPoint,
    zoom,
  });
}

export function fitViewportToWorldRect(
  bounds: GraphRect,
  viewportSize: GraphViewportSize,
  options: FitViewportToWorldRectOptions,
): GraphViewport {
  const padding = options.padding ?? 0.1;
  const xZoom = viewportSize.width / (bounds.width * (1 + padding));
  const yZoom = viewportSize.height / (bounds.height * (1 + padding));
  const unclampedZoom = Math.min(xZoom, yZoom);
  const clampedZoom = clamp(unclampedZoom, options.minZoom, options.maxZoom);

  let zoom = clampedZoom;
  if (
    options.keepCurrentZoomIfPossible &&
    typeof options.currentZoom === "number"
  ) {
    zoom =
      unclampedZoom < options.currentZoom || clampedZoom > options.currentZoom
        ? clampedZoom
        : options.currentZoom;
  }

  const boundsCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const centerScreenPoint = options.centerScreenPoint ?? {
    x: viewportSize.width / 2,
    y: viewportSize.height / 2,
  };

  return centerViewportOnWorldPoint(
    { x: 0, y: 0, zoom },
    {
      worldPoint: boundsCenter,
      screenPoint: centerScreenPoint,
      zoom,
    },
  );
}
