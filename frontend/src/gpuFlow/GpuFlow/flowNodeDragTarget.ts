import {
  HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE,
  HTML_SURFACE_SOURCE_ID_ATTRIBUTE,
  HTML_SURFACE_SOURCE_SELECTOR,
} from "../htmlSurfaces/sourceDom";

import type { GpuFlowLayoutStoreApi } from "../layoutStore";

import {
  resolveGpuNodeDragTargetFromEventTarget,
  type GpuNodeDragControllerOptions,
  type GpuNodeDragTarget,
} from "../interactions/nodeDrag";

import { screenToFlowPosition, type GpuViewportInput } from "../viewportMath";

type GpuFlowNodeDragConfig =
  | false
  | Pick<GpuNodeDragControllerOptions, "canDragNode" | "disabled">
  | undefined;

export function resolveGpuFlowNodeDragTarget({
  event,
  layoutStore,
  surfaceElement,
  viewport,
}: {
  readonly event: PointerEvent;
  readonly layoutStore: GpuFlowLayoutStoreApi;
  readonly surfaceElement: HTMLElement;
  readonly viewport: GpuViewportInput;
}): GpuNodeDragTarget | null {
  const projectedSourceTarget =
    resolveProjectedGpuFlowSourceNodeDragTargetFromEventTarget(event.target);
  if (projectedSourceTarget) {
    return projectedSourceTarget;
  }
  const directTarget = resolveGpuNodeDragTargetFromEventTarget(event.target);
  if (directTarget) {
    return directTarget;
  }
  if (!isGpuFlowCanvasSurfaceEventTarget(event.target)) {
    return null;
  }
  const surfaceRect = surfaceElement.getBoundingClientRect();
  const flowPoint = screenToFlowPosition(
    {
      x: event.clientX - surfaceRect.left,
      y: event.clientY - surfaceRect.top,
    },
    viewport,
  );
  const node = layoutStore.getState().getNodeAtPoint(flowPoint);
  return node ? { nodeId: node.nodeId } : null;
}

export function shouldBlockGpuFlowPointerPanForNodeDrag({
  event,
  layoutStore,
  nodeDrag,
  surfaceElement,
  viewport,
}: {
  readonly event: PointerEvent;
  readonly layoutStore: GpuFlowLayoutStoreApi | undefined;
  readonly nodeDrag: GpuFlowNodeDragConfig;
  readonly surfaceElement: HTMLElement;
  readonly viewport: GpuViewportInput;
}): boolean {
  if (!layoutStore || nodeDrag === false || event.button !== 0) {
    return false;
  }
  const target = resolveGpuFlowNodeDragTarget({
    event,
    layoutStore,
    surfaceElement,
    viewport,
  });
  if (!target) {
    return false;
  }
  return !isGpuFlowNodeDragTargetDisabled(nodeDrag, target.nodeId);
}

function isGpuFlowNodeDragTargetDisabled(
  nodeDrag: GpuFlowNodeDragConfig,
  nodeId: string,
): boolean {
  if (nodeDrag === false) {
    return true;
  }
  const disabled =
    typeof nodeDrag?.disabled === "function"
      ? nodeDrag.disabled()
      : Boolean(nodeDrag?.disabled);
  return disabled || nodeDrag?.canDragNode?.(nodeId) === false;
}

function resolveProjectedGpuFlowSourceNodeDragTargetFromEventTarget(
  target: EventTarget | null,
): GpuNodeDragTarget | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const sourceElement = target.closest<HTMLElement>(
    HTML_SURFACE_SOURCE_SELECTOR,
  );
  if (
    !sourceElement ||
    sourceElement.getAttribute(HTML_SURFACE_PROJECTED_INTERACTION_ATTRIBUTE) !==
      "true"
  ) {
    return null;
  }
  const nodeId = sourceElement.getAttribute(HTML_SURFACE_SOURCE_ID_ATTRIBUTE);
  return nodeId
    ? { ignoreNoDragClass: true, nodeId, targetElement: sourceElement }
    : null;
}

function isGpuFlowCanvasSurfaceEventTarget(
  target: EventTarget | null,
): boolean {
  return (
    target instanceof HTMLElement &&
    target.getAttribute("data-gpu-flow-surface") === "true"
  );
}
