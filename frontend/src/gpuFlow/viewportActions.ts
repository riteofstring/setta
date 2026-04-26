import {
  centerGpuViewportOnPoint,
  clampGpuZoom,
  flowToScreenPosition as flowPointToScreenPosition,
  getGpuViewportForBounds,
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
  readonly point?: GpuPoint | undefined;
};

type GpuSetCenterOptions = SetGpuViewportOptions & {
  readonly zoom?: number | undefined;
};

type GpuFitViewOptions = SetGpuViewportOptions & {
  readonly bounds: GpuRect;
  readonly keepCurrentZoomIfPossible?: boolean | undefined;
  readonly overviewWidth?: number | undefined;
  readonly padding?: number | undefined;
};

function setGpuViewport(
  viewport: Partial<GpuViewport>,
  options: SetGpuViewportOptions = {},
): boolean {
  assertNoViewportTransition(options.duration);
  const store = resolveViewportStore(options.store);
  const current = normalizeGpuViewport(store.getState().transform);
  return store.getState().setTransform({
    x: viewport.x ?? current.x,
    y: viewport.y ?? current.y,
    zoom: viewport.zoom ?? current.zoom,
  });
}

export function panGpuViewport(
  delta: GpuPoint,
  options: SetGpuViewportOptions = {},
): boolean {
  assertNoViewportTransition(options.duration);
  const store = resolveViewportStore(options.store);
  return store
    .getState()
    .setTransform(panGpuViewportBy(store.getState().transform, delta));
}

export function zoomGpuViewportAt(
  zoom: number,
  options: GpuZoomActionOptions = {},
): boolean {
  assertNoViewportTransition(options.duration);
  const store = resolveViewportStore(options.store);
  const state = store.getState();
  return state.setTransform(
    zoomGpuViewportAtScreenPoint({
      maxZoom: state.maxZoom,
      minZoom: state.minZoom,
      point: options.point ?? getViewportCenterPoint(state.width, state.height),
      viewport: state.transform,
      zoom,
    }),
  );
}

export function zoomGpuViewportByFactor(
  factor: number,
  options: GpuZoomActionOptions = {},
): boolean {
  assertNoViewportTransition(options.duration);
  const store = resolveViewportStore(options.store);
  const state = store.getState();
  return state.setTransform(
    zoomGpuViewportBy({
      factor,
      maxZoom: state.maxZoom,
      minZoom: state.minZoom,
      point: options.point ?? getViewportCenterPoint(state.width, state.height),
      viewport: state.transform,
    }),
  );
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
  assertNoViewportTransition(options.duration);
  const store = resolveViewportStore(options.store);
  const state = store.getState();
  const zoom = clampGpuZoom(options.zoom ?? state.maxZoom, state);
  return state.setTransform(
    centerGpuViewportOnPoint({
      canvasHeight: state.height,
      canvasWidth: state.width,
      point: { x, y },
      zoom,
    }),
  );
}

function fitGpuViewport(options: GpuFitViewOptions): boolean {
  assertNoViewportTransition(options.duration);
  const store = resolveViewportStore(options.store);
  const state = store.getState();
  return state.setTransform(
    getGpuViewportForBounds(options.bounds, {
      canvasHeight: state.height,
      canvasWidth: state.width,
      keepCurrentZoomIfPossible: options.keepCurrentZoomIfPossible,
      maxZoom: state.maxZoom,
      minZoom: state.minZoom,
      overviewWidth: options.overviewWidth,
      padding: options.padding,
      viewport: state.transform,
    }),
  );
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

function getGpuZoom(options: GpuViewportActionOptions = {}): number {
  return getGpuViewport(options).zoom;
}

function resetGpuZoom(options: SetGpuViewportOptions = {}): boolean {
  const store = resolveViewportStore(options.store);
  return zoomGpuViewportAt(store.getState().defaultZoom, options);
}

function updateGpuMapPosition(
  widthDiff: number,
  options: SetGpuViewportOptions = {},
): boolean {
  assertFiniteNumber("map width difference", widthDiff);
  return panGpuViewport({ x: widthDiff, y: 0 }, options);
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
export const resetZoom = resetGpuZoom;
export const updateMapPosition = updateGpuMapPosition;

function resolveViewportStore(
  store: GpuFlowViewportStoreApi | undefined,
): GpuFlowViewportStoreApi {
  return store ?? gpuFlowViewportStore;
}

function getViewportCenterPoint(width: number, height: number): GpuPoint {
  return {
    x: width / 2,
    y: height / 2,
  };
}

function assertNoViewportTransition(duration: number | undefined) {
  if (duration !== undefined && duration !== 0) {
    throw new Error(
      "GPU flow viewport transitions are not implemented; use explicit frame-driven actions.",
    );
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
