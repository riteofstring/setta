import _ from "lodash";
import React from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import { SectionTypeEnum } from "utils/generatedTypes";
import "./dndline.css";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";
import {
  getOnSectionClick,
  getOutlineColor,
  useAiSectionHighlight,
} from "./utils";

type SectionContainerCoreProps = {
  sectionId: string;
  isUserView: boolean;
};

function _SectionContainerCore({
  sectionId,
  isUserView,
}: SectionContainerCoreProps) {
  const {
    isActiveSection,
    sectionTypeName,
    // jsonSourceMissing,
    isInOtherProjectConfigs,
    positionAndSizeLocked,
    projectConfigId,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return {
      isActiveSection: x.projectConfig.activeIds.includes(sectionId),
      sectionTypeName: impl.type,
      // jsonSourceMissing: x.sections[sectionId].jsonSourceMissing,
      isInOtherProjectConfigs: impl.isInOtherProjectConfigs,
      positionAndSizeLocked: impl.positionAndSizeLocked,
      projectConfigId: x.projectConfig.id,
    };
  }, _.isEqual);
  const showAiHighlight = useAiSectionHighlight(sectionId, projectConfigId);
  const aiHighlightClassName = showAiHighlight
    ? "setta-ai-gradient-border setta-ai-gradient-border-active"
    : "";
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
      className={`group/card-section transition-radius ${!positionAndSizeLocked ? "rounded-xl border-white dark:border-setta-700" : "rounded-sm border-setta-400/90 dark:border-setta-800"} $  dndline  w-min border bg-white outline outline-4 dark:bg-setta-925 ${aiHighlightClassName} ${outlineColor}`}
      onClick={getOnSectionClick(sectionId, isActiveSection)}
      ref={refForPosition}
    >
      <SectionContainerCoreResizable
        sectionId={sectionId}
        sectionTypeName={sectionTypeName}
        isActiveSection={isActiveSection}
        isInOtherProjectConfigs={isInOtherProjectConfigs}
        isUserView={isUserView}
        positionAndSizeLocked={positionAndSizeLocked}
      />
    </section>
  );
}
export const SectionContainerCore = React.memo(
  _SectionContainerCore,
  (p, n) => p.isUserView === n.isUserView,
);
