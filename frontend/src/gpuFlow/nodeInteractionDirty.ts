import type { DirtyNodeReason, NodeTexturePriority } from "./dirtyTracking";
import type { GpuFrameReason } from "./gpuRenderer";
import {
  getGpuFlowNodeDirtyEventDetail,
  GPU_FLOW_NODE_DIRTY_EVENT,
} from "./nodeDirtyEvents";
import type { NodeTextureManager } from "./nodeTextures";

type GpuNodeInteractionFrameResult = {
  readonly budgetExhausted: boolean;
  readonly remainingDirtyNodeIds: readonly string[];
  readonly uploadedNodeIds: readonly string[];
};

export type GpuNodeInteractionState = {
  readonly activeNodeId: string | null;
  readonly overlayNodeId: string | null;
};

export type GpuNodeInteractionDirtyController = {
  attach(canvas: HTMLElement, ownerDocument?: Document): () => void;
  clearNode(nodeId: string): void;
  completeFrame(result: GpuNodeInteractionFrameResult): void;
  getActiveNodeId(): string | null;
  getOverlayNodeId(): string | null;
};

type GpuNodeInteractionDirtyControllerOptions = {
  readonly deferPassiveDirty?: (() => boolean) | undefined;
  readonly elementByNodeId: () => ReadonlyMap<string, HTMLElement>;
  readonly getFrame: () => number;
  readonly onStateChange?:
    | ((state: GpuNodeInteractionState) => void)
    | undefined;
  readonly requestFrame: (reason: GpuFrameReason) => void;
  readonly textureManager: () => Pick<
    NodeTextureManager,
    "markNodeTextureDirty" | "setNodeTexturePriority"
  > | null;
};

type DirtyEventKind = "focus" | "input" | "pointer" | "scroll" | "selection";

type MarkInteractionDirtyInput = {
  readonly nodeId: string;
  readonly priority: NodeTexturePriority;
  readonly reason: DirtyNodeReason;
};

type NodeInteractionStatePatch = {
  readonly activeNodeId?: string | null | undefined;
  readonly overlayNodeId?: string | null | undefined;
  readonly releaseAfterUploadNodeId?: string | null | undefined;
};

const GPU_FLOW_NODE_SELECTOR = '[data-gpu-flow-node="true"]';
const INTERACTIVE_TARGET_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "[contenteditable='']",
  "[contenteditable='true']",
  "[data-gpu-flow-interactive='true']",
  "[role='combobox']",
  "[role='searchbox']",
  "[role='slider']",
  "[role='spinbutton']",
  "[role='textbox']",
  ".cm-content",
  ".cm-editor",
  ".xterm",
  ".xterm-screen",
].join(",");

