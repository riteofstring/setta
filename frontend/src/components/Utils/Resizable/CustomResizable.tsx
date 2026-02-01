import { useDndMode } from "forks/dnd-kit/dndState";
import _ from "lodash";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImpl,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import {
  adjustSizeToBeAtLeastMin,
  getResizeStartAutoSizeUpdate,
  isHeightResizeDirection,
  setSelfParentSiblingChildrenWidths,
  type ResizeHandleDirection,
} from "state/actions/sections/sectionSizes";
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
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";
import { route_set_section_sizes } from "utils/generatedEndpoints";
import { SectionSize } from "utils/generatedTypes";
import { ResizableWithScale } from "./ResizableWithScale";
import {
  getChangedSize,
  getResizeHandleClickState,
  isResizeDoubleClick,
  SIZE_MODE,
} from "./utils";

const AUTO_CLAMP_TOLERANCE = 2;

export function CustomResizable({
  sectionId,
  bgColor,
  isYouTube,
  isActiveSection,
  isMetaControl,
  positionAndSizeLocked,
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
      isActiveSection={isActiveSection}
      isMetaControl={isMetaControl}
      positionAndSizeLocked={positionAndSizeLocked}
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
  isActiveSection,
  isMetaControl,
  positionAndSizeLocked,
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
  const resizeClickRef = useRef<{
    lastTimestampMs: number | null;
    lastDirection: ResizeHandleDirection | null;
  }>({ lastTimestampMs: null, lastDirection: null });
  const doubleClickPendingRef = useRef(false);

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
              route_set_section_sizes({
                projectConfigId: getCurrProjectConfigId(),
                sectionSizes: updatedSectionSizes,
                frontendOpId,
              }),
          });
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

  function onResizeStart(_event, direction, _ref) {
    resizeStartedRef.current = false;
    autoSizePromotedRef.current = false;
    resizeAttemptedRef.current = false;
    useMisc.setState({ mouseDownDraggingSection: true });
  }

  function onResize(_event, direction, ref, _delta) {
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
    const [event, direction, ref, delta] = props;
    const isZeroDelta = delta.width === 0 && delta.height === 0;
    const isDoubleClick = isResizeDoubleClick({
      isPending: doubleClickPendingRef.current,
      eventDetail: event.detail,
      isZeroDelta,
      resizeAttempted: resizeAttemptedRef.current,
    });
    const shouldEmitResizeEnd = shouldEmitResizeEndEvent({
      resizeStarted: resizeStartedRef.current,
      resizeAttempted: resizeAttemptedRef.current,
      isZeroDelta,
      isDoubleClick,
    });
    if (isZeroDelta && !isDoubleClick && !resizeAttemptedRef.current) {
      if (shouldEmitResizeEnd) {
        useResizeEvent.setState((state) => {
          setSectionResizeEvent(sectionId, "end", state);
        });
      }
      useMisc.setState({ mouseDownDraggingSection: false });
      resizeStartedRef.current = false;
      autoSizePromotedRef.current = false;
      resizeAttemptedRef.current = false;
      doubleClickPendingRef.current = false;
      return;
    }
    const changedSize = getChangedSize({
      props,
      sizeMode,
      aspectRatio,
      isDoubleClickOverride: isDoubleClick,
    });
    if (
      !isDoubleClick &&
      ref &&
      typeof ref.getBoundingClientRect === "function"
    ) {
      if (
        changedSize.height === "auto" ||
        (typeof changedSize.height === "number" &&
          Number.isNaN(changedSize.height))
      ) {
        changedSize.height = Math.round(ref.offsetHeight);
      }
      if (
        changedSize.width === "auto" ||
        (typeof changedSize.width === "number" &&
          Number.isNaN(changedSize.width))
      ) {
        changedSize.width = Math.round(ref.offsetWidth);
      }
    }
    const clampedSize = clampChangedSize({
      changedSize,
      minHeight,
      minWidth,
      aspectRatio,
    });
    let updatedSectionSizes: Record<string, SectionSize> = {};
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        updatedSectionSizes = setSelfParentSiblingChildrenWidths(
          sectionId,
          clampedSize,
          state,
        );
      },
      send: (frontendOpId) =>
        route_set_section_sizes({
          projectConfigId: getCurrProjectConfigId(),
          sectionSizes: updatedSectionSizes,
          frontendOpId,
        }),
    });
    if (shouldEmitResizeEnd) {
      useResizeEvent.setState((state) => {
        setSectionResizeEvent(sectionId, "end", state);
      });
    }
    useMisc.setState({ mouseDownDraggingSection: false });
    resizeStartedRef.current = false;
    autoSizePromotedRef.current = false;
    resizeAttemptedRef.current = false;
    doubleClickPendingRef.current = false;
  }

  useEffect(() => {
    const hasHeight = typeof size.height === "number";
    const hasWidth = typeof size.width === "number";
    const heightDelta = hasHeight ? minHeight - size.height : null;
    const widthDelta = hasWidth ? minWidth - size.width : null;
    const shouldClampHeight =
      sizeMode.height !== SIZE_MODE.auto_only &&
      heightDelta !== null &&
      heightDelta > AUTO_CLAMP_TOLERANCE;
    const shouldClampWidth =
      sizeMode.width !== SIZE_MODE.auto_only &&
      widthDelta !== null &&
      widthDelta > AUTO_CLAMP_TOLERANCE;

    if (!shouldClampHeight && !shouldClampWidth) {
      return;
    }

    const nextSize: Partial<SectionSize> = {};
    if (
      aspectRatio &&
      hasHeight &&
      hasWidth &&
      sizeMode.height !== SIZE_MODE.auto_only &&
      sizeMode.width !== SIZE_MODE.auto_only
    ) {
      const adjusted = adjustSizeToBeAtLeastMin(
        size.height,
        size.width,
        minHeight,
        minWidth,
      );
      if (
        sizeMode.height !== SIZE_MODE.auto_only &&
        adjusted.height !== size.height
      ) {
        nextSize.height = adjusted.height;
      }
      if (
        sizeMode.width !== SIZE_MODE.auto_only &&
        adjusted.width !== size.width
      ) {
        nextSize.width = adjusted.width;
      }
    } else {
      if (shouldClampHeight) {
        nextSize.height = minHeight;
      }
      if (shouldClampWidth) {
        nextSize.width = minWidth;
      }
    }

    if (_.size(nextSize) === 0) {
      return;
    }
    if (!canEditLayout || positionAndSizeLocked) {
      return;
    }
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
        route_set_section_sizes({
          projectConfigId: getCurrProjectConfigId(),
          sectionSizes: updatedSectionSizes,
          frontendOpId,
        }),
    });
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

  const heightResizable =
    minHeight !== maxHeight && sizeMode.height !== SIZE_MODE.auto_only;
  const widthResizable = sizeMode.width !== SIZE_MODE.auto_only;

  const snapGrid = useSettings((x) => x.gui.snapGrid);
  const snapToGrid = useLocalStorage((x) => x.snapToGrid);

  return (
    <CustomResizableSuperCore
      sectionId={sectionId}
      as={as}
      bgColor={bgColor}
      isYouTube={isYouTube}
      isActiveSection={isActiveSection}
      isMetaControl={isMetaControl}
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
      snapGrid={snapGrid}
      snapToGrid={snapToGrid}
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
  isActiveSection,
  isMetaControl,
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
  snapToGrid,
  children,
}) {
  const { isSorting, isMovingFree } = useDndMode();
  const disablePointerEvents = useShouldDisablePointerEvents();
  const allowPointerEvents =
    allowPointerEventsDuringDnd && (isSorting || isMovingFree);
  const shouldDisablePointerEvents =
    disablePointerEvents && !allowPointerEvents;
  const [activeResizeHandle, setActiveResizeHandle] = useState<string | null>(
    null,
  );

  const enable =
    disablePointerEvents || positionAndSizeLocked
      ? false
      : {
          top: false,
          left: false,
          bottom: heightResizable,
          right: widthResizable,
          topRight: false,
          bottomRight: heightResizable && widthResizable,
          topLeft: false,
          bottomLeft: false,
        };

  const layoutClassNameToUse =
    layoutClassName ?? "section-grid-cols section-grid-rows section-grid-areas";

  // trying always overflow-clip ${isYouTube ? "overflow-clip" : ""}
  const inputClasses = `${
    shouldDisablePointerEvents ? "pointer-events-none select-none" : ""
  } ${bgColor} ${layoutClassNameToUse} relative grid h-full transition-radius ${!positionAndSizeLocked ? "rounded-xl" : "rounded-sm"}   before:content-none before:block before:absolute before:top-0 before:right-0 before:bottom-0 before:left-0 before:border overflow-clip ${
    isActiveSection ? "z-[150]" : "z-10"
  } ${frameClassName}`;

  const handleBaseClassName = `${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_PAN_CLASS_NAME}`;
  const handleBaseClasses = {
    right: `${handleBaseClassName} section-resize-handle section-resize-handle-right`,
    bottom: `${handleBaseClassName} section-resize-handle section-resize-handle-bottom`,
    bottomRight: `${handleBaseClassName} section-resize-handle section-resize-handle-bottom-right`,
  };
  const metaControlHandleBaseClassName =
    "relative flex items-center justify-center opacity-0 transition-opacity hover:opacity-100 after:absolute after:rounded after:bg-transparent hover:after:bg-blue-500/80 dark:hover:after:bg-blue-400/80";

  function getMetaControlHandleActiveClassName(direction: string) {
    if (!isMetaControl) {
      return "";
    }
    if (activeResizeHandle !== direction) {
      return "";
    }
    return "opacity-100 after:bg-blue-500/80 dark:after:bg-blue-400/80";
  }

  const metaControlHandleRightClassName = `${metaControlHandleBaseClassName} ${getMetaControlHandleActiveClassName("right")} cursor-col-resize after:inset-y-1 after:left-1/2 after:w-[3px] after:-translate-x-1/2`;
  const metaControlHandleBottomClassName = `${metaControlHandleBaseClassName} ${getMetaControlHandleActiveClassName("bottom")} cursor-row-resize after:inset-x-1 after:top-1/2 after:h-[3px] after:-translate-y-1/2`;
  const metaControlHandleCornerClassName = `${metaControlHandleBaseClassName} ${getMetaControlHandleActiveClassName("bottomRight")} cursor-nwse-resize after:inset-1`;

  let handleStyles = { right: { right: "-8px" }, bottom: { bottom: "-8px" } };
  let handleClasses = handleBaseClasses;

  function handleResizeMouseDownCapture(event: MouseEvent<HTMLDivElement>) {
    if (!onResizePointerDown) {
      return;
    }
    const currentTarget = event.currentTarget;
    if (!(currentTarget instanceof HTMLElement)) {
      return;
    }
    let direction: ResizeHandleDirection | null = null;
    const target = event.target;
    if (target instanceof HTMLElement) {
      const handleElement = target.closest(".section-resize-handle");
      if (handleElement) {
        if (
          handleElement.classList.contains("section-resize-handle-bottom-right")
        ) {
          direction = "bottomRight";
        } else if (
          handleElement.classList.contains("section-resize-handle-bottom")
        ) {
          direction = "bottom";
        } else if (
          handleElement.classList.contains("section-resize-handle-right")
        ) {
          direction = "right";
        }
      }
    }
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

  if (isMetaControl) {
    handleStyles = {
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
    handleClasses = {
      right: `${handleBaseClassName} ${metaControlHandleRightClassName}`,
      bottom: `${handleBaseClassName} ${metaControlHandleBottomClassName}`,
      bottomRight: `${handleBaseClassName} ${metaControlHandleCornerClassName}`,
    };
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
      handleWrapperClass="absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full nodrag [&>div]:z-20"
      enable={enable}
      className={inputClasses}
      handleStyles={handleStyles}
      handleClasses={handleClasses}
      grid={snapToGrid ? snapGrid : null}
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

type ResizeEndDecisionInput = {
  resizeStarted: boolean;
  resizeAttempted: boolean;
  isZeroDelta: boolean;
  isDoubleClick: boolean;
};

export function shouldEmitResizeEndEvent({
  resizeStarted,
  resizeAttempted,
  isZeroDelta,
  isDoubleClick,
}: ResizeEndDecisionInput): boolean {
  if (!resizeStarted) {
    return false;
  }
  if (isZeroDelta && !isDoubleClick && !resizeAttempted) {
    return false;
  }
  return true;
}

export function clampChangedSize({
  changedSize,
  minHeight,
  minWidth,
  aspectRatio,
}: {
  changedSize: Partial<SectionSize>;
  minHeight: number;
  minWidth: number;
  aspectRatio: boolean;
}) {
  const clampedSize = { ...changedSize };
  const hasHeight = typeof changedSize.height === "number";
  const hasWidth = typeof changedSize.width === "number";

  if (hasHeight && hasWidth) {
    if (aspectRatio) {
      const adjusted = adjustSizeToBeAtLeastMin(
        changedSize.height,
        changedSize.width,
        minHeight,
        minWidth,
      );
      clampedSize.height = adjusted.height;
      clampedSize.width = adjusted.width;
      return clampedSize;
    }
    if (changedSize.height < minHeight) {
      clampedSize.height = minHeight;
    }
    if (changedSize.width < minWidth) {
      clampedSize.width = minWidth;
    }
    return clampedSize;
  }

  if (hasHeight && changedSize.height < minHeight) {
    clampedSize.height = minHeight;
  }
  if (hasWidth && changedSize.width < minWidth) {
    clampedSize.width = minWidth;
  }

  return clampedSize;
}
