import {
  applyOverflowParentSizeUpdates,
  type CrossAxis,
  setOverflowGroupCrossAxisSize,
} from "components/Utils/Resizable/overflowResizeUtils";
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

function getGroupResizeSizeFromRef(
  ref: HTMLDivElement | null,
): SectionSize | null {
  if (!ref) {
    return null;
  }
  const zoom = useReactFlow.getState().transform[2] ?? 1;
  const safeZoom = zoom > 0 ? zoom : 1;
  const rect = ref.getBoundingClientRect();
  return {
    width: Math.round(rect.width / safeZoom),
    height: Math.round(rect.height / safeZoom),
  };
}

function didResizeWidth(direction: string): boolean {
  return direction.includes("left") || direction.includes("right");
}

function didResizeHeight(direction: string): boolean {
  return direction.includes("top") || direction.includes("bottom");
}

function getCrossAxis(isHorizontalOrientation: boolean): CrossAxis {
  if (isHorizontalOrientation) {
    return "height";
  }
  return "width";
}

const GROUP_OVERFLOW_MIN_WIDTH = 250;
const GROUP_OVERFLOW_MIN_HEIGHT = 140;

function mergeSizeUpdates(
  target: Record<string, SectionSize>,
  updates: Record<string, SectionSize>,
) {
  for (const [sectionId, size] of Object.entries(updates)) {
    target[sectionId] = size;
  }
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
      isHorizontalOrientation: impl.isHorizontalOrientation ?? false,
      size: impl.size,
    };
  }, _.isEqual);

  const disablePointerEvents = useShouldDisablePointerEvents();
  const { ref: overflowRefInternal, isScrollable } = useIsScrollable();
  const { minHeight, maxHeight, minWidth, maxWidth } =
    useSectionMinMaxDims(sectionId);

  // Callback ref that registers the overflow element for scrollWidth reading
  const overflowRef = (element: HTMLDivElement | null) => {
    overflowRefInternal.current = element;
    if (element && overflowMode) {
      setSectionRef({ sectionId, overflowElement: element });
    }
  };
  let effectiveMinHeight = minHeight;
  let effectiveMinWidth = minWidth;
  if (overflowMode) {
    effectiveMinHeight = Math.max(effectiveMinHeight, GROUP_OVERFLOW_MIN_HEIGHT);
    effectiveMinWidth = Math.max(effectiveMinWidth, GROUP_OVERFLOW_MIN_WIDTH);
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
    // Set both dimensions - both axes are now resizable
    if (size.width !== "auto") {
      groupStyle.width = size.width;
    }
    if (size.height !== "auto") {
      groupStyle.height = size.height;
    }
  }

  let contentClassName = "z-10";
  if (overflowMode) {
    // Scroll axis: auto (allows scrolling when content exceeds container)
    // Cross axis: hidden (no scrollbar, but scrollWidth still reports actual content width
    // for getOverflowParentSizeUpdates to expand the group when sections are resized)
    const overflowAxisClassName = isHorizontalOrientation
      ? "overflow-x-auto overflow-y-hidden"
      : "overflow-y-auto overflow-x-hidden";

    // Padding to prevent scrollbar from crowding sections and outlines from being clipped
    const overflowPaddingClassName = isHorizontalOrientation
      ? "pb-4 -mb-4 pl-1 -ml-1" // Bottom for scrollbar, left for outline
      : "pr-4 -mr-4 pl-1 -ml-1"; // Right for scrollbar, left for outline

    contentClassName =
      `z-10 flex min-h-0 min-w-0 flex-1 flex-col ${overflowAxisClassName} ${overflowPaddingClassName}`.trim();
    if (isScrollable) {
      contentClassName = `${contentClassName} ${NO_WHEEL_CLASS_NAME}`;
    }
  }

  const heightResizable = effectiveMinHeight !== maxHeight;
  const widthResizable = effectiveMinWidth !== maxWidth;
  // In overflow mode, allow resizing on both axes:
  // - Scroll axis: controls how much content is visible before scrolling
  // - Cross axis: resizes group, and children conform to the new size
  const enableResize =
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

  function onResize(...props: unknown[]) {
    const [, direction, ref] = props as [
      unknown,
      string,
      HTMLDivElement | null,
    ];
    const nextSize = getGroupResizeSizeFromRef(ref);
    if (!nextSize) {
      return;
    }

    const resizeWidth = didResizeWidth(direction);
    const resizeHeight = didResizeHeight(direction);

    // Only update the group size during drag - sync children on stop to avoid rubber-banding
    useProjectState.setState((state) => {
      setSectionSize(sectionId, nextSize, state);
      if (resizeWidth) {
        applyOverflowParentSizeUpdates({
          sectionId,
          newWidth: nextSize.width,
          newHeight: undefined,
          state,
        });
      }
      if (resizeHeight) {
        applyOverflowParentSizeUpdates({
          sectionId,
          newWidth: undefined,
          newHeight: nextSize.height,
          state,
        });
      }
    });
  }

  function onResizeStop(...props: unknown[]) {
    const [, direction, ref] = props as [
      unknown,
      string,
      HTMLDivElement | null,
    ];
    const nextSize = getGroupResizeSizeFromRef(ref);
    const changedSize: Partial<SectionSize> = nextSize ?? {};
    const crossAxis = getCrossAxis(isHorizontalOrientation);
    const resizeWidth = didResizeWidth(direction);
    const resizeHeight = didResizeHeight(direction);
    const shouldSyncCrossAxis =
      crossAxis === "width" ? resizeWidth : resizeHeight;

    let updatedSectionSizes: Record<string, SectionSize> = {};
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const nextSize = setSectionSize(sectionId, changedSize, state);
        updatedSectionSizes = { [sectionId]: nextSize };
        if (shouldSyncCrossAxis) {
          const axisSize =
            crossAxis === "width" ? changedSize.width : changedSize.height;
          if (typeof axisSize === "number") {
            // Subtract container padding so children fit within group
            // Horizontal: px-6 = 48px
            // Vertical: pt-2 (8) + pb-6 (24) + header min-h-10 (40) + content pt-2 (8) = 80px
            const GROUP_HORIZONTAL_PADDING = 48;
            const GROUP_VERTICAL_PADDING = 80;
            const childAxisSize =
              crossAxis === "width"
                ? axisSize - GROUP_HORIZONTAL_PADDING
                : axisSize - GROUP_VERTICAL_PADDING;
            mergeSizeUpdates(
              updatedSectionSizes,
              setOverflowGroupCrossAxisSize({
                groupId: sectionId,
                axis: crossAxis,
                axisSize: childAxisSize,
                state,
                includeChildren: true,
                includeGroup: false,
              }),
            );
          }
        }
        if (resizeWidth) {
          mergeSizeUpdates(
            updatedSectionSizes,
            applyOverflowParentSizeUpdates({
              sectionId,
              newWidth: changedSize.width,
              newHeight: undefined,
              state,
            }),
          );
        }
        if (resizeHeight) {
          mergeSizeUpdates(
            updatedSectionSizes,
            applyOverflowParentSizeUpdates({
              sectionId,
              newWidth: undefined,
              newHeight: changedSize.height,
              state,
            }),
          );
        }
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

  // For overflow mode, constrain both axes since both are resizable
  const overflowContainerClassName = overflowMode
    ? "min-h-0 min-w-0 h-full w-full"
    : "";
  const containerClassName = `group/group-section flex min-w-[250px] flex-col items-stretch px-6 pb-6 pt-2 focus-visible:outline-none ${overflowContainerClassName} ${className}`;
  const dropAreaClassName =
    "z-10 mt-4 flex flex-row items-center justify-center rounded-xl border-4 border-dashed border-setta-300 px-4 py-3 text-sm text-setta-500/80 dark:border-setta-700 dark:text-setta-500 -mx-4";

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

      {/* In overflow mode, put drop area outside scroll container to prevent clipping */}
      {overflowMode && !hasNested && (
        <div className={dropAreaClassName}>Drop A Section Here.</div>
      )}

      <div className={contentClassName} ref={overflowRef}>
        {!overflowMode && !hasNested && (
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

  return (
    <ResizableWithScale
      className="relative"
      style={groupStyle}
      size={size}
      minHeight={effectiveMinHeight}
      maxHeight={maxHeight}
      minWidth={effectiveMinWidth}
      maxWidth={maxWidth}
      onResizeStart={onResizeStart}
      onResize={onResize}
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
