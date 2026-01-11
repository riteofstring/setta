import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { useEffect, useState } from "react";
import {
  addActiveSectionIds,
  removeActiveSectionIds,
  setActiveSectionIds,
} from "state/actions/activeSections";
import {
  getCurrEffectiveSectionImpl,
  getHighestAncestor,
} from "state/actions/sectionInfos";
import { setZIndices } from "state/actions/sections/sectionPositions";
import { hasSectionIdInProject } from "state/aiFollowUtils";
import { useAIFollow, useMisc, useProjectState } from "state/definitions";
import { SETTA_PREVENT_SECTION_ON_CLICK_TRIGGER } from "utils/constants";
import {
  isBaseParentSectionImpl,
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";
import "./dndline.css";

export function getBgColor(sectionTypeName: SectionTypeEnum) {
  switch (sectionTypeName) {
    case SectionTypeEnum.Code:
    case SectionTypeEnum.GenPythonCode:
      return "bg-white dark:bg-setta-900";
    case SectionTypeEnum.Terminal:
      return "bg-setta-950 overflow-clip";
    case SectionTypeEnum.Browser:
      return "@container/multipane";
    case SectionTypeEnum.GlobalVariables:
      return "bg-white dark:bg-black";
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

export function getOnSectionClick(sectionId, isActiveSection) {
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

    if (useMisc.getState().isSelectingParams) {
      // depends on bubbling behavior (child div onclicks get executed first)
      const impl = getCurrEffectiveSectionImpl(
        useProjectState.getState(),
        sectionId,
      );
      const atLeastOneParamSelected =
        isBaseSectionWithParamsImpl(impl) && impl.selectedParams.length > 0;
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
  };
}

export function useSectionChildren(sectionId: string): string[] {
  return useProjectState((state) => {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    if (!isBaseParentSectionImpl(impl)) {
      return [];
    }
    return impl.children;
  }, _.isEqual);
}

export function useHasNestedChildren(sectionId: string) {
  return useProjectState((state) => {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    if (!isBaseParentSectionImpl(impl)) {
      return false;
    }
    return impl.children.length > 0;
  });
}

export function useAiSectionHighlight(
  sectionId: string,
  projectConfigId: string,
): boolean {
  const { isAiWorkingOnSection, isToolResultHighlight } = useAIFollow(
    (state) => {
      const isAiWorkingOnSection = hasSectionIdInProject(
        state.toolArgumentsIdsByProjectConfigId,
        projectConfigId,
        sectionId,
      );
      const isToolResultHighlight = hasSectionIdInProject(
        state.toolResultIdsByProjectConfigId,
        projectConfigId,
        sectionId,
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
