import { type ParsedShortcut } from "components/ChatWindowing/projectChatKeyboardShortcuts";
import {
  type FloatingSnapPreset,
  type FloatingSnapResizeHandle,
  type FloatingWindowBoundaryInsets,
} from "components/ChatWindowing/projectChatSnapLayout";
import { type PointerEvent } from "react";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ChatWindowBounds,
  type ChatWindowPlacement,
} from "utils/generatedTypes";

export type ResolvedWindowPill = {
  instanceId: string;
  title: string;
  mode: (typeof ChatWindowModeEnum)[keyof typeof ChatWindowModeEnum];
  isClosed: boolean;
  isMinimized: boolean;
  placement: (typeof ChatWindowPlacementEnum)[keyof typeof ChatWindowPlacementEnum];
  zIndex: number;
  bounds: ChatWindowBounds;
  dockWidthFraction: number | null;
  dockPreferredWidthPx: number | null;
  sectionId: string | null;
  chatId: string | null;
};

export type WindowResizeDirection =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

export type PaneTrackedRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function canMoveProjectChatWindowToCanvas(
  mode: ResolvedWindowPill["mode"],
): boolean {
  return mode !== ChatWindowModeEnum.git_graph_mode;
}

export type ActiveSingleDockResize = {
  pointerId: number;
  instanceId: string;
  direction: WindowResizeDirection;
  startX: number;
  startY: number;
  startWidthPx: number;
  startHeightPx: number;
  lastWidthPx: number;
  lastHeightPx: number;
  minWidthPx: number;
  maxWidthPx: number;
  minHeightPx: number;
  maxHeightPx: number;
};

export type ActiveFloatingDrag = {
  pointerId: number;
  instanceId: string;
  startX: number;
  startY: number;
  startBounds: ChatWindowBounds;
  dragBoundsStart: ChatWindowBounds;
  lastBounds: ChatWindowBounds;
  restoreBoundsOnUnsnap: ChatWindowBounds | null;
  hasActivatedUnsnap: boolean;
};

export type ActiveFloatingResize = {
  pointerId: number;
  instanceId: string;
  direction: WindowResizeDirection;
  startX: number;
  startY: number;
  startBounds: ChatWindowBounds;
  lastBounds: ChatWindowBounds;
};

export type ChatWindowExitAnimationKind = "minimize" | "close";
export type ChatWindowEnterAnimationKind = "restore_from_minimize";
export type ChatWindowPillExitAnimationKind = "restore_from_minimize";

export type ActiveFloatingSnapPreview = {
  instanceId: string;
  preset: FloatingSnapPreset;
  bounds: ChatWindowBounds;
};

export type ActiveFloatingSnapResize = {
  pointerId: number;
  axis: FloatingSnapResizeHandle["axis"];
  startPointerPosition: number;
  startCoordinate: number;
  minCoordinate: number;
  maxCoordinate: number;
  leadingInstanceIds: string[];
  trailingInstanceIds: string[];
  startBoundsByInstanceId: Record<string, ChatWindowBounds>;
  lastBoundsByInstanceId: Record<string, ChatWindowBounds>;
};

export const DOCK_BAR_HEIGHT_PX = 40;
export const DOCK_BAR_FLOAT_BOTTOM_OFFSET_PX = 0;
export const DOCK_SURFACE_MAX_WIDTH_PX = 1160;
export const DOCK_SURFACE_HORIZONTAL_MARGIN_PX = 20;
export const DOCK_WINDOW_DEFAULT_WIDTH_PX = 460;
export const DOCK_WINDOW_DEFAULT_HEIGHT_PX = 520;
export const DOCK_WINDOW_GAP_PX = 12;
export const MIN_DOCK_CHAT_WIDTH_PX = 280;
export const MIN_DOCK_CHAT_HEIGHT_PX = 220;
export const COMPACT_PILL_WIDTH_PX = 28;
export const CYCLE_CONTROL_BUTTON_WIDTH_PX = 24;
export const PILL_GAP_PX = 4;
export const CHAT_WINDOW_LAYER_Z_INDEX = 24;
export const TRACKED_PANE_CHAT_WINDOW_LAYER_Z_INDEX = 31;
export const CHAT_WINDOW_CHROME_LAYER_Z_INDEX = CHAT_WINDOW_LAYER_Z_INDEX + 1;
export const CHAT_WINDOW_SNAP_PREVIEW_Z_INDEX =
  CHAT_WINDOW_CHROME_LAYER_Z_INDEX + 1;
