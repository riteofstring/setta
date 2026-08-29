import { type PointerEvent } from "react";
import type { WorkspaceHost } from "../workspaceHost";
import { isWorkspaceHostElement } from "../workspaceHostInternals";
import {
  buildWorkspaceFloatingSnapBounds,
  resolveWorkspaceFloatingSnapPresetFromPointer,
  type WorkspaceFloatingSnapResizeSeam,
} from "./windowingSnapLayout";
import {
  clampWorkspaceFloatingWindowBounds,
  moveWorkspaceFloatingWindow,
  resizeWorkspaceFloatingWindow,
  snapWorkspaceFloatingWindow,
  WORKSPACE_FLOATING_WINDOW_MIN_HEIGHT_PX,
  WORKSPACE_FLOATING_WINDOW_MIN_WIDTH_PX,
  WORKSPACE_FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX,
  WORKSPACE_FLOATING_WINDOW_UNSNAP_DRAG_THRESHOLD_PX,
} from "./windowingState";
import {
  isWorkspaceWindowVisible,
  type WorkspaceFloatingWindow,
  type WorkspaceFloatingSnapPreset,
  type WorkspaceWindowBounds,
  type WorkspaceWindowingMutationOptions,
  type WorkspaceWindowingState,
  type WorkspaceWindowViewport,
} from "./windowingTypes";

export const WORKSPACE_WINDOW_FREE_RESIZE_DIRECTIONS = [
  "top",
  "bottom",
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right",
] as const;

export type WorkspaceFreeResizeDirection =
  (typeof WORKSPACE_WINDOW_FREE_RESIZE_DIRECTIONS)[number];
type WorkspaceWindowLocalPointer = { x: number; y: number };
export type WorkspaceWindowSnapPreview = {
  windowId: string;
  preset: WorkspaceFloatingSnapPreset;
  bounds: WorkspaceWindowBounds;
};
type WorkspaceWindowShortcut =
  | { type: "toggle_maximize" }
  | { type: "minimize" }
  | { type: "snap"; preset: WorkspaceFloatingSnapPreset };
export type WorkspaceWindowDragSession = {
  pointerId: number;
  windowId: string;
  startPointer: WorkspaceWindowLocalPointer;
  startBounds: WorkspaceWindowBounds;
  dragBoundsStart: WorkspaceWindowBounds;
  lastBounds: WorkspaceWindowBounds;
  restoreBoundsOnUnsnap: WorkspaceWindowBounds | null;
  startedSnapped: boolean;
  hasActivatedUnsnap: boolean;
};
export type WorkspaceWindowFreeResizeSession = {
  pointerId: number;
  windowId: string;
  direction: WorkspaceFreeResizeDirection;
  startPointer: WorkspaceWindowLocalPointer;
  startBounds: WorkspaceWindowBounds;
  lastBounds: WorkspaceWindowBounds;
};
export type WorkspaceWindowSnapResizeSession = {
  pointerId: number;
  seam: WorkspaceFloatingSnapResizeSeam;
  startPointerPosition: number;
  startBoundsByWindowId: Readonly<Record<string, WorkspaceWindowBounds>>;
  minimumCoordinate: number;
  maximumCoordinate: number;
  lastBoundsByWindowId: Readonly<Record<string, WorkspaceWindowBounds>>;
};

type WorkspaceWindowShortcutDefinition = {
  readonly code: string;
  readonly alt: boolean;
  readonly shift: boolean;
  readonly shortcut: WorkspaceWindowShortcut;
};

function createWorkspaceWindowSnapShortcut(
  code: string,
  preset: WorkspaceFloatingSnapPreset,
  shift: boolean,
): WorkspaceWindowShortcutDefinition {
  return { alt: true, code, shift, shortcut: { preset, type: "snap" } };
}

const WORKSPACE_WINDOW_SHORTCUT_DEFINITIONS: readonly WorkspaceWindowShortcutDefinition[] =
  [
    {
      alt: false,
      code: "Enter",
      shift: true,
      shortcut: { type: "toggle_maximize" },
    },
    { alt: false, code: "KeyM", shift: true, shortcut: { type: "minimize" } },
    createWorkspaceWindowSnapShortcut("ArrowDown", "bottom", false),
    createWorkspaceWindowSnapShortcut("ArrowLeft", "left", false),
    createWorkspaceWindowSnapShortcut("ArrowRight", "right", false),
    createWorkspaceWindowSnapShortcut("ArrowUp", "top", false),
    createWorkspaceWindowSnapShortcut("KeyA", "bottom_left", true),
    createWorkspaceWindowSnapShortcut("KeyQ", "top_left", true),
    createWorkspaceWindowSnapShortcut("KeyS", "bottom_right", true),
    createWorkspaceWindowSnapShortcut("KeyW", "top_right", true),
  ];

