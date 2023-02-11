import React from "react";
import { Incrementer } from "../Incrementer/Incrementer";
import { SectionTitle } from "./Title/SectionTitle";

function _SectionHeader({
  sectionId,
  parentId,
  nextId,
  isSeriesElement,
  isRoot,
  hasNested,
}) {
  return (
    <div className="flex w-full flex-row items-center px-9">
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
