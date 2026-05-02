import type { FitViewOptions } from "./flowTypes";
import {
  centerGpuViewportOnPoint,
  clampGpuZoom,
  flowToScreenPosition as flowPointToScreenPosition,
  getGpuViewportForBounds,
  gpuViewportToTuple,
  normalizeGpuViewport,
  panGpuViewportBy,
  screenToFlowPosition as screenPointToFlowPosition,
  zoomGpuViewportAtScreenPoint,
  zoomGpuViewportBy,
  type GpuPoint,
  type GpuRect,
  type GpuViewport,
} from "./viewportMath";
import {
  getGpuViewportStorePointRelativeToDomNode,
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "./viewportStore";

type GpuViewportActionOptions = {
  readonly store?: GpuFlowViewportStoreApi | undefined;
};

type GpuScreenToFlowActionOptions = GpuViewportActionOptions & {
  readonly ignoreDomNode?: boolean | undefined;
  readonly snapGrid?: readonly [number, number] | undefined;
  readonly snapToGrid?: boolean | undefined;
};

type SetGpuViewportOptions = GpuViewportActionOptions & {
  readonly duration?: number | undefined;
};

type GpuZoomActionOptions = SetGpuViewportOptions & {
  readonly overviewWidth?: number | undefined;
  readonly point?: GpuPoint | undefined;
};

type GpuSetCenterOptions = SetGpuViewportOptions & {
  readonly overviewWidth?: number | undefined;
  readonly zoom?: number | undefined;
};

type GpuFitViewOptions = SetGpuViewportOptions & {
  readonly bounds: GpuRect;
  readonly initial?: boolean | undefined;
  readonly keepCurrentZoomIfPossible?: boolean | undefined;
  readonly maxZoom?: number | undefined;
  readonly minZoom?: number | undefined;
  readonly overviewWidth?: number | undefined;
  readonly padding?: number | undefined;
};

type GpuViewportTransition = {
  readonly durationMs: number;
  readonly from: GpuViewport;
  frameId: number | null;
  lastApplied: ReturnType<typeof gpuViewportToTuple>;
  startTimeMs: number | null;
  readonly store: GpuFlowViewportStoreApi;
  readonly to: GpuViewport;
  unsubscribe: (() => void) | null;
};

const MAX_GPU_VIEWPORT_TRANSITION_DURATION_MS = 1200;
const DEFAULT_GPU_RESET_ZOOM_TRANSITION_DURATION_MS = 100;
const DEFAULT_GPU_MAP_POSITION_TRANSITION_DURATION_MS = 100;
const activeGpuViewportTransitions = new WeakMap<
  GpuFlowViewportStoreApi,
  GpuViewportTransition
>();

function setGpuViewport(
  viewport: Partial<GpuViewport>,
  options: SetGpuViewportOptions = {},
): boolean {
  const store = resolveViewportStore(options.store);
  const current = normalizeGpuViewport(store.getState().transform);
  return applyGpuViewport({
    options,
    store,
    viewport: {
      x: viewport.x ?? current.x,
      y: viewport.y ?? current.y,
      zoom: viewport.zoom ?? current.zoom,
    },
  });
}

export function panGpuViewport(
  delta: GpuPoint,
  options: SetGpuViewportOptions = {},
): boolean {
  const store = resolveViewportStore(options.store);
  return applyGpuViewport({
    options,
    store,
    viewport: panGpuViewportBy(store.getState().transform, delta),
  });
}

export function zoomGpuViewportAt(
  zoom: number,
  options: GpuZoomActionOptions = {},
): boolean {
  const store = resolveViewportStore(options.store);
  const state = store.getState();
  return applyGpuViewport({
    options,
    store,
    viewport: zoomGpuViewportAtScreenPoint({
      maxZoom: state.maxZoom,
      minZoom: state.minZoom,
      point:
        options.point ??
        getViewportCenterPoint(state.width, state.height, {
          overviewWidth: options.overviewWidth,
        }),
      viewport: state.transform,
      zoom,
    }),
  });
}

export function zoomGpuViewportByFactor(
  factor: number,
  options: GpuZoomActionOptions = {},
): boolean {
  const store = resolveViewportStore(options.store);
  const state = store.getState();
  return applyGpuViewport({
    options,
    store,
    viewport: zoomGpuViewportBy({
      factor,
      maxZoom: state.maxZoom,
      minZoom: state.minZoom,
      point:
        options.point ??
        getViewportCenterPoint(state.width, state.height, {
          overviewWidth: options.overviewWidth,
        }),
      viewport: state.transform,
    }),
  });
}

function zoomGpuViewportTo(
  zoom: number,
  options: GpuZoomActionOptions = {},
): boolean {
  return zoomGpuViewportAt(zoom, options);
}

function setGpuViewportCenter(
  x: number,
  y: number,
  options: GpuSetCenterOptions = {},
): boolean {
  const store = resolveViewportStore(options.store);
  const state = store.getState();
  const zoom = clampGpuZoom(options.zoom ?? state.maxZoom, state);
  return applyGpuViewport({
    options,
    store,
    viewport: centerGpuViewportOnPoint({
      canvasHeight: state.height,
      canvasWidth: state.width,
      overviewWidth: options.overviewWidth,
      point: { x, y },
      zoom,
    }),
  });
}

function fitGpuViewport(options: GpuFitViewOptions): boolean {
  const store = resolveViewportStore(options.store);
  const state = store.getState();
  const minZoom = options.minZoom ?? state.minZoom;
  const maxZoomInput = options.maxZoom ?? state.maxZoom;
  const maxZoom = options.initial
    ? Math.min(maxZoomInput, state.defaultZoom)
    : maxZoomInput;
  return applyGpuViewport({
    options,
    store,
    viewport: getGpuViewportForBounds(options.bounds, {
      canvasHeight: state.height,
      canvasWidth: state.width,
      keepCurrentZoomIfPossible: options.keepCurrentZoomIfPossible,
      maxZoom: Math.max(maxZoom, minZoom),
      minZoom,
      overviewWidth: options.overviewWidth,
      padding: options.padding,
      viewport: state.transform,
    }),
  });
}

function screenToGpuFlowPosition(
  point: GpuPoint,
  options: GpuScreenToFlowActionOptions = {},
): GpuPoint {
  const store = resolveViewportStore(options.store);
  const relativePoint = options.ignoreDomNode
    ? point
    : getGpuViewportStorePointRelativeToDomNode(point, store);
  const flowPoint = screenPointToFlowPosition(
    relativePoint,
    store.getState().transform,
  );
  return options.snapToGrid
    ? snapGpuFlowPosition(flowPoint, options.snapGrid)
    : flowPoint;
}

function flowToGpuScreenPosition(
  point: GpuPoint,
  options: GpuViewportActionOptions = {},
): GpuPoint {
  const store = resolveViewportStore(options.store);
  return flowPointToScreenPosition(point, store.getState().transform);
}

function getGpuViewport(options: GpuViewportActionOptions = {}): GpuViewport {
  return normalizeGpuViewport(
    resolveViewportStore(options.store).getState().transform,
  );
}

function requestGpuInitialFitView(
  options?: FitViewOptions,
  actionOptions: GpuViewportActionOptions = {},
): void {
  resolveViewportStore(actionOptions.store)
    .getState()
    .setFitViewInitializationState({
      fitViewOnInit: true,
      fitViewOnInitDone: false,
      fitViewOnInitOptions: options,
    });
}

function finishGpuInitialFitView(
  actionOptions: GpuViewportActionOptions = {},
): void {
  resolveViewportStore(actionOptions.store)
    .getState()
    .setFitViewInitializationState({
      fitViewOnInitDone: true,
    });
}

function setGpuInitialFitViewDone(
  actionOptions: GpuViewportActionOptions = {},
): void {
  resolveViewportStore(actionOptions.store)
    .getState()
    .setFitViewInitializationState({
      fitViewOnInit: false,
      fitViewOnInitDone: true,
      fitViewOnInitOptions: undefined,
    });
}

function getGpuZoom(options: GpuViewportActionOptions = {}): number {
  return getGpuViewport(options).zoom;
}

function resetGpuZoom(options: GpuZoomActionOptions = {}): boolean {
  const store = resolveViewportStore(options.store);
  return zoomGpuViewportAt(store.getState().defaultZoom, {
    ...options,
    duration: options.duration ?? DEFAULT_GPU_RESET_ZOOM_TRANSITION_DURATION_MS,
  });
}

function updateGpuMapPosition(
  widthDiff: number,
  options: SetGpuViewportOptions = {},
): boolean {
  assertFiniteNumber("map width difference", widthDiff);
  return panGpuViewport(
    { x: widthDiff, y: 0 },
    {
      ...options,
      duration:
        options.duration ?? DEFAULT_GPU_MAP_POSITION_TRANSITION_DURATION_MS,
    },
  );
}

function cancelGpuViewportTransition(
  options: GpuViewportActionOptions = {},
): boolean {
  return cancelGpuViewportTransitionForStore(
    resolveViewportStore(options.store),
  );
}

export const setViewport = setGpuViewport;
export const panBy = panGpuViewport;
export const zoomAtScreenPoint = zoomGpuViewportAt;
export const zoomBy = zoomGpuViewportByFactor;
export const zoomTo = zoomGpuViewportTo;
export const setCenter = setGpuViewportCenter;
export const fitView = fitGpuViewport;
export const screenToFlowPosition = screenToGpuFlowPosition;
export const flowToScreenPosition = flowToGpuScreenPosition;
export const getViewport = getGpuViewport;
export const getZoom = getGpuZoom;
export const requestInitialFitView = requestGpuInitialFitView;
export const finishInitialFitView = finishGpuInitialFitView;
export const setInitialFitViewDone = setGpuInitialFitViewDone;
export const resetZoom = resetGpuZoom;
export const updateMapPosition = updateGpuMapPosition;
export const cancelViewportTransition = cancelGpuViewportTransition;

function resolveViewportStore(
  store: GpuFlowViewportStoreApi | undefined,
): GpuFlowViewportStoreApi {
  return store ?? gpuFlowViewportStore;
}

function getViewportCenterPoint(
  width: number,
  height: number,
  {
    overviewWidth = 0,
  }: {
    readonly overviewWidth?: number | undefined;
  } = {},
): GpuPoint {
  return {
    x: width / 2 + overviewWidth,
    y: height / 2,
  };
}

function applyGpuViewport({
  options,
  store,
  viewport,
}: {
  readonly options: SetGpuViewportOptions;
  readonly store: GpuFlowViewportStoreApi;
  readonly viewport: GpuViewport;
}): boolean {
  const durationMs = normalizeGpuViewportTransitionDuration(options.duration);
  if (durationMs === 0) {
    cancelGpuViewportTransitionForStore(store);
    return store.getState().setTransform(viewport);
  }
  return startGpuViewportTransition({
    durationMs,
    store,
    viewport,
  });
}

function startGpuViewportTransition({
  durationMs,
  store,
  viewport,
}: {
  readonly durationMs: number;
  readonly store: GpuFlowViewportStoreApi;
  readonly viewport: GpuViewport;
}): boolean {
  const from = normalizeGpuViewport(store.getState().transform);
  const to = normalizeGpuViewport(viewport);
  cancelGpuViewportTransitionForStore(store);
  if (areGpuViewportsEqual(from, to)) {
    return false;
  }

  const transition: GpuViewportTransition = {
    durationMs,
    frameId: null,
    from,
    lastApplied: gpuViewportToTuple(from),
    startTimeMs: null,
    store,
    to,
    unsubscribe: null,
  };
  activeGpuViewportTransitions.set(store, transition);
  store.getState().setViewportInteractionFlags({ viewportAnimating: true });
  transition.unsubscribe = store.subscribe((state, previousState) => {
    if (activeGpuViewportTransitions.get(store) !== transition) {
      return;
    }
    if (isGpuViewportTransitionCanceledByInteraction(state, previousState)) {
      cancelGpuViewportTransitionForStore(store);
      return;
    }
    if (
      state.transform !== previousState.transform &&
      !areGpuViewportTuplesEqual(state.transform, transition.lastApplied)
    ) {
      cancelGpuViewportTransitionForStore(store);
    }
  });
  scheduleGpuViewportTransitionFrame(transition);
  return true;
}

function scheduleGpuViewportTransitionFrame(transition: GpuViewportTransition) {
  transition.frameId = requestGpuViewportAnimationFrame((timestampMs) => {
    runGpuViewportTransitionFrame(transition, timestampMs);
  });
}

function runGpuViewportTransitionFrame(
  transition: GpuViewportTransition,
  timestampMs: number,
) {
  if (activeGpuViewportTransitions.get(transition.store) !== transition) {
    return;
  }
  if (transition.startTimeMs === null) {
    transition.startTimeMs = timestampMs;
  }
  const elapsedMs = Math.max(0, timestampMs - transition.startTimeMs);
  const progress = Math.min(1, elapsedMs / transition.durationMs);
  if (progress >= 1) {
    finishGpuViewportTransition(transition);
    return;
  }

  const nextViewport = interpolateGpuViewport(
    transition.from,
    transition.to,
    easeGpuViewportTransition(progress),
  );
  transition.lastApplied = gpuViewportToTuple(nextViewport);
  transition.store.getState().setTransform(transition.lastApplied);
  scheduleGpuViewportTransitionFrame(transition);
}

function finishGpuViewportTransition(transition: GpuViewportTransition) {
  if (activeGpuViewportTransitions.get(transition.store) !== transition) {
    return;
  }
  activeGpuViewportTransitions.delete(transition.store);
  transition.frameId = null;
  transition.unsubscribe?.();
  transition.unsubscribe = null;
  transition.store
    .getState()
    .setViewportInteractionFlags({ viewportAnimating: false });
  transition.lastApplied = gpuViewportToTuple(transition.to);
  transition.store.getState().setTransform(transition.lastApplied);
}

function cancelGpuViewportTransitionForStore(
  store: GpuFlowViewportStoreApi,
): boolean {
  const transition = activeGpuViewportTransitions.get(store);
  if (!transition) {
    return false;
  }
  activeGpuViewportTransitions.delete(store);
  if (transition.frameId !== null) {
    cancelGpuViewportAnimationFrame(transition.frameId);
    transition.frameId = null;
  }
  transition.unsubscribe?.();
  transition.unsubscribe = null;
  store.getState().setViewportInteractionFlags({ viewportAnimating: false });
  return true;
}

function normalizeGpuViewportTransitionDuration(
  duration: number | undefined,
): number {
  if (duration === undefined) {
    return 0;
  }
  assertFiniteNonNegative("viewport transition duration", duration);
  return Math.min(duration, MAX_GPU_VIEWPORT_TRANSITION_DURATION_MS);
}

function interpolateGpuViewport(
  from: GpuViewport,
  to: GpuViewport,
  progress: number,
): GpuViewport {
  return {
    x: interpolateNumber(from.x, to.x, progress),
    y: interpolateNumber(from.y, to.y, progress),
    zoom: interpolateNumber(from.zoom, to.zoom, progress),
  };
}

function interpolateNumber(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function easeGpuViewportTransition(progress: number): number {
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function isGpuViewportTransitionCanceledByInteraction(
  state: ReturnType<GpuFlowViewportStoreApi["getState"]>,
  previousState: ReturnType<GpuFlowViewportStoreApi["getState"]>,
): boolean {
  return (
    didBecomeActive(state.nodeDragging, previousState.nodeDragging) ||
    didBecomeActive(state.nodeResizing, previousState.nodeResizing) ||
    didBecomeActive(state.panScrolling, previousState.panScrolling) ||
    didBecomeActive(state.paneDragging, previousState.paneDragging) ||
    didBecomeActive(state.pointerPanning, previousState.pointerPanning) ||
    didBecomeActive(state.wheelZooming, previousState.wheelZooming) ||
    (state.userSelectionRect !== null &&
      previousState.userSelectionRect === null)
  );
}

function didBecomeActive(current: boolean, previous: boolean): boolean {
  return current && !previous;
}

function areGpuViewportsEqual(left: GpuViewport, right: GpuViewport): boolean {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom;
}

function areGpuViewportTuplesEqual(
  left: ReturnType<typeof gpuViewportToTuple>,
  right: ReturnType<typeof gpuViewportToTuple>,
): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function requestGpuViewportAnimationFrame(
  callback: FrameRequestCallback,
): number {
  if (typeof requestAnimationFrame === "function") {
    return requestAnimationFrame(callback);
  }
  return setTimeout(() => callback(Date.now()), 16) as unknown as number;
}

function cancelGpuViewportAnimationFrame(frameId: number) {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(frameId);
    return;
  }
  clearTimeout(frameId);
}

function assertFiniteNonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}

function assertFiniteNumber(name: string, value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
}

function snapGpuFlowPosition(
  point: GpuPoint,
  snapGrid: readonly [number, number] | undefined,
): GpuPoint {
  if (!snapGrid) {
    throw new Error("GPU flow snap grid is required when snapToGrid is true.");
  }
  const [xGrid, yGrid] = snapGrid;
  assertFinitePositive("snap grid x", xGrid);
  assertFinitePositive("snap grid y", yGrid);
  return {
    x: xGrid * Math.round(point.x / xGrid),
    y: yGrid * Math.round(point.y / yGrid),
  };
}

function assertFinitePositive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
}
