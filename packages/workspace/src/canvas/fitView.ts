import { resolveWorkspaceMotionDuration } from "../styles/motion.js";
import { getNodesBounds, getViewportForBounds } from "./graph.js";
import { getNodes } from "./nodeInternals.js";
import { getWorkspaceOptionsStore } from "./options.js";
import { getReactFlowStore } from "./store.js";
import type { FitViewOptions, ReactFlowState } from "./types.js";
import { getVisibleCanvasRect } from "./viewportInsets.js";
import { getWorkspaceXyflowRuntime } from "./xyflow/workspaceXyflowRuntime.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import { registerWorkspaceHostCleanup } from "../workspaceHostInternals.js";

type InternalFitViewOptions = {
  initial?: boolean;
} & FitViewOptions;

type FitViewRuntime = {
  width: number;
  height: number;
  viewportInsets: ReactFlowState["viewportInsets"];
};

const DEFAULT_FIT_VIEW_PADDING = 0.1;

function getFitViewRuntime(
  state: ReactFlowState,
  initial: boolean,
): FitViewRuntime | null {
  const { width, height, viewportInsets, fitViewOnInitDone, fitViewOnInit } =
    state;

  if (initial && (!fitViewOnInit || fitViewOnInitDone)) {
    return null;
  }

  const visibleCanvas = getVisibleCanvasRect({ width, height }, viewportInsets);
  if (visibleCanvas.width <= 0 || visibleCanvas.height <= 0) {
    return null;
  }

  return { width, height, viewportInsets };
}

function resolveFitViewZoomLimits(
  host: WorkspaceHost,
  options: InternalFitViewOptions,
) {
  const { minZoom, maxZoom, defaultZoomLevel } =
    getWorkspaceOptionsStore(host).getState();
  const resolvedMinZoom = options.minZoom ?? minZoom;
  const cappedMaxZoom = options.initial
    ? Math.min(options.maxZoom ?? maxZoom, defaultZoomLevel)
    : (options.maxZoom ?? maxZoom);

  return {
    minZoom: resolvedMinZoom,
    maxZoom: Math.max(cappedMaxZoom, resolvedMinZoom),
  };
}

function getTargetNodes(
  host: WorkspaceHost,
  targetNodes?: FitViewOptions["nodes"],
) {
  const nodes = getNodes(host);
  if (!targetNodes?.length) {
    return nodes;
  }

  const targetNodeIds = new Set(targetNodes.map((node) => node.id));
  return nodes.filter((node) => targetNodeIds.has(node.id));
}

function areNodesReadyForFitView(
  nodes: Array<ReturnType<typeof getNodes>[number]>,
) {
  return nodes.length > 0 && nodes.every((node) => node.width && node.height);
}

export function fitView(
  host: WorkspaceHost,
  options: InternalFitViewOptions = {},
) {
  const state = getReactFlowStore(host).getState();
  const runtime = getFitViewRuntime(state, !!options.initial);
  if (!runtime) {
    return false;
  }

  const nodes = getTargetNodes(host, options.nodes);
  if (!areNodesReadyForFitView(nodes)) {
    return false;
  }

  const zoomLimits = resolveFitViewZoomLimits(host, options);
  const viewport = getViewportForBounds(
    getNodesBounds(nodes),
    runtime.width,
    runtime.height,
    zoomLimits,
    {
      padding: options.padding ?? DEFAULT_FIT_VIEW_PADDING,
      viewportInsets: runtime.viewportInsets,
    },
  );

  const duration = resolveWorkspaceMotionDuration(options.duration ?? 0);
  const xyflowRuntime = getWorkspaceXyflowRuntime(host);
  if (!xyflowRuntime.getInstance()) {
    return false;
  }
  void xyflowRuntime.setViewport(viewport, { duration });
  return true;
}

type FitViewTimerState = { timers: Set<ReturnType<typeof setTimeout>> };

const timerStatesByHost = new WeakMap<WorkspaceHost, FitViewTimerState>();

function getFitViewTimerState(host: WorkspaceHost): FitViewTimerState {
  const existing = timerStatesByHost.get(host);
  if (existing) {
    return existing;
  }
  const state = { timers: new Set<ReturnType<typeof setTimeout>>() };
  timerStatesByHost.set(host, state);
  registerWorkspaceHostCleanup(host, () => {
    for (const timer of state.timers) {
      clearTimeout(timer);
    }
    state.timers.clear();
    timerStatesByHost.delete(host);
  });
  return state;
}

export function onFitViewHandler(host: WorkspaceHost): boolean {
  if (getReactFlowStore(host).getState().fitViewOnInit) {
    return false;
  }
  const duration = resolveWorkspaceMotionDuration(
    getWorkspaceOptionsStore(host).getState().transitionDuration,
  );
  const fitted = fitView(host, { duration });

  const timerState = getFitViewTimerState(host);
  const timer = setTimeout(() => {
    timerState.timers.delete(timer);
    getReactFlowStore(host).setState({ fitViewOnInit: true });
  }, duration + 10);
  timerState.timers.add(timer);
  return fitted;
}

export function computeReadyToBeVisible(reactFlowState: ReactFlowState) {
  return !reactFlowState.fitViewOnInit || reactFlowState.fitViewOnInitDone;
}
