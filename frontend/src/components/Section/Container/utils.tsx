import { useDndChildren } from "forks/dnd-kit/dndChildren";
import _ from "lodash";
import { useEffect, useState } from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import {
  getAllowedChatIdsForSelection,
  hasSectionIdInProject,
} from "state/aiFollowUtils";
import { useAIFollow, useMisc, useProjectState } from "state/definitions";
import { SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER } from "utils/constants";
import { SectionTypeEnum } from "utils/generatedTypes";
import "./dndline.css";

export function getBgColor(sectionTypeName: SectionTypeEnum) {
  switch (sectionTypeName) {
    case SectionTypeEnum.Code:
    case SectionTypeEnum.GenPythonCode:
    case SectionTypeEnum.GenPythonMetadata:
      return "bg-white dark:bg-setta-900";
    case SectionTypeEnum.Terminal:
      return "bg-setta-950 overflow-clip";
    case SectionTypeEnum.Browser:
      return "@container/multipane";
    case SectionTypeEnum.GlobalVariables:
      return "bg-white dark:bg-black";
    case SectionTypeEnum.StateMachineStart:
    case SectionTypeEnum.StateMachineGate:
    case SectionTypeEnum.StateMachineEnd:
      return "bg-stone-100 dark:bg-[#171717]";
    case SectionTypeEnum.MetaControl:
      return "bg-transparent";
    default:
      return "bg-setta-50 dark:bg-setta-860";
  }
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

export function useHasTempNested(sectionId: string) {
  return useDndChildren((x) => (x.x[sectionId] ?? []).length > 0);
}

export function useAiSectionHighlight(
  sectionId: string,
  projectConfigId: string,
): boolean {
  const { mode, selectedChatIds, selectedSectionIds } = useAIFollow(
    (state) => ({
      mode: state.mode,
      selectedChatIds:
        state.selectedChatIdsByProjectConfigId[projectConfigId] ?? [],
      selectedSectionIds:
        state.selectedSectionIdsByProjectConfigId[projectConfigId] ?? [],
    }),
    _.isEqual,
  );
  const selectedSectionChatIds = useProjectState((state) => {
    const chatIds: string[] = [];
    for (const selectedSectionId of selectedSectionIds) {
      const variantId =
        state.projectConfig.sectionVariantMap[selectedSectionId];
      if (!variantId) {
        continue;
      }
      const variant = state.sectionVariants[variantId];
      if (!variant) {
        continue;
      }
      const impl = state.sectionImpls[variant.impl];
      if (!impl || impl.type !== SectionTypeEnum.Chat) {
        continue;
      }
      const chatId = impl.chatId;
      if (typeof chatId === "string" && chatId.trim()) {
        chatIds.push(chatId);
      }
    }
    return chatIds;
  }, _.isEqual);
  const { isAiWorkingOnSection, isToolResultHighlight } = useAIFollow(
    (state) => {
      const allowedChatIds = getAllowedChatIdsForSelection(
        mode,
        selectedChatIds,
        selectedSectionChatIds,
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
