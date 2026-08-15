import { zoomIdentity } from "d3-zoom";
import { resolveWorkspaceMotionDuration } from "../styles/motion";
import { getD3Transition, getNodesBounds, getViewportForBounds } from "./graph";
import { getNodes } from "./nodeInternalsActions";
import { useWorkspaceOptions } from "./options";
import { useReactFlow } from "./store";
import type { FitViewOptions, ReactFlowState } from "./types";

type InternalFitViewOptions = {
  initial?: boolean;
} & FitViewOptions;

type FitViewRuntime = {
  width: number;
  height: number;
  d3Zoom: NonNullable<ReactFlowState["d3Zoom"]>;
  d3Selection: NonNullable<ReactFlowState["d3Selection"]>;
};

const DEFAULT_FIT_VIEW_PADDING = 0.1;

function getFitViewRuntime(state: ReactFlowState, initial: boolean): FitViewRuntime | null {
  const { width, height, d3Zoom, d3Selection, fitViewOnInitDone, fitViewOnInit } = state;

  if (!d3Zoom || !d3Selection) {
    return null;
  }
  if (initial && (!fitViewOnInit || fitViewOnInitDone)) {
    return null;
  }

  return { width, height, d3Zoom, d3Selection };
}

function resolveFitViewZoomLimits(options: InternalFitViewOptions) {
  const { minZoom, maxZoom, defaultZoomLevel } = useWorkspaceOptions.getState();
  const resolvedMinZoom = options.minZoom ?? minZoom;
  const cappedMaxZoom = options.initial
    ? Math.min(options.maxZoom ?? maxZoom, defaultZoomLevel)
    : (options.maxZoom ?? maxZoom);

  return {
    minZoom: resolvedMinZoom,
    maxZoom: Math.max(cappedMaxZoom, resolvedMinZoom),
  };
}

function getTargetNodes(targetNodes?: FitViewOptions["nodes"]) {
  const nodes = getNodes();
  if (!targetNodes?.length) {
    return nodes;
  }

  const targetNodeIds = new Set(targetNodes.map((node) => node.id));
  return nodes.filter((node) => targetNodeIds.has(node.id));
}

function areNodesReadyForFitView(nodes: ReturnType<typeof getNodes>) {
  return nodes.length > 0 && nodes.every((node) => node.width && node.height);
}

function applyFitViewTransform(
  runtime: FitViewRuntime,
  viewport: ReturnType<typeof getViewportForBounds>,
  duration?: number,
) {
  const nextTransform = zoomIdentity.translate(viewport.x, viewport.y).scale(viewport.zoom);
  const resolvedDuration = resolveWorkspaceMotionDuration(duration ?? 0);

  if (resolvedDuration > 0) {
    runtime.d3Zoom.transform(getD3Transition(runtime.d3Selection, resolvedDuration), nextTransform);
    return;
  }

  runtime.d3Zoom.transform(runtime.d3Selection, nextTransform);
}

export function fitView(options: InternalFitViewOptions = {}) {
  const runtime = getFitViewRuntime(useReactFlow.getState(), !!options.initial);
  if (!runtime) {
    return false;
  }

  const nodes = getTargetNodes(options.nodes);
  if (!areNodesReadyForFitView(nodes)) {
    return false;
  }

  const zoomLimits = resolveFitViewZoomLimits(options);
  const viewport = getViewportForBounds(
    getNodesBounds(nodes),
    runtime.width,
    runtime.height,
    zoomLimits,
    options.padding ?? DEFAULT_FIT_VIEW_PADDING,
  );

  applyFitViewTransform(runtime, viewport, options.duration);
  return true;
}

// Answers whether the view was actually fitted, so the keyboard binding knows whether it
// consumed the keypress. An already-fit canvas declines, which is what the toolbar's active
// fit-view button does when it is pressed again.
export function onFitViewHandler(): boolean {
  if (useReactFlow.getState().fitViewOnInit) {
    return false;
  }
  const duration = resolveWorkspaceMotionDuration(
    useWorkspaceOptions.getState().transitionDuration,
  );
  const fitted = fitView({ duration });
  // Hack to set fitViewOnInit after transform is done.
  // If it gets set before the transform is done, then the
  // canvas viewport document-sync subscription will get
  // triggered and it will reset to fitViewOnInit
  setTimeout(() => useReactFlow.setState({ fitViewOnInit: true }), duration + 10);
  return fitted;
}

export function computeReadyToBeVisible(reactFlowState: ReactFlowState) {
  return !reactFlowState.fitViewOnInit || reactFlowState.fitViewOnInitDone;
}