export function createGpuNodeInteractionDirtyController({
  deferPassiveDirty,
  elementByNodeId,
  getFrame,
  onStateChange,
  requestFrame,
  textureManager,
}: GpuNodeInteractionDirtyControllerOptions): GpuNodeInteractionDirtyController {
  let activeNodeId: string | null = null;
  let overlayNodeId: string | null = null;
  let pointerInteractionNodeId: string | null = null;
  let releaseAfterUploadNodeId: string | null = null;

  function setState(next: NodeInteractionStatePatch) {
    const previousActiveNodeId = activeNodeId;
    const previousOverlayNodeId = overlayNodeId;
    activeNodeId = resolveNullableStatePatchValue(
      next,
      "activeNodeId",
      activeNodeId,
    );
    overlayNodeId = resolveNullableStatePatchValue(
      next,
      "overlayNodeId",
      overlayNodeId,
    );
    releaseAfterUploadNodeId = resolveNullableStatePatchValue(
      next,
      "releaseAfterUploadNodeId",
      releaseAfterUploadNodeId,
    );
    if (
      previousActiveNodeId !== activeNodeId ||
      previousOverlayNodeId !== overlayNodeId
    ) {
      onStateChange?.({ activeNodeId, overlayNodeId });
    }
  }

  function markDirty({
    nodeId,
    priority,
    reason,
  }: MarkInteractionDirtyInput): boolean {
    const manager = textureManager();
    if (!manager) {
      return false;
    }

    const deferRequestPaint =
      priority !== "interactive" && Boolean(deferPassiveDirty?.());
    manager.markNodeTextureDirty({
      content: true,
      frame: getFrame(),
      nodeId,
      priority,
      reason,
      ...(deferRequestPaint ? { requestPaint: false } : {}),
    });
    requestFrame("texture-upload");
    return true;
  }

  function beginInteractiveNode(nodeId: string, reason: DirtyNodeReason) {
    const manager = textureManager();
    manager?.setNodeTexturePriority(nodeId, "interactive");
    setState({
      activeNodeId: nodeId,
      overlayNodeId: overlayNodeId === nodeId ? overlayNodeId : null,
      releaseAfterUploadNodeId: null,
    });
    markDirty({ nodeId, priority: "interactive", reason });
  }

  function beginPointerInteraction(nodeId: string) {
    pointerInteractionNodeId = nodeId;
    beginInteractiveNode(nodeId, "pointer");
  }

  function markPointerInteractionDirty() {
    if (!pointerInteractionNodeId) {
      return;
    }
    markDirty({
      nodeId: pointerInteractionNodeId,
      priority: "interactive",
      reason: "pointer",
    });
  }

  function releasePointerInteraction() {
    if (!pointerInteractionNodeId) {
      return;
    }
    const nodeId = pointerInteractionNodeId;
    pointerInteractionNodeId = null;
    if (nodeId !== activeNodeId) {
      return;
    }
    releaseActiveNode("pointer");
  }

  function markEventTargetDirty(
    eventTarget: EventTarget | null,
    kind: DirtyEventKind,
  ) {
    const nodeId = findGpuNodeIdForEventTarget(eventTarget, elementByNodeId());
    if (!nodeId) {
      return;
    }

    const interactiveTarget = isGpuNodeInteractiveEventTarget(eventTarget);
    const priority =
      activeNodeId === nodeId || interactiveTarget ? "interactive" : "visible";
    if (interactiveTarget && priority === "interactive") {
      beginInteractiveNode(nodeId, dirtyReasonForKind(kind));
      return;
    }
    markDirty({ nodeId, priority, reason: dirtyReasonForKind(kind) });
  }

  function markCustomDirtyEvent(
    eventTarget: EventTarget | null,
    detail: {
      readonly priority?: NodeTexturePriority | undefined;
      readonly reason?: DirtyNodeReason | undefined;
    },
  ) {
    const nodeId = findGpuNodeIdForEventTarget(eventTarget, elementByNodeId());
    if (!nodeId) {
      return;
    }

    const explicitPriority = normalizeDirtyEventPriority(detail.priority);
    const reason = detail.reason ?? "content";
    const priority = resolveCustomDirtyEventPriority({
      activeNodeId,
      eventTarget,
      explicitPriority,
      nodeId,
    });
    if (
      priority === "interactive" &&
      shouldBeginCustomDirtyInteraction(eventTarget, explicitPriority)
    ) {
      beginInteractiveNode(nodeId, reason);
      return;
    }
    markDirty({ nodeId, priority, reason });
  }

  function releaseActiveNode(reason: DirtyNodeReason) {
    if (!activeNodeId) {
      return;
    }
    const nodeId = activeNodeId;
    markDirty({ nodeId, priority: "interactive", reason });
    setState({ releaseAfterUploadNodeId: nodeId });
  }

  return {
    attach(canvas, ownerDocument = canvas.ownerDocument) {
      const abortController = new AbortController();
      const listenerOptions = {
        capture: true,
        signal: abortController.signal,
      } satisfies AddEventListenerOptions;

      canvas.addEventListener(
        GPU_FLOW_NODE_DIRTY_EVENT,
        (event) => {
          const detail = getGpuFlowNodeDirtyEventDetail(event);
          if (detail) {
            markCustomDirtyEvent(event.target, detail);
          }
        },
        listenerOptions,
      );
      canvas.addEventListener(
        "beforeinput",
        (event) => markEventTargetDirty(event.target, "input"),
        listenerOptions,
      );
      canvas.addEventListener(
        "input",
        (event) => markEventTargetDirty(event.target, "input"),
        listenerOptions,
      );
      canvas.addEventListener(
        "change",
        (event) => markEventTargetDirty(event.target, "input"),
        listenerOptions,
      );
      canvas.addEventListener(
        "scroll",
        (event) => markEventTargetDirty(event.target, "scroll"),
        listenerOptions,
      );
      canvas.addEventListener(
        "focusin",
        (event) => markEventTargetDirty(event.target, "focus"),
        listenerOptions,
      );
      canvas.addEventListener(
        "focusout",
        (event) => {
          const nodeId = findGpuNodeIdForEventTarget(
            event.target,
            elementByNodeId(),
          );
          if (nodeId && nodeId === activeNodeId) {
            releaseActiveNode("focus");
          }
        },
        listenerOptions,
      );
      canvas.addEventListener(
        "pointerdown",
        (event) => {
          const nodeId = findGpuNodeIdForEventTarget(
            event.target,
            elementByNodeId(),
          );
          if (!nodeId || !isGpuNodeInteractiveEventTarget(event.target)) {
            return;
          }
          beginPointerInteraction(nodeId);
        },
        listenerOptions,
      );
      ownerDocument.addEventListener(
        "pointermove",
        markPointerInteractionDirty,
        listenerOptions,
      );
      ownerDocument.addEventListener(
        "pointerup",
        releasePointerInteraction,
        listenerOptions,
      );
      ownerDocument.addEventListener(
        "pointercancel",
        releasePointerInteraction,
        listenerOptions,
      );
      ownerDocument.addEventListener(
        "selectionchange",
        () => {
          const selectionTarget =
            ownerDocument.getSelection()?.anchorNode ??
            ownerDocument.activeElement;
          markEventTargetDirty(selectionTarget, "selection");
        },
        listenerOptions,
      );

      return () => abortController.abort();
    },
    clearNode(nodeId) {
      const nextActiveNodeId = activeNodeId === nodeId ? null : activeNodeId;
      const nextOverlayNodeId = overlayNodeId === nodeId ? null : overlayNodeId;
      const nextReleaseNodeId =
        releaseAfterUploadNodeId === nodeId ? null : releaseAfterUploadNodeId;
      if (pointerInteractionNodeId === nodeId) {
        pointerInteractionNodeId = null;
      }
      setState({
        activeNodeId: nextActiveNodeId,
        overlayNodeId: nextOverlayNodeId,
        releaseAfterUploadNodeId: nextReleaseNodeId,
      });
    },
    completeFrame(result) {
      if (!activeNodeId) {
        setState({ overlayNodeId: null, releaseAfterUploadNodeId: null });
        return;
      }

      const activeUploaded = result.uploadedNodeIds.includes(activeNodeId);
      const activeStillDirty =
        result.remainingDirtyNodeIds.includes(activeNodeId);
      if (activeStillDirty && result.budgetExhausted) {
        setState({ overlayNodeId: activeNodeId });
        return;
      }

      if (!activeUploaded) {
        return;
      }

      const manager = textureManager();
      if (releaseAfterUploadNodeId === activeNodeId) {
        manager?.setNodeTexturePriority(activeNodeId, "visible");
        setState({
          activeNodeId: null,
          overlayNodeId: null,
          releaseAfterUploadNodeId: null,
        });
        return;
      }

      setState({ overlayNodeId: null });
    },
    getActiveNodeId() {
      return activeNodeId;
    },
    getOverlayNodeId() {
      return overlayNodeId;
    },
  };
}

