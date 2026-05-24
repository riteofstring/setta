import { isGpuNodePersistentFocusEventTarget } from "./nodeTargetLookup";
import { toElement } from "./pointerHandoff";

export function isGpuNodePersistentFocusOwnedByNode({
  focusedPersistentNodeId,
  nodeElement,
  nodeId,
  target,
}: {
  readonly focusedPersistentNodeId: string | null;
  readonly nodeElement: HTMLElement | undefined;
  readonly nodeId: string;
  readonly target: EventTarget | Node | null;
}): boolean {
  if (focusedPersistentNodeId !== nodeId) {
    return false;
  }
  const element = toElement(target);
  return Boolean(
    nodeElement &&
      element &&
      (nodeElement === element || nodeElement.contains(element)) &&
      isGpuNodePersistentFocusEventTarget(element),
  );
}
