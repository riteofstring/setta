import _ from "lodash";
import React from "react";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useAIFollow, useAIStore, useProjectState } from "state/definitions";
import { useSectionRefAndInit } from "state/hooks/sectionRef";
import { SectionTypeEnum } from "utils/generatedTypes";
import "./dndline.css";
import { SectionContainerCoreResizable } from "./SectionContainerCoreResizabe";
import { getOnSectionClick, getOutlineColor } from "./utils";

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
  const activeChatId = useAIStore((state) => state.activeChatId);
  const isAiWorkingOnSection = useAIFollow((state) => {
    const projectEntries = state.sectionIdsByProjectConfigId[projectConfigId];
    if (!projectEntries) {
      return false;
    }
    if (activeChatId) {
      const activeSectionIds = projectEntries[activeChatId] ?? [];
      return activeSectionIds.includes(sectionId);
    }
    for (const sectionIds of Object.values(projectEntries)) {
      if (sectionIds.includes(sectionId)) {
        return true;
      }
    }
    return false;
  });
  const [showAiHighlight, setShowAiHighlight] = React.useState(false);
  React.useEffect(() => {
    if (isAiWorkingOnSection) {
      setShowAiHighlight(true);
      return;
    }
    if (!showAiHighlight) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setShowAiHighlight(false);
    }, 650);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [isAiWorkingOnSection, showAiHighlight]);
  const aiHighlightClassName = showAiHighlight
    ? "setta-ai-gradient-border-active"
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
      className={`setta-ai-gradient-border group/card-section transition-radius ${!positionAndSizeLocked ? "rounded-xl border-white dark:border-setta-700" : "rounded-sm border-setta-400/90 dark:border-setta-800"} $  dndline  w-min border bg-white outline outline-4 dark:bg-setta-925 ${aiHighlightClassName} ${outlineColor}`}
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
