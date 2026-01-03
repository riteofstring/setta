import { ResizableWithScale } from "components/Utils/Resizable/ResizableWithScale";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import React from "react";

import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { setSectionRef } from "state/actions/sectionRefs";
import { setSectionSize } from "state/actions/sections/sectionSizes";
import {
  useLocalStorage,
  useMisc,
  useProjectState,
  useResizeEvent,
  useSettings,
} from "state/definitions";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
import { useIsScrollable, useSectionMinMaxDims } from "state/hooks/sectionSizes";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import {
  NO_WHEEL_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
  SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER,
} from "utils/constants";
import { route_set_section_sizes } from "utils/generatedEndpoints";
import type { SectionSize } from "utils/generatedTypes";
import { SectionTypeEnum } from "utils/generatedTypes";
import { sectionContainerCoreOnKeyDown } from "utils/tabbingLogic";
import { ChangeOrientationButton } from "../Header/ChangeOrientationButton";
import { DeleteOrHideButton } from "../Header/DeleteOrHideButton";
import { LockPositionButton } from "../Header/LockPositionButton";
import MenuButton from "../Header/MenuButton/MenuButton";
import { SectionTitle } from "../Header/SectionTitle";
import { getOnSectionClick, getOutlineColor, useHasTempNested } from "./utils";

function _Container({
  isGroup,
  sectionId,
  droppableRef,
  draggableRef,
  className,
  style,
  trueDragListeners,
  isEditingViewMode,
  isUserView,
  children,
}) {
  const refForPosition = useSectionRefAndInit(sectionId, "withNested");

  function totalRef(e) {
    refForPosition.current = e;
    if (e) {
      setSectionRef({ sectionId, withNested: e });
    }
    droppableRef && droppableRef(e);
    draggableRef && draggableRef(e);
  }

  const commonProps = { ref: totalRef, ...trueDragListeners };

  return isGroup ? (
    <ContainerGroup
      sectionId={sectionId}
      commonProps={commonProps}
      refForPosition={refForPosition}
      isEditingViewMode={isEditingViewMode}
      isUserView={isUserView}
      className={className}
      style={style}
    >
      {children}
    </ContainerGroup>
  ) : (
    <div
      className={`${className} focus-visible:outline-none`}
      style={style}
      {...commonProps}
      onKeyDown={(e) =>
        sectionContainerCoreOnKeyDown(e, refForPosition, sectionId)
      }
      tabIndex={-1} // needed so that onKeyDown works
    >
      {children}
    </div>
  );
}

export const Container = React.memo(_Container, _.isEqual);

function getNumericSectionSizeValue(
  value: SectionSize["width"] | null | undefined,
): number | null {
  if (typeof value === "number") {
    return value;
  }
  return null;
}

