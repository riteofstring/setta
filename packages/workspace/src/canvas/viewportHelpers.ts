import { zoomIdentity } from "d3-zoom";
import _ from "lodash";
import { getD3Transition } from "./graph";
import { useWorkspaceOptions } from "./options";
import { useReactFlow } from "./store";

// The zoom commands from the reference's `hooks/useViewportHelper.ts`. `setCenter` returned with
// the minimap batch that calls it; `setViewport` and the map-position helpers stayed behind with
// the AI-follow feature.
type TransitionOptions = {
  duration?: number;
};

type ZoomOptions = TransitionOptions & {
  zoom?: number;
};

function getZoomRuntime() {
  const { d3Zoom, d3Selection } = useReactFlow.getState();
  if (!d3Zoom || !d3Selection) {
    throw new Error("Cannot zoom before the zoom pane initialized.");
  }
  return { d3Zoom, d3Selection };
}

export const zoomIn = _.throttle((options?: TransitionOptions) => {
  const { d3Zoom, d3Selection } = getZoomRuntime();
  d3Zoom.scaleBy(getD3Transition(d3Selection, options?.duration), 1.2);
}, 50);

export const zoomOut = _.throttle((options?: TransitionOptions) => {
  const { d3Zoom, d3Selection } = getZoomRuntime();
  d3Zoom.scaleBy(getD3Transition(d3Selection, options?.duration), 1 / 1.2);
}, 50);

function zoomTo(zoomLevel: number, options?: TransitionOptions) {
  const { d3Zoom, d3Selection } = getZoomRuntime();
  d3Zoom.scaleTo(getD3Transition(d3Selection, options?.duration), zoomLevel);
}

export function resetZoom() {
  const { defaultZoomLevel } = useWorkspaceOptions.getState();
  zoomTo(defaultZoomLevel, { duration: 100 });
}

// Seam adaptation shared with fit-view centering and edge auto-pan: the reference offsets the
// visible center by its Overview rail width, which is app chrome outside the package seam.
export function setCenter(x: number, y: number, options?: ZoomOptions) {
  const { d3Zoom, d3Selection } = getZoomRuntime();
  const { width, height } = useReactFlow.getState();
  const { maxZoom } = useWorkspaceOptions.getState();

  const nextZoom = typeof options?.zoom === "number" ? options.zoom : maxZoom;
  const centerX = width / 2 - x * nextZoom;
  const centerY = height / 2 - y * nextZoom;
  const transform = zoomIdentity.translate(centerX, centerY).scale(nextZoom);

  d3Zoom.transform(getD3Transition(d3Selection, options?.duration), transform);
}
