import {
  isGpuNodeInteractiveEventTarget,
  resolveGpuNodeTargetDescriptor,
  type GpuNodePointerHandoffTarget,
} from "./activeNodeTargeting";
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
};

export type GpuNodeInteractionDirtyController = {
  attach(canvas: HTMLElement, ownerDocument?: Document): () => void;
  clearNode(nodeId: string): void;
  completeFrame(result: GpuNodeInteractionFrameResult): void;
  getActiveNodeId(): string | null;
  getLiveNodeId(): string | null;
};

type GpuNodeInteractionDirtyControllerOptions = {
  readonly activatePointerHandoffNode?:
    | ((nodeId: string) => HTMLElement | null)
    | undefined;
  readonly deferPassiveDirty?: (() => boolean) | undefined;
  readonly elementByNodeId: () => ReadonlyMap<string, HTMLElement>;
  readonly getFrame: () => number;
  readonly activeSettleDelayMs?: number | undefined;
  readonly onStateChange?:
    | ((state: GpuNodeInteractionState) => void)
    | undefined;
  readonly requestFrame: (reason: GpuFrameReason) => void;
  readonly resolvePointerHandoffTarget?:
    | ((event: PointerEvent) => GpuNodePointerHandoffTarget | null)
    | undefined;
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
  readonly releaseAfterUploadNodeId?: string | null | undefined;
};

type PendingPointerHandoffClick = {
  readonly pointerId: number;
  readonly target: HTMLElement;
};

const GPU_FLOW_NODE_SELECTOR = '[data-gpu-flow-node="true"]';
const GPU_FLOW_TELEPORTED_NODE_SELECTOR = '[data-gpu-flow-teleport="active"]';
const GPU_FLOW_MOUSE_ACTIVATION_SELECTOR =
  '[data-gpu-flow-activation="mousedown"]';
const DEFAULT_ACTIVE_SETTLE_DELAY_MS = 240;
const TRUSTED_POINTER_HANDOFF_CLICK_SUPPRESSION_MS = 120;

export { isGpuNodeInteractiveEventTarget } from "./activeNodeTargeting";

