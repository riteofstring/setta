import _ from "lodash";
import { getD3Transition } from "./graph";
import { useWorkspaceOptions } from "./options";
import { useReactFlow } from "./store";

// The zoom commands from the reference's `hooks/useViewportHelper.ts`. The setViewport/setCenter/
// map-position helpers stayed behind with the minimap and AI-follow features that call them.
type TransitionOptions = {
  duration?: number;
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
