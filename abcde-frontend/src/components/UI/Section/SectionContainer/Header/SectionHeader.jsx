import React from "react";
import { deleteChild } from "thunks/deleteChild";
import Incrementer from "../Incrementer/Incrementer";
import CustomCloseButton from "./CustomCloseButton/CustomCloseButton";
import SectionTitle from "./Title/SectionTitle";

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
    deleteChild({ sectionId: parentId, startId: sectionId });
  };

  return (
    <div className="flex flex-row items-center w-full pl-3">
      <CardTitle sectionId={sectionId} />
      <div className="flex-1 justify-self-stretch align-self-stretch" />
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
      "cursor-text nodrag h-6 font-heading font-bold px-2 py-0 -ml-2 bg-gray-200 rounded-full w-full",
    notEditing: "font-heading cursor-pointer font-bold",
  };

  return <SectionTitle sectionId={sectionId} titleProps={titleProps} />;
}

export const SectionHeader = React.memo(_SectionHeader);
