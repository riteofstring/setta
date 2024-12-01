import C from "constants/constants.json";
import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import {
  BASE_UI_TYPE_IDS,
  INFO_CONFIG_TAB,
  QUICKINFO_CONFIG_TAB,
  SECTION_CONFIG_TAB,
  SECTION_DISPLAY_MODES,
  SECTION_VARIANTS_TAB,
  UI_CONFIG_TAB,
} from "utils/constants";
import { isFromJSONSource } from "utils/utils";
import { localStorageFns } from "./localStorage";

export function useGetParamUIType(sectionId, paramInfoId) {
  return useSectionInfos((x) => {
    const uiTypeId = getUITypeColAttr(sectionId, paramInfoId, "uiTypeId", x);
    return x.uiTypes[uiTypeId];
  }, _.isEqual);
}

export function getUITypeColAttr(sectionId, paramInfoId, key, _state) {
  const state = _state ?? useSectionInfos.getState();
  const { uiTypeColId } = state.x[sectionId];
  if (isFromJSONSource(paramInfoId)) {
    if (paramInfoId in state.uiTypeCols[uiTypeColId]) {
      return state.uiTypeCols[uiTypeColId][paramInfoId][key];
    } else if (key === "uiTypeId") {
      return BASE_UI_TYPE_IDS[C.TEXT];
    } else if (key === "nonPresetUITypeIds") {
      return [];
    }
  }
  return state.uiTypeCols[uiTypeColId][paramInfoId][key];
}

export function getIsSeriesElementHelper(
  sectionId,
  parentTypesToCheck,
  _state = {},
) {
  const state = _state ?? useSectionInfos.getState();
  const { parentId } = state.x[sectionId];
  const uiTypeId = state.x[parentId]?.uiTypeId;
  return uiTypeId
    ? parentTypesToCheck.includes(state.uiTypes[uiTypeId].type)
    : false;
}

export function useIsSeriesElement(sectionId) {
  return useSectionInfos((x) =>
    getIsSeriesElementHelper(sectionId, [C.LIST_ROOT, C.DICT_ROOT], x),
  );
}

export function useIsListElement(sectionId) {
  return useSectionInfos((x) =>
    getIsSeriesElementHelper(sectionId, [C.LIST_ROOT], x),
  );
}

export function useSectionTypeName(sectionId) {
  return useSectionInfos((x) => x.uiTypes[x.x[sectionId].uiTypeId].type);
}

export function useIsType(sectionId, type) {
  return useSectionInfos(
    (x) => x.uiTypes[x.x[sectionId].uiTypeId].type === type,
  );
}

export function useUIEditorTab(sectionId) {
  const uiTypeName = useSectionInfos((x) => {
    const uiTypeId = x.x[sectionId]?.uiTypeId;
    return uiTypeId ? x.uiTypes[uiTypeId].type : null;
  });
  const [_storedTab] = localStorageFns.uiEditorTab.hook();
  return { ...getUIEditorTab(uiTypeName, _storedTab), uiTypeName };
}

function getRequiredUIEditorTabs(uiTypeName) {
  switch (uiTypeName) {
    case C.SECTION:
    case C.GLOBAL_VARIABLES:
      return [
        SECTION_CONFIG_TAB,
        UI_CONFIG_TAB,
        QUICKINFO_CONFIG_TAB,
        SECTION_VARIANTS_TAB,
      ];
    case C.LIST_ROOT:
    case C.DICT_ROOT:
    case C.CODE:
    case C.INTERACTIVE_CODE:
      return [SECTION_CONFIG_TAB, SECTION_VARIANTS_TAB];
    case C.INFO:
      return [SECTION_CONFIG_TAB, INFO_CONFIG_TAB, SECTION_VARIANTS_TAB];
    case C.SOCIAL:
      return [SECTION_CONFIG_TAB];
    case C.PARAM_SWEEP:
      return [SECTION_VARIANTS_TAB];
    case C.DECK:
    case C.TERMINAL:
    case C.GLOBAL_PARAM_SWEEP:
    case C.DRAW:
      return [SECTION_CONFIG_TAB];
    case C.IMAGE:
    case C.LINE_PLOT:
      return [];
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

export function getDefaultDisplayMode(uiTypeId) {
  const uiType = useSectionInfos.getState().uiTypes[uiTypeId].type;
  switch (uiType) {
    case C.INFO:
      return SECTION_DISPLAY_MODES.RENDER;
    default:
      return SECTION_DISPLAY_MODES.GUI;
  }
}

export function getUIEditorTab(uiTypeName, _storedTab) {
  const requiredTabs = getRequiredUIEditorTabs(uiTypeName);
  const storedTab = _storedTab?.[uiTypeName] ?? SECTION_CONFIG_TAB;
  // when sectionId changes, the requiredTabs might not include the previously active tab
  const tab = requiredTabs.includes(storedTab) ? storedTab : requiredTabs[0];
  return { tab, requiredTabs: new Set(requiredTabs) };
}
