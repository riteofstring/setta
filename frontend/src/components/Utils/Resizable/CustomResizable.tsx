import { useDndMode } from "forks/dnd-kit/dndState";
import { useState, type MouseEvent } from "react";
import { getAttachedTerminalParentIdForTerminalSection } from "state/actions/sectionInfos";
import type { ResizeHandleDirection } from "state/actions/sections/sectionSizes";
import { useProjectState } from "state/definitions";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
import {
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";
import { getSectionSurfaceClassName } from "../../Section/Container/sectionChrome";
import { ResizableWithScale } from "./ResizableWithScale";
import { useSectionResizeController } from "./useSectionResizeController";

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
  const {
    aspectRatio,
    aspectRatioExtraHeight,
    aspectRatioExtraWidth,
    heightResizable,
    maxHeight,
    maxWidth,
    minHeight,
    minWidth,
    onResize,
    onResizePointerDown,
    onResizeStart,
    onResizeStop,
    size,
    snapGrid,
    snapToGrid,
    widthResizable,
  } = useSectionResizeController({
    sectionId,
    positionAndSizeLocked,
  });

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
  snapToGrid,
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
  const handleWrapperClassName = isAttachedTerminalChild
    ? "absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full nodrag [&>div]:z-30"
    : "absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full nodrag [&>div]:z-20";

  if (isAttachedTerminalChild) {
    // Keep handles inside the parent code section outline so they don't feel clipped.
    handleStyles = {
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
  }

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
      handleWrapperClass={handleWrapperClassName}
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
