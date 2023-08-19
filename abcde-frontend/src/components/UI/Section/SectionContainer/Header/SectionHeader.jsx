import { useIsInfo } from "hooks/useSectionType";
import React from "react";
import { deleteChild } from "thunks/sections/deleteChild";
import { Incrementer } from "../Incrementer/Incrementer";
import { CustomCloseButton } from "./CustomCloseButton/CustomCloseButton";
import { SaveButton } from "./SaveButton/SaveButton";
import { SectionTitle } from "./Title/SectionTitle";

function _SectionHeader({
  sectionId,
  parentId,
  nextId,
  isSeriesElement,
  isRoot,
  hasNested,
  isActiveSection,
}) {
  const isInfo = useIsInfo(sectionId);
  const onCustomCloseButtonClick = (e) => {
    // ignore onClick events in parent components
    // https://stackoverflow.com/questions/60811792/react-how-to-ignore-onclick-for-child-element
    e.stopPropagation();
    deleteChild({ parentId, startId: sectionId, incrementVersion: true });
  };

  // DOM: maybe get rid of the extra div under header?

  return (
    <header className="flex flex-row items-center px-9">
      {!isInfo && (
        <div className="align-self-stretch flex w-full flex-1 items-center gap-1 justify-self-stretch ">
          <CardTitle sectionId={sectionId} isActiveSection={isActiveSection} />
          <SaveButton sectionId={sectionId} />
        </div>
      )}
      {(isSeriesElement || isRoot) && (
        <Incrementer
          sectionId={sectionId}
          parentId={parentId}
          nextId={nextId}
          isRoot={isRoot}
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

function CardTitle({ sectionId, isActiveSection }) {
  const titleProps = {
    editing:
      "cursor-text nodrag h-6 font-heading font-semibold px-2 py-0 -ml-2 bg-slate-200 rounded-full w-full",
    notEditing: `transition-colors font-heading cursor-pointer font-semibold max-w-full truncate ${
      isActiveSection ? "text-blue-800" : "text-slate-700"
    }`,
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}

export const SectionHeader = React.memo(_SectionHeader);
