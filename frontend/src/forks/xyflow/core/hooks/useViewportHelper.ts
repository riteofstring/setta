import _ from "lodash";
import { useLocalStorage, useSettings } from "state/definitions";
import { Position } from "utils/generatedTypes";
import { useReactFlow } from "../store";
import type { Viewport } from "../types";
import { pointToRendererPoint } from "../utils/graph";

type TransitionOptions = {
  duration?: number;
};

type ZoomOptions = TransitionOptions & {
  zoom?: number;
};

type ViewportTransform = Partial<Viewport>;

export const zoomIn = _.throttle((options?: TransitionOptions) => {
  const { transform } = useReactFlow.getState();
  setViewport({ zoom: transform[2] * 1.2 }, options);
}, 50);

export const zoomOut = _.throttle((options?: TransitionOptions) => {
  const { transform } = useReactFlow.getState();
  setViewport({ zoom: transform[2] / 1.2 }, options);
}, 50);

function zoomTo(zoomLevel: number, options?: TransitionOptions) {
  setViewport({ zoom: zoomLevel }, options);
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
  void options;
  const {
    transform: [x, y, zoom],
  } = useReactFlow.getState();
  useReactFlow.setState({
    transform: [transform.x ?? x, transform.y ?? y, transform.zoom ?? zoom],
  });
}

export function getViewport(): Viewport {
  const [x, y, zoom] = useReactFlow.getState().transform;
  return { x, y, zoom };
}

export function setCenter(x: number, y: number, options?: ZoomOptions) {
  void options?.duration;
  const { width, height } = useReactFlow.getState();
  const { maxZoom } = useSettings.getState().gui;
  const { overviewTrueWidth } = useLocalStorage.getState();

  const nextZoom = typeof options?.zoom === "number" ? options.zoom : maxZoom;
  const visibleCenterX = width / 2 + overviewTrueWidth;
  const centerX = visibleCenterX - x * nextZoom;
  const centerY = height / 2 - y * nextZoom;

  useReactFlow.setState({
    transform: [centerX, centerY, nextZoom],
  });
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
