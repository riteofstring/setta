import { zoomIdentity } from "d3-zoom";
import _ from "lodash";
import { useWorkspaceDocument } from "../document/stores";
import type { Position } from "../document/types";
import { prefersReducedWorkspaceMotion } from "../styles/motion";
import {
  getD3Transition,
  getPaneRect,
  getSectionRect,
  getViewportForBounds,
} from "./graph";
import { useWorkspaceOptions } from "./options";
import { getWorkspacePointerLocation } from "./pointerLocation";
import { useReactFlow } from "./store";
import type { ReactFlowState, Rect } from "./types";
import { getVisibleCanvasRect } from "./viewportInsets";
import { screenToFlowPosition } from "./viewportPosition";

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

function getZoomTarget(
  selection: NonNullable<ReactFlowState["d3Selection"]>,
  duration?: number,
) {
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

// A keyboard chord can reach a viewport operation before the zoom pane initializes, where the
// pointer surfaces that offer the same operations do not exist yet. The operation declines
// instead of throwing, and the chord goes back to the browser.
export function getIsZoomRuntimeReady(): boolean {
  const { d3Zoom, d3Selection } = useReactFlow.getState();
  return Boolean(d3Zoom && d3Selection);
}

// The toolbar disables its zoom buttons at the configured limits. The chords ask the same
// question, so a keypress at a limit does exactly what pressing the disabled button does.
export function getCanZoomIn(): boolean {
  return (
    getIsZoomRuntimeReady() &&
    useReactFlow.getState().transform[2] < getZoomLimits().maxZoom
  );
}

export function getCanZoomOut(): boolean {
  return (
    getIsZoomRuntimeReady() &&
    useReactFlow.getState().transform[2] > getZoomLimits().minZoom
  );
}

function getZoomLimits(): { minZoom: number; maxZoom: number } {
  const { minZoom, maxZoom } = useWorkspaceOptions.getState();
  return { minZoom, maxZoom };
}

// Center against the same unobscured canvas rectangle used by fit view, the minimap mask, focus
// navigation, and edge auto-pan. Shell panes overlay the full canvas exactly as in frozen main.
export function setCenter(x: number, y: number, options?: ZoomOptions) {
  const { d3Zoom, d3Selection } = getZoomRuntime();
  const { width, height, viewportInsets } = useReactFlow.getState();
  const { maxZoom } = useWorkspaceOptions.getState();
  const visibleCanvas = getVisibleCanvasRect({ width, height }, viewportInsets);
  if (visibleCanvas.width <= 0 || visibleCanvas.height <= 0) {
    throw new Error(
      "Cannot center the workspace before the canvas has measurable bounds.",
    );
  }

  const nextZoom = typeof options?.zoom === "number" ? options.zoom : maxZoom;
  const centerX = visibleCanvas.x + visibleCanvas.width / 2 - x * nextZoom;
  const centerY = visibleCanvas.y + visibleCanvas.height / 2 - y * nextZoom;
  const transform = zoomIdentity.translate(centerX, centerY).scale(nextZoom);

  d3Zoom.transform(getZoomTarget(d3Selection, options?.duration), transform);
}

// The reference's `zoomToMouseLocation`: re-center the canvas on the pointer at the default zoom
// level, so a chord frames what the pointer is already over without touching selection.
export function zoomToPointerLocation(): boolean {
  const pointer = getWorkspacePointerLocation();
  if (!pointer || !getIsZoomRuntimeReady()) {
    return false;
  }
  const { defaultZoomLevel, transitionDuration } =
    useWorkspaceOptions.getState();
  const { x, y } = screenToFlowPosition(pointer);
  setCenter(x, y, { zoom: defaultZoomLevel, duration: transitionDuration });
  return true;
}

// The reference's `getRectTranslation` (`utils/graph.ts`): how far a point sits outside the
// padded pane on each axis, and nothing at all when it is already inside.
function getAxisOverflow(
  value: number,
  minimum: number,
  maximum: number,
): number {
  if (value < minimum) {
    return value - minimum;
  }
  if (value > maximum) {
    return value - maximum;
  }
  return 0;
}

function getPaneTranslationForPoint(
  point: Position,
  pane: Rect,
  padding: number,
): Position | null {
  const x = getAxisOverflow(
    point.x,
    pane.x + padding,
    pane.x + pane.width - padding,
  );
  const y = getAxisOverflow(
    point.y,
    pane.y + padding,
    pane.y + pane.height - padding,
  );
  return x === 0 && y === 0 ? null : { x, y };
}

// The reference's `movePaneToIncludeElement`: bring a just-focused element into view with the
// smallest possible move, keeping its 100px margin from the pane edges. Keyboard focus can reach
// an element before the zoom pane initializes, where the canvas simply has nowhere to travel yet.
export function movePaneToIncludeElement(element: HTMLElement): void {
  if (!getIsZoomRuntimeReady()) {
    return;
  }
  const { d3Zoom, d3Selection } = getZoomRuntime();
  const rect = element.getBoundingClientRect();
  const translation = getPaneTranslationForPoint(
    screenToFlowPosition({ x: rect.x, y: rect.y }),
    getPaneRect(useReactFlow.getState()),
    100,
  );
  if (!translation) {
    return;
  }
  d3Zoom.translateBy(d3Selection, -translation.x, -translation.y);
}

// Frozen main moves the map by the leading pane's true-width delta when its host setting is
// enabled. The pane itself uses a 150ms CSS transform; the map follows through main's 100ms d3
// viewport transition so section positions remain visually continuous while the pane opens.
export function shiftWorkspaceMapForLeadingPane(widthDiff: number): void {
  if (widthDiff === 0) {
    return;
  }
  const { d3Zoom, d3Selection } = getZoomRuntime();
  const {
    transform: [x, y, zoom],
  } = useReactFlow.getState();
  const nextTransform = zoomIdentity.translate(x + widthDiff, y).scale(zoom);
  d3Zoom.transform(getZoomTarget(d3Selection, 100), nextTransform);
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
    throw new Error(
      `Cannot focus workspace section ${sectionId} with empty canvas bounds.`,
    );
  }

  const { width, height, viewportInsets } = useReactFlow.getState();
  if (width <= 0 || height <= 0) {
    throw new Error(
      "Cannot focus a workspace section before the canvas has measurable bounds.",
    );
  }
  const { transitionDuration } = useWorkspaceOptions.getState();
  const viewport = getViewportForBounds(
    rect,
    width,
    height,
    { minZoom: 0, maxZoom: 1 },
    { padding: 0.1, viewportInsets },
  );
  setCenter(rect.x + rect.width / 2, rect.y + rect.height / 2, {
    zoom: viewport.zoom,
    duration: transitionDuration,
  });
}
