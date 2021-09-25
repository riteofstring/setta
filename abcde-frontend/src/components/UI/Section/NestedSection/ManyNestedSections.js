import React from "react";
import { DNDSortable } from "../../../../utils/DNDSortable/DNDSortable";
import { NestedSection, SortableNestedSection } from "./NestedSection";

export default function ManyNestedSections({
  childIds,
  sectionId,
  childSectionInfo,
  available,
  parentControls,
  depth,
  isCollapsed,
  setIdsOverview,
  setIdNames,
  setChildren,
}) {
  const isList = Object.values(childSectionInfo)[0].isList;

  const getNestedSections = () => {
    const componentType = isList ? SortableNestedSection : NestedSection;
    return childIds.map((e, idx) =>
      React.createElement(componentType, {
        parentId: sectionId,
        sectionId: e,
        nextId: childIds[idx + 1],
        sectionInfo: childSectionInfo[e],
        available,
        parentControls,
        idx,
        key: `Nested-Sec-${e}`,
        depth: depth + 1,
        isCollapsed,
        setIdsOverview,
        setIdNames,
      })
    );
  };

  return isList ? (
    <DNDSortable items={childIds} setItems={setChildren}>
      {getNestedSections()}
    </DNDSortable>
  ) : (
    getNestedSections()
  );
}
