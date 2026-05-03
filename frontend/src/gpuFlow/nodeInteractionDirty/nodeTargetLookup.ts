import {
  GPU_FLOW_NODE_SELECTOR,
  GPU_FLOW_PERSISTENT_FOCUS_SELECTOR,
} from "./interactionTypes";

import { isTextInputType, toElement } from "./pointerHandoff";

export function findGpuNodeIdForEventTarget(
  target: EventTarget | Node | null,
  elementByNodeId: ReadonlyMap<string, HTMLElement>,
): string | null {
  const element = toElement(target);
  const nodeElement = element?.closest<HTMLElement>(GPU_FLOW_NODE_SELECTOR);
  const directNodeId = findDirectGpuNodeId(nodeElement, elementByNodeId);
  if (directNodeId) {
    return directNodeId;
  }

  if (!element) {
    return null;
  }
  return findContainingGpuNodeId(element, elementByNodeId);
}

export function findDirectGpuNodeId(
  nodeElement: HTMLElement | null | undefined,
  elementByNodeId: ReadonlyMap<string, HTMLElement>,
): string | null {
  const nodeId = nodeElement?.getAttribute("data-id");
  if (!nodeId || !nodeElement) {
    return null;
  }
  if (elementByNodeId.get(nodeId) === nodeElement) {
    return nodeId;
  }
  return null;
}

export function findContainingGpuNodeId(
  element: Element,
  elementByNodeId: ReadonlyMap<string, HTMLElement>,
): string | null {
  for (const [candidateNodeId, candidateElement] of elementByNodeId) {
    if (candidateElement === element || candidateElement.contains(element)) {
      return candidateNodeId;
    }
  }
  return null;
}

export function isGpuNodePersistentFocusEventTarget(
  target: EventTarget | Node | null,
): boolean {
  const element = toElement(target);
  if (!element) {
    return false;
  }
  if (element instanceof HTMLInputElement) {
    return isTextInputType(element.type);
  }
  return Boolean(element.closest(GPU_FLOW_PERSISTENT_FOCUS_SELECTOR));
}
