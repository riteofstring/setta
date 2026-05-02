import type { NodeTexturePriority } from "./dirtyTracking";

import { resolveGpuNodeZIndex } from "./nodeZIndex";

import {
  flowToScreenPosition,
  normalizeGpuViewport,
  type GpuRect,
} from "./viewportMath";

import {
  DEFAULT_OFFSCREEN_POSITION,
  GPU_FLOW_NODE_INTERACTIVE_CLASS,
  GPU_FLOW_NODE_SELECTOR,
  GPU_FLOW_SURFACE_SELECTOR,
  GpuNodeDomTransformState,
  GpuNodeDomTransformSyncCache,
  GpuNodeLayout,
  GpuVisibleNodeQuad,
} from "./nodeLayerFrame";

export function applyVisibleNodeDomTransform(
  element: HTMLElement,
  {
    height,
    interactive,
    screenX,
    screenY,
    width,
    zIndex,
    zoom,
  }: {
    readonly height: number;
    readonly interactive?: boolean | undefined;
    readonly screenX: number;
    readonly screenY: number;
    readonly width: number;
    readonly zIndex: number;
    readonly zoom: number;
  },
) {
  applyNodeDomTransformState(
    element,
    createVisibleNodeDomTransformState({
      element,
      height,
      interactive,
      screenX,
      screenY,
      width,
      zIndex,
      zoom,
    }),
  );
}

export function createVisibleNodeDomTransformState({
  element,
  height,
  interactive,
  screenX,
  screenY,
  width,
  zIndex,
  zoom,
}: {
  readonly element: HTMLElement;
  readonly height: number;
  readonly interactive?: boolean | undefined;
  readonly screenX: number;
  readonly screenY: number;
  readonly width: number;
  readonly zIndex: number;
  readonly zoom: number;
}): GpuNodeDomTransformState {
  return {
    element,
    height: `${height}px`,
    interactive: interactive ? "true" : "false",
    pointerEvents: "all",
    transform: `translate(${screenX}px, ${screenY}px) scale(${zoom})`,
    visible: "true",
    width: `${width}px`,
    zIndex: String(zIndex),
  };
}

export function createVisibleNodeDomTransformStateForQuad({
  activeIds,
  element,
  normalizedViewport,
  quad,
}: {
  readonly activeIds: ReadonlySet<string>;
  readonly element: HTMLElement;
  readonly normalizedViewport: ReturnType<typeof normalizeGpuViewport>;
  readonly quad: GpuVisibleNodeQuad;
}): GpuNodeDomTransformState {
  const screenPosition = flowToScreenPosition(
    { x: quad.x, y: quad.y },
    normalizedViewport,
  );
  return createVisibleNodeDomTransformState({
    element,
    height: quad.height,
    interactive: activeIds.has(quad.nodeId),
    screenX: screenPosition.x,
    screenY: screenPosition.y,
    width: quad.width,
    zIndex: quad.zIndex,
    zoom: normalizedViewport.zoom,
  });
}

export function applyNodeDomTransformState(
  element: HTMLElement,
  state: GpuNodeDomTransformState,
) {
  setGpuNodeBaseStyle(element);
  setStyleValue(element, "height", state.height);
  setStyleValue(element, "transform", state.transform);
  setStyleValue(element, "pointerEvents", state.pointerEvents);
  setStyleValue(element, "width", state.width);
  setStyleValue(element, "zIndex", state.zIndex);
  setDatasetValue(element, "gpuFlowVisible", state.visible);
  setDatasetValue(element, "gpuFlowInteractive", state.interactive);
  setClassPresence(
    element,
    GPU_FLOW_NODE_INTERACTIVE_CLASS,
    state.interactive === "true",
  );
}

export function applyCulledNodeDomTransform(
  element: HTMLElement,
  offscreenX = DEFAULT_OFFSCREEN_POSITION,
  offscreenY = DEFAULT_OFFSCREEN_POSITION,
) {
  applyNodeDomTransformState(
    element,
    createCulledNodeDomTransformState({
      element,
      offscreenX,
      offscreenY,
    }),
  );
}

export function createCulledNodeDomTransformState({
  element,
  offscreenX = DEFAULT_OFFSCREEN_POSITION,
  offscreenY = DEFAULT_OFFSCREEN_POSITION,
}: {
  readonly element: HTMLElement;
  readonly offscreenX?: number | undefined;
  readonly offscreenY?: number | undefined;
}): GpuNodeDomTransformState {
  return {
    element,
    height: "",
    interactive: "false",
    pointerEvents: "none",
    transform: `translate(${offscreenX}px, ${offscreenY}px) scale(1)`,
    visible: "false",
    width: "",
    zIndex: "",
  };
}

export function isCachedNodeDomTransformState(
  cache: GpuNodeDomTransformSyncCache,
  nodeId: string,
  next: GpuNodeDomTransformState,
): boolean {
  const previous = cache.stateByNodeId.get(nodeId);
  return Boolean(
    previous &&
      previous.element === next.element &&
      previous.height === next.height &&
      previous.interactive === next.interactive &&
      previous.pointerEvents === next.pointerEvents &&
      previous.transform === next.transform &&
      previous.visible === next.visible &&
      previous.width === next.width &&
      previous.zIndex === next.zIndex,
  );
}

