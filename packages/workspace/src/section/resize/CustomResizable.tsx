import _ from "lodash";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useCanvasGestures } from "../../canvas/gestureState";
import { useWorkspaceOptions } from "../../canvas/options";
import { useShouldDisablePointerEvents } from "../../canvas/useShouldDisablePointerEvents";
import { useWorkspaceCapabilities } from "../../document/capabilities";
import { getSectionOrThrow } from "../../document/documentSelectors";
import { useWorkspaceDocument } from "../../document/stores";
import type { SectionSize } from "../../document/types";
import {
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "../../interaction";
import { getSectionSurfaceClassName } from "../sectionChrome";
import {
  getResizeStartAutoSizeUpdate,
  isHeightResizeDirection,
  persistSectionSizeChange,
  type ResizeHandleDirection,
} from "../sectionSizes";
import {
  clampChangedSize,
  getAutoClampSize,
  getChangedSize,
  getResizeHandleClickState,
  isResizeDoubleClick,
  shouldEmitResizeEndEvent,
} from "./resizableUtils";
import { ResizableWithScale } from "./ResizableWithScale";
import { setSectionResizeEvent } from "./resizeEvents";
import { useSectionMinMaxDims } from "./sizingPolicy";

// The reference's `CustomResizable`, trimmed to the slice-reachable resize treatment: only
// bottom, right, and bottom-right handles; the reference's default hit geometry (10px edges with
// -8px offsets, 20x20 corner from re-resizable's defaults); handles disabled entirely while
// pointer events are suppressed, layout editing is unavailable, or the section is locked. The
// meta-control milestone restores its enlarged invisible hit strips, restrained blue hover/active
// paint, and the auto-only height policy used by Slider, Dropdown, and Password. Attached-terminal
// treatment and aspect-ratio locking stay with their features. Handle marker classes preserve
// direction hit-testing without changing paint.
const HANDLE_BASE_CLASS_NAME = `${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_PAN_CLASS_NAME}`;
const DEFAULT_HANDLE_CLASSES = {
  right: `${HANDLE_BASE_CLASS_NAME} section-resize-handle section-resize-handle-right`,
  bottom: `${HANDLE_BASE_CLASS_NAME} section-resize-handle section-resize-handle-bottom`,
  bottomRight: `${HANDLE_BASE_CLASS_NAME} section-resize-handle section-resize-handle-bottom-right`,
};
const DEFAULT_HANDLE_STYLES = {
  right: { right: "-8px" },
  bottom: { bottom: "-8px" },
};
const DEFAULT_HANDLE_WRAPPER_CLASS_NAME =
  "absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full nodrag [&>div]:z-20";
const META_CONTROL_HANDLE_STYLES = {
  right: { right: "-8px", width: 16, top: 0, bottom: 0, height: "100%" },
  bottom: {
    bottom: "-8px",
    height: 16,
    left: 0,
    right: 0,
    width: "100%",
  },
  bottomRight: { right: "-8px", bottom: "-8px", width: 16, height: 16 },
};
const META_CONTROL_HANDLE_BASE_CLASS_NAME =
  "relative flex items-center justify-center opacity-0 transition-opacity hover:opacity-100 after:absolute after:rounded after:bg-transparent hover:after:bg-blue-500/80 dark:hover:after:bg-blue-400/80";
const ACTIVE_META_CONTROL_HANDLE_CLASS_NAME =
  "opacity-100 after:bg-blue-500/80 dark:after:bg-blue-400/80";
const META_CONTROL_HANDLE_CURSOR_CLASSES = {
  right: "cursor-col-resize after:inset-y-1 after:left-1/2 after:w-[3px] after:-translate-x-1/2",
  bottom: "cursor-row-resize after:inset-x-1 after:top-1/2 after:h-[3px] after:-translate-y-1/2",
  bottomRight: "cursor-nwse-resize after:inset-1",
};
const RESIZE_HANDLE_CLASS_NAMES = [
  ["section-resize-handle-bottom-right", "bottomRight"],
  ["section-resize-handle-bottom", "bottom"],
  ["section-resize-handle-right", "right"],
] as const satisfies ReadonlyArray<readonly [string, ResizeHandleDirection]>;

type CustomResizableProps = {
  sectionId: string;
  bgColor: string;
  positionAndSizeLocked: boolean;
  hasSectionStyleTheme: boolean;
  isMetaControl?: boolean;
  children: ReactNode;
};

type ResizeCallbackRef = {
  offsetHeight: number;
  offsetWidth: number;
  style: { width: string; height: string };
  getBoundingClientRect?: () => DOMRect;
};

export function CustomResizable({
  sectionId,
  bgColor,
  positionAndSizeLocked,
  hasSectionStyleTheme,
  isMetaControl = false,
  children,
}: CustomResizableProps) {
  const { minHeight, maxHeight, minWidth, maxWidth, heightSizeMode } =
    useSectionMinMaxDims(sectionId);
  const size = useWorkspaceDocument((x) => getSectionOrThrow(x, sectionId).size, _.isEqual);
  const canEditLayout = useWorkspaceCapabilities((x) => x.canEditLayout);
  const disablePointerEvents = useShouldDisablePointerEvents();
  const snapGrid = useWorkspaceOptions((x) => x.snapGrid);
  const snapToGrid = useWorkspaceOptions((x) => x.snapToGrid);

  const resizeStartedRef = useRef(false);
  const autoSizePromotedRef = useRef(false);
  const resizeAttemptedRef = useRef(false);
  const resizeClickRef = useRef<{
    lastTimestampMs: number | null;
    lastDirection: ResizeHandleDirection | null;
  }>({ lastTimestampMs: null, lastDirection: null });
  const doubleClickPendingRef = useRef(false);
  const [activeResizeHandle, setActiveResizeHandle] = useState<string | null>(null);

  function maybePromoteAutoSize(direction: ResizeHandleDirection, ref: ResizeCallbackRef) {
    if (autoSizePromotedRef.current || !canEditLayout || positionAndSizeLocked) {
      return;
    }
    const nextSize = getResizeStartAutoSizeUpdate({
      size,
      direction,
      rect: { width: ref.offsetWidth, height: ref.offsetHeight },
    });
    if (nextSize) {
      autoSizePromotedRef.current = true;
      persistSectionSizeChange(sectionId, nextSize);
    }
  }

  function startResizeEvent(direction: ResizeHandleDirection) {
    if (isHeightResizeDirection(direction) && !resizeStartedRef.current) {
      resizeStartedRef.current = true;
      setSectionResizeEvent(sectionId, "start");
    }
  }

  function onResizeStart(_event?: unknown, direction?: string) {
    setActiveResizeHandle(direction ?? null);
    resizeStartedRef.current = false;
    autoSizePromotedRef.current = false;
    resizeAttemptedRef.current = false;
    useCanvasGestures.setState({ mouseDownDraggingSection: true });
  }

  function onResize(_event: unknown, direction: ResizeHandleDirection, ref: ResizeCallbackRef) {
    resizeAttemptedRef.current = true;
    doubleClickPendingRef.current = false;
    maybePromoteAutoSize(direction, ref);
    startResizeEvent(direction);
  }

  function onResizePointerDown(direction: ResizeHandleDirection) {
    const { nextState, isDoubleClick } = getResizeHandleClickState({
      state: resizeClickRef.current,
      direction,
      timestampMs: Date.now(),
    });
    resizeClickRef.current = nextState;
    if (isDoubleClick) {
      doubleClickPendingRef.current = true;
    }
  }

  function finishResizeStop(shouldEmitResizeEnd: boolean) {
    if (shouldEmitResizeEnd) {
      setSectionResizeEvent(sectionId, "end");
    }
    useCanvasGestures.setState({ mouseDownDraggingSection: false });
    resizeStartedRef.current = false;
    autoSizePromotedRef.current = false;
    resizeAttemptedRef.current = false;
    doubleClickPendingRef.current = false;
  }

  function onResizeStop(
    event: { detail?: number },
    direction: ResizeHandleDirection,
    ref: ResizeCallbackRef,
    delta: { width: number; height: number },
  ) {
    setActiveResizeHandle(null);
    const isZeroDelta = delta.width === 0 && delta.height === 0;
    const resizeAttempted = resizeAttemptedRef.current;
    const isDoubleClick = isResizeDoubleClick({
      isPending: doubleClickPendingRef.current,
      eventDetail: event.detail,
      isZeroDelta,
      resizeAttempted,
    });
    const shouldEmitResizeEnd = shouldEmitResizeEndEvent({
      resizeStarted: resizeStartedRef.current,
      resizeAttempted,
      isZeroDelta,
      isDoubleClick,
    });
    if (isZeroDelta && !isDoubleClick && !resizeAttempted) {
      finishResizeStop(shouldEmitResizeEnd);
      return;
    }
    const changedSize = resolveResizeStopSize({
      props: [event, direction, ref, delta],
      ref,
      isDoubleClick,
    });
    const clampedSize = clampChangedSize({ changedSize, minHeight, minWidth });
    persistSectionSizeChange(sectionId, clampedSize);
    finishResizeStop(shouldEmitResizeEnd);
  }

  useEffect(() => {
    if (heightSizeMode === "auto-only" && size.height !== "auto") {
      // This is projected document normalization rather than a user layout edit. Frozen main
      // enforces auto-only sizing even for locked/read-only sections so a control-kind change
      // cannot leave Slider, Dropdown, or Password at an unsupported manual height.
      persistSectionSizeChange(sectionId, { height: "auto" });
      return;
    }
    const nextSize = getAutoClampSize({ size, minHeight, minWidth });
    if (!nextSize) {
      return;
    }
    if (!canEditLayout || positionAndSizeLocked) {
      return;
    }
    persistSectionSizeChange(sectionId, nextSize);
    // `size` is selected with deep equality, so its identity only changes with its contents.
  }, [minHeight, minWidth, sectionId, size, canEditLayout, positionAndSizeLocked, heightSizeMode]);

  const heightResizable = minHeight !== maxHeight && heightSizeMode !== "auto-only";
  const enable = getResizableEnable({
    canEditLayout,
    disablePointerEvents,
    positionAndSizeLocked,
    heightResizable,
  });
  const surfaceClassName = getSectionSurfaceClassName({
    bgColor,
    hasSectionStyleTheme,
    positionAndSizeLocked,
    shouldDisablePointerEvents: disablePointerEvents,
    frameClassName: isMetaControl
      ? "before:!border-transparent dark:before:!border-transparent group-hover/card-section:before:!border-setta-400/60 dark:group-hover/card-section:before:!border-setta-700/60"
      : undefined,
    layoutClassName: isMetaControl ? "grid-cols-1 grid-rows-1" : undefined,
    metaHoverZIndexClassName: isMetaControl ? "group-hover/card-section:z-[170]" : undefined,
  });
  const handleConfig = getResizableHandleConfig({ isMetaControl, activeResizeHandle });

  function handleResizeMouseDownCapture(event: MouseEvent<HTMLDivElement>) {
    const direction = getResizeHandleDirection(event.target);
    if (!direction) {
      return;
    }
    onResizePointerDown(direction);
  }

  return (
    <ResizableWithScale
      id={`${sectionId}-CustomResizable`} // IMPORTANT, used for section-scoped DOM lookups
      as="section"
      size={size}
      minHeight={minHeight}
      maxHeight={maxHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      onResizeStart={onResizeStart}
      onResize={onResize}
      onResizeStop={onResizeStop}
      onMouseDownCapture={handleResizeMouseDownCapture}
      handleWrapperClass={handleConfig.handleWrapperClassName}
      enable={enable}
      className={surfaceClassName}
      handleStyles={handleConfig.handleStyles}
      handleClasses={handleConfig.handleClasses}
      grid={snapToGrid ? snapGrid : undefined}
    >
      {children}
    </ResizableWithScale>
  );
}

function getMetaControlHandleClass(
  direction: keyof typeof META_CONTROL_HANDLE_CURSOR_CLASSES,
  activeResizeHandle: string | null,
) {
  const directionMarker = direction === "bottomRight" ? "bottom-right" : direction;
  return [
    HANDLE_BASE_CLASS_NAME,
    "section-resize-handle",
    `section-resize-handle-${directionMarker}`,
    META_CONTROL_HANDLE_BASE_CLASS_NAME,
    activeResizeHandle === direction ? ACTIVE_META_CONTROL_HANDLE_CLASS_NAME : "",
    META_CONTROL_HANDLE_CURSOR_CLASSES[direction],
  ]
    .filter(Boolean)
    .join(" ");
}

function getResizableHandleConfig({
  isMetaControl,
  activeResizeHandle,
}: {
  isMetaControl: boolean;
  activeResizeHandle: string | null;
}) {
  if (isMetaControl) {
    return {
      handleStyles: META_CONTROL_HANDLE_STYLES,
      handleClasses: {
        right: getMetaControlHandleClass("right", activeResizeHandle),
        bottom: getMetaControlHandleClass("bottom", activeResizeHandle),
        bottomRight: getMetaControlHandleClass("bottomRight", activeResizeHandle),
      },
      handleWrapperClassName: DEFAULT_HANDLE_WRAPPER_CLASS_NAME,
    };
  }
  return {
    handleStyles: DEFAULT_HANDLE_STYLES,
    handleClasses: DEFAULT_HANDLE_CLASSES,
    handleWrapperClassName: DEFAULT_HANDLE_WRAPPER_CLASS_NAME,
  };
}

function resolveResizeStopSize({
  props,
  ref,
  isDoubleClick,
}: {
  props: Parameters<typeof getChangedSize>[0]["props"];
  ref: ResizeCallbackRef;
  isDoubleClick: boolean;
}): Partial<SectionSize> {
  const changedSize = getChangedSize({ props, isDoubleClickOverride: isDoubleClick });
  if (isDoubleClick || typeof ref.getBoundingClientRect !== "function") {
    return changedSize;
  }
  if (shouldReplaceMeasuredSize(changedSize.height)) {
    changedSize.height = Math.round(ref.offsetHeight);
  }
  if (shouldReplaceMeasuredSize(changedSize.width)) {
    changedSize.width = Math.round(ref.offsetWidth);
  }
  return changedSize;
}

function shouldReplaceMeasuredSize(size: Partial<SectionSize>[keyof SectionSize]) {
  return size === "auto" || (typeof size === "number" && Number.isNaN(size));
}

function getResizableEnable({
  canEditLayout,
  disablePointerEvents,
  positionAndSizeLocked,
  heightResizable,
}: {
  canEditLayout: boolean;
  disablePointerEvents: boolean;
  positionAndSizeLocked: boolean;
  heightResizable: boolean;
}) {
  if (!canEditLayout || disablePointerEvents || positionAndSizeLocked) {
    return false;
  }
  return {
    top: false,
    left: false,
    bottom: heightResizable,
    right: true,
    topRight: false,
    bottomRight: heightResizable,
    topLeft: false,
    bottomLeft: false,
  };
}

function getResizeHandleDirection(target: EventTarget | null): ResizeHandleDirection | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const handleElement = target.closest(".section-resize-handle");
  if (!handleElement) {
    return null;
  }
  for (const [className, direction] of RESIZE_HANDLE_CLASS_NAMES) {
    if (handleElement.classList.contains(className)) {
      return direction;
    }
  }
  return null;
}
