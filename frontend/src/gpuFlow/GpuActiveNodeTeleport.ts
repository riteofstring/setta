import type { GpuActiveNodeSnapshot } from "./GpuActiveNodeSnapshot";

export type GpuActiveNodeTeleportController = {
  clearNode(nodeId: string): void;
  clearSettlingClone(nodeId: string): void;
  destroy(): void;
  getTeleportedNodeId(): string | null;
  sync(snapshot: GpuActiveNodeSnapshot | null): GpuActiveNodeTeleportSyncResult;
};

export type GpuActiveNodeTeleportSyncResult = {
  readonly restoredNodeId: string | null;
  readonly teleportedNodeId: string | null;
};

type TeleportedNode = {
  readonly element: HTMLElement;
  readonly nodeId: string;
  readonly originalNextSibling: ChildNode | null;
  readonly originalParent: Node;
  readonly originalStyle: TeleportedNodeStyleSnapshot;
};

type FocusSnapshot = {
  readonly domSelection?: DomSelectionSnapshot | null | undefined;
  readonly element: HTMLElement;
  readonly selectionDirection?: "backward" | "forward" | "none" | undefined;
  readonly selectionEnd?: number | null | undefined;
  readonly selectionStart?: number | null | undefined;
};

type DomSelectionSnapshot = {
  readonly anchorNode: Node;
  readonly anchorOffset: number;
  readonly focusNode: Node;
  readonly focusOffset: number;
};

type ElementScrollOffsetSnapshot = {
  readonly path: readonly number[];
  readonly scrollLeft: number;
  readonly scrollTop: number;
};

const TELEPORTED_NODE_CLASS = "setta-gpu-flow__node--teleported";
const SETTLING_CLONE_CLASS = "setta-gpu-flow__node--settling-clone";
const TELEPORTED_NODE_STYLE_KEYS = [
  "height",
  "left",
  "pointerEvents",
  "position",
  "top",
  "transform",
  "transformOrigin",
  "width",
  "zIndex",
] as const;

export function createGpuActiveNodeTeleportController(
  layer: HTMLElement,
): GpuActiveNodeTeleportController {
  let teleportedNode: TeleportedNode | null = null;
  const settlingClones = new Map<string, HTMLElement>();

  function restore(): string | null {
    if (!teleportedNode) {
      return null;
    }
    const current = teleportedNode;
    teleportedNode = null;
    const focusSnapshot = captureFocusSnapshot(current.element);
    retainSettlingClone(layer, settlingClones, current);
    current.element.classList.remove(TELEPORTED_NODE_CLASS);
    delete current.element.dataset.gpuFlowTeleport;
    restoreTeleportedNode(current, focusSnapshot);
    return current.nodeId;
  }

  return {
    clearNode(nodeId) {
      if (teleportedNode?.nodeId === nodeId) {
        restore();
      }
      clearSettlingClone(settlingClones, nodeId);
    },
    clearSettlingClone(nodeId) {
      clearSettlingClone(settlingClones, nodeId);
    },
    destroy() {
      restore();
      clearAllSettlingClones(settlingClones);
    },
    getTeleportedNodeId() {
      return teleportedNode?.nodeId ?? null;
    },
    sync(snapshot) {
      if (!snapshot) {
        return {
          restoredNodeId: restore(),
          teleportedNodeId: null,
        };
      }
      let restoredNodeId: string | null = null;
      if (
        teleportedNode &&
        (teleportedNode.nodeId !== snapshot.nodeId ||
          teleportedNode.element !== snapshot.sourceElement)
      ) {
        restoredNodeId = restore();
      }
      if (!teleportedNode) {
        clearSettlingClone(settlingClones, snapshot.nodeId);
        teleportedNode = moveNodeToTeleportLayer(layer, snapshot);
      }
      applyTeleportedNodePresentation(snapshot);
      return {
        restoredNodeId,
        teleportedNodeId: teleportedNode.nodeId,
      };
    },
  };
}

function moveNodeToTeleportLayer(
  layer: HTMLElement,
  snapshot: GpuActiveNodeSnapshot,
): TeleportedNode {
  const originalParent = snapshot.sourceElement.parentNode;
  if (!originalParent) {
    throw new Error("Setta GPU flow cannot teleport a detached active node.");
  }
  const teleportedNode: TeleportedNode = {
    element: snapshot.sourceElement,
    nodeId: snapshot.nodeId,
    originalNextSibling: snapshot.sourceElement.nextSibling,
    originalParent,
    originalStyle: captureTeleportedNodeStyle(snapshot.sourceElement),
  };
  const focusSnapshot = captureFocusSnapshot(snapshot.sourceElement);
  const scrollSnapshot = captureElementScrollOffsets(snapshot.sourceElement);
  layer.append(snapshot.sourceElement);
  restoreElementScrollOffsets(snapshot.sourceElement, scrollSnapshot);
  snapshot.sourceElement.classList.add(TELEPORTED_NODE_CLASS);
  snapshot.sourceElement.dataset.gpuFlowTeleport = "active";
  restoreFocusSnapshot(focusSnapshot);
  return teleportedNode;
}

