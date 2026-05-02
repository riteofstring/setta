import { isGpuNodeInteractiveEventTarget } from "./activeNodeTargeting";

import type { DirtyNodeReason, NodeTexturePriority } from "./dirtyTracking";

import {
  DirtyEventKind,
  GPU_FLOW_MOUSE_ACTIVATION_SELECTOR,
  NodeInteractionStatePatch,
  PendingPointerHandoffClick,
  WHEEL_LINE_DELTA_PX,
} from "./interactionTypes";

export function dispatchPointerHandoffEvent(
  target: HTMLElement,
  event: PointerEvent,
) {
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

export function dispatchPointerHandoffMouseEvent(
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

export function applyWheelScroll(
  target: HTMLElement,
  event: WheelEvent,
): boolean {
  const { deltaX, deltaY } = getWheelScrollDelta(target, event);
  const previousScrollLeft = target.scrollLeft;
  const previousScrollTop = target.scrollTop;
  if (deltaX !== 0) {
    target.scrollLeft = clampScrollOffset(
      previousScrollLeft + deltaX,
      target.scrollWidth - target.clientWidth,
    );
  }
  if (deltaY !== 0) {
    target.scrollTop = clampScrollOffset(
      previousScrollTop + deltaY,
      target.scrollHeight - target.clientHeight,
    );
  }
  return (
    target.scrollLeft !== previousScrollLeft ||
    target.scrollTop !== previousScrollTop
  );
}

export function getWheelScrollDelta(
  target: HTMLElement,
  event: Pick<WheelEvent, "deltaMode" | "deltaX" | "deltaY">,
): { readonly deltaX: number; readonly deltaY: number } {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return {
      deltaX: event.deltaX * WHEEL_LINE_DELTA_PX,
      deltaY: event.deltaY * WHEEL_LINE_DELTA_PX,
    };
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return {
      deltaX: event.deltaX * target.clientWidth,
      deltaY: event.deltaY * target.clientHeight,
    };
  }
  return {
    deltaX: event.deltaX,
    deltaY: event.deltaY,
  };
}

export function clampScrollOffset(value: number, maxValue: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), Math.max(0, maxValue));
}

export function shouldDispatchPointerHandoffMouseDown(
  target: HTMLElement,
): boolean {
  return Boolean(target.closest(GPU_FLOW_MOUSE_ACTIVATION_SELECTOR));
}

export function focusPointerHandoffTarget(target: HTMLElement) {
  if (isTextFocusTarget(target)) {
    target.focus({ preventScroll: true });
  }
}

export function getPendingPointerHandoffClick(
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

export function shouldDispatchPendingPointerHandoffClick(
  target: HTMLElement,
  event: PointerEvent,
): boolean {
  if (!target.isConnected) {
    return false;
  }
  return isMouseEventInsideElement(target, event);
}

export function shouldSuppressTrustedPointerHandoffClick(
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

export function isTrustedClickTargetForHandoffTarget(
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

export function isMouseEventInsideElement(
  element: HTMLElement,
  event: MouseEvent,
) {
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

export function isTextFocusTarget(target: HTMLElement): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && isTextInputType(target.type)) ||
    target.isContentEditable ||
    target.getAttribute("role") === "textbox" ||
    target.getAttribute("role") === "searchbox"
  );
}

export function isTextInputType(inputType: string): boolean {
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

export function isClickHandoffTarget(target: HTMLElement): boolean {
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

export function dirtyReasonForKind(kind: DirtyEventKind): DirtyNodeReason {
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

export function resolveEventDirtyPriority({
  activeNodeId,
  interactiveTarget,
  nodeId,
}: {
  readonly activeNodeId: string | null;
  readonly interactiveTarget: boolean;
  readonly nodeId: string;
}): NodeTexturePriority {
  return activeNodeId === nodeId || interactiveTarget
    ? "interactive"
    : "visible";
}

export function shouldBeginEventTargetInteraction({
  interactiveTarget,
  priority,
}: {
  readonly interactiveTarget: boolean;
  readonly priority: NodeTexturePriority;
}): boolean {
  return interactiveTarget && priority === "interactive";
}

export function normalizeDirtyEventPriority(
  priority: NodeTexturePriority | undefined,
): NodeTexturePriority | null {
  return priority === "interactive" ||
    priority === "visible" ||
    priority === "prefetch"
    ? priority
    : null;
}

export function resolveCustomDirtyEventPriority({
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

export function shouldBeginCustomDirtyInteraction(
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

export function resolveNullableStatePatchValue(
  patch: NodeInteractionStatePatch,
  key: keyof NodeInteractionStatePatch,
  currentValue: string | null,
): string | null {
  return Object.prototype.hasOwnProperty.call(patch, key)
    ? patch[key] ?? null
    : currentValue;
}

export function toElement(target: EventTarget | Node | null): Element | null {
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