export const CHAT_WINDOW_TOGGLE_Z_INDEX = CHAT_WINDOW_CHROME_LAYER_Z_INDEX + 2;
export const CHAT_WINDOW_ENTER_ANIMATION_PRIME_DELAY_MS = 16;
export const CHAT_WINDOW_ENTER_DURATION_MS = 110;
export const CHAT_WINDOW_STRIP_LAYOUT_DURATION_MS = 110;
export const CHAT_WINDOW_PILL_EXIT_DURATION_MS = 72;
export const FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX = 8;
export const FLOATING_SNAP_RESIZE_HANDLE_LINE_THICKNESS_PX = 2;
export const FLOATING_WINDOW_MIN_WIDTH_PX = 380;
export const FLOATING_WINDOW_MIN_HEIGHT_PX = 240;
export const FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX = 32;
const FLOATING_WINDOW_MIN_VISIBLE_WIDTH_PX = 120;
export const FLOATING_UNSNAP_DRAG_THRESHOLD_PX = 6;
export const CHAT_WINDOW_MINIMIZE_EXIT_DURATION_MS = 115;
export const CHAT_WINDOW_CLOSE_EXIT_DURATION_MS = 125;
export const SNAP_TOP_LEFT_SHORTCUT = "Mod + Alt + Shift + Q";
export const SNAP_TOP_RIGHT_SHORTCUT = "Mod + Alt + Shift + W";
export const SNAP_BOTTOM_LEFT_SHORTCUT = "Mod + Alt + Shift + A";
export const SNAP_BOTTOM_RIGHT_SHORTCUT = "Mod + Alt + Shift + S";

type ResizeHandleConfig = {
  direction: WindowResizeDirection;
  className: string;
  cursorClassName: string;
  indicatorClassName?: string;
};

export const DOCK_WINDOW_RESIZE_HANDLES: Array<ResizeHandleConfig> = [
  {
    direction: "top",
    className: "left-2 right-2 top-0 h-2",
    cursorClassName: "cursor-ns-resize",
  },
  {
    direction: "bottom",
    className: "left-2 right-2 bottom-0 h-2",
    cursorClassName: "cursor-ns-resize",
  },
  {
    direction: "top_left",
    className: "left-0 top-0 h-3 w-3",
    cursorClassName: "cursor-nwse-resize",
  },
  {
    direction: "top_right",
    className: "right-0 top-0 h-3 w-3",
    cursorClassName: "cursor-nesw-resize",
  },
  {
    direction: "bottom_left",
    className: "left-0 bottom-0 h-3 w-3",
    cursorClassName: "cursor-nesw-resize",
  },
  {
    direction: "bottom_right",
    className: "right-0 bottom-0 h-3 w-3",
    cursorClassName: "cursor-nwse-resize",
  },
];

export const FLOATING_WINDOW_RESIZE_HANDLES: Array<ResizeHandleConfig> = [
  {
    direction: "top",
    className: "left-3 right-3 top-0 h-2",
    cursorClassName: "cursor-ns-resize",
  },
  {
    direction: "bottom",
    className: "left-3 right-3 bottom-0 h-2",
    cursorClassName: "cursor-ns-resize",
  },
  {
    direction: "top_left",
    className: "left-0 top-0 h-3 w-3",
    cursorClassName: "cursor-nwse-resize",
  },
  {
    direction: "top_right",
    className: "right-0 top-0 h-3 w-3",
    cursorClassName: "cursor-nesw-resize",
  },
  {
    direction: "bottom_left",
    className: "left-0 bottom-0 h-3 w-3",
    cursorClassName: "cursor-nesw-resize",
  },
  {
    direction: "bottom_right",
    className: "right-0 bottom-0 h-3 w-3",
    cursorClassName: "cursor-nwse-resize",
    indicatorClassName:
      "h-3 w-3 rounded-tl border-l border-t border-setta-300 bg-setta-100 dark:border-setta-700 dark:bg-setta-800",
  },
];

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  return Boolean(target.closest("[contenteditable='true']"));
}

