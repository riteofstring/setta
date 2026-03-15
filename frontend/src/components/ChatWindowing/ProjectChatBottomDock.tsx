import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  canUseManagedChatLLM,
  windowSurfaceRequiresManagedChat,
} from "components/Chat/sharePolicyChatAccess";
import { resolveProjectChatShortcutActiveSectionId } from "components/ChatWindowing/projectChatActiveSelection";
import { resolveDockStripReservedWidthPx } from "components/ChatWindowing/projectChatBottomDockLayout";
import {
  buildFloatingSnapBounds,
  buildFloatingSnapResizeBounds,
  buildFloatingSnapResizeHandles,
  resolveFloatingSnapPresetFromBounds,
  type FloatingSnapPreset,
  type FloatingSnapResizeHandle,
  type FloatingWindowBoundaryInsets,
} from "components/ChatWindowing/projectChatSnapLayout";
import { buildWorkspaceProjectChatWindowSurfaceId } from "components/ChatWindowing/projectChatSurfaceIds";
import {
  PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX,
  PROJECT_CHAT_SIDE_RAIL_WIDTH_PX,
  PROJECT_CHAT_VIEW_MODE_TABS_HEIGHT_PX,
  resolveProjectChatFloatingBoundaryInsets,
} from "components/ChatWindowing/projectChatViewport";
import { ProjectChatWindowIcon } from "components/ChatWindowing/ProjectChatWindowIcon";
import {
  ProjectChatWindowSurface,
  SECTION_WINDOW_ACTION_BUTTON_CLASS,
  SECTION_WINDOW_CLOSE_BUTTON_CLASS,
  SECTION_WINDOW_MINIMIZE_BUTTON_CLASS,
} from "components/ChatWindowing/ProjectChatWindowSurface";
import { buildProjectChatWindowTitle } from "components/ChatWindowing/projectChatWindowTitles";
import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
import { GitGraphWindowContent } from "components/Git/GitGraphWindowContent";
import { ProjectChatManager } from "components/Panes/Overview/ProjectLevelAI/ProjectChatManager";
import { SectionWindowSurface } from "components/Section/Container/SectionWindowSurface";
import {
  getWindowControlQuickInfoHandlers,
  getWindowControlQuickInfoText,
} from "components/Utils/windowControlQuickInfo";
import _ from "lodash";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { BiHide, BiShow } from "react-icons/bi";
import {
  MdAdd,
  MdChevronLeft,
  MdChevronRight,
  MdFlipToFront,
  MdOpenInNew,
  MdVerticalAlignBottom,
} from "react-icons/md";
import { RiChat3Line } from "react-icons/ri";
import {
  bootProjectChatWindowToCanvasSection,
  clearTrackedGitPaneGraphWindowIfMatches,
  closeProjectChatWindow,
  createProjectChatWindowInstance,
  focusProjectChatWindow,
  getOpenExternalProjectChatWindowInstanceForSectionInState,
  maximizeProjectChatWindow,
  minimizeProjectChatWindow,
  reopenProjectChatWindow,
  resolveDefaultDockedChatHeightPx,
  resolveDefaultFloatingChatBounds,
  setProjectChatWindowBounds,
  setProjectChatWindowBoundsById,
  setProjectChatWindowChatId,
  setProjectChatWindowDockFractions,
  setProjectChatWindowPlacement,
  setProjectChatWindowTitle,
  showSectionInProjectChatWindow,
  unmaximizeProjectChatWindow,
} from "state/actions/projectChatWindowing";
import { getTrackedGitPaneGraphWindowInstanceIdForProject } from "state/actions/projectChatWindowingEphemeral";
import {
  NULL_PROJECT_CONFIG_ID,
  useActiveSectionUI,
  useLocalStorage,
  useMisc,
  useProjectState,
  useSettings,
  useShareSession,
} from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import { useHasViewModeTabs } from "state/hooks/viewModes";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ChatWindowBounds,
} from "utils/generatedTypes";
import { isMacOs } from "utils/utils";
import { shallow } from "zustand/shallow";

