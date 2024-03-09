import { zoomIdentity } from "d3-zoom";
import { useReactFlow } from "../store";
import type { XYPosition } from "../types";
import {
  getD3Transition,
  getViewportForBounds,
  pointToRendererPoint,
  rendererPointToPoint,
} from "../utils/graph";

export function zoomIn(options) {
  const { d3Zoom, d3Selection } = useReactFlow.getState();
  d3Zoom.scaleBy(getD3Transition(d3Selection, options?.duration), 1.2);
}

export function zoomOut(options) {
  const { d3Zoom, d3Selection } = useReactFlow.getState();
  d3Zoom.scaleBy(getD3Transition(d3Selection, options?.duration), 1 / 1.2);
}

export function zoomTo(zoomLevel, options) {
  const { d3Zoom, d3Selection } = useReactFlow.getState();
  d3Zoom.scaleTo(getD3Transition(d3Selection, options?.duration), zoomLevel);
}

export function getZoom() {
  return useReactFlow.getState().transform[2];
}

export function setViewport(transform, options) {
  const {
    d3Zoom,
    d3Selection,
    transform: [x, y, zoom],
  } = useReactFlow.getState();
  const nextTransform = zoomIdentity
    .translate(transform.x ?? x, transform.y ?? y)
    .scale(transform.zoom ?? zoom);
  d3Zoom.transform(
    getD3Transition(d3Selection, options?.duration),
    nextTransform,
  );
}

export function getViewport() {
  const [x, y, zoom] = useReactFlow.getState().transform;
  return { x, y, zoom };
}

export function setCenter(x, y, options) {
  const { width, height, maxZoom, d3Zoom, d3Selection } =
    useReactFlow.getState();
  const nextZoom =
    typeof options?.zoom !== "undefined" ? options.zoom : maxZoom;
  const centerX = width / 2 - x * nextZoom;
  const centerY = height / 2 - y * nextZoom;
  const transform = zoomIdentity.translate(centerX, centerY).scale(nextZoom);

  d3Zoom.transform(getD3Transition(d3Selection, options?.duration), transform);
}

export function fitBounds(bounds, options) {
  const { width, height, minZoom, maxZoom, d3Zoom, d3Selection } =
    useReactFlow.getState();
  const { x, y, zoom } = getViewportForBounds(
    bounds,
    width,
    height,
    minZoom,
    maxZoom,
    options?.padding ?? 0.1,
  );
  const transform = zoomIdentity.translate(x, y).scale(zoom);

  d3Zoom.transform(getD3Transition(d3Selection, options?.duration), transform);
}

export function screenToFlowPosition(position: XYPosition) {
  const { transform, snapToGrid, snapGrid, domNode } = useReactFlow.getState();

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
  );
}

export function flowToScreenPosition(position: XYPosition) {
  const { transform, domNode } = useReactFlow.getState();

  if (!domNode) {
    return position;
  }

  const { x: domX, y: domY } = domNode.getBoundingClientRect();
  const rendererPosition = rendererPointToPoint(position, transform);

  return {
    x: rendererPosition.x + domX,
    y: rendererPosition.y + domY,
  };
}
