import C from "constants/constants.json";
import React from "react";
import { getSectionType } from "state/actions/sectionInfos";
import { useActiveSection, useSectionInfos } from "state/definitions";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import "./dndline.css";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";
import { getOnSectionClick, getOutlineColor } from "./utils";

function _SectionContainerCore({ sectionId }) {
  const { sectionTypeName, jsonSourceMissing } = useSectionInfos((x) => {
    return {
      sectionTypeName: getSectionType(sectionId, x),
      jsonSourceMissing: x.x[sectionId].jsonSourceMissing,
    };
  });
  const isActiveSection = useActiveSection((x) => x.ids.includes(sectionId));
  const refForPosition = useSectionRefAndInit(sectionId, "selfOnly");
  const isGlobalVariables = sectionTypeName === C.GLOBAL_VARIABLES;
  const isInOtherProjectConfigs = useSectionInfos(
    (x) => x.x[sectionId].isInOtherProjectConfigs,
  );

  const boxShadow = isActiveSection
    ? "shadow-2xl"
    : "shadow-md active:shadow-2xl";

  const outlineColor = getOutlineColor({
    isActiveSection,
    isGlobalVariables,
    isInOtherProjectConfigs,
    jsonSourceMissing,
  });

  return (
    <section
      className={`group/card-section rounded-xl border border-white bg-white dark:border-setta-700 dark:bg-setta-925 ${boxShadow} dndline w-min outline outline-4 [transition:_box-shadow_500ms_ease] ${outlineColor} [transition:_outline-color_200ms_ease] `}
      onClick={getOnSectionClick({ sectionId, isActiveSection })}
      ref={refForPosition}
    >
      <SectionContainerCoreResizable
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isActiveSection={isActiveSection}
        isGlobalVariables={isGlobalVariables}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
      />
    </section>
  );
}
export const SectionContainerCore = React.memo(
  _SectionContainerCore,
  () => true,
);
