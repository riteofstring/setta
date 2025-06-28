import _ from "lodash";
import {
  getEffectiveCodeObjImpl,
  getEffectiveSectionImpl,
} from "state/actions/sectionInfos";
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
import {
  CodeObjType,
  CodeObjTypeEnum,
  ColorPickerParamCodeObjImpl,
  DropdownParamCodeObjImpl,
  SectionType,
  SectionTypeEnum,
  SliderParamCodeObjImpl,
} from "utils/generatedTypes";

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
      [SectionTypeEnum.ListRoot, SectionTypeEnum.DictRoot],
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

const UI_CONFIG_EXTRACTORS = {
  [CodeObjTypeEnum.SliderParam]: (obj: SliderParamCodeObjImpl) => ({
    min: obj.min,
    max: obj.max,
    step: obj.step,
  }),
  [CodeObjTypeEnum.DropdownParam]: (obj: DropdownParamCodeObjImpl) => ({
    choices: obj.choices,
  }),
  [CodeObjTypeEnum.ColorPickerParam]: (obj: ColorPickerParamCodeObjImpl) => ({
    choices: obj.choices,
  }),
} as const;

type ExtractorResult<T extends keyof typeof UI_CONFIG_EXTRACTORS> = ReturnType<
  (typeof UI_CONFIG_EXTRACTORS)[T]
>;

export function useParamCodeObjUIConfig<T extends CodeObjType>(
  sectionId: string,
  paramInfoId: string,
  type: T,
): T extends keyof typeof UI_CONFIG_EXTRACTORS ? ExtractorResult<T> : {} {
  return useProjectState((x) => {
    const codeObjImpl = getEffectiveCodeObjImpl(
      x,
      paramInfoId,
      sectionId,
      null,
    );
    if (codeObjImpl.type !== type) {
      throw new Error();
    }

    const extractor =
      UI_CONFIG_EXTRACTORS[type as keyof typeof UI_CONFIG_EXTRACTORS];
    if (!extractor) {
      return {} as any; // No UI config for this type
    }

    return extractor(codeObjImpl as any) as any;
  }, _.isEqual);
}
