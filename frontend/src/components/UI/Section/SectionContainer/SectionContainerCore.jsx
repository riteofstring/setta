import { toggleSectionDescription } from "hooks/useSectionDescription";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useIsSeriesElement, useSectionTypeName } from "hooks/useSectionType";
import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import { useSectionInfos } from "models/info/sectionInfos";
import React from "react";
import { multiSectionSelect } from "thunks/keyActivations";
import { setZIndices } from "thunks/sections/sectionPositions";
import { getHighestAncestor } from "thunks/sections/sectionSizes";
import "./dndline.css";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";

function _SectionContainerCore({ sectionId, parentId, nextId, hasNested }) {
  const sectionTypeName = useSectionTypeName(sectionId);
  const isSeriesElement = useIsSeriesElement(sectionId);
  const isActiveSection = useActiveSection((x) => x.ids.includes(sectionId));
  const sectionIsFrozen = useGetSectionInfo(sectionId, "isFrozen");

  function onClick(e) {
    if (multiSectionSelect(e)) {
      useActiveSection.getState().addIds([sectionId]);
    } else {
      useActiveSection.getState().setIds([sectionId]);
    }
    const topMostAncestor = getHighestAncestor(sectionId);
    setZIndices([useSectionInfos.getState().x[topMostAncestor]], false);
  }

  const boxShadow = isActiveSection
    ? "shadow-2xl"
    : "shadow-md active:shadow-2xl";

  return (
    <section
      className={`rounded-xl border border-white bg-white dark:border-runcoder-700 dark:bg-runcoder-900 ${boxShadow} dndline w-min [transition:_box-shadow_500ms_ease]`}
      onClick={onClick}
      data-testid={`${sectionId} section core`}
    >
      <SectionContainerCoreResizable
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        isSeriesElement={isSeriesElement}
        sectionTypeName={sectionTypeName}
        hasNested={hasNested}
        isActiveSection={isActiveSection}
        toggleDescVis={() => toggleSectionDescription(sectionId)}
        isWrongType={false} // TODO add the logic for this
      />
    </section>
  );
}
export const SectionContainerCore = React.memo(
  _SectionContainerCore,
  (prev, next) => {
    const attrs = ["nextId", "hasNested"];
    for (let k of attrs) {
      if (!_.isEqual(prev[k], next[k])) {
        return false;
      }
    }
    return true;
  }
);
