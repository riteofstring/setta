import { getActiveSectionUIIds } from "state/activeSectionUI";
import {
  useLocalStorage,
  useNodeInternals,
  useSectionRefs,
} from "state/definitions";
import type { Position } from "utils/generatedTypes";
import type { Node, Rect } from "./flowTypes";
import { getGpuNodesBounds } from "./nodeBounds";
import { panBy, screenToFlowPosition } from "./viewportActions";
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

type NodeBoundsInput = Pick<Node, "height" | "position" | "width">;

function getNodesBounds(nodes: readonly NodeBoundsInput[]): Rect {
  return toRect(getGpuNodesBounds(nodes));
}

export function getActiveSectionsBounds(): Rect {
  const activeSectionIds = getActiveSectionUIIds();
  return (
    getSectionBounds(activeSectionIds) ?? {
      height: 0,
      width: 0,
      x: 0,
      y: 0,
    }
  );
}

export function getSectionRect(sectionId: string) {
  const ref =
    useSectionRefs.getState().selfOnly[sectionId] ??
    useSectionRefs.getState().withNested[sectionId];
  if (!ref) {
    return null;
  }

  const bounds = ref.getBoundingClientRect();
  const { x, y } = screenToFlowPosition({
    x: bounds.left,
    y: bounds.top,
  });
  return {
    height: ref.clientHeight,
    width: ref.clientWidth,
    x,
    y,
  };
}

export function getSectionBounds(sectionIds: readonly string[]): Rect | null {
  const nodeInternals = useNodeInternals.getState().x;
  const sections: NodeBoundsInput[] = [];

  for (const sectionId of sectionIds) {
    const node = nodeInternals.get(sectionId);
    if (node && hasPositiveRectBounds(node.width, node.height)) {
      sections.push({
        height: node.height,
        position: { x: node.position.x, y: node.position.y },
        width: node.width,
      });
      continue;
    }

    const rect = getSectionRect(sectionId);
    if (!rect || !hasPositiveRectBounds(rect.width, rect.height)) {
      continue;
    }
    sections.push({
      height: rect.height,
      position: { x: rect.x, y: rect.y },
      width: rect.width,
    });
  }

  if (sections.length === 0) {
    return null;
  }

  return getNodesBounds(sections);
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

export function movePaneToIncludeElement(element: HTMLElement) {
  const bounds = element.getBoundingClientRect();
  const point = screenToFlowPosition({ x: bounds.left, y: bounds.top });
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

function hasPositiveRectBounds(
  width: number | null | undefined,
  height: number | null | undefined,
) {
  return (
    typeof width === "number" &&
    typeof height === "number" &&
    width > 0 &&
    height > 0
  );
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
