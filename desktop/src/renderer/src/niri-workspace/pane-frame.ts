import type { PaneId, Rect } from "./types";

export function activeMaximizedPaneIdFor({
  focusedPaneId,
  maximizedPaneId,
}: {
  focusedPaneId: PaneId;
  maximizedPaneId: PaneId | null;
}): PaneId | null {
  if (maximizedPaneId !== focusedPaneId) {
    return null;
  }
  return maximizedPaneId;
}

export function paneFrame({
  activeMaximizedPaneId,
  columnWidth,
  focused,
  height,
  maximizedViewport,
  padding,
  paneId,
  x,
  y,
}: {
  activeMaximizedPaneId: PaneId | null;
  columnWidth: number;
  focused: boolean;
  height: number;
  maximizedViewport: Rect | null;
  padding: number;
  paneId: PaneId;
  x: number;
  y: number;
}): {
  height: number;
  maximized: boolean;
  width: number;
  x: number;
  y: number;
  z: number;
} {
  if (paneId !== activeMaximizedPaneId || !maximizedViewport) {
    return {
      height,
      maximized: false,
      width: columnWidth,
      x,
      y,
      z: focused ? 2 : 1,
    };
  }
  return {
    height: Math.max(1, maximizedViewport.height - padding * 2),
    maximized: true,
    width: Math.max(1, maximizedViewport.width - padding * 2),
    x: padding,
    y: padding,
    z: 20,
  };
}
