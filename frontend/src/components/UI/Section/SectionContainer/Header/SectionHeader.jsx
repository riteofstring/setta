import React from "react";
import { FaTerminal } from "react-icons/fa";
import { IoLogoJavascript } from "react-icons/io";
import { SiGnubash, SiPython } from "react-icons/si";
import { deleteSections } from "thunks/sections/sectionOps";
import { isRoot } from "z_utils/constants";
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
  const classes = "text-runcoder-400/50 dark:text-runcoder-400/50 mr-2";

  // DOM: maybe get rid of the extra div under header?

  return (
    <header className="card-title flex flex-row items-center">
      {!isInfo && (
        <>
          {sectionTypeName === "CODE" && <SiPython className={classes} />}
          {sectionTypeName === "SCRIPT" && <SiGnubash className={classes} />}
          {sectionTypeName === "VAR_CONTROL" && (
            <IoLogoJavascript className={classes} />
          )}
          {sectionTypeName === "TERMINAL" && <FaTerminal className={classes} />}

          <CardTitle
            sectionId={sectionId}
            isActiveSection={isActiveSection}
            isGlobalVariables={isGlobalVariables}
          />

          <MenuButton sectionId={sectionId} />
        </>
      )}
      {(isSeriesElement || _isRoot) && (
        <Incrementer sectionId={sectionId} isRoot={_isRoot} />
      )}

      <CustomCloseButton
        onClick={onCustomCloseButtonClick}
        aria-label="Delete self"
        data-testid={`Delete ${sectionId}`}
        isInfo={isInfo}
      />
    </header>
  );
}

function CardTitle({ sectionId, isActiveSection, isGlobalVariables }) {
  // const isSearchResult = useProjectSearch((x) =>
  //   x.sections.includes(sectionId)
  // );

  const titleProps = {
    editing: `cursor-text nodrag h-6 font-heading px-2 py-0 -ml-2 bg-runcoder-200 rounded-full w-full ${
      isGlobalVariables
        ? "uppercase font-black tracking-widest"
        : "font-semibold"
    }`,
    notEditing: `transition-colors font-heading cursor-pointer max-w-full truncate ${
      isActiveSection
        ? isGlobalVariables
          ? "text-green-800 dark:text-green-200"
          : "text-blue-800 dark:text-blue-400"
        : "text-runcoder-700 dark:text-runcoder-300"
    } ${isGlobalVariables ? "uppercase font-bold" : "font-semibold"}`,
  };

  return (
    // <div className={`${isSearchResult ? "outline outline-green-400" : ""}`}>
    <SectionTitle sectionId={sectionId} titleProps={titleProps} />
    // </div>
  );
}

export const SectionHeader = React.memo(_SectionHeader);
