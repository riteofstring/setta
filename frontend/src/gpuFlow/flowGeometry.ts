import { getActiveSectionUIIds } from "state/activeSectionUI";
import { useLocalStorage } from "state/definitions";
import type { Position } from "utils/generatedTypes";
import type { Rect } from "./flowTypes";
import { gpuFlowLayoutStore, type GpuFlowLayoutStoreApi } from "./layoutStore";
import { panBy } from "./viewportActions";
import {
  normalizeGpuViewport,
  screenToFlowPosition as screenToFlowPoint,
  type GpuRect,
} from "./viewportMath";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStore,
} from "./viewportStore";

type PaneRectViewportState = Pick<
  GpuFlowViewportStore,
  "domNode" | "height" | "transform" | "width"
>;

type LayoutQueryOptions = {
  readonly layoutStore?: GpuFlowLayoutStoreApi | undefined;
};

export function getActiveSectionsBounds(
  options: LayoutQueryOptions = {},
): Rect {
  const activeSectionIds = getActiveSectionUIIds();
  return (
    getSectionBounds(activeSectionIds, options) ?? {
      height: 0,
      width: 0,
      x: 0,
      y: 0,
    }
  );
}

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
  uiEditorWidth: number,
): Rect {
  if (!state.domNode) {
    const viewport = normalizeGpuViewport(state.transform);
    return {
      height: state.height / viewport.zoom,
      width: state.width / viewport.zoom,
      x: (-viewport.x + overviewWidth) / viewport.zoom,
      y: -viewport.y / viewport.zoom,
    };
  }

  const bounds = state.domNode.getBoundingClientRect();
  const visibleWidth = Math.max(
    bounds.width - overviewWidth - uiEditorWidth,
    0,
  );
  const visibleHeight = Math.max(bounds.height, 0);
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

function getCurrentPaneRect(): Rect {
  return getPaneRect(
    gpuFlowViewportStore.getState(),
    useLocalStorage.getState().overviewTrueWidth,
    useLocalStorage.getState().uiEditorTrueWidth,
  );
}

export function movePaneToIncludeSection(
  sectionId: string,
  options: LayoutQueryOptions = {},
) {
  const rect = getSectionRect(sectionId, options);
  if (!rect) {
    return;
  }
  movePaneToIncludePoint({ x: rect.x, y: rect.y });
}

function movePaneToIncludePoint(point: Position) {
  const paneRect = getCurrentPaneRect();
  const { x, y, isInside } = getRectTranslation(point, paneRect, 100);
  if (isInside) {
    return;
  }

  const zoom = normalizeGpuViewport(
    gpuFlowViewportStore.getState().transform,
  ).zoom;
  panBy({ x: -x * zoom, y: -y * zoom });
}

function resolveLayoutStore(
  options: LayoutQueryOptions,
): GpuFlowLayoutStoreApi {
  return options.layoutStore ?? gpuFlowLayoutStore;
}

function getRectTranslation(point: Position, rect: Rect, padding = 0) {
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