export function clampWorkspaceWindowNumber(
  value: number,
  minimum: number,
  maximum: number,
): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function getWorkspaceWindowLocalPointer(
  event: Pick<PointerEvent<HTMLElement>, "clientX" | "clientY">,
  root: HTMLElement,
): WorkspaceWindowLocalPointer {
  const bounds = root.getBoundingClientRect();
  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

export function captureWorkspaceWindowPointer(
  element: HTMLElement,
  pointerId: number,
): void {
  if (typeof element.setPointerCapture === "function") {
    element.setPointerCapture(pointerId);
  }
}

export function releaseWorkspaceWindowPointer(
  element: HTMLElement,
  pointerId: number,
): void {
  if (
    typeof element.hasPointerCapture === "function" &&
    element.hasPointerCapture(pointerId)
  ) {
    element.releasePointerCapture(pointerId);
  }
}

export function positionWorkspaceWindowUnsnapBounds(
  current: WorkspaceWindowBounds,
  restore: WorkspaceWindowBounds,
  pointer: WorkspaceWindowLocalPointer,
  viewport: WorkspaceWindowViewport,
): WorkspaceWindowBounds {
  const offsetFraction = clampWorkspaceWindowNumber(
    (pointer.x - current.x) / Math.max(1, current.width),
    0.15,
    0.85,
  );
  const offsetY = clampWorkspaceWindowNumber(
    pointer.y - current.y,
    8,
    WORKSPACE_FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX - 8,
  );
  return clampWorkspaceFloatingWindowBounds(
    {
      ...restore,
      x: pointer.x - restore.width * offsetFraction,
      y: pointer.y - offsetY,
    },
    viewport,
  );
}

export function getWorkspaceWindowFreeResizeBounds(
  start: WorkspaceWindowBounds,
  direction: WorkspaceFreeResizeDirection,
  delta: WorkspaceWindowLocalPointer,
  viewport: WorkspaceWindowViewport,
): WorkspaceWindowBounds {
  let { height, width, x, y } = start;
  if (direction.includes("left")) {
    width = Math.max(WORKSPACE_FLOATING_WINDOW_MIN_WIDTH_PX, width - delta.x);
    x = start.x + start.width - width;
  } else if (direction.includes("right")) {
    width = Math.max(WORKSPACE_FLOATING_WINDOW_MIN_WIDTH_PX, width + delta.x);
  }
  if (direction.includes("top")) {
    height = Math.max(
      WORKSPACE_FLOATING_WINDOW_MIN_HEIGHT_PX,
      height - delta.y,
    );
    y = start.y + start.height - height;
  } else if (direction.includes("bottom")) {
    height = Math.max(
      WORKSPACE_FLOATING_WINDOW_MIN_HEIGHT_PX,
      height + delta.y,
    );
  }
  return clampWorkspaceFloatingWindowBounds({ height, width, x, y }, viewport);
}

export function getWorkspaceWindowSnapResizeCoordinateBounds(
  seam: WorkspaceFloatingSnapResizeSeam,
  boundsByWindowId: Readonly<Record<string, WorkspaceWindowBounds>>,
): { minimum: number; maximum: number } | null {
  let minimum = -Infinity;
  let maximum = Infinity;
  for (const id of seam.leadingWindowIds) {
    const bounds = boundsByWindowId[id];
    if (!bounds) return null;
    minimum = Math.max(
      minimum,
      seam.axis === "vertical"
        ? bounds.x + WORKSPACE_FLOATING_WINDOW_MIN_WIDTH_PX
        : bounds.y + WORKSPACE_FLOATING_WINDOW_MIN_HEIGHT_PX,
    );
  }
  for (const id of seam.trailingWindowIds) {
    const bounds = boundsByWindowId[id];
    if (!bounds) return null;
    maximum = Math.min(
      maximum,
      seam.axis === "vertical"
        ? bounds.x + bounds.width - WORKSPACE_FLOATING_WINDOW_MIN_WIDTH_PX
        : bounds.y + bounds.height - WORKSPACE_FLOATING_WINDOW_MIN_HEIGHT_PX,
    );
  }
  return { maximum, minimum };
}

export function areWorkspaceWindowBoundsEqual(
  first: WorkspaceWindowBounds,
  second: WorkspaceWindowBounds,
): boolean {
  return (
    first.x === second.x &&
    first.y === second.y &&
    first.width === second.width &&
    first.height === second.height
  );
}

export function areWorkspaceWindowViewportsEqual(
  first: WorkspaceWindowViewport,
  second: WorkspaceWindowViewport,
): boolean {
  return (
    first.width === second.width &&
    first.height === second.height &&
    first.insets.left === second.insets.left &&
    first.insets.right === second.insets.right &&
    first.insets.top === second.insets.top &&
    first.insets.bottom === second.insets.bottom
  );
}

export function isWorkspaceWindowExclusivelyTop(
  state: WorkspaceWindowingState,
  target: WorkspaceFloatingWindow,
): boolean {
  return state.windows.every(
    (candidate) =>
      candidate.id === target.id ||
      !isWorkspaceWindowVisible(candidate) ||
      target.zIndex > candidate.zIndex,
  );
}

export function isWorkspaceWindowPresentationExclusivelyTop(
  state: WorkspaceWindowingState,
  target: WorkspaceFloatingWindow,
  zIndexByWindowId: Readonly<Record<string, number>>,
): boolean {
  const targetZIndex = zIndexByWindowId[target.id] ?? target.zIndex;
  return state.windows.every(
    (candidate) =>
      candidate.id === target.id ||
      !isWorkspaceWindowVisible(candidate) ||
      targetZIndex > (zIndexByWindowId[candidate.id] ?? candidate.zIndex),
  );
}

export function canHandleWorkspaceWindowShortcut(
  host: WorkspaceHost,
  event: KeyboardEvent,
  layoutEditable: boolean,
  shortcuts: boolean,
  viewport: WorkspaceWindowViewport | null,
): viewport is WorkspaceWindowViewport {
  return (
    isWorkspaceHostElement(host, event.target) &&
    shortcuts &&
    layoutEditable &&
    viewport !== null
  );
}

export function getFocusedWorkspaceWindow(
  state: WorkspaceWindowingState,
  windowId: string | null,
): WorkspaceFloatingWindow | null {
  if (!windowId) return null;
  return (
    state.windows.find(
      (window) => window.id === windowId && isWorkspaceWindowVisible(window),
    ) ?? null
  );
}

export function updateWorkspaceWindowTitleDragSession(
  session: WorkspaceWindowDragSession,
  pointer: WorkspaceWindowLocalPointer,
  viewport: WorkspaceWindowViewport,
): WorkspaceWindowSnapPreview | null {
  const delta = {
    x: pointer.x - session.startPointer.x,
    y: pointer.y - session.startPointer.y,
  };
  if (
    !session.hasActivatedUnsnap &&
    session.restoreBoundsOnUnsnap !== null &&
    Math.max(Math.abs(delta.x), Math.abs(delta.y)) >=
      WORKSPACE_FLOATING_WINDOW_UNSNAP_DRAG_THRESHOLD_PX
  ) {
    session.hasActivatedUnsnap = true;
  }
  const start = session.hasActivatedUnsnap
    ? session.dragBoundsStart
    : session.startBounds;
  session.lastBounds = clampWorkspaceFloatingWindowBounds(
    { ...start, x: start.x + delta.x, y: start.y + delta.y },
    viewport,
  );
  const preset = resolveWorkspaceFloatingSnapPresetFromPointer({
    pointerX: pointer.x,
    pointerY: pointer.y,
    viewport,
  });
  return preset
    ? {
        bounds: buildWorkspaceFloatingSnapBounds(preset, viewport),
        preset,
        windowId: session.windowId,
      }
    : null;
}

type WorkspaceWindowTitleDragCommit =
  | { readonly type: "snap"; readonly preset: WorkspaceFloatingSnapPreset }
  | { readonly type: "resize"; readonly bounds: WorkspaceWindowBounds }
  | { readonly type: "move"; readonly x: number; readonly y: number }
  | null;

function resolveWorkspaceWindowTitleDragCommit(
  session: WorkspaceWindowDragSession,
  snap: WorkspaceWindowSnapPreview | null,
): WorkspaceWindowTitleDragCommit {
  if (snap?.windowId === session.windowId) {
    return { preset: snap.preset, type: "snap" };
  }
  if (!session.hasActivatedUnsnap) return null;
  if (session.startedSnapped) {
    return { bounds: session.lastBounds, type: "resize" };
  }
  return {
    type: "move",
    x: session.lastBounds.x,
    y: session.lastBounds.y,
  };
}

export function resolveWorkspaceWindowTitleDragNextState(
  session: WorkspaceWindowDragSession,
  snap: WorkspaceWindowSnapPreview | null,
  state: WorkspaceWindowingState,
  viewport: WorkspaceWindowViewport,
  options: WorkspaceWindowingMutationOptions,
): WorkspaceWindowingState | null {
  const transition = resolveWorkspaceWindowTitleDragCommit(session, snap);
  if (!transition) return null;
  if (transition.type === "snap") {
    return snapWorkspaceFloatingWindow(
      state,
      session.windowId,
      transition.preset,
      viewport,
      options,
    );
  }
  if (transition.type === "resize") {
    return resizeWorkspaceFloatingWindow(
      state,
      session.windowId,
      transition.bounds,
      viewport,
      options,
    );
  }
  return moveWorkspaceFloatingWindow(
    state,
    session.windowId,
    { x: transition.x, y: transition.y },
    viewport,
    options,
  );
}

function hasWorkspaceWindowShortcutModifiers(
  event: KeyboardEvent,
  { alt, shift }: { alt: boolean; shift: boolean },
): boolean {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  const primary = isMac
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  return primary && event.altKey === alt && event.shiftKey === shift;
}

function isWorkspaceWindowEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest(
      "input, textarea, select, [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']",
    ) !== null
  );
}

export function resolveWorkspaceWindowShortcut(
  event: KeyboardEvent,
): WorkspaceWindowShortcut | null {
  if (
    event.defaultPrevented ||
    event.repeat ||
    isWorkspaceWindowEditableTarget(event.target)
  ) {
    return null;
  }
  return (
    WORKSPACE_WINDOW_SHORTCUT_DEFINITIONS.find(
      (definition) =>
        definition.code === event.code &&
        hasWorkspaceWindowShortcutModifiers(event, definition),
    )?.shortcut ?? null
  );
}