function ContainerGroup({
  sectionId,
  commonProps,
  refForPosition,
  isEditingViewMode,
  isUserView,
  className,
  style,
  children,
}) {
  const hasNested = useHasTempNested(sectionId);
  const {
    isActiveSection,
    positionAndSizeLocked,
    isInOtherProjectConfigs,
    overflowMode,
    overflowMinSize,
    isHorizontalOrientation,
    size,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Group,
    );
    return {
      isActiveSection: x.projectConfig.activeIds.includes(sectionId),
      positionAndSizeLocked: impl.positionAndSizeLocked,
      isInOtherProjectConfigs: impl.isInOtherProjectConfigs,
      overflowMode: impl.overflowMode ?? false,
      overflowMinSize: impl.overflowMinSize ?? null,
      isHorizontalOrientation: impl.isHorizontalOrientation ?? false,
      size: impl.size,
    };
  }, _.isEqual);

  const disablePointerEvents = useShouldDisablePointerEvents();
  const { ref: overflowRef, isScrollable } = useIsScrollable();
  const { minHeight, maxHeight, minWidth, maxWidth } =
    useSectionMinMaxDims(sectionId);
  let effectiveMinHeight = minHeight;
  let effectiveMinWidth = minWidth;
  if (overflowMode) {
    const overflowMinHeight = getNumericSectionSizeValue(
      overflowMinSize?.height,
    );
    if (overflowMinHeight !== null) {
      effectiveMinHeight = Math.max(minHeight, overflowMinHeight);
    }
    const overflowMinWidth = getNumericSectionSizeValue(overflowMinSize?.width);
    if (overflowMinWidth !== null) {
      effectiveMinWidth = Math.max(minWidth, overflowMinWidth);
    }
  }
  const snapGrid = useSettings((x) => x.gui.snapGrid);
  const snapToGrid = useLocalStorage((x) => x.snapToGrid);

  // Apply this only to the group title.
  // For sections, this is applied in SectionContainerCore.
  // We want to apply this lower down in the component tree, because dnd needs onPointerDown to work.
  const pointerSelectCSS = disablePointerEvents
    ? "pointer-events-none select-none"
    : "";

  const outlineColor = getOutlineColor({
    isActiveSection,
    isInOtherProjectConfigs,
  });

  const groupStyle = { ...(style ?? {}) };
  if (overflowMode) {
    // Only fix the scroll-axis dimension, let the cross-axis expand with content
    // Vertical groups: scroll vertically (fix height), expand horizontally (width auto)
    // Horizontal groups: scroll horizontally (fix width), expand vertically (height auto)
    if (isHorizontalOrientation) {
      // Horizontal group: fix width (scroll axis), let height expand (cross axis)
      if (size.width !== "auto") {
        groupStyle.width = size.width;
      }
    } else {
      // Vertical group: fix height (scroll axis), let width expand (cross axis)
      if (size.height !== "auto") {
        groupStyle.height = size.height;
      }
    }
  }

  let contentClassName = "z-10";
  if (overflowMode) {
    // Scroll axis: auto (allows scrolling when content exceeds container)
    // Cross axis: visible (content determines size, no clipping)
    // Note: CSS converts visible to auto when other axis is scroll/auto,
    // but since cross-axis container is not constrained, this works naturally.
    const overflowAxisClassName = isHorizontalOrientation
      ? "overflow-x-auto overflow-y-visible"
      : "overflow-y-auto overflow-x-visible";

    // Padding to prevent scrollbar from crowding sections
    // Also adds padding on cross-axis edges to ensure section outlines (4px) are visible
    const overflowPaddingClassName = isHorizontalOrientation
      ? "pb-4 -mb-4 pt-1 -mt-1" // Bottom for scrollbar, top for outlines
      : "pr-4 -mr-4 pl-1 -ml-1"; // Right for scrollbar, left for outlines

    contentClassName =
      `z-10 flex min-h-0 min-w-0 flex-1 flex-col ${overflowAxisClassName} ${overflowPaddingClassName}`.trim();
    if (isScrollable) {
      contentClassName = `${contentClassName} ${NO_WHEEL_CLASS_NAME}`;
    }
  }

  const heightResizable = effectiveMinHeight !== maxHeight;
  const widthResizable = effectiveMinWidth !== maxWidth;
  // In overflow mode, only allow resizing on the scroll axis:
  // - Vertical groups: resize height (bottom handle only)
  // - Horizontal groups: resize width (right handle only)
  // Cross-axis is determined by content, so no resize handles needed there.
  const scrollAxisHeightResizable = isHorizontalOrientation
    ? false
    : heightResizable;
  const scrollAxisWidthResizable = isHorizontalOrientation
    ? widthResizable
    : false;
  const enableResize =
    disablePointerEvents || positionAndSizeLocked
      ? false
      : {
          top: false,
          left: false,
          bottom: scrollAxisHeightResizable,
          right: scrollAxisWidthResizable,
          topRight: false,
          bottomRight: false, // No corner resize since only one axis is resizable
          topLeft: false,
          bottomLeft: false,
        };
  const handleBaseClassName = `${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER} ${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_PAN_CLASS_NAME}`;
  const handleClasses = {
    right: handleBaseClassName,
    bottom: handleBaseClassName,
    bottomRight: handleBaseClassName,
  };
  const handleStyles = { right: { right: "-8px" }, bottom: { bottom: "-8px" } };

  function onResizeStart() {
    useResizeEvent.setState((state) => {
      state.resizeEvent[sectionId] = "start";
    });
    useMisc.setState({ mouseDownDraggingSection: true });
  }

  function onResizeStop(...props) {
    const [, , ref] = props;
    let changedSize: Partial<SectionSize> = {};
    if (ref) {
      const zoom = useReactFlow.getState().transform[2] ?? 1;
      const safeZoom = zoom > 0 ? zoom : 1;
      const rect = ref.getBoundingClientRect();
      // Only save the scroll axis dimension; cross-axis is determined by content
      if (isHorizontalOrientation) {
        changedSize = { width: Math.round(rect.width / safeZoom) };
      } else {
        changedSize = { height: Math.round(rect.height / safeZoom) };
      }
    }
    let updatedSectionSizes: Record<string, SectionSize> = {};
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const nextSize = setSectionSize(sectionId, changedSize, state);
        updatedSectionSizes = { [sectionId]: nextSize };
      },
      send: (frontendOpId) =>
        route_set_section_sizes({
          projectConfigId: getCurrProjectConfigId(),
          sectionSizes: updatedSectionSizes,
          frontendOpId,
        }),
    });
    useResizeEvent.setState((state) => {
      state.resizeEvent[sectionId] = "end";
    });
    useMisc.setState({ mouseDownDraggingSection: false });
  }

  // For overflow mode, only constrain the scroll axis:
  // - Vertical groups: h-full (scroll axis), let width be natural
  // - Horizontal groups: w-full (scroll axis), let height be natural
  const overflowContainerClassName = overflowMode
    ? isHorizontalOrientation
      ? "min-h-0 min-w-0 w-full" // Horizontal: fix width, let height expand
      : "min-h-0 min-w-0 h-full" // Vertical: fix height, let width expand
    : "";
  const containerClassName = `group/group-section flex min-w-[250px] flex-col items-stretch px-6 pb-6 pt-2 focus-visible:outline-none ${overflowContainerClassName} ${className}`;
  const dropAreaBaseClassName =
    "z-10 mt-4 flex flex-row items-center justify-center rounded-xl border-4 border-dashed border-setta-300 px-4 py-3 text-sm text-setta-500/80 dark:border-setta-700 dark:text-setta-500";
  const dropAreaClassName = `${dropAreaBaseClassName} -mx-4`;

  const containerBody = (
    <>
      <div
        className={`outline outline-4 ${outlineColor} transition-radius absolute left-0 right-0 top-0 z-0 h-full w-full ${positionAndSizeLocked ? "rounded-sm border-setta-400/90 dark:border-setta-975/35" : "rounded-3xl border-setta-50/50 dark:border-setta-700"}  border border-solid  bg-setta-100/40 outline outline-2 outline-transparent   dark:bg-setta-860/50`}
      />
      <div className="z-10 flex min-h-10 w-full items-center">
        <MenuButton
          sectionId={sectionId}
          sectionTypeName={SectionTypeEnum.Group}
          isInOtherProjectConfigs={isInOtherProjectConfigs}
        />
        <div
          className={`${pointerSelectCSS} relative my-auto mr-2 flex min-h-10 w-full items-center overflow-hidden`}
        >
          <GroupSectionTitle sectionId={sectionId} />
        </div>
        {!isUserView && (
          <div className="z-10 ml-auto flex items-center">
            <ChangeOrientationButton sectionId={sectionId} />
            <LockPositionButton sectionId={sectionId} />
            <DeleteOrHideButton
              sectionId={sectionId}
              size={`min-w-4 h-4 ${isEditingViewMode ? "scale-120" : "scale-150"}  `}
            />
          </div>
        )}
      </div>

      <div className={contentClassName} ref={overflowRef}>
        {!hasNested && (
          <div className={dropAreaClassName}>Drop A Section Here.</div>
        )}
        {children}
      </div>
    </>
  );

  if (!overflowMode) {
    return (
      <div
        className={containerClassName}
        {...commonProps}
        onClick={getOnSectionClick(sectionId, isActiveSection)}
        onKeyDown={(e) =>
          sectionContainerCoreOnKeyDown(e, refForPosition, sectionId)
        }
        tabIndex={-1} // needed so that onKeyDown works
        style={groupStyle}
      >
        {containerBody}
      </div>
    );
  }

  // Only set the scroll axis size; cross-axis is determined by content
  const overflowSize = isHorizontalOrientation
    ? { width: size.width, height: "auto" }
    : { width: "auto", height: size.height };
  // For scroll axis constraints, use effective min/max
  // For cross-axis, use undefined to allow natural sizing
  const effectiveMaxHeight = isHorizontalOrientation ? undefined : maxHeight;
  const effectiveMaxWidth = isHorizontalOrientation ? maxWidth : undefined;

  return (
    <ResizableWithScale
      className="relative"
      style={groupStyle}
      size={overflowSize}
      minHeight={isHorizontalOrientation ? undefined : effectiveMinHeight}
      maxHeight={effectiveMaxHeight}
      minWidth={isHorizontalOrientation ? effectiveMinWidth : undefined}
      maxWidth={effectiveMaxWidth}
      onResizeStart={onResizeStart}
      onResizeStop={onResizeStop}
      handleWrapperClass="absolute pointer-events-none [&>*]:pointer-events-auto h-full bottom-0 w-full nodrag [&>div]:z-20"
      enable={enableResize}
      handleStyles={handleStyles}
      handleClasses={handleClasses}
      grid={snapToGrid ? snapGrid : null}
    >
      <div
        className={containerClassName}
        {...commonProps}
        onClick={getOnSectionClick(sectionId, isActiveSection)}
        onKeyDown={(e) =>
          sectionContainerCoreOnKeyDown(e, refForPosition, sectionId)
        }
        tabIndex={-1} // needed so that onKeyDown works
      >
        {containerBody}
      </div>
    </ResizableWithScale>
  );
}

function GroupSectionTitle({ sectionId }) {
  const titleProps = {
    editing:
      "absolute nodrag cursor-text box-border px-1 focus-visible:ring-0 focus-visible:outline-none focus-visible:border-blue-500 rounded-lg border border-solid border-transparent w-full tracking-tighter text-setta-500 dark:text-setta-500 cursor-pointer flex-shrink",

    notEditing:
      "absolute cursor-pointer box-border px-1 focus-visible:ring-0 focus-visible:outline-none focus-visible:border-blue-500 rounded-lg border border-solid border-transparent w-full truncate tracking-tighter text-setta-500 dark:text-setta-500  flex-shrink",
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}
