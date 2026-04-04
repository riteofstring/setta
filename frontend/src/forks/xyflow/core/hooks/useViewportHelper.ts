import { centerViewportOnWorldPoint } from "components/Pages/Project/graphSubstrate/viewportTransform";
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

export const zoomIn = _.throttle((options?: TransitionOptions) => {
  const { d3Zoom, d3Selection } = useReactFlow.getState();
  d3Zoom!.scaleBy(getD3Transition(d3Selection!, options?.duration), 1.2);
}, 50);

export const zoomOut = _.throttle((options?: TransitionOptions) => {
  const { d3Zoom, d3Selection } = useReactFlow.getState();
  d3Zoom!.scaleBy(getD3Transition(d3Selection!, options?.duration), 1 / 1.2);
}, 50);

function zoomTo(zoomLevel: number, options?: TransitionOptions) {
  const { d3Zoom, d3Selection } = useReactFlow.getState();
  d3Zoom!.scaleTo(getD3Transition(d3Selection!, options?.duration), zoomLevel);
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
  const {
    d3Zoom,
    d3Selection,
    transform: [x, y, zoom],
  } = useReactFlow.getState();
  const nextTransform = zoomIdentity
    .translate(transform.x ?? x, transform.y ?? y)
    .scale(transform.zoom ?? zoom);
  d3Zoom!.transform(
    getD3Transition(d3Selection!, options?.duration),
    nextTransform,
  );
}

export function getViewport(): Viewport {
  const [x, y, zoom] = useReactFlow.getState().transform;
  return { x, y, zoom };
}

export function setCenter(x: number, y: number, options?: ZoomOptions) {
  const { width, height, d3Zoom, d3Selection } = useReactFlow.getState();
  const { maxZoom } = useSettings.getState().gui;
  const { overviewTrueWidth } = useLocalStorage.getState();

  const nextZoom = typeof options?.zoom === "number" ? options.zoom : maxZoom;
  const nextViewport = centerViewportOnWorldPoint(
    { x: 0, y: 0, zoom: nextZoom },
    {
      worldPoint: { x, y },
      screenPoint: { x: width / 2 + overviewTrueWidth, y: height / 2 },
      zoom: nextZoom,
    },
  );
  const transform = zoomIdentity
    .translate(nextViewport.x, nextViewport.y)
    .scale(nextViewport.zoom);

  d3Zoom!.transform(
    getD3Transition(d3Selection!, options?.duration),
    transform,
  );
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
