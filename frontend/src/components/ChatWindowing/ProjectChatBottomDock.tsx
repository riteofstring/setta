import { UnifiedChatSurface } from "components/ChatWindowing/UnifiedChatSurface";
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
import {
  MdAdd,
  MdChevronLeft,
  MdChevronRight,
  MdCropSquare,
  MdFlipToFront,
  MdMinimize,
  MdOpenInNew,
  MdVerticalAlignBottom,
} from "react-icons/md";
import { RiChat3Line } from "react-icons/ri";
import {
  closeProjectChatWindow,
  createProjectChatWindowInstance,
  focusProjectChatWindow,
  maximizeProjectChatWindow,
  reopenProjectChatWindow,
  setProjectChatWindowBounds,
  setProjectChatWindowDockFractions,
  setProjectChatWindowPlacement,
  unmaximizeProjectChatWindow,
} from "state/actions/projectChatWindowing";
import {
  NULL_PROJECT_CONFIG_ID,
  useProjectState,
  useSettings,
  useShareSession,
} from "state/definitions";
import { useHasViewModeTabs } from "state/hooks/viewModes";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ChatWindowBounds,
} from "utils/generatedTypes";
import { isMacOs } from "utils/utils";

type ResolvedWindowPill = {
  instanceId: string;
  title: string;
  isClosed: boolean;
  isMinimized: boolean;
  placement: (typeof ChatWindowPlacementEnum)[keyof typeof ChatWindowPlacementEnum];
  zIndex: number;
  bounds: ChatWindowBounds;
  dockWidthFraction: number | null;
  dockPreferredWidthPx: number | null;
};

type PillDisplayMode = "full" | "compact" | "cycle";

type WindowResizeDirection =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

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
  lastBounds: ChatWindowBounds;
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

type FloatingSnapPreset =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right";

type ActiveFloatingSnapPreview = {
  instanceId: string;
  preset: FloatingSnapPreset;
  bounds: ChatWindowBounds;
};

const DOCK_BAR_HEIGHT_PX = 40;
const DOCK_BAR_FLOAT_BOTTOM_OFFSET_PX = 0;
const VIEW_MODE_TABS_HEIGHT_PX = 36;
const SIDE_RAIL_WIDTH_PX = 40;
const FALLBACK_WORKSPACE_TOP_INSET_PX = 40;
const DOCK_SURFACE_MAX_WIDTH_PX = 1160;
const DOCK_SURFACE_MIN_WIDTH_PX = 420;
const DOCK_SURFACE_HORIZONTAL_MARGIN_PX = 20;
const DOCK_WINDOW_DEFAULT_WIDTH_PX = 460;
const DOCK_WINDOW_DEFAULT_HEIGHT_PX = 520;
const DOCK_WINDOW_GAP_PX = 12;
const DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX = 4;
const MIN_DOCK_CHAT_WIDTH_PX = 280;
const MIN_DOCK_CHAT_HEIGHT_PX = 220;
const DOCK_TAB_OVERLAY_BOTTOM_INSET_PX = 6;
const COMPACT_PILL_WIDTH_PX = 28;
const CYCLE_CONTROL_BUTTON_WIDTH_PX = 24;
const PILL_GAP_PX = 4;
const FLOATING_WINDOW_MIN_WIDTH_PX = 380;
const FLOATING_WINDOW_MIN_HEIGHT_PX = 240;
const FLOATING_WINDOW_TITLE_BAR_HEIGHT_PX = 32;
const FLOATING_WINDOW_MIN_VISIBLE_WIDTH_PX = 120;
const FLOATING_SNAP_EDGE_THRESHOLD_PX = 84;

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
    direction: "left",
    className: "left-0 top-2 bottom-2 w-2",
    cursorClassName: "cursor-ew-resize",
    indicatorClassName:
      "h-10 w-[2px] rounded-full bg-setta-300 transition-colors group-hover/resize:bg-blue-500 dark:bg-setta-600 dark:group-hover/resize:bg-blue-400",
  },
  {
    direction: "right",
    className: "right-0 top-2 bottom-2 w-2",
    cursorClassName: "cursor-ew-resize",
    indicatorClassName:
      "h-10 w-[2px] rounded-full bg-setta-300 transition-colors group-hover/resize:bg-blue-500 dark:bg-setta-600 dark:group-hover/resize:bg-blue-400",
  },
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
    direction: "left",
    className: "left-0 top-3 bottom-3 w-2",
    cursorClassName: "cursor-ew-resize",
  },
  {
    direction: "right",
    className: "right-0 top-3 bottom-3 w-2",
    cursorClassName: "cursor-ew-resize",
  },
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

