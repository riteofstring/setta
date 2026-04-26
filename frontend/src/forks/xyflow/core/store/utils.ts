import { getNodes } from "state/actions/nodeInternals";
import { useSettings } from "state/definitions";
import { useReactFlow } from ".";
import type { FitViewOptions, ReactFlowState } from "../types";
import { getNodesBounds, getViewportForBounds } from "../utils/graph";

type InternalFitViewOptions = {
  initial?: boolean;
} & FitViewOptions;

type FitViewRuntime = {
  width: number;
  height: number;
};

const DEFAULT_FIT_VIEW_PADDING = 0.1;

function getFitViewRuntime(
  state: ReactFlowState,
  initial: boolean,
): FitViewRuntime | null {
  const { width, height, fitViewOnInitDone, fitViewOnInit } = state;

  if (initial && (!fitViewOnInit || fitViewOnInitDone)) {
    return null;
  }

  return { width, height };
}

function resolveFitViewZoomLimits(options: InternalFitViewOptions) {
  const { minZoom, maxZoom, defaultZoomLevel } = useSettings.getState().gui;
  const resolvedMinZoom = options.minZoom ?? minZoom;
  const cappedMaxZoom = options.initial
    ? Math.min(options.maxZoom ?? maxZoom, defaultZoomLevel)
    : options.maxZoom ?? maxZoom;

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
  viewport: ReturnType<typeof getViewportForBounds>,
) {
  useReactFlow.setState({
    transform: [viewport.x, viewport.y, viewport.zoom],
  });
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
  const viewport = getViewportForBounds({
    bounds: getNodesBounds(nodes),
    height: runtime.height,
    maxZoom: zoomLimits.maxZoom,
    minZoom: zoomLimits.minZoom,
    padding: options.padding ?? DEFAULT_FIT_VIEW_PADDING,
    width: runtime.width,
  });

  applyFitViewTransform(viewport);
  return true;
}

export function onFitViewHandler() {
  if (useReactFlow.getState().fitViewOnInit) {
    return;
  }
  const duration = useSettings.getState().gui.transitionDuration;
  fitView({ duration });
  // Hack to set fitViewOnInit after transform is done.
  // If it gets set before the transform is done, then the
  // reactFitViewOnInitSubscriptionFn subscription will get
  // triggered and it will reset to fitViewOnInit
  setTimeout(
    () => useReactFlow.setState({ fitViewOnInit: true }),
    duration + 10,
  );
}

export function computeReadyToBeVisible(reactFlowState: ReactFlowState) {
  return !reactFlowState.fitViewOnInit || reactFlowState.fitViewOnInitDone;
}
