import type { GpuActiveNodeSnapshot } from "./GpuActiveNodeSnapshot";

export type GpuActiveNodeTeleportController = {
  clearNode(nodeId: string): void;
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
  readonly element: HTMLElement;
  readonly selectionDirection?: "backward" | "forward" | "none" | undefined;
  readonly selectionEnd?: number | null | undefined;
  readonly selectionStart?: number | null | undefined;
};

const TELEPORTED_NODE_CLASS = "setta-gpu-flow__node--teleported";
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

  function restore(): string | null {
    if (!teleportedNode) {
      return null;
    }
    const current = teleportedNode;
    teleportedNode = null;
    current.element.classList.remove(TELEPORTED_NODE_CLASS);
    delete current.element.dataset.gpuFlowTeleport;
    restoreTeleportedNode(current);
    return current.nodeId;
  }

  return {
    clearNode(nodeId) {
      if (teleportedNode?.nodeId === nodeId) {
        restore();
      }
    },
    destroy() {
      restore();
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
  layer.replaceChildren(snapshot.sourceElement);
  snapshot.sourceElement.classList.add(TELEPORTED_NODE_CLASS);
  snapshot.sourceElement.dataset.gpuFlowTeleport = "active";
  restoreFocusSnapshot(focusSnapshot);
  return teleportedNode;
}

function restoreTeleportedNode(teleportedNode: TeleportedNode) {
  const { element, originalNextSibling, originalParent } = teleportedNode;
  if (!originalParent.isConnected) {
    return;
  }
  const focusSnapshot = captureFocusSnapshot(element);
  restoreTeleportedNodeStyle(element, teleportedNode.originalStyle);
  if (
    originalNextSibling &&
    originalNextSibling.parentNode === originalParent
  ) {
    originalParent.insertBefore(element, originalNextSibling);
    restoreFocusSnapshot(focusSnapshot);
    return;
  }
  originalParent.appendChild(element);
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
  return { element: activeElement };
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
    return;
  }
  snapshot.element.setSelectionRange(
    snapshot.selectionStart,
    snapshot.selectionEnd,
    snapshot.selectionDirection,
  );
}
