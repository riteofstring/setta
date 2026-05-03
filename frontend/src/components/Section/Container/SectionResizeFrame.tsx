import {
  getResizableHandleConfig,
  type SectionResizeHandleDirection,
} from "components/Utils/Resizable/sectionResizeHandles";
import { useDndMode } from "forks/dnd-kit/dndState";
import { GPU_NODE_RESIZE_DIRECTION_ATTRIBUTE } from "gpuFlow/resizeHandles";
import type { CSSProperties, ElementType, ReactNode } from "react";
import { getAttachedTerminalParentIdForTerminalSection } from "state/actions/sectionInfos";
import {
  getResizableEnable,
  getResizeAxisAvailability,
} from "state/actions/sections/sectionResizePolicy";
import { useProjectState } from "state/definitions";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
import { useSectionMinMaxDims } from "state/hooks/sectionSizes";
import { getSectionSurfaceClassName } from "./sectionChrome";

type SectionResizeFrameProps = {
  sectionId: string;
  as?: ElementType | undefined;
  bgColor: string;
  isYouTube: boolean;
  isMetaControl: boolean;
  positionAndSizeLocked: boolean;
  hasSectionStyleTheme: boolean;
  allowPointerEventsDuringDnd?: boolean | undefined;
  frameClassName?: string | undefined;
  layoutClassName?: string | undefined;
  children: ReactNode;
};

const RESIZE_HANDLE_DIRECTIONS = [
  "right",
  "bottom",
  "bottomRight",
] as const satisfies readonly SectionResizeHandleDirection[];

const RESIZE_HANDLE_BASE_STYLES: Record<
  SectionResizeHandleDirection,
  CSSProperties
> = {
  right: {
    bottom: 0,
    cursor: "col-resize",
    height: "100%",
    pointerEvents: "auto",
    position: "absolute",
    top: 0,
    width: 16,
  },
  bottom: {
    cursor: "row-resize",
    height: 16,
    left: 0,
    pointerEvents: "auto",
    position: "absolute",
    right: 0,
    width: "100%",
  },
  bottomRight: {
    bottom: "-8px",
    cursor: "nwse-resize",
    height: 16,
    pointerEvents: "auto",
    position: "absolute",
    right: "-8px",
    width: 16,
  },
};

export function SectionResizeFrame({
  sectionId,
  as,
  bgColor,
  isYouTube,
  isMetaControl,
  positionAndSizeLocked,
  hasSectionStyleTheme,
  allowPointerEventsDuringDnd = false,
  frameClassName = "before:border-white dark:before:border-setta-700",
  layoutClassName,
  children,
}: SectionResizeFrameProps) {
  const { isSorting } = useDndMode();
  const { minHeight, maxHeight, minWidth, maxWidth, sizeMode } =
    useSectionMinMaxDims(sectionId);
  const disablePointerEvents = useShouldDisablePointerEvents();
  const isAttachedTerminalChild = useProjectState(
    (state) =>
      getAttachedTerminalParentIdForTerminalSection(state, sectionId) !== null,
  );
  const allowPointerEvents = allowPointerEventsDuringDnd && isSorting;
  const shouldDisablePointerEvents =
    disablePointerEvents && !allowPointerEvents;
  const { heightResizable, widthResizable } = getResizeAxisAvailability({
    maxHeight,
    maxWidth,
    minHeight,
    minWidth,
    sizeMode,
  });
  const enable = getResizableEnable({
    disablePointerEvents,
    positionAndSizeLocked,
    heightResizable,
    widthResizable,
  });
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
  const { handleStyles, handleClasses, handleWrapperClassName } =
    getResizableHandleConfig({
      isMetaControl,
      isAttachedTerminalChild,
      activeResizeHandle: null,
    });
  const Component = as ?? "div";

  return (
    <Component
      id={`${sectionId}-CustomResizable`}
      className={inputClasses}
      data-section-resize-frame="gpu-passive"
    >
      {children}
      {enable ? (
        <div className={handleWrapperClassName}>
          {RESIZE_HANDLE_DIRECTIONS.map((direction) =>
            enable[direction] ? (
              <div
                aria-hidden="true"
                className={handleClasses[direction]}
                data-resize-section-id={sectionId}
                key={direction}
                {...{ [GPU_NODE_RESIZE_DIRECTION_ATTRIBUTE]: direction }}
                style={{
                  ...RESIZE_HANDLE_BASE_STYLES[direction],
                  ...handleStyles[direction],
                }}
              />
            ) : null,
          )}
        </div>
      ) : null}
    </Component>
  );
}
