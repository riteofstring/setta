import {
  useSectionHasDescription,
  useToggleSectionDescription,
} from "hooks/useSectionDescription";
import {
  useIsInfo,
  useIsOutput,
  useIsRoot,
  useIsSeriesElement,
  useIsSocial,
} from "hooks/useSectionType";
import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import { useSectionInfos } from "models/info/sectionInfos";
import React from "react";
import { setZIndices } from "thunks/sections/sectionPositions";
import { getHighestAncestor } from "thunks/sections/sectionSizes";
import "./dndline.css";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";

function _SectionContainerCore({ sectionId, parentId, nextId, hasNested }) {
  const isRoot = useIsRoot(sectionId);
  const isOutput = useIsOutput(sectionId);
  const isSocial = useIsSocial(sectionId);
  const isInfo = useIsInfo(sectionId);
  const hasDescription = useSectionHasDescription(sectionId);
  const isSeriesElement = useIsSeriesElement(sectionId);
  const isActiveSection = useActiveSection((x) => x.id === sectionId);
  const setActiveSection = useActiveSection((x) => x.setId);
  const toggleDescVis = useToggleSectionDescription(sectionId);

  function onClick() {
    setActiveSection(sectionId);
    const topMostAncestor = getHighestAncestor(sectionId);
    setZIndices([useSectionInfos.getState().x[topMostAncestor]], false);
  }

  const boxShadow = isActiveSection
    ? "shadow-2xl"
    : "shadow-md active:shadow-2xl";

  return (
    <div
      className={`rounded-xl bg-white ${boxShadow} dndline w-min  transition-all duration-150`}
      onClick={onClick}
      data-testid={`${sectionId} section core`}
    >
      <SectionContainerCoreResizable
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        isSeriesElement={isSeriesElement}
        isRoot={isRoot}
        isOutput={isOutput}
        isSocial={isSocial}
        isInfo={isInfo}
        hasNested={hasNested}
        hasDescription={hasDescription}
        isActiveSection={isActiveSection}
        toggleDescVis={toggleDescVis}
      />
    </div>
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
