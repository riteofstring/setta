import React from "react";
import { deleteSections } from "thunks/sections/sectionOps";
import { isRoot } from "z_utils/constants";
import { Incrementer } from "../Incrementer/Incrementer";
import { CustomCloseButton } from "./CustomCloseButton/CustomCloseButton";
import { HeaderIcon } from "./HeaderIcon/HeaderIcon";
import MenuButton from "./MenuButton/MenuButton";
import { MinimizeButton } from "./MinimizeButton/MinimizeButton";
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
  const classes =
    "text-runcoder-400/50 dark:text-runcoder-400/50 mr-[.35rem] ml-[.1rem]";

  // DOM: maybe get rid of the extra div under header?

  return (
    <header className="card-title flex flex-row items-center">
      {!isInfo && (
        <>
          <MenuButton sectionId={sectionId} />
          <HeaderIcon
            sectionId={sectionId}
            sectionTypeName={sectionTypeName}
            classes={classes}
          />
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
      {(isSeriesElement || _isRoot) && (
        <Incrementer sectionId={sectionId} isRoot={_isRoot} />
      )}

      <div
        className={
          isInfo ? "absolute right-2 top-[.3rem] z-10" : "absolute right-2 z-10"
        }
      >
        <MinimizeButton />
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
      titleProps={getTitleStyles({ isActiveSection, isGlobalVariables })}
    />
    // </div>
  );
}

export const SectionHeader = React.memo(_SectionHeader);

function getTitleStyles({ isActiveSection, isGlobalVariables }) {
  const editing =
    "cursor-text font-heading nodrag px-2 py-0 leading-5 -ml-2 bg-runcoder-200 dark:bg-runcoder-900 rounded-full w-3/5 dark:text-white font-semibold text-[.7rem] tracking-tight";

  const notEditing = `transition-colors font-heading leading-5 tracking-tight cursor-pointer max-w-full text-[.7rem] truncate ${
    isActiveSection
      ? isGlobalVariables
        ? "text-green-800 dark:text-green-200"
        : "text-blue-800 dark:text-blue-400"
      : "text-runcoder-700 dark:text-runcoder-300"
  } ${isGlobalVariables ? "uppercase font-bold" : "font-bold"}`;

  if (isGlobalVariables) {
    return { fixed: notEditing };
  }

  const fixed =
    "select-none italic font-heading tracking-tighter text-xs text-runcoder-400";

  return { editing, notEditing, fixed };
}
