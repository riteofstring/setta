import _ from "lodash";
import { getEffectiveSectionImpl } from "state/actions/sectionInfos";
import {
  useLocalStorage,
  useProjectState,
  ZustandProjectState,
} from "state/definitions";
import {
  REQUIRED_UI_EDITOR_TABS,
  UIEditorTabLocalStorage,
  UIEditorTabName,
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
  sectionId: string,
  parentTypesToCheck: Array<SectionType>,
  state: ZustandProjectState,
) {
  const impl = getEffectiveSectionImpl(state, sectionId);
  const { parentId } = impl;
  if (!parentId) {
    return false;
  }
  const parentImpl = getEffectiveSectionImpl(state, parentId);
  return parentTypesToCheck.includes(parentImpl.type);
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
    getIsSeriesElementHelper(sectionId, [SectionTypeEnum.ListRoot], x),
  );
}

export function useUIEditorTab(sectionId: string | null) {
  const _storedTab = useLocalStorage((x) => x.uiEditorTab);
  return useProjectState((x) => {
    if (!sectionId) {
      return {
        selectedTabName: null,
        requiredTabs: null,
        sectionType: null,
      };
    }
    const sectionImpl = getEffectiveSectionImpl(x, sectionId);
    const { selectedTabName, requiredTabs } = getUIEditorTab(
      sectionImpl.type,
      _storedTab,
    );

    return {
      selectedTabName,
      requiredTabs,
      sectionType: sectionImpl.type,
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
  let selectedTabName: UIEditorTabName | null;
  if (requiredTabs.length > 0) {
    // @ts-ignore
    selectedTabName = requiredTabs.includes(storedTab) ? storedTab : null;
  } else {
    selectedTabName = null;
  }
  return { selectedTabName, requiredTabs: new Set(requiredTabs) };
}
