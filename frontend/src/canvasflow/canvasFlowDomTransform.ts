import type {
  CanvasFlowNodeDrawRecord,
  CanvasFlowNodeElementMap,
  CanvasFlowViewport,
} from "./canvasFlowTypes";

export function getCanvasFlowNodeDomTransform({
  node,
  viewport,
}: {
  node: Pick<CanvasFlowNodeDrawRecord, "x" | "y">;
  viewport: CanvasFlowViewport;
}) {
  return `translate(${viewport.x + node.x * viewport.zoom}px, ${
    viewport.y + node.y * viewport.zoom
  }px) scale(${viewport.zoom})`;
}

export function assignCanvasFlowNodePaintStyle(
  element: HTMLElement,
  transform: string,
) {
  let changed = false;
  if (element.style.transform !== transform) {
    element.style.transform = transform;
    changed = true;
  }
  if (element.style.pointerEvents !== "all") {
    element.style.pointerEvents = "all";
    changed = true;
  }
  return changed;
}

export function assignCanvasFlowNodeTransform({
  element,
  node,
  viewport,
}: {
  element: HTMLElement;
  node: Pick<CanvasFlowNodeDrawRecord, "x" | "y">;
  viewport: CanvasFlowViewport;
}) {
  return assignCanvasFlowNodePaintStyle(
    element,
    getCanvasFlowNodeDomTransform({ node, viewport }),
  );
}

export function disableCulledCanvasFlowNodePointerEvents({
  nextInteractiveNodeIds,
  nodeElements,
  previousInteractiveNodeIds,
}: {
  nextInteractiveNodeIds: ReadonlySet<string>;
  nodeElements: CanvasFlowNodeElementMap;
  previousInteractiveNodeIds: Set<string>;
}) {
  for (const nodeId of previousInteractiveNodeIds) {
    if (nextInteractiveNodeIds.has(nodeId)) {
      continue;
    }
    const element = nodeElements.get(nodeId);
    if (element && element.style.pointerEvents !== "none") {
      element.style.pointerEvents = "none";
    }
  }
}
