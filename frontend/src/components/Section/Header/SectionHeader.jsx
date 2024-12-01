import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import C from "constants/constants.json";
import React from "react";
import { TbSortDescending2 } from "react-icons/tb";
import { deleteSections } from "state/actions/sections/deleteSections";
import { useSectionInfos } from "state/definitions";
import { useIsSeriesElement } from "state/hooks/uiTypes";
import { Incrementer } from "../SectionParts/Incrementer";
import { CustomCloseButton } from "./CustomCloseButton";
import { LockPositionButton } from "./LockPositionButton";
import MenuButton from "./MenuButton/MenuButton";
import { MinimizeButton } from "./MinimizeButton";
import { SectionTitle } from "./SectionTitle";

function _SectionHeader({
  sectionId,
  isActiveSection,
  sectionTypeName,
  isGlobalVariables,
  isInfo,
  isInOtherProjectConfigs,
  isRoot,
}) {
  const onCustomCloseButtonClick = (e) => {
    // ignore onClick events in parent components
    // https://stackoverflow.com/questions/60811792/react-how-to-ignore-onclick-for-child-element
    e.stopPropagation();
    useSectionInfos.setState((state) => {
      deleteSections([sectionId], state);
    });
  };

  const isSeriesElement = useIsSeriesElement(sectionId) && !isRoot;

  // DOM: maybe get rid of the extra div under header?

  return (
    <header className="section-title mx-2 flex flex-row items-center">
      <MenuButton
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
      />
      {!isInfo && (
        <>
          <CardTitle
            sectionId={sectionId}
            isActiveSection={isActiveSection}
            isGlobalVariables={isGlobalVariables}
            isInOtherProjectConfigs={isInOtherProjectConfigs}
            sectionTypeName={sectionTypeName}
          />
        </>
      )}

      <div className="z-10 ml-auto flex items-center">
        {isSeriesElement && (
          <StandardPopover
            popoverContent={
              <Incrementer
                sectionId={sectionId}
                isRoot={isRoot}
                popover={true}
              />
            }
            arrowClasses="fill-white dark:fill-setta-800"
            inputClasses="rounded-lg"
            trigger={
              <IconButton
                twClasses="[&_*]:hover:text-setta-500 [&_*]:dark:hover:text-setta-400"
                bg="bg-transparent"
              >
                <TbSortDescending2 className="text-setta-300 dark:text-setta-700" />
              </IconButton>
            }
          />
        )}
        <LockPositionButton sectionId={sectionId} />
        {!isRoot && <MinimizeButton sectionId={sectionId} />}
        <CustomCloseButton onClick={onCustomCloseButtonClick} isInfo={isInfo} />
      </div>
    </header>
  );
}

function CardTitle({
  sectionId,
  isActiveSection,
  isGlobalVariables,
  isInOtherProjectConfigs,
  sectionTypeName,
}) {
  // const isSearchResult = useProjectSearch((x) =>
  //   x.sections.includes(sectionId)
  // );

  return (
    // <div className={`${isSearchResult ? "outline outline-green-400" : ""}`}>
    <SectionTitle
      sectionId={sectionId}
      titleProps={getTitleStyles({
        isActiveSection,
        isGlobalVariables,
        isInOtherProjectConfigs,
        sectionTypeName,
      })}
    />
    // </div>
  );
}

export const SectionHeader = React.memo(_SectionHeader);

function getTitleStyles({
  isActiveSection,
  isGlobalVariables,
  isInOtherProjectConfigs,
  sectionTypeName,
}) {
  const editing =
    "cursor-text nodrag px-2 py-0 leading-5 -ml-2 bg-setta-100 dark:bg-setta-800 rounded-full w-3/5 dark:text-white font-semibold text-[.7rem] tracking-tight";

  const notEditing = `transition-colors  leading-5 tracking-tight cursor-pointer max-w-full text-[.7rem] truncate ${
    isActiveSection
      ? isInOtherProjectConfigs
        ? "text-purple-800 dark:text-purple-200"
        : isGlobalVariables
          ? "text-green-800 dark:text-green-200"
          : sectionTypeName === C.TERMINAL
            ? "text-blue-400"
            : "text-blue-600 dark:text-blue-400"
      : sectionTypeName === C.TERMINAL
        ? "text-setta-300"
        : "text-setta-700 dark:text-setta-300"
  } ${isGlobalVariables ? "uppercase font-bold" : "font-bold"}`;

  if (isGlobalVariables) {
    return { fixed: notEditing };
  }

  const fixed =
    "select-none italic  tracking-tighter text-xs text-setta-400 max-w-full truncate pr-0.5";

  return { editing, notEditing, fixed };
}
