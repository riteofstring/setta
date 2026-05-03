import {
  isGpuNodeInteractiveEventTarget,
  resolveGpuNodeTargetDescriptor,
  type GpuNodePointerHandoffTarget,
} from "../activeNodeTargeting";
import { isPassiveHtmlSurfaceSourceEventTarget } from "../htmlSurfaces/sourceDom";
import type { GpuNodePointerHandoffResolveOptions } from "./interactionTypes";
import { toElement } from "./pointerHandoff";

export function updateGpuPointerHoverCursor({
  elementByNodeId,
  event,
  resolvePointerHandoffTarget,
  setHoverCursor,
  surfaceElement,
}: {
  readonly elementByNodeId: () => ReadonlyMap<string, HTMLElement>;
  readonly event: PointerEvent;
  readonly resolvePointerHandoffTarget?:
    | ((
        event: PointerEvent,
        options?: GpuNodePointerHandoffResolveOptions | undefined,
      ) => GpuNodePointerHandoffTarget | null)
    | undefined;
  readonly setHoverCursor: (cursor: string | null) => void;
  readonly surfaceElement: HTMLElement;
}): GpuNodePointerHandoffTarget | null | undefined {
  if (!shouldUsePointerHoverCursor(event, surfaceElement)) {
    setHoverCursor(null);
    return undefined;
  }

  const handoffTarget =
    resolvePointerHandoffTarget?.(event, {
      projectSource: false,
    }) ?? null;
  const target = resolvePointerHoverCursorTarget({
    elementByNodeId,
    event,
    handoffTarget,
  });
  setHoverCursor(resolvePointerHoverCursorValue(target));
  return handoffTarget;
}

function resolvePointerHoverCursorTarget({
  elementByNodeId,
  event,
  handoffTarget,
}: {
  readonly elementByNodeId: () => ReadonlyMap<string, HTMLElement>;
  readonly event: PointerEvent;
  readonly handoffTarget: GpuNodePointerHandoffTarget | null | undefined;
}): HTMLElement | null {
  const directTarget = resolveDirectPointerHoverCursorTarget(event.target);
  if (directTarget) {
    return directTarget;
  }
  if (!handoffTarget) {
    return null;
  }
  const nodeElement = elementByNodeId().get(handoffTarget.nodeId) ?? null;
  return nodeElement
    ? resolveGpuNodeTargetDescriptor(nodeElement, handoffTarget.descriptor)
    : null;
}

function resolveDirectPointerHoverCursorTarget(
  target: EventTarget | null,
): HTMLElement | null {
  if (isPassiveHtmlSurfaceSourceEventTarget(target)) {
    return null;
  }
  if (!isGpuNodeInteractiveEventTarget(target)) {
    return null;
  }
  return toElement(target);
}

function resolvePointerHoverCursorValue(
  target: HTMLElement | null,
): string | null {
  if (!target) {
    return null;
  }
  const cursor =
    target.ownerDocument.defaultView?.getComputedStyle(target).cursor;
  if (cursor && cursor !== "auto") {
    return cursor;
  }
  return isNativeTextCursorTarget(target) ? "text" : null;
}

function shouldUsePointerHoverCursor(
  event: PointerEvent,
  surfaceElement: HTMLElement,
): boolean {
  if (event.buttons !== 0) {
    return false;
  }
  const target = toElement(event.target);
  return Boolean(target && surfaceElement.contains(target));
}

function isNativeTextCursorTarget(target: HTMLElement): boolean {
  if (target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target instanceof HTMLInputElement) {
    return isTextLikeInputType(target.type);
  }
  return target.isContentEditable;
}

function isTextLikeInputType(type: string): boolean {
  return ![
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
  ].includes(type);
}
