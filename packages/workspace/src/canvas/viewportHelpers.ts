import { zoomIdentity } from "d3-zoom";
import _ from "lodash";
import { useWorkspaceDocument } from "../document/stores";
import { prefersReducedWorkspaceMotion } from "../styles/motion";
import { getD3Transition, getSectionRect, getViewportForBounds } from "./graph";
import { useWorkspaceOptions } from "./options";
import { useReactFlow } from "./store";
import type { ReactFlowState } from "./types";

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

function getZoomTarget(selection: NonNullable<ReactFlowState["d3Selection"]>, duration?: number) {
  if (prefersReducedWorkspaceMotion()) {
    return selection;
  }
  return getD3Transition(selection, duration ?? 0);
}

export const zoomIn = _.throttle((options?: TransitionOptions) => {
  const { d3Zoom, d3Selection } = getZoomRuntime();
  d3Zoom.scaleBy(getZoomTarget(d3Selection, options?.duration), 1.2);
}, 50);

export const zoomOut = _.throttle((options?: TransitionOptions) => {
  const { d3Zoom, d3Selection } = getZoomRuntime();
  d3Zoom.scaleBy(getZoomTarget(d3Selection, options?.duration), 1 / 1.2);
}, 50);

function zoomTo(zoomLevel: number, options?: TransitionOptions) {
  const { d3Zoom, d3Selection } = getZoomRuntime();
  d3Zoom.scaleTo(getZoomTarget(d3Selection, options?.duration), zoomLevel);
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

  d3Zoom.transform(getZoomTarget(d3Selection, options?.duration), transform);
}

// The public counterpart of frozen main's Overview `goToSection`: fit one mounted section into
// the actual canvas center, cap ordinary focus at 100%, and leave canonical selection untouched.
export function focusWorkspaceSection(sectionId: string): void {
  if (!useWorkspaceDocument.getState().sections[sectionId]) {
    throw new Error(`Cannot focus unknown workspace section ${sectionId}.`);
  }
  const rect = getSectionRect(sectionId);
  if (!rect) {
    throw new Error(
      `Cannot focus workspace section ${sectionId} before its canvas element mounted.`,
    );
  }
  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error(`Cannot focus workspace section ${sectionId} with empty canvas bounds.`);
  }

  const { width, height } = useReactFlow.getState();
  if (width <= 0 || height <= 0) {
    throw new Error("Cannot focus a workspace section before the canvas has measurable bounds.");
  }
  const { transitionDuration } = useWorkspaceOptions.getState();
  const viewport = getViewportForBounds(rect, width, height, { minZoom: 0, maxZoom: 1 }, 0.1);
  setCenter(rect.x + rect.width / 2, rect.y + rect.height / 2, {
    zoom: viewport.zoom,
    duration: transitionDuration,
  });
}
