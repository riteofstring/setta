import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import { useDndMode } from "forks/dnd-kit/dndState";
import {
  gpuFlowViewportStore,
  type GpuFlowViewportStoreApi,
} from "gpuFlow/viewportStore";
import _ from "lodash";
import { setSectionSizes } from "openapi/http";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getAttachedTerminalParentIdForTerminalSection,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import {
  getResizeStartAutoSizeUpdate,
  isHeightResizeDirection,
  setSelfParentSiblingChildrenWidths,
  type ResizeHandleDirection,
} from "state/actions/sections/sectionSizes";
import {
  clampChangedSize,
  getResizableEnable,
  getResizeAxisAvailability,
  resolveResizableGrid,
  shouldEmitResizeEndEvent,
  SIZE_MODE,
} from "state/actions/sections/sectionResizePolicy";
import {
  useLocalStorage,
  useMisc,
  useProjectState,
  useResizeEvent,
  useSettings,
} from "state/definitions";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
import { useSectionMinMaxDims } from "state/hooks/sectionSizes";
import { useShareCapabilities } from "state/hooks/share";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";
import { SectionSize } from "utils/generatedTypes";
import { getSectionSurfaceClassName } from "../../Section/Container/sectionChrome";
import { ResizableWithScale } from "./ResizableWithScale";
import {
  getChangedSize,
  getResizeHandleClickState,
  isResizeDoubleClick,
} from "./utils";
const AUTO_CLAMP_TOLERANCE = 2;
const HANDLE_BASE_CLASS_NAME = `${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;
const DEFAULT_HANDLE_CLASSES = {
  right: `${HANDLE_BASE_CLASS_NAME} section-resize-handle section-resize-handle-right`,
  bottom: `${HANDLE_BASE_CLASS_NAME} section-resize-handle section-resize-handle-bottom`,
  bottomRight: `${HANDLE_BASE_CLASS_NAME} section-resize-handle section-resize-handle-bottom-right`,
};
const DEFAULT_HANDLE_STYLES = {
  right: { right: "-8px" },
  bottom: { bottom: "-8px" },
};
const ATTACHED_TERMINAL_HANDLE_STYLES = {
  right: { right: "-4px", width: 16, top: 0, bottom: 0, height: "100%" },
  bottom: {
    bottom: "-4px",
    height: 16,
    left: 0,
    right: 0,
    width: "100%",
  },
  bottomRight: { right: "-4px", bottom: "-4px", width: 24, height: 24 },
};
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
const DEFAULT_HANDLE_WRAPPER_CLASS_NAME = `absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} [&>div]:z-20`;
const ATTACHED_TERMINAL_HANDLE_WRAPPER_CLASS_NAME = `absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} [&>div]:z-30`;
const META_CONTROL_HANDLE_BASE_CLASS_NAME =
  "relative flex items-center justify-center opacity-0 transition-opacity hover:opacity-100 after:absolute after:rounded after:bg-transparent hover:after:bg-blue-500/80 dark:hover:after:bg-blue-400/80";
const ACTIVE_META_CONTROL_HANDLE_CLASS_NAME =
  "opacity-100 after:bg-blue-500/80 dark:after:bg-blue-400/80";
const META_CONTROL_HANDLE_CURSOR_CLASSES = {
  right:
    "cursor-col-resize after:inset-y-1 after:left-1/2 after:w-[3px] after:-translate-x-1/2",
  bottom:
    "cursor-row-resize after:inset-x-1 after:top-1/2 after:h-[3px] after:-translate-y-1/2",
  bottomRight: "cursor-nwse-resize after:inset-1",
};
const RESIZE_HANDLE_CLASS_NAMES = [
  ["section-resize-handle-bottom-right", "bottomRight"],
  ["section-resize-handle-bottom", "bottom"],
  ["section-resize-handle-right", "right"],
] as const satisfies ReadonlyArray<readonly [string, ResizeHandleDirection]>;

type GpuNodeResizeInteractionRef = {
  current: boolean;
};

export function setGpuNodeResizeInteractionActive(
  active: boolean,
  activeRef?: GpuNodeResizeInteractionRef | undefined,
  options: {
    readonly store?: GpuFlowViewportStoreApi | undefined;
  } = {},
) {
  if (activeRef) {
    if (activeRef.current === active) {
      return;
    }
    activeRef.current = active;
  }
  const store = options.store ?? gpuFlowViewportStore;
  store.getState().setViewportInteractionFlags({ nodeResizing: active });
}

export function CustomResizable({
  sectionId,
  bgColor,
  isYouTube,
  isMetaControl,
  positionAndSizeLocked,
  hasSectionStyleTheme = false,
  allowPointerEventsDuringDnd = false,
  frameClassName = "before:border-white dark:before:border-setta-700",
  layoutClassName,
  children,
  as,
}) {
  const { minHeight, maxHeight, minWidth, maxWidth, sizeMode } =
    useSectionMinMaxDims(sectionId);
  return (
    <CustomResizableCore
      sectionId={sectionId}
      bgColor={bgColor}
      isYouTube={isYouTube}
      isMetaControl={isMetaControl}
      positionAndSizeLocked={positionAndSizeLocked}
      hasSectionStyleTheme={hasSectionStyleTheme}
      allowPointerEventsDuringDnd={allowPointerEventsDuringDnd}
      frameClassName={frameClassName}
      layoutClassName={layoutClassName}
      minHeight={minHeight}
      maxHeight={maxHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      sizeMode={sizeMode}
      as={as}
    >
      {children}
    </CustomResizableCore>
  );
}
function CustomResizableCore({
  sectionId,
  bgColor,
  isYouTube,
  isMetaControl,
  positionAndSizeLocked,
  hasSectionStyleTheme,
  allowPointerEventsDuringDnd,
  frameClassName = "before:border-white dark:before:border-setta-700",
  layoutClassName,
  minHeight,
  maxHeight,
  minWidth,
  maxWidth,
  sizeMode,
  children,
  as,
}) {
  useEffect(() => {
    const changedSize: Partial<SectionSize> = {};
    if (sizeMode.height === SIZE_MODE.auto_only) {
      changedSize.height = "auto";
    }
    if (sizeMode.width === SIZE_MODE.auto_only) {
      changedSize.width = "auto";
    }
    if (_.size(changedSize) > 0) {
      useProjectState.setState((state) => {
        setSelfParentSiblingChildrenWidths(sectionId, changedSize, state);
      });
    }
  }, [sizeMode.height, sizeMode.width]);
  const { size, aspectRatio, aspectRatioExtraHeight, aspectRatioExtraWidth } =
    useAspectRatio(sectionId);
  const { canEditLayout } = useShareCapabilities();
  const resizeStartedRef = useRef(false);
  const autoSizePromotedRef = useRef(false);
  const resizeAttemptedRef = useRef(false);
  const gpuNodeResizeActiveRef = useRef(false);
  const resizeClickRef = useRef<{
    lastTimestampMs: number | null;
    lastDirection: ResizeHandleDirection | null;
  }>({ lastTimestampMs: null, lastDirection: null });
  const doubleClickPendingRef = useRef(false);
  const resizeStateRefs = {
    resizeStartedRef,
    autoSizePromotedRef,
    resizeAttemptedRef,
    doubleClickPendingRef,
  };
  useEffect(() => {
    return () => {
      setGpuNodeResizeInteractionActive(false, gpuNodeResizeActiveRef);
    };
  }, []);
  function setResizeInteractionActive(active: boolean) {
    setGpuNodeResizeInteractionActive(active, gpuNodeResizeActiveRef);
  }
  function maybePromoteAutoSize(direction, ref) {
    if (
      !autoSizePromotedRef.current &&
      canEditLayout &&
      !positionAndSizeLocked
    ) {
      if (ref && typeof ref.getBoundingClientRect === "function") {
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
    }
  }
  function startResizeEvent(direction) {
    if (isHeightResizeDirection(direction) && !resizeStartedRef.current) {
      resizeStartedRef.current = true;
      useResizeEvent.setState((state) => {
        setSectionResizeEvent(sectionId, "start", state);
      });
    }
  }
  function beginResize(direction, ref) {
    maybePromoteAutoSize(direction, ref);
    startResizeEvent(direction);
  }
  function onResizeStart() {
    setResizeInteractionActive(true);
    resizeStartedRef.current = false;
    autoSizePromotedRef.current = false;
    resizeAttemptedRef.current = false;
    useMisc.setState({ mouseDownDraggingSection: true });
  }
  function onResize(...props) {
    const [, direction, ref] = props;
    resizeAttemptedRef.current = true;
    doubleClickPendingRef.current = false;
    beginResize(direction, ref);
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
  function onResizeStop(...props) {
    const [event, , ref, delta] = props;
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
    if (
      shouldSkipResizeStopUpdate({
        isZeroDelta,
        isDoubleClick,
        resizeAttempted,
      })
    ) {
      finishResizeStopForSection({ shouldEmitResizeEnd });
      return;
    }
    const changedSize = resolveResizeStopSize({
      props,
      ref,
      sizeMode,
      aspectRatio,
      isDoubleClick,
    });
    const clampedSize = clampChangedSize({
      changedSize,
      minHeight,
      minWidth,
      aspectRatio,
    });
    persistSectionSizeChange(sectionId, clampedSize);
    finishResizeStopForSection({ shouldEmitResizeEnd });
  }
  function finishResizeStopForSection({
    shouldEmitResizeEnd,
  }: {
    shouldEmitResizeEnd: boolean;
  }) {
    finishResizeStop({ sectionId, shouldEmitResizeEnd, resizeStateRefs });
    setResizeInteractionActive(false);
  }
  useEffect(() => {
    const nextSize = getAutoClampSize({
      size,
      minHeight,
      minWidth,
      sizeMode,
      aspectRatio,
    });
    if (!nextSize) {
      return;
    }
    if (!canEditLayout || positionAndSizeLocked) {
      return;
    }
    persistSectionSizeChange(sectionId, nextSize);
  }, [
    minHeight,
    minWidth,
    sectionId,
    size.height,
    size.width,
    sizeMode.height,
    sizeMode.width,
    aspectRatio,
    canEditLayout,
    positionAndSizeLocked,
  ]);
  const { heightResizable, widthResizable } = getResizeAxisAvailability({
    maxHeight,
    maxWidth,
    minHeight,
    minWidth,
    sizeMode,
  });
  const snapGrid = useSettings((x) => x.gui.snapGrid);
  const snapToGrid = useLocalStorage((x) => x.snapToGrid);
  return (
    <CustomResizableSuperCore
      sectionId={sectionId}
      as={as}
      bgColor={bgColor}
      isYouTube={isYouTube}
      isMetaControl={isMetaControl}
      hasSectionStyleTheme={hasSectionStyleTheme}
      allowPointerEventsDuringDnd={allowPointerEventsDuringDnd}
      size={size}
      minHeight={minHeight}
      maxHeight={maxHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      heightResizable={heightResizable}
      widthResizable={widthResizable}
      positionAndSizeLocked={positionAndSizeLocked}
      frameClassName={frameClassName}
      layoutClassName={layoutClassName}
      onResizeStart={onResizeStart}
      onResize={onResize}
      onResizeStop={onResizeStop}
      onResizePointerDown={onResizePointerDown}
      aspectRatio={aspectRatio}
      aspectRatioExtraHeight={aspectRatioExtraHeight}
      aspectRatioExtraWidth={aspectRatioExtraWidth}
      snapGrid={resolveResizableGrid({ snapGrid, snapToGrid })}
    >
      {children}
    </CustomResizableSuperCore>
  );
}
function CustomResizableSuperCore({
  sectionId,
  as,
  bgColor,
  isYouTube,
  isMetaControl,
  hasSectionStyleTheme,
  allowPointerEventsDuringDnd,
  frameClassName = "before:border-white dark:before:border-setta-700",
  layoutClassName,
  size,
  minHeight,
  maxHeight,
  minWidth,
  maxWidth,
  heightResizable,
  widthResizable,
  positionAndSizeLocked,
  onResizeStart,
  onResize,
  onResizeStop,
  onResizePointerDown,
  aspectRatio,
  aspectRatioExtraHeight,
  aspectRatioExtraWidth,
  snapGrid,
  children,
}) {
  const { isSorting } = useDndMode();
  const disablePointerEvents = useShouldDisablePointerEvents();
  const allowPointerEvents = allowPointerEventsDuringDnd && isSorting;
  const shouldDisablePointerEvents =
    disablePointerEvents && !allowPointerEvents;
  const isAttachedTerminalChild = useProjectState(
    (x) => getAttachedTerminalParentIdForTerminalSection(x, sectionId) !== null,
  );
  const [activeResizeHandle, setActiveResizeHandle] = useState<string | null>(
    null,
  );
  const enable = getResizableEnable({
    disablePointerEvents,
    positionAndSizeLocked,
    heightResizable,
    widthResizable,
  });
  const layoutClassNameToUse =
    layoutClassName ?? "section-grid-cols section-grid-rows section-grid-areas";
  // MetaControl sections render outboard controls near the agentic handles.
  // On hover, raise the resizable stacking context above the handles so menus
  // remain clickable.
  const metaHoverZIndexClass = isMetaControl
    ? "group-hover/card-section:z-[170]"
    : "";
  const inputClasses = getSectionSurfaceClassName({
    bgColor,
    hasSectionStyleTheme,
    positionAndSizeLocked,
    shouldDisablePointerEvents,
    isYouTube,
    frameClassName,
    layoutClassName: layoutClassNameToUse,
    metaHoverZIndexClassName: metaHoverZIndexClass,
  });
  const { handleStyles, handleClasses, handleWrapperClassName } =
    getResizableHandleConfig({
      isMetaControl,
      isAttachedTerminalChild,
      activeResizeHandle,
    });
  function handleResizeMouseDownCapture(event: MouseEvent<HTMLDivElement>) {
    if (!onResizePointerDown) {
      return;
    }
    const currentTarget = event.currentTarget;
    if (!(currentTarget instanceof HTMLElement)) {
      return;
    }
    const direction = getResizeHandleDirection(event.target);
    if (!direction) {
      return;
    }
    onResizePointerDown(direction, currentTarget);
  }
  function handleResizeStart(event, direction, ref) {
    setActiveResizeHandle(direction);
    if (onResizeStart) {
      onResizeStart(event, direction, ref);
    }
  }
  function handleResize(event, direction, ref, delta) {
    if (onResize) {
      onResize(event, direction, ref, delta);
    }
  }
  function handleResizeStop(event, direction, ref, delta) {
    setActiveResizeHandle(null);
    if (onResizeStop) {
      onResizeStop(event, direction, ref, delta);
    }
  }
  return (
    <ResizableWithScale
      id={`${sectionId}-CustomResizable`} // IMPORTANT, used for section-scoped DOM lookups
      as={as}
      size={size}
      minHeight={minHeight}
      maxHeight={maxHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      onResizeStart={handleResizeStart}
      onResize={handleResize}
      onResizeStop={handleResizeStop}
      onMouseDownCapture={handleResizeMouseDownCapture}
      lockAspectRatio={aspectRatio}
      lockAspectRatioExtraHeight={aspectRatioExtraHeight}
      lockAspectRatioExtraWidth={aspectRatioExtraWidth}
      handleWrapperClass={handleWrapperClassName}
      enable={enable}
      className={inputClasses}
      handleStyles={handleStyles}
      handleClasses={handleClasses}
      grid={snapGrid}
    >
      {children}
    </ResizableWithScale>
  );
}
function useAspectRatio(sectionId: string) {
  return useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    if (impl.isMinimized) {
      return {
        size: impl.size,
        aspectRatio: false,
        aspectRatioExtraHeight: 0,
        aspectRatioExtraWidth: 0,
      };
    }
    return {
      size: impl.size,
      aspectRatio: impl.aspectRatio ?? false,
      aspectRatioExtraHeight: impl.aspectRatioExtraHeight ?? 0,
      aspectRatioExtraWidth: impl.aspectRatioExtraWidth ?? 0,
    };
  }, _.isEqual);
}
function setSectionResizeEvent(sectionId, resizeEvent, state) {
  state.resizeEvent[sectionId] = resizeEvent;
}
function persistSectionSizeChange(
  sectionId: string,
  nextSize: Partial<SectionSize>,
) {
  let updatedSectionSizes: Record<string, SectionSize> = {};
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      updatedSectionSizes = setSelfParentSiblingChildrenWidths(
        sectionId,
        nextSize,
        state,
      );
    },
    send: (frontendOpId) =>
      callOpenAPI(
        setSectionSizes({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            sectionSizes: updatedSectionSizes,
            frontendOpId,
          },
        } as Parameters<typeof setSectionSizes>[0]),
      ),
  });
}
function shouldSkipResizeStopUpdate({
  isZeroDelta,
  isDoubleClick,
  resizeAttempted,
}: {
  isZeroDelta: boolean;
  isDoubleClick: boolean;
  resizeAttempted: boolean;
}) {
  return isZeroDelta && !isDoubleClick && !resizeAttempted;
}
function finishResizeStop({
  sectionId,
  shouldEmitResizeEnd,
  resizeStateRefs,
}: {
  sectionId: string;
  shouldEmitResizeEnd: boolean;
  resizeStateRefs: {
    resizeStartedRef: { current: boolean };
    autoSizePromotedRef: { current: boolean };
    resizeAttemptedRef: { current: boolean };
    doubleClickPendingRef: { current: boolean };
  };
}) {
  if (shouldEmitResizeEnd) {
    useResizeEvent.setState((state) => {
      setSectionResizeEvent(sectionId, "end", state);
    });
  }
  useMisc.setState({ mouseDownDraggingSection: false });
  resizeStateRefs.resizeStartedRef.current = false;
  resizeStateRefs.autoSizePromotedRef.current = false;
  resizeStateRefs.resizeAttemptedRef.current = false;
  resizeStateRefs.doubleClickPendingRef.current = false;
}
function shouldReplaceMeasuredSize(
  size: Partial<SectionSize>[keyof SectionSize],
) {
  return size === "auto" || (typeof size === "number" && Number.isNaN(size));
}
function resolveResizeStopSize({
  props,
  ref,
  sizeMode,
  aspectRatio,
  isDoubleClick,
}: {
  props: Parameters<typeof getChangedSize>[0]["props"];
  ref: {
    offsetHeight: number;
    offsetWidth: number;
    getBoundingClientRect?: () => DOMRect;
  } | null;
  sizeMode: { width: string; height: string };
  aspectRatio: boolean;
  isDoubleClick: boolean;
}) {
  const changedSize = getChangedSize({
    props,
    sizeMode,
    aspectRatio,
    isDoubleClickOverride: isDoubleClick,
  });
  if (
    isDoubleClick ||
    !ref ||
    typeof ref.getBoundingClientRect !== "function"
  ) {
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
function shouldClampToMin(
  currentSize: SectionSize["width"] | SectionSize["height"],
  minSize: number,
  mode: string,
) {
  return (
    mode !== SIZE_MODE.auto_only &&
    typeof currentSize === "number" &&
    minSize - currentSize > AUTO_CLAMP_TOLERANCE
  );
}
function getIndependentAutoClampSize({
  shouldClampHeight,
  shouldClampWidth,
  minHeight,
  minWidth,
}: {
  shouldClampHeight: boolean;
  shouldClampWidth: boolean;
  minHeight: number;
  minWidth: number;
}) {
  const nextSize: Partial<SectionSize> = {};
  if (shouldClampHeight) {
    nextSize.height = minHeight;
  }
  if (shouldClampWidth) {
    nextSize.width = minWidth;
  }
  return _.size(nextSize) > 0 ? nextSize : null;
}
function getAspectRatioAutoClampSize({
  size,
  minHeight,
  minWidth,
}: {
  size: SectionSize;
  minHeight: number;
  minWidth: number;
}) {
  if (typeof size.height !== "number" || typeof size.width !== "number") {
    return null;
  }
  const adjusted = adjustSizeToBeAtLeastMin(
    size.height,
    size.width,
    minHeight,
    minWidth,
  );
  const nextSize: Partial<SectionSize> = {};
  if (adjusted.height !== size.height) {
    nextSize.height = adjusted.height;
  }
  if (adjusted.width !== size.width) {
    nextSize.width = adjusted.width;
  }
  return _.size(nextSize) > 0 ? nextSize : null;
}
function getAutoClampSize({
  size,
  minHeight,
  minWidth,
  sizeMode,
  aspectRatio,
}: {
  size: SectionSize;
  minHeight: number;
  minWidth: number;
  sizeMode: { width: string; height: string };
  aspectRatio: boolean;
}) {
  const shouldClampHeight = shouldClampToMin(
    size.height,
    minHeight,
    sizeMode.height,
  );
  const shouldClampWidth = shouldClampToMin(
    size.width,
    minWidth,
    sizeMode.width,
  );
  if (!shouldClampHeight && !shouldClampWidth) {
    return null;
  }
  const canKeepAspectRatio =
    aspectRatio &&
    sizeMode.height !== SIZE_MODE.auto_only &&
    sizeMode.width !== SIZE_MODE.auto_only;
  if (canKeepAspectRatio) {
    return getAspectRatioAutoClampSize({ size, minHeight, minWidth });
  }
  return getIndependentAutoClampSize({
    shouldClampHeight,
    shouldClampWidth,
    minHeight,
    minWidth,
  });
}
function getMetaControlHandleClass(
  direction: keyof typeof META_CONTROL_HANDLE_CURSOR_CLASSES,
  activeResizeHandle: string | null,
) {
  const isActive = activeResizeHandle === direction;
  return [
    HANDLE_BASE_CLASS_NAME,
    META_CONTROL_HANDLE_BASE_CLASS_NAME,
    isActive ? ACTIVE_META_CONTROL_HANDLE_CLASS_NAME : "",
    META_CONTROL_HANDLE_CURSOR_CLASSES[direction],
  ]
    .filter(Boolean)
    .join(" ");
}
export function getResizableHandleConfig({
  isMetaControl,
  isAttachedTerminalChild,
  activeResizeHandle,
}: {
  isMetaControl: boolean;
  isAttachedTerminalChild: boolean;
  activeResizeHandle: string | null;
}) {
  const handleWrapperClassName = isAttachedTerminalChild
    ? ATTACHED_TERMINAL_HANDLE_WRAPPER_CLASS_NAME
    : DEFAULT_HANDLE_WRAPPER_CLASS_NAME;
  if (isMetaControl) {
    return {
      handleStyles: META_CONTROL_HANDLE_STYLES,
      handleClasses: {
        right: getMetaControlHandleClass("right", activeResizeHandle),
        bottom: getMetaControlHandleClass("bottom", activeResizeHandle),
        bottomRight: getMetaControlHandleClass(
          "bottomRight",
          activeResizeHandle,
        ),
      },
      handleWrapperClassName,
    };
  }
  return {
    handleStyles: isAttachedTerminalChild
      ? ATTACHED_TERMINAL_HANDLE_STYLES
      : DEFAULT_HANDLE_STYLES,
    handleClasses: DEFAULT_HANDLE_CLASSES,
    handleWrapperClassName,
  };
}
function getResizeHandleDirection(target: EventTarget | null) {
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
