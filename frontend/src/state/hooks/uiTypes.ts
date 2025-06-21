import _ from "lodash";
import { useLocalStorage, useProjectState } from "state/definitions";
import {
  REQUIRED_UI_EDITOR_TABS,
  UIEditorTabLocalStorage,
  UIEditorTabNameEnum,
} from "utils/constants";
import { SectionType, SectionTypeEnum } from "utils/generatedTypes";

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
      [SectionTypeEnum.LIST_ROOT, SectionTypeEnum.DICT_ROOT],
      x,
    ),
  );
}

export function useIsListElement(sectionId) {
  return useProjectState((x) =>
    getIsSeriesElementHelper(sectionId, [SectionTypeEnum.LIST_ROOT], x),
  );
}

export function useUIEditorTab(sectionId: string | null) {
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

    const { tab, requiredTabs } = getUIEditorTab(uiTypeName, _storedTab);

    return {
      tab,
      requiredTabs,
      uiTypeName,
      renderMarkdown,
    };
  }, _.isEqual);
}

export function getUIEditorTab(
  sectionType: SectionType,
  _storedTab: UIEditorTabLocalStorage,
) {
  const requiredTabs = REQUIRED_UI_EDITOR_TABS[sectionType];
  const storedTab =
    _storedTab?.[sectionType] ?? UIEditorTabNameEnum.SectionConfig;
  // when sectionId changes, the requiredTabs might not include the previously active tab
  let tab: string | null;
  if (requiredTabs.length > 0) {
    // @ts-ignore
    tab = requiredTabs.includes(storedTab) ? storedTab : null;
  } else {
    tab = null;
  }
  return { tab, requiredTabs: new Set(requiredTabs) };
}
