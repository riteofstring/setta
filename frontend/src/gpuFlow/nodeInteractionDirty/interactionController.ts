import {
  isGpuNodeInteractiveEventTarget,
  isGpuNodeResizeHandleEventTarget,
  resolveGpuNodeTargetDescriptor,
  type GpuNodePointerHandoffTarget,
} from "../activeNodeTargeting";

import type { DirtyNodeReason, NodeTexturePriority } from "../dirtyTracking";

import {
  getGpuFlowNodeDirtyEventDetail,
  GPU_FLOW_NODE_DIRTY_EVENT,
} from "../nodeDirtyEvents";

import {
  ActiveNodeReleaseOptions,
  DEFAULT_ACTIVE_SETTLE_DELAY_MS,
  DirtyEventKind,
  GPU_FLOW_NODE_SELECTOR,
  GPU_FLOW_PERSISTENT_FOCUS_SELECTOR,
  GPU_FLOW_TELEPORTED_NODE_SELECTOR,
  GpuNodeInteractionDirtyController,
  GpuNodeInteractionDirtyControllerOptions,
  GpuNodeInteractionFrameResult,
  MarkInteractionDirtyInput,
  NodeInteractionStatePatch,
  PendingPointerHandoffClick,
  TRUSTED_POINTER_HANDOFF_CLICK_SUPPRESSION_MS,
} from "./interactionTypes";

import {
  applyWheelScroll,
  dirtyReasonForKind,
  dispatchPointerHandoffEvent,
  dispatchPointerHandoffMouseEvent,
  focusPointerHandoffTarget,
  getPendingPointerHandoffClick,
  isTextInputType,
  normalizeDirtyEventPriority,
  resolveCustomDirtyEventPriority,
  resolveEventDirtyPriority,
  resolveNullableStatePatchValue,
  shouldBeginCustomDirtyInteraction,
  shouldBeginEventTargetInteraction,
  shouldDispatchPendingPointerHandoffClick,
  shouldDispatchPointerHandoffMouseDown,
  shouldSuppressTrustedPointerHandoffClick,
  toElement,
} from "./pointerHandoff";