function buildWindowTitle(
  instanceId: string,
  sectionIdOrNull: string | null,
  sectionNamesById: Record<string, string>,
): string {
  if (sectionIdOrNull) {
    const sectionName = sectionNamesById[sectionIdOrNull];
    if (typeof sectionName === "string" && sectionName.trim().length > 0) {
      return sectionName;
    }
  }
  const suffix = instanceId.split("-").pop() ?? "";
  if (/^\d+$/.test(suffix)) {
    return `Chat Window ${suffix}`;
  }
  return instanceId.replaceAll("-", " ");
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

type FloatingWindowBoundaryInsets = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function resolveFloatingWindowBoundaryInsets(
  floatingBottomInsetPx: number,
  workspaceTopInsetPx: number,
): FloatingWindowBoundaryInsets {
  return {
    left: SIDE_RAIL_WIDTH_PX,
    right: SIDE_RAIL_WIDTH_PX,
    top: workspaceTopInsetPx,
    bottom: floatingBottomInsetPx,
  };
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

function buildFloatingSnapBounds(
  preset: FloatingSnapPreset,
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
    minYBoundary + 1,
    viewportHeightPx - Math.max(0, insets.bottom),
  );
  const availableWidthPx = maxXBoundary - minXBoundary;
  const availableHeightPx = maxYBoundary - minYBoundary;
  const halfWidth = availableWidthPx / 2;
  const halfHeight = availableHeightPx / 2;

  if (preset === "left") {
    return {
      x: minXBoundary,
      y: minYBoundary,
      width: halfWidth,
      height: availableHeightPx,
    };
  }
  if (preset === "right") {
    return {
      x: minXBoundary + halfWidth,
      y: minYBoundary,
      width: halfWidth,
      height: availableHeightPx,
    };
  }
  if (preset === "top") {
    return {
      x: minXBoundary,
      y: minYBoundary,
      width: availableWidthPx,
      height: halfHeight,
    };
  }
  if (preset === "bottom") {
    return {
      x: minXBoundary,
      y: minYBoundary + halfHeight,
      width: availableWidthPx,
      height: halfHeight,
    };
  }
  if (preset === "top_left") {
    return {
      x: minXBoundary,
      y: minYBoundary,
      width: halfWidth,
      height: halfHeight,
    };
  }
  if (preset === "top_right") {
    return {
      x: minXBoundary + halfWidth,
      y: minYBoundary,
      width: halfWidth,
      height: halfHeight,
    };
  }
  if (preset === "bottom_left") {
    return {
      x: minXBoundary,
      y: minYBoundary + halfHeight,
      width: halfWidth,
      height: halfHeight,
    };
  }
  return {
    x: minXBoundary + halfWidth,
    y: minYBoundary + halfHeight,
    width: halfWidth,
    height: halfHeight,
  };
}

function buildPillBaseClass(isActive: boolean): string {
  if (isActive) {
    return "border-setta-400 bg-white text-setta-900 dark:border-setta-500 dark:bg-setta-900 dark:text-setta-100";
  }
  return "border-setta-300 bg-setta-100 text-setta-700 hover:bg-setta-200 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-300 dark:hover:bg-setta-850";
}

const SECTION_STYLE_CONTROL_BUTTON_CLASS =
  "inline-flex h-5 w-5 items-center justify-center rounded-full text-setta-500 transition-colors hover:bg-setta-100 hover:text-setta-700 dark:text-setta-300 dark:hover:bg-setta-800 dark:hover:text-setta-100";

export function ProjectChatBottomDock() {
  const hasViewModeTabs = useHasViewModeTabs();
  const { isDeploymentMode, allowLLM } = useShareSession((state) => ({
    isDeploymentMode: state.isDeploymentMode,
    allowLLM: state.sharePolicy?.allowLLM ?? false,
  }));
  const showChatWindowing = !isDeploymentMode || allowLLM;
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
  const { projectConfigId, order, instancesById, sectionNamesById } =
    useProjectState(
      (state) => ({
        projectConfigId: state.projectConfig.id,
        order: state.projectChatWindowing.order,
        instancesById: state.projectChatWindowing.instancesById,
        sectionNamesById: Object.fromEntries(
          Object.entries(state.sections).map(([sectionId, section]) => [
            sectionId,
            section.name,
          ]),
        ),
      }),
      _.isEqual,
    );
  const [pillDisplayMode, setPillDisplayMode] =
    useState<PillDisplayMode>("full");
  const [pillCycleStartIndex, setPillCycleStartIndex] = useState(0);
  const [pillViewportWidthPx, setPillViewportWidthPx] = useState(0);
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
  const pillViewportRef = useRef<HTMLDivElement | null>(null);
  const fullMeasureRowRef = useRef<HTMLDivElement | null>(null);
  const compactMeasureRowRef = useRef<HTMLDivElement | null>(null);
  const activeSingleDockResizeRef = useRef<ActiveSingleDockResize | null>(null);
  const activeFloatingDragRef = useRef<ActiveFloatingDrag | null>(null);
  const activeFloatingResizeRef = useRef<ActiveFloatingResize | null>(null);
  const activeFloatingSnapPreviewRef = useRef<ActiveFloatingSnapPreview | null>(
    null,
  );

  useEffect(() => {
    if (!showChatWindowing) {
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
    createProjectChatWindowInstance({
      placement: ChatWindowPlacementEnum.bottom_docked,
    });
  }, [autoCreateInitialChat, order.length, projectConfigId, showChatWindowing]);

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
    const handleViewportResize = () => {
      setViewportHeightPx(window.innerHeight);
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
    handleViewportResize();
    const rafRequestId = window.requestAnimationFrame(handleViewportResize);
    const delayedRefreshTimer = window.setTimeout(handleViewportResize, 180);
    window.addEventListener("resize", handleViewportResize);
    return () => {
      window.cancelAnimationFrame(rafRequestId);
      window.clearTimeout(delayedRefreshTimer);
      window.removeEventListener("resize", handleViewportResize);
    };
  }, []);

  const orderedPills = useMemo<ResolvedWindowPill[]>(() => {
    const output: ResolvedWindowPill[] = [];
    const seen = new Set<string>();
    for (const instanceId of order) {
      if (seen.has(instanceId)) {
        continue;
      }
      seen.add(instanceId);
      const instance = instancesById[instanceId];
      if (!instance) {
        continue;
      }
      output.push({
        instanceId,
        title: buildWindowTitle(
          instanceId,
          instance.sectionIdOrNull,
          sectionNamesById,
        ),
        isClosed: instance.isClosed,
        isMinimized: instance.isMinimized,
        placement: instance.placement,
        zIndex: instance.zIndex,
        bounds: instance.bounds,
        dockWidthFraction: instance.dockMetrics.widthFraction,
        dockPreferredWidthPx: instance.dockMetrics.preferredWidthPx,
      });
    }
    for (const [instanceId, instance] of Object.entries(instancesById)) {
      if (seen.has(instanceId)) {
        continue;
      }
      output.push({
        instanceId,
        title: buildWindowTitle(
          instanceId,
          instance.sectionIdOrNull,
          sectionNamesById,
        ),
        isClosed: instance.isClosed,
        isMinimized: instance.isMinimized,
        placement: instance.placement,
        zIndex: instance.zIndex,
        bounds: instance.bounds,
        dockWidthFraction: instance.dockMetrics.widthFraction,
        dockPreferredWidthPx: instance.dockMetrics.preferredWidthPx,
      });
    }
    return output;
  }, [instancesById, order, sectionNamesById]);

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
  const hiddenDockedPills = useMemo(
    () =>
      orderedPills.filter(
        (pill) =>
          pill.placement === ChatWindowPlacementEnum.bottom_docked &&
          (pill.isClosed || pill.isMinimized),
      ),
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

  const dockBottomOffsetPx = hasViewModeTabs ? VIEW_MODE_TABS_HEIGHT_PX : 0;
  const floatingBottomInsetPx = dockBottomOffsetPx;
  const dockAvailableHeightPx = useMemo(() => {
    const fallbackViewportHeight = 900;
    const resolvedViewportHeight =
      viewportHeightPx > 0 ? viewportHeightPx : fallbackViewportHeight;
    return Math.max(
      MIN_DOCK_CHAT_HEIGHT_PX,
      resolvedViewportHeight - workspaceTopInsetPx - dockBottomOffsetPx,
    );
  }, [dockBottomOffsetPx, viewportHeightPx, workspaceTopInsetPx]);

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
        ? dockAvailableHeightPx
        : candidateHeightPx;
      nextHeightsById[pill.instanceId] = clampNumber(
        resolvedHeightPx,
        MIN_DOCK_CHAT_HEIGHT_PX,
        dockAvailableHeightPx,
      );
    }
    return nextHeightsById;
  }, [dockAvailableHeightPx, openDockedPills]);

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
    activeFloatingDragRef.current = null;
    activeFloatingResizeRef.current = null;
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
    openDockedPills.length > 0 && !isCanvasVisibilitySuppressed;
  const dockSurfaceTargetWidthPx = useMemo(() => {
    if (openDockedPills.length === 0) {
      return DOCK_SURFACE_MIN_WIDTH_PX;
    }
    let totalWindowWidthsPx = 0;
    for (const pill of openDockedPills) {
      totalWindowWidthsPx +=
        resolvedDockWindowWidthsById[pill.instanceId] ??
        DOCK_WINDOW_DEFAULT_WIDTH_PX;
    }
    const totalGapWidthPx =
      Math.max(0, openDockedPills.length - 1) * DOCK_WINDOW_GAP_PX;
    const rowPaddingWidthPx = DOCK_WINDOW_ROW_HORIZONTAL_PADDING_PX * 2;
    const targetWidthPx =
      totalWindowWidthsPx + totalGapWidthPx + rowPaddingWidthPx;
    return clampNumber(
      targetWidthPx,
      DOCK_SURFACE_MIN_WIDTH_PX,
      DOCK_SURFACE_MAX_WIDTH_PX,
    );
  }, [openDockedPills, resolvedDockWindowWidthsById]);
  const dockSurfaceTargetHeightPx = useMemo(() => {
    if (openDockedPills.length === 0) {
      return MIN_DOCK_CHAT_HEIGHT_PX;
    }
    let maxHeightPx = MIN_DOCK_CHAT_HEIGHT_PX;
    for (const pill of openDockedPills) {
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
  }, [dockAvailableHeightPx, openDockedPills, resolvedDockWindowHeightsById]);
  const dockSurfaceWidthCss = useMemo(() => {
    const insetPx =
      (SIDE_RAIL_WIDTH_PX + DOCK_SURFACE_HORIZONTAL_MARGIN_PX) * 2;
    return `min(${dockSurfaceTargetWidthPx}px, ${DOCK_SURFACE_MAX_WIDTH_PX}px, calc(100vw - ${insetPx}px))`;
  }, [dockSurfaceTargetWidthPx]);
  const dockSurfaceHeightCss = useMemo(() => {
    const topBottomReservedPx = workspaceTopInsetPx + dockBottomOffsetPx;
    return `min(${dockSurfaceTargetHeightPx}px, calc(100vh - ${topBottomReservedPx}px))`;
  }, [dockBottomOffsetPx, dockSurfaceTargetHeightPx, workspaceTopInsetPx]);
  const showCanvasVisibilityToggle =
    isCanvasVisibilitySuppressed || openMaximizedWindow !== null;

  const handleCreate = useCallback(() => {
    const instanceId = createProjectChatWindowInstance({
      placement: ChatWindowPlacementEnum.bottom_docked,
    });
    focusProjectChatWindow(instanceId);
    setIsCanvasVisibilitySuppressed(false);
  }, []);

  const handleOpenWindow = useCallback(
    (instanceId: string) => {
      const instance = instancesById[instanceId];
      if (!instance) {
        return;
      }
      reopenProjectChatWindow(instanceId);
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [instancesById],
  );

  const handleMinimizeWindow = useCallback((instanceId: string) => {
    closeProjectChatWindow(instanceId);
  }, []);

  const handleFocusWindow = useCallback((instanceId: string) => {
    focusProjectChatWindow(instanceId);
  }, []);

  const handleUndockWindow = useCallback((instanceId: string) => {
    setProjectChatWindowPlacement(instanceId, ChatWindowPlacementEnum.floating);
    focusProjectChatWindow(instanceId);
    setIsCanvasVisibilitySuppressed(false);
  }, []);

  const handleDockWindow = useCallback((instanceId: string) => {
    setProjectChatWindowPlacement(
      instanceId,
      ChatWindowPlacementEnum.bottom_docked,
    );
    focusProjectChatWindow(instanceId);
    setIsCanvasVisibilitySuppressed(false);
  }, []);

  const handleMaximizeWindow = useCallback((instanceId: string) => {
    maximizeProjectChatWindow(instanceId);
    focusProjectChatWindow(instanceId);
    setIsCanvasVisibilitySuppressed(false);
  }, []);

  const handleRestoreWindow = useCallback((instanceId: string) => {
    unmaximizeProjectChatWindow(instanceId);
    focusProjectChatWindow(instanceId);
    setIsCanvasVisibilitySuppressed(false);
  }, []);

  const clampFloatingBoundsForCurrentViewport = useCallback(
    (bounds: ChatWindowBounds): ChatWindowBounds => {
      const viewport = getViewportDimensions();
      if (!viewport) {
        return bounds;
      }
      const insets = resolveFloatingWindowBoundaryInsets(
        floatingBottomInsetPx,
        workspaceTopInsetPx,
      );
      return clampFloatingBoundsToViewport(
        bounds,
        viewport.width,
        viewport.height,
        insets,
      );
    },
    [floatingBottomInsetPx, workspaceTopInsetPx],
  );

  const snapFloatingWindowByPreset = useCallback(
    (preset: "left" | "right" | "top" | "bottom") => {
      if (!activeFloatingWindowId) {
        return;
      }
      const viewport = getViewportDimensions();
      if (!viewport) {
        return;
      }
      const insets = resolveFloatingWindowBoundaryInsets(
        floatingBottomInsetPx,
        workspaceTopInsetPx,
      );
      const nextBounds = clampFloatingBoundsForCurrentViewport(
        buildFloatingSnapBounds(
          preset,
          viewport.width,
          viewport.height,
          insets,
        ),
      );
      setProjectChatWindowBounds(activeFloatingWindowId, nextBounds);
      focusProjectChatWindow(activeFloatingWindowId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [
      activeFloatingWindowId,
      clampFloatingBoundsForCurrentViewport,
      floatingBottomInsetPx,
      workspaceTopInsetPx,
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
        closeProjectChatWindow(activeVisibleWindowId);
        return;
      }

      if (
        activeFloatingWindowId &&
        isShortcutPressed(event, eventCode, parsedSnapLeft, macOs)
      ) {
        event.preventDefault();
        event.stopPropagation();
        snapFloatingWindowByPreset("left");
        return;
      }

      if (
        activeFloatingWindowId &&
        isShortcutPressed(event, eventCode, parsedSnapRight, macOs)
      ) {
        event.preventDefault();
        event.stopPropagation();
        snapFloatingWindowByPreset("right");
        return;
      }

      if (
        activeFloatingWindowId &&
        isShortcutPressed(event, eventCode, parsedSnapTop, macOs)
      ) {
        event.preventDefault();
        event.stopPropagation();
        snapFloatingWindowByPreset("top");
        return;
      }

      if (
        activeFloatingWindowId &&
        isShortcutPressed(event, eventCode, parsedSnapBottom, macOs)
      ) {
        event.preventDefault();
        event.stopPropagation();
        snapFloatingWindowByPreset("bottom");
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [
    activeFloatingWindowId,
    activeVisibleWindowId,
    chatWindowingShortcuts.canvasToggle,
    chatWindowingShortcuts.maximizeFocused,
    chatWindowingShortcuts.minimizeFocused,
    chatWindowingShortcuts.snapBottom,
    chatWindowingShortcuts.snapLeft,
    chatWindowingShortcuts.snapRight,
    chatWindowingShortcuts.snapTop,
    hasOverlayWindows,
    snapFloatingWindowByPreset,
  ]);

  const handleFloatingBoundsPreview = useCallback(
    (instanceId: string, bounds: ChatWindowBounds) => {
      setFloatingPreviewBoundsById((current) => {
        const existing = current[instanceId];
        if (
          existing &&
          existing.x === bounds.x &&
          existing.y === bounds.y &&
          existing.width === bounds.width &&
          existing.height === bounds.height
        ) {
          return current;
        }
        return {
          ...current,
          [instanceId]: bounds,
        };
      });
    },
    [],
  );

  const clearFloatingBoundsPreview = useCallback((instanceId: string) => {
    setFloatingPreviewBoundsById((current) => {
      if (!current[instanceId]) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, []);

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
      if (activeFloatingDragRef.current || activeFloatingResizeRef.current) {
        return;
      }
      const viewport = getViewportDimensions();
      if (!viewport) {
        return;
      }
      const insets = resolveFloatingWindowBoundaryInsets(
        floatingBottomInsetPx,
        workspaceTopInsetPx,
      );

      for (const pill of openFloatingPills) {
        const clampedBounds = clampFloatingBoundsToViewport(
          pill.bounds,
          viewport.width,
          viewport.height,
          insets,
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
  }, [floatingBottomInsetPx, openFloatingPills, workspaceTopInsetPx]);

  const handleFloatingDragPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>, pill: ResolvedWindowPill) => {
      if (event.button !== 0) {
        return;
      }
      const previewBounds = floatingPreviewBoundsById[pill.instanceId];
      const startBounds = clampFloatingBoundsForCurrentViewport(
        previewBounds ?? pill.bounds,
      );
      const clonedBounds = { ...startBounds };
      activeFloatingDragRef.current = {
        pointerId: event.pointerId,
        instanceId: pill.instanceId,
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

  const handleFloatingDragPointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      const activeDrag = activeFloatingDragRef.current;
      if (!activeDrag || activeDrag.pointerId !== event.pointerId) {
        return;
      }
      const deltaX = event.clientX - activeDrag.startX;
      const deltaY = event.clientY - activeDrag.startY;
      const nextBounds = clampFloatingBoundsForCurrentViewport({
        ...activeDrag.startBounds,
        x: activeDrag.startBounds.x + deltaX,
        y: activeDrag.startBounds.y + deltaY,
      });
      const viewport = getViewportDimensions();
      if (viewport) {
        const insets = resolveFloatingWindowBoundaryInsets(
          floatingBottomInsetPx,
          workspaceTopInsetPx,
        );
        const snapPreset = resolveFloatingSnapPresetFromPointer(
          event.clientX,
          event.clientY,
          viewport.width,
          viewport.height,
          insets,
        );
        if (snapPreset) {
          updateActiveFloatingSnapPreview({
            instanceId: activeDrag.instanceId,
            preset: snapPreset,
            bounds: buildFloatingSnapBounds(
              snapPreset,
              viewport.width,
              viewport.height,
              insets,
            ),
          });
        } else {
          updateActiveFloatingSnapPreview(null);
        }
      } else {
        updateActiveFloatingSnapPreview(null);
      }
      activeDrag.lastBounds = nextBounds;
      handleFloatingBoundsPreview(activeDrag.instanceId, nextBounds);
    },
    [
      clampFloatingBoundsForCurrentViewport,
      floatingBottomInsetPx,
      handleFloatingBoundsPreview,
      workspaceTopInsetPx,
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
    let nextMode: PillDisplayMode = "full";
    if (fullWidthPx > availableWidthPx + 1) {
      nextMode = compactWidthPx > availableWidthPx + 1 ? "cycle" : "compact";
    }
    if (nextMode !== pillDisplayMode) {
      setPillDisplayMode(nextMode);
    }
  }, [hiddenDockedPills, pillDisplayMode, pillViewportWidthPx]);

  const cycleVisibleCount = useMemo(() => {
    if (hiddenDockedPills.length === 0) {
      return 0;
    }
    if (pillDisplayMode !== "cycle") {
      return hiddenDockedPills.length;
    }
    if (pillViewportWidthPx <= 0) {
      return 1;
    }
    const availablePillsWidthPx = Math.max(
      0,
      pillViewportWidthPx - CYCLE_CONTROL_BUTTON_WIDTH_PX * 2 - PILL_GAP_PX * 2,
    );
    const compactSlotWidthPx = COMPACT_PILL_WIDTH_PX + PILL_GAP_PX;
    const nextVisibleCount = Math.floor(
      (availablePillsWidthPx + PILL_GAP_PX) / compactSlotWidthPx,
    );
    return clampNumber(nextVisibleCount, 1, hiddenDockedPills.length);
  }, [hiddenDockedPills.length, pillDisplayMode, pillViewportWidthPx]);

  useEffect(() => {
    const maxStartIndex = Math.max(
      0,
      hiddenDockedPills.length - cycleVisibleCount,
    );
    setPillCycleStartIndex((current) => clampNumber(current, 0, maxStartIndex));
  }, [cycleVisibleCount, hiddenDockedPills.length]);

  const visiblePills = useMemo(() => {
    if (pillDisplayMode !== "cycle") {
      return hiddenDockedPills;
    }
    return hiddenDockedPills.slice(
      pillCycleStartIndex,
      pillCycleStartIndex + cycleVisibleCount,
    );
  }, [
    cycleVisibleCount,
    hiddenDockedPills,
    pillCycleStartIndex,
    pillDisplayMode,
  ]);

  const maxCycleStartIndex = Math.max(
    0,
    hiddenDockedPills.length - cycleVisibleCount,
  );
  const canCycleBackward =
    pillDisplayMode === "cycle" && pillCycleStartIndex > 0;
  const canCycleForward =
    pillDisplayMode === "cycle" && pillCycleStartIndex < maxCycleStartIndex;
  const useCompactPills = pillDisplayMode !== "full";

  if (!showChatWindowing) {
    return null;
  }

  return (
    <>
      {showDockedChatSurface ? (
        <section
          className="pointer-events-none fixed z-[8]"
          style={{
            left: "50%",
            width: dockSurfaceWidthCss,
            transform: "translateX(-50%)",
            bottom: dockBottomOffsetPx,
            height: dockSurfaceHeightCss,
          }}
          data-testid="project-chat-bottom-dock-window"
        >
          <div
            className="flex h-full min-h-0 items-end justify-center gap-3 overflow-x-auto overflow-y-hidden px-1"
            data-testid="project-chat-bottom-dock-window-grid"
          >
            {openDockedPills.map((pill) => {
              const resolvedWindowWidthPx =
                resolvedDockWindowWidthsById[pill.instanceId] ??
                DOCK_WINDOW_DEFAULT_WIDTH_PX;
              const resolvedWindowHeightPx =
                resolvedDockWindowHeightsById[pill.instanceId] ??
                DOCK_WINDOW_DEFAULT_HEIGHT_PX;
              return (
                <article
                  key={pill.instanceId}
                  className="pointer-events-auto relative flex min-h-0 min-w-[16rem] shrink-0 flex-col overflow-hidden rounded-b-none rounded-t-xl border border-b-0 border-setta-200 bg-setta-50 shadow-[0_-8px_18px_rgba(15,23,42,0.14)] dark:border-setta-800 dark:bg-setta-900 dark:shadow-[0_-10px_20px_rgba(0,0,0,0.35)]"
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
                  onPointerDown={() => {
                    handleFocusWindow(pill.instanceId);
                  }}
                >
                  <header className="section-title mx-2 flex h-8 shrink-0 items-center border-b border-setta-200 dark:border-setta-800">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-[0.72rem] font-bold tracking-tight text-setta-700 hover:text-setta-900 dark:text-setta-200 dark:hover:text-setta-50"
                      onClick={() => {
                        handleFocusWindow(pill.instanceId);
                      }}
                      title={pill.title}
                    >
                      <RiChat3Line size={13} className="shrink-0" />
                      <span className="truncate">{pill.title}</span>
                    </button>
                    <div className="ml-2 flex items-center gap-1">
                      <button
                        type="button"
                        className={SECTION_STYLE_CONTROL_BUTTON_CLASS}
                        onClick={() => {
                          handleUndockWindow(pill.instanceId);
                        }}
                        aria-label={`Undock ${pill.title}`}
                        data-testid="project-chat-window-undock"
                        data-chat-window-instance-id={pill.instanceId}
                      >
                        <MdOpenInNew size={13} />
                      </button>
                      <button
                        type="button"
                        className={SECTION_STYLE_CONTROL_BUTTON_CLASS}
                        onClick={() => {
                          handleMaximizeWindow(pill.instanceId);
                        }}
                        aria-label={`Maximize ${pill.title}`}
                        data-testid="project-chat-window-maximize"
                        data-chat-window-instance-id={pill.instanceId}
                      >
                        <MdCropSquare size={13} />
                      </button>
                      <button
                        type="button"
                        className={SECTION_STYLE_CONTROL_BUTTON_CLASS}
                        onClick={() => {
                          handleMinimizeWindow(pill.instanceId);
                        }}
                        aria-label={`Minimize ${pill.title}`}
                        data-testid="project-chat-window-minimize"
                        data-chat-window-instance-id={pill.instanceId}
                      >
                        <MdMinimize size={13} />
                      </button>
                    </div>
                  </header>
                  <UnifiedChatSurface
                    mode={ChatWindowModeEnum.project_ai_mode}
                    host={ChatWindowPlacementEnum.bottom_docked}
                  />
                  {DOCK_WINDOW_RESIZE_HANDLES.map((handle) => (
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
                      onPointerMove={handleSingleDockResizePointerMove}
                      onPointerUp={handleSingleDockResizePointerUp}
                    >
                      {handle.indicatorClassName ? (
                        <div className={handle.indicatorClassName} />
                      ) : null}
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
      {!isCanvasVisibilitySuppressed && activeFloatingSnapPreview ? (
        <div
          className="pointer-events-none fixed z-[9] rounded-xl border-2 border-setta-400/80 bg-setta-300/20 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)] dark:border-setta-500/90 dark:bg-setta-500/25 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]"
          style={{
            left: activeFloatingSnapPreview.bounds.x,
            top: activeFloatingSnapPreview.bounds.y,
            width: activeFloatingSnapPreview.bounds.width,
            height: activeFloatingSnapPreview.bounds.height,
          }}
          data-testid="project-chat-floating-snap-ghost-zone"
          data-chat-window-snap-preset={activeFloatingSnapPreview.preset}
        />
      ) : null}
      {isCanvasVisibilitySuppressed ? null : (
        <div className="pointer-events-none fixed inset-0 z-[8]">
          {openFloatingPills.map((pill) => {
            const previewBounds = floatingPreviewBoundsById[pill.instanceId];
            const bounds = previewBounds ?? pill.bounds;
            return (
              <article
                key={pill.instanceId}
                className="border-setta-250 pointer-events-auto absolute flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-setta-50 shadow-[0_10px_32px_rgba(0,0,0,0.22)] dark:border-setta-800 dark:bg-setta-900 dark:shadow-[0_12px_38px_rgba(0,0,0,0.5)]"
                style={{
                  left: bounds.x,
                  top: bounds.y,
                  width: bounds.width,
                  height: bounds.height,
                  zIndex: pill.zIndex,
                }}
                data-testid="project-chat-floating-window"
                data-chat-window-instance-id={pill.instanceId}
                onPointerDown={() => {
                  handleFocusWindow(pill.instanceId);
                }}
              >
                <header className="section-title mx-2 flex h-8 shrink-0 items-center border-b border-setta-200 dark:border-setta-800">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 cursor-move items-center gap-1 truncate text-left text-[0.72rem] font-bold tracking-tight text-setta-700 hover:text-setta-900 dark:text-setta-200 dark:hover:text-setta-50"
                    onPointerDown={(event) => {
                      handleFloatingDragPointerDown(event, pill);
                    }}
                    onPointerMove={handleFloatingDragPointerMove}
                    onPointerUp={handleFloatingDragPointerUp}
                    onClick={() => {
                      handleFocusWindow(pill.instanceId);
                    }}
                    title={pill.title}
                    data-testid="project-chat-floating-window-drag-handle"
                    data-chat-window-instance-id={pill.instanceId}
                  >
                    <RiChat3Line size={13} className="shrink-0" />
                    <span className="truncate">{pill.title}</span>
                  </button>
                  <div className="ml-2 flex items-center gap-1">
                    <button
                      type="button"
                      className={SECTION_STYLE_CONTROL_BUTTON_CLASS}
                      onClick={() => {
                        handleDockWindow(pill.instanceId);
                      }}
                      aria-label={`Dock ${pill.title}`}
                      data-testid="project-chat-window-dock"
                      data-chat-window-instance-id={pill.instanceId}
                    >
                      <MdVerticalAlignBottom size={13} />
                    </button>
                    <button
                      type="button"
                      className={SECTION_STYLE_CONTROL_BUTTON_CLASS}
                      onClick={() => {
                        handleMaximizeWindow(pill.instanceId);
                      }}
                      aria-label={`Maximize ${pill.title}`}
                      data-testid="project-chat-window-maximize"
                      data-chat-window-instance-id={pill.instanceId}
                    >
                      <MdCropSquare size={13} />
                    </button>
                    <button
                      type="button"
                      className={SECTION_STYLE_CONTROL_BUTTON_CLASS}
                      onClick={() => {
                        handleMinimizeWindow(pill.instanceId);
                      }}
                      aria-label={`Minimize ${pill.title}`}
                      data-testid="project-chat-window-minimize"
                      data-chat-window-instance-id={pill.instanceId}
                    >
                      <MdMinimize size={13} />
                    </button>
                  </div>
                </header>
                <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                  <UnifiedChatSurface
                    mode={ChatWindowModeEnum.project_ai_mode}
                    host={ChatWindowPlacementEnum.floating}
                  />
                  {FLOATING_WINDOW_RESIZE_HANDLES.map((handle) => (
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
          className="border-setta-250 fixed z-[9] overflow-hidden rounded-none border bg-setta-50 shadow-[0_-8px_26px_rgba(0,0,0,0.22)] dark:border-setta-800 dark:bg-setta-900 dark:shadow-[0_-12px_34px_rgba(0,0,0,0.52)]"
          style={{
            left: SIDE_RAIL_WIDTH_PX,
            right: SIDE_RAIL_WIDTH_PX,
            top: workspaceTopInsetPx,
            bottom: dockBottomOffsetPx,
          }}
          data-testid="project-chat-maximized-window"
          data-chat-window-instance-id={openMaximizedWindow.instanceId}
        >
          <article className="flex h-full min-h-0 flex-col overflow-hidden">
            <header className="section-title mx-2 flex h-8 shrink-0 items-center border-b border-setta-200 dark:border-setta-800">
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-[0.72rem] font-bold tracking-tight text-setta-700 hover:text-setta-900 dark:text-setta-200 dark:hover:text-setta-50"
                onClick={() => {
                  handleFocusWindow(openMaximizedWindow.instanceId);
                }}
                title={openMaximizedWindow.title}
              >
                <RiChat3Line size={13} className="shrink-0" />
                <span className="truncate">{openMaximizedWindow.title}</span>
              </button>
              <div className="ml-2 flex items-center gap-1">
                <button
                  type="button"
                  className={SECTION_STYLE_CONTROL_BUTTON_CLASS}
                  onClick={() => {
                    handleRestoreWindow(openMaximizedWindow.instanceId);
                  }}
                  aria-label={`Restore ${openMaximizedWindow.title}`}
                  data-testid="project-chat-window-restore"
                  data-chat-window-instance-id={openMaximizedWindow.instanceId}
                >
                  <MdFlipToFront size={13} />
                </button>
                <button
                  type="button"
                  className={SECTION_STYLE_CONTROL_BUTTON_CLASS}
                  onClick={() => {
                    handleDockWindow(openMaximizedWindow.instanceId);
                  }}
                  aria-label={`Dock ${openMaximizedWindow.title}`}
                  data-testid="project-chat-window-dock"
                  data-chat-window-instance-id={openMaximizedWindow.instanceId}
                >
                  <MdVerticalAlignBottom size={13} />
                </button>
                <button
                  type="button"
                  className={SECTION_STYLE_CONTROL_BUTTON_CLASS}
                  onClick={() => {
                    handleMinimizeWindow(openMaximizedWindow.instanceId);
                  }}
                  aria-label={`Minimize ${openMaximizedWindow.title}`}
                  data-testid="project-chat-window-minimize"
                  data-chat-window-instance-id={openMaximizedWindow.instanceId}
                >
                  <MdMinimize size={13} />
                </button>
              </div>
            </header>
            <UnifiedChatSurface
              mode={ChatWindowModeEnum.project_ai_mode}
              host={ChatWindowPlacementEnum.maximized}
            />
          </article>
        </section>
      ) : null}
      <div
        className="pointer-events-none fixed z-[9]"
        style={{
          left: "50%",
          width: dockSurfaceWidthCss,
          transform: "translateX(-50%)",
          bottom: dockBottomOffsetPx + DOCK_TAB_OVERLAY_BOTTOM_INSET_PX,
        }}
      >
        <div
          ref={pillViewportRef}
          className="relative mx-auto flex min-w-0 max-w-full items-end justify-center gap-1 px-2"
        >
          <div
            className="pointer-events-none absolute left-0 top-0 h-0 overflow-hidden opacity-0"
            aria-hidden="true"
          >
            <div
              ref={fullMeasureRowRef}
              className="flex w-max items-center gap-1"
            >
              {hiddenDockedPills.map((pill) => (
                <div
                  key={`measure-full-${pill.instanceId}`}
                  className="inline-flex h-7 shrink-0 items-center gap-1 rounded-b-sm rounded-t-md border border-setta-300 border-b-setta-200 bg-setta-100 px-2 text-xs"
                >
                  <span className="max-w-[9.5rem] truncate">{pill.title}</span>
                </div>
              ))}
            </div>
            <div
              ref={compactMeasureRowRef}
              className="mt-1 flex w-max items-center gap-1"
            >
              {hiddenDockedPills.map((pill) => (
                <div
                  key={`measure-compact-${pill.instanceId}`}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-b-sm rounded-t-md border border-setta-300 border-b-setta-200 bg-setta-100"
                >
                  <RiChat3Line size={14} />
                </div>
              ))}
            </div>
          </div>
          {pillDisplayMode === "cycle" ? (
            <button
              type="button"
              className="pointer-events-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-setta-300 bg-setta-50 text-setta-700 shadow-sm transition-colors enabled:hover:bg-setta-100 enabled:hover:text-setta-900 disabled:cursor-not-allowed disabled:opacity-45 dark:border-setta-700 dark:bg-setta-860 dark:text-setta-200 dark:enabled:hover:bg-setta-800 dark:enabled:hover:text-setta-50"
              onClick={() => {
                setPillCycleStartIndex((current) => Math.max(0, current - 1));
              }}
              disabled={!canCycleBackward}
              aria-label="Show previous chat windows"
              data-testid="project-chat-bottom-dock-cycle-left"
            >
              <MdChevronLeft size={14} />
            </button>
          ) : null}
          <div className="flex min-w-0 items-end justify-center gap-1 overflow-hidden">
            {visiblePills.map((pill) => {
              const baseClass = buildPillBaseClass(false);
              if (useCompactPills) {
                return (
                  <button
                    key={pill.instanceId}
                    type="button"
                    className={`pointer-events-auto inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-b-sm rounded-t-md border border-b-setta-200 text-xs shadow-sm transition-colors ${baseClass} ${pill.isClosed ? "opacity-65" : ""}`}
                    onClick={() => {
                      handleOpenWindow(pill.instanceId);
                    }}
                    title={pill.title}
                    aria-label={pill.title}
                    data-testid="project-chat-bottom-dock-pill"
                  >
                    <RiChat3Line size={14} />
                  </button>
                );
              }
              return (
                <button
                  key={pill.instanceId}
                  type="button"
                  className={`pointer-events-auto inline-flex h-7 min-w-0 shrink-0 items-center gap-1 rounded-b-sm rounded-t-md border border-b-setta-200 px-2 text-xs shadow-sm transition-colors ${baseClass} ${pill.isClosed ? "opacity-65" : ""}`}
                  onClick={() => {
                    handleOpenWindow(pill.instanceId);
                  }}
                  title={pill.title}
                  data-testid="project-chat-bottom-dock-pill"
                >
                  <RiChat3Line size={12} className="shrink-0" />
                  <span className="max-w-[9.5rem] truncate">{pill.title}</span>
                </button>
              );
            })}
          </div>
          {pillDisplayMode === "cycle" ? (
            <button
              type="button"
              className="pointer-events-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-setta-300 bg-setta-50 text-setta-700 shadow-sm transition-colors enabled:hover:bg-setta-100 enabled:hover:text-setta-900 disabled:cursor-not-allowed disabled:opacity-45 dark:border-setta-700 dark:bg-setta-860 dark:text-setta-200 dark:enabled:hover:bg-setta-800 dark:enabled:hover:text-setta-50"
              onClick={() => {
                setPillCycleStartIndex((current) =>
                  Math.min(maxCycleStartIndex, current + 1),
                );
              }}
              disabled={!canCycleForward}
              aria-label="Show more chat windows"
              data-testid="project-chat-bottom-dock-cycle-right"
            >
              <MdChevronRight size={14} />
            </button>
          ) : null}
        </div>
      </div>
      <nav
        className="pointer-events-none fixed z-[9]"
        style={{
          left: "50%",
          width: dockSurfaceWidthCss,
          transform: "translateX(-50%)",
          bottom: dockBottomOffsetPx + DOCK_BAR_FLOAT_BOTTOM_OFFSET_PX,
          height: DOCK_BAR_HEIGHT_PX,
        }}
        data-testid="project-chat-bottom-dock-strip"
      />
      <button
        type="button"
        className="fixed z-[20] inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-setta-300 bg-setta-50 text-setta-700 shadow-[0_6px_14px_rgba(0,0,0,0.18)] transition-colors hover:bg-setta-100 hover:text-setta-900 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800 dark:hover:text-setta-50"
        style={{
          right: SIDE_RAIL_WIDTH_PX + 10,
          bottom: dockBottomOffsetPx + 48,
        }}
        onClick={handleCreate}
        aria-label="Create chat window"
        data-testid="project-chat-bottom-dock-create"
      >
        <MdAdd size={16} />
      </button>
      {showCanvasVisibilityToggle ? (
        <button
          type="button"
          className="fixed z-[20] inline-flex h-7 shrink-0 items-center rounded-md border border-setta-300 bg-setta-50 px-2 text-[11px] font-semibold text-setta-700 shadow-sm transition-colors hover:bg-setta-100 hover:text-setta-900 dark:border-setta-700 dark:bg-setta-900 dark:text-setta-200 dark:hover:bg-setta-800 dark:hover:text-setta-50"
          style={{
            left: 6,
            bottom: dockBottomOffsetPx + 136,
          }}
          onClick={() => {
            setIsCanvasVisibilitySuppressed((current) => !current);
          }}
          aria-label={
            isCanvasVisibilitySuppressed ? "Show chats" : "Show canvas"
          }
          data-testid="project-chat-canvas-visibility-toggle"
        >
          {isCanvasVisibilitySuppressed ? "Show chats" : "Show canvas"}
        </button>
      ) : null}
    </>
  );
}
