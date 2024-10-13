import { useReactFlow } from "forks/xyflow/core/store";
import {
  addActiveSectionIds,
  removeActiveSectionIds,
  setActiveSectionIds,
} from "state/actions/sections/activeSections";
import { getHighestAncestor } from "state/actions/sections/sectionChildren";
import { getParamInfos } from "state/actions/sections/sectionContents";
import { setZIndices } from "state/actions/sections/sectionPositions";
import { useMisc, useParamShortcuts } from "state/definitions";
import "./dndline.css";

export function getOutlineColor({
  isWrongType,
  isActiveSection,
  isGlobalVariables,
  isInOtherProjectConfigs,
  outlineOnMouseDown,
}) {
  if (isWrongType) {
    return "outline-red-600 dark:outline-red-400";
  }
  if (isActiveSection && isGlobalVariables) {
    return "outline-green-600 dark:outline-turquoise-400";
  }
  if (isInOtherProjectConfigs) {
    if (isActiveSection) {
      return "outline-purple-600 dark:outline-purple-700";
    }
    return `outline-transparent ${outlineOnMouseDown ? "active:outline-fuchsia-400" : ""}`;
  }

  if (isActiveSection) {
    return "outline-blue-600 dark:outline-blue-700";
  }

  return `outline-transparent ${outlineOnMouseDown ? "active:outline-cyan-300" : ""}`;
}

export function getOnSectionClick({ sectionId, isActiveSection }) {
  return (e) => {
    e.stopPropagation();
    if (useMisc.getState().mouseDownDrawArea) {
      useMisc.setState({ mouseDownDrawArea: false });
      return;
    }

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
  };
}
