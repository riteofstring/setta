import _ from "lodash";
import { getWorkspaceDocumentStore } from "../document/stores";
import { isWorkspaceSectionVisible } from "../document/savedViewDisplay";
import type { Position } from "../document/types";
import { resolveWorkspaceMotionDuration } from "../styles/motion";
import type { WorkspaceHost } from "../workspaceHost";
import { registerWorkspaceHostCleanup } from "../workspaceHostInternals";
import { getPaneRect, getSectionRect, getViewportForBounds } from "./graph";
import { getWorkspaceOptionsStore } from "./options";
import { getWorkspacePointerLocation } from "./pointerLocation";
import { getReactFlowStore } from "./store";
import type { Rect } from "./types";
import { getVisibleCanvasRect } from "./viewportInsets";
import { screenToFlowPosition } from "./viewportPosition";
import { getWorkspaceXyflowRuntime } from "./xyflow/workspaceXyflowRuntime";

export type WorkspaceViewportBoundsFitOptions = Readonly<{
  duration: number;
  maxZoom: number;
  padding: number;
}>;

export type WorkspaceViewportBoundsFitResult = Readonly<{
  duration: number;
  transition: Promise<boolean>;
}>;

type TransitionOptions = {
  duration?: number;
};

type ZoomOptions = TransitionOptions & {
  zoom?: number;
};

function getZoomRuntime(host: WorkspaceHost) {
  const runtime = getWorkspaceXyflowRuntime(host);
  const viewport = runtime.getViewport();
  if (!viewport) {
    throw new Error("Cannot zoom before the zoom pane initialized.");
  }
  return { runtime, viewport };
}

type ZoomThrottleState = {
  zoomIn: ReturnType<typeof _.throttle>;
  zoomOut: ReturnType<typeof _.throttle>;
};

const throttleStatesByHost = new WeakMap<WorkspaceHost, ZoomThrottleState>();

function getZoomThrottleState(host: WorkspaceHost): ZoomThrottleState {
  const existing = throttleStatesByHost.get(host);
  if (existing) {
    return existing;
  }
  const state = {
    zoomIn: _.throttle((options?: TransitionOptions) => {
      const { runtime, viewport } = getZoomRuntime(host);
      void runtime.zoomTo(viewport.zoom * 1.2, {
        duration: resolveWorkspaceMotionDuration(options?.duration ?? 0),
      });
    }, 50),
    zoomOut: _.throttle((options?: TransitionOptions) => {
      const { runtime, viewport } = getZoomRuntime(host);
      void runtime.zoomTo(viewport.zoom / 1.2, {
        duration: resolveWorkspaceMotionDuration(options?.duration ?? 0),
      });
    }, 50),
  };
  throttleStatesByHost.set(host, state);
  registerWorkspaceHostCleanup(host, () => {
    state.zoomIn.cancel();
    state.zoomOut.cancel();
    throttleStatesByHost.delete(host);
  });
  return state;
}

export function zoomIn(host: WorkspaceHost, options?: TransitionOptions): void {
  getZoomThrottleState(host).zoomIn(options);
}

export function zoomOut(
  host: WorkspaceHost,
  options?: TransitionOptions,
): void {
  getZoomThrottleState(host).zoomOut(options);
}

function zoomTo(
  host: WorkspaceHost,
  zoomLevel: number,
  options?: TransitionOptions,
) {
  const { runtime } = getZoomRuntime(host);
  void runtime.zoomTo(zoomLevel, {
    duration: resolveWorkspaceMotionDuration(options?.duration ?? 0),
  });
}

export function resetZoom(host: WorkspaceHost) {
  const { defaultZoomLevel } = getWorkspaceOptionsStore(host).getState();
  zoomTo(host, defaultZoomLevel, { duration: 100 });
}

export function getIsZoomRuntimeReady(host: WorkspaceHost): boolean {
  return getWorkspaceXyflowRuntime(host).getInstance() !== null;
}

export function getCanZoomIn(host: WorkspaceHost): boolean {
  return (
    getIsZoomRuntimeReady(host) &&
    getReactFlowStore(host).getState().transform[2] <
      getZoomLimits(host).maxZoom
  );
}

export function getCanZoomOut(host: WorkspaceHost): boolean {
  return (
    getIsZoomRuntimeReady(host) &&
    getReactFlowStore(host).getState().transform[2] >
      getZoomLimits(host).minZoom
  );
}

function getZoomLimits(host: WorkspaceHost): {
  minZoom: number;
  maxZoom: number;
} {
  const { minZoom, maxZoom } = getWorkspaceOptionsStore(host).getState();
  return { minZoom, maxZoom };
}

export function setCenter(
  host: WorkspaceHost,
  x: number,
  y: number,
  options?: ZoomOptions,
) {
  const { width, height, viewportInsets } = getReactFlowStore(host).getState();
  const { maxZoom } = getWorkspaceOptionsStore(host).getState();
  const visibleCanvas = getVisibleCanvasRect({ width, height }, viewportInsets);
  if (visibleCanvas.width <= 0 || visibleCanvas.height <= 0) {
    throw new Error(
      "Cannot center the workspace before the canvas has measurable bounds.",
    );
  }

  const nextZoom = typeof options?.zoom === "number" ? options.zoom : maxZoom;
  const centerX = visibleCanvas.x + visibleCanvas.width / 2 - x * nextZoom;
  const centerY = visibleCanvas.y + visibleCanvas.height / 2 - y * nextZoom;
  const { runtime } = getZoomRuntime(host);
  void runtime.setViewport(
    { x: centerX, y: centerY, zoom: nextZoom },
    { duration: resolveWorkspaceMotionDuration(options?.duration ?? 0) },
  );
}

