import type { Rect } from "./flowTypes";
import { gpuFlowLayoutStore, type GpuFlowLayoutStoreApi } from "./layoutStore";
import { panGpuViewport } from "./viewportActions";
import {
  normalizeGpuViewport,
  screenToFlowPosition as screenToFlowPoint,
  type GpuPoint,
  type GpuRect,
} from "./viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "./viewportStore";

type PaneRectViewportState = Pick<
  GpuFlowViewportStore,
  "height" | "transform" | "width"
>;

type LayoutQueryOptions = {
  readonly layoutStore?: GpuFlowLayoutStoreApi | undefined;
};

type MovePaneToIncludeSectionOptions = LayoutQueryOptions & {
  readonly overviewWidth?: number | undefined;
  readonly viewportStore?: GpuFlowViewportStoreApi | undefined;
};

export function getSectionRect(
  sectionId: string,
  options: LayoutQueryOptions = {},
): Rect | null {
  const rect = resolveLayoutStore(options).getState().getNodeRect(sectionId);
  return rect ? toRect(rect) : null;
}

export function getSectionBounds(
  sectionIds: readonly string[],
  options: LayoutQueryOptions = {},
): Rect | null {
  const bounds = resolveLayoutStore(options)
    .getState()
    .getNodesBounds(sectionIds);
  return bounds ? toRect(bounds) : null;
}

export function getPaneRect(
  state: PaneRectViewportState,
  overviewWidth: number,
): Rect {
  const visibleWidth = Math.max(state.width, 0);
  const visibleHeight = Math.max(state.height, 0);
  const topLeft = screenToFlowPoint(
    { x: overviewWidth, y: 0 },
    state.transform,
  );
  const bottomRight = screenToFlowPoint(
    {
      x: overviewWidth + visibleWidth,
      y: visibleHeight,
    },
    state.transform,
  );

  return {
    height: bottomRight.y - topLeft.y,
    width: bottomRight.x - topLeft.x,
    x: topLeft.x,
    y: topLeft.y,
  };
}

export function movePaneToIncludeSection(
  sectionId: string,
  options: MovePaneToIncludeSectionOptions = {},
) {
  const rect = getSectionRect(sectionId, options);
  if (!rect) {
    return;
  }
  movePaneToIncludePoint({ x: rect.x, y: rect.y }, options);
}

function movePaneToIncludePoint(
  point: GpuPoint,
  options: MovePaneToIncludeSectionOptions,
) {
  const viewportStore = resolveViewportStore(options.viewportStore);
  const paneRect = getPaneRect(
    viewportStore.getState(),
    options.overviewWidth ?? 0,
  );
  const { x, y, isInside } = getRectTranslation(point, paneRect, 100);
  if (isInside) {
    return;
  }

  const zoom = normalizeGpuViewport(viewportStore.getState().transform).zoom;
  panGpuViewport({ x: -x * zoom, y: -y * zoom }, { store: viewportStore });
}

function resolveLayoutStore(
  options: LayoutQueryOptions,
): GpuFlowLayoutStoreApi {
  return options.layoutStore ?? gpuFlowLayoutStore;
}

function resolveViewportStore(
  store: GpuFlowViewportStoreApi | undefined,
): GpuFlowViewportStoreApi {
  return store ?? gpuFlowViewportStore;
}

function getRectTranslation(point: GpuPoint, rect: Rect, padding = 0) {
  const minX = rect.x + padding;
  const maxX = rect.x + rect.width - padding;
  const minY = rect.y + padding;
  const maxY = rect.y + rect.height - padding;

  let translateX = 0;
  let translateY = 0;

  if (point.x < minX) {
    translateX = point.x - minX;
  } else if (point.x > maxX) {
    translateX = point.x - maxX;
  }

  if (point.y < minY) {
    translateY = point.y - minY;
  } else if (point.y > maxY) {
    translateY = point.y - maxY;
  }

  return {
    isInside: translateX === 0 && translateY === 0,
    x: translateX,
    y: translateY,
  };
}

function toRect(rect: GpuRect): Rect {
  return {
    height: rect.height,
    width: rect.width,
    x: rect.x,
    y: rect.y,
  };
}
