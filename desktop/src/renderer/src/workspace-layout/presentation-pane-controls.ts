import type { PaneRenderItem } from "./types";

export type PaneResizeAxis = "height" | "horizontal" | "vertical";
export type PaneChromeAction = "add-above" | "add-below" | "close" | "maximize" | "split-down";

interface PaneVisualRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

interface ResizeNeighborMeasurement {
  gap: number;
  item: PaneRenderItem;
}

const maximumResizeNeighborGapPx = 48;

export const paneChromeActions = [
  "split-down",
  "add-above",
  "add-below",
  "maximize",
  "close",
] satisfies PaneChromeAction[];

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

export function resizeNeighborItem(
  item: PaneRenderItem,
  assignedItems: ReadonlyArray<PaneRenderItem | undefined>,
  axis: PaneResizeAxis,
): PaneRenderItem | null {
  if (!canHostResizeHandle(item)) {
    return null;
  }
  const sourceRect = visualRectForItem(item);
  let best: ResizeNeighborMeasurement | null = null;
  for (const candidate of assignedItems) {
    const measurement = resizeNeighborMeasurement(item, sourceRect, candidate, axis);
    if (!measurement) {
      continue;
    }
    best = nearerResizeNeighbor(best, measurement);
  }
  return best?.item ?? null;
}

export function canHostResizeHandle(item: PaneRenderItem): boolean {
  return item.visible && item.presentationMode === "normal" && !item.maximized && !item.moving;
}

export function paneActionStateKey(item: PaneRenderItem): string {
  return [
    item.paneId,
    item.focused ? "1" : "0",
    item.maximized ? "1" : "0",
    item.presentationMode,
    item.visible ? "1" : "0",
  ].join("|");
}

export function paneResizeHandleStateKey(item: PaneRenderItem, assignedItemsKey: string): string {
  if (!canHostResizeHandle(item)) {
    return `${item.paneId}|disabled`;
  }
  return [
    item.paneId,
    item.x.toFixed(2),
    item.y.toFixed(2),
    item.width.toFixed(2),
    item.height.toFixed(2),
    item.scale.toFixed(3),
    assignedItemsKey,
  ].join("|");
}

export function paneControlsLayoutKey(items: ReadonlyArray<PaneRenderItem | undefined>): string {
  return items
    .map((item) =>
      item
        ? [
            item.paneId,
            item.visible ? "1" : "0",
            item.x.toFixed(2),
            item.y.toFixed(2),
            item.width.toFixed(2),
            item.height.toFixed(2),
            item.scale.toFixed(3),
          ].join(":")
        : "",
    )
    .join("|");
}

export function surfaceSyncItem(
  item: PaneRenderItem,
  assignedItems: ReadonlyArray<PaneRenderItem | undefined>,
): PaneRenderItem {
  if (
    item.surfaceKind !== "browser" ||
    item.runtimeState !== "live" ||
    !browserNativeViewOccluded(item, assignedItems)
  ) {
    return item;
  }
  return { ...item, runtimeState: "snapshot" };
}

export function positionResizeHandle(
  handle: HTMLElement,
  axis: PaneResizeAxis,
  sourceRect: PaneVisualRect,
  adjacentRect: PaneVisualRect,
): void {
  if (axis === "horizontal") {
    const gap = Math.max(0, adjacentRect.left - sourceRect.right);
    const overlapTop = Math.max(sourceRect.top, adjacentRect.top);
    const overlapBottom = Math.min(sourceRect.bottom, adjacentRect.bottom);
    syncStyleValue(
      handle.style,
      "height",
      `${Math.max(34, overlapBottom - overlapTop).toFixed(2)}px`,
    );
    syncStyleValue(handle.style, "left", `${(sourceRect.right + gap / 2).toFixed(2)}px`);
    syncStyleValue(handle.style, "top", `${((overlapTop + overlapBottom) / 2).toFixed(2)}px`);
    syncStyleValue(handle.style, "width", "20px");
    return;
  }
  const gap = Math.max(0, adjacentRect.top - sourceRect.bottom);
  const overlapLeft = Math.max(sourceRect.left, adjacentRect.left);
  const overlapRight = Math.min(sourceRect.right, adjacentRect.right);
  syncStyleValue(handle.style, "height", "20px");
  syncStyleValue(handle.style, "left", `${((overlapLeft + overlapRight) / 2).toFixed(2)}px`);
  syncStyleValue(handle.style, "top", `${(sourceRect.bottom + gap / 2).toFixed(2)}px`);
  syncStyleValue(
    handle.style,
    "width",
    `${Math.min(84, Math.max(42, overlapRight - overlapLeft - 20)).toFixed(2)}px`,
  );
}

