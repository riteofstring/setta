import { useReactFlow } from "forks/xyflow/core/store";
import React from "react";
import {
  addActiveSectionIds,
  removeActiveSectionIds,
  setActiveSectionIds,
} from "state/actions/sections/activeSections";
import { getParamInfos } from "state/actions/sections/sectionContents";
import { setZIndices } from "state/actions/sections/sectionPositions";
import { getHighestAncestor } from "state/actions/sections/sectionSizes";
import { useActiveSection, useParamShortcuts } from "state/definitions";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import {
  useGetSectionInfo,
  useSectionDBSourceIsAvailable,
} from "state/hooks/sections";
import { useSectionTypeName } from "state/hooks/uiTypes";
import "./dndline.css";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";

function _SectionContainerCore({ sectionId }) {
  const sectionTypeName = useSectionTypeName(sectionId);
  const isActiveSection = useActiveSection((x) => x.ids.includes(sectionId));
  const sectionIsFrozen = useGetSectionInfo(sectionId, "isFrozen");
  const refForPosition = useSectionRefAndInit(sectionId, "selfOnly");
  const dbSourceIsAvailable = useSectionDBSourceIsAvailable(sectionId);

  function onClick(e) {
    if (useParamShortcuts.getState().isSelectingParams) {
      // depends on bubbling behavior (child div onclicks get executed first)
      const atLeastOneParamSelected = getParamInfos(sectionId).some(
        (x) => x.isSelected,
      );
      if (!isActiveSection && atLeastOneParamSelected) {
        addActiveSectionIds([sectionId]);
      } else if (isActiveSection && !atLeastOneParamSelected) {
        removeActiveSectionIds([sectionId]);
      }
    } else if (useReactFlow.getState().multiSelectionActive) {
      if (isActiveSection) {
        removeActiveSectionIds([sectionId]);
      } else {
        addActiveSectionIds([sectionId]);
      }
    } else {
      setActiveSectionIds([sectionId]);
    }
    const highestAncestor = getHighestAncestor(sectionId);
    setZIndices([highestAncestor], false);
  }

  const boxShadow = isActiveSection
    ? "shadow-2xl"
    : "shadow-md active:shadow-2xl";

  return (
    <section
      className={`group/card-section rounded-xl border border-white bg-white dark:border-setta-700 dark:bg-setta-925 ${boxShadow} dndline w-min [transition:_box-shadow_500ms_ease]`}
      onClick={onClick}
      ref={refForPosition}
    >
      <SectionContainerCoreResizable
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isActiveSection={isActiveSection}
        isWrongType={false} // TODO add the logic for this
        dbSourceIsAvailable={dbSourceIsAvailable}
      />
    </section>
  );
}
export const SectionContainerCore = React.memo(
  _SectionContainerCore,
  () => true,
);