export function findGpuNodeIdForEventTarget(
  target: EventTarget | Node | null,
  elementByNodeId: ReadonlyMap<string, HTMLElement>,
): string | null {
  const element = toElement(target);
  const nodeElement = element?.closest<HTMLElement>(GPU_FLOW_NODE_SELECTOR);
  const nodeId = nodeElement?.getAttribute("data-id");
  if (nodeId && elementByNodeId.get(nodeId) === nodeElement) {
    return nodeId;
  }

  if (!element) {
    return null;
  }
  for (const [candidateNodeId, candidateElement] of elementByNodeId) {
    if (candidateElement === element || candidateElement.contains(element)) {
      return candidateNodeId;
    }
  }
  return null;
}

export function isGpuNodeInteractiveEventTarget(
  target: EventTarget | Node | null,
): boolean {
  const element = toElement(target);
  return Boolean(element?.closest(INTERACTIVE_TARGET_SELECTOR));
}

function dirtyReasonForKind(kind: DirtyEventKind): DirtyNodeReason {
  switch (kind) {
    case "focus":
      return "focus";
    case "pointer":
      return "pointer";
    case "scroll":
      return "scroll";
    case "selection":
      return "selection";
    case "input":
      return "input";
  }
}

function normalizeDirtyEventPriority(
  priority: NodeTexturePriority | undefined,
): NodeTexturePriority | null {
  return priority === "interactive" ||
    priority === "visible" ||
    priority === "prefetch"
    ? priority
    : null;
}

function resolveCustomDirtyEventPriority({
  activeNodeId,
  eventTarget,
  explicitPriority,
  nodeId,
}: {
  readonly activeNodeId: string | null;
  readonly eventTarget: EventTarget | null;
  readonly explicitPriority: NodeTexturePriority | null;
  readonly nodeId: string;
}): NodeTexturePriority {
  if (activeNodeId === nodeId || explicitPriority === "interactive") {
    return "interactive";
  }
  if (explicitPriority) {
    return explicitPriority;
  }
  return isGpuNodeInteractiveEventTarget(eventTarget)
    ? "interactive"
    : "visible";
}

function shouldBeginCustomDirtyInteraction(
  eventTarget: EventTarget | null,
  explicitPriority: NodeTexturePriority | null,
): boolean {
  if (explicitPriority === "interactive") {
    return true;
  }
  if (explicitPriority) {
    return false;
  }
  return isGpuNodeInteractiveEventTarget(eventTarget);
}

function resolveNullableStatePatchValue(
  patch: NodeInteractionStatePatch,
  key: keyof NodeInteractionStatePatch,
  currentValue: string | null,
): string | null {
  return Object.prototype.hasOwnProperty.call(patch, key)
    ? patch[key] ?? null
    : currentValue;
}

function toElement(target: EventTarget | Node | null): Element | null {
  if (!target || typeof target !== "object" || !("nodeType" in target)) {
    return null;
  }

  const node = target as Node;
  if (node.nodeType === 1) {
    return node as Element;
  }
  if (node.nodeType === 3) {
    return node.parentElement;
  }
  return null;
}
