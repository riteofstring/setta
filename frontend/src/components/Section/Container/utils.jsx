import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  addActiveSectionIds,
  removeActiveSectionIds,
  setActiveSectionIds,
} from "state/actions/activeSections";
import { getHighestAncestor } from "state/actions/sectionInfos";
import { getParamInfos } from "state/actions/sections/sectionContents";
import { setZIndices } from "state/actions/sections/sectionPositions";
import { useMisc } from "state/definitions";
import "./dndline.css";

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
    return `outline-transparent active:outline-fuchsia-400`;
  }

  if (isActiveSection) {
    return "outline-blue-600 dark:outline-blue-700";
  }

  return `outline-transparent active:outline-cyan-300`;
}

export function getOnSectionClick({ sectionId, isActiveSection }) {
  return (e) => {
    e.stopPropagation();
    if (useMisc.getState().mouseDownDrawArea) {
      useMisc.setState({ mouseDownDrawArea: false });
      return;
    }

    if (useMisc.getState().isSelectingParams) {
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
  };
}

export function useHasTempNested(sectionId) {
  return useDndChildren((x) => x.x[sectionId]?.length > 0);
}
