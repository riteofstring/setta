import type { Position, Viewport } from "../document/types";

export type WorkspaceMenuClientPoint = {
  x: number;
  y: number;
};

type RectLike = {
  left: number;
  right: number;
  top: number;
  width: number;
  height: number;
};

type MenuPlacementInput = {
  invocation: WorkspaceMenuClientPoint;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  topBoundary?: number;
};

function assertFiniteCoordinate(role: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`Workspace menu ${role} must be finite.`);
  }
}

export function placeWorkspaceMenu({
  invocation,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  topBoundary = 0,
}: MenuPlacementInput): WorkspaceMenuClientPoint {
  for (const [role, value] of Object.entries({
    "invocation x": invocation.x,
    "invocation y": invocation.y,
    width: menuWidth,
    height: menuHeight,
    "viewport width": viewportWidth,
    "viewport height": viewportHeight,
    "top boundary": topBoundary,
  })) {
    assertFiniteCoordinate(role, value);
  }
  if (menuWidth <= 0 || menuHeight <= 0) {
    throw new Error("Workspace menu measured size must be positive.");
  }
  if (viewportWidth <= 0 || viewportHeight <= topBoundary) {
    throw new Error(
      "Workspace menu viewport must contain a positive placement area.",
    );
  }

  const openingLeft =
    invocation.x + menuWidth > viewportWidth
      ? invocation.x - menuWidth
      : invocation.x;
  const openingTop =
    invocation.y + menuHeight > viewportHeight
      ? invocation.y - menuHeight
      : invocation.y;
  return {
    x: Math.min(
      Math.max(0, openingLeft),
      Math.max(0, viewportWidth - menuWidth),
    ),
    y: Math.min(
      Math.max(topBoundary, openingTop),
      Math.max(topBoundary, viewportHeight - menuHeight),
    ),
  };
}

export function getKeyboardWorkspaceMenuPoint(
  rect: RectLike,
  direction: "ltr" | "rtl",
): WorkspaceMenuClientPoint {
  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error(
      "Workspace menu keyboard owner must have positive geometry.",
    );
  }
  const inlineInset = Math.min(12, rect.width / 2);
  const blockInset = Math.min(24, rect.height / 2);
  return {
    x: direction === "rtl" ? rect.right - inlineInset : rect.left + inlineInset,
    y: rect.top + blockInset,
  };
}

export function clientPointToWorkspacePosition(
  point: WorkspaceMenuClientPoint,
  canvasRect: Pick<DOMRect, "left" | "top">,
  viewport: Viewport,
): Position {
  if (!Number.isFinite(viewport.zoom) || viewport.zoom <= 0) {
    throw new Error(
      "Workspace menu cannot convert a point with a non-positive viewport zoom.",
    );
  }
  for (const [role, value] of Object.entries({
    "client x": point.x,
    "client y": point.y,
    "canvas left": canvasRect.left,
    "canvas top": canvasRect.top,
    "viewport x": viewport.x,
    "viewport y": viewport.y,
  })) {
    assertFiniteCoordinate(role, value);
  }
  return {
    x: (point.x - canvasRect.left - viewport.x) / viewport.zoom,
    y: (point.y - canvasRect.top - viewport.y) / viewport.zoom,
  };
}