type ResolvedWindowPill = {
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

type PillDisplayMode = "full" | "compact" | "cycle" | "menu";

type WindowResizeDirection =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

type PaneTrackedRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function canMoveProjectChatWindowToCanvas(
  mode: ResolvedWindowPill["mode"],
): boolean {
  return mode !== ChatWindowModeEnum.git_graph_mode;
}

type ActiveSingleDockResize = {
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

type ActiveFloatingDrag = {
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

type ActiveFloatingResize = {
  pointerId: number;
  instanceId: string;
  direction: WindowResizeDirection;
  startX: number;
  startY: number;
  startBounds: ChatWindowBounds;
  lastBounds: ChatWindowBounds;
};

type ChatWindowExitAnimationKind = "minimize" | "close";
type ChatWindowEnterAnimationKind = "restore_from_minimize";
type ChatWindowPillExitAnimationKind = "restore_from_minimize";

type ActiveFloatingSnapPreview = {
  instanceId: string;
  preset: FloatingSnapPreset;
  bounds: ChatWindowBounds;
};

type ActiveFloatingSnapResize = {
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

const DOCK_BAR_HEIGHT_PX = 40;
const DOCK_BAR_FLOAT_BOTTOM_OFFSET_PX = 0;
const VIEW_MODE_TABS_HEIGHT_PX = PROJECT_CHAT_VIEW_MODE_TABS_HEIGHT_PX;
const SIDE_RAIL_WIDTH_PX = PROJECT_CHAT_SIDE_RAIL_WIDTH_PX;
const FALLBACK_WORKSPACE_TOP_INSET_PX =
  PROJECT_CHAT_FALLBACK_WORKSPACE_TOP_INSET_PX;
const DOCK_SURFACE_MAX_WIDTH_PX = 1160;
const DOCK_SURFACE_MIN_WIDTH_PX = 420;
const DOCK_SURFACE_HORIZONTAL_MARGIN_PX = 20;
const DOCK_WINDOW_DEFAULT_WIDTH_PX = 460;
const DOCK_WINDOW_DEFAULT_HEIGHT_PX = 520;
const DOCK_WINDOW_GAP_PX = 12;
const DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX = 4;
const MIN_DOCK_CHAT_WIDTH_PX = 280;
const MIN_DOCK_CHAT_HEIGHT_PX = 220;
const COMPACT_PILL_WIDTH_PX = 28;
const CYCLE_CONTROL_BUTTON_WIDTH_PX = 24;
const PILL_GAP_PX = 4;
const MENU_MODE_TRIGGER_WIDTH_PX = 28;
const PERSISTENT_MANAGER_TRIGGER_RESERVED_WIDTH_PX =
  MENU_MODE_TRIGGER_WIDTH_PX + PILL_GAP_PX;
const CHAT_WINDOW_LAYER_Z_INDEX = 24;
const TRACKED_PANE_CHAT_WINDOW_LAYER_Z_INDEX = 31;
const CHAT_WINDOW_CHROME_LAYER_Z_INDEX = CHAT_WINDOW_LAYER_Z_INDEX + 1;
const CHAT_WINDOW_SNAP_PREVIEW_Z_INDEX = CHAT_WINDOW_CHROME_LAYER_Z_INDEX + 1;
const CHAT_WINDOW_TOGGLE_Z_INDEX = CHAT_WINDOW_CHROME_LAYER_Z_INDEX + 2;
const CHAT_WINDOW_ENTER_ANIMATION_PRIME_DELAY_MS = 16;
const CHAT_WINDOW_ENTER_DURATION_MS = 110;
const CHAT_WINDOW_STRIP_LAYOUT_DURATION_MS = 110;
const CHAT_WINDOW_PILL_EXIT_DURATION_MS = 72;
const FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX = 8;
const FLOATING_SNAP_RESIZE_HANDLE_LINE_THICKNESS_PX = 2;
const MINIMIZED_PILL_STRIP_HORIZONTAL_PADDING_PX = 16;
const DOCKED_MINIMIZED_STRIP_RESERVED_WIDTH_PX =
  MINIMIZED_PILL_STRIP_HORIZONTAL_PADDING_PX +
  CYCLE_CONTROL_BUTTON_WIDTH_PX * 2 +
  COMPACT_PILL_WIDTH_PX * 2 +
  PILL_GAP_PX * 3 +
  DOCK_WINDOW_GAP_PX;
const NARROW_CHAT_MENU_BREAKPOINT_PX = 520;
const FLOATING_WINDOW_MIN_WIDTH_PX = 380;
const FLOATING_WINDOW_MIN_HEIGHT_PX = 240;
const FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX = 32;
const FLOATING_WINDOW_MIN_VISIBLE_WIDTH_PX = 120;
const FLOATING_SNAP_EDGE_THRESHOLD_PX = 84;
const FLOATING_UNSNAP_DRAG_THRESHOLD_PX = 6;
const CHAT_WINDOW_MINIMIZE_EXIT_DURATION_MS = 115;
const CHAT_WINDOW_CLOSE_EXIT_DURATION_MS = 125;
const SNAP_TOP_LEFT_SHORTCUT = "Mod + Alt + Shift + Q";
const SNAP_TOP_RIGHT_SHORTCUT = "Mod + Alt + Shift + W";
const SNAP_BOTTOM_LEFT_SHORTCUT = "Mod + Alt + Shift + A";
const SNAP_BOTTOM_RIGHT_SHORTCUT = "Mod + Alt + Shift + S";

type ParsedShortcut = {
  mod: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  keys: Set<string>;
};

type ResizeHandleConfig = {
  direction: WindowResizeDirection;
  className: string;
  cursorClassName: string;
  indicatorClassName?: string;
};

const DOCK_WINDOW_RESIZE_HANDLES: Array<ResizeHandleConfig> = [
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

const FLOATING_WINDOW_RESIZE_HANDLES: Array<ResizeHandleConfig> = [
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

const SPECIAL_SHORTCUT_KEY_TO_EVENT_CODE: Record<string, string> = {
  ".": "Period",
  ",": "Comma",
  "/": "Slash",
  "\\": "Backslash",
  "'": "Quote",
  ";": "Semicolon",
  "[": "BracketLeft",
  "]": "BracketRight",
  "-": "Minus",
  "=": "Equal",
  "`": "Backquote",
  arrowright: "ArrowRight",
  arrowleft: "ArrowLeft",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  esc: "Escape",
};

function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut
    .split("+")
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x.length > 0);
  const keys = new Set(
    parts
      .filter((x) => !["ctrl", "shift", "alt", "mod"].includes(x))
      .map((part) => {
        if (/^[a-z]$/.test(part)) {
          return `Key${part.toUpperCase()}`;
        }
        if (/^[0-9]$/.test(part)) {
          return `Digit${part}`;
        }
        const special = SPECIAL_SHORTCUT_KEY_TO_EVENT_CODE[part];
        if (special) {
          return special;
        }
        return part[0].toUpperCase() + part.slice(1);
      }),
  );
  return {
    mod: parts.includes("mod"),
    ctrl: parts.includes("ctrl"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
    keys,
  };
}

function getNormalizedEventCode(event: KeyboardEvent): string | null {
  if (event.code && event.code !== "Unidentified") {
    return event.code;
  }
  if (!event.key) {
    return null;
  }
  if (event.key === " ") {
    return "Space";
  }
  if (event.key === "Shift") {
    return "ShiftLeft";
  }
  if (event.key === "Control") {
    return "ControlLeft";
  }
  if (event.key === "Alt") {
    return "AltLeft";
  }
  if (event.key === "Meta") {
    return "MetaLeft";
  }
  const lower = event.key.toLowerCase();
  const special = SPECIAL_SHORTCUT_KEY_TO_EVENT_CODE[lower];
  if (special) {
    return special;
  }
  if (/^[a-z]$/i.test(event.key)) {
    return `Key${event.key.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(event.key)) {
    return `Digit${event.key}`;
  }
  if (event.key.length > 1) {
    return event.key[0].toUpperCase() + event.key.slice(1);
  }
  return event.key;
}

function isShortcutPressed(
  event: KeyboardEvent,
  eventCode: string | null,
  parsedShortcut: ParsedShortcut,
  macOs: boolean,
): boolean {
  if (macOs) {
    if (
      event.metaKey !== parsedShortcut.mod ||
      event.ctrlKey !== parsedShortcut.ctrl ||
      event.shiftKey !== parsedShortcut.shift ||
      event.altKey !== parsedShortcut.alt
    ) {
      return false;
    }
  } else if (
    event.ctrlKey !== (parsedShortcut.ctrl || parsedShortcut.mod) ||
    event.shiftKey !== parsedShortcut.shift ||
    event.altKey !== parsedShortcut.alt
  ) {
    return false;
  }
  if (parsedShortcut.keys.size === 0) {
    return true;
  }
  if (!eventCode || parsedShortcut.keys.size !== 1) {
    return false;
  }
  return parsedShortcut.keys.has(eventCode);
}

function isEditableTarget(target: EventTarget | null): boolean {
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

function isInteractiveWindowHeaderTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(
    target.closest(
      "button, [role='button'], [role='menuitem'], input, textarea, select, a, [contenteditable='true']",
    ),
  );
}

function clampNumber(
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

function resolveMaxVisibleDockWindowCount(
  totalWindowCount: number,
  availableWidthPx: number,
): number {
  for (let count = totalWindowCount; count >= 1; count -= 1) {
    const minimumWidthPx =
      count * MIN_DOCK_CHAT_WIDTH_PX +
      Math.max(0, count - 1) * DOCK_WINDOW_GAP_PX +
      DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX * 2;
    if (minimumWidthPx <= availableWidthPx + 0.5) {
      return count;
    }
  }
  return 0;
}

function resolveDockWindowWidthsToFit(
  dockedPills: ResolvedWindowPill[],
  desiredWidthsById: Record<string, number>,
  availableWidthPx: number,
): Record<string, number> {
  if (dockedPills.length === 0) {
    return {};
  }
  const gapWidthPx = Math.max(0, dockedPills.length - 1) * DOCK_WINDOW_GAP_PX;
  const availablePanelWidthPx =
    availableWidthPx - DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX * 2 - gapWidthPx;
  if (availablePanelWidthPx <= 0) {
    return {};
  }
  const nextWidthsById: Record<string, number> = {};
  const resolvedWidths = dockedPills.map((pill) =>
    clampNumber(
      desiredWidthsById[pill.instanceId] ?? DOCK_WINDOW_DEFAULT_WIDTH_PX,
      MIN_DOCK_CHAT_WIDTH_PX,
      DOCK_SURFACE_MAX_WIDTH_PX,
    ),
  );
  const totalDesiredWidthPx = resolvedWidths.reduce(
    (sum, widthPx) => sum + widthPx,
    0,
  );
  if (totalDesiredWidthPx <= availablePanelWidthPx + 0.5) {
    dockedPills.forEach((pill, index) => {
      nextWidthsById[pill.instanceId] =
        resolvedWidths[index] ?? MIN_DOCK_CHAT_WIDTH_PX;
    });
    return nextWidthsById;
  }
  const minTotalWidthPx = dockedPills.length * MIN_DOCK_CHAT_WIDTH_PX;
  if (minTotalWidthPx >= availablePanelWidthPx - 0.5) {
    dockedPills.forEach((pill) => {
      nextWidthsById[pill.instanceId] = MIN_DOCK_CHAT_WIDTH_PX;
    });
    return nextWidthsById;
  }
  const shrinkableEntries = resolvedWidths.map((widthPx, index) => ({
    index,
    widthPx,
  }));
  let remainingReductionPx = totalDesiredWidthPx - availablePanelWidthPx;
  while (remainingReductionPx > 0.5) {
    const shrinkableIndices = shrinkableEntries
      .map((entry) => entry.index)
      .filter(
        (index) =>
          (shrinkableEntries[index]?.widthPx ?? MIN_DOCK_CHAT_WIDTH_PX) >
          MIN_DOCK_CHAT_WIDTH_PX + 0.5,
      );
    if (shrinkableIndices.length === 0) {
      break;
    }
    const totalShrinkCapacityPx = shrinkableIndices.reduce((sum, index) => {
      return (
        sum +
        ((shrinkableEntries[index]?.widthPx ?? MIN_DOCK_CHAT_WIDTH_PX) -
          MIN_DOCK_CHAT_WIDTH_PX)
      );
    }, 0);
    if (totalShrinkCapacityPx <= 0.5) {
      break;
    }
    let appliedReductionPx = 0;
    for (const index of shrinkableIndices) {
      const entry = shrinkableEntries[index];
      if (!entry) {
        continue;
      }
      const capacityPx = entry.widthPx - MIN_DOCK_CHAT_WIDTH_PX;
      const proportionalReductionPx =
        remainingReductionPx * (capacityPx / totalShrinkCapacityPx);
      const nextWidthPx = Math.max(
        MIN_DOCK_CHAT_WIDTH_PX,
        entry.widthPx - proportionalReductionPx,
      );
      appliedReductionPx += entry.widthPx - nextWidthPx;
      entry.widthPx = nextWidthPx;
    }
    if (appliedReductionPx <= 0.5) {
      break;
    }
    remainingReductionPx = Math.max(
      0,
      remainingReductionPx - appliedReductionPx,
    );
  }
  dockedPills.forEach((pill, index) => {
    nextWidthsById[pill.instanceId] =
      shrinkableEntries[index]?.widthPx ?? MIN_DOCK_CHAT_WIDTH_PX;
  });
  return nextWidthsById;
}

function resizeDirectionIncludesAxis(
  direction: WindowResizeDirection,
  axis: "left" | "right" | "top" | "bottom",
): boolean {
  return direction === axis || direction.includes(axis);
}

function areBoundsEqual(a: ChatWindowBounds, b: ChatWindowBounds): boolean {
  return (
    a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  );
}

function getViewportDimensions(): { width: number; height: number } | null {
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

function clampFloatingBoundsToViewport(
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

function resolveFloatingSnapPresetFromPointer(
  pointerX: number,
  pointerY: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
  insets: FloatingWindowBoundaryInsets,
): FloatingSnapPreset | null {
  const minXBoundary = Math.max(0, insets.left);
  const maxXBoundary = Math.max(
    minXBoundary + 1,
    viewportWidthPx - Math.max(0, insets.right),
  );
  const minYBoundary = Math.max(0, insets.top);
  const maxYBoundary = Math.max(
    minYBoundary + 1,
    viewportHeightPx - Math.max(0, insets.bottom),
  );
  const nearLeft = pointerX <= minXBoundary + FLOATING_SNAP_EDGE_THRESHOLD_PX;
  const nearRight = pointerX >= maxXBoundary - FLOATING_SNAP_EDGE_THRESHOLD_PX;
  const nearTop = pointerY <= minYBoundary + FLOATING_SNAP_EDGE_THRESHOLD_PX;
  const nearBottom = pointerY >= maxYBoundary - FLOATING_SNAP_EDGE_THRESHOLD_PX;

  if (nearTop && nearLeft) {
    return "top_left";
  }
  if (nearTop && nearRight) {
    return "top_right";
  }
  if (nearBottom && nearLeft) {
    return "bottom_left";
  }
  if (nearBottom && nearRight) {
    return "bottom_right";
  }
  if (nearLeft) {
    return "left";
  }
  if (nearRight) {
    return "right";
  }
  if (nearTop) {
    return "top";
  }
  if (nearBottom) {
    return "bottom";
  }
  return null;
}

function buildPillBaseClass(isActive: boolean): string {
  if (isActive) {
    return "border-setta-400 bg-white text-setta-900 dark:border-setta-500 dark:bg-setta-900 dark:text-setta-100";
  }
  return "border-setta-300 bg-setta-100 text-setta-700 hover:bg-setta-200 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-850";
}

const DOCKED_CHAT_WINDOW_SHADOW_CLASS =
  "shadow-[0_-1px_6px_rgba(15,23,42,0.08)] dark:shadow-[0_-1px_6px_rgba(0,0,0,0.18)]";
const FLOATING_CHAT_WINDOW_SHADOW_CLASS =
  "shadow-[0_2px_8px_rgba(15,23,42,0.10)] dark:shadow-[0_2px_10px_rgba(0,0,0,0.22)]";
const CANVAS_VISIBILITY_TOGGLE_BUTTON_CLASS =
  "fixed inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-setta-300 bg-setta-50/95 text-setta-400 shadow-sm backdrop-blur-sm transition-colors hover:text-setta-600 focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-setta-800 dark:bg-setta-900/95 dark:text-setta-600 dark:hover:text-setta-500";
const CANVAS_VISIBILITY_TOGGLE_BUTTON_ACTIVE_CLASS =
  "border-blue-500 bg-blue-500 text-white hover:bg-blue-600 hover:text-white dark:border-blue-500 dark:bg-blue-500 dark:text-white dark:hover:bg-blue-400 dark:hover:text-white";
const WINDOW_MAXIMIZE_ICON = <i className="gg-maximize !scale-[.4]" />;
const WINDOWED_CHAT_ROUNDED_CLASS = "rounded-lg";
const DOCKED_WINDOWED_CHAT_ROUNDED_CLASS = "rounded-b-none rounded-t-lg";

function getChatWindowExitAnimationClass(
  kind: ChatWindowExitAnimationKind | null,
  placement: ChatWindowPlacementEnum,
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

function getChatWindowEnterAnimationClass(
  kind: ChatWindowEnterAnimationKind | null,
  placement: ChatWindowPlacementEnum,
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

type MinimizedPillStripProps = {
  pills: ResolvedWindowPill[];
  visiblePills: ResolvedWindowPill[];
  pillExitAnimationsById: Record<string, ChatWindowPillExitAnimationKind>;
  useCompactPills: boolean;
  canCreateWindow: boolean;
  showManagerMenu: boolean;
  canCycleBackward: boolean;
  canCycleForward: boolean;
  maxCycleStartIndex: number;
  pillDisplayMode: PillDisplayMode;
  pillViewportRef: React.RefObject<HTMLDivElement | null>;
  fullMeasureRowRef: React.RefObject<HTMLDivElement | null>;
  compactMeasureRowRef: React.RefObject<HTMLDivElement | null>;
  onCycleBackward: () => void;
  onCycleForward: () => void;
  onOpenWindow: (instanceId: string, source: "pill" | "menu") => void;
  onCreateWindow: () => void;
};

function MinimizedPillStrip({
  pills,
  visiblePills,
  pillExitAnimationsById,
  useCompactPills,
  canCreateWindow,
  showManagerMenu,
  canCycleBackward,
  canCycleForward,
  maxCycleStartIndex,
  pillDisplayMode,
  pillViewportRef,
  fullMeasureRowRef,
  compactMeasureRowRef,
  onCycleBackward,
  onCycleForward,
  onOpenWindow,
  onCreateWindow,
}: MinimizedPillStripProps) {
  const minimizedTabBaseClassName = `pointer-events-auto relative inline-flex h-7 shrink-0 items-center justify-center rounded-b-none rounded-t-md border border-b-transparent text-xs shadow-sm transition-colors will-change-transform ${buildPillBaseClass(false)}`;
  const createTabClassName = `${minimizedTabBaseClassName} w-7`;
  const chatMenuTriggerClassName = `${minimizedTabBaseClassName} w-7`;
  const [isManagerMenuOpen, setIsManagerMenuOpen] = useState(false);
  const stripItemNodesRef = useRef<Record<string, HTMLElement | null>>({});
  const previousStripItemRectsRef = useRef<Record<string, DOMRect>>({});
  const stripItemAnimationTimeoutsRef = useRef<Record<string, number>>({});
  const stripItemAnimationFrameRef = useRef<number | null>(null);
  const hasStripMountedRef = useRef(false);

  const clearStripItemAnimation = useCallback((itemKey: string) => {
    const activeTimeoutId = stripItemAnimationTimeoutsRef.current[itemKey];
    if (activeTimeoutId !== undefined) {
      window.clearTimeout(activeTimeoutId);
      delete stripItemAnimationTimeoutsRef.current[itemKey];
    }
    const node = stripItemNodesRef.current[itemKey];
    if (!node) {
      return;
    }
    delete node.dataset.chatPillLayoutAnimation;
    node.style.transition = "";
    node.style.transform = "";
  }, []);

  const setStripItemNode = useCallback(
    (itemKey: string) => (node: HTMLElement | null) => {
      if (node) {
        stripItemNodesRef.current[itemKey] = node;
        return;
      }
      delete stripItemNodesRef.current[itemKey];
      delete previousStripItemRectsRef.current[itemKey];
    },
    [],
  );

  const renderedStripItemKeys = useMemo(() => {
    const nextKeys: string[] = [];
    if (pillDisplayMode === "cycle") {
      nextKeys.push("cycle-left");
    }
    nextKeys.push("create");
    if (showManagerMenu) {
      nextKeys.push("manager");
    }
    if (pillDisplayMode !== "menu") {
      for (const pill of visiblePills) {
        nextKeys.push(`pill:${pill.instanceId}`);
      }
    }
    if (pillDisplayMode === "cycle") {
      nextKeys.push("cycle-right");
    }
    return nextKeys;
  }, [pillDisplayMode, showManagerMenu, visiblePills]);

  useEffect(() => {
    return () => {
      if (stripItemAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(stripItemAnimationFrameRef.current);
        stripItemAnimationFrameRef.current = null;
      }
      for (const timeoutId of Object.values(
        stripItemAnimationTimeoutsRef.current,
      )) {
        window.clearTimeout(timeoutId);
      }
      stripItemAnimationTimeoutsRef.current = {};
    };
  }, []);

  useLayoutEffect(() => {
    const nextRects: Record<string, DOMRect> = {};
    const animations: Array<{
      itemKey: string;
      node: HTMLElement;
      startingTransform: string;
      startingOpacity: string;
    }> = [];

    for (const itemKey of renderedStripItemKeys) {
      const node = stripItemNodesRef.current[itemKey];
      if (!node) {
        continue;
      }
      const nextRect = node.getBoundingClientRect();
      nextRects[itemKey] = nextRect;
      const previousRect = previousStripItemRectsRef.current[itemKey];
      if (previousRect) {
        const deltaX = previousRect.left - nextRect.left;
        const deltaY = previousRect.top - nextRect.top;
        if (Math.abs(deltaX) <= 0.5 && Math.abs(deltaY) <= 0.5) {
          continue;
        }
        clearStripItemAnimation(itemKey);
        node.dataset.chatPillLayoutAnimation = "active";
        node.style.transition = "none";
        node.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        animations.push({
          itemKey,
          node,
          startingTransform: "translate(0px, 0px)",
        });
        continue;
      }
      if (!hasStripMountedRef.current) {
        continue;
      }
      clearStripItemAnimation(itemKey);
      node.dataset.chatPillLayoutAnimation = "active";
      node.style.transition = "none";
      node.style.transform = "translateY(8px) scale(0.96)";
      animations.push({
        itemKey,
        node,
        startingTransform: "translateY(0px) scale(1)",
      });
    }

    previousStripItemRectsRef.current = nextRects;

    if (!hasStripMountedRef.current) {
      hasStripMountedRef.current = true;
      return;
    }
    if (animations.length === 0) {
      return;
    }
    if (stripItemAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(stripItemAnimationFrameRef.current);
    }
    stripItemAnimationFrameRef.current = window.requestAnimationFrame(() => {
      stripItemAnimationFrameRef.current = null;
      for (const animation of animations) {
        const { itemKey, node, startingTransform } = animation;
        node.style.transition = `transform ${CHAT_WINDOW_STRIP_LAYOUT_DURATION_MS}ms cubic-bezier(0.16,1,0.3,1)`;
        node.style.transform = startingTransform;
        const activeTimeoutId = stripItemAnimationTimeoutsRef.current[itemKey];
        if (activeTimeoutId !== undefined) {
          window.clearTimeout(activeTimeoutId);
        }
        stripItemAnimationTimeoutsRef.current[itemKey] = window.setTimeout(
          () => {
            delete stripItemAnimationTimeoutsRef.current[itemKey];
            if (stripItemNodesRef.current[itemKey] !== node) {
              return;
            }
            clearStripItemAnimation(itemKey);
          },
          CHAT_WINDOW_STRIP_LAYOUT_DURATION_MS,
        );
      }
    });
  }, [clearStripItemAnimation, renderedStripItemKeys]);

  return (
    <div
      ref={pillViewportRef}
      className="relative ml-auto flex min-w-0 max-w-full items-end justify-end gap-1 px-2"
    >
      <div
        className="pointer-events-none absolute left-0 top-0 h-0 overflow-hidden opacity-0"
        aria-hidden="true"
      >
        <div ref={fullMeasureRowRef} className="flex w-max items-center gap-1">
          <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-b-none rounded-t-md border border-b-transparent bg-setta-100">
            <MdAdd size={14} />
          </div>
          {showManagerMenu ? (
            <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-b-none rounded-t-md border border-b-transparent bg-setta-100">
              <RiChat3Line size={14} />
            </div>
          ) : null}
          {pills.map((pill) => (
            <div
              key={`measure-full-${pill.instanceId}`}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-b-none rounded-t-md border border-b-transparent bg-setta-100 px-2 text-xs"
            >
              <ProjectChatWindowIcon
                mode={pill.mode}
                instanceId={pill.instanceId}
                sectionId={pill.sectionId}
                className="inline-flex shrink-0 items-center justify-center text-setta-600 dark:text-setta-300"
              />
              <span className="max-w-[9.5rem] truncate">{pill.title}</span>
            </div>
          ))}
        </div>
        <div
          ref={compactMeasureRowRef}
          className="mt-1 flex w-max items-center gap-1"
        >
          <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-b-none rounded-t-md border border-b-transparent bg-setta-100">
            <MdAdd size={14} />
          </div>
          {showManagerMenu ? (
            <div className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-b-none rounded-t-md border border-b-transparent bg-setta-100">
              <RiChat3Line size={14} />
            </div>
          ) : null}
          {pills.map((pill) => (
            <div
              key={`measure-compact-${pill.instanceId}`}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-b-none rounded-t-md border border-b-transparent bg-setta-100"
            >
              <ProjectChatWindowIcon
                mode={pill.mode}
                instanceId={pill.instanceId}
                sectionId={pill.sectionId}
                className="inline-flex items-center justify-center text-setta-600 dark:text-setta-300"
              />
            </div>
          ))}
        </div>
      </div>
      {pillDisplayMode === "cycle" ? (
        <button
          type="button"
          className="pointer-events-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-setta-300 bg-setta-50 text-setta-700 shadow-sm transition-colors enabled:hover:bg-setta-100 enabled:hover:text-setta-900 disabled:cursor-not-allowed disabled:opacity-45 dark:border-setta-700 dark:bg-setta-860 dark:text-setta-200 dark:enabled:hover:bg-setta-800 dark:enabled:hover:text-setta-50"
          ref={setStripItemNode("cycle-left")}
          onClick={onCycleBackward}
          disabled={!canCycleBackward}
          aria-label={getWindowControlQuickInfoText({
            action: "show_previous_chat_windows",
          })}
          data-testid="project-chat-bottom-dock-cycle-left"
          {...getWindowControlQuickInfoHandlers({
            action: "show_previous_chat_windows",
          })}
        >
          <MdChevronLeft size={14} />
        </button>
      ) : null}
      <div className="flex min-w-0 items-end justify-end gap-1 overflow-hidden">
        {canCreateWindow ? (
          <button
            type="button"
            className={createTabClassName}
            ref={setStripItemNode("create")}
            onClick={onCreateWindow}
            aria-label={getWindowControlQuickInfoText({
              action: "create_chat_window",
            })}
            data-testid="project-chat-bottom-dock-create"
            title={getWindowControlQuickInfoText({
              action: "create_chat_window",
            })}
            {...getWindowControlQuickInfoHandlers({
              action: "create_chat_window",
            })}
          >
            <MdAdd size={14} />
          </button>
        ) : null}
        {showManagerMenu ? (
          <DropdownMenu.Root
            modal={false}
            open={isManagerMenuOpen}
            onOpenChange={setIsManagerMenuOpen}
          >
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className={chatMenuTriggerClassName}
                ref={setStripItemNode("manager")}
                aria-label={getWindowControlQuickInfoText({
                  action: "show_chat_windows",
                })}
                title={getWindowControlQuickInfoText({
                  action: "show_chat_windows",
                })}
                data-testid="project-chat-bottom-dock-menu-trigger"
                {...getWindowControlQuickInfoHandlers({
                  action: "show_chat_windows",
                })}
              >
                <RiChat3Line size={14} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                side="top"
                sideOffset={6}
                className="bg-white/98 shadow-slate-950/12 dark:bg-setta-930/98 z-[80] min-w-[15rem] rounded-xl border border-setta-200 p-1 shadow-xl backdrop-blur-md dark:border-setta-800"
                data-testid="project-chat-bottom-dock-menu-content"
              >
                <ProjectChatManager
                  onAfterAction={() => {
                    setIsManagerMenuOpen(false);
                  }}
                />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : null}
        {pillDisplayMode !== "menu"
          ? visiblePills.map((pill) => {
              const baseClass = minimizedTabBaseClassName;
              if (useCompactPills) {
                const pillExitAnimation =
                  pillExitAnimationsById[pill.instanceId];
                return (
                  <button
                    key={pill.instanceId}
                    type="button"
                    className={`${baseClass} w-7 ${pill.isClosed ? "opacity-65" : ""} ${
                      pillExitAnimation
                        ? "pointer-events-none translate-y-2 scale-[0.94] opacity-0 transition-[transform,opacity] duration-[72ms] ease-[cubic-bezier(0.32,0,0.15,1)] motion-reduce:transition-none"
                        : ""
                    }`}
                    onClick={() => {
                      onOpenWindow(pill.instanceId, "pill");
                    }}
                    ref={setStripItemNode(`pill:${pill.instanceId}`)}
                    title={pill.title}
                    aria-label={pill.title}
                    data-testid="project-chat-bottom-dock-pill"
                    data-chat-window-instance-id={pill.instanceId}
                    data-chat-window-pill-exit-animation={
                      pillExitAnimationsById[pill.instanceId] ?? undefined
                    }
                  >
                    <ProjectChatWindowIcon
                      mode={pill.mode}
                      instanceId={pill.instanceId}
                      sectionId={pill.sectionId}
                      className="inline-flex items-center justify-center text-setta-600 dark:text-setta-300"
                      dataTestId="project-chat-bottom-dock-pill-icon"
                    />
                  </button>
                );
              }
              const pillExitAnimation = pillExitAnimationsById[pill.instanceId];
              return (
                <button
                  key={pill.instanceId}
                  type="button"
                  className={`${baseClass} min-w-0 gap-1 px-2 ${pill.isClosed ? "opacity-65" : ""} ${
                    pillExitAnimation
                      ? "pointer-events-none translate-y-2 scale-[0.94] opacity-0 transition-[transform,opacity] duration-[72ms] ease-[cubic-bezier(0.32,0,0.15,1)] motion-reduce:transition-none"
                      : ""
                  }`}
                  onClick={() => {
                    onOpenWindow(pill.instanceId, "pill");
                  }}
                  ref={setStripItemNode(`pill:${pill.instanceId}`)}
                  title={pill.title}
                  data-testid="project-chat-bottom-dock-pill"
                  data-chat-window-instance-id={pill.instanceId}
                  data-chat-window-pill-exit-animation={
                    pillExitAnimationsById[pill.instanceId] ?? undefined
                  }
                >
                  <ProjectChatWindowIcon
                    mode={pill.mode}
                    instanceId={pill.instanceId}
                    sectionId={pill.sectionId}
                    className="inline-flex shrink-0 items-center justify-center text-setta-600 dark:text-setta-300"
                    dataTestId="project-chat-bottom-dock-pill-icon"
                  />
                  <span className="max-w-[9.5rem] truncate">{pill.title}</span>
                </button>
              );
            })
          : null}
      </div>
      {pillDisplayMode === "cycle" ? (
        <button
          type="button"
          className="pointer-events-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-setta-300 bg-setta-50 text-setta-700 shadow-sm transition-colors enabled:hover:bg-setta-100 enabled:hover:text-setta-900 disabled:cursor-not-allowed disabled:opacity-45 dark:border-setta-700 dark:bg-setta-860 dark:text-setta-200 dark:enabled:hover:bg-setta-800 dark:enabled:hover:text-setta-50"
          ref={setStripItemNode("cycle-right")}
          onClick={onCycleForward}
          disabled={!canCycleForward || maxCycleStartIndex === 0}
          aria-label={getWindowControlQuickInfoText({
            action: "show_more_chat_windows",
          })}
          data-testid="project-chat-bottom-dock-cycle-right"
          {...getWindowControlQuickInfoHandlers({
            action: "show_more_chat_windows",
          })}
        >
          <MdChevronRight size={14} />
        </button>
      ) : null}
    </div>
  );
}

export function ProjectChatBottomDock() {
  const hasViewModeTabs = useHasViewModeTabs();
  const { canEditLayout } = useShareCapabilities();
  const activeSectionUiId = useActiveSectionUI(
    (state) => state.activeIds[0] ?? null,
  );
  const { isDeploymentMode, allowLLM } = useShareSession((state) => ({
    isDeploymentMode: state.isDeploymentMode,
    allowLLM: state.sharePolicy?.allowLLM ?? false,
  }));
  const canUseManagedChat = canUseManagedChatLLM({
    isDeploymentMode,
    allowLLM,
  });
  const canCreateManagedChatWindow = canEditLayout && canUseManagedChat;
  const autoCreateInitialChat = useSettings(
    (state) => state.chatWindowing?.autoCreateInitialChat ?? true,
  );
  const chatWindowingShortcuts = useSettings(
    (state) => ({
      canvasToggle:
        state.chatWindowing?.shortcuts?.canvasToggle ?? "Shift + Esc",
      maximizeFocused:
        state.chatWindowing?.shortcuts?.maximizeFocused ??
        "Mod + Shift + Enter",
      minimizeFocused:
        state.chatWindowing?.shortcuts?.minimizeFocused ?? "Mod + Shift + M",
      snapLeft:
        state.chatWindowing?.shortcuts?.snapLeft ?? "Mod + Alt + ArrowLeft",
      snapRight:
        state.chatWindowing?.shortcuts?.snapRight ?? "Mod + Alt + ArrowRight",
      snapTop: state.chatWindowing?.shortcuts?.snapTop ?? "Mod + Alt + ArrowUp",
      snapBottom:
        state.chatWindowing?.shortcuts?.snapBottom ?? "Mod + Alt + ArrowDown",
    }),
    _.isEqual,
  );
  const {
    projectConfigId,
    order,
    instancesById,
    sectionNamesById,
    durableActiveSectionId,
  } = useProjectState(
    (state) => ({
      projectConfigId: state.projectConfig.id,
      order: state.projectChatWindowing.order,
      instancesById: state.projectChatWindowing.instancesById,
      durableActiveSectionId: state.projectConfig.activeIds[0] ?? null,
      sectionNamesById: Object.fromEntries(
        Object.entries(state.sections).map(([sectionId, section]) => [
          sectionId,
          section.name,
        ]),
      ),
    }),
    _.isEqual,
  );
  const activeSectionId = resolveProjectChatShortcutActiveSectionId(
    activeSectionUiId,
    durableActiveSectionId,
  );
  const { sections, sectionVariants, sectionImpls, sectionVariantMap } =
    useProjectState(
      (state) => ({
        sections: state.sections,
        sectionVariants: state.sectionVariants,
        sectionImpls: state.sectionImpls,
        sectionVariantMap: state.projectConfig.sectionVariantMap,
      }),
      shallow,
    );
  const managedChatAuthorityState = useMemo(
    () => ({
      projectConfig: {
        sectionVariantMap,
      },
      sections,
      sectionVariants,
      sectionImpls,
    }),
    [sectionImpls, sectionVariantMap, sectionVariants, sections],
  );
  const { overviewTrueWidth, uiEditorTrueWidth } = useLocalStorage(
    (state) => ({
      overviewTrueWidth: state.overviewTrueWidth,
      uiEditorTrueWidth: state.uiEditorTrueWidth,
    }),
    _.isEqual,
  );
  const trackedGitPaneGraphWindowInstanceKey = useMisc(
    (state) => state.projectChatTrackedGitPaneGraphWindowInstanceId,
  );
  const trackedGitPaneGraphWindowInstanceId = useMemo(
    () => getTrackedGitPaneGraphWindowInstanceIdForProject(projectConfigId),
    [projectConfigId, trackedGitPaneGraphWindowInstanceKey],
  );
  const [pillDisplayMode, setPillDisplayMode] =
    useState<PillDisplayMode>("full");
  const [pillCycleStartIndex, setPillCycleStartIndex] = useState(0);
  const [dockCycleOffsetFromEnd, setDockCycleOffsetFromEnd] = useState(0);
  const [pillViewportWidthPx, setPillViewportWidthPx] = useState(0);
  const [viewportWidthPx, setViewportWidthPx] = useState(0);
  const [viewportHeightPx, setViewportHeightPx] = useState(0);
  const [workspaceTopInsetPx, setWorkspaceTopInsetPx] = useState(
    FALLBACK_WORKSPACE_TOP_INSET_PX,
  );
  const [isCanvasVisibilitySuppressed, setIsCanvasVisibilitySuppressed] =
    useState(false);
  const [floatingPreviewBoundsById, setFloatingPreviewBoundsById] = useState<
    Record<string, ChatWindowBounds>
  >({});
  const [activeFloatingSnapPreview, setActiveFloatingSnapPreview] =
    useState<ActiveFloatingSnapPreview | null>(null);
  const [dockPreviewWidthsById, setDockPreviewWidthsById] = useState<
    Record<string, number>
  >({});
  const [dockPreviewHeightsById, setDockPreviewHeightsById] = useState<
    Record<string, number>
  >({});
  const [windowExitAnimationsById, setWindowExitAnimationsById] = useState<
    Record<string, ChatWindowExitAnimationKind>
  >({});
  const [windowEnterAnimationsById, setWindowEnterAnimationsById] = useState<
    Record<string, ChatWindowEnterAnimationKind>
  >({});
  const [pillExitAnimationsById, setPillExitAnimationsById] = useState<
    Record<string, ChatWindowPillExitAnimationKind>
  >({});
  const [windowEnterAnimationPrimesById, setWindowEnterAnimationPrimesById] =
    useState<Record<string, ChatWindowEnterAnimationKind>>({});
  const [trackedGitPaneGraphRect, setTrackedGitPaneGraphRect] =
    useState<PaneTrackedRect | null>(null);
  const dockBottomOffsetPx = hasViewModeTabs ? VIEW_MODE_TABS_HEIGHT_PX : 0;
  const floatingBottomInsetPx = dockBottomOffsetPx;
  const pillViewportRef = useRef<HTMLDivElement | null>(null);
  const fullMeasureRowRef = useRef<HTMLDivElement | null>(null);
  const compactMeasureRowRef = useRef<HTMLDivElement | null>(null);
  const activeSingleDockResizeRef = useRef<ActiveSingleDockResize | null>(null);
  const activeFloatingDragRef = useRef<ActiveFloatingDrag | null>(null);
  const activeFloatingResizeRef = useRef<ActiveFloatingResize | null>(null);
  const activeFloatingSnapResizeRef = useRef<ActiveFloatingSnapResize | null>(
    null,
  );
  const autoCreateProjectConfigIdRef = useRef<string | null>(null);
  const activeFloatingSnapPreviewRef = useRef<ActiveFloatingSnapPreview | null>(
    null,
  );
  const windowExitTimeoutsRef = useRef<Record<string, number>>({});
  const pillExitTimeoutsRef = useRef<Record<string, number>>({});
  const windowEnterPrimeTimeoutsRef = useRef<Record<string, number>>({});
  const windowEnterAnimationTimeoutsRef = useRef<Record<string, number>>({});
  const floatingPreviewBoundsRef = useRef<Record<string, ChatWindowBounds>>({});
  const queuedFloatingPreviewBoundsRef = useRef<Record<
    string,
    ChatWindowBounds
  > | null>(null);
  const floatingPreviewAnimationFrameRef = useRef<number | null>(null);
  const floatingRestoreBoundsByIdRef = useRef<Record<string, ChatWindowBounds>>(
    {},
  );

  useEffect(() => {
    if (!canUseManagedChat) {
      return;
    }
    if (!canEditLayout) {
      return;
    }
    if (!autoCreateInitialChat) {
      return;
    }
    if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
      return;
    }
    if (order.length > 0) {
      return;
    }
    if (autoCreateProjectConfigIdRef.current === projectConfigId) {
      return;
    }
    autoCreateProjectConfigIdRef.current = projectConfigId;
    createProjectChatWindowInstance();
  }, [
    autoCreateInitialChat,
    canEditLayout,
    canUseManagedChat,
    order.length,
    projectConfigId,
  ]);

  useEffect(() => {
    const viewportNode = pillViewportRef.current;
    if (!viewportNode) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const nextWidthPx = entries[0]?.contentRect.width;
      if (!nextWidthPx) {
        return;
      }
      setPillViewportWidthPx(nextWidthPx);
    });
    observer.observe(viewportNode);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let frameRequestId: number | null = null;
    const applyViewportResize = () => {
      frameRequestId = null;
      setViewportWidthPx((current) =>
        current === window.innerWidth ? current : window.innerWidth,
      );
      setViewportHeightPx((current) =>
        current === window.innerHeight ? current : window.innerHeight,
      );
      const pane = document.querySelector(".react-flow__pane");
      if (!(pane instanceof HTMLElement)) {
        return;
      }
      const nextTopInsetPx = pane.getBoundingClientRect().top;
      if (Number.isFinite(nextTopInsetPx) && nextTopInsetPx > 0) {
        setWorkspaceTopInsetPx((current) => {
          if (Math.abs(nextTopInsetPx - current) <= 0.5) {
            return current;
          }
          return nextTopInsetPx;
        });
      }
    };
    const scheduleViewportResize = () => {
      if (frameRequestId !== null) {
        return;
      }
      frameRequestId = window.requestAnimationFrame(applyViewportResize);
    };
    applyViewportResize();
    const delayedRefreshTimer = window.setTimeout(scheduleViewportResize, 180);
    window.addEventListener("resize", scheduleViewportResize);
    return () => {
      if (frameRequestId !== null) {
        window.cancelAnimationFrame(frameRequestId);
      }
      window.clearTimeout(delayedRefreshTimer);
      window.removeEventListener("resize", scheduleViewportResize);
    };
  }, []);

  useLayoutEffect(() => {
    if (!trackedGitPaneGraphWindowInstanceId) {
      setTrackedGitPaneGraphRect(null);
      return;
    }
    const left = overviewTrueWidth;
    const top = workspaceTopInsetPx;
    const width = viewportWidthPx - overviewTrueWidth - uiEditorTrueWidth;
    const height = viewportHeightPx - workspaceTopInsetPx - dockBottomOffsetPx;
    if (width <= 0 || height <= 0) {
      setTrackedGitPaneGraphRect(null);
      return;
    }
    const nextRect: PaneTrackedRect = {
      left,
      top,
      width,
      height,
    };
    setTrackedGitPaneGraphRect((current) => {
      if (
        current &&
        Math.abs(current.left - nextRect.left) <= 0.5 &&
        Math.abs(current.top - nextRect.top) <= 0.5 &&
        Math.abs(current.width - nextRect.width) <= 0.5 &&
        Math.abs(current.height - nextRect.height) <= 0.5
      ) {
        return current;
      }
      return nextRect;
    });
  }, [
    dockBottomOffsetPx,
    overviewTrueWidth,
    trackedGitPaneGraphWindowInstanceId,
    uiEditorTrueWidth,
    workspaceTopInsetPx,
    viewportHeightPx,
    viewportWidthPx,
  ]);

  useEffect(() => {
    return () => {
      if (floatingPreviewAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(floatingPreviewAnimationFrameRef.current);
      }
      floatingPreviewAnimationFrameRef.current = null;
      queuedFloatingPreviewBoundsRef.current = null;
      for (const timeoutId of Object.values(windowExitTimeoutsRef.current)) {
        window.clearTimeout(timeoutId);
      }
      windowExitTimeoutsRef.current = {};
      for (const timeoutId of Object.values(pillExitTimeoutsRef.current)) {
        window.clearTimeout(timeoutId);
      }
      pillExitTimeoutsRef.current = {};
      for (const timeoutId of Object.values(
        windowEnterPrimeTimeoutsRef.current,
      )) {
        window.clearTimeout(timeoutId);
      }
      windowEnterPrimeTimeoutsRef.current = {};
      for (const timeoutId of Object.values(
        windowEnterAnimationTimeoutsRef.current,
      )) {
        window.clearTimeout(timeoutId);
      }
      windowEnterAnimationTimeoutsRef.current = {};
    };
  }, []);

  useEffect(() => {
    floatingPreviewBoundsRef.current = floatingPreviewBoundsById;
  }, [floatingPreviewBoundsById]);

  const orderedPills = useMemo<ResolvedWindowPill[]>(() => {
    const output: ResolvedWindowPill[] = [];
    const seen = new Set<string>();
    const maybePushPill = (
      instanceId: string,
      instance: (typeof instancesById)[string] | undefined,
    ) => {
      if (!instance) {
        return;
      }
      if (
        !canUseManagedChat &&
        windowSurfaceRequiresManagedChat(instance, managedChatAuthorityState)
      ) {
        return;
      }
      if (
        instance.sectionIdOrNull &&
        !Object.hasOwn(sectionNamesById, instance.sectionIdOrNull)
      ) {
        return;
      }
      output.push({
        instanceId,
        title: buildProjectChatWindowTitle(
          instance.mode,
          instanceId,
          instance.sectionIdOrNull,
          instance.title,
          sectionNamesById,
        ),
        mode: instance.mode,
        isClosed: instance.isClosed,
        isMinimized: instance.isMinimized,
        placement: instance.placement,
        zIndex: instance.zIndex,
        bounds: instance.bounds,
        dockWidthFraction: instance.dockMetrics.widthFraction,
        dockPreferredWidthPx: instance.dockMetrics.preferredWidthPx,
        sectionId: instance.sectionIdOrNull,
        chatId: instance.chatId,
      });
    };
    for (const instanceId of order) {
      if (seen.has(instanceId)) {
        continue;
      }
      seen.add(instanceId);
      maybePushPill(instanceId, instancesById[instanceId]);
    }
    for (const [instanceId, instance] of Object.entries(instancesById)) {
      if (seen.has(instanceId)) {
        continue;
      }
      maybePushPill(instanceId, instance);
    }
    return output;
  }, [
    canUseManagedChat,
    instancesById,
    managedChatAuthorityState,
    order,
    sectionNamesById,
  ]);

  const openDockedPills = useMemo(
    () =>
      orderedPills.filter(
        (pill) =>
          !pill.isClosed &&
          !pill.isMinimized &&
          pill.placement === ChatWindowPlacementEnum.bottom_docked,
      ),
    [orderedPills],
  );
  const minimizedPills = useMemo(
    () => orderedPills.filter((pill) => pill.isMinimized),
    [orderedPills],
  );
  const nonClosedPills = useMemo(
    () => orderedPills.filter((pill) => !pill.isClosed),
    [orderedPills],
  );

  const openFloatingPills = useMemo(
    () =>
      orderedPills
        .filter(
          (pill) =>
            !pill.isClosed &&
            !pill.isMinimized &&
            pill.placement === ChatWindowPlacementEnum.floating,
        )
        .sort((a, b) => a.zIndex - b.zIndex),
    [orderedPills],
  );

  const openMaximizedWindow = useMemo(() => {
    let activeWindow: ResolvedWindowPill | null = null;
    for (const pill of orderedPills) {
      if (
        pill.isClosed ||
        pill.isMinimized ||
        pill.placement !== ChatWindowPlacementEnum.maximized
      ) {
        continue;
      }
      if (!activeWindow || pill.zIndex > activeWindow.zIndex) {
        activeWindow = pill;
      }
    }
    return activeWindow;
  }, [orderedPills]);

  const hasOverlayWindows =
    openDockedPills.length > 0 ||
    openFloatingPills.length > 0 ||
    openMaximizedWindow !== null;

  const activeVisibleWindowId = useMemo(() => {
    if (isCanvasVisibilitySuppressed) {
      return null;
    }
    let activeWindow: ResolvedWindowPill | null = null;
    for (const pill of orderedPills) {
      if (
        pill.isClosed ||
        pill.isMinimized ||
        (pill.placement !== ChatWindowPlacementEnum.bottom_docked &&
          pill.placement !== ChatWindowPlacementEnum.floating &&
          pill.placement !== ChatWindowPlacementEnum.maximized)
      ) {
        continue;
      }
      if (!activeWindow || pill.zIndex > activeWindow.zIndex) {
        activeWindow = pill;
      }
    }
    return activeWindow?.instanceId ?? null;
  }, [isCanvasVisibilitySuppressed, orderedPills]);

  const activeDockedWindowId = useMemo(() => {
    let activeWindow: ResolvedWindowPill | null = null;
    for (const pill of openDockedPills) {
      if (!activeWindow || pill.zIndex > activeWindow.zIndex) {
        activeWindow = pill;
      }
    }
    return activeWindow?.instanceId ?? null;
  }, [openDockedPills]);

  const activeFloatingWindowId = useMemo(() => {
    let activeWindow: ResolvedWindowPill | null = null;
    for (const pill of openFloatingPills) {
      if (!activeWindow || pill.zIndex > activeWindow.zIndex) {
        activeWindow = pill;
      }
    }
    return activeWindow?.instanceId ?? null;
  }, [openFloatingPills]);

  const floatingWindowBoundaryInsets = useMemo(
    () =>
      resolveProjectChatFloatingBoundaryInsets(
        workspaceTopInsetPx,
        floatingBottomInsetPx,
      ),
    [floatingBottomInsetPx, workspaceTopInsetPx],
  );
  const floatingBoundsById = useMemo(() => {
    const nextBoundsById: Record<string, ChatWindowBounds> = {};
    for (const pill of openFloatingPills) {
      nextBoundsById[pill.instanceId] =
        floatingPreviewBoundsById[pill.instanceId] ?? pill.bounds;
    }
    return nextBoundsById;
  }, [floatingPreviewBoundsById, openFloatingPills]);
  const snappedFloatingWindows = useMemo(() => {
    if (viewportWidthPx <= 0 || viewportHeightPx <= 0) {
      return [];
    }
    return openFloatingPills.flatMap((pill) => {
      const bounds = floatingBoundsById[pill.instanceId];
      if (!bounds) {
        return [];
      }
      const snapPreset = resolveFloatingSnapPresetFromBounds(
        bounds,
        viewportWidthPx,
        viewportHeightPx,
        floatingWindowBoundaryInsets,
      );
      if (!snapPreset) {
        return [];
      }
      return [
        {
          instanceId: pill.instanceId,
          bounds,
          snapPreset,
        },
      ];
    });
  }, [
    floatingBoundsById,
    floatingWindowBoundaryInsets,
    openFloatingPills,
    viewportHeightPx,
    viewportWidthPx,
  ]);
  const floatingSnapPresetById = useMemo(() => {
    const nextPresetById: Record<string, FloatingSnapPreset> = {};
    for (const snappedWindow of snappedFloatingWindows) {
      nextPresetById[snappedWindow.instanceId] = snappedWindow.snapPreset;
    }
    return nextPresetById;
  }, [snappedFloatingWindows]);
  const floatingSnapResizeHandles = useMemo(
    () => buildFloatingSnapResizeHandles(snappedFloatingWindows),
    [snappedFloatingWindows],
  );

  const dockAvailableHeightPx = useMemo(() => {
    const fallbackViewportHeight = 900;
    const resolvedViewportHeight =
      viewportHeightPx > 0 ? viewportHeightPx : fallbackViewportHeight;
    return Math.max(
      MIN_DOCK_CHAT_HEIGHT_PX,
      resolvedViewportHeight - workspaceTopInsetPx - dockBottomOffsetPx,
    );
  }, [dockBottomOffsetPx, viewportHeightPx, workspaceTopInsetPx]);
  const defaultDockWindowHeightPx = useMemo(
    () =>
      resolveDefaultDockedChatHeightPx({
        viewportHeightPx,
        workspaceTopInsetPx,
        bottomInsetPx: dockBottomOffsetPx,
        minHeightPx: MIN_DOCK_CHAT_HEIGHT_PX,
      }),
    [dockBottomOffsetPx, viewportHeightPx, workspaceTopInsetPx],
  );
  const dockSurfaceRightPx =
    SIDE_RAIL_WIDTH_PX + DOCK_SURFACE_HORIZONTAL_MARGIN_PX;
  const showDockManagerMenu =
    canCreateManagedChatWindow || orderedPills.length > 0;
  const dockStripReservedWidthPx = resolveDockStripReservedWidthPx({
    nonClosedChatCount: nonClosedPills.length,
    showManagerMenu: showDockManagerMenu,
  });
  const dockSurfaceAvailableWidthPx = useMemo(() => {
    const fallbackViewportWidth =
      DOCK_SURFACE_MAX_WIDTH_PX +
      (SIDE_RAIL_WIDTH_PX + DOCK_SURFACE_HORIZONTAL_MARGIN_PX) * 2 +
      dockStripReservedWidthPx;
    const resolvedViewportWidth =
      viewportWidthPx > 0 ? viewportWidthPx : fallbackViewportWidth;
    const usableViewportWidthPx =
      resolvedViewportWidth -
      (SIDE_RAIL_WIDTH_PX + DOCK_SURFACE_HORIZONTAL_MARGIN_PX) * 2 -
      dockStripReservedWidthPx;
    return clampNumber(usableViewportWidthPx, 0, DOCK_SURFACE_MAX_WIDTH_PX);
  }, [dockStripReservedWidthPx, viewportWidthPx]);

  const baseDockWindowWidthsById = useMemo(() => {
    const nextWidthsById: Record<string, number> = {};
    for (const pill of openDockedPills) {
      const candidateWidthPx =
        typeof pill.dockPreferredWidthPx === "number" &&
        Number.isFinite(pill.dockPreferredWidthPx) &&
        pill.dockPreferredWidthPx > 0
          ? pill.dockPreferredWidthPx
          : DOCK_WINDOW_DEFAULT_WIDTH_PX;
      nextWidthsById[pill.instanceId] = clampNumber(
        candidateWidthPx,
        MIN_DOCK_CHAT_WIDTH_PX,
        DOCK_SURFACE_MAX_WIDTH_PX,
      );
    }
    return nextWidthsById;
  }, [openDockedPills]);

  const baseDockWindowHeightsById = useMemo(() => {
    const nextHeightsById: Record<string, number> = {};
    for (const pill of openDockedPills) {
      const candidateHeightPx =
        typeof pill.bounds.height === "number" &&
        Number.isFinite(pill.bounds.height) &&
        pill.bounds.height > 0
          ? pill.bounds.height
          : DOCK_WINDOW_DEFAULT_HEIGHT_PX;
      const shouldUseAutoFillHeight =
        Math.abs(candidateHeightPx - DOCK_WINDOW_DEFAULT_HEIGHT_PX) <= 0.5;
      const resolvedHeightPx = shouldUseAutoFillHeight
        ? defaultDockWindowHeightPx
        : candidateHeightPx;
      nextHeightsById[pill.instanceId] = clampNumber(
        resolvedHeightPx,
        MIN_DOCK_CHAT_HEIGHT_PX,
        dockAvailableHeightPx,
      );
    }
    return nextHeightsById;
  }, [defaultDockWindowHeightPx, dockAvailableHeightPx, openDockedPills]);

  const resolvedDockWindowWidthsById = useMemo(() => {
    const nextWidthsById: Record<string, number> = {
      ...baseDockWindowWidthsById,
    };
    for (const [instanceId, previewWidthPx] of Object.entries(
      dockPreviewWidthsById,
    )) {
      if (!nextWidthsById[instanceId]) {
        continue;
      }
      nextWidthsById[instanceId] = clampNumber(
        previewWidthPx,
        MIN_DOCK_CHAT_WIDTH_PX,
        DOCK_SURFACE_MAX_WIDTH_PX,
      );
    }
    return nextWidthsById;
  }, [baseDockWindowWidthsById, dockPreviewWidthsById]);

  const resolvedDockWindowHeightsById = useMemo(() => {
    const nextHeightsById: Record<string, number> = {
      ...baseDockWindowHeightsById,
    };
    for (const [instanceId, previewHeightPx] of Object.entries(
      dockPreviewHeightsById,
    )) {
      if (!nextHeightsById[instanceId]) {
        continue;
      }
      nextHeightsById[instanceId] = clampNumber(
        previewHeightPx,
        MIN_DOCK_CHAT_HEIGHT_PX,
        dockAvailableHeightPx,
      );
    }
    return nextHeightsById;
  }, [
    baseDockWindowHeightsById,
    dockAvailableHeightPx,
    dockPreviewHeightsById,
  ]);

  const dockedWindowIdsKey = useMemo(
    () => openDockedPills.map((pill) => pill.instanceId).join("|"),
    [openDockedPills],
  );
  const maxVisibleDockedCount = useMemo(
    () =>
      resolveMaxVisibleDockWindowCount(
        openDockedPills.length,
        dockSurfaceAvailableWidthPx,
      ),
    [dockSurfaceAvailableWidthPx, openDockedPills.length],
  );
  const maxDockCycleOffset = Math.max(
    0,
    openDockedPills.length - maxVisibleDockedCount,
  );
  const dockVisibleStartIndex =
    maxVisibleDockedCount === 0
      ? openDockedPills.length
      : Math.max(0, maxDockCycleOffset - dockCycleOffsetFromEnd);
  const visibleDockedPills = useMemo(() => {
    if (maxVisibleDockedCount === 0) {
      return [] as ResolvedWindowPill[];
    }
    return openDockedPills.slice(
      dockVisibleStartIndex,
      dockVisibleStartIndex + maxVisibleDockedCount,
    );
  }, [dockVisibleStartIndex, maxVisibleDockedCount, openDockedPills]);
  const responsiveHiddenDockedIds = useMemo(() => {
    const visibleIds = new Set(
      visibleDockedPills.map((pill) => pill.instanceId),
    );
    return new Set(
      openDockedPills
        .filter((pill) => !visibleIds.has(pill.instanceId))
        .map((pill) => pill.instanceId),
    );
  }, [openDockedPills, visibleDockedPills]);
  const stripPills = useMemo(
    () =>
      orderedPills.filter(
        (pill) =>
          pill.isMinimized || responsiveHiddenDockedIds.has(pill.instanceId),
      ),
    [orderedPills, responsiveHiddenDockedIds],
  );
  const resolvedVisibleDockWindowWidthsById = useMemo(
    () =>
      resolveDockWindowWidthsToFit(
        visibleDockedPills,
        resolvedDockWindowWidthsById,
        dockSurfaceAvailableWidthPx,
      ),
    [
      dockSurfaceAvailableWidthPx,
      resolvedDockWindowWidthsById,
      visibleDockedPills,
    ],
  );

  const floatingWindowIdsKey = useMemo(
    () => openFloatingPills.map((pill) => pill.instanceId).join("|"),
    [openFloatingPills],
  );

  useEffect(() => {
    activeSingleDockResizeRef.current = null;
    const allowedDockedWindowIds = new Set(
      dockedWindowIdsKey
        .split("|")
        .map((windowId) => windowId.trim())
        .filter((windowId) => windowId.length > 0),
    );
    setDockPreviewWidthsById((current) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [instanceId, previewWidthPx] of Object.entries(current)) {
        if (!allowedDockedWindowIds.has(instanceId)) {
          changed = true;
          continue;
        }
        next[instanceId] = previewWidthPx;
      }
      return changed ? next : current;
    });
    setDockPreviewHeightsById((current) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [instanceId, previewHeightPx] of Object.entries(current)) {
        if (!allowedDockedWindowIds.has(instanceId)) {
          changed = true;
          continue;
        }
        next[instanceId] = previewHeightPx;
      }
      return changed ? next : current;
    });
  }, [dockedWindowIdsKey]);

  useEffect(() => {
    setDockCycleOffsetFromEnd((current) =>
      clampNumber(current, 0, maxDockCycleOffset),
    );
  }, [maxDockCycleOffset]);

  useEffect(() => {
    activeFloatingDragRef.current = null;
    activeFloatingResizeRef.current = null;
    activeFloatingSnapResizeRef.current = null;
    activeFloatingSnapPreviewRef.current = null;
    setActiveFloatingSnapPreview(null);
    if (!floatingWindowIdsKey) {
      setFloatingPreviewBoundsById({});
      return;
    }
    const allowedIds = new Set(
      openFloatingPills.map((pill) => pill.instanceId),
    );
    setFloatingPreviewBoundsById((current) => {
      let changed = false;
      const next: Record<string, ChatWindowBounds> = {};
      for (const [instanceId, bounds] of Object.entries(current)) {
        if (!allowedIds.has(instanceId)) {
          changed = true;
          continue;
        }
        next[instanceId] = bounds;
      }
      return changed ? next : current;
    });
  }, [floatingWindowIdsKey]);

  useEffect(() => {
    if (hasOverlayWindows) {
      return;
    }
    setIsCanvasVisibilitySuppressed(false);
  }, [hasOverlayWindows]);

  const showDockedChatSurface =
    visibleDockedPills.length > 0 && !isCanvasVisibilitySuppressed;
  const dockSurfaceTargetWidthPx = useMemo(() => {
    if (visibleDockedPills.length === 0) {
      return 0;
    }
    let totalWindowWidthsPx = 0;
    for (const pill of visibleDockedPills) {
      totalWindowWidthsPx +=
        resolvedVisibleDockWindowWidthsById[pill.instanceId] ??
        DOCK_WINDOW_DEFAULT_WIDTH_PX;
    }
    const totalGapWidthPx =
      Math.max(0, visibleDockedPills.length - 1) * DOCK_WINDOW_GAP_PX;
    const rowPaddingWidthPx = DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX * 2;
    const targetWidthPx =
      totalWindowWidthsPx + totalGapWidthPx + rowPaddingWidthPx;
    return clampNumber(targetWidthPx, 0, DOCK_SURFACE_MAX_WIDTH_PX);
  }, [resolvedVisibleDockWindowWidthsById, visibleDockedPills]);
  const dockSurfaceTargetHeightPx = useMemo(() => {
    if (visibleDockedPills.length === 0) {
      return MIN_DOCK_CHAT_HEIGHT_PX;
    }
    let maxHeightPx = MIN_DOCK_CHAT_HEIGHT_PX;
    for (const pill of visibleDockedPills) {
      const nextHeightPx =
        resolvedDockWindowHeightsById[pill.instanceId] ??
        DOCK_WINDOW_DEFAULT_HEIGHT_PX;
      if (nextHeightPx > maxHeightPx) {
        maxHeightPx = nextHeightPx;
      }
    }
    return clampNumber(
      maxHeightPx,
      MIN_DOCK_CHAT_HEIGHT_PX,
      dockAvailableHeightPx,
    );
  }, [
    dockAvailableHeightPx,
    resolvedDockWindowHeightsById,
    visibleDockedPills,
  ]);
  const dockSurfaceWidthCss = useMemo(() => {
    if (dockSurfaceTargetWidthPx <= 0) {
      return "0px";
    }
    const insetPx =
      (SIDE_RAIL_WIDTH_PX + DOCK_SURFACE_HORIZONTAL_MARGIN_PX) * 2;
    return `min(${dockSurfaceTargetWidthPx}px, ${DOCK_SURFACE_MAX_WIDTH_PX}px, calc(100vw - ${insetPx + dockStripReservedWidthPx}px))`;
  }, [dockStripReservedWidthPx, dockSurfaceTargetWidthPx]);
  const dockSurfaceHeightCss = useMemo(() => {
    const topBottomReservedPx = workspaceTopInsetPx + dockBottomOffsetPx;
    return `min(${dockSurfaceTargetHeightPx}px, calc(100vh - ${topBottomReservedPx}px))`;
  }, [dockBottomOffsetPx, dockSurfaceTargetHeightPx, workspaceTopInsetPx]);
  const showCanvasVisibilityToggle =
    isCanvasVisibilitySuppressed || openMaximizedWindow !== null;
  const showStandaloneMinimizedPills = !showDockedChatSurface;

  const handleCreate = useCallback(() => {
    if (!canCreateManagedChatWindow) {
      return;
    }
    const instanceId = createProjectChatWindowInstance();
    if (!instanceId) {
      return;
    }
    focusProjectChatWindow(instanceId);
    setIsCanvasVisibilitySuppressed(false);
  }, [canCreateManagedChatWindow]);

  const clearWindowExitAnimation = useCallback((instanceId: string) => {
    const activeTimeoutId = windowExitTimeoutsRef.current[instanceId];
    if (activeTimeoutId !== undefined) {
      window.clearTimeout(activeTimeoutId);
      delete windowExitTimeoutsRef.current[instanceId];
    }
    setWindowExitAnimationsById((current) => {
      if (!(instanceId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, []);

  const clearWindowEnterAnimation = useCallback((instanceId: string) => {
    const activePrimeTimeoutId =
      windowEnterPrimeTimeoutsRef.current[instanceId];
    if (activePrimeTimeoutId !== undefined) {
      window.clearTimeout(activePrimeTimeoutId);
      delete windowEnterPrimeTimeoutsRef.current[instanceId];
    }
    const activeAnimationTimeoutId =
      windowEnterAnimationTimeoutsRef.current[instanceId];
    if (activeAnimationTimeoutId !== undefined) {
      window.clearTimeout(activeAnimationTimeoutId);
      delete windowEnterAnimationTimeoutsRef.current[instanceId];
    }
    setWindowEnterAnimationsById((current) => {
      if (!(instanceId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
    setWindowEnterAnimationPrimesById((current) => {
      if (!(instanceId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, []);

  const clearPillExitAnimation = useCallback((instanceId: string) => {
    const activeTimeoutId = pillExitTimeoutsRef.current[instanceId];
    if (activeTimeoutId !== undefined) {
      window.clearTimeout(activeTimeoutId);
      delete pillExitTimeoutsRef.current[instanceId];
    }
    setPillExitAnimationsById((current) => {
      if (!(instanceId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, []);

  const startWindowEnterAnimation = useCallback(
    (instanceId: string, kind: ChatWindowEnterAnimationKind) => {
      setWindowEnterAnimationsById((current) => {
        if (current[instanceId] === kind) {
          return current;
        }
        return {
          ...current,
          [instanceId]: kind,
        };
      });
      setWindowEnterAnimationPrimesById((current) => {
        if (current[instanceId] === kind) {
          return current;
        }
        return {
          ...current,
          [instanceId]: kind,
        };
      });
      const activePrimeTimeoutId =
        windowEnterPrimeTimeoutsRef.current[instanceId];
      if (activePrimeTimeoutId !== undefined) {
        window.clearTimeout(activePrimeTimeoutId);
      }
      const activeAnimationTimeoutId =
        windowEnterAnimationTimeoutsRef.current[instanceId];
      if (activeAnimationTimeoutId !== undefined) {
        window.clearTimeout(activeAnimationTimeoutId);
      }
      windowEnterPrimeTimeoutsRef.current[instanceId] = window.setTimeout(
        () => {
          delete windowEnterPrimeTimeoutsRef.current[instanceId];
          setWindowEnterAnimationPrimesById((current) => {
            if (!(instanceId in current)) {
              return current;
            }
            const next = { ...current };
            delete next[instanceId];
            return next;
          });
        },
        CHAT_WINDOW_ENTER_ANIMATION_PRIME_DELAY_MS,
      );
      windowEnterAnimationTimeoutsRef.current[instanceId] = window.setTimeout(
        () => {
          delete windowEnterAnimationTimeoutsRef.current[instanceId];
          setWindowEnterAnimationsById((current) => {
            if (!(instanceId in current)) {
              return current;
            }
            const next = { ...current };
            delete next[instanceId];
            return next;
          });
        },
        CHAT_WINDOW_ENTER_DURATION_MS,
      );
    },
    [],
  );

  const startPillExitAnimation = useCallback(
    (
      instanceId: string,
      kind: ChatWindowPillExitAnimationKind,
      onComplete: () => void,
    ) => {
      setPillExitAnimationsById((current) => {
        if (current[instanceId] === kind) {
          return current;
        }
        return {
          ...current,
          [instanceId]: kind,
        };
      });
      const activeTimeoutId = pillExitTimeoutsRef.current[instanceId];
      if (activeTimeoutId !== undefined) {
        window.clearTimeout(activeTimeoutId);
      }
      pillExitTimeoutsRef.current[instanceId] = window.setTimeout(() => {
        delete pillExitTimeoutsRef.current[instanceId];
        setPillExitAnimationsById((current) => {
          if (!(instanceId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[instanceId];
          return next;
        });
        onComplete();
      }, CHAT_WINDOW_PILL_EXIT_DURATION_MS);
    },
    [],
  );

  const startWindowExitAnimation = useCallback(
    (
      instanceId: string,
      kind: ChatWindowExitAnimationKind,
      { focusAfterClose = false }: { focusAfterClose?: boolean } = {},
    ) => {
      if (!instancesById[instanceId]) {
        return;
      }
      clearTrackedGitPaneGraphWindowIfMatches(projectConfigId, instanceId);
      clearWindowEnterAnimation(instanceId);
      setWindowExitAnimationsById((current) => {
        if (current[instanceId] === kind) {
          return current;
        }
        return {
          ...current,
          [instanceId]: kind,
        };
      });
      const activeTimeoutId = windowExitTimeoutsRef.current[instanceId];
      if (activeTimeoutId !== undefined) {
        window.clearTimeout(activeTimeoutId);
      }
      const durationMs =
        kind === "minimize"
          ? CHAT_WINDOW_MINIMIZE_EXIT_DURATION_MS
          : CHAT_WINDOW_CLOSE_EXIT_DURATION_MS;
      windowExitTimeoutsRef.current[instanceId] = window.setTimeout(() => {
        delete windowExitTimeoutsRef.current[instanceId];
        if (kind === "minimize") {
          minimizeProjectChatWindow(instanceId);
        } else {
          closeProjectChatWindow(instanceId);
        }
        setWindowExitAnimationsById((current) => {
          if (!(instanceId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[instanceId];
          return next;
        });
        if (focusAfterClose) {
          const nextVisibleWindowId = orderedPills.find(
            (candidatePill) =>
              candidatePill.instanceId !== instanceId &&
              !candidatePill.isClosed &&
              !candidatePill.isMinimized,
          );
          if (nextVisibleWindowId) {
            focusProjectChatWindow(nextVisibleWindowId.instanceId);
          }
        }
      }, durationMs);
    },
    [clearWindowEnterAnimation, instancesById, orderedPills, projectConfigId],
  );

  const handleOpenWindow = useCallback(
    (instanceId: string, source: "pill" | "menu") => {
      const instance = instancesById[instanceId];
      if (!instance) {
        return;
      }
      if (
        instance.placement === ChatWindowPlacementEnum.bottom_docked &&
        maxVisibleDockedCount > 0
      ) {
        let targetDockIndex = 0;
        let foundTarget = false;
        for (const pill of orderedPills) {
          if (
            pill.isClosed ||
            pill.placement !== ChatWindowPlacementEnum.bottom_docked
          ) {
            continue;
          }
          if (pill.isMinimized && pill.instanceId !== instanceId) {
            continue;
          }
          if (pill.instanceId === instanceId) {
            foundTarget = true;
            break;
          }
          targetDockIndex += 1;
        }
        if (foundTarget) {
          const currentEndIndex = dockVisibleStartIndex + maxVisibleDockedCount;
          let nextStartIndex = dockVisibleStartIndex;
          if (targetDockIndex < dockVisibleStartIndex) {
            nextStartIndex = targetDockIndex;
          } else if (targetDockIndex >= currentEndIndex) {
            nextStartIndex = targetDockIndex - maxVisibleDockedCount + 1;
          }
          const nextTotalDockCount =
            openDockedPills.length + (instance.isMinimized ? 1 : 0);
          const nextMaxStartIndex = Math.max(
            0,
            nextTotalDockCount - maxVisibleDockedCount,
          );
          setDockCycleOffsetFromEnd(
            nextMaxStartIndex -
              clampNumber(nextStartIndex, 0, nextMaxStartIndex),
          );
        }
      }
      clearWindowExitAnimation(instanceId);
      clearWindowEnterAnimation(instanceId);
      clearPillExitAnimation(instanceId);
      if (instance.isMinimized && source === "pill") {
        startPillExitAnimation(instanceId, "restore_from_minimize", () => {
          startWindowEnterAnimation(instanceId, "restore_from_minimize");
          reopenProjectChatWindow(instanceId);
          focusProjectChatWindow(instanceId);
          setIsCanvasVisibilitySuppressed(false);
        });
        return;
      }
      if (instance.isClosed || instance.isMinimized) {
        startWindowEnterAnimation(instanceId, "restore_from_minimize");
      }
      reopenProjectChatWindow(instanceId);
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [
      clearPillExitAnimation,
      clearWindowEnterAnimation,
      clearWindowExitAnimation,
      dockVisibleStartIndex,
      instancesById,
      maxVisibleDockedCount,
      openDockedPills.length,
      orderedPills,
      startPillExitAnimation,
      startWindowEnterAnimation,
    ],
  );

  const handleMinimizeWindow = useCallback(
    (instanceId: string) => {
      startWindowExitAnimation(instanceId, "minimize", {
        focusAfterClose: true,
      });
    },
    [startWindowExitAnimation],
  );

  const handleCloseWindow = useCallback(
    (instanceId: string) => {
      startWindowExitAnimation(instanceId, "close", { focusAfterClose: true });
    },
    [startWindowExitAnimation],
  );

  const handleFocusWindow = useCallback((instanceId: string) => {
    focusProjectChatWindow(instanceId);
  }, []);

  const handleCycleDockWindowsBackward = useCallback(() => {
    if (dockVisibleStartIndex <= 0 || maxVisibleDockedCount === 0) {
      return;
    }
    const nextStartIndex = dockVisibleStartIndex - 1;
    const focusTargetId = openDockedPills[nextStartIndex]?.instanceId;
    setDockCycleOffsetFromEnd((current) =>
      clampNumber(current + 1, 0, maxDockCycleOffset),
    );
    if (focusTargetId) {
      focusProjectChatWindow(focusTargetId);
    }
  }, [
    dockVisibleStartIndex,
    maxDockCycleOffset,
    maxVisibleDockedCount,
    openDockedPills,
  ]);

  const handleCycleDockWindowsForward = useCallback(() => {
    if (dockCycleOffsetFromEnd <= 0 || maxVisibleDockedCount === 0) {
      return;
    }
    const nextStartIndex = dockVisibleStartIndex + 1;
    const focusTargetId =
      openDockedPills[nextStartIndex + maxVisibleDockedCount - 1]?.instanceId;
    setDockCycleOffsetFromEnd((current) => Math.max(0, current - 1));
    if (focusTargetId) {
      focusProjectChatWindow(focusTargetId);
    }
  }, [
    dockCycleOffsetFromEnd,
    dockVisibleStartIndex,
    maxVisibleDockedCount,
    openDockedPills,
  ]);

  const handleSetWindowTitle = useCallback(
    (instanceId: string, nextTitle: string) => {
      setProjectChatWindowTitle(instanceId, nextTitle);
    },
    [],
  );

  const handleUndockWindow = useCallback(
    (instanceId: string) => {
      clearWindowExitAnimation(instanceId);
      setProjectChatWindowPlacement(
        instanceId,
        ChatWindowPlacementEnum.floating,
      );
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [clearWindowExitAnimation],
  );

  const handleDockWindow = useCallback(
    (instanceId: string) => {
      clearWindowExitAnimation(instanceId);
      setProjectChatWindowPlacement(
        instanceId,
        ChatWindowPlacementEnum.bottom_docked,
      );
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [clearWindowExitAnimation],
  );

  const handleMaximizeWindow = useCallback(
    (instanceId: string) => {
      clearWindowExitAnimation(instanceId);
      maximizeProjectChatWindow(instanceId);
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [clearWindowExitAnimation],
  );

  const handleRestoreWindow = useCallback(
    (instanceId: string) => {
      clearWindowExitAnimation(instanceId);
      unmaximizeProjectChatWindow(instanceId);
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [clearWindowExitAnimation],
  );

  const clampFloatingBoundsForCurrentViewport = useCallback(
    (bounds: ChatWindowBounds): ChatWindowBounds => {
      const viewport = getViewportDimensions();
      if (!viewport) {
        return bounds;
      }
      return clampFloatingBoundsToViewport(
        bounds,
        viewport.width,
        viewport.height,
        floatingWindowBoundaryInsets,
      );
    },
    [floatingWindowBoundaryInsets],
  );

  const resolveDefaultFloatingBoundsForCurrentViewport = useCallback(() => {
    const viewport = getViewportDimensions();
    return clampFloatingBoundsForCurrentViewport(
      resolveDefaultFloatingChatBounds({
        viewportWidthPx: viewport?.width ?? viewportWidthPx,
        viewportHeightPx: viewport?.height ?? viewportHeightPx,
        workspaceTopInsetPx,
        bottomInsetPx: floatingBottomInsetPx,
        sideRailWidthPx: SIDE_RAIL_WIDTH_PX,
        minWidthPx: FLOATING_WINDOW_MIN_WIDTH_PX,
        minHeightPx: FLOATING_WINDOW_MIN_HEIGHT_PX,
      }),
    );
  }, [
    clampFloatingBoundsForCurrentViewport,
    floatingBottomInsetPx,
    viewportHeightPx,
    viewportWidthPx,
    workspaceTopInsetPx,
  ]);

  const resolveFloatingRestoreBounds = useCallback(
    (instanceId: string): ChatWindowBounds => {
      const existingBounds = floatingRestoreBoundsByIdRef.current[instanceId];
      if (existingBounds) {
        return clampFloatingBoundsForCurrentViewport(existingBounds);
      }
      return resolveDefaultFloatingBoundsForCurrentViewport();
    },
    [
      clampFloatingBoundsForCurrentViewport,
      resolveDefaultFloatingBoundsForCurrentViewport,
    ],
  );

  const positionFloatingBoundsForUnsnap = useCallback(
    ({
      currentBounds,
      restoreBounds,
      pointerX,
      pointerY,
    }: {
      currentBounds: ChatWindowBounds;
      restoreBounds: ChatWindowBounds;
      pointerX: number;
      pointerY: number;
    }): ChatWindowBounds => {
      const pointerOffsetFractionX = clampNumber(
        (pointerX - currentBounds.x) / Math.max(1, currentBounds.width),
        0.15,
        0.85,
      );
      const pointerOffsetY = clampNumber(
        pointerY - currentBounds.y,
        8,
        FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX - 8,
      );
      return clampFloatingBoundsForCurrentViewport({
        ...restoreBounds,
        x: pointerX - restoreBounds.width * pointerOffsetFractionX,
        y: pointerY - pointerOffsetY,
      });
    },
    [clampFloatingBoundsForCurrentViewport],
  );

  useEffect(() => {
    const nextRestoreBoundsById = {
      ...floatingRestoreBoundsByIdRef.current,
    };
    let changed = false;

    for (const pill of openFloatingPills) {
      if (floatingSnapPresetById[pill.instanceId]) {
        continue;
      }
      const bounds = floatingBoundsById[pill.instanceId];
      if (!bounds) {
        continue;
      }
      const clampedBounds = clampFloatingBoundsForCurrentViewport(bounds);
      const existing = nextRestoreBoundsById[pill.instanceId];
      if (existing && areBoundsEqual(existing, clampedBounds)) {
        continue;
      }
      nextRestoreBoundsById[pill.instanceId] = clampedBounds;
      changed = true;
    }

    for (const instanceId of Object.keys(nextRestoreBoundsById)) {
      if (instancesById[instanceId]) {
        continue;
      }
      delete nextRestoreBoundsById[instanceId];
      changed = true;
    }

    if (changed) {
      floatingRestoreBoundsByIdRef.current = nextRestoreBoundsById;
    }
  }, [
    clampFloatingBoundsForCurrentViewport,
    floatingBoundsById,
    floatingSnapPresetById,
    instancesById,
    openFloatingPills,
  ]);

  const resolveSnapTargetWindowId = useCallback((): string | null => {
    if (activeFloatingWindowId) {
      return activeFloatingWindowId;
    }
    if (!activeSectionId) {
      if (!activeVisibleWindowId) {
        return null;
      }
      const activeVisibleWindow = instancesById[activeVisibleWindowId];
      if (!activeVisibleWindow) {
        return null;
      }
      if (activeVisibleWindow.placement !== ChatWindowPlacementEnum.floating) {
        setProjectChatWindowPlacement(
          activeVisibleWindowId,
          ChatWindowPlacementEnum.floating,
        );
      }
      return activeVisibleWindowId;
    }
    showSectionInProjectChatWindow(
      activeSectionId,
      ChatWindowPlacementEnum.floating,
    );
    return (
      getOpenExternalProjectChatWindowInstanceForSectionInState(
        useProjectState.getState().projectChatWindowing,
        activeSectionId,
      )?.instanceId ?? null
    );
  }, [
    activeFloatingWindowId,
    activeSectionId,
    activeVisibleWindowId,
    instancesById,
  ]);

  const snapWindowTargetByPreset = useCallback(
    (preset: FloatingSnapPreset) => {
      const targetWindowId = resolveSnapTargetWindowId();
      if (!targetWindowId) {
        return;
      }
      const viewport = getViewportDimensions();
      if (!viewport) {
        return;
      }
      const nextBounds = clampFloatingBoundsForCurrentViewport(
        buildFloatingSnapBounds(
          preset,
          viewport.width,
          viewport.height,
          floatingWindowBoundaryInsets,
        ),
      );
      setProjectChatWindowBounds(targetWindowId, nextBounds);
      focusProjectChatWindow(targetWindowId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [
      clampFloatingBoundsForCurrentViewport,
      floatingWindowBoundaryInsets,
      resolveSnapTargetWindowId,
    ],
  );

  useEffect(() => {
    const parsedCanvasToggle = parseShortcut(
      chatWindowingShortcuts.canvasToggle,
    );
    const parsedMaximizeFocused = parseShortcut(
      chatWindowingShortcuts.maximizeFocused,
    );
    const parsedMinimizeFocused = parseShortcut(
      chatWindowingShortcuts.minimizeFocused,
    );
    const parsedSnapLeft = parseShortcut(chatWindowingShortcuts.snapLeft);
    const parsedSnapRight = parseShortcut(chatWindowingShortcuts.snapRight);
    const parsedSnapTop = parseShortcut(chatWindowingShortcuts.snapTop);
    const parsedSnapBottom = parseShortcut(chatWindowingShortcuts.snapBottom);
    const parsedSnapTopLeft = parseShortcut(SNAP_TOP_LEFT_SHORTCUT);
    const parsedSnapTopRight = parseShortcut(SNAP_TOP_RIGHT_SHORTCUT);
    const parsedSnapBottomLeft = parseShortcut(SNAP_BOTTOM_LEFT_SHORTCUT);
    const parsedSnapBottomRight = parseShortcut(SNAP_BOTTOM_RIGHT_SHORTCUT);
    const macOs = isMacOs();

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        isEditableTarget(event.target)
      ) {
        return;
      }
      const eventCode = getNormalizedEventCode(event);

      if (
        hasOverlayWindows &&
        isShortcutPressed(event, eventCode, parsedCanvasToggle, macOs)
      ) {
        event.preventDefault();
        event.stopPropagation();
        setIsCanvasVisibilitySuppressed((current) => !current);
        return;
      }

      if (
        activeVisibleWindowId &&
        isShortcutPressed(event, eventCode, parsedMaximizeFocused, macOs)
      ) {
        event.preventDefault();
        event.stopPropagation();
        maximizeProjectChatWindow(activeVisibleWindowId);
        focusProjectChatWindow(activeVisibleWindowId);
        setIsCanvasVisibilitySuppressed(false);
        return;
      }

      if (
        activeVisibleWindowId &&
        isShortcutPressed(event, eventCode, parsedMinimizeFocused, macOs)
      ) {
        event.preventDefault();
        event.stopPropagation();
        startWindowExitAnimation(activeVisibleWindowId, "minimize", {
          focusAfterClose: true,
        });
        return;
      }

      if (isShortcutPressed(event, eventCode, parsedSnapLeft, macOs)) {
        event.preventDefault();
        event.stopPropagation();
        snapWindowTargetByPreset("left");
        return;
      }

      if (isShortcutPressed(event, eventCode, parsedSnapRight, macOs)) {
        event.preventDefault();
        event.stopPropagation();
        snapWindowTargetByPreset("right");
        return;
      }

      if (isShortcutPressed(event, eventCode, parsedSnapTop, macOs)) {
        event.preventDefault();
        event.stopPropagation();
        snapWindowTargetByPreset("top");
        return;
      }

      if (isShortcutPressed(event, eventCode, parsedSnapBottom, macOs)) {
        event.preventDefault();
        event.stopPropagation();
        snapWindowTargetByPreset("bottom");
        return;
      }

      if (isShortcutPressed(event, eventCode, parsedSnapTopLeft, macOs)) {
        event.preventDefault();
        event.stopPropagation();
        snapWindowTargetByPreset("top_left");
        return;
      }

      if (isShortcutPressed(event, eventCode, parsedSnapTopRight, macOs)) {
        event.preventDefault();
        event.stopPropagation();
        snapWindowTargetByPreset("top_right");
        return;
      }

      if (isShortcutPressed(event, eventCode, parsedSnapBottomLeft, macOs)) {
        event.preventDefault();
        event.stopPropagation();
        snapWindowTargetByPreset("bottom_left");
        return;
      }

      if (isShortcutPressed(event, eventCode, parsedSnapBottomRight, macOs)) {
        event.preventDefault();
        event.stopPropagation();
        snapWindowTargetByPreset("bottom_right");
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [
    activeSectionId,
    activeVisibleWindowId,
    chatWindowingShortcuts.canvasToggle,
    chatWindowingShortcuts.maximizeFocused,
    chatWindowingShortcuts.minimizeFocused,
    chatWindowingShortcuts.snapBottom,
    chatWindowingShortcuts.snapLeft,
    chatWindowingShortcuts.snapRight,
    chatWindowingShortcuts.snapTop,
    hasOverlayWindows,
    instancesById,
    snapWindowTargetByPreset,
    startWindowExitAnimation,
  ]);

  const commitQueuedFloatingPreviewBounds = useCallback(() => {
    floatingPreviewAnimationFrameRef.current = null;
    const nextBoundsById = queuedFloatingPreviewBoundsRef.current;
    queuedFloatingPreviewBoundsRef.current = null;
    if (!nextBoundsById) {
      return;
    }
    floatingPreviewBoundsRef.current = nextBoundsById;
    setFloatingPreviewBoundsById((current) =>
      current === nextBoundsById ? current : nextBoundsById,
    );
  }, []);

  const scheduleFloatingPreviewBoundsCommit = useCallback(() => {
    if (floatingPreviewAnimationFrameRef.current !== null) {
      return;
    }
    floatingPreviewAnimationFrameRef.current = window.requestAnimationFrame(
      commitQueuedFloatingPreviewBounds,
    );
  }, [commitQueuedFloatingPreviewBounds]);

  const setFloatingPreviewBoundsImmediately = useCallback(
    (nextBoundsById: Record<string, ChatWindowBounds>) => {
      if (floatingPreviewAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(floatingPreviewAnimationFrameRef.current);
      }
      floatingPreviewAnimationFrameRef.current = null;
      queuedFloatingPreviewBoundsRef.current = null;
      floatingPreviewBoundsRef.current = nextBoundsById;
      setFloatingPreviewBoundsById((current) =>
        current === nextBoundsById ? current : nextBoundsById,
      );
    },
    [],
  );

  const handleFloatingBoundsPreview = useCallback(
    (instanceId: string, bounds: ChatWindowBounds) => {
      const current =
        queuedFloatingPreviewBoundsRef.current ??
        floatingPreviewBoundsRef.current;
      const existing = current[instanceId];
      if (existing && areBoundsEqual(existing, bounds)) {
        return;
      }
      const next = {
        ...current,
        [instanceId]: bounds,
      };
      queuedFloatingPreviewBoundsRef.current = next;
      floatingPreviewBoundsRef.current = next;
      scheduleFloatingPreviewBoundsCommit();
    },
    [scheduleFloatingPreviewBoundsCommit],
  );

  const handleFloatingBoundsPreviewBatch = useCallback(
    (boundsByInstanceId: Record<string, ChatWindowBounds>) => {
      const current =
        queuedFloatingPreviewBoundsRef.current ??
        floatingPreviewBoundsRef.current;
      let next = current;
      for (const [instanceId, bounds] of Object.entries(boundsByInstanceId)) {
        const existing = next[instanceId];
        if (existing && areBoundsEqual(existing, bounds)) {
          continue;
        }
        if (next === current) {
          next = { ...current };
        }
        next[instanceId] = bounds;
      }
      if (next === current) {
        return;
      }
      queuedFloatingPreviewBoundsRef.current = next;
      floatingPreviewBoundsRef.current = next;
      scheduleFloatingPreviewBoundsCommit();
    },
    [scheduleFloatingPreviewBoundsCommit],
  );

  const clearFloatingBoundsPreview = useCallback(
    (instanceId: string) => {
      const current =
        queuedFloatingPreviewBoundsRef.current ??
        floatingPreviewBoundsRef.current;
      if (!current[instanceId]) {
        return;
      }
      const next = { ...current };
      delete next[instanceId];
      setFloatingPreviewBoundsImmediately(next);
    },
    [setFloatingPreviewBoundsImmediately],
  );

  const clearFloatingBoundsPreviewBatch = useCallback(
    (instanceIds: string[]) => {
      const current =
        queuedFloatingPreviewBoundsRef.current ??
        floatingPreviewBoundsRef.current;
      let next = current;
      for (const instanceId of instanceIds) {
        if (!next[instanceId]) {
          continue;
        }
        if (next === current) {
          next = { ...current };
        }
        delete next[instanceId];
      }
      if (next === current) {
        return;
      }
      setFloatingPreviewBoundsImmediately(next);
    },
    [setFloatingPreviewBoundsImmediately],
  );

  const updateActiveFloatingSnapPreview = useCallback(
    (nextSnapPreview: ActiveFloatingSnapPreview | null) => {
      activeFloatingSnapPreviewRef.current = nextSnapPreview;
      setActiveFloatingSnapPreview((current) => {
        if (!current && !nextSnapPreview) {
          return current;
        }
        if (current && nextSnapPreview) {
          const sameBounds = areBoundsEqual(
            current.bounds,
            nextSnapPreview.bounds,
          );
          if (
            current.instanceId === nextSnapPreview.instanceId &&
            current.preset === nextSnapPreview.preset &&
            sameBounds
          ) {
            return current;
          }
        }
        return nextSnapPreview;
      });
    },
    [],
  );

  useEffect(() => {
    if (openFloatingPills.length === 0) {
      return;
    }

    const applyViewportGuardrails = () => {
      if (
        activeFloatingDragRef.current ||
        activeFloatingResizeRef.current ||
        activeFloatingSnapResizeRef.current
      ) {
        return;
      }
      const viewport = getViewportDimensions();
      if (!viewport) {
        return;
      }

      for (const pill of openFloatingPills) {
        const clampedBounds = clampFloatingBoundsToViewport(
          pill.bounds,
          viewport.width,
          viewport.height,
          floatingWindowBoundaryInsets,
        );
        if (areBoundsEqual(pill.bounds, clampedBounds)) {
          continue;
        }
        setProjectChatWindowBounds(pill.instanceId, clampedBounds);
      }
    };

    applyViewportGuardrails();

    let frameRequestId: number | null = null;
    const onResize = () => {
      if (frameRequestId !== null) {
        window.cancelAnimationFrame(frameRequestId);
      }
      frameRequestId = window.requestAnimationFrame(() => {
        frameRequestId = null;
        applyViewportGuardrails();
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      if (frameRequestId !== null) {
        window.cancelAnimationFrame(frameRequestId);
      }
      window.removeEventListener("resize", onResize);
    };
  }, [floatingWindowBoundaryInsets, openFloatingPills]);

  const handleFloatingDragPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>, pill: ResolvedWindowPill) => {
      if (event.button !== 0) {
        return;
      }
      if (
        event.detail > 1 &&
        event.target instanceof HTMLElement &&
        event.target.closest("[data-project-chat-window-title='true']")
      ) {
        return;
      }
      const previewBounds = floatingPreviewBoundsById[pill.instanceId];
      const currentBounds = clampFloatingBoundsForCurrentViewport(
        previewBounds ?? pill.bounds,
      );
      const snapPreset = floatingSnapPresetById[pill.instanceId] ?? null;
      const restoreBoundsOnUnsnap = snapPreset
        ? resolveFloatingRestoreBounds(pill.instanceId)
        : null;
      if (
        restoreBoundsOnUnsnap &&
        !floatingRestoreBoundsByIdRef.current[pill.instanceId]
      ) {
        floatingRestoreBoundsByIdRef.current = {
          ...floatingRestoreBoundsByIdRef.current,
          [pill.instanceId]: { ...restoreBoundsOnUnsnap },
        };
      }
      const dragBoundsStart = restoreBoundsOnUnsnap
        ? positionFloatingBoundsForUnsnap({
            currentBounds,
            restoreBounds: restoreBoundsOnUnsnap,
            pointerX: event.clientX,
            pointerY: event.clientY,
          })
        : currentBounds;
      const clonedCurrentBounds = { ...currentBounds };
      const clonedDragBoundsStart = { ...dragBoundsStart };
      activeFloatingDragRef.current = {
        pointerId: event.pointerId,
        instanceId: pill.instanceId,
        startX: event.clientX,
        startY: event.clientY,
        startBounds: clonedCurrentBounds,
        dragBoundsStart: clonedDragBoundsStart,
        lastBounds: clonedCurrentBounds,
        restoreBoundsOnUnsnap,
        hasActivatedUnsnap: restoreBoundsOnUnsnap === null,
      };
      updateActiveFloatingSnapPreview(null);
      handleFocusWindow(pill.instanceId);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      clampFloatingBoundsForCurrentViewport,
      floatingPreviewBoundsById,
      floatingSnapPresetById,
      handleFocusWindow,
      positionFloatingBoundsForUnsnap,
      resolveFloatingRestoreBounds,
      updateActiveFloatingSnapPreview,
    ],
  );

  const handleFloatingDragPointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const activeDrag = activeFloatingDragRef.current;
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
        return;
      }
      const deltaX = event.clientX - activeDrag.startX;
      const deltaY = event.clientY - activeDrag.startY;
      const dragDistance = Math.max(Math.abs(deltaX), Math.abs(deltaY));
      if (
        activeDrag.restoreBoundsOnUnsnap &&
        !activeDrag.hasActivatedUnsnap &&
        dragDistance >= FLOATING_UNSNAP_DRAG_THRESHOLD_PX
      ) {
        activeDrag.hasActivatedUnsnap = true;
      }
      const dragBoundsStart = activeDrag.hasActivatedUnsnap
        ? activeDrag.dragBoundsStart
        : activeDrag.startBounds;
      const nextBounds = clampFloatingBoundsForCurrentViewport({
        ...dragBoundsStart,
        x: dragBoundsStart.x + deltaX,
        y: dragBoundsStart.y + deltaY,
      });
      const viewport = getViewportDimensions();
      if (viewport) {
        const snapPreset = resolveFloatingSnapPresetFromPointer(
          event.clientX,
          event.clientY,
          viewport.width,
          viewport.height,
          floatingWindowBoundaryInsets,
        );
        if (snapPreset) {
          updateActiveFloatingSnapPreview({
            instanceId: activeDrag.instanceId,
            preset: snapPreset,
            bounds: buildFloatingSnapBounds(
              snapPreset,
              viewport.width,
              viewport.height,
              floatingWindowBoundaryInsets,
            ),
          });
        } else {
          updateActiveFloatingSnapPreview(null);
        }
      } else {
        updateActiveFloatingSnapPreview(null);
      }
      activeDrag.lastBounds = nextBounds;
      if (activeDrag.hasActivatedUnsnap) {
        handleFloatingBoundsPreview(activeDrag.instanceId, nextBounds);
      }
    },
    [
      clampFloatingBoundsForCurrentViewport,
      floatingWindowBoundaryInsets,
      handleFloatingBoundsPreview,
      updateActiveFloatingSnapPreview,
    ],
  );

  const handleFloatingDragPointerUp = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const activeDrag = activeFloatingDragRef.current;
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
        return;
      }
      const activeSnap = activeFloatingSnapPreviewRef.current;
      if (activeSnap && activeSnap.instanceId === activeDrag.instanceId) {
        setProjectChatWindowBounds(activeDrag.instanceId, activeSnap.bounds);
      } else if (!activeDrag.hasActivatedUnsnap) {
        setProjectChatWindowBounds(
          activeDrag.instanceId,
          activeDrag.startBounds,
        );
      } else {
        setProjectChatWindowBounds(
          activeDrag.instanceId,
          activeDrag.lastBounds,
        );
      }
      clearFloatingBoundsPreview(activeDrag.instanceId);
      updateActiveFloatingSnapPreview(null);
      activeFloatingDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [clearFloatingBoundsPreview, updateActiveFloatingSnapPreview],
  );

  const handleFloatingResizePointerDown = useCallback(
    (
      event: PointerEvent<HTMLDivElement>,
      pill: ResolvedWindowPill,
      direction: WindowResizeDirection,
    ) => {
      if (event.button !== 0) {
        return;
      }
      const previewBounds = floatingPreviewBoundsById[pill.instanceId];
      const startBounds = clampFloatingBoundsForCurrentViewport(
        previewBounds ?? pill.bounds,
      );
      const clonedBounds = { ...startBounds };
      activeFloatingResizeRef.current = {
        pointerId: event.pointerId,
        instanceId: pill.instanceId,
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startBounds: clonedBounds,
        lastBounds: clonedBounds,
      };
      updateActiveFloatingSnapPreview(null);
      handleFocusWindow(pill.instanceId);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      clampFloatingBoundsForCurrentViewport,
      floatingPreviewBoundsById,
      handleFocusWindow,
      updateActiveFloatingSnapPreview,
    ],
  );

  const handleFloatingResizePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const activeResize = activeFloatingResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      const deltaX = event.clientX - activeResize.startX;
      const deltaY = event.clientY - activeResize.startY;
      const resizingLeft = resizeDirectionIncludesAxis(
        activeResize.direction,
        "left",
      );
      const resizingRight = resizeDirectionIncludesAxis(
        activeResize.direction,
        "right",
      );
      const resizingTop = resizeDirectionIncludesAxis(
        activeResize.direction,
        "top",
      );
      const resizingBottom = resizeDirectionIncludesAxis(
        activeResize.direction,
        "bottom",
      );

      let nextWidth = activeResize.startBounds.width;
      let nextHeight = activeResize.startBounds.height;
      let nextX = activeResize.startBounds.x;
      let nextY = activeResize.startBounds.y;

      if (resizingLeft) {
        nextWidth = Math.max(
          FLOATING_WINDOW_MIN_WIDTH_PX,
          activeResize.startBounds.width - deltaX,
        );
        nextX =
          activeResize.startBounds.x +
          activeResize.startBounds.width -
          nextWidth;
      } else if (resizingRight) {
        nextWidth = Math.max(
          FLOATING_WINDOW_MIN_WIDTH_PX,
          activeResize.startBounds.width + deltaX,
        );
      }

      if (resizingTop) {
        nextHeight = Math.max(
          FLOATING_WINDOW_MIN_HEIGHT_PX,
          activeResize.startBounds.height - deltaY,
        );
        nextY =
          activeResize.startBounds.y +
          activeResize.startBounds.height -
          nextHeight;
      } else if (resizingBottom) {
        nextHeight = Math.max(
          FLOATING_WINDOW_MIN_HEIGHT_PX,
          activeResize.startBounds.height + deltaY,
        );
      }

      const nextBounds = clampFloatingBoundsForCurrentViewport({
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
      });
      activeResize.lastBounds = nextBounds;
      handleFloatingBoundsPreview(activeResize.instanceId, nextBounds);
    },
    [clampFloatingBoundsForCurrentViewport, handleFloatingBoundsPreview],
  );

  const handleFloatingResizePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const activeResize = activeFloatingResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      setProjectChatWindowBounds(
        activeResize.instanceId,
        activeResize.lastBounds,
      );
      clearFloatingBoundsPreview(activeResize.instanceId);
      updateActiveFloatingSnapPreview(null);
      activeFloatingResizeRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [clearFloatingBoundsPreview, updateActiveFloatingSnapPreview],
  );

  const handleFloatingSnapResizePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, handle: FloatingSnapResizeHandle) => {
      if (event.button !== 0) {
        return;
      }
      const startBoundsByInstanceId: Record<string, ChatWindowBounds> = {};
      const involvedInstanceIds = [
        ...handle.leadingInstanceIds,
        ...handle.trailingInstanceIds,
      ];

      for (const instanceId of involvedInstanceIds) {
        const bounds = floatingBoundsById[instanceId];
        if (!bounds) {
          return;
        }
        startBoundsByInstanceId[instanceId] = { ...bounds };
      }

      if (handle.axis === "vertical") {
        let minCoordinate = -Infinity;
        let maxCoordinate = Infinity;
        for (const instanceId of handle.leadingInstanceIds) {
          const bounds = startBoundsByInstanceId[instanceId];
          minCoordinate = Math.max(
            minCoordinate,
            bounds.x + FLOATING_WINDOW_MIN_WIDTH_PX,
          );
        }
        for (const instanceId of handle.trailingInstanceIds) {
          const bounds = startBoundsByInstanceId[instanceId];
          maxCoordinate = Math.min(
            maxCoordinate,
            bounds.x + bounds.width - FLOATING_WINDOW_MIN_WIDTH_PX,
          );
        }
        activeFloatingSnapResizeRef.current = {
          pointerId: event.pointerId,
          axis: "vertical",
          startPointerPosition: event.clientX,
          startCoordinate: handle.coordinate,
          minCoordinate,
          maxCoordinate,
          leadingInstanceIds: handle.leadingInstanceIds,
          trailingInstanceIds: handle.trailingInstanceIds,
          startBoundsByInstanceId,
          lastBoundsByInstanceId: startBoundsByInstanceId,
        };
      } else {
        let minCoordinate = -Infinity;
        let maxCoordinate = Infinity;
        for (const instanceId of handle.leadingInstanceIds) {
          const bounds = startBoundsByInstanceId[instanceId];
          minCoordinate = Math.max(
            minCoordinate,
            bounds.y + FLOATING_WINDOW_MIN_HEIGHT_PX,
          );
        }
        for (const instanceId of handle.trailingInstanceIds) {
          const bounds = startBoundsByInstanceId[instanceId];
          maxCoordinate = Math.min(
            maxCoordinate,
            bounds.y + bounds.height - FLOATING_WINDOW_MIN_HEIGHT_PX,
          );
        }
        activeFloatingSnapResizeRef.current = {
          pointerId: event.pointerId,
          axis: "horizontal",
          startPointerPosition: event.clientY,
          startCoordinate: handle.coordinate,
          minCoordinate,
          maxCoordinate,
          leadingInstanceIds: handle.leadingInstanceIds,
          trailingInstanceIds: handle.trailingInstanceIds,
          startBoundsByInstanceId,
          lastBoundsByInstanceId: startBoundsByInstanceId,
        };
      }

      updateActiveFloatingSnapPreview(null);
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [floatingBoundsById, updateActiveFloatingSnapPreview],
  );

  const handleFloatingSnapResizePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const activeResize = activeFloatingSnapResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      const pointerPosition =
        activeResize.axis === "vertical" ? event.clientX : event.clientY;
      const nextCoordinate = clampNumber(
        activeResize.startCoordinate +
          (pointerPosition - activeResize.startPointerPosition),
        activeResize.minCoordinate,
        activeResize.maxCoordinate,
      );
      const nextBoundsByInstanceId = buildFloatingSnapResizeBounds(
        {
          axis: activeResize.axis,
          coordinate: activeResize.startCoordinate,
          leadingInstanceIds: activeResize.leadingInstanceIds,
          trailingInstanceIds: activeResize.trailingInstanceIds,
          startBoundsByInstanceId: activeResize.startBoundsByInstanceId,
        },
        nextCoordinate,
      );

      activeResize.lastBoundsByInstanceId = nextBoundsByInstanceId;
      handleFloatingBoundsPreviewBatch(nextBoundsByInstanceId);
    },
    [handleFloatingBoundsPreviewBatch],
  );

  const handleFloatingSnapResizePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const activeResize = activeFloatingSnapResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      setProjectChatWindowBoundsById(activeResize.lastBoundsByInstanceId);
      clearFloatingBoundsPreviewBatch([
        ...activeResize.leadingInstanceIds,
        ...activeResize.trailingInstanceIds,
      ]);
      updateActiveFloatingSnapPreview(null);
      activeFloatingSnapResizeRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [clearFloatingBoundsPreviewBatch, updateActiveFloatingSnapPreview],
  );

  const handleSingleDockResizePointerDown = useCallback(
    (
      event: PointerEvent<HTMLDivElement>,
      pill: ResolvedWindowPill,
      direction: WindowResizeDirection,
    ) => {
      if (event.button !== 0) {
        return;
      }
      const panelNode = event.currentTarget.closest(
        `[data-chat-window-instance-id="${pill.instanceId}"]`,
      );
      const panelBounds = panelNode?.getBoundingClientRect();
      const startWidthPx =
        panelBounds?.width ??
        resolvedDockWindowWidthsById[pill.instanceId] ??
        DOCK_WINDOW_DEFAULT_WIDTH_PX;
      const startHeightPx =
        panelBounds?.height ??
        resolvedDockWindowHeightsById[pill.instanceId] ??
        DOCK_WINDOW_DEFAULT_HEIGHT_PX;
      const viewport = getViewportDimensions();
      const maxHeightFromViewport = viewport
        ? viewport.height - workspaceTopInsetPx - dockBottomOffsetPx
        : dockAvailableHeightPx;
      activeSingleDockResizeRef.current = {
        pointerId: event.pointerId,
        instanceId: pill.instanceId,
        direction,
        startX: event.clientX,
        startY: event.clientY,
        startWidthPx,
        startHeightPx,
        lastWidthPx: startWidthPx,
        lastHeightPx: startHeightPx,
        minWidthPx: MIN_DOCK_CHAT_WIDTH_PX,
        maxWidthPx: DOCK_SURFACE_MAX_WIDTH_PX,
        minHeightPx: MIN_DOCK_CHAT_HEIGHT_PX,
        maxHeightPx: clampNumber(
          maxHeightFromViewport,
          MIN_DOCK_CHAT_HEIGHT_PX,
          dockAvailableHeightPx,
        ),
      };
      setDockPreviewWidthsById((current) => ({
        ...current,
        [pill.instanceId]: startWidthPx,
      }));
      setDockPreviewHeightsById((current) => ({
        ...current,
        [pill.instanceId]: startHeightPx,
      }));
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [
      dockAvailableHeightPx,
      dockBottomOffsetPx,
      resolvedDockWindowHeightsById,
      resolvedDockWindowWidthsById,
      workspaceTopInsetPx,
    ],
  );

  const handleSingleDockResizePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const activeResize = activeSingleDockResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      const deltaX = event.clientX - activeResize.startX;
      const deltaY = event.clientY - activeResize.startY;
      const resizingLeft = resizeDirectionIncludesAxis(
        activeResize.direction,
        "left",
      );
      const resizingRight = resizeDirectionIncludesAxis(
        activeResize.direction,
        "right",
      );
      const resizingTop = resizeDirectionIncludesAxis(
        activeResize.direction,
        "top",
      );
      const resizingBottom = resizeDirectionIncludesAxis(
        activeResize.direction,
        "bottom",
      );
      let nextWidthPx = activeResize.startWidthPx;
      let nextHeightPx = activeResize.startHeightPx;
      if (resizingLeft) {
        nextWidthPx = activeResize.startWidthPx - deltaX;
      } else if (resizingRight) {
        nextWidthPx = activeResize.startWidthPx + deltaX;
      }
      if (resizingTop) {
        nextHeightPx = activeResize.startHeightPx - deltaY;
      } else if (resizingBottom) {
        nextHeightPx = activeResize.startHeightPx + deltaY;
      }
      nextWidthPx = clampNumber(
        nextWidthPx,
        activeResize.minWidthPx,
        activeResize.maxWidthPx,
      );
      nextHeightPx = clampNumber(
        nextHeightPx,
        activeResize.minHeightPx,
        activeResize.maxHeightPx,
      );
      activeResize.lastWidthPx = nextWidthPx;
      activeResize.lastHeightPx = nextHeightPx;
      setDockPreviewWidthsById((current) => {
        if (current[activeResize.instanceId] === nextWidthPx) {
          return current;
        }
        return {
          ...current,
          [activeResize.instanceId]: nextWidthPx,
        };
      });
      setDockPreviewHeightsById((current) => {
        if (current[activeResize.instanceId] === nextHeightPx) {
          return current;
        }
        return {
          ...current,
          [activeResize.instanceId]: nextHeightPx,
        };
      });
    },
    [],
  );

  const handleSingleDockResizePointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const activeResize = activeSingleDockResizeRef.current;
      if (!activeResize || activeResize.pointerId !== event.pointerId) {
        return;
      }
      setProjectChatWindowDockFractions({
        widthFractionsByInstanceId: {
          [activeResize.instanceId]: 1,
        },
        dockContainerWidthPx: activeResize.lastWidthPx,
      });
      setProjectChatWindowBounds(activeResize.instanceId, {
        height: activeResize.lastHeightPx,
      });
      setDockPreviewWidthsById((current) => {
        if (!(activeResize.instanceId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[activeResize.instanceId];
        return next;
      });
      setDockPreviewHeightsById((current) => {
        if (!(activeResize.instanceId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[activeResize.instanceId];
        return next;
      });
      activeSingleDockResizeRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    const viewportNode = pillViewportRef.current;
    const fullMeasureNode = fullMeasureRowRef.current;
    const compactMeasureNode = compactMeasureRowRef.current;
    if (!viewportNode || !fullMeasureNode || !compactMeasureNode) {
      return;
    }
    const availableWidthPx = viewportNode.clientWidth;
    if (availableWidthPx <= 0) {
      return;
    }
    const fullWidthPx = fullMeasureNode.scrollWidth;
    const compactWidthPx = compactMeasureNode.scrollWidth;
    const minimumCycleWidthPx =
      CYCLE_CONTROL_BUTTON_WIDTH_PX * 2 +
      COMPACT_PILL_WIDTH_PX * 2 +
      PILL_GAP_PX * 3;
    let nextMode: PillDisplayMode = "full";
    if (
      stripPills.length > 1 &&
      viewportWidthPx > 0 &&
      viewportWidthPx <= NARROW_CHAT_MENU_BREAKPOINT_PX
    ) {
      nextMode = "menu";
    } else if (fullWidthPx > availableWidthPx + 1) {
      if (compactWidthPx <= availableWidthPx + 1) {
        nextMode = "compact";
      } else if (availableWidthPx <= minimumCycleWidthPx + 1) {
        nextMode = "menu";
      } else {
        nextMode = "cycle";
      }
    }
    if (nextMode !== pillDisplayMode) {
      setPillDisplayMode(nextMode);
    }
  }, [pillDisplayMode, pillViewportWidthPx, stripPills, viewportWidthPx]);

  const cycleVisibleCount = useMemo(() => {
    if (stripPills.length === 0) {
      return 0;
    }
    if (pillDisplayMode !== "cycle") {
      return stripPills.length;
    }
    if (pillViewportWidthPx <= 0) {
      return 1;
    }
    const availablePillsWidthPx = Math.max(
      0,
      pillViewportWidthPx -
        CYCLE_CONTROL_BUTTON_WIDTH_PX * 2 -
        PILL_GAP_PX * 2 -
        COMPACT_PILL_WIDTH_PX -
        PILL_GAP_PX,
    );
    const compactSlotWidthPx = COMPACT_PILL_WIDTH_PX + PILL_GAP_PX;
    const nextVisibleCount = Math.floor(
      (availablePillsWidthPx + PILL_GAP_PX) / compactSlotWidthPx,
    );
    return clampNumber(nextVisibleCount, 1, stripPills.length);
  }, [pillDisplayMode, pillViewportWidthPx, stripPills.length]);

  useEffect(() => {
    const maxStartIndex = Math.max(0, stripPills.length - cycleVisibleCount);
    setPillCycleStartIndex((current) => clampNumber(current, 0, maxStartIndex));
  }, [cycleVisibleCount, stripPills.length]);

  const visiblePills = useMemo(() => {
    if (pillDisplayMode !== "cycle") {
      return stripPills;
    }
    return stripPills.slice(
      pillCycleStartIndex,
      pillCycleStartIndex + cycleVisibleCount,
    );
  }, [cycleVisibleCount, pillCycleStartIndex, pillDisplayMode, stripPills]);

  const maxCycleStartIndex = Math.max(0, stripPills.length - cycleVisibleCount);
  const canCycleBackward =
    pillDisplayMode === "cycle" && pillCycleStartIndex > 0;
  const canCycleForward =
    pillDisplayMode === "cycle" && pillCycleStartIndex < maxCycleStartIndex;
  const useCompactPills =
    pillDisplayMode === "compact" || pillDisplayMode === "cycle";
  const showDockHeaderCycleControls =
    openDockedPills.length > visibleDockedPills.length &&
    visibleDockedPills.length > 0;
  const canCycleDockBackward = dockVisibleStartIndex > 0;
  const canCycleDockForward = dockCycleOffsetFromEnd > 0;
  const maximizedExitAnimation = openMaximizedWindow
    ? windowExitAnimationsById[openMaximizedWindow.instanceId] ?? null
    : null;
  const maximizedEnterAnimation = openMaximizedWindow
    ? windowEnterAnimationsById[openMaximizedWindow.instanceId] ?? null
    : null;
  const maximizedEnterAnimationPrime = openMaximizedWindow
    ? windowEnterAnimationPrimesById[openMaximizedWindow.instanceId] ?? null
    : null;
  const isPaneTrackedMaximizedGitGraphWindow =
    openMaximizedWindow?.mode === ChatWindowModeEnum.git_graph_mode &&
    openMaximizedWindow?.instanceId === trackedGitPaneGraphWindowInstanceId;

  if (!canUseManagedChat && orderedPills.length === 0) {
    return null;
  }

  return (
    <>
      {showDockedChatSurface ? (
        <div
          className="pointer-events-none fixed"
          style={{
            zIndex: CHAT_WINDOW_CHROME_LAYER_Z_INDEX,
            left: SIDE_RAIL_WIDTH_PX + DOCK_SURFACE_HORIZONTAL_MARGIN_PX,
            right: dockSurfaceRightPx,
            bottom: dockBottomOffsetPx,
          }}
        >
          <div className="flex min-w-0 items-end justify-end gap-3">
            <div className="pointer-events-auto flex min-w-0 max-w-[28rem] items-end justify-end">
              <MinimizedPillStrip
                pills={stripPills}
                visiblePills={visiblePills}
                pillExitAnimationsById={pillExitAnimationsById}
                useCompactPills={useCompactPills}
                canCreateWindow={canCreateManagedChatWindow}
                showManagerMenu={showDockManagerMenu}
                canCycleBackward={canCycleBackward}
                canCycleForward={canCycleForward}
                maxCycleStartIndex={maxCycleStartIndex}
                pillDisplayMode={pillDisplayMode}
                pillViewportRef={pillViewportRef}
                fullMeasureRowRef={fullMeasureRowRef}
                compactMeasureRowRef={compactMeasureRowRef}
                onCycleBackward={() => {
                  setPillCycleStartIndex((current) => Math.max(0, current - 1));
                }}
                onCycleForward={() => {
                  setPillCycleStartIndex((current) =>
                    Math.min(maxCycleStartIndex, current + 1),
                  );
                }}
                onOpenWindow={handleOpenWindow}
                onCreateWindow={handleCreate}
              />
            </div>
            <section
              className="pointer-events-none"
              style={{
                width: dockSurfaceWidthCss,
                height: dockSurfaceHeightCss,
              }}
              data-testid="project-chat-bottom-dock-window"
            >
              <div
                className="flex h-full min-h-0 items-end justify-end gap-3 overflow-x-hidden overflow-y-hidden px-1"
                data-testid="project-chat-bottom-dock-window-grid"
              >
                {visibleDockedPills.map((pill) => {
                  const resolvedWindowWidthPx =
                    resolvedVisibleDockWindowWidthsById[pill.instanceId] ??
                    DOCK_WINDOW_DEFAULT_WIDTH_PX;
                  const resolvedWindowHeightPx =
                    resolvedDockWindowHeightsById[pill.instanceId] ??
                    DOCK_WINDOW_DEFAULT_HEIGHT_PX;
                  const dockedExitAnimation =
                    windowExitAnimationsById[pill.instanceId] ?? null;
                  const dockedEnterAnimation =
                    windowEnterAnimationsById[pill.instanceId] ?? null;
                  const dockedEnterAnimationPrime =
                    windowEnterAnimationPrimesById[pill.instanceId] ?? null;
                  return (
                    <article
                      key={pill.instanceId}
                      className={`pointer-events-auto relative flex min-h-0 min-w-[16rem] shrink-0 flex-col overflow-hidden bg-transparent ${DOCKED_CHAT_WINDOW_SHADOW_CLASS} ${getChatWindowExitAnimationClass(
                        dockedExitAnimation,
                        ChatWindowPlacementEnum.bottom_docked,
                      )} ${getChatWindowEnterAnimationClass(
                        dockedEnterAnimationPrime,
                        ChatWindowPlacementEnum.bottom_docked,
                      )}`}
                      style={{
                        width: resolvedWindowWidthPx,
                        height: resolvedWindowHeightPx,
                        minWidth: MIN_DOCK_CHAT_WIDTH_PX,
                        maxWidth: DOCK_SURFACE_MAX_WIDTH_PX,
                        minHeight: MIN_DOCK_CHAT_HEIGHT_PX,
                        maxHeight: dockAvailableHeightPx,
                      }}
                      data-testid="project-chat-bottom-dock-window-panel"
                      data-chat-window-instance-id={pill.instanceId}
                      data-chat-window-exit-animation={
                        dockedExitAnimation ?? undefined
                      }
                      data-chat-window-enter-animation={
                        dockedEnterAnimation ?? undefined
                      }
                      onPointerDown={() => {
                        handleFocusWindow(pill.instanceId);
                      }}
                    >
                      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                        {pill.sectionId ? (
                          <SectionWindowSurface
                            sectionId={pill.sectionId}
                            roundedClassName={
                              DOCKED_WINDOWED_CHAT_ROUNDED_CLASS
                            }
                            chatHost={ChatWindowPlacementEnum.bottom_docked}
                            chatModeOverride={pill.mode}
                            headerActions={
                              <>
                                {showDockHeaderCycleControls ? (
                                  <>
                                    <button
                                      type="button"
                                      className={`${SECTION_WINDOW_ACTION_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-35`}
                                      onClick={handleCycleDockWindowsBackward}
                                      disabled={!canCycleDockBackward}
                                      aria-label={getWindowControlQuickInfoText(
                                        {
                                          action: "show_previous_docked_chat",
                                        },
                                      )}
                                      data-testid="project-chat-window-cycle-left"
                                      data-chat-window-instance-id={
                                        pill.instanceId
                                      }
                                      {...getWindowControlQuickInfoHandlers({
                                        action: "show_previous_docked_chat",
                                      })}
                                    >
                                      <MdChevronLeft size={12} />
                                    </button>
                                    <button
                                      type="button"
                                      className={`${SECTION_WINDOW_ACTION_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-35`}
                                      onClick={handleCycleDockWindowsForward}
                                      disabled={!canCycleDockForward}
                                      aria-label={getWindowControlQuickInfoText(
                                        {
                                          action: "show_next_docked_chat",
                                        },
                                      )}
                                      data-testid="project-chat-window-cycle-right"
                                      data-chat-window-instance-id={
                                        pill.instanceId
                                      }
                                      {...getWindowControlQuickInfoHandlers({
                                        action: "show_next_docked_chat",
                                      })}
                                    >
                                      <MdChevronRight size={12} />
                                    </button>
                                  </>
                                ) : null}
                                {canMoveProjectChatWindowToCanvas(pill.mode) ? (
                                  <button
                                    type="button"
                                    className={
                                      SECTION_WINDOW_ACTION_BUTTON_CLASS
                                    }
                                    onClick={() => {
                                      void bootProjectChatWindowToCanvasSection(
                                        pill.instanceId,
                                      );
                                    }}
                                    aria-label={getWindowControlQuickInfoText({
                                      action: "show_in_canvas",
                                      title: pill.title,
                                    })}
                                    data-testid="project-chat-window-show-in-canvas"
                                    data-chat-window-instance-id={
                                      pill.instanceId
                                    }
                                    {...getWindowControlQuickInfoHandlers({
                                      action: "show_in_canvas",
                                      title: pill.title,
                                    })}
                                  >
                                    <MdFlipToFront size={12} />
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className={SECTION_WINDOW_ACTION_BUTTON_CLASS}
                                  onClick={() => {
                                    handleUndockWindow(pill.instanceId);
                                  }}
                                  aria-label={getWindowControlQuickInfoText({
                                    action: "undock_window",
                                    title: pill.title,
                                  })}
                                  data-testid="project-chat-window-undock"
                                  data-chat-window-instance-id={pill.instanceId}
                                  {...getWindowControlQuickInfoHandlers({
                                    action: "undock_window",
                                    title: pill.title,
                                  })}
                                >
                                  <MdOpenInNew size={12} />
                                </button>
                                <button
                                  type="button"
                                  className={SECTION_WINDOW_ACTION_BUTTON_CLASS}
                                  onClick={() => {
                                    handleMaximizeWindow(pill.instanceId);
                                  }}
                                  aria-label={getWindowControlQuickInfoText({
                                    action: "maximize_window",
                                    title: pill.title,
                                  })}
                                  data-testid="project-chat-window-maximize"
                                  data-chat-window-instance-id={pill.instanceId}
                                  {...getWindowControlQuickInfoHandlers({
                                    action: "maximize_window",
                                    title: pill.title,
                                  })}
                                >
                                  {WINDOW_MAXIMIZE_ICON}
                                </button>
                                <button
                                  type="button"
                                  className={
                                    SECTION_WINDOW_MINIMIZE_BUTTON_CLASS
                                  }
                                  onClick={() => {
                                    handleMinimizeWindow(pill.instanceId);
                                  }}
                                  aria-label={getWindowControlQuickInfoText({
                                    action: "minimize_window",
                                    title: pill.title,
                                  })}
                                  data-testid="project-chat-window-minimize"
                                  data-chat-window-instance-id={pill.instanceId}
                                  {...getWindowControlQuickInfoHandlers({
                                    action: "minimize_window",
                                    title: pill.title,
                                  })}
                                >
                                  <i className="gg-math-minus" />
                                </button>
                                <button
                                  type="button"
                                  className={SECTION_WINDOW_CLOSE_BUTTON_CLASS}
                                  onClick={() => {
                                    handleCloseWindow(pill.instanceId);
                                  }}
                                  aria-label={getWindowControlQuickInfoText({
                                    action: "close_window",
                                    title: pill.title,
                                  })}
                                  data-testid="project-chat-window-close"
                                  data-chat-window-instance-id={pill.instanceId}
                                  {...getWindowControlQuickInfoHandlers({
                                    action: "close_window",
                                    title: pill.title,
                                  })}
                                >
                                  <i className="gg-close" />
                                </button>
                              </>
                            }
                          />
                        ) : (
                          <ProjectChatWindowSurface
                            title={pill.title}
                            mode={pill.mode}
                            instanceId={pill.instanceId}
                            allowLayoutMutations={canEditLayout}
                            roundedClassName={
                              DOCKED_WINDOWED_CHAT_ROUNDED_CLASS
                            }
                            onTitleClick={() => {
                              handleFocusWindow(pill.instanceId);
                            }}
                            onTitleCommit={
                              pill.mode === ChatWindowModeEnum.git_graph_mode
                                ? undefined
                                : (nextTitle) => {
                                    handleSetWindowTitle(
                                      pill.instanceId,
                                      nextTitle,
                                    );
                                  }
                            }
                            actions={[
                              ...(showDockHeaderCycleControls
                                ? [
                                    {
                                      key: "cycle_left",
                                      label: "Show previous docked chat",
                                      testId: "project-chat-window-cycle-left",
                                      instanceId: pill.instanceId,
                                      icon: <MdChevronLeft size={12} />,
                                      className: `${SECTION_WINDOW_ACTION_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-35`,
                                      disabled: !canCycleDockBackward,
                                      onClick: () => {
                                        handleCycleDockWindowsBackward();
                                      },
                                    },
                                    {
                                      key: "cycle_right",
                                      label: "Show next docked chat",
                                      testId: "project-chat-window-cycle-right",
                                      instanceId: pill.instanceId,
                                      icon: <MdChevronRight size={12} />,
                                      className: `${SECTION_WINDOW_ACTION_BUTTON_CLASS} disabled:cursor-not-allowed disabled:opacity-35`,
                                      disabled: !canCycleDockForward,
                                      onClick: () => {
                                        handleCycleDockWindowsForward();
                                      },
                                    },
                                  ]
                                : []),
                              ...(canMoveProjectChatWindowToCanvas(pill.mode)
                                ? [
                                    {
                                      key: "show_in_canvas",
                                      label: `Show ${pill.title} in canvas`,
                                      testId:
                                        "project-chat-window-show-in-canvas",
                                      instanceId: pill.instanceId,
                                      icon: <MdFlipToFront size={12} />,
                                      onClick: () => {
                                        void bootProjectChatWindowToCanvasSection(
                                          pill.instanceId,
                                        );
                                      },
                                    },
                                  ]
                                : []),
                              {
                                key: "undock",
                                label: `Undock ${pill.title}`,
                                testId: "project-chat-window-undock",
                                instanceId: pill.instanceId,
                                icon: <MdOpenInNew size={12} />,
                                onClick: () => {
                                  handleUndockWindow(pill.instanceId);
                                },
                              },
                              {
                                key: "maximize",
                                label: `Maximize ${pill.title}`,
                                testId: "project-chat-window-maximize",
                                instanceId: pill.instanceId,
                                icon: WINDOW_MAXIMIZE_ICON,
                                onClick: () => {
                                  handleMaximizeWindow(pill.instanceId);
                                },
                              },
                              {
                                key: "minimize",
                                label: `Minimize ${pill.title}`,
                                testId: "project-chat-window-minimize",
                                instanceId: pill.instanceId,
                                className: SECTION_WINDOW_MINIMIZE_BUTTON_CLASS,
                                icon: <i className="gg-math-minus" />,
                                onClick: () => {
                                  handleMinimizeWindow(pill.instanceId);
                                },
                              },
                              {
                                key: "close",
                                label: `Close ${pill.title}`,
                                testId: "project-chat-window-close",
                                instanceId: pill.instanceId,
                                className: SECTION_WINDOW_CLOSE_BUTTON_CLASS,
                                icon: <i className="gg-close" />,
                                onClick: () => {
                                  handleCloseWindow(pill.instanceId);
                                },
                              },
                            ]}
                          >
                            {pill.mode === ChatWindowModeEnum.git_graph_mode ? (
                              <GitGraphWindowContent
                                instanceId={pill.instanceId}
                                showEmbeddedGitPaneToggle
                              />
                            ) : (
                              <UnifiedChatSurface
                                mode={pill.mode}
                                host={ChatWindowPlacementEnum.bottom_docked}
                                surfaceId={buildWorkspaceProjectChatWindowSurfaceId(
                                  projectConfigId,
                                  pill.instanceId,
                                )}
                                projectChatId={pill.chatId}
                                setProjectChatId={(next) => {
                                  const resolvedChatId =
                                    typeof next === "function"
                                      ? next(pill.chatId ?? undefined)
                                      : next;
                                  setProjectChatWindowChatId(
                                    pill.instanceId,
                                    resolvedChatId,
                                  );
                                }}
                              />
                            )}
                          </ProjectChatWindowSurface>
                        )}
                        {canEditLayout
                          ? DOCK_WINDOW_RESIZE_HANDLES.map((handle) => (
                              <div
                                key={`${pill.instanceId}-${handle.direction}`}
                                role="separator"
                                aria-orientation={
                                  handle.direction === "top" ||
                                  handle.direction === "bottom"
                                    ? "horizontal"
                                    : "vertical"
                                }
                                className={`group/resize absolute z-10 flex items-center justify-center ${handle.className} ${handle.cursorClassName}`}
                                data-testid="project-chat-bottom-dock-resize-handle"
                                data-resize-direction={handle.direction}
                                onPointerDown={(event) => {
                                  handleSingleDockResizePointerDown(
                                    event,
                                    pill,
                                    handle.direction,
                                  );
                                }}
                                onPointerMove={
                                  handleSingleDockResizePointerMove
                                }
                                onPointerUp={handleSingleDockResizePointerUp}
                              >
                                {handle.indicatorClassName ? (
                                  <div className={handle.indicatorClassName} />
                                ) : null}
                              </div>
                            ))
                          : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      ) : null}
      {!isCanvasVisibilitySuppressed &&
      canEditLayout &&
      activeFloatingSnapPreview ? (
        <div
          className="pointer-events-none fixed rounded-none border-2 border-setta-400/80 bg-setta-300/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] dark:border-setta-500/90 dark:bg-setta-500/25 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
          style={{
            zIndex: CHAT_WINDOW_SNAP_PREVIEW_Z_INDEX,
            left: activeFloatingSnapPreview.bounds.x,
            top: activeFloatingSnapPreview.bounds.y,
            width: activeFloatingSnapPreview.bounds.width,
            height: activeFloatingSnapPreview.bounds.height,
          }}
          data-testid="project-chat-floating-snap-ghost-zone"
          data-chat-window-snap-preset={activeFloatingSnapPreview.preset}
        />
      ) : null}
      {!isCanvasVisibilitySuppressed &&
      canEditLayout &&
      floatingSnapResizeHandles.length > 0 ? (
        <div
          className="pointer-events-none fixed inset-0"
          style={{ zIndex: CHAT_WINDOW_SNAP_PREVIEW_Z_INDEX }}
        >
          {floatingSnapResizeHandles.map((handle) => {
            const handleLengthPx = Math.max(
              0,
              handle.end -
                handle.start -
                FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
            );
            return (
              <div
                key={`${handle.axis}-${handle.leadingInstanceIds.join("|")}-${handle.trailingInstanceIds.join("|")}`}
                role="separator"
                aria-orientation={
                  handle.axis === "vertical" ? "vertical" : "horizontal"
                }
                className={`pointer-events-auto absolute flex items-center justify-center ${
                  handle.axis === "vertical"
                    ? "cursor-col-resize"
                    : "cursor-row-resize"
                }`}
                style={
                  handle.axis === "vertical"
                    ? {
                        left:
                          handle.coordinate -
                          FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX / 2,
                        top: handle.start,
                        width: FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                        height: Math.max(
                          FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                          handleLengthPx +
                            FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                        ),
                      }
                    : {
                        left: handle.start,
                        top:
                          handle.coordinate -
                          FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX / 2,
                        width: Math.max(
                          FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                          handleLengthPx +
                            FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                        ),
                        height: FLOATING_SNAP_RESIZE_HANDLE_HIT_SIZE_PX,
                      }
                }
                onPointerDown={(event) => {
                  handleFloatingSnapResizePointerDown(event, handle);
                }}
                onPointerMove={handleFloatingSnapResizePointerMove}
                onPointerUp={handleFloatingSnapResizePointerUp}
                data-testid="project-chat-floating-snap-resize-handle"
                data-resize-axis={handle.axis}
              >
                <div
                  className="rounded-full bg-setta-300/80 transition-colors hover:bg-blue-500 dark:bg-setta-600/80 dark:hover:bg-blue-400"
                  style={
                    handle.axis === "vertical"
                      ? {
                          width: FLOATING_SNAP_RESIZE_HANDLE_LINE_THICKNESS_PX,
                          height: Math.max(24, handle.end - handle.start - 8),
                        }
                      : {
                          width: Math.max(24, handle.end - handle.start - 8),
                          height: FLOATING_SNAP_RESIZE_HANDLE_LINE_THICKNESS_PX,
                        }
                  }
                />
              </div>
            );
          })}
        </div>
      ) : null}
      {isCanvasVisibilitySuppressed ? null : (
        <div
          className="pointer-events-none fixed inset-0"
          style={{ zIndex: CHAT_WINDOW_CHROME_LAYER_Z_INDEX }}
        >
          {openFloatingPills.map((pill) => {
            const bounds = floatingBoundsById[pill.instanceId] ?? pill.bounds;
            const floatingExitAnimation =
              windowExitAnimationsById[pill.instanceId] ?? null;
            const floatingEnterAnimation =
              windowEnterAnimationsById[pill.instanceId] ?? null;
            const floatingEnterAnimationPrime =
              windowEnterAnimationPrimesById[pill.instanceId] ?? null;
            const floatingSnapPreset =
              floatingSnapPresetById[pill.instanceId] ?? null;
            return (
              <article
                key={pill.instanceId}
                className={`pointer-events-auto absolute flex min-h-0 min-w-0 flex-col overflow-hidden ${
                  floatingSnapPreset
                    ? "rounded-none shadow-none"
                    : `${WINDOWED_CHAT_ROUNDED_CLASS} ${FLOATING_CHAT_WINDOW_SHADOW_CLASS}`
                } ${getChatWindowExitAnimationClass(
                  floatingExitAnimation,
                  ChatWindowPlacementEnum.floating,
                )} ${getChatWindowEnterAnimationClass(
                  floatingEnterAnimationPrime,
                  ChatWindowPlacementEnum.floating,
                )}`}
                style={{
                  left: bounds.x,
                  top: bounds.y,
                  width: bounds.width,
                  height: bounds.height,
                  zIndex: pill.zIndex,
                }}
                data-testid="project-chat-floating-window"
                data-chat-window-instance-id={pill.instanceId}
                data-chat-window-snap-preset={floatingSnapPreset ?? undefined}
                data-chat-window-exit-animation={
                  floatingExitAnimation ?? undefined
                }
                data-chat-window-enter-animation={
                  floatingEnterAnimation ?? undefined
                }
                onPointerDown={() => {
                  handleFocusWindow(pill.instanceId);
                }}
              >
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                  {pill.sectionId ? (
                    <SectionWindowSurface
                      sectionId={pill.sectionId}
                      roundedClassName={
                        floatingSnapPreset
                          ? "rounded-none"
                          : WINDOWED_CHAT_ROUNDED_CLASS
                      }
                      chatHost={ChatWindowPlacementEnum.floating}
                      chatModeOverride={pill.mode}
                      headerActions={
                        canEditLayout ? (
                          <>
                            {canMoveProjectChatWindowToCanvas(pill.mode) ? (
                              <button
                                type="button"
                                className={SECTION_WINDOW_ACTION_BUTTON_CLASS}
                                onClick={() => {
                                  void bootProjectChatWindowToCanvasSection(
                                    pill.instanceId,
                                  );
                                }}
                                aria-label={getWindowControlQuickInfoText({
                                  action: "show_in_canvas",
                                  title: pill.title,
                                })}
                                data-testid="project-chat-window-show-in-canvas"
                                data-chat-window-instance-id={pill.instanceId}
                                {...getWindowControlQuickInfoHandlers({
                                  action: "show_in_canvas",
                                  title: pill.title,
                                })}
                              >
                                <MdFlipToFront size={12} />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={SECTION_WINDOW_ACTION_BUTTON_CLASS}
                              onClick={() => {
                                handleDockWindow(pill.instanceId);
                              }}
                              aria-label={getWindowControlQuickInfoText({
                                action: "dock_window",
                                title: pill.title,
                              })}
                              data-testid="project-chat-window-dock"
                              data-chat-window-instance-id={pill.instanceId}
                              {...getWindowControlQuickInfoHandlers({
                                action: "dock_window",
                                title: pill.title,
                              })}
                            >
                              <MdVerticalAlignBottom size={12} />
                            </button>
                            <button
                              type="button"
                              className={SECTION_WINDOW_ACTION_BUTTON_CLASS}
                              onClick={() => {
                                handleMaximizeWindow(pill.instanceId);
                              }}
                              aria-label={getWindowControlQuickInfoText({
                                action: "maximize_window",
                                title: pill.title,
                              })}
                              data-testid="project-chat-window-maximize"
                              data-chat-window-instance-id={pill.instanceId}
                              {...getWindowControlQuickInfoHandlers({
                                action: "maximize_window",
                                title: pill.title,
                              })}
                            >
                              {WINDOW_MAXIMIZE_ICON}
                            </button>
                            <button
                              type="button"
                              className={SECTION_WINDOW_MINIMIZE_BUTTON_CLASS}
                              onClick={() => {
                                handleMinimizeWindow(pill.instanceId);
                              }}
                              aria-label={getWindowControlQuickInfoText({
                                action: "minimize_window",
                                title: pill.title,
                              })}
                              data-testid="project-chat-window-minimize"
                              data-chat-window-instance-id={pill.instanceId}
                              {...getWindowControlQuickInfoHandlers({
                                action: "minimize_window",
                                title: pill.title,
                              })}
                            >
                              <i className="gg-math-minus" />
                            </button>
                            <button
                              type="button"
                              className={SECTION_WINDOW_CLOSE_BUTTON_CLASS}
                              onClick={() => {
                                handleCloseWindow(pill.instanceId);
                              }}
                              aria-label={getWindowControlQuickInfoText({
                                action: "close_window",
                                title: pill.title,
                              })}
                              data-testid="project-chat-window-close"
                              data-chat-window-instance-id={pill.instanceId}
                              {...getWindowControlQuickInfoHandlers({
                                action: "close_window",
                                title: pill.title,
                              })}
                            >
                              <i className="gg-close" />
                            </button>
                          </>
                        ) : null
                      }
                      headerProps={
                        canEditLayout
                          ? {
                              "data-testid":
                                "project-chat-floating-window-drag-handle",
                              className: "cursor-move",
                              onPointerDown: (event) => {
                                if (
                                  isInteractiveWindowHeaderTarget(event.target)
                                ) {
                                  return;
                                }
                                handleFloatingDragPointerDown(event, pill);
                              },
                              onPointerMove: handleFloatingDragPointerMove,
                              onPointerUp: handleFloatingDragPointerUp,
                            }
                          : undefined
                      }
                    />
                  ) : (
                    <ProjectChatWindowSurface
                      title={pill.title}
                      mode={pill.mode}
                      instanceId={pill.instanceId}
                      allowLayoutMutations={canEditLayout}
                      roundedClassName={
                        floatingSnapPreset
                          ? "rounded-none"
                          : WINDOWED_CHAT_ROUNDED_CLASS
                      }
                      headerClassName="cursor-move"
                      onTitleClick={() => {
                        handleFocusWindow(pill.instanceId);
                      }}
                      onTitleCommit={
                        pill.mode === ChatWindowModeEnum.git_graph_mode
                          ? undefined
                          : (nextTitle) => {
                              handleSetWindowTitle(pill.instanceId, nextTitle);
                            }
                      }
                      dragHandleTestId="project-chat-floating-window-drag-handle"
                      onTitlePointerDown={(event) => {
                        handleFloatingDragPointerDown(event, pill);
                      }}
                      onTitlePointerMove={handleFloatingDragPointerMove}
                      onTitlePointerUp={handleFloatingDragPointerUp}
                      actions={[
                        ...(canMoveProjectChatWindowToCanvas(pill.mode)
                          ? [
                              {
                                key: "show_in_canvas",
                                label: `Show ${pill.title} in canvas`,
                                testId: "project-chat-window-show-in-canvas",
                                instanceId: pill.instanceId,
                                icon: <MdFlipToFront size={12} />,
                                onClick: () => {
                                  void bootProjectChatWindowToCanvasSection(
                                    pill.instanceId,
                                  );
                                },
                              },
                            ]
                          : []),
                        {
                          key: "dock",
                          label: `Dock ${pill.title}`,
                          testId: "project-chat-window-dock",
                          instanceId: pill.instanceId,
                          icon: <MdVerticalAlignBottom size={12} />,
                          onClick: () => {
                            handleDockWindow(pill.instanceId);
                          },
                        },
                        {
                          key: "maximize",
                          label: `Maximize ${pill.title}`,
                          testId: "project-chat-window-maximize",
                          instanceId: pill.instanceId,
                          icon: WINDOW_MAXIMIZE_ICON,
                          onClick: () => {
                            handleMaximizeWindow(pill.instanceId);
                          },
                        },
                        {
                          key: "minimize",
                          label: `Minimize ${pill.title}`,
                          testId: "project-chat-window-minimize",
                          instanceId: pill.instanceId,
                          className: SECTION_WINDOW_MINIMIZE_BUTTON_CLASS,
                          icon: <i className="gg-math-minus" />,
                          onClick: () => {
                            handleMinimizeWindow(pill.instanceId);
                          },
                        },
                        {
                          key: "close",
                          label: `Close ${pill.title}`,
                          testId: "project-chat-window-close",
                          instanceId: pill.instanceId,
                          className: SECTION_WINDOW_CLOSE_BUTTON_CLASS,
                          icon: <i className="gg-close" />,
                          onClick: () => {
                            handleCloseWindow(pill.instanceId);
                          },
                        },
                      ]}
                    >
                      {pill.mode === ChatWindowModeEnum.git_graph_mode ? (
                        <GitGraphWindowContent
                          instanceId={pill.instanceId}
                          showEmbeddedGitPaneToggle
                        />
                      ) : (
                        <UnifiedChatSurface
                          mode={pill.mode}
                          host={ChatWindowPlacementEnum.floating}
                          surfaceId={buildWorkspaceProjectChatWindowSurfaceId(
                            projectConfigId,
                            pill.instanceId,
                          )}
                          projectChatId={pill.chatId}
                          setProjectChatId={(next) => {
                            const resolvedChatId =
                              typeof next === "function"
                                ? next(pill.chatId ?? undefined)
                                : next;
                            setProjectChatWindowChatId(
                              pill.instanceId,
                              resolvedChatId,
                            );
                          }}
                        />
                      )}
                    </ProjectChatWindowSurface>
                  )}
                  {floatingSnapPreset || !canEditLayout
                    ? null
                    : FLOATING_WINDOW_RESIZE_HANDLES.map((handle) => (
                        <div
                          key={`${pill.instanceId}-floating-${handle.direction}`}
                          role="separator"
                          aria-orientation={
                            handle.direction === "top" ||
                            handle.direction === "bottom"
                              ? "horizontal"
                              : "vertical"
                          }
                          className={`absolute z-10 flex items-center justify-center ${handle.className} ${handle.cursorClassName}`}
                          onPointerDown={(event) => {
                            handleFloatingResizePointerDown(
                              event,
                              pill,
                              handle.direction,
                            );
                          }}
                          onPointerMove={handleFloatingResizePointerMove}
                          onPointerUp={handleFloatingResizePointerUp}
                          data-testid="project-chat-floating-window-resize-handle"
                          data-resize-direction={handle.direction}
                          data-chat-window-instance-id={pill.instanceId}
                        >
                          {handle.indicatorClassName ? (
                            <div className={handle.indicatorClassName} />
                          ) : null}
                        </div>
                      ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!isCanvasVisibilitySuppressed && openMaximizedWindow ? (
        <section
          className={`border-setta-250 fixed overflow-hidden rounded-none border bg-setta-50 shadow-none dark:border-setta-800 dark:bg-setta-900 ${getChatWindowExitAnimationClass(
            maximizedExitAnimation,
            ChatWindowPlacementEnum.maximized,
          )} ${getChatWindowEnterAnimationClass(
            maximizedEnterAnimationPrime,
            ChatWindowPlacementEnum.maximized,
          )}`}
          style={{
            zIndex: isPaneTrackedMaximizedGitGraphWindow
              ? TRACKED_PANE_CHAT_WINDOW_LAYER_Z_INDEX
              : CHAT_WINDOW_LAYER_Z_INDEX,
            ...(isPaneTrackedMaximizedGitGraphWindow && trackedGitPaneGraphRect
              ? {
                  left: trackedGitPaneGraphRect.left,
                  top: trackedGitPaneGraphRect.top,
                  width: trackedGitPaneGraphRect.width,
                  height: trackedGitPaneGraphRect.height,
                }
              : {
                  left: SIDE_RAIL_WIDTH_PX,
                  right: SIDE_RAIL_WIDTH_PX,
                  top: workspaceTopInsetPx,
                  bottom: dockBottomOffsetPx,
                }),
          }}
          data-testid="project-chat-maximized-window"
          data-chat-window-instance-id={openMaximizedWindow.instanceId}
          data-chat-window-tracked-pane-target={
            isPaneTrackedMaximizedGitGraphWindow ? "git_overview" : undefined
          }
          data-chat-window-exit-animation={maximizedExitAnimation ?? undefined}
          data-chat-window-enter-animation={
            maximizedEnterAnimation ?? undefined
          }
        >
          <article className="flex h-full min-h-0 flex-col overflow-hidden">
            {openMaximizedWindow.sectionId ? (
              <SectionWindowSurface
                sectionId={openMaximizedWindow.sectionId}
                roundedClassName="rounded-none"
                chatHost={ChatWindowPlacementEnum.maximized}
                chatModeOverride={openMaximizedWindow.mode}
                headerActions={
                  canEditLayout ? (
                    <>
                      {canMoveProjectChatWindowToCanvas(
                        openMaximizedWindow.mode,
                      ) ? (
                        <button
                          type="button"
                          className={SECTION_WINDOW_ACTION_BUTTON_CLASS}
                          onClick={() => {
                            void bootProjectChatWindowToCanvasSection(
                              openMaximizedWindow.instanceId,
                            );
                          }}
                          aria-label={getWindowControlQuickInfoText({
                            action: "show_in_canvas",
                            title: openMaximizedWindow.title,
                          })}
                          data-testid="project-chat-window-show-in-canvas"
                          data-chat-window-instance-id={
                            openMaximizedWindow.instanceId
                          }
                          {...getWindowControlQuickInfoHandlers({
                            action: "show_in_canvas",
                            title: openMaximizedWindow.title,
                          })}
                        >
                          <MdFlipToFront size={12} />
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className={SECTION_WINDOW_ACTION_BUTTON_CLASS}
                        onClick={() => {
                          handleRestoreWindow(openMaximizedWindow.instanceId);
                        }}
                        aria-label={getWindowControlQuickInfoText({
                          action: "restore_window",
                          title: openMaximizedWindow.title,
                        })}
                        data-testid="project-chat-window-restore"
                        data-chat-window-instance-id={
                          openMaximizedWindow.instanceId
                        }
                        {...getWindowControlQuickInfoHandlers({
                          action: "restore_window",
                          title: openMaximizedWindow.title,
                        })}
                      >
                        <MdFlipToFront size={12} />
                      </button>
                      <button
                        type="button"
                        className={SECTION_WINDOW_ACTION_BUTTON_CLASS}
                        onClick={() => {
                          handleDockWindow(openMaximizedWindow.instanceId);
                        }}
                        aria-label={getWindowControlQuickInfoText({
                          action: "dock_window",
                          title: openMaximizedWindow.title,
                        })}
                        data-testid="project-chat-window-dock"
                        data-chat-window-instance-id={
                          openMaximizedWindow.instanceId
                        }
                        {...getWindowControlQuickInfoHandlers({
                          action: "dock_window",
                          title: openMaximizedWindow.title,
                        })}
                      >
                        <MdVerticalAlignBottom size={12} />
                      </button>
                      <button
                        type="button"
                        className={SECTION_WINDOW_MINIMIZE_BUTTON_CLASS}
                        onClick={() => {
                          handleMinimizeWindow(openMaximizedWindow.instanceId);
                        }}
                        aria-label={getWindowControlQuickInfoText({
                          action: "minimize_window",
                          title: openMaximizedWindow.title,
                        })}
                        data-testid="project-chat-window-minimize"
                        data-chat-window-instance-id={
                          openMaximizedWindow.instanceId
                        }
                        {...getWindowControlQuickInfoHandlers({
                          action: "minimize_window",
                          title: openMaximizedWindow.title,
                        })}
                      >
                        <i className="gg-math-minus" />
                      </button>
                      <button
                        type="button"
                        className={SECTION_WINDOW_CLOSE_BUTTON_CLASS}
                        onClick={() => {
                          handleCloseWindow(openMaximizedWindow.instanceId);
                        }}
                        aria-label={getWindowControlQuickInfoText({
                          action: "close_window",
                          title: openMaximizedWindow.title,
                        })}
                        data-testid="project-chat-window-close"
                        data-chat-window-instance-id={
                          openMaximizedWindow.instanceId
                        }
                        {...getWindowControlQuickInfoHandlers({
                          action: "close_window",
                          title: openMaximizedWindow.title,
                        })}
                      >
                        <i className="gg-close" />
                      </button>
                    </>
                  ) : null
                }
              />
            ) : (
              <ProjectChatWindowSurface
                title={openMaximizedWindow.title}
                mode={openMaximizedWindow.mode}
                instanceId={openMaximizedWindow.instanceId}
                allowLayoutMutations={canEditLayout}
                roundedClassName="rounded-none"
                onTitleClick={() => {
                  handleFocusWindow(openMaximizedWindow.instanceId);
                }}
                onTitleCommit={
                  openMaximizedWindow.mode === ChatWindowModeEnum.git_graph_mode
                    ? undefined
                    : (nextTitle) => {
                        handleSetWindowTitle(
                          openMaximizedWindow.instanceId,
                          nextTitle,
                        );
                      }
                }
                actions={[
                  ...(canMoveProjectChatWindowToCanvas(openMaximizedWindow.mode)
                    ? [
                        {
                          key: "show_in_canvas",
                          label: `Show ${openMaximizedWindow.title} in canvas`,
                          testId: "project-chat-window-show-in-canvas",
                          instanceId: openMaximizedWindow.instanceId,
                          icon: <MdFlipToFront size={12} />,
                          onClick: () => {
                            void bootProjectChatWindowToCanvasSection(
                              openMaximizedWindow.instanceId,
                            );
                          },
                        },
                      ]
                    : []),
                  {
                    key: "restore",
                    label: `Restore ${openMaximizedWindow.title}`,
                    testId: "project-chat-window-restore",
                    instanceId: openMaximizedWindow.instanceId,
                    icon: <MdFlipToFront size={12} />,
                    onClick: () => {
                      handleRestoreWindow(openMaximizedWindow.instanceId);
                    },
                  },
                  {
                    key: "dock",
                    label: `Dock ${openMaximizedWindow.title}`,
                    testId: "project-chat-window-dock",
                    instanceId: openMaximizedWindow.instanceId,
                    icon: <MdVerticalAlignBottom size={12} />,
                    onClick: () => {
                      handleDockWindow(openMaximizedWindow.instanceId);
                    },
                  },
                  {
                    key: "minimize",
                    label: `Minimize ${openMaximizedWindow.title}`,
                    testId: "project-chat-window-minimize",
                    instanceId: openMaximizedWindow.instanceId,
                    className: SECTION_WINDOW_MINIMIZE_BUTTON_CLASS,
                    icon: <i className="gg-math-minus" />,
                    onClick: () => {
                      handleMinimizeWindow(openMaximizedWindow.instanceId);
                    },
                  },
                  {
                    key: "close",
                    label: `Close ${openMaximizedWindow.title}`,
                    testId: "project-chat-window-close",
                    instanceId: openMaximizedWindow.instanceId,
                    className: SECTION_WINDOW_CLOSE_BUTTON_CLASS,
                    icon: <i className="gg-close" />,
                    onClick: () => {
                      handleCloseWindow(openMaximizedWindow.instanceId);
                    },
                  },
                ]}
              >
                {openMaximizedWindow.mode ===
                ChatWindowModeEnum.git_graph_mode ? (
                  <GitGraphWindowContent
                    instanceId={openMaximizedWindow.instanceId}
                    showEmbeddedGitPaneToggle={
                      !isPaneTrackedMaximizedGitGraphWindow
                    }
                  />
                ) : (
                  <UnifiedChatSurface
                    mode={openMaximizedWindow.mode}
                    host={ChatWindowPlacementEnum.maximized}
                    surfaceId={buildWorkspaceProjectChatWindowSurfaceId(
                      projectConfigId,
                      openMaximizedWindow.instanceId,
                    )}
                    projectChatId={openMaximizedWindow.chatId}
                    setProjectChatId={(next) => {
                      const resolvedChatId =
                        typeof next === "function"
                          ? next(openMaximizedWindow.chatId ?? undefined)
                          : next;
                      setProjectChatWindowChatId(
                        openMaximizedWindow.instanceId,
                        resolvedChatId,
                      );
                    }}
                  />
                )}
              </ProjectChatWindowSurface>
            )}
          </article>
        </section>
      ) : null}
      {showStandaloneMinimizedPills ? (
        <div
          className="pointer-events-none fixed"
          style={{
            zIndex: CHAT_WINDOW_CHROME_LAYER_Z_INDEX,
            left: SIDE_RAIL_WIDTH_PX + DOCK_SURFACE_HORIZONTAL_MARGIN_PX,
            right: dockSurfaceRightPx,
            bottom: dockBottomOffsetPx,
          }}
        >
          <MinimizedPillStrip
            pills={stripPills}
            visiblePills={visiblePills}
            pillExitAnimationsById={pillExitAnimationsById}
            useCompactPills={useCompactPills}
            canCreateWindow={canCreateManagedChatWindow}
            showManagerMenu={showDockManagerMenu}
            canCycleBackward={canCycleBackward}
            canCycleForward={canCycleForward}
            maxCycleStartIndex={maxCycleStartIndex}
            pillDisplayMode={pillDisplayMode}
            pillViewportRef={pillViewportRef}
            fullMeasureRowRef={fullMeasureRowRef}
            compactMeasureRowRef={compactMeasureRowRef}
            onCycleBackward={() => {
              setPillCycleStartIndex((current) => Math.max(0, current - 1));
            }}
            onCycleForward={() => {
              setPillCycleStartIndex((current) =>
                Math.min(maxCycleStartIndex, current + 1),
              );
            }}
            onOpenWindow={handleOpenWindow}
            onCreateWindow={handleCreate}
          />
        </div>
      ) : null}
      <nav
        className="pointer-events-none fixed"
        style={{
          zIndex: CHAT_WINDOW_CHROME_LAYER_Z_INDEX,
          right: dockSurfaceRightPx,
          width: dockSurfaceWidthCss,
          bottom: dockBottomOffsetPx + DOCK_BAR_FLOAT_BOTTOM_OFFSET_PX,
          height: DOCK_BAR_HEIGHT_PX,
        }}
        data-testid="project-chat-bottom-dock-strip"
      />
      {showCanvasVisibilityToggle ? (
        <button
          type="button"
          className={`${CANVAS_VISIBILITY_TOGGLE_BUTTON_CLASS} ${
            isCanvasVisibilitySuppressed
              ? CANVAS_VISIBILITY_TOGGLE_BUTTON_ACTIVE_CLASS
              : ""
          }`}
          style={{
            zIndex: CHAT_WINDOW_TOGGLE_Z_INDEX,
            left: 6,
            bottom: dockBottomOffsetPx + 136,
          }}
          onClick={() => {
            setIsCanvasVisibilitySuppressed((current) => !current);
          }}
          aria-label={getWindowControlQuickInfoText({
            action: isCanvasVisibilitySuppressed ? "show_chats" : "show_canvas",
          })}
          aria-pressed={isCanvasVisibilitySuppressed}
          data-testid="project-chat-canvas-visibility-toggle"
          title={getWindowControlQuickInfoText({
            action: isCanvasVisibilitySuppressed ? "show_chats" : "show_canvas",
          })}
          {...getWindowControlQuickInfoHandlers({
            action: isCanvasVisibilitySuppressed ? "show_chats" : "show_canvas",
          })}
        >
          {isCanvasVisibilitySuppressed ? (
            <BiShow size={18} />
          ) : (
            <BiHide size={18} />
          )}
        </button>
      ) : null}
    </>
  );
}
