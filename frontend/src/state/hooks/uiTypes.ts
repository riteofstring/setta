import _ from "lodash";
import { getSectionImpl } from "state/actions/sectionInfos";
import { useLocalStorage, useProjectState } from "state/definitions";
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
    if (!sectionId) {
      return {
        selectedTabName: null,
        requiredTabs: null,
        sectionType: null,
      };
    }
    const sectionImpl = getSectionImpl(x, sectionId);
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
