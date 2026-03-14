import { zoomIdentity } from "d3-zoom";
import _ from "lodash";
import { useLocalStorage, useSettings } from "state/definitions";
import { Position } from "utils/generatedTypes";
import { useReactFlow } from "../store";
import type { Viewport } from "../types";
import { getD3Transition, pointToRendererPoint } from "../utils/graph";

type TransitionOptions = {
  duration?: number;
};

type ZoomOptions = TransitionOptions & {
  zoom?: number;
};

type ViewportTransform = Partial<Viewport>;

type ViewportCenterParams = {
  x: number;
  y: number;
  zoom: number;
  width: number;
  height: number;
  overviewTrueWidth: number;
};

type CenterPreservingZoomParams = {
  transform: Viewport;
  nextZoom: number;
  width: number;
  height: number;
  overviewTrueWidth: number;
};

export function getViewportTransformForCenter({
  x,
  y,
  zoom,
  width,
  height,
  overviewTrueWidth,
}: ViewportCenterParams): Viewport {
  const visibleCenterX = width / 2 + overviewTrueWidth;
  return {
    x: visibleCenterX - x * zoom,
    y: height / 2 - y * zoom,
    zoom,
  };
}

export function getViewportTransformForCenteredZoom({
  transform,
  nextZoom,
  width,
  height,
  overviewTrueWidth,
}: CenterPreservingZoomParams): Viewport {
  const visibleCenterX = width / 2 + overviewTrueWidth;
  const visibleCenterY = height / 2;
  const worldCenterX = (visibleCenterX - transform.x) / transform.zoom;
  const worldCenterY = (visibleCenterY - transform.y) / transform.zoom;
  return getViewportTransformForCenter({
    x: worldCenterX,
    y: worldCenterY,
    zoom: nextZoom,
    width,
    height,
    overviewTrueWidth,
  });
}

export function applyViewportTransform(
  transform: ViewportTransform,
  options?: TransitionOptions,
) {
  const reactFlowState = useReactFlow.getState();
  const [currentX, currentY, currentZoom] = reactFlowState.transform;
  const nextTransform = {
    x: transform.x ?? currentX,
    y: transform.y ?? currentY,
    zoom: transform.zoom ?? currentZoom,
  };
  const { d3Zoom, d3Selection } = reactFlowState;

  if (d3Zoom && d3Selection) {
    const d3Transform = zoomIdentity
      .translate(nextTransform.x, nextTransform.y)
      .scale(nextTransform.zoom);
    d3Zoom.transform(
      getD3Transition(d3Selection, options?.duration),
      d3Transform,
    );
    return nextTransform;
  }

  useReactFlow.setState({
    transform: [nextTransform.x, nextTransform.y, nextTransform.zoom],
    fitViewOnInit: false,
    fitViewOnInitDone: true,
  });
  return nextTransform;
}

export const zoomIn = _.throttle((options?: TransitionOptions) => {
  const { minZoom, maxZoom } = useSettings.getState().gui;
  const { overviewTrueWidth } = useLocalStorage.getState();
  const { transform: [x, y, zoom], width, height } = useReactFlow.getState();
  const nextZoom = Math.min(maxZoom, Math.max(minZoom, zoom * 1.2));
  const nextTransform = getViewportTransformForCenteredZoom({
    transform: { x, y, zoom },
    nextZoom,
    width,
    height,
    overviewTrueWidth,
  });
  applyViewportTransform(nextTransform, options);
}, 50);

export const zoomOut = _.throttle((options?: TransitionOptions) => {
  const { minZoom, maxZoom } = useSettings.getState().gui;
  const { overviewTrueWidth } = useLocalStorage.getState();
  const { transform: [x, y, zoom], width, height } = useReactFlow.getState();
  const nextZoom = Math.min(maxZoom, Math.max(minZoom, zoom / 1.2));
  const nextTransform = getViewportTransformForCenteredZoom({
    transform: { x, y, zoom },
    nextZoom,
    width,
    height,
    overviewTrueWidth,
  });
  applyViewportTransform(nextTransform, options);
}, 50);

function zoomTo(zoomLevel: number, options?: TransitionOptions) {
  const { minZoom, maxZoom } = useSettings.getState().gui;
  const { overviewTrueWidth } = useLocalStorage.getState();
  const { transform: [x, y, zoom], width, height } = useReactFlow.getState();
  const nextZoom = Math.min(maxZoom, Math.max(minZoom, zoomLevel));
  const nextTransform = getViewportTransformForCenteredZoom({
    transform: { x, y, zoom },
    nextZoom,
    width,
    height,
    overviewTrueWidth,
  });
  applyViewportTransform(nextTransform, options);
}

export function resetZoom() {
  const { defaultZoomLevel } = useSettings.getState().gui;
  zoomTo(defaultZoomLevel, { duration: 100 });
}

export function getZoom() {
  return useReactFlow.getState().transform[2];
}

function setViewport(
  transform: ViewportTransform,
  options?: TransitionOptions,
) {
  applyViewportTransform(transform, options);
}

export function getViewport(): Viewport {
  const [x, y, zoom] = useReactFlow.getState().transform;
  return { x, y, zoom };
}

export function setCenter(x: number, y: number, options?: ZoomOptions) {
  const { width, height } = useReactFlow.getState();
  const { maxZoom } = useSettings.getState().gui;
  const { overviewTrueWidth } = useLocalStorage.getState();

  const nextZoom = typeof options?.zoom === "number" ? options.zoom : maxZoom;
  const nextTransform = getViewportTransformForCenter({
    x,
    y,
    zoom: nextZoom,
    width,
    height,
    overviewTrueWidth,
  });
  applyViewportTransform(nextTransform, options);
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

export function updateMapPosition(widthDiff: number) {
  const {
    transform: [x, y, zoom],
  } = useReactFlow.getState();
  setViewport(
    { x: x + widthDiff, y, zoom },
    {
      duration: 100,
    },
  );
}
