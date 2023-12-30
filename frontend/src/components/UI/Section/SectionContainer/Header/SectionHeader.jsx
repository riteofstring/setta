import React from "react";
import { deleteChild } from "thunks/sections/deleteChild";
import { isRoot } from "z_utils/constants";
import { Incrementer } from "../Incrementer/Incrementer";
import { ChainButton } from "./ChainButton/ChainButton";
import { CustomCloseButton } from "./CustomCloseButton/CustomCloseButton";
import { SaveButton } from "./SaveButton/SaveButton";
import { SectionTitle } from "./Title/SectionTitle";
import { VersionsButton } from "./VersionsButton/VersionsButtons";

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

  // DOM: maybe get rid of the extra div under header?

  return (
    <header className="flex flex-row items-center px-7">
      {!isInfo && (
        <section className="align-self-stretch flex w-full flex-1 items-center gap-[0.1rem]">
          <CardTitle
            sectionId={sectionId}
            isActiveSection={isActiveSection}
            isGlobalVariables={isGlobalVariables}
          />

          <SaveButton sectionId={sectionId} />
          <ChainButton sectionId={sectionId} />
          <VersionsButton sectionId={sectionId} />
        </section>
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
    editing: `cursor-text nodrag h-6 font-heading px-2 py-0 -ml-2 bg-slate-200 rounded-full w-full ${
      isGlobalVariables
        ? "uppercase font-black tracking-widest"
        : "font-semibold"
    }`,
    notEditing: `transition-colors font-heading cursor-pointer max-w-full truncate ${
      isActiveSection
        ? isGlobalVariables
          ? "text-green-800 dark:text-green-200"
          : "text-blue-800 dark:text-blue-400"
        : "text-slate-700 dark:text-runcoder-300"
    } ${isGlobalVariables ? "uppercase font-bold" : "font-semibold"}`,
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}

export const SectionHeader = React.memo(_SectionHeader);
