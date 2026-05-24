import _ from "lodash";
import { useEffect, useState } from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import {
  getAllowedChatIdsForProject,
  hasSectionIdInProject,
} from "state/aiFollowUtils";
import { useAIFollow, useMisc, useProjectState } from "state/definitions";
import { SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER } from "utils/constants";
import { SectionTypeEnum } from "utils/generatedTypes";
import "./dndline.css";

const DEFAULT_SECTION_BG_COLOR = "bg-setta-50 dark:bg-setta-860";

const SECTION_BG_COLOR_BY_TYPE: Partial<Record<SectionTypeEnum, string>> = {
  [SectionTypeEnum.Code]: "bg-white dark:bg-setta-900",
  [SectionTypeEnum.GenPythonCode]: "bg-white dark:bg-setta-900",
  [SectionTypeEnum.GenPythonMetadata]: "bg-white dark:bg-setta-900",
  [SectionTypeEnum.Terminal]: "bg-setta-950 overflow-clip",
  [SectionTypeEnum.Browser]: "@container/multipane",
  [SectionTypeEnum.GlobalVariables]: "bg-white dark:bg-black",
  [SectionTypeEnum.StateMachineStart]: "bg-stone-100 dark:bg-[#171717]",
  [SectionTypeEnum.StateMachineGate]: "bg-stone-100 dark:bg-[#171717]",
  [SectionTypeEnum.StateMachineEnd]: "bg-stone-100 dark:bg-[#171717]",
  [SectionTypeEnum.MetaControl]: "bg-transparent",
};

export function getBgColor(sectionTypeName: SectionTypeEnum) {
  return SECTION_BG_COLOR_BY_TYPE[sectionTypeName] ?? DEFAULT_SECTION_BG_COLOR;
}

export function getOutlineColor({
  jsonSourceMissing,
  isActiveSection,
  isGlobalVariables,
  isInOtherProjectConfigs,
}) {
  if (jsonSourceMissing) {
    return "outline-red-600 dark:outline-red-400";
  }
  if (isActiveSection && isGlobalVariables) {
    return "outline-green-600 dark:outline-turquoise-400";
  }
  if (isInOtherProjectConfigs) {
    if (isActiveSection) {
      return "outline-purple-600 dark:outline-purple-700";
    }
    return "outline-transparent [&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:outline-fuchsia-400";
  }

  if (isActiveSection) {
    return "outline-blue-600 dark:outline-blue-700";
  }

  return "outline-transparent [&:active:not(:has(button:active,:active.setta-prevent-section-active-css))]:outline-cyan-300";
}

export function getOnSectionClick(sectionId: string) {
  return (e) => {
    if (
      e.target.closest(
        `button, [role="menuitem"], .${SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER}`,
      ) ||
      useMisc.getState().mouseDownDraggingSection
    ) {
      // if a child button, menu item, or resizable is clicked,
      // or a section resize/drag is in progress,
      // then don't "activate" the section
      return;
    }
    e.stopPropagation(); // to prevent parent section from becoming active
    if (useMisc.getState().mouseDownDrawArea) {
      useMisc.setState({ mouseDownDrawArea: false });
      return;
    }
    applyActiveSectionChange({ interaction: "section-click", sectionId });
  };
}

export function useAiSectionHighlight(
  sectionId: string,
  projectConfigId: string,
): boolean {
  const { sectionVariantMap, sectionVariants, sectionImpls } = useProjectState(
    (state) => ({
      sectionVariantMap: state.projectConfig.sectionVariantMap,
      sectionVariants: state.sectionVariants,
      sectionImpls: state.sectionImpls,
    }),
    _.isEqual,
  );
  const { isAiWorkingOnSection, isToolResultHighlight } = useAIFollow(
    (state) => {
      const allowedChatIds = getAllowedChatIdsForProject(
        state.mode,
        state.selectedChatIdsByProjectConfigId,
        state.selectedSectionIdsByProjectConfigId,
        projectConfigId,
        sectionVariantMap,
        sectionVariants,
        sectionImpls,
      );
      const isAiWorkingOnSection = hasSectionIdInProject(
        state.toolArgumentsIdsByProjectConfigId,
        projectConfigId,
        sectionId,
        allowedChatIds,
      );
      const isToolResultHighlight = hasSectionIdInProject(
        state.toolResultIdsByProjectConfigId,
        projectConfigId,
        sectionId,
        allowedChatIds,
      );
      return { isAiWorkingOnSection, isToolResultHighlight };
    },
    _.isEqual,
  );
  const [showAiHighlight, setShowAiHighlight] = useState(false);
  const shouldHighlight = isAiWorkingOnSection || isToolResultHighlight;
  useEffect(() => {
    if (shouldHighlight) {
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
  }, [shouldHighlight, showAiHighlight]);
  return showAiHighlight;
}