function retainSettlingClone(
  layer: HTMLElement,
  settlingClones: Map<string, HTMLElement>,
  teleportedNode: TeleportedNode,
) {
  clearSettlingClone(settlingClones, teleportedNode.nodeId);
  const clone = teleportedNode.element.cloneNode(true);
  if (!(clone instanceof HTMLElement)) {
    return;
  }
  sanitizeSettlingClone(clone);
  clone.classList.add(SETTLING_CLONE_CLASS);
  clone.dataset.gpuFlowTeleport = "settling-clone";
  clone.setAttribute("aria-hidden", "true");
  clone.setAttribute("inert", "");
  clone.style.pointerEvents = "none";
  layer.append(clone);
  copyElementScrollOffsets(teleportedNode.element, clone);
  settlingClones.set(teleportedNode.nodeId, clone);
}

function clearSettlingClone(
  settlingClones: Map<string, HTMLElement>,
  nodeId: string,
) {
  const clone = settlingClones.get(nodeId);
  if (!clone) {
    return;
  }
  clone.remove();
  settlingClones.delete(nodeId);
}

function clearAllSettlingClones(settlingClones: Map<string, HTMLElement>) {
  for (const clone of settlingClones.values()) {
    clone.remove();
  }
  settlingClones.clear();
}

function sanitizeSettlingClone(root: HTMLElement) {
  sanitizeSettlingCloneElement(root);
  for (const element of root.querySelectorAll<HTMLElement>(
    "[id], [data-testid], [data-gpu-flow-node]",
  )) {
    sanitizeSettlingCloneElement(element);
  }
}

function sanitizeSettlingCloneElement(element: HTMLElement) {
  element.removeAttribute("id");
  element.removeAttribute("data-testid");
  element.removeAttribute("data-gpu-flow-node");
}

function copyElementScrollOffsets(source: Element, clone: Element) {
  if (source instanceof HTMLElement && clone instanceof HTMLElement) {
    clone.scrollLeft = source.scrollLeft;
    clone.scrollTop = source.scrollTop;
  }
  const sourceChildren = source.children;
  const cloneChildren = clone.children;
  const childCount = Math.min(sourceChildren.length, cloneChildren.length);
  for (let index = 0; index < childCount; index += 1) {
    const sourceChild = sourceChildren.item(index);
    const cloneChild = cloneChildren.item(index);
    if (sourceChild && cloneChild) {
      copyElementScrollOffsets(sourceChild, cloneChild);
    }
  }
}

function captureElementScrollOffsets(
  root: HTMLElement,
): ElementScrollOffsetSnapshot[] {
  const snapshots: ElementScrollOffsetSnapshot[] = [];
  collectElementScrollOffsets(root, [], snapshots);
  return snapshots;
}

function collectElementScrollOffsets(
  element: Element,
  path: readonly number[],
  snapshots: ElementScrollOffsetSnapshot[],
) {
  if (element instanceof HTMLElement) {
    snapshots.push({
      path,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
    });
  }
  const children = element.children;
  for (let index = 0; index < children.length; index += 1) {
    const child = children.item(index);
    if (child) {
      collectElementScrollOffsets(child, [...path, index], snapshots);
    }
  }
}

function restoreElementScrollOffsets(
  root: HTMLElement,
  snapshots: readonly ElementScrollOffsetSnapshot[],
) {
  for (const snapshot of snapshots) {
    const element = resolveElementPath(root, snapshot.path);
    if (element instanceof HTMLElement) {
      element.scrollLeft = snapshot.scrollLeft;
      element.scrollTop = snapshot.scrollTop;
    }
  }
}

function resolveElementPath(
  root: HTMLElement,
  path: readonly number[],
): Element | null {
  let current: Element = root;
  for (const index of path) {
    const child = current.children.item(index);
    if (!child) {
      return null;
    }
    current = child;
  }
  return current;
}

function restoreTeleportedNode(
  teleportedNode: TeleportedNode,
  focusSnapshot: FocusSnapshot | null,
) {
  const { element, originalNextSibling, originalParent } = teleportedNode;
  const scrollSnapshot = captureElementScrollOffsets(element);
  if (!originalParent.isConnected) {
    return;
  }
  restoreTeleportedNodeStyle(element, teleportedNode.originalStyle);
  if (
    originalNextSibling &&
    originalNextSibling.parentNode === originalParent
  ) {
    originalParent.insertBefore(element, originalNextSibling);
    restoreElementScrollOffsets(element, scrollSnapshot);
    restoreFocusSnapshot(focusSnapshot);
    return;
  }
  originalParent.appendChild(element);
  restoreElementScrollOffsets(element, scrollSnapshot);
  restoreFocusSnapshot(focusSnapshot);
}

