import _ from "lodash";
import { useLocalStorage, useProjectState } from "state/definitions";
import { C } from "utils/c";
import {
  INFO_CONFIG_TAB,
  QUICKINFO_CONFIG_TAB,
  SECTION_CONFIG_TAB,
  SECTION_VARIANTS_TAB,
  UI_CONFIG_TAB,
} from "utils/constants";
import { newUITypeColEntry } from "utils/objs/uiTypeCol";

export function getParamUIType(sectionId, paramInfoId, _state) {
  const state = _state ?? useProjectState.getState();
  return state.uiTypes[
    getUITypeColAttr(sectionId, paramInfoId, "uiTypeId", state)
  ];
}

export function getUITypeColAttr(sectionId, paramInfoId, key, _state) {
  const state = _state ?? useProjectState.getState();
  const { uiTypeColId } = state.sections[sectionId];
  if (uiTypeColId && paramInfoId in state.uiTypeCols[uiTypeColId]) {
    return state.uiTypeCols[uiTypeColId][paramInfoId][key];
  } else {
    return newUITypeColEntry()[key];
  }
}

export function getIsSeriesElementHelper(
  sectionId,
  parentTypesToCheck,
  _state = {},
) {
  const state = _state ?? useProjectState.getState();
  // if (!state.sections[sectionId]) return false;

  const { parentId } = state.sections[sectionId];
  const uiTypeId = state.sections[parentId]?.uiTypeId;
  return uiTypeId
    ? parentTypesToCheck.includes(state.uiTypes[uiTypeId].type)
    : false;
}

export function useIsSeriesElement(sectionId) {
  return useProjectState((x) =>
    getIsSeriesElementHelper(sectionId, [C.LIST_ROOT, C.DICT_ROOT], x),
  );
}

export function useIsListElement(sectionId) {
  return useProjectState((x) =>
    getIsSeriesElementHelper(sectionId, [C.LIST_ROOT], x),
  );
}

export function useUIEditorTab(sectionId) {
  const _storedTab = useLocalStorage((x) => x.uiEditorTab);
  return useProjectState((x) => {
    let uiTypeName, renderMarkdown;
    if (sectionId) {
      const uiTypeId = x.sections[sectionId].uiTypeId;
      uiTypeName = x.uiTypes[uiTypeId].type;
      renderMarkdown = x.sections[sectionId].renderMarkdown;
    } else {
      uiTypeName = null;
      renderMarkdown = false;
    }

    return {
      ...getUIEditorTab(uiTypeName, _storedTab),
      uiTypeName,
      renderMarkdown,
    };
  }, _.isEqual);
}

function getRequiredUIEditorTabs(uiTypeName) {
  switch (uiTypeName) {
    case C.SECTION:
    case C.GLOBAL_VARIABLES:
      return [
        // SECTION_CONFIG_TAB,
        UI_CONFIG_TAB,
        QUICKINFO_CONFIG_TAB,
        SECTION_VARIANTS_TAB,
      ];
    case C.LIST_ROOT:
    case C.DICT_ROOT:
    case C.CODE:
      return [SECTION_CONFIG_TAB, SECTION_VARIANTS_TAB];
    case C.GEN_PYTHON_CODE:
      return [SECTION_CONFIG_TAB];
    case C.TEXT_BLOCK:
      return [SECTION_CONFIG_TAB, INFO_CONFIG_TAB, SECTION_VARIANTS_TAB];
    case C.SOCIAL:
      return [SECTION_CONFIG_TAB];
    case C.PARAM_SWEEP:
      return [SECTION_VARIANTS_TAB];
    case C.GROUP:
    case C.TERMINAL:
    case C.GLOBAL_PARAM_SWEEP:
      return [];
    case C.DRAW:
    case C.IMAGE:
    case C.CHART:
      return [SECTION_CONFIG_TAB];
    default:
      return [
        SECTION_CONFIG_TAB,
        UI_CONFIG_TAB,
        QUICKINFO_CONFIG_TAB,
        INFO_CONFIG_TAB,
        SECTION_VARIANTS_TAB,
      ];
  }
}

export function getUIEditorTab(uiTypeName, _storedTab) {
  const requiredTabs = getRequiredUIEditorTabs(uiTypeName);
  const storedTab = _storedTab?.[uiTypeName] ?? SECTION_CONFIG_TAB;
  // when sectionId changes, the requiredTabs might not include the previously active tab
  const tab = requiredTabs.includes(storedTab) ? storedTab : requiredTabs[0];
  return { tab, requiredTabs: new Set(requiredTabs) };
}
