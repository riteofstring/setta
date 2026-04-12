import { centerViewportOnWorldPoint } from "components/Pages/Project/graphSubstrate/viewportTransform";
import { zoomIdentity } from "d3-zoom";
import _ from "lodash";
import { useLocalStorage, useSettings } from "state/definitions";
import { Position } from "utils/generatedTypes";
import { useReactFlow } from "../store";
import type {
  Viewport,
  ViewportTransitionOptions,
  ViewportZoomOptions,
} from "../types";
import {
  getD3Transition,
  hasActiveD3ViewportTarget,
  pointToRendererPoint,
} from "../utils/graph";

type ViewportTransform = Partial<Viewport>;

type ViewportOverrideState = {
  domNode: HTMLDivElement | null;
  viewport: Viewport;
};

let viewportOverrideState: ViewportOverrideState | null = null;

function getViewportTransitionResources(options?: ViewportTransitionOptions) {
  const { d3Zoom, d3Selection, domNode } = useReactFlow.getState();
  if (
    !d3Zoom ||
    !d3Selection ||
    !hasActiveD3ViewportTarget(d3Selection, domNode)
  ) {
    return null;
  }
  return {
    d3Zoom,
    transition: getD3Transition(d3Selection, options?.duration),
  };
}

export const zoomIn = _.throttle((options?: ViewportTransitionOptions) => {
  const resources = getViewportTransitionResources(options);
  if (resources) {
    resources.d3Zoom.scaleBy(resources.transition, 1.2);
    return;
  }
  useReactFlow.getState().viewportController?.zoomBy(1.2, options);
}, 50);

export const zoomOut = _.throttle((options?: ViewportTransitionOptions) => {
  const resources = getViewportTransitionResources(options);
  if (resources) {
    resources.d3Zoom.scaleBy(resources.transition, 1 / 1.2);
    return;
  }
  useReactFlow.getState().viewportController?.zoomBy(1 / 1.2, options);
}, 50);

function zoomTo(zoomLevel: number, options?: ViewportTransitionOptions) {
  const resources = getViewportTransitionResources(options);
  if (resources) {
    resources.d3Zoom.scaleTo(resources.transition, zoomLevel);
    return;
  }
  useReactFlow.getState().viewportController?.zoomTo(zoomLevel, options);
}

export function resetZoom() {
  const { defaultZoomLevel } = useSettings.getState().gui;
  zoomTo(defaultZoomLevel, { duration: 100 });
}

export function getZoom() {
  return getViewport().zoom;
}

function setViewport(
  transform: ViewportTransform,
  options?: ViewportTransitionOptions,
) {
  const resources = getViewportTransitionResources(options);
  if (resources) {
    const {
      transform: [x, y, zoom],
    } = useReactFlow.getState();
    const nextTransform = zoomIdentity
      .translate(transform.x ?? x, transform.y ?? y)
      .scale(transform.zoom ?? zoom);
    resources.d3Zoom.transform(resources.transition, nextTransform);
    return;
  }
  useReactFlow.getState().viewportController?.setViewport(transform, options);
}

export function getViewport(): Viewport {
  if (viewportOverrideState) {
    return viewportOverrideState.viewport;
  }
  const [x, y, zoom] = useReactFlow.getState().transform;
  return { x, y, zoom };
}

export function setViewportOverride(
  nextOverrideState: ViewportOverrideState | null,
) {
  viewportOverrideState = nextOverrideState;
  if (
    typeof window !== "undefined" &&
    nextOverrideState !== null &&
    nextOverrideState.viewport.zoom > 0
  ) {
    window.reactFlowZoom = nextOverrideState.viewport.zoom;
  }
}

export function setCenter(x: number, y: number, options?: ViewportZoomOptions) {
  const resources = getViewportTransitionResources(options);
  if (!resources) {
    useReactFlow.getState().viewportController?.setCenter(x, y, options);
    return;
  }
  const { width, height } = useReactFlow.getState();
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

  resources.d3Zoom.transform(resources.transition, transform);
}

export function screenToFlowPosition(position: Position, ignoreGrid = false) {
  const reactFlowState = useReactFlow.getState();
  const domNode = viewportOverrideState?.domNode ?? reactFlowState.domNode;
  const viewport = getViewport();
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
    [viewport.x, viewport.y, viewport.zoom],
    snapToGrid,
    snapGrid,
    ignoreGrid,
  );
}

export function updateMapPosition(widthDiff: number) {
  const { x, y, zoom } = getViewport();
  setViewport(
    { x: x + widthDiff, y, zoom },
    {
      duration: 100,
    },
  );
}