function applyTeleportedNodePresentation(snapshot: GpuActiveNodeSnapshot) {
  const { sourceElement } = snapshot;
  setStyleValue(sourceElement, "position", "absolute");
  setStyleValue(sourceElement, "left", "0px");
  setStyleValue(sourceElement, "top", "0px");
  setStyleValue(sourceElement, "transformOrigin", "0 0");
  setStyleValue(sourceElement, "height", `${snapshot.height}px`);
  setStyleValue(
    sourceElement,
    "transform",
    `translate(${snapshot.screenX}px, ${snapshot.screenY}px) scale(${snapshot.zoom})`,
  );
  setStyleValue(sourceElement, "pointerEvents", "all");
  setStyleValue(sourceElement, "width", `${snapshot.width}px`);
  setStyleValue(sourceElement, "zIndex", String(snapshot.zIndex));
}

type TeleportedNodeStyleKey =
  | "height"
  | "left"
  | "pointerEvents"
  | "position"
  | "top"
  | "transform"
  | "transformOrigin"
  | "width"
  | "zIndex";

type TeleportedNodeStyleSnapshot = {
  readonly [Key in TeleportedNodeStyleKey]: string;
};

function setStyleValue(
  element: HTMLElement,
  property: TeleportedNodeStyleKey,
  value: string,
) {
  if (element.style[property] !== value) {
    element.style[property] = value;
  }
}

function captureTeleportedNodeStyle(
  element: HTMLElement,
): TeleportedNodeStyleSnapshot {
  const snapshot = {} as Record<TeleportedNodeStyleKey, string>;
  for (const property of TELEPORTED_NODE_STYLE_KEYS) {
    snapshot[property] = element.style[property];
  }
  return snapshot;
}

function restoreTeleportedNodeStyle(
  element: HTMLElement,
  snapshot: TeleportedNodeStyleSnapshot,
) {
  for (const property of TELEPORTED_NODE_STYLE_KEYS) {
    element.style[property] = snapshot[property];
  }
}

function captureFocusSnapshot(root: HTMLElement): FocusSnapshot | null {
  const activeElement = root.ownerDocument.activeElement;
  if (
    !(activeElement instanceof HTMLElement) ||
    !root.contains(activeElement)
  ) {
    return null;
  }
  if (
    activeElement instanceof HTMLInputElement ||
    activeElement instanceof HTMLTextAreaElement
  ) {
    return {
      element: activeElement,
      selectionDirection: activeElement.selectionDirection ?? undefined,
      selectionEnd: activeElement.selectionEnd,
      selectionStart: activeElement.selectionStart,
    };
  }
  return {
    domSelection: captureDomSelectionSnapshot(root),
    element: activeElement,
  };
}

function restoreFocusSnapshot(snapshot: FocusSnapshot | null) {
  if (!snapshot || !snapshot.element.isConnected) {
    return;
  }
  snapshot.element.focus({ preventScroll: true });
  if (
    snapshot.selectionStart === undefined ||
    snapshot.selectionEnd === undefined ||
    !(
      snapshot.element instanceof HTMLInputElement ||
      snapshot.element instanceof HTMLTextAreaElement
    )
  ) {
    restoreDomSelectionSnapshot(
      snapshot.element.ownerDocument,
      snapshot.domSelection,
    );
    return;
  }
  snapshot.element.setSelectionRange(
    snapshot.selectionStart,
    snapshot.selectionEnd,
    snapshot.selectionDirection,
  );
  return;
}

function captureDomSelectionSnapshot(
  root: HTMLElement,
): DomSelectionSnapshot | null {
  const selection = root.ownerDocument.getSelection();
  if (
    !selection ||
    !selection.anchorNode ||
    !selection.focusNode ||
    !rootContainsNode(root, selection.anchorNode) ||
    !rootContainsNode(root, selection.focusNode)
  ) {
    return null;
  }
  return {
    anchorNode: selection.anchorNode,
    anchorOffset: selection.anchorOffset,
    focusNode: selection.focusNode,
    focusOffset: selection.focusOffset,
  };
}

function restoreDomSelectionSnapshot(
  ownerDocument: Document,
  snapshot: DomSelectionSnapshot | null | undefined,
) {
  if (
    !snapshot ||
    !snapshot.anchorNode.isConnected ||
    !snapshot.focusNode.isConnected
  ) {
    return;
  }
  const selection = ownerDocument.getSelection();
  if (!selection) {
    return;
  }
  selection.setBaseAndExtent(
    snapshot.anchorNode,
    snapshot.anchorOffset,
    snapshot.focusNode,
    snapshot.focusOffset,
  );
}

function rootContainsNode(root: HTMLElement, node: Node): boolean {
  return root === node || root.contains(node);
}
