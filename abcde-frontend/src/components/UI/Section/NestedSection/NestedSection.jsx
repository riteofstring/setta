import React from "react";
import { SortableSectionContainer } from "../SectionContainer/SortableSectionContainer";

function _NestedSection({ parentId, sectionId, nextId, depth }) {
  return (
    <SortableSectionContainer
      sectionId={sectionId}
      parentId={parentId}
      nextId={nextId}
      depth={depth}
    />
  );
}

export const NestedSection = React.memo(_NestedSection);
