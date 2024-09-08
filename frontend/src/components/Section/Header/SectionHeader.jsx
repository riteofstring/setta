import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { StandardPopover } from "components/Utils/atoms/popover/standardpopover";
import C from "constants/constants.json";
import React from "react";
import { TbSortDescending2 } from "react-icons/tb";
import { deleteSections } from "state/actions/sections/deleteSections";
import { useIsSeriesElement, useSectionTypeName } from "state/hooks/uiTypes";
import { isRoot } from "utils/sectionTypeHelpers";
import { Incrementer } from "../SectionParts/Incrementer";
import { CustomCloseButton } from "./CustomCloseButton";
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
}) {
  const onCustomCloseButtonClick = (e) => {
    // ignore onClick events in parent components
    // https://stackoverflow.com/questions/60811792/react-how-to-ignore-onclick-for-child-element
    e.stopPropagation();
    deleteSections({ sectionIds: [sectionId], incrementVersion: true });
  };

  const _isRoot = isRoot(sectionTypeName);
  const isSeriesElement = useIsSeriesElement(sectionId);

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
          />
        </>
      )}

      <div
        className={
          isInfo
            ? "absolute right-2 top-[.3rem] z-10"
            : "z-10 ml-auto flex items-center"
        }
      >
        {isSeriesElement && (
          <StandardPopover
            popoverContent={
              <Incrementer
                sectionId={sectionId}
                isRoot={_isRoot}
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
            header={"Description for Infoview"}
          />
        )}
        <MinimizeButton sectionId={sectionId} />
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
        sectionId,
        isInOtherProjectConfigs,
      })}
    />
    // </div>
  );
}

export const SectionHeader = React.memo(_SectionHeader);

function getTitleStyles({
  isActiveSection,
  isGlobalVariables,
  sectionId,
  isInOtherProjectConfigs,
}) {
  const sectionTypeName = useSectionTypeName(sectionId);
  const editing =
    "cursor-text font-heading nodrag px-2 py-0 leading-5 -ml-2 bg-setta-200 dark:bg-setta-900 rounded-full w-3/5 dark:text-white font-semibold text-[.7rem] tracking-tight";

  const notEditing = `transition-colors font-heading leading-5 tracking-tight cursor-pointer max-w-full text-[.7rem] truncate ${
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
    "select-none italic font-heading tracking-tighter text-xs text-setta-400";

  return { editing, notEditing, fixed };
}