export function createGpuNodeInteractionDirtyController({
  activatePointerHandoffNode,
  activeSettleDelayMs = DEFAULT_ACTIVE_SETTLE_DELAY_MS,
  deferPassiveDirty,
  elementByNodeId,
  getFrame,
  onStateChange,
  requestFrame,
  resolvePointerHandoffTarget,
  resolveWheelHandoffTarget,
  textureManager,
}: GpuNodeInteractionDirtyControllerOptions): GpuNodeInteractionDirtyController {
  let activeNodeId: string | null = null;
  let dispatchingPointerHandoff = false;
  let pendingPointerHandoffClick: PendingPointerHandoffClick | null = null;
  let pendingTrustedPointerHandoffClickTarget: HTMLElement | null = null;
  let trustedPointerHandoffClickSuppressionTimer: ReturnType<
    typeof globalThis.setTimeout
  > | null = null;
  let focusedPersistentNodeId: string | null = null;
  let hoverInteractionNodeId: string | null = null;
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
    hoverInteractionNodeId = null;
    pointerInteractionNodeId = nodeId;
    beginInteractiveNode(nodeId, "pointer");
  }

  function beginResizeHandleHoverInteraction(nodeId: string) {
    if (pointerInteractionNodeId) {
      return;
    }
    if (hoverInteractionNodeId === nodeId && activeNodeId === nodeId) {
      return;
    }
    hoverInteractionNodeId = nodeId;
    beginInteractiveNode(nodeId, "pointer");
  }

  function releaseResizeHandleHoverInteraction() {
    if (!hoverInteractionNodeId) {
      return;
    }
    const nodeId = hoverInteractionNodeId;
    hoverInteractionNodeId = null;
    if (pointerInteractionNodeId || nodeId !== activeNodeId) {
      return;
    }
    if (hasPersistentFocusForNode(nodeId)) {
      return;
    }
    releaseActiveNode("pointer");
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

  function handOffWheelEvent(event: WheelEvent): boolean {
    const handoffTarget = resolveWheelHandoffTarget?.(event);
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

    event.preventDefault();
    event.stopImmediatePropagation();
    beginInteractiveNode(handoffTarget.nodeId, "scroll");
    applyWheelScroll(liveTarget, event);
    scheduleActiveNodeRelease(handoffTarget.nodeId);
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
    if (hasPersistentFocusForNode(nodeId)) {
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
    releaseResizeHandleHoverInteraction();
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

  function updateResizeHandleHoverInteraction(event: PointerEvent) {
    if (dispatchingPointerHandoff || pointerInteractionNodeId) {
      return;
    }

    if (tryBeginResizeHandleHoverFromEventTarget(event.target)) {
      return;
    }

    const handoffTarget = resolvePointerHandoffTarget?.(event);
    if (
      handoffTarget &&
      tryBeginResizeHandleHoverFromHandoffTarget(handoffTarget)
    ) {
      return;
    }

    releaseResizeHandleHoverInteraction();
  }

  function tryBeginResizeHandleHoverFromEventTarget(
    target: EventTarget | null,
  ): boolean {
    const teleportedNodeId = findGpuNodeIdForEventTarget(
      target,
      elementByNodeId(),
    );
    if (!teleportedNodeId || !isGpuNodeResizeHandleEventTarget(target)) {
      return false;
    }

    activateResizeHandleHoverNode(teleportedNodeId);
    return true;
  }

  function tryBeginResizeHandleHoverFromHandoffTarget(
    handoffTarget: GpuNodePointerHandoffTarget,
  ): boolean {
    if (!isResizeHandleHandoffTarget(handoffTarget)) {
      return false;
    }

    activateResizeHandleHoverNode(handoffTarget.nodeId);
    return true;
  }

  function isResizeHandleHandoffTarget(
    handoffTarget: GpuNodePointerHandoffTarget,
  ): boolean {
    const nodeElement = elementByNodeId().get(handoffTarget.nodeId) ?? null;
    const liveTarget = nodeElement
      ? resolveGpuNodeTargetDescriptor(nodeElement, handoffTarget.descriptor)
      : null;
    return isGpuNodeResizeHandleEventTarget(liveTarget);
  }

  function activateResizeHandleHoverNode(nodeId: string) {
    if (hoverInteractionNodeId !== nodeId || activeNodeId !== nodeId) {
      activatePointerHandoffNode?.(nodeId);
    }
    beginResizeHandleHoverInteraction(nodeId);
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
    if (kind === "focus" && isGpuNodePersistentFocusEventTarget(eventTarget)) {
      focusedPersistentNodeId = nodeId;
    }
    const priority = resolveEventDirtyPriority({
      activeNodeId,
      interactiveTarget,
      nodeId,
    });
    if (kind === "scroll" && activeNodeId === nodeId) {
      const keepLiveForFocus = hasPersistentFocusForNode(nodeId);
      if (keepLiveForFocus) {
        clearActiveSettleTimer();
        setState({ releaseAfterUploadNodeId: null });
      }
      markDirty({ nodeId, priority: "interactive", reason: "scroll" });
      if (!keepLiveForFocus) {
        releaseActiveNodeAfterUpload(nodeId, { settleLiveDom: false });
      }
      return;
    }
    if (shouldBeginEventTargetInteraction({ interactiveTarget, priority })) {
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

  function handleFocusOut(event: FocusEvent) {
    const nodeId = findGpuNodeIdForEventTarget(event.target, elementByNodeId());
    if (nodeId && isNodePersistentFocusTarget(nodeId, event.relatedTarget)) {
      return;
    }
    if (nodeId && nodeId === focusedPersistentNodeId) {
      focusedPersistentNodeId = null;
    }
    if (nodeId && nodeId === activeNodeId) {
      releaseActiveNode("focus", { settleLiveDom: false });
    }
  }

  function releaseActiveNode(
    reason: DirtyNodeReason,
    options: ActiveNodeReleaseOptions = {},
  ) {
    if (!activeNodeId) {
      return;
    }
    const nodeId = activeNodeId;
    markDirty({ nodeId, priority: "interactive", reason });
    releaseActiveNodeAfterUpload(nodeId, options);
  }

  function scheduleActiveNodeRelease(nodeId: string) {
    releaseActiveNodeAfterUpload(nodeId, { settleLiveDom: true });
  }

  function releaseActiveNodeAfterUpload(
    nodeId: string,
    { settleLiveDom = true }: ActiveNodeReleaseOptions = {},
  ) {
    if (activeNodeId !== nodeId) {
      return;
    }
    setState({ releaseAfterUploadNodeId: nodeId });
    if (!settleLiveDom) {
      clearActiveSettleTimer();
      return;
    }
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
        "wheel",
        (event) => {
          handOffWheelEvent(event);
        },
        listenerOptions,
      );
      canvas.addEventListener(
        "focusin",
        (event) => markEventTargetDirty(event.target, "focus"),
        listenerOptions,
      );
      canvas.addEventListener("focusout", handleFocusOut, listenerOptions);
      ownerDocument.addEventListener(
        "scroll",
        (event) => {
          if (shouldHandleTeleportedEventOutsideElement(event.target, canvas)) {
            markEventTargetDirty(event.target, "scroll");
          }
        },
        listenerOptions,
      );
      ownerDocument.addEventListener(
        "wheel",
        (event) => {
          if (shouldHandleTeleportedEventOutsideElement(event.target, canvas)) {
            handOffWheelEvent(event);
          }
        },
        listenerOptions,
      );
      ownerDocument.addEventListener(
        "focusin",
        (event) => {
          if (shouldHandleTeleportedEventOutsideElement(event.target, canvas)) {
            markEventTargetDirty(event.target, "focus");
          }
        },
        listenerOptions,
      );
      ownerDocument.addEventListener(
        "focusout",
        (event) => {
          if (shouldHandleTeleportedEventOutsideElement(event.target, canvas)) {
            handleFocusOut(event);
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
        (event) => {
          markPointerInteractionDirty();
          updateResizeHandleHoverInteraction(event);
        },
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
      if (hoverInteractionNodeId === nodeId) {
        hoverInteractionNodeId = null;
      }
      if (focusedPersistentNodeId === nodeId) {
        focusedPersistentNodeId = null;
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
      requestActiveReleaseWhenUnowned();

      if (shouldDeferActiveReleaseCompletion(result)) {
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
      if (!releaseAfterUploadNodeId && !hasLiveActiveNodeOwner(activeNodeId)) {
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

  function requestActiveReleaseWhenUnowned() {
    if (!activeNodeId || releaseAfterUploadNodeId) {
      return;
    }
    if (hasLiveActiveNodeOwner(activeNodeId)) {
      return;
    }
    clearActiveSettleTimer();
    setState({ releaseAfterUploadNodeId: activeNodeId });
    requestFrame("texture-upload");
  }

  function shouldDeferActiveReleaseCompletion(
    result: GpuNodeInteractionFrameResult,
  ): boolean {
    if (!activeNodeId) {
      return true;
    }
    if (
      result.budgetExhausted &&
      result.remainingDirtyNodeIds.includes(activeNodeId)
    ) {
      return true;
    }
    if (
      releaseAfterUploadNodeId === activeNodeId &&
      activeSettleTimer !== null
    ) {
      return true;
    }
    return !result.uploadedNodeIds.includes(activeNodeId);
  }

  function hasLiveActiveNodeOwner(nodeId: string): boolean {
    return Boolean(
      pointerInteractionNodeId ||
        hoverInteractionNodeId ||
        hasPersistentFocusForNode(nodeId),
    );
  }

  function hasPersistentFocusForNode(nodeId: string): boolean {
    const activeElement = getNodeOwnerDocumentActiveElement(nodeId);
    return isNodePersistentFocusTarget(nodeId, activeElement);
  }

  function getNodeOwnerDocumentActiveElement(nodeId: string): Element | null {
    const nodeElement = elementByNodeId().get(nodeId);
    return nodeElement?.ownerDocument.activeElement ?? null;
  }

  function isNodePersistentFocusTarget(
    nodeId: string,
    target: EventTarget | Node | null,
  ): boolean {
    if (focusedPersistentNodeId !== nodeId) {
      return false;
    }
    const nodeElement = elementByNodeId().get(nodeId);
    const element = toElement(target);
    return Boolean(
      nodeElement &&
        element &&
        (nodeElement === element || nodeElement.contains(element)) &&
        isGpuNodePersistentFocusEventTarget(element),
    );
  }
}

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
  return isActiveTeleportedGpuNodeElement(nodeElement) ? nodeId : null;
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

export function isActiveTeleportedGpuNodeElement(
  nodeElement: HTMLElement,
): boolean {
  return nodeElement.getAttribute("data-gpu-flow-teleport") === "active";
}

export function isGpuNodeTeleportedEventTarget(
  target: EventTarget | Node | null,
) {
  const element = toElement(target);
  return Boolean(element?.closest(GPU_FLOW_TELEPORTED_NODE_SELECTOR));
}

export function shouldHandleTeleportedEventOutsideElement(
  target: EventTarget | Node | null,
  attachedElement: HTMLElement,
): boolean {
  const element = toElement(target);
  return Boolean(
    element &&
      !attachedElement.contains(element) &&
      isGpuNodeTeleportedEventTarget(element),
  );
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
