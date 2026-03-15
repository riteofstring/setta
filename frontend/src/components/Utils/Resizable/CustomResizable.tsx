import { useDndMode } from "forks/dnd-kit/dndState";
import type {
  ResizableProps,
  ResizeCallback,
  ResizeStartCallback,
} from "re-resizable";
import { useState, type MouseEvent, type ReactNode } from "react";
import { getAttachedTerminalParentIdForTerminalSection } from "state/actions/sectionLayoutQueries";
import { useProjectState } from "state/definitions";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
import { useSectionMinMaxDims } from "state/hooks/sectionMinMaxDims";
import { useShareCapabilities } from "state/hooks/share";
import { useLocalStorage, useSettings } from "state/stores/uiPreferenceStores";
import { getSectionSurfaceClassName } from "../../Section/Container/sectionChrome";
import { ResizableWithScale } from "./ResizableWithScale";
import {
  getCustomResizableChromeConfig,
  getResizeHandleDirectionFromTarget,
} from "./customResizableChrome";
import { useCustomResizableBehavior } from "./useCustomResizableBehavior";

type CustomResizableProps = {
  sectionId: string;
  bgColor: string;
  isYouTube: boolean;
  isMetaControl: boolean;
  positionAndSizeLocked: boolean;
  hasSectionStyleTheme?: boolean;
  allowPointerEventsDuringDnd?: boolean;
  frameClassName?: string;
  layoutClassName?: string;
  children: ReactNode;
  as?: ResizableProps["as"];
};

type CustomResizableSurfaceProps = CustomResizableProps & {
  size: ReturnType<typeof useCustomResizableBehavior>["size"];
  minHeight: number;
  maxHeight: number;
  minWidth: number;
  maxWidth: number;
  heightResizable: boolean;
  widthResizable: boolean;
  onResizeStart: ResizeStartCallback;
  onResize: ResizeCallback;
  onResizeStop: ResizeCallback;
  onResizePointerDown: (direction: "bottom" | "bottomRight" | "right") => void;
  aspectRatio: boolean;
  aspectRatioExtraHeight: number;
  aspectRatioExtraWidth: number;
  snapGrid: [number, number];
  snapToGrid: boolean;
};

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
}: CustomResizableProps) {
  const { minHeight, maxHeight, minWidth, maxWidth, sizeMode } =
    useSectionMinMaxDims(sectionId);
  const {
    size,
    aspectRatio,
    aspectRatioExtraHeight,
    aspectRatioExtraWidth,
    heightResizable,
    widthResizable,
    onResizeStart,
    onResize,
    onResizeStop,
    onResizePointerDown,
  } = useCustomResizableBehavior({
    sectionId,
    minHeight,
    minWidth,
    maxHeight,
    sizeMode,
    positionAndSizeLocked,
  });
  const snapGrid = useSettings((state) => state.gui.snapGrid);
  const snapToGrid = useLocalStorage((state) => state.snapToGrid);

  return (
    <CustomResizableSurface
      sectionId={sectionId}
      as={as}
      bgColor={bgColor}
      isYouTube={isYouTube}
      isMetaControl={isMetaControl}
      positionAndSizeLocked={positionAndSizeLocked}
      hasSectionStyleTheme={hasSectionStyleTheme}
      allowPointerEventsDuringDnd={allowPointerEventsDuringDnd}
      frameClassName={frameClassName}
      layoutClassName={layoutClassName}
      size={size}
      minHeight={minHeight}
      maxHeight={maxHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      heightResizable={heightResizable}
      widthResizable={widthResizable}
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
    </CustomResizableSurface>
  );
}

function CustomResizableSurface({
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
}: CustomResizableSurfaceProps) {
  const { isSorting } = useDndMode();
  const disablePointerEvents = useShouldDisablePointerEvents();
  const { canEditLayout } = useShareCapabilities();
  const allowPointerEvents = allowPointerEventsDuringDnd && isSorting;
  const shouldDisablePointerEvents =
    disablePointerEvents && !allowPointerEvents;
  const isAttachedTerminalChild = useProjectState(
    (state) =>
      getAttachedTerminalParentIdForTerminalSection(state, sectionId) !== null,
  );
  const [activeResizeHandle, setActiveResizeHandle] = useState<
    "bottom" | "bottomRight" | "right" | null
  >(null);
  const layoutClassNameToUse =
    layoutClassName ?? "section-grid-cols section-grid-rows section-grid-areas";

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
  const { enable, handleStyles, handleClasses, handleWrapperClassName } =
    getCustomResizableChromeConfig({
      disablePointerEvents,
      allowPointerEvents,
      positionAndSizeLocked: positionAndSizeLocked || !canEditLayout,
      heightResizable,
      widthResizable,
      isMetaControl,
      isAttachedTerminalChild,
      activeResizeHandle,
    });

  const handleResizeMouseDownCapture = (event: MouseEvent<HTMLElement>) => {
    const direction = getResizeHandleDirectionFromTarget(event.target);
    if (!direction) {
      return;
    }
    onResizePointerDown(direction);
  };

  const handleResizeStart: ResizeStartCallback = (event, direction, ref) => {
    if (
      direction === "bottom" ||
      direction === "bottomRight" ||
      direction === "right"
    ) {
      setActiveResizeHandle(direction);
    }
    return onResizeStart(event, direction, ref);
  };

  const handleResizeStop: ResizeCallback = (event, direction, ref, delta) => {
    setActiveResizeHandle(null);
    onResizeStop(event, direction, ref, delta);
  };

  return (
    <ResizableWithScale
      id={`${sectionId}-CustomResizable`}
      as={as}
      size={size}
      minHeight={minHeight}
      maxHeight={maxHeight}
      minWidth={minWidth}
      maxWidth={maxWidth}
      onResizeStart={handleResizeStart}
      onResize={onResize}
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