export type GpuNodeStyleKey =
  | "height"
  | "left"
  | "pointerEvents"
  | "position"
  | "top"
  | "transform"
  | "transformOrigin"
  | "width"
  | "zIndex";

export function setGpuNodeBaseStyle(element: HTMLElement) {
  setStyleValue(element, "position", "absolute");
  setStyleValue(element, "left", "0px");
  setStyleValue(element, "top", "0px");
  setStyleValue(element, "transformOrigin", "0 0");
}

export function setStyleValue(
  element: HTMLElement,
  property: GpuNodeStyleKey,
  value: string,
) {
  if (element.style[property] !== value) {
    element.style[property] = value;
  }
}

export function setDatasetValue(
  element: HTMLElement,
  property: string,
  value: string,
) {
  if (element.dataset[property] !== value) {
    element.dataset[property] = value;
  }
}

export function setClassPresence(
  element: HTMLElement,
  className: string,
  enabled: boolean,
) {
  if (element.classList.contains(className) !== enabled) {
    element.classList.toggle(className, enabled);
  }
}

export function mergeNodeIdSets(
  left: ReadonlySet<string> | readonly string[] | undefined,
  right: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> | undefined {
  const leftIds = normalizeNodeIdSet(left);
  const rightIds = normalizeNodeIdSet(right);
  if (leftIds.size === 0) {
    return rightIds.size === 0 ? undefined : rightIds;
  }
  if (rightIds.size === 0) {
    return leftIds;
  }
  return new Set([...leftIds, ...rightIds]);
}

export function resolveVisibleNodeTexturePriority(
  nodeId: string,
  activeNodeIds: ReadonlySet<string>,
): NodeTexturePriority {
  return activeNodeIds.has(nodeId) ? "interactive" : "visible";
}

export function normalizeNodeIdSet(
  nodeIds: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> {
  if (!nodeIds) {
    return new Set();
  }
  if (nodeIds instanceof Set) {
    return nodeIds;
  }
  return new Set(nodeIds);
}

export function findNodeIdForChangedElement(
  changedElement: Element,
  elementByNodeId: ReadonlyMap<string, HTMLElement>,
  ignoreDirectNodeIds: ReadonlySet<string>,
): string | null {
  return (
    findClosestChangedElementNodeId(
      changedElement,
      elementByNodeId,
      ignoreDirectNodeIds,
    ) ??
    findSingleContainedChangedElementNodeId(changedElement, elementByNodeId)
  );
}

export function findClosestChangedElementNodeId(
  changedElement: Element,
  elementByNodeId: ReadonlyMap<string, HTMLElement>,
  ignoreDirectNodeIds: ReadonlySet<string>,
): string | null {
  const nearestNodeElement = changedElement.closest<HTMLElement>(
    GPU_FLOW_NODE_SELECTOR,
  );
  const nearestNodeId = nearestNodeElement?.getAttribute("data-id");
  if (
    nearestNodeId &&
    elementByNodeId.get(nearestNodeId) === nearestNodeElement
  ) {
    if (
      changedElement === nearestNodeElement &&
      ignoreDirectNodeIds.has(nearestNodeId)
    ) {
      return null;
    }
    return nearestNodeId;
  }
  return null;
}

export function findSingleContainedChangedElementNodeId(
  changedElement: Element,
  elementByNodeId: ReadonlyMap<string, HTMLElement>,
): string | null {
  if (changedElement.matches(GPU_FLOW_SURFACE_SELECTOR)) {
    return null;
  }

  // html-in-canvas can report an enclosing changed subtree instead of the
  // exact node. Accept that fallback only when the subtree contains exactly one
  // registered GPU node, so a canvas/surface paint cannot dirty every node.
  let containedNodeId: string | null = null;
  for (const nodeElement of changedElement.querySelectorAll<HTMLElement>(
    GPU_FLOW_NODE_SELECTOR,
  )) {
    const nodeId = nodeElement.getAttribute("data-id");
    if (!nodeId || elementByNodeId.get(nodeId) !== nodeElement) {
      continue;
    }
    if (containedNodeId && containedNodeId !== nodeId) {
      return null;
    }
    containedNodeId = nodeId;
  }
  return containedNodeId;
}

export function resolveElement(
  elementByNodeId:
    | ReadonlyMap<string, HTMLElement>
    | ((nodeId: string) => HTMLElement | null | undefined),
  nodeId: string,
): HTMLElement | null | undefined {
  return typeof elementByNodeId === "function"
    ? elementByNodeId(nodeId)
    : elementByNodeId.get(nodeId);
}

export function toNodeQuad(node: GpuNodeLayout): GpuVisibleNodeQuad | null {
  if (
    node.width === null ||
    node.height === null ||
    node.width <= 0 ||
    node.height <= 0
  ) {
    return null;
  }

  return {
    height: node.height,
    nodeId: node.nodeId,
    width: node.width,
    x: node.x,
    y: node.y,
    zIndex: resolveGpuNodeZIndex(node),
  };
}

export function toRect(quad: GpuVisibleNodeQuad): GpuRect {
  return {
    height: quad.height,
    width: quad.width,
    x: quad.x,
    y: quad.y,
  };
}
