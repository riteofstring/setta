import _ from "lodash";
import { useLocalStorage, useProjectState } from "state/definitions";
import {
  INFO_CONFIG_TAB,
  QUICKINFO_CONFIG_TAB,
  SECTION_CONFIG_TAB,
  SECTION_VARIANTS_TAB,
  UI_CONFIG_TAB,
} from "utils/constants";
import { createUITypeColEntry, UITypeNameSchema } from "utils/generatedTypes";

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
    return createUITypeColEntry()[key];
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
    getIsSeriesElementHelper(
      sectionId,
      [UITypeNameSchema.enum.LIST_ROOT, UITypeNameSchema.enum.DICT_ROOT],
      x,
    ),
  );
}

export function useIsListElement(sectionId) {
  return useProjectState((x) =>
    getIsSeriesElementHelper(sectionId, [UITypeNameSchema.enum.LIST_ROOT], x),
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
    case UITypeNameSchema.enum.SECTION:
    case UITypeNameSchema.enum.GLOBAL_VARIABLES:
      return [
        // SECTION_CONFIG_TAB,
        UI_CONFIG_TAB,
        QUICKINFO_CONFIG_TAB,
        SECTION_VARIANTS_TAB,
      ];
    case UITypeNameSchema.enum.LIST_ROOT:
    case UITypeNameSchema.enum.DICT_ROOT:
    case UITypeNameSchema.enum.CODE:
      return [SECTION_CONFIG_TAB, SECTION_VARIANTS_TAB];
    case UITypeNameSchema.enum.GEN_PYTHON_CODE:
      return [SECTION_CONFIG_TAB];
    case UITypeNameSchema.enum.TEXT_BLOCK:
      return [SECTION_CONFIG_TAB, INFO_CONFIG_TAB, SECTION_VARIANTS_TAB];
    case UITypeNameSchema.enum.SOCIAL:
      return [SECTION_CONFIG_TAB];
    case UITypeNameSchema.enum.GROUP:
    case UITypeNameSchema.enum.TERMINAL:
    case UITypeNameSchema.enum.DRAW:
    case UITypeNameSchema.enum.IMAGE:
    case UITypeNameSchema.enum.CHART:
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
