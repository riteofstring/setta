import C from "constants/constants.json";
import React from "react";
import { TbSortDescending2 } from "react-icons/tb";
import { deleteSections } from "state/actions/sectionOps";
import { useSectionTypeName } from "state/hooks";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { StandardPopover } from "utils/atoms/popover/standardpopover";
import { isRoot } from "utils/sectionTypeHelpers";
import { Incrementer } from "../Incrementer/Incrementer";
import { CustomCloseButton } from "./CustomCloseButton/CustomCloseButton";
import MenuButton from "./MenuButton/MenuButton";
import { SectionTitle } from "./Title/SectionTitle";

function _SectionHeader({
  sectionId,
  isSeriesElement,
  isActiveSection,
  sectionTypeName,
  isGlobalVariables,
  isInfo,
}) {
  const onCustomCloseButtonClick = (e) => {
    // ignore onClick events in parent components
    // https://stackoverflow.com/questions/60811792/react-how-to-ignore-onclick-for-child-element
    e.stopPropagation();
    deleteSections({ sectionIds: [sectionId], incrementVersion: true });
  };

  const _isRoot = isRoot(sectionTypeName);

  // DOM: maybe get rid of the extra div under header?

  return (
    <header className="card-title flex flex-row items-center">
      {!isInfo && (
        <>
          <MenuButton sectionId={sectionId} sectionTypeName={sectionTypeName} />

          <CardTitle
            sectionId={sectionId}
            isActiveSection={isActiveSection}
            isGlobalVariables={isGlobalVariables}
          />

          {/* <CodeLanguageSelection
            sectionId={sectionId}
            sectionTypeName={sectionTypeName}
          /> */}
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
        {/* <MinimizeButton /> */}
        <CustomCloseButton
          onClick={onCustomCloseButtonClick}
          aria-label="Delete self"
          data-testid={`Delete ${sectionId}`}
          isInfo={isInfo}
        />
      </div>
    </header>
  );
}

function CardTitle({ sectionId, isActiveSection, isGlobalVariables }) {
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
      })}
    />
    // </div>
  );
}

export const SectionHeader = React.memo(_SectionHeader);

function getTitleStyles({ isActiveSection, isGlobalVariables, sectionId }) {
  const sectionTypeName = useSectionTypeName(sectionId);
  const editing =
    "cursor-text font-heading nodrag px-2 py-0 leading-5 -ml-2 bg-setta-200 dark:bg-setta-900 rounded-full w-3/5 dark:text-white font-semibold text-[.7rem] tracking-tight";

  const notEditing = `transition-colors font-heading leading-5 tracking-tight cursor-pointer max-w-full text-[.7rem] truncate ${
    isActiveSection
      ? isGlobalVariables
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
