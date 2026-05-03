import { useDndMode } from "forks/dnd-kit/dndState";
import type { ElementType, ReactNode } from "react";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
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
  const disablePointerEvents = useShouldDisablePointerEvents();
  const allowPointerEvents = allowPointerEventsDuringDnd && isSorting;
  const shouldDisablePointerEvents =
    disablePointerEvents && !allowPointerEvents;
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
  const Component = as ?? "div";

  return (
    <Component
      id={`${sectionId}-CustomResizable`}
      className={inputClasses}
      data-section-resize-frame="gpu-owned"
    >
      {children}
    </Component>
  );
}
