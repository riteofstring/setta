import _ from "lodash";
import React from "react";

import { getCurrEffectiveSectionImplOfType } from "state/actions/sectionInfos";
import { useIsSectionUIActive } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import { SectionTypeEnum } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import { ChangeOrientationButton } from "../Header/ChangeOrientationButton";
import { DeleteOrHideButton } from "../Header/DeleteOrHideButton";
import { LockPositionButton } from "../Header/LockPositionButton";
import MenuButton from "../Header/MenuButton/MenuButton";
import { SectionTitle } from "../Header/SectionTitle";
import { getOnSectionClick, getOutlineColor } from "./utils";

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
  sectionRefMode = "withNested",
  children,
}) {
  const refForPosition = useSectionRefAndInit(sectionId, sectionRefMode);

  function totalRef(element: HTMLDivElement | null) {
    refForPosition.current = element;
    if (droppableRef) {
      droppableRef(element);
    }
    if (draggableRef) {
      draggableRef(element);
    }
  }

  const commonProps = { ref: totalRef, ...trueDragListeners };

  return isGroup ? (
    <ContainerGroup
      sectionId={sectionId}
      commonProps={commonProps}
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
      tabIndex={-1} // keeps section focusable for programmatic focus
    >
      {children}
    </div>
  );
}

export const Container = React.memo(_Container, _.isEqual);

function ContainerGroup({
  sectionId,
  commonProps,
  isEditingViewMode,
  isUserView,
  className,
  style,
  children,
}) {
  const {
    hasNested,
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
      hasNested: impl.children.length > 0,
      positionAndSizeLocked: impl.positionAndSizeLocked,
      isInOtherProjectConfigs: impl.isInOtherProjectConfigs,
      overflowMode: impl.overflowMode ?? false,
      size: impl.size,
    };
  }, shallow);
  const isActiveSection = useIsSectionUIActive(sectionId);

  const disablePointerEvents = useShouldDisablePointerEvents();
  const outlineColor = getOutlineColor({
    isActiveSection,
    isInOtherProjectConfigs,
  });
  const pointerSelectClassName =
    getPointerSelectClassName(disablePointerEvents);
  const groupStyle = getGroupStyle(style, overflowMode, size);
  const contentClassName = getContentClassName(overflowMode);
  const rootClassName = getGroupRootClassName(overflowMode, className);
  const outlineClassName = getGroupOutlineClassName(
    positionAndSizeLocked,
    outlineColor,
  );

  return (
    <div
      className={rootClassName}
      {...commonProps}
      onClick={getOnSectionClick(sectionId)}
      tabIndex={-1} // keeps section focusable for programmatic focus
      style={groupStyle}
    >
      <div className={outlineClassName} />
      <GroupHeader
        sectionId={sectionId}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        pointerSelectClassName={pointerSelectClassName}
        isUserView={isUserView}
        isEditingViewMode={isEditingViewMode}
      />

      <div className={contentClassName}>
        <EmptyGroupDropHint hasNested={hasNested} />
        {children}
      </div>
    </div>
  );
}

function getPointerSelectClassName(disablePointerEvents: boolean) {
  // Apply this only to the group title.
  // For sections, this is applied in SectionContainerCore.
  // We want to apply this lower down in the component tree, because dnd needs onPointerDown to work.
  return disablePointerEvents ? "pointer-events-none select-none" : "";
}

function getGroupStyle(
  style: React.CSSProperties | undefined,
  overflowMode: boolean,
  size: { width: string | number; height: string | number },
) {
  const groupStyle = { ...(style ?? {}) };
  if (!overflowMode) {
    return groupStyle;
  }
  if (size.width !== "auto") {
    groupStyle.width = size.width;
  }
  if (size.height !== "auto") {
    groupStyle.height = size.height;
  }
  return groupStyle;
}

function getContentClassName(overflowMode: boolean) {
  if (!overflowMode) {
    return "z-10";
  }
  return "z-10 mt-2 flex min-h-0 min-w-0 flex-1 flex-col";
}

function getGroupRootClassName(
  overflowMode: boolean,
  className: string | undefined,
) {
  return `group/group-section flex min-w-[250px] flex-col items-stretch px-6 pb-6 pt-2 focus-visible:outline-none ${
    overflowMode ? "min-h-0 min-w-0" : ""
  } ${className ?? ""}`;
}

function getGroupOutlineClassName(
  positionAndSizeLocked: boolean,
  outlineColor: string,
) {
  const lockClassName = positionAndSizeLocked
    ? "rounded-sm border-setta-400/90 dark:border-setta-975/35"
    : "rounded-3xl border-setta-50/50 dark:border-setta-700";
  return `outline outline-4 ${outlineColor} transition-radius absolute left-0 right-0 top-0 z-0 h-full w-full ${lockClassName}  border border-solid  bg-setta-100/40 outline outline-2 outline-transparent   dark:bg-setta-860/50`;
}

function GroupHeader({
  sectionId,
  isInOtherProjectConfigs,
  pointerSelectClassName,
  isUserView,
  isEditingViewMode,
}: {
  sectionId: string;
  isInOtherProjectConfigs: boolean;
  pointerSelectClassName: string;
  isUserView: boolean;
  isEditingViewMode: boolean;
}) {
  return (
    <div className="z-10 flex min-h-10 w-full items-center">
      <MenuButton
        sectionId={sectionId}
        sectionTypeName={SectionTypeEnum.Group}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        hasSectionStyleTheme={false}
      />
      <div
        className={`${pointerSelectClassName} relative my-auto mr-2 flex min-h-10 w-full items-center overflow-hidden`}
      >
        <GroupSectionTitle sectionId={sectionId} />
      </div>
      <GroupHeaderActions
        sectionId={sectionId}
        isUserView={isUserView}
        isEditingViewMode={isEditingViewMode}
      />
    </div>
  );
}

function GroupHeaderActions({
  sectionId,
  isUserView,
  isEditingViewMode,
}: {
  sectionId: string;
  isUserView: boolean;
  isEditingViewMode: boolean;
}) {
  if (isUserView) {
    return null;
  }
  return (
    <div className="z-10 ml-auto flex items-center">
      <ChangeOrientationButton sectionId={sectionId} />
      <LockPositionButton sectionId={sectionId} />
      <DeleteOrHideButton
        sectionId={sectionId}
        size={`min-w-4 h-4 ${isEditingViewMode ? "scale-120" : "scale-150"}  `}
      />
    </div>
  );
}

function EmptyGroupDropHint({ hasNested }: { hasNested: boolean }) {
  if (hasNested) {
    return null;
  }
  return (
    <div className="z-10 -mx-4 mt-4 flex flex-row items-center justify-center rounded-xl border-4 border-dashed border-setta-300 px-4 py-3 text-sm text-setta-500/80 dark:border-setta-700 dark:text-setta-500">
      Drop A Section Here.
    </div>
  );
}

function GroupSectionTitle({ sectionId }) {
  const titleProps = {
    editing:
      "nodrag cursor-text box-border px-1 focus-visible:ring-0 focus-visible:outline-none focus-visible:border-blue-500 rounded-lg border border-solid border-transparent w-full tracking-tighter text-setta-500 dark:text-setta-500 flex-shrink",

    notEditing:
      "cursor-pointer box-border px-1 focus-visible:ring-0 focus-visible:outline-none focus-visible:border-blue-500 rounded-lg border border-solid border-transparent w-full truncate tracking-tighter text-setta-500 dark:text-setta-500 flex-shrink",
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}
