import _ from "lodash";
import { useMemo } from "react";
import {
  getCurrEffectiveCodeObjImplOfType,
  getCurrEffectiveSectionImpl,
} from "state/actions/sectionInfos";
import { useProjectState, ZustandProjectState } from "state/definitions";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import {
  REQUIRED_UI_EDITOR_TABS,
  UIEditorTabLocalStorage,
  UIEditorTabName,
  UIEditorTabNameEnum,
} from "utils/constants";
import {
  ButtonParamCodeObjImpl,
  CodeObjType,
  CodeObjTypeEnum,
  ColorPickerParamCodeObjImpl,
  DateParamCodeObjImpl,
  DropdownParamCodeObjImpl,
  DropzoneParamCodeObjImpl,
  RotaryParamCodeObjImpl,
  SectionType,
  SectionTypeEnum,
  SliderParamCodeObjImpl,
  TimeParamCodeObjImpl,
} from "utils/generatedTypes";

function getIsSeriesElementHelper(
  sectionId: string,
  parentTypesToCheck: Array<SectionType>,
  state: ZustandProjectState,
) {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  const { parentId } = impl;
  if (!parentId) {
    return false;
  }
  const parentImpl = getCurrEffectiveSectionImpl(state, parentId);
  return parentTypesToCheck.includes(parentImpl.type);
}

export function useIsSeriesElement(sectionId: string) {
  return useProjectState((x) =>
    getIsSeriesElementHelper(sectionId, [SectionTypeEnum.ListRoot], x),
  );
}

export function useIsListElement(sectionId: string) {
  return useProjectState((x) =>
    getIsSeriesElementHelper(sectionId, [SectionTypeEnum.ListRoot], x),
  );
}

export function useUIEditorTab(sectionId: string | null) {
  const _storedTab = useLocalStorage((x) => x.uiEditorTab);
  const sectionType = useProjectState((x) => {
    if (!sectionId) {
      return null;
    }
    return getCurrEffectiveSectionImpl(x, sectionId).type;
  });
  return useMemo(() => {
    if (!sectionType) {
      return {
        selectedTabName: null,
        requiredTabs: null,
        sectionType: null,
      };
    }
    const { selectedTabName, requiredTabs } = getUIEditorTab(
      sectionType,
      _storedTab,
    );
    return {
      selectedTabName,
      requiredTabs,
      sectionType,
    };
  }, [_storedTab, sectionType]);
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
    // @ts-expect-error The includes function typing is annoying
    selectedTabName = requiredTabs.includes(storedTab) ? storedTab : null;
  } else {
    selectedTabName = null;
  }
  return { selectedTabName, requiredTabs: new Set(requiredTabs) };
}

export type SliderConfigForFrontend = Pick<
  SliderParamCodeObjImpl,
  "min" | "max" | "step"
>;

type RotaryConfigForFrontend = Pick<
  RotaryParamCodeObjImpl,
  "min" | "max" | "step"
>;

export type DropdownConfigForFrontend = Pick<
  DropdownParamCodeObjImpl,
  "choices"
>;

export type ColorPickerConfigForFrontend = Pick<
  ColorPickerParamCodeObjImpl,
  "colorChoices"
>;

export type DropzoneConfigForFrontend = Pick<
  DropzoneParamCodeObjImpl,
  "mode" | "maxAttachments" | "placeholder"
>;

export type DateParamConfigForFrontend = Pick<
  DateParamCodeObjImpl,
  | "dateDisplayFormat"
  | "dateControlMode"
  | "dateSelectionMode"
  | "dateCalendarWeekStart"
  | "dateIncludesTime"
>;

export type TimeParamConfigForFrontend = Pick<
  TimeParamCodeObjImpl,
  | "timeControlMode"
  | "timeDisplayFormat"
  | "timeDisplayTransparent"
  | "timeDisplayScale"
  | "timeDisplayFont"
>;

type ButtonConfigForFrontend = Pick<
  ButtonParamCodeObjImpl,
  | "label"
  | "actionMode"
  | "requestMethod"
  | "requestUrl"
  | "requestHeaderKey"
  | "requestHeaderValue"
  | "requestBody"
>;

const UI_CONFIG_EXTRACTORS = {
  [CodeObjTypeEnum.SliderParam]: (
    obj: SliderParamCodeObjImpl,
  ): SliderConfigForFrontend => ({
    min: obj.min,
    max: obj.max,
    step: obj.step,
  }),
  [CodeObjTypeEnum.RotaryParam]: (
    obj: RotaryParamCodeObjImpl,
  ): RotaryConfigForFrontend => ({
    min: obj.min,
    max: obj.max,
    step: obj.step,
  }),
  [CodeObjTypeEnum.DropdownParam]: (
    obj: DropdownParamCodeObjImpl,
  ): DropdownConfigForFrontend => ({
    choices: obj.choices,
  }),
  [CodeObjTypeEnum.ColorPickerParam]: (
    obj: ColorPickerParamCodeObjImpl,
  ): ColorPickerConfigForFrontend => ({
    colorChoices: obj.colorChoices,
  }),
  [CodeObjTypeEnum.ButtonParam]: (
    obj: ButtonParamCodeObjImpl,
  ): ButtonConfigForFrontend => ({
    label: obj.label,
    actionMode: obj.actionMode,
    requestMethod: obj.requestMethod,
    requestUrl: obj.requestUrl,
    requestHeaderKey: obj.requestHeaderKey,
    requestHeaderValue: obj.requestHeaderValue,
    requestBody: obj.requestBody,
  }),
  [CodeObjTypeEnum.DropzoneParam]: (
    obj: DropzoneParamCodeObjImpl,
  ): DropzoneConfigForFrontend => ({
    mode: obj.mode,
    maxAttachments: obj.maxAttachments,
    placeholder: obj.placeholder,
  }),
  [CodeObjTypeEnum.DateParam]: (
    obj: DateParamCodeObjImpl,
  ): DateParamConfigForFrontend => ({
    dateDisplayFormat: obj.dateDisplayFormat,
    dateControlMode: obj.dateControlMode,
    dateSelectionMode: obj.dateSelectionMode,
    dateCalendarWeekStart: obj.dateCalendarWeekStart,
    dateIncludesTime: obj.dateIncludesTime,
  }),
  [CodeObjTypeEnum.TimeParam]: (
    obj: TimeParamCodeObjImpl,
  ): TimeParamConfigForFrontend => ({
    timeControlMode: obj.timeControlMode,
    timeDisplayFormat: obj.timeDisplayFormat,
    timeDisplayTransparent: obj.timeDisplayTransparent,
    timeDisplayScale: obj.timeDisplayScale,
    timeDisplayFont: obj.timeDisplayFont,
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
    const codeObjImpl = getCurrEffectiveCodeObjImplOfType(
      x,
      sectionId,
      paramInfoId,
      type,
    );
    const extractor =
      UI_CONFIG_EXTRACTORS[type as keyof typeof UI_CONFIG_EXTRACTORS];
    if (!extractor) {
      return {} as any; // No UI config for this type
    }

    return extractor(codeObjImpl as any) as any;
  }, _.isEqual);
}