export function isInteractiveWindowHeaderTarget(
  target: EventTarget | null,
): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(
    target.closest(
      "button, [role='button'], [role='menuitem'], input, textarea, select, a, [contenteditable='true']",
    ),
  );
}

export function clampNumber(
  value: number,
  minValue: number,
  maxValue: number,
): number {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

export function resizeDirectionIncludesAxis(
  direction: WindowResizeDirection,
  axis: "left" | "right" | "top" | "bottom",
): boolean {
  return direction === axis || direction.includes(axis);
}

export function areBoundsEqual(
  a: ChatWindowBounds,
  b: ChatWindowBounds,
): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

export function getViewportDimensions(): {
  width: number;
  height: number;
} | null {
  if (typeof window === "undefined") {
    return null;
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (width <= 0 || height <= 0) {
    return null;
  }
  return { width, height };
}

export function clampFloatingBoundsToViewport(
  bounds: ChatWindowBounds,
  viewportWidthPx: number,
  viewportHeightPx: number,
  insets: FloatingWindowBoundaryInsets,
): ChatWindowBounds {
  const minXBoundary = Math.max(0, insets.left);
  const maxXBoundary = Math.max(
    minXBoundary + 1,
    viewportWidthPx - Math.max(0, insets.right),
  );
  const minYBoundary = Math.max(0, insets.top);
  const maxYBoundary = Math.max(
    minYBoundary + FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX,
    viewportHeightPx - Math.max(0, insets.bottom),
  );
  const availableWidthPx = Math.max(1, maxXBoundary - minXBoundary);
  const availableHeightPx = Math.max(1, maxYBoundary - minYBoundary);

  const nextWidth = clampNumber(
    Math.max(FLOATING_WINDOW_MIN_WIDTH_PX, bounds.width),
    FLOATING_WINDOW_MIN_WIDTH_PX,
    Math.max(FLOATING_WINDOW_MIN_WIDTH_PX, availableWidthPx),
  );
  const nextHeight = clampNumber(
    Math.max(FLOATING_WINDOW_MIN_HEIGHT_PX, bounds.height),
    FLOATING_WINDOW_MIN_HEIGHT_PX,
    Math.max(FLOATING_WINDOW_MIN_HEIGHT_PX, availableHeightPx),
  );
  const minimumVisibleWidth = Math.max(
    1,
    Math.min(FLOATING_WINDOW_MIN_VISIBLE_WIDTH_PX, availableWidthPx),
  );

  const minX = minXBoundary + minimumVisibleWidth - nextWidth;
  const maxX = maxXBoundary - minimumVisibleWidth;
  const clampedX = clampNumber(
    bounds.x,
    Math.min(minX, maxX),
    Math.max(minX, maxX),
  );
  const clampedY = clampNumber(
    bounds.y,
    minYBoundary,
    Math.max(minYBoundary, maxYBoundary - FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX),
  );

  return {
    x: clampedX,
    y: clampedY,
    width: nextWidth,
    height: nextHeight,
  };
}

export function buildPillBaseClass(isActive: boolean): string {
  if (isActive) {
    return "border-setta-400 bg-white text-setta-900 dark:border-setta-500 dark:bg-setta-900 dark:text-setta-100";
  }
  return "border-setta-300 bg-setta-100 text-setta-700 hover:bg-setta-200 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-850";
}

function isVisibleCanvasWindow(pill: ResolvedWindowPill): boolean {
  return (
    !pill.isClosed &&
    !pill.isMinimized &&
    (pill.placement === ChatWindowPlacementEnum.bottom_docked ||
      pill.placement === ChatWindowPlacementEnum.floating ||
      pill.placement === ChatWindowPlacementEnum.maximized)
  );
}

function resolveTopZIndexWindow(
  pills: readonly ResolvedWindowPill[],
): ResolvedWindowPill | null {
  let activeWindow: ResolvedWindowPill | null = null;
  for (const pill of pills) {
    if (!activeWindow || pill.zIndex > activeWindow.zIndex) {
      activeWindow = pill;
    }
  }
  return activeWindow;
}

export function resolveTopZIndexWindowId(
  pills: readonly ResolvedWindowPill[],
): string | null {
  return resolveTopZIndexWindow(pills)?.instanceId ?? null;
}

export function resolveActiveVisibleWindowId(
  orderedPills: readonly ResolvedWindowPill[],
  isCanvasVisibilitySuppressed: boolean,
): string | null {
  if (isCanvasVisibilitySuppressed) {
    return null;
  }
  const visibleWindows = orderedPills.filter(isVisibleCanvasWindow);
  return resolveTopZIndexWindowId(visibleWindows);
}

export function resolveDockCycleOffsetForWindowOpen({
  instanceId,
  isMinimized,
  orderedPills,
  dockVisibleStartIndex,
  maxVisibleDockedCount,
  openDockedCount,
}: {
  instanceId: string;
  isMinimized: boolean;
  orderedPills: readonly ResolvedWindowPill[];
  dockVisibleStartIndex: number;
  maxVisibleDockedCount: number;
  openDockedCount: number;
}): number | null {
  if (maxVisibleDockedCount <= 0) {
    return null;
  }
  const shouldSkipDockCycleCandidate = (pill: ResolvedWindowPill) =>
    pill.isClosed ||
    pill.placement !== ChatWindowPlacementEnum.bottom_docked ||
    (pill.isMinimized && pill.instanceId !== instanceId);
  let targetDockIndex = 0;
  let foundTarget = false;
  for (const pill of orderedPills) {
    if (shouldSkipDockCycleCandidate(pill)) {
      continue;
    }
    if (pill.instanceId === instanceId) {
      foundTarget = true;
      break;
    }
    targetDockIndex += 1;
  }
  if (!foundTarget) {
    return null;
  }
  const currentEndIndex = dockVisibleStartIndex + maxVisibleDockedCount;
  let nextStartIndex = dockVisibleStartIndex;
  if (targetDockIndex < dockVisibleStartIndex) {
    nextStartIndex = targetDockIndex;
  } else if (targetDockIndex >= currentEndIndex) {
    nextStartIndex = targetDockIndex - maxVisibleDockedCount + 1;
  }
  const nextTotalDockCount = openDockedCount + (isMinimized ? 1 : 0);
  const nextMaxStartIndex = Math.max(
    0,
    nextTotalDockCount - maxVisibleDockedCount,
  );
  return nextMaxStartIndex - clampNumber(nextStartIndex, 0, nextMaxStartIndex);
}

export function shouldIgnoreFloatingDragPointerDown(
  event: PointerEvent<HTMLElement>,
): boolean {
  return (
    event.button !== 0 ||
    (event.detail > 1 &&
      event.target instanceof HTMLElement &&
      event.target.closest("[data-project-chat-window-title='true']") !== null)
  );
}

export function buildFloatingDragState({
  pointerId,
  instanceId,
  pointerX,
  pointerY,
  currentBounds,
  restoreBoundsOnUnsnap,
  positionFloatingBoundsForUnsnap,
}: {
  pointerId: number;
  instanceId: string;
  pointerX: number;
  pointerY: number;
  currentBounds: ChatWindowBounds;
  restoreBoundsOnUnsnap: ChatWindowBounds | null;
  positionFloatingBoundsForUnsnap: (args: {
    currentBounds: ChatWindowBounds;
    restoreBounds: ChatWindowBounds;
    pointerX: number;
    pointerY: number;
  }) => ChatWindowBounds;
}): ActiveFloatingDrag {
  const dragBoundsStart = restoreBoundsOnUnsnap
    ? positionFloatingBoundsForUnsnap({
        currentBounds,
        restoreBounds: restoreBoundsOnUnsnap,
        pointerX,
        pointerY,
      })
    : currentBounds;
  const clonedCurrentBounds = { ...currentBounds };
  return {
    pointerId,
    instanceId,
    startX: pointerX,
    startY: pointerY,
    startBounds: clonedCurrentBounds,
    dragBoundsStart: { ...dragBoundsStart },
    lastBounds: clonedCurrentBounds,
    restoreBoundsOnUnsnap,
    hasActivatedUnsnap: restoreBoundsOnUnsnap === null,
  };
}

export function getValueByInstanceId<T>(
  instanceId: string | null,
  valuesById: Record<string, T>,
): T | null {
  if (!instanceId) {
    return null;
  }
  return valuesById[instanceId] ?? null;
}

export type ShortcutCommand = {
  shortcut: ParsedShortcut;
  run: () => void;
};

export const DOCKED_CHAT_WINDOW_SHADOW_CLASS =
  "shadow-[0_-1px_6px_rgba(15,23,42,0.08)] dark:shadow-[0_-1px_6px_rgba(0,0,0,0.18)]";
export const FLOATING_CHAT_WINDOW_SHADOW_CLASS =
  "shadow-[0_2px_8px_rgba(15,23,42,0.10)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.22)]";
export const CANVAS_VISIBILITY_TOGGLE_BUTTON_CLASS =
  "fixed inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-setta-300 bg-setta-50/95 text-setta-400 shadow-sm backdrop-blur-sm transition-colors hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-800 dark:bg-setta-900/95 dark:text-setta-600 dark:hover:text-setta-500";
export const CANVAS_VISIBILITY_TOGGLE_BUTTON_ACTIVE_CLASS =
  "border-blue-500 bg-blue-500 text-white hover:bg-blue-600 hover:text-white dark:border-blue-500 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400 dark:hover:text-white";
export const WINDOW_MAXIMIZE_ICON = <i className="gg-maximize !scale-[.4]" />;
export const WINDOWED_CHAT_ROUNDED_CLASS = "rounded-lg";
export const DOCKED_WINDOWED_CHAT_ROUNDED_CLASS = "rounded-b-none rounded-t-lg";

export function getChatWindowExitAnimationClass(
  kind: ChatWindowExitAnimationKind | null,
  placement: ChatWindowPlacement,
): string {
  if (!kind) {
    return "";
  }
  const originClassName =
    placement === ChatWindowPlacementEnum.maximized
      ? "origin-center"
      : placement === ChatWindowPlacementEnum.bottom_docked
        ? "origin-bottom-right"
        : "origin-top-right";
  if (kind === "minimize") {
    return `${originClassName} pointer-events-none transform-gpu will-change-[transform,opacity] transition-[transform,opacity] duration-[115ms] ease-[cubic-bezier(0.2,0.82,0.32,1)] motion-reduce:transition-none translate-y-4 scale-[0.97] opacity-0`;
  }
  return `${originClassName} pointer-events-none transform-gpu will-change-[transform,opacity] transition-[transform,opacity] duration-[125ms] ease-[cubic-bezier(0.32,0,0.18,1)] motion-reduce:transition-none scale-[0.7] opacity-0`;
}

export function getChatWindowEnterAnimationClass(
  kind: ChatWindowEnterAnimationKind | null,
  placement: ChatWindowPlacement,
): string {
  if (!kind) {
    return "";
  }
  const originClassName =
    placement === ChatWindowPlacementEnum.maximized
      ? "origin-center"
      : placement === ChatWindowPlacementEnum.bottom_docked
        ? "origin-bottom-right"
        : "origin-top-right";
  return `${originClassName} transform-gpu will-change-[transform,opacity] transition-[transform,opacity] duration-[110ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none translate-y-5 scale-[0.985] opacity-0`;
}
