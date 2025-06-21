import _ from "lodash";
import React from "react";
import { getEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import { SectionTypeEnum } from "utils/generatedTypes";
import "./dndline.css";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";
import { getOnSectionClick, getOutlineColor } from "./utils";

function _SectionContainerCore({ sectionId, viewingEditingMode }) {
  const {
    isActiveSection,
    sectionTypeName,
    // jsonSourceMissing,
    isInOtherProjectConfigs,
    positionAndSizeLocked,
  } = useProjectState((x) => {
    const impl = getEffectiveSectionImpl(x, sectionId);
    return {
      isActiveSection: x.activeIds.includes(sectionId),
      sectionTypeName: impl.type,
      // jsonSourceMissing: x.sections[sectionId].jsonSourceMissing,
      isInOtherProjectConfigs: impl.isInOtherProjectConfigs,
      positionAndSizeLocked: impl.positionAndSizeLocked,
    };
  }, _.isEqual);
  const refForPosition = useSectionRefAndInit(sectionId, "selfOnly");
  const isGlobalVariables = sectionTypeName === SectionTypeEnum.GlobalVariables;

  // const boxShadow = !positionAndSizeLocked
  //   ? isActiveSection
  //     ? "shadow-2xl dark:shadow-setta-925"
  //     : "shadow-md dark:shadow-setta-900/30 [&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:shadow-2xl dark:[&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:shadow-[0_35px_60px_-15px_rgba(0,0,0,0.7)]"
  //   : "";

  const boxShadow = !positionAndSizeLocked
    ? "shadow-md dark:shadow-setta-900/30"
    : "";

  const outlineColor = getOutlineColor({
    isActiveSection,
    isGlobalVariables,
    isInOtherProjectConfigs,
    // jsonSourceMissing,
  });

  // [transition:_outline-color_200ms_ease] [transition:_box-shadow_500ms_ease]
  // {boxShadow}
  return (
    <section
      className={`group/card-section transition-radius ${!positionAndSizeLocked ? "rounded-xl border-white dark:border-setta-700" : "rounded-sm border-setta-400/90 dark:border-setta-800"} $  dndline  w-min border bg-white outline outline-4 dark:bg-setta-925 ${outlineColor}`}
      onClick={getOnSectionClick(sectionId, isActiveSection)}
      ref={refForPosition}
    >
      <SectionContainerCoreResizable
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isActiveSection={isActiveSection}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        viewingEditingMode={viewingEditingMode}
        positionAndSizeLocked={positionAndSizeLocked}
      />
    </section>
  );
}
export const SectionContainerCore = React.memo(
  _SectionContainerCore,
  (p, n) => p.viewingEditingMode === n.viewingEditingMode,
);