export function createGpuNodeInteractionDirtyController({
  activatePointerHandoffNode,
  activeSettleDelayMs = DEFAULT_ACTIVE_SETTLE_DELAY_MS,
  deferPassiveDirty,
  elementByNodeId,
  getFrame,
  onStateChange,
  requestFrame,
  resolvePointerHandoffTarget,
  textureManager,
}: GpuNodeInteractionDirtyControllerOptions): GpuNodeInteractionDirtyController {
  let activeNodeId: string | null = null;
  let dispatchingPointerHandoff = false;
  let pendingPointerHandoffClick: PendingPointerHandoffClick | null = null;
  let pendingTrustedPointerHandoffClickTarget: HTMLElement | null = null;
  let trustedPointerHandoffClickSuppressionTimer: ReturnType<
    typeof globalThis.setTimeout
  > | null = null;
  let pointerInteractionNodeId: string | null = null;
  let releaseAfterUploadNodeId: string | null = null;
  let activeSettleTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  function setState(next: NodeInteractionStatePatch) {
    const previousActiveNodeId = activeNodeId;
    activeNodeId = resolveNullableStatePatchValue(
      next,
      "activeNodeId",
      activeNodeId,
    );
    releaseAfterUploadNodeId = resolveNullableStatePatchValue(
      next,
      "releaseAfterUploadNodeId",
      releaseAfterUploadNodeId,
    );
    if (previousActiveNodeId !== activeNodeId) {
      onStateChange?.({ activeNodeId });
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
    clearActiveSettleTimer();
    setState({
      activeNodeId: nodeId,
      releaseAfterUploadNodeId: null,
    });
    markDirty({ nodeId, priority: "interactive", reason });
  }

  function beginPointerInteraction(nodeId: string) {
    pointerInteractionNodeId = nodeId;
    beginInteractiveNode(nodeId, "pointer");
  }

  function handOffPointerEvent(event: PointerEvent): boolean {
    const handoffTarget = resolvePointerHandoffTarget?.(event);
    if (!handoffTarget) {
      return false;
    }
    const liveNodeElement =
      activatePointerHandoffNode?.(handoffTarget.nodeId) ??
      elementByNodeId().get(handoffTarget.nodeId) ??
      null;
    const liveTarget = liveNodeElement
      ? resolveGpuNodeTargetDescriptor(
          liveNodeElement,
          handoffTarget.descriptor,
        )
      : null;
    if (!liveTarget) {
      return false;
    }

    beginPointerInteraction(handoffTarget.nodeId);
    event.preventDefault();
    event.stopImmediatePropagation();
    dispatchingPointerHandoff = true;
    try {
      dispatchPointerHandoffEvent(liveTarget, event);
      if (shouldDispatchPointerHandoffMouseDown(liveTarget)) {
        dispatchPointerHandoffMouseEvent(liveTarget, event);
      }
    } finally {
      dispatchingPointerHandoff = false;
    }
    focusPointerHandoffTarget(liveTarget);
    queuePointerHandoffClick(liveTarget, event);
    return true;
  }

  function queuePointerHandoffClick(target: HTMLElement, event: PointerEvent) {
    pendingPointerHandoffClick = getPendingPointerHandoffClick(target, event);
    if (!pendingPointerHandoffClick || !event.isTrusted) {
      return;
    }
    suppressNextTrustedPointerHandoffClick(target);
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

  function releasePointerHandoff(event: PointerEvent) {
    const pendingClick = pendingPointerHandoffClick;
    pendingPointerHandoffClick = null;
    if (
      pendingClick &&
      pendingClick.pointerId === event.pointerId &&
      shouldDispatchPendingPointerHandoffClick(pendingClick.target, event)
    ) {
      globalThis.queueMicrotask(() => {
        if (pendingClick.target.isConnected) {
          pendingClick.target.click();
        }
        clearTrustedPointerHandoffClickSuppressionSoon(pendingClick.target);
      });
    }
    releasePointerInteraction();
  }

  function cancelPointerInteraction() {
    pendingPointerHandoffClick = null;
    clearTrustedPointerHandoffClickSuppression();
    releasePointerInteraction();
  }

  function suppressNextTrustedPointerHandoffClick(target: HTMLElement) {
    pendingTrustedPointerHandoffClickTarget = target;
    clearTrustedPointerHandoffClickSuppressionTimer();
  }

  function clearTrustedPointerHandoffClickSuppressionSoon(target: HTMLElement) {
    clearTrustedPointerHandoffClickSuppressionTimer();
    trustedPointerHandoffClickSuppressionTimer = globalThis.setTimeout(() => {
      trustedPointerHandoffClickSuppressionTimer = null;
      if (pendingTrustedPointerHandoffClickTarget === target) {
        pendingTrustedPointerHandoffClickTarget = null;
      }
    }, TRUSTED_POINTER_HANDOFF_CLICK_SUPPRESSION_MS);
  }

  function clearTrustedPointerHandoffClickSuppressionTimer() {
    if (trustedPointerHandoffClickSuppressionTimer === null) {
      return;
    }
    globalThis.clearTimeout(trustedPointerHandoffClickSuppressionTimer);
    trustedPointerHandoffClickSuppressionTimer = null;
  }

  function clearTrustedPointerHandoffClickSuppression() {
    clearTrustedPointerHandoffClickSuppressionTimer();
    pendingTrustedPointerHandoffClickTarget = null;
  }

  function suppressTrustedPointerHandoffClick(event: MouseEvent) {
    const target = pendingTrustedPointerHandoffClickTarget;
    if (
      !target ||
      !event.isTrusted ||
      !shouldSuppressTrustedPointerHandoffClick(target, event)
    ) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    clearTrustedPointerHandoffClickSuppression();
  }

  function clearPendingPointerHandoffForNode(nodeId: string) {
    const nodeElements = elementByNodeId();
    if (
      pendingPointerHandoffClick &&
      findGpuNodeIdForEventTarget(
        pendingPointerHandoffClick.target,
        nodeElements,
      ) === nodeId
    ) {
      pendingPointerHandoffClick = null;
    }
    if (
      pendingTrustedPointerHandoffClickTarget &&
      findGpuNodeIdForEventTarget(
        pendingTrustedPointerHandoffClickTarget,
        nodeElements,
      ) === nodeId
    ) {
      clearTrustedPointerHandoffClickSuppression();
    }
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
    scheduleActiveSettleFrame(nodeId);
  }

  function scheduleActiveSettleFrame(nodeId: string) {
    clearActiveSettleTimer();
    if (activeSettleDelayMs <= 0) {
      return;
    }
    activeSettleTimer = globalThis.setTimeout(() => {
      activeSettleTimer = null;
      if (activeNodeId === nodeId && releaseAfterUploadNodeId === nodeId) {
        requestFrame("texture-upload");
      }
    }, activeSettleDelayMs);
  }

  function clearActiveSettleTimer() {
    if (activeSettleTimer === null) {
      return;
    }
    globalThis.clearTimeout(activeSettleTimer);
    activeSettleTimer = null;
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
          if (dispatchingPointerHandoff) {
            return;
          }
          if (
            !isGpuNodeTeleportedEventTarget(event.target) &&
            handOffPointerEvent(event)
          ) {
            return;
          }
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
        releasePointerHandoff,
        listenerOptions,
      );
      ownerDocument.addEventListener(
        "click",
        suppressTrustedPointerHandoffClick,
        listenerOptions,
      );
      ownerDocument.addEventListener(
        "pointercancel",
        cancelPointerInteraction,
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

      return () => {
        abortController.abort();
        clearActiveSettleTimer();
        clearTrustedPointerHandoffClickSuppression();
      };
    },
    clearNode(nodeId) {
      const nextActiveNodeId = activeNodeId === nodeId ? null : activeNodeId;
      const nextReleaseNodeId =
        releaseAfterUploadNodeId === nodeId ? null : releaseAfterUploadNodeId;
      if (pointerInteractionNodeId === nodeId) {
        pointerInteractionNodeId = null;
      }
      clearPendingPointerHandoffForNode(nodeId);
      if (activeNodeId === nodeId || releaseAfterUploadNodeId === nodeId) {
        clearActiveSettleTimer();
      }
      setState({
        activeNodeId: nextActiveNodeId,
        releaseAfterUploadNodeId: nextReleaseNodeId,
      });
    },
    completeFrame(result) {
      if (!activeNodeId) {
        setState({ releaseAfterUploadNodeId: null });
        return;
      }

      const activeUploaded = result.uploadedNodeIds.includes(activeNodeId);
      const activeStillDirty =
        result.remainingDirtyNodeIds.includes(activeNodeId);
      if (activeStillDirty && result.budgetExhausted) {
        return;
      }

      if (
        releaseAfterUploadNodeId === activeNodeId &&
        activeSettleTimer !== null
      ) {
        return;
      }

      if (!activeUploaded) {
        return;
      }

      const manager = textureManager();
      if (releaseAfterUploadNodeId === activeNodeId) {
        clearActiveSettleTimer();
        manager?.setNodeTexturePriority(activeNodeId, "visible");
        setState({
          activeNodeId: null,
          releaseAfterUploadNodeId: null,
        });
        return;
      }
    },
    getActiveNodeId() {
      return activeNodeId;
    },
    getLiveNodeId() {
      if (!activeNodeId) {
        return null;
      }
      if (
        releaseAfterUploadNodeId === activeNodeId &&
        activeSettleTimer === null
      ) {
        return null;
      }
      return activeNodeId;
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

function isGpuNodeTeleportedEventTarget(target: EventTarget | Node | null) {
  const element = toElement(target);
  return Boolean(element?.closest(GPU_FLOW_TELEPORTED_NODE_SELECTOR));
}

function dispatchPointerHandoffEvent(target: HTMLElement, event: PointerEvent) {
  const PointerEventConstructor =
    target.ownerDocument.defaultView?.PointerEvent ?? globalThis.PointerEvent;
  const init = {
    altKey: event.altKey,
    bubbles: true,
    button: event.button,
    buttons: event.buttons,
    cancelable: true,
    clientX: event.clientX,
    clientY: event.clientY,
    composed: true,
    ctrlKey: event.ctrlKey,
    height: event.height,
    isPrimary: event.isPrimary,
    metaKey: event.metaKey,
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    pressure: event.pressure,
    screenX: event.screenX,
    screenY: event.screenY,
    shiftKey: event.shiftKey,
    tangentialPressure: event.tangentialPressure,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    twist: event.twist,
    width: event.width,
  } satisfies PointerEventInit;
  const handoffEvent =
    typeof PointerEventConstructor === "function"
      ? new PointerEventConstructor(event.type, init)
      : new MouseEvent(event.type, init);
  target.dispatchEvent(handoffEvent);
}

function dispatchPointerHandoffMouseEvent(
  target: HTMLElement,
  event: PointerEvent,
) {
  const init = {
    altKey: event.altKey,
    bubbles: true,
    button: event.button,
    buttons: event.buttons,
    cancelable: true,
    clientX: event.clientX,
    clientY: event.clientY,
    composed: true,
    ctrlKey: event.ctrlKey,
    detail: 1,
    metaKey: event.metaKey,
    screenX: event.screenX,
    screenY: event.screenY,
    shiftKey: event.shiftKey,
  } satisfies MouseEventInit;
  target.dispatchEvent(new MouseEvent("mousedown", init));
}

function shouldDispatchPointerHandoffMouseDown(target: HTMLElement): boolean {
  return Boolean(target.closest(GPU_FLOW_MOUSE_ACTIVATION_SELECTOR));
}

function focusPointerHandoffTarget(target: HTMLElement) {
  if (isTextFocusTarget(target)) {
    target.focus({ preventScroll: true });
  }
}

function getPendingPointerHandoffClick(
  target: HTMLElement,
  event: PointerEvent,
): PendingPointerHandoffClick | null {
  if (!isClickHandoffTarget(target)) {
    return null;
  }
  return {
    pointerId: event.pointerId,
    target,
  };
}

function shouldDispatchPendingPointerHandoffClick(
  target: HTMLElement,
  event: PointerEvent,
): boolean {
  if (!target.isConnected) {
    return false;
  }
  return isMouseEventInsideElement(target, event);
}

function shouldSuppressTrustedPointerHandoffClick(
  target: HTMLElement,
  event: MouseEvent,
): boolean {
  if (!target.isConnected) {
    return false;
  }
  return (
    isTrustedClickTargetForHandoffTarget(target, event.target) ||
    isMouseEventInsideElement(target, event)
  );
}

function isTrustedClickTargetForHandoffTarget(
  target: HTMLElement,
  rawEventTarget: EventTarget | null,
): boolean {
  const eventTarget = toElement(rawEventTarget);
  return Boolean(
    eventTarget &&
      (eventTarget === target ||
        target.contains(eventTarget) ||
        eventTarget.contains(target)),
  );
}

function isMouseEventInsideElement(element: HTMLElement, event: MouseEvent) {
  const rect = element.getBoundingClientRect();
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    event.clientX >= rect.left &&
    event.clientX < rect.right &&
    event.clientY >= rect.top &&
    event.clientY < rect.bottom
  );
}

function isTextFocusTarget(target: HTMLElement): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && isTextInputType(target.type)) ||
    target.isContentEditable ||
    target.getAttribute("role") === "textbox" ||
    target.getAttribute("role") === "searchbox"
  );
}

function isTextInputType(inputType: string): boolean {
  return (
    inputType === "" ||
    inputType === "email" ||
    inputType === "number" ||
    inputType === "password" ||
    inputType === "search" ||
    inputType === "tel" ||
    inputType === "text" ||
    inputType === "url"
  );
}

function isClickHandoffTarget(target: HTMLElement): boolean {
  if (target instanceof HTMLButtonElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return (
      target.type === "button" ||
      target.type === "checkbox" ||
      target.type === "radio" ||
      target.type === "submit"
    );
  }
  const role = target.getAttribute("role");
  return role === "button" || role === "menuitem" || role === "switch";
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
