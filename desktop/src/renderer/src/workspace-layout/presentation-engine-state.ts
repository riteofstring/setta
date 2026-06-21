import type { WorkspacePane, PaneRenderItem } from "./types";

export type PaneResizeAxis = "horizontal" | "vertical";
export type PaneChromeAction = "add-above" | "add-below" | "close" | "maximize" | "split-down";

export interface HostFrameState {
  height: number | null;
  opacity: number | null;
  pointerEvents: "auto" | "none" | null;
  transform: string | null;
  width: number | null;
  z: number | null;
}

export interface PaneIdentityState {
  paneId: string;
  tone: WorkspacePane["tone"] | "";
}

export interface PaneChromeState {
  focused: boolean;
  maximized: boolean;
  moving: boolean;
  presentationMode: PaneRenderItem["presentationMode"] | "";
  runtimeState: PaneRenderItem["runtimeState"] | "";
  visible: boolean;
}

export interface PaneActionButtonState {
  label: string;
  paneId: string;
  visible: boolean;
}

export interface ResizeHandleState {
  adjacentPaneId: string;
  height: string;
  label: string;
  left: string;
  paneId: string;
  top: string;
  width: string;
}

export interface PaneVisualRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export const paneChromeActions = [
  "split-down",
  "add-above",
  "add-below",
  "maximize",
  "close",
] satisfies PaneChromeAction[];

export function emptyHostFrameState(): HostFrameState {
  return {
    height: null,
    opacity: null,
    pointerEvents: null,
    transform: null,
    width: null,
    z: null,
  };
}

export function hostFrameStateForItem(item: PaneRenderItem): HostFrameState {
  return {
    height: item.height,
    opacity: item.opacity,
    pointerEvents: item.visible ? "auto" : "none",
    transform: `translate3d(${item.x.toFixed(2)}px, ${item.y.toFixed(2)}px, 0) scale(${item.scale.toFixed(3)})`,
    width: item.width,
    z: item.z,
  };
}

export function hiddenHostFrameState(): HostFrameState {
  return {
    ...emptyHostFrameState(),
    opacity: 0,
    pointerEvents: "none",
  };
}

export function emptyPaneIdentityState(): PaneIdentityState {
  return {
    paneId: "",
    tone: "",
  };
}

export function hiddenPaneChromeState(): PaneChromeState {
  return {
    focused: false,
    maximized: false,
    moving: false,
    presentationMode: "",
    runtimeState: "hidden",
    visible: false,
  };
}

export function paneChromeStateForItem(item: PaneRenderItem): PaneChromeState {
  return {
    focused: item.focused,
    maximized: item.maximized,
    moving: item.moving,
    presentationMode: item.presentationMode,
    runtimeState: item.runtimeState,
    visible: item.visible,
  };
}

export function samePaneIdentityState(
  current: PaneIdentityState | null,
  next: PaneIdentityState,
): boolean {
  return current?.paneId === next.paneId && current.tone === next.tone;
}

export function samePaneChromeState(
  current: PaneChromeState | null,
  next: PaneChromeState,
): boolean {
  return (
    current?.focused === next.focused &&
    current.maximized === next.maximized &&
    current.moving === next.moving &&
    current.presentationMode === next.presentationMode &&
    current.runtimeState === next.runtimeState &&
    current.visible === next.visible
  );
}

export function samePaneActionButtonState(
  current: PaneActionButtonState | null,
  next: PaneActionButtonState,
): boolean {
  return (
    current?.label === next.label &&
    current.paneId === next.paneId &&
    current.visible === next.visible
  );
}

export function sameResizeHandleState(
  current: ResizeHandleState | null,
  next: ResizeHandleState,
): boolean {
  return (
    current?.adjacentPaneId === next.adjacentPaneId &&
    current.height === next.height &&
    current.label === next.label &&
    current.left === next.left &&
    current.paneId === next.paneId &&
    current.top === next.top &&
    current.width === next.width
  );
}

export function paneChromeActionVisible(action: PaneChromeAction, item: PaneRenderItem): boolean {
  if (action === "close" || action === "maximize") {
    return item.visible;
  }
  if (!item.focused || item.presentationMode !== "normal") {
    return false;
  }
  return !item.maximized;
}

