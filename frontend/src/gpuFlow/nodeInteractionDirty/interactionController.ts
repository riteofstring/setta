import {
  isGpuNodeInteractiveEventTarget,
  isGpuNodeResizeHandleEventTarget,
  resolveGpuNodeTargetDescriptor,
  type GpuNodePointerHandoffTarget,
} from "../activeNodeTargeting";

import type { DirtyNodeReason, NodeTexturePriority } from "../dirtyTracking";

import { createHtmlSurfaceAnimationCaptureLeaseController } from "../htmlSurfaces/animationLease";
import { isPassiveHtmlSurfaceSourceEventTarget } from "../htmlSurfaces/sourceDom";
import { resolveElementSourceRect } from "../htmlSurfaces/sourceRects";

import {
  getGpuFlowNodeDirtyEventDetail,
  GPU_FLOW_NODE_DIRTY_EVENT,
} from "../nodeDirtyEvents";

import {
  DirtyEventKind,
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

import {
  findGpuNodeIdForEventTarget,
  isGpuNodePersistentFocusEventTarget,
} from "./nodeTargetLookup";

export function createGpuNodeInteractionDirtyController({
  cancelAnimationFrame,
  deferPassiveDirty,
  elementByNodeId,
  getFrame,
  now,
  onStateChange,
  projectPointerInteraction,
  requestAnimationFrame,
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
  let hoverInteractionTarget: Element | null = null;
  let pointerInteractionNodeId: string | null = null;
  let pointerInteractionTarget: Element | null = null;
  let releaseAfterUploadNodeId: string | null = null;
  const animationCaptureLeases =
    createHtmlSurfaceAnimationCaptureLeaseController({
      ...(cancelAnimationFrame ? { cancelAnimationFrame } : {}),
      getSourceElement: (nodeId) => elementByNodeId().get(nodeId) ?? null,
      markDirty: ({ reason, sourceRect, surfaceId }) =>
        markAnimationCaptureDirty(surfaceId, reason, sourceRect),
      ...(now ? { now } : {}),
      ...(requestAnimationFrame ? { requestAnimationFrame } : {}),
    });

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
    scheduleFrame = true,
    sourceRect,
  }: MarkInteractionDirtyInput): boolean {
    const manager = textureManager();
    if (!manager) {
      return false;
    }

    const deferRequestPaint =
      priority !== "interactive" && Boolean(deferPassiveDirty?.());
    manager.markSurfaceTextureDirty({
      content: true,
      frame: getFrame(),
      priority,
      reason,
      ...(deferRequestPaint ? { requestPaint: false } : {}),
      ...(sourceRect ? { sourceRect } : {}),
      surfaceId: nodeId,
    });
    if (scheduleFrame) {
      requestFrame("texture-upload");
    }
    return true;
  }

  function beginInteractiveNode(
    nodeId: string,
    reason: DirtyNodeReason,
    sourceRect?: MarkInteractionDirtyInput["sourceRect"] | undefined,
  ) {
    const manager = textureManager();
    manager?.setSurfaceTexturePriority(nodeId, "interactive");
    setState({
      activeNodeId: nodeId,
      releaseAfterUploadNodeId: null,
    });
    markDirty({
      nodeId,
      priority: "interactive",
      reason,
      ...(sourceRect ? { sourceRect } : {}),
    });
  }

  function markAnimationCaptureDirty(
    nodeId: string,
    reason: DirtyNodeReason,
    sourceRect: MarkInteractionDirtyInput["sourceRect"],
  ): boolean {
    const manager = textureManager();
    manager?.setSurfaceTexturePriority(nodeId, "interactive");
    setState({
      activeNodeId: nodeId,
      releaseAfterUploadNodeId: null,
    });
    return markDirty({
      nodeId,
      priority: "interactive",
      reason,
      scheduleFrame: false,
      ...(sourceRect ? { sourceRect } : {}),
    });
  }

  function beginPointerInteraction(
    nodeId: string,
    eventTarget?: EventTarget | null | undefined,
  ) {
    hoverInteractionNodeId = null;
    hoverInteractionTarget = null;
    pointerInteractionNodeId = nodeId;
    pointerInteractionTarget = toElement(eventTarget ?? null);
    beginInteractiveNode(
      nodeId,
      "pointer",
      resolveEventTargetSourceRect(nodeId, pointerInteractionTarget),
    );
  }

  function beginResizeHandleHoverInteraction(
    nodeId: string,
    eventTarget?: EventTarget | null | undefined,
  ) {
    if (pointerInteractionNodeId) {
      return;
    }
    if (hoverInteractionNodeId === nodeId && activeNodeId === nodeId) {
      return;
    }
    hoverInteractionNodeId = nodeId;
    hoverInteractionTarget = toElement(eventTarget ?? null);
    beginInteractiveNode(
      nodeId,
      "pointer",
      resolveEventTargetSourceRect(nodeId, hoverInteractionTarget),
    );
  }

  function releaseResizeHandleHoverInteraction() {
    if (!hoverInteractionNodeId) {
      return;
    }
    const nodeId = hoverInteractionNodeId;
    const sourceRect = resolveEventTargetSourceRect(
      nodeId,
      hoverInteractionTarget,
    );
    hoverInteractionNodeId = null;
    hoverInteractionTarget = null;
    if (pointerInteractionNodeId || nodeId !== activeNodeId) {
      return;
    }
    if (hasPersistentFocusForNode(nodeId)) {
      return;
    }
    releaseActiveNode("pointer", sourceRect);
  }

  function handOffPointerEvent(event: PointerEvent): boolean {
    const handoffTarget = resolvePointerHandoffTarget?.(event);
    if (!handoffTarget) {
      return false;
    }
    const liveNodeElement = elementByNodeId().get(handoffTarget.nodeId) ?? null;
    const liveTarget = liveNodeElement
      ? resolveGpuNodeTargetDescriptor(
          liveNodeElement,
          handoffTarget.descriptor,
        )
      : null;
    if (!liveTarget) {
      return false;
    }

    beginPointerInteraction(handoffTarget.nodeId, liveTarget);
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
    const liveNodeElement = elementByNodeId().get(handoffTarget.nodeId) ?? null;
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
    beginInteractiveNode(
      handoffTarget.nodeId,
      "scroll",
      resolveEventTargetSourceRect(handoffTarget.nodeId, liveTarget),
    );
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

  function markPointerInteractionDirty(event: PointerEvent) {
    if (!pointerInteractionNodeId) {
      return;
    }
    projectPointerInteraction?.(pointerInteractionNodeId, event);
    markDirty({
      nodeId: pointerInteractionNodeId,
      priority: "interactive",
      reason: "pointer",
      ...sourceRectOption(
        resolveEventTargetSourceRect(
          pointerInteractionNodeId,
          pointerInteractionTarget,
        ),
      ),
    });
  }

  function releasePointerInteraction() {
    if (!pointerInteractionNodeId) {
      return;
    }
    const nodeId = pointerInteractionNodeId;
    const sourceRect = resolveEventTargetSourceRect(
      nodeId,
      pointerInteractionTarget,
    );
    pointerInteractionNodeId = null;
    pointerInteractionTarget = null;
    if (nodeId !== activeNodeId) {
      return;
    }
    if (hasPersistentFocusForNode(nodeId)) {
      return;
    }
    releaseActiveNode("pointer", sourceRect);
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
    if (isPassiveHtmlSurfaceSourceEventTarget(target)) return false;
    const nodeId = findGpuNodeIdForEventTarget(target, elementByNodeId());
    if (!nodeId || !isGpuNodeResizeHandleEventTarget(target)) {
      return false;
    }

    activateResizeHandleHoverNode(nodeId, target);
    return true;
  }

  function tryBeginResizeHandleHoverFromHandoffTarget(
    handoffTarget: GpuNodePointerHandoffTarget,
  ): boolean {
    const target = resolveResizeHandleHandoffTarget(handoffTarget);
    if (!target) {
      return false;
    }

    activateResizeHandleHoverNode(handoffTarget.nodeId, target);
    return true;
  }

  function resolveResizeHandleHandoffTarget(
    handoffTarget: GpuNodePointerHandoffTarget,
  ): HTMLElement | null {
    const nodeElement = elementByNodeId().get(handoffTarget.nodeId) ?? null;
    const liveTarget = nodeElement
      ? resolveGpuNodeTargetDescriptor(nodeElement, handoffTarget.descriptor)
      : null;
    return isGpuNodeResizeHandleEventTarget(liveTarget) ? liveTarget : null;
  }

  function activateResizeHandleHoverNode(
    nodeId: string,
    eventTarget: EventTarget | null,
  ) {
    beginResizeHandleHoverInteraction(nodeId, eventTarget);
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
    const sourceRect = resolveEventTargetSourceRect(nodeId, eventTarget);
    if (kind === "scroll" && markActiveScrollTargetDirty(nodeId, sourceRect)) {
      return;
    }
    if (shouldBeginEventTargetInteraction({ interactiveTarget, priority })) {
      beginInteractiveNode(nodeId, dirtyReasonForKind(kind), sourceRect);
      return;
    }
    markDirty({
      nodeId,
      priority,
      reason: dirtyReasonForKind(kind),
      ...(sourceRect ? { sourceRect } : {}),
    });
  }

  function markActiveScrollTargetDirty(
    nodeId: string,
    sourceRect: MarkInteractionDirtyInput["sourceRect"],
  ): boolean {
    if (activeNodeId !== nodeId) {
      return false;
    }
    const keepLiveForFocus = hasPersistentFocusForNode(nodeId);
    if (keepLiveForFocus) {
      setState({ releaseAfterUploadNodeId: null });
    }
    markDirty({
      nodeId,
      priority: "interactive",
      reason: "scroll",
      ...(sourceRect ? { sourceRect } : {}),
    });
    if (!keepLiveForFocus) {
      releaseActiveNodeAfterUpload(nodeId);
    }
    return true;
  }

  function markCustomDirtyEvent(
    eventTarget: EventTarget | null,
    detail: {
      readonly animated?: boolean | undefined;
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
    if (detail.animated) {
      beginAnimationCaptureLease(nodeId, eventTarget, reason);
      return;
    }
    const sourceRect = resolveEventTargetSourceRect(nodeId, eventTarget);
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
      beginInteractiveNode(nodeId, reason, sourceRect);
      return;
    }
    markDirty({
      nodeId,
      priority,
      reason,
      ...(sourceRect ? { sourceRect } : {}),
    });
  }

  function beginAnimationCaptureLease(
    nodeId: string,
    eventTarget: EventTarget | null,
    reason: DirtyNodeReason = "animation",
  ) {
    animationCaptureLeases.begin({
      reason,
      surfaceId: nodeId,
      target: toElement(eventTarget),
    });
  }

  function settleAnimationCaptureLease(eventTarget: EventTarget | null) {
    const nodeId = findGpuNodeIdForEventTarget(eventTarget, elementByNodeId());
    if (!nodeId) {
      return;
    }
    animationCaptureLeases.settle({
      surfaceId: nodeId,
      target: toElement(eventTarget),
    });
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
      releaseActiveNode("focus");
    }
  }

  function releaseActiveNode(
    reason: DirtyNodeReason,
    sourceRect?: MarkInteractionDirtyInput["sourceRect"] | undefined,
  ) {
    if (!activeNodeId) {
      return;
    }
    const nodeId = activeNodeId;
    markDirty({
      nodeId,
      priority: "interactive",
      reason,
      ...(sourceRect ? { sourceRect } : {}),
    });
    releaseActiveNodeAfterUpload(nodeId);
  }

  function resolveEventTargetSourceRect(
    nodeId: string,
    eventTarget: EventTarget | Node | null | undefined,
  ): MarkInteractionDirtyInput["sourceRect"] | undefined {
    const sourceElement = elementByNodeId().get(nodeId) ?? null;
    return resolveElementSourceRect({
      sourceElement,
      target: toElement(eventTarget ?? null),
    });
  }

  function scheduleActiveNodeRelease(nodeId: string) {
    releaseActiveNodeAfterUpload(nodeId);
  }

  function releaseActiveNodeAfterUpload(nodeId: string) {
    if (activeNodeId !== nodeId) {
      return;
    }
    setState({ releaseAfterUploadNodeId: nodeId });
  }

  function sourceRectOption(
    sourceRect: MarkInteractionDirtyInput["sourceRect"] | undefined,
  ): Pick<MarkInteractionDirtyInput, "sourceRect"> | Record<string, never> {
    return sourceRect ? { sourceRect } : {};
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
        "transitionrun",
        (event) => {
          const nodeId = findGpuNodeIdForEventTarget(
            event.target,
            elementByNodeId(),
          );
          if (nodeId) {
            beginAnimationCaptureLease(nodeId, event.target);
          }
        },
        listenerOptions,
      );
      canvas.addEventListener(
        "transitionstart",
        (event) => {
          const nodeId = findGpuNodeIdForEventTarget(
            event.target,
            elementByNodeId(),
          );
          if (nodeId) {
            beginAnimationCaptureLease(nodeId, event.target);
          }
        },
        listenerOptions,
      );
      canvas.addEventListener(
        "animationstart",
        (event) => {
          const nodeId = findGpuNodeIdForEventTarget(
            event.target,
            elementByNodeId(),
          );
          if (nodeId) {
            beginAnimationCaptureLease(nodeId, event.target);
          }
        },
        listenerOptions,
      );
      canvas.addEventListener(
        "transitionend",
        (event) => settleAnimationCaptureLease(event.target),
        listenerOptions,
      );
      canvas.addEventListener(
        "transitioncancel",
        (event) => settleAnimationCaptureLease(event.target),
        listenerOptions,
      );
      canvas.addEventListener(
        "animationend",
        (event) => settleAnimationCaptureLease(event.target),
        listenerOptions,
      );
      canvas.addEventListener(
        "animationcancel",
        (event) => settleAnimationCaptureLease(event.target),
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
      canvas.addEventListener(
        "pointerdown",
        (event) => {
          if (dispatchingPointerHandoff) {
            return;
          }
          const nodeId = findGpuNodeIdForEventTarget(
            event.target,
            elementByNodeId(),
          );
          const passiveSourceTarget = isPassiveHtmlSurfaceSourceEventTarget(
            event.target,
          );
          if (
            nodeId &&
            !passiveSourceTarget &&
            isGpuNodeInteractiveEventTarget(event.target)
          ) {
            beginPointerInteraction(nodeId, event.target);
            return;
          }
          handOffPointerEvent(event);
        },
        listenerOptions,
      );
      ownerDocument.addEventListener(
        "pointermove",
        (event) => {
          markPointerInteractionDirty(event);
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
        clearTrustedPointerHandoffClickSuppression();
        animationCaptureLeases.destroy();
      };
    },
    clearNode(nodeId) {
      const nextActiveNodeId = activeNodeId === nodeId ? null : activeNodeId;
      const nextReleaseNodeId =
        releaseAfterUploadNodeId === nodeId ? null : releaseAfterUploadNodeId;
      if (pointerInteractionNodeId === nodeId) {
        pointerInteractionNodeId = null;
        pointerInteractionTarget = null;
      }
      if (hoverInteractionNodeId === nodeId) {
        hoverInteractionNodeId = null;
        hoverInteractionTarget = null;
      }
      if (focusedPersistentNodeId === nodeId) {
        focusedPersistentNodeId = null;
      }
      animationCaptureLeases.cancel(nodeId);
      clearPendingPointerHandoffForNode(nodeId);
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
        manager?.setSurfaceTexturePriority(activeNodeId, "visible");
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
  };

  function requestActiveReleaseWhenUnowned() {
    if (!activeNodeId || releaseAfterUploadNodeId) {
      return;
    }
    if (hasLiveActiveNodeOwner(activeNodeId)) {
      return;
    }
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
    return !result.uploadedNodeIds.includes(activeNodeId);
  }

  function hasLiveActiveNodeOwner(nodeId: string): boolean {
    return Boolean(
      pointerInteractionNodeId ||
        hoverInteractionNodeId ||
        animationCaptureLeases.hasActiveLease(nodeId) ||
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
