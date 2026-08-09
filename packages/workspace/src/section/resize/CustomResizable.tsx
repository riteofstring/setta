import _ from "lodash";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";
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
// pointer events are suppressed or the section is locked. The meta-control and
// attached-terminal handle treatments, aspect-ratio locking, and per-type size modes left with
// their application features. Handle classes are DOM markers for `closest()` hit-testing; they
// deliberately have no CSS rules.
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
  children,
}: CustomResizableProps) {
  const { minHeight, maxHeight, minWidth, maxWidth } = useSectionMinMaxDims(sectionId);
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

  function onResizeStart() {
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
    const nextSize = getAutoClampSize({ size, minHeight, minWidth });
    if (!nextSize) {
      return;
    }
    if (!canEditLayout || positionAndSizeLocked) {
      return;
    }
    persistSectionSizeChange(sectionId, nextSize);
    // `size` is selected with deep equality, so its identity only changes with its contents.
  }, [minHeight, minWidth, sectionId, size, canEditLayout, positionAndSizeLocked]);

  const heightResizable = minHeight !== maxHeight;
  const enable = getResizableEnable({
    disablePointerEvents,
    positionAndSizeLocked,
    heightResizable,
  });
  const surfaceClassName = getSectionSurfaceClassName({
    bgColor,
    hasSectionStyleTheme,
    positionAndSizeLocked,
    shouldDisablePointerEvents: disablePointerEvents,
  });

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
      handleWrapperClass={DEFAULT_HANDLE_WRAPPER_CLASS_NAME}
      enable={enable}
      className={surfaceClassName}
      handleStyles={DEFAULT_HANDLE_STYLES}
      handleClasses={DEFAULT_HANDLE_CLASSES}
      grid={snapToGrid ? snapGrid : undefined}
    >
      {children}
    </ResizableWithScale>
  );
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
  disablePointerEvents,
  positionAndSizeLocked,
  heightResizable,
}: {
  disablePointerEvents: boolean;
  positionAndSizeLocked: boolean;
  heightResizable: boolean;
}) {
  if (disablePointerEvents || positionAndSizeLocked) {
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
