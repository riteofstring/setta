import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import _ from "lodash";
import React from "react";
import { FaLayerGroup } from "react-icons/fa6";
import { openGroupContextMenu } from "state/actions/contextMenus";
import { useActiveSection, useSectionInfos } from "state/definitions";
import { useShouldDisablePointerEvents } from "state/hooks/keyActivations";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import { sectionContainerCoreOnKeyDown } from "utils/tabbingLogic";
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
      tabIndex="-1" // needed so that onKeyDown works
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
  className,
  style,
  children,
}) {
  const hasNested = useHasTempNested(sectionId);
  const isActiveSection = useActiveSection((x) => x.ids.includes(sectionId));
  const isInOtherProjectConfigs = useSectionInfos(
    (x) => x.x[sectionId].isInOtherProjectConfigs,
  );
  const disablePointerEvents = useShouldDisablePointerEvents();

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

  const triggerClass =
    "nodrag w-[14px] h-[14px] flex cursor-pointer select-none items-center justify-center rounded-full p-1 mr-1 -ml-0.5 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800 [&_*]:data-[state=open]:!text-setta-300 dark:[&_*]:data-[state=open]:!text-setta-500";

  return (
    <div
      className={`group/group-section flex min-w-[250px] flex-col items-stretch px-6 pb-6 pt-3 focus-visible:outline-none ${className}`}
      {...commonProps}
      onContextMenu={(e) => openGroupContextMenu(e, sectionId)}
      onClick={getOnSectionClick(sectionId, isActiveSection)}
      onKeyDown={(e) =>
        sectionContainerCoreOnKeyDown(e, refForPosition, sectionId)
      }
      tabIndex="-1" // needed so that onKeyDown works
      style={style}
    >
      <div
        className={`outline outline-4 ${outlineColor} absolute left-0 right-0 top-0 z-0 h-full w-full rounded-3xl border border-solid border-[#ffffff62] bg-[#515f7056] outline  outline-2 outline-transparent  dark:border-setta-700 dark:bg-setta-950/30`}
      />
      <div className="flex min-h-8 w-full items-center">
        <button className={triggerClass}>
          <FaLayerGroup className="text-setta-500 transition-colors group-hover/group-section:text-blue-600 dark:text-setta-500  dark:group-hover/group-section:text-[#0084ff]" />
        </button>
        <div
          className={`${pointerSelectCSS}relative min-h-8 w-full overflow-hidden`}
        >
          <GroupSectionTitle sectionId={sectionId} />
        </div>
        <div className="z-10 ml-auto flex items-center">
          <IconButton
            icon={<i className="gg-lock mt-4 !scale-[.4]" />}
            color="text-setta-600 hover:text-orange-500 dark:hover:text-orange-700"
            bg="bg-transparent justify-content-center mr-1"
            size="w-4 h-4"
            padding="p-0"
          />
        </div>
      </div>

      {!hasNested && (
        <div className="z-10 -mx-4 mt-4 flex flex-row items-center justify-center rounded-xl border-4 border-dashed border-setta-300 px-4 py-3 text-setta-300 dark:border-setta-800 dark:text-white">
          Drop A Section Here.
        </div>
      )}

      {children}
    </div>
  );
}

function GroupSectionTitle({ sectionId }) {
  const titleProps = {
    editing:
      "absolute cursor-pointer w-full text-xl font-bold tracking-tighter text-setta-100 dark:text-setta-600 cursor-pointer flex-shrink",

    notEditing:
      "absolute cursor-pointer w-full truncate text-xl font-bold tracking-tighter text-setta-100 dark:text-setta-600 cursor-pointer flex-shrink",
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}