export function paneActionButtonLabel(action: PaneChromeAction, item: PaneRenderItem): string {
  switch (action) {
    case "add-above":
      return "Add pane above";
    case "add-below":
      return "Add pane below";
    case "close":
      return "Close pane";
    case "maximize":
      return item.maximized ? "Restore pane size" : "Maximize pane";
    case "split-down":
      return "Split pane down";
    default:
      return assertNever(action);
  }
}

export function paneActionButtonClassName(action: PaneChromeAction): string {
  const className = `workspace-pane-action-button workspace-pane-action-${action} app-no-drag`;
  return action === "maximize" ? `${className} workspace-pane-maximize-button` : className;
}

export function resizeHandleStateForItems(
  item: PaneRenderItem,
  adjacentItem: PaneRenderItem,
  axis: PaneResizeAxis,
  label: string,
): ResizeHandleState {
  const sourceRect = visualRectForItem(item);
  const adjacentRect = visualRectForItem(adjacentItem);
  if (axis === "horizontal") {
    const gap = Math.max(0, adjacentRect.left - sourceRect.right);
    const overlapTop = Math.max(sourceRect.top, adjacentRect.top);
    const overlapBottom = Math.min(sourceRect.bottom, adjacentRect.bottom);
    return {
      adjacentPaneId: adjacentItem.paneId,
      height: `${Math.min(72, Math.max(34, overlapBottom - overlapTop - 20)).toFixed(2)}px`,
      label,
      left: `${(sourceRect.right + gap / 2).toFixed(2)}px`,
      paneId: item.paneId,
      top: `${((overlapTop + overlapBottom) / 2).toFixed(2)}px`,
      width: "20px",
    };
  }
  const gap = Math.max(0, adjacentRect.top - sourceRect.bottom);
  const overlapLeft = Math.max(sourceRect.left, adjacentRect.left);
  const overlapRight = Math.min(sourceRect.right, adjacentRect.right);
  return {
    adjacentPaneId: adjacentItem.paneId,
    height: "20px",
    label,
    left: `${((overlapLeft + overlapRight) / 2).toFixed(2)}px`,
    paneId: item.paneId,
    top: `${(sourceRect.bottom + gap / 2).toFixed(2)}px`,
    width: `${Math.min(84, Math.max(42, overlapRight - overlapLeft - 20)).toFixed(2)}px`,
  };
}

export function positionResizeHandle(handle: HTMLElement, state: ResizeHandleState): void {
  syncStyleValue(handle.style, "height", state.height);
  syncStyleValue(handle.style, "left", state.left);
  syncStyleValue(handle.style, "top", state.top);
  syncStyleValue(handle.style, "width", state.width);
}

type SyncedStyleProperty = "display" | "height" | "left" | "top" | "width";

export function syncDatasetValue(element: HTMLElement, key: string, value: string): void {
  if (element.dataset[key] !== value) {
    element.dataset[key] = value;
  }
}

export function syncAttributeValue(element: HTMLElement, name: string, value: string): void {
  if (element.getAttribute(name) !== value) {
    element.setAttribute(name, value);
  }
}

export function syncElementProperty<ElementType extends HTMLElement, Key extends keyof ElementType>(
  element: ElementType,
  key: Key,
  value: ElementType[Key],
): void {
  if (element[key] !== value) {
    element[key] = value;
  }
}

export function syncStyleValue(
  style: CSSStyleDeclaration,
  property: SyncedStyleProperty,
  value: string,
): void {
  if (style[property] !== value) {
    style[property] = value;
  }
}

export function visualRectForItem(item: PaneRenderItem): PaneVisualRect {
  return {
    bottom: item.y + item.height * item.scale,
    left: item.x,
    right: item.x + item.width * item.scale,
    top: item.y,
  };
}

export function overlapSize(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): number {
  return Math.max(0, Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart));
}

export function rectHeight(rect: PaneVisualRect): number {
  return rect.bottom - rect.top;
}

export function rectWidth(rect: PaneVisualRect): number {
  return rect.right - rect.left;
}

function assertNever(value: never): never {
  throw new Error(`unhandled pane chrome action: ${String(value)}`);
}
