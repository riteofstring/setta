import React from "react";
import { IoLogoJavascript } from "react-icons/io";
import { SiGnubash, SiPython } from "react-icons/si";
import { deleteChild } from "thunks/sections/deleteChild";
import { isRoot } from "z_utils/constants";
import { Incrementer } from "../Incrementer/Incrementer";
import { CustomCloseButton } from "./CustomCloseButton/CustomCloseButton";
import MenuButton from "./MenuButton/MenuButton";
import { SectionTitle } from "./Title/SectionTitle";

function _SectionHeader({
  sectionId,
  parentId,
  nextId,
  isSeriesElement,
  hasNested,
  isActiveSection,
  sectionTypeName,
  isGlobalVariables,
  isInfo,
}) {
  const onCustomCloseButtonClick = (e) => {
    // ignore onClick events in parent components
    // https://stackoverflow.com/questions/60811792/react-how-to-ignore-onclick-for-child-element
    e.stopPropagation();
    deleteChild({ parentId, startId: sectionId, incrementVersion: true });
  };

  const _isRoot = isRoot(sectionTypeName);
  const classes = "text-runcoder-400/50 dark:text-runcoder-400/50 ml-2";

  // DOM: maybe get rid of the extra div under header?

  return (
    <header className="card-title flex flex-row items-center">
      {!isInfo && (
        <>
          <CardTitle
            sectionId={sectionId}
            isActiveSection={isActiveSection}
            isGlobalVariables={isGlobalVariables}
          />
          {sectionTypeName === "CODE" && <SiPython className={classes} />}
          {sectionTypeName === "SCRIPT" && <SiGnubash className={classes} />}
          {sectionTypeName === "VAR_CONTROL" && (
            <IoLogoJavascript className={classes} />
          )}

          <MenuButton sectionId={sectionId} />
        </>
      )}
      {(isSeriesElement || _isRoot) && (
        <Incrementer
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          isRoot={_isRoot}
          hasNested={hasNested}
        />
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

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}

export const SectionHeader = React.memo(_SectionHeader);