function assertWorkspaceViewportFitBounds(bounds: Rect): void {
  if (
    ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    throw new Error(
      "Workspace viewport fit bounds must have finite, positive dimensions.",
    );
  }
}

function assertWorkspaceViewportFitOptions({
  duration,
  maxZoom,
  padding,
}: WorkspaceViewportBoundsFitOptions): void {
  if (!Number.isFinite(padding) || padding < 0) {
    throw new Error(
      "Workspace viewport fit padding must be a finite, non-negative number.",
    );
  }
  if (!Number.isFinite(maxZoom) || maxZoom <= 0) {
    throw new Error(
      "Workspace viewport fit maximum zoom must be a finite, positive number.",
    );
  }
  if (!Number.isFinite(duration) || duration < 0) {
    throw new Error(
      "Workspace viewport fit duration must be a finite, non-negative number.",
    );
  }
}

export function fitWorkspaceViewportToBounds(
  host: WorkspaceHost,
  bounds: Rect,
  options: WorkspaceViewportBoundsFitOptions,
): WorkspaceViewportBoundsFitResult {
  assertWorkspaceViewportFitBounds(bounds);
  assertWorkspaceViewportFitOptions(options);

  const { width, height, viewportInsets } = getReactFlowStore(host).getState();
  const viewport = getViewportForBounds(
    bounds,
    width,
    height,
    { minZoom: 0, maxZoom: options.maxZoom },
    { padding: options.padding, viewportInsets },
  );
  const runtime = getWorkspaceXyflowRuntime(host);
  if (!runtime.getInstance()) {
    throw new Error(
      "Cannot fit workspace viewport bounds before the XYFlow runtime initialized.",
    );
  }
  const duration = resolveWorkspaceMotionDuration(options.duration);
  return {
    duration,
    transition: runtime.setViewport(viewport, { duration }),
  };
}

export function zoomToPointerLocation(host: WorkspaceHost): boolean {
  const pointer = getWorkspacePointerLocation(host);
  if (!pointer || !getIsZoomRuntimeReady(host)) {
    return false;
  }
  const { defaultZoomLevel, transitionDuration } =
    getWorkspaceOptionsStore(host).getState();
  const { x, y } = screenToFlowPosition(host, pointer);
  setCenter(host, x, y, {
    zoom: defaultZoomLevel,
    duration: transitionDuration,
  });
  return true;
}

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

export function movePaneToIncludeElement(
  host: WorkspaceHost,
  element: HTMLElement,
): void {
  if (!getIsZoomRuntimeReady(host)) {
    return;
  }
  const rect = element.getBoundingClientRect();
  const translation = getPaneTranslationForPoint(
    screenToFlowPosition(host, { x: rect.x, y: rect.y }),
    getPaneRect(host, getReactFlowStore(host).getState()),
    100,
  );
  if (!translation) {
    return;
  }
  const { runtime, viewport } = getZoomRuntime(host);
  void runtime.setViewport({
    x: viewport.x - translation.x * viewport.zoom,
    y: viewport.y - translation.y * viewport.zoom,
    zoom: viewport.zoom,
  });
}

export function shiftWorkspaceMapForLeadingPane(
  host: WorkspaceHost,
  widthDiff: number,
): void {
  if (widthDiff === 0) {
    return;
  }
  const { runtime, viewport } = getZoomRuntime(host);
  void runtime.setViewport(
    { x: viewport.x + widthDiff, y: viewport.y, zoom: viewport.zoom },
    { duration: resolveWorkspaceMotionDuration(100) },
  );
}

export function focusWorkspaceSection(
  host: WorkspaceHost,
  sectionId: string,
): void {
  const documentState = getWorkspaceDocumentStore(host).getState();
  if (!documentState.sections[sectionId]) {
    throw new Error(`Cannot focus unknown workspace section ${sectionId}.`);
  }
  if (!isWorkspaceSectionVisible(documentState, sectionId)) {
    throw new Error(`Cannot focus hidden workspace section ${sectionId}.`);
  }
  const rect = getSectionRect(host, sectionId);
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

  const { width, height, viewportInsets } = getReactFlowStore(host).getState();
  if (width <= 0 || height <= 0) {
    throw new Error(
      "Cannot focus a workspace section before the canvas has measurable bounds.",
    );
  }
  const { transitionDuration } = getWorkspaceOptionsStore(host).getState();
  const viewport = getViewportForBounds(
    rect,
    width,
    height,
    { minZoom: 0, maxZoom: 1 },
    { padding: 0.1, viewportInsets },
  );
  setCenter(host, rect.x + rect.width / 2, rect.y + rect.height / 2, {
    zoom: viewport.zoom,
    duration: transitionDuration,
  });
}
