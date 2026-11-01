import {
  MANUAL_WHEEL_CLASS_NAME,
  NATIVE_HORIZONTAL_WHEEL_CLASS_NAME,
  NATIVE_VERTICAL_WHEEL_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "../interaction.js";
import type { WorkspaceHost } from "../workspaceHost.js";
import { isWorkspaceHostElement } from "../workspaceHostInternals.js";
import type { PanOnScrollMode } from "./types.js";
import { getWheelDelta, isMacOs } from "./utils.js";

type PanOnScrollDelta = {
  deltaX: number;
  deltaY: number;
};

type WheelTargetDisposition = "canvas" | "manual" | "native";

const WORKSPACE_WINDOW_MANAGER_OVERLAY_WINDOW_SELECTOR =
  "article.setta-workspace-window-manager-window[data-workspace-window-id]";
const WORKSPACE_WINDOW_MANAGER_SELECTOR =
  '[data-workspace-window-manager="true"]';

export const wheelDelta = (event: WheelEvent) => {
  const factor = event.ctrlKey && isMacOs() ? 10 : 1;

  return getWheelDelta(event, factor);
};

const isWrappedWithClass = (event: Event, className?: string): boolean => {
  if (!className) {
    return false;
  }
  const target = event.target;
  if (!(target instanceof Element)) {
    return false;
  }
  return target.closest(`.${className}`) !== null;
};

export function isPinchZoomWheelEvent({
  event,
  zoomOnPinch,
  isMacOS,
}: {
  event: Pick<WheelEvent, "ctrlKey">;
  zoomOnPinch: boolean;
  isMacOS: boolean;
}): boolean {
  return event.ctrlKey && zoomOnPinch && isMacOS;
}

function isNativeVerticalWheelEvent(
  event: WheelEvent,
  isMacOS: boolean,
): boolean {
  return (
    isWrappedWithClass(event, NATIVE_VERTICAL_WHEEL_CLASS_NAME) &&
    (isMacOS || !event.shiftKey) &&
    Math.abs(event.deltaY) >= Math.abs(event.deltaX)
  );
}

function isNativeHorizontalWheelEvent(
  event: WheelEvent,
  isMacOS: boolean,
): boolean {
  return (
    isWrappedWithClass(event, NATIVE_HORIZONTAL_WHEEL_CLASS_NAME) &&
    ((!isMacOS && event.shiftKey) ||
      Math.abs(event.deltaX) > Math.abs(event.deltaY))
  );
}

export function resolvePanOnScrollDelta({
  event,
  isMacOS,
  panOnScrollMode,
}: {
  event: WheelEvent;
  isMacOS: boolean;
  panOnScrollMode: PanOnScrollMode;
}): PanOnScrollDelta {
  const deltaNormalize = event.deltaMode === 1 ? 20 : 1;
  let deltaX =
    panOnScrollMode === "vertical" ? 0 : event.deltaX * deltaNormalize;
  let deltaY =
    panOnScrollMode === "horizontal" ? 0 : event.deltaY * deltaNormalize;

  if (!isMacOS && event.shiftKey && panOnScrollMode !== "vertical") {
    deltaX = event.deltaY * deltaNormalize;
    deltaY = 0;
  }

  return { deltaX, deltaY };
}

export function resolveWheelTargetDisposition({
  event,
  isMacOS,
  isPanScrolling,
  zoomActivationKeyPressed,
  zoomOnPinch,
}: {
  event: WheelEvent;
  isMacOS: boolean;
  isPanScrolling: boolean;
  zoomActivationKeyPressed: boolean;
  zoomOnPinch: boolean;
}): WheelTargetDisposition {
  if (
    zoomActivationKeyPressed ||
    isPinchZoomWheelEvent({ event, zoomOnPinch, isMacOS })
  ) {
    return "canvas";
  }
  if (isWrappedWithClass(event, MANUAL_WHEEL_CLASS_NAME)) {
    return "manual";
  }
  if (isPanScrolling) {
    return "canvas";
  }
  return isWrappedWithClass(event, NO_WHEEL_CLASS_NAME) ||
    isNativeVerticalWheelEvent(event, isMacOS) ||
    isNativeHorizontalWheelEvent(event, isMacOS)
    ? "native"
    : "canvas";
}

export function isWorkspaceWindowOverlayWheelEvent(
  host: WorkspaceHost,
  event: WheelEvent,
): boolean {
  const target = event.target;
  if (!(target instanceof Element) || !isWorkspaceHostElement(host, target)) {
    return false;
  }
  const window = target.closest(
    WORKSPACE_WINDOW_MANAGER_OVERLAY_WINDOW_SELECTOR,
  );
  return (
    window !== null &&
    window.closest(WORKSPACE_WINDOW_MANAGER_SELECTOR) !== null
  );
}