export function positionHeightResizeHandle(handle: HTMLElement, sourceRect: PaneVisualRect): void {
  syncStyleValue(handle.style, "height", "20px");
  syncStyleValue(
    handle.style,
    "left",
    `${((sourceRect.left + sourceRect.right) / 2).toFixed(2)}px`,
  );
  syncStyleValue(handle.style, "top", `${sourceRect.bottom.toFixed(2)}px`);
  syncStyleValue(handle.style, "width", `${Math.max(42, rectWidth(sourceRect)).toFixed(2)}px`);
}

export function visualRectForItem(item: PaneRenderItem): PaneVisualRect {
  return {
    bottom: item.y + item.height * item.scale,
    left: item.x,
    right: item.x + item.width * item.scale,
    top: item.y,
  };
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return "n/a";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KiB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)}MiB`;
}

export function formatPixels(pixels: number | null): string {
  if (pixels === null) {
    return "n/a";
  }
  if (pixels < 1000 * 1000) {
    return `${Math.round(pixels / 1000)}Kpx`;
  }
  return `${(pixels / 1000 / 1000).toFixed(1)}Mpx`;
}

function assertNever(value: never): never {
  throw new Error(`unhandled pane chrome action: ${String(value)}`);
}

function resizeNeighborMeasurement(
  item: PaneRenderItem,
  sourceRect: PaneVisualRect,
  candidate: PaneRenderItem | undefined,
  axis: PaneResizeAxis,
): ResizeNeighborMeasurement | null {
  if (!candidate || candidate.paneId === item.paneId || !canHostResizeHandle(candidate)) {
    return null;
  }
  const candidateRect = visualRectForItem(candidate);
  const gap = resizeNeighborGap(sourceRect, candidateRect, axis);
  if (gap < -1 || gap > maximumResizeNeighborGapPx) {
    return null;
  }
  return resizeNeighborHasOverlap(sourceRect, candidateRect, axis)
    ? { gap, item: candidate }
    : null;
}

function nearerResizeNeighbor(
  current: ResizeNeighborMeasurement | null,
  candidate: ResizeNeighborMeasurement,
): ResizeNeighborMeasurement {
  return !current || candidate.gap < current.gap ? candidate : current;
}

function browserNativeViewOccluded(
  item: PaneRenderItem,
  assignedItems: ReadonlyArray<PaneRenderItem | undefined>,
): boolean {
  if (!item.visible || item.opacity <= 0) {
    return false;
  }
  const rect = visualRectForItem(item);
  return assignedItems.some((candidate) => {
    if (!candidate || candidate.paneId === item.paneId || !candidate.visible) {
      return false;
    }
    if (candidate.opacity <= 0 || candidate.z <= item.z) {
      return false;
    }
    return rectsOverlap(rect, visualRectForItem(candidate));
  });
}

function rectsOverlap(left: PaneVisualRect, right: PaneVisualRect): boolean {
  return (
    overlapSize(left.left, left.right, right.left, right.right) > 0 &&
    overlapSize(left.top, left.bottom, right.top, right.bottom) > 0
  );
}

function resizeNeighborGap(
  sourceRect: PaneVisualRect,
  candidateRect: PaneVisualRect,
  axis: PaneResizeAxis,
): number {
  return axis === "horizontal"
    ? candidateRect.left - sourceRect.right
    : candidateRect.top - sourceRect.bottom;
}

function resizeNeighborHasOverlap(
  sourceRect: PaneVisualRect,
  candidateRect: PaneVisualRect,
  axis: PaneResizeAxis,
): boolean {
  const overlap =
    axis === "horizontal"
      ? overlapSize(sourceRect.top, sourceRect.bottom, candidateRect.top, candidateRect.bottom)
      : overlapSize(sourceRect.left, sourceRect.right, candidateRect.left, candidateRect.right);
  const sourceSize = axis === "horizontal" ? rectHeight(sourceRect) : rectWidth(sourceRect);
  const candidateSize =
    axis === "horizontal" ? rectHeight(candidateRect) : rectWidth(candidateRect);
  return overlap >= Math.min(sourceSize, candidateSize) * 0.25 && overlap >= 18;
}

function syncStyleValue(
  style: CSSStyleDeclaration,
  property: "height" | "left" | "top" | "width",
  value: string,
): void {
  if (style[property] !== value) {
    style[property] = value;
  }
}

function overlapSize(
  firstStart: number,
  firstEnd: number,
  secondStart: number,
  secondEnd: number,
): number {
  return Math.max(0, Math.min(firstEnd, secondEnd) - Math.max(firstStart, secondStart));
}

function rectHeight(rect: PaneVisualRect): number {
  return rect.bottom - rect.top;
}

function rectWidth(rect: PaneVisualRect): number {
  return rect.right - rect.left;
}
