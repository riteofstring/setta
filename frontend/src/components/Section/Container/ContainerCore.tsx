import _ from "lodash";
import React from "react";

import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { NO_WHEEL_CLASS_NAME } from "utils/constants";
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
      size: impl.size,
    };
  }, _.isEqual);

  const disablePointerEvents = useShouldDisablePointerEvents();
  const { ref: overflowRef, isScrollable } = useIsScrollable();

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
  if (overflowMode && size.width !== "auto") {
    groupStyle.width = size.width;
  }
  if (overflowMode && size.height !== "auto") {
    groupStyle.height = size.height;
  }

  let contentClassName = "z-10";
  if (overflowMode) {
    contentClassName =
      "z-10 mt-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-auto";
    if (isScrollable) {
      contentClassName = `${contentClassName} ${NO_WHEEL_CLASS_NAME}`;
    }
  }

  return (
    <div
      className={`group/group-section flex min-w-[250px] flex-col items-stretch px-6 pb-6 pt-2 focus-visible:outline-none ${
        overflowMode ? "min-h-0 min-w-0" : ""
      } ${className}`}
      {...commonProps}
      onClick={getOnSectionClick(sectionId, isActiveSection)}
      onKeyDown={(e) =>
        sectionContainerCoreOnKeyDown(e, refForPosition, sectionId)
      }
      tabIndex={-1} // needed so that onKeyDown works
      style={groupStyle}
    >
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
          <div className="z-10 -mx-4 mt-4 flex flex-row items-center justify-center rounded-xl border-4 border-dashed border-setta-300 px-4 py-3 text-sm text-setta-500/80 dark:border-setta-700 dark:text-setta-500">
            Drop A Section Here.
          </div>
        )}
        {children}
      </div>
    </div>
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
