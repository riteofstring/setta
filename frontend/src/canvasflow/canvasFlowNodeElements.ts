import type { CanvasFlowNodeElementMap } from "./canvasFlowTypes";

export function getCanvasFlowNodeElement({
  canvas,
  nodeElements,
  nodeId,
}: {
  canvas: HTMLCanvasElement;
  nodeElements: CanvasFlowNodeElementMap;
  nodeId: string;
}): HTMLElement | null {
  const existing = nodeElements.get(nodeId);
  if (existing) {
    return existing;
  }
  for (const child of canvas.children) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    if (child.dataset.id === nodeId) {
      nodeElements.set(nodeId, child);
      return child;
    }
  }
  return null;
}
