import { toggleSectionDescription } from "hooks/useSectionDescription";
import { useGetSectionInfo } from "hooks/useSectionInfo";
import { useIsSeriesElement, useSectionTypeName } from "hooks/useSectionType";
import { useActiveSection } from "models/activeSection";
import { useSectionInfos } from "models/info/sectionInfos";
import { useSectionRefAndInit } from "models/sectionRefs";
import React from "react";
import { multiSectionSelect, paramSelect } from "thunks/keyActivations";
import { getParamInfos } from "thunks/sections/sectionContents";
import { setZIndices } from "thunks/sections/sectionPositions";
import { getHighestAncestor } from "thunks/sections/sectionSizes";
import "./dndline.css";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";

function _SectionContainerCore({ sectionId }) {
  const sectionTypeName = useSectionTypeName(sectionId);
  const isSeriesElement = useIsSeriesElement(sectionId);
  const isActiveSection = useActiveSection((x) => x.ids.includes(sectionId));
  const sectionIsFrozen = useGetSectionInfo(sectionId, "isFrozen");
  const refForPosition = useSectionRefAndInit(sectionId, "selfOnly");

  function onClick(e) {
    if (paramSelect(e)) {
      // depends on bubbling behavior (child div onclicks get executed first)
      const atLeastOneParamSelected = getParamInfos(sectionId).some(
        (x) => x.isSelected,
      );
      if (!isActiveSection && atLeastOneParamSelected) {
        useActiveSection.getState().addIds([sectionId]);
      } else if (isActiveSection && !atLeastOneParamSelected) {
        useActiveSection.getState().removeIds([sectionId]);
      }
    } else if (multiSectionSelect(e)) {
      if (isActiveSection) {
        useActiveSection.getState().removeIds([sectionId]);
      } else {
        useActiveSection.getState().addIds([sectionId]);
      }
    } else {
      useActiveSection.getState().setIds([sectionId]);
    }
    const highestAncestor = getHighestAncestor(sectionId);
    setZIndices([useSectionInfos.getState().x[highestAncestor]], false);
  }

  const boxShadow = isActiveSection
    ? "shadow-2xl"
    : "shadow-md active:shadow-2xl";

  return (
    <section
      className={`rounded-xl border border-white bg-white dark:border-runcoder-700 dark:bg-runcoder-900 ${boxShadow} dndline w-min [transition:_box-shadow_500ms_ease]`}
      onClick={onClick}
      data-testid={`${sectionId} section core`}
      ref={refForPosition}
    >
      <SectionContainerCoreResizable
        sectionId={sectionId}
        isSeriesElement={isSeriesElement}
        sectionTypeName={sectionTypeName}
        isActiveSection={isActiveSection}
        toggleDescVis={() => toggleSectionDescription(sectionId)}
        isWrongType={false} // TODO add the logic for this
      />
    </section>
  );
}
export const SectionContainerCore = React.memo(
  _SectionContainerCore,
  () => true,
);
