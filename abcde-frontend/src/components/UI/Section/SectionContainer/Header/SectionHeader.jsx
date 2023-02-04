import React from "react";
import { deleteChild } from "thunks/sections/deleteChild";
import { Incrementer } from "../Incrementer/Incrementer";
import { CustomCloseButton } from "./CustomCloseButton/CustomCloseButton";
import { SectionTitle } from "./Title/SectionTitle";

function _SectionHeader({
  sectionId,
  parentId,
  nextId,
  isSeriesElement,
  isRoot,
  hasNested,
}) {
  const onCustomCloseButtonClick = (e) => {
    // ignore onClick events in parent components
    // https://stackoverflow.com/questions/60811792/react-how-to-ignore-onclick-for-child-element
    e.stopPropagation();
    deleteChild({ parentId, startId: sectionId });
  };

  return (
    <div className="flex w-full flex-row items-center pl-3">
      <CardTitle sectionId={sectionId} />
      <div className="align-self-stretch flex-1 justify-self-stretch" />
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
      />
    </div>
  );
}

function CardTitle({ sectionId }) {
  const titleProps = {
    editing:
      "cursor-text nodrag h-6 font-heading font-bold px-2 py-0 -ml-2 bg-slate-200 rounded-full w-full",
    notEditing: "font-heading cursor-pointer font-bold",
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}

export const SectionHeader = React.memo(_SectionHeader);
