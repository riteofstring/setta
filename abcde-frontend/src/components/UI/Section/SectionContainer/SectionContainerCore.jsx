import { useGetSectionConfig } from "hooks/useSectionConfig";
import { useSectionHasDescription } from "hooks/useSectionDescription";
import {
  useIsInfo,
  useIsOutput,
  useIsRoot,
  useIsSeriesElement,
} from "hooks/useSectionType";
import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import { useSectionDescription } from "models/info/sectionDescription";
import React from "react";
import "./dndline.css";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";

function _SectionContainerCore({ sectionId, parentId, nextId, hasNested }) {
  const selectedItem = useGetSectionConfig(sectionId, "selectedItem");
  const isRoot = useIsRoot(sectionId);
  const isOutput = useIsOutput(sectionId);
  const isInfo = useIsInfo(sectionId);
  const hasDescription = useSectionHasDescription(sectionId);
  const isSeriesElement = useIsSeriesElement(sectionId);
  const isActiveSection = useActiveSection((x) => x.id === sectionId);
  const setActiveSection = useActiveSection((x) => x.setId);
  const toggleDescVis = useSectionDescription((x) => x.toggleVisible);

  const boxShadow = isActiveSection
    ? "shadow-2xl"
    : "shadow-md active:shadow-2xl";

  return (
    <div
      className={`rounded-xl bg-white ${boxShadow} dndline w-min  transition-all duration-150`}
      onClick={() => setActiveSection(sectionId)}
      data-testid={`${sectionId} section core`}
    >
      <SectionContainerCoreResizable
        sectionId={sectionId}
        parentId={parentId}
        nextId={nextId}
        isSeriesElement={isSeriesElement}
        isRoot={isRoot}
        isOutput={isOutput}
        isInfo={isInfo}
        hasNested={hasNested}
        hasDescription={hasDescription}
        selectedItem={selectedItem}
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
