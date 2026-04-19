import {
  ComboboxItemArrayType,
  OnSelectedItemChangeFnType,
} from "components/Utils/Combobox/ComboboxStateReducer";
import _ from "lodash";
import {
  getCodeObjImpl,
  getCurrCodeObjVariantIfPresent,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import type { CodeObjType } from "utils/generatedTypes";
import { ChangeParamImplUIConfig, CodeObjTypeEnum } from "utils/generatedTypes";
import { IdNameCombobox } from "../../../Utils/Combobox/IdNameCombobox";

const ALL_PARAM_CODE_OBJ_TYPES = [
  ...ChangeParamImplUIConfig.allParamCodeObjTypes,
] as Array<CodeObjType>;

const CODE_OBJ_TYPE_FILTER_LISTS = {
  control: [
    ...ChangeParamImplUIConfig.controlCodeObjTypes,
  ] as Array<CodeObjType>,
  sectionParam: [
    ...ChangeParamImplUIConfig.sectionParamCodeObjTypes,
  ] as Array<CodeObjType>,
} as const;

const CODE_OBJ_TYPE_FILTERS = {
  control: new Set<string>(CODE_OBJ_TYPE_FILTER_LISTS.control),
  sectionParam: new Set<string>(CODE_OBJ_TYPE_FILTER_LISTS.sectionParam),
} as const;

export const CALENDAR_PRESET_ID = "__setta_text_param_calendar__";

function getVirtualDateTimePresetItemsForFilter(
  filterKey: CodeObjTypeFilterKey,
): ComboboxItemArrayType<string> {
  const typeSet = CODE_OBJ_TYPE_FILTERS[filterKey];
  const hasDateParam = typeSet.has(CodeObjTypeEnum.DateParam);
  const output: ComboboxItemArrayType<string> = [];
  if (filterKey === "control" && hasDateParam) {
    output.push({ id: CALENDAR_PRESET_ID, name: "Calendar - (DateParam)" });
  }
  return output;
}

export type CodeObjTypeFilterKey = keyof typeof CODE_OBJ_TYPE_FILTERS;

function UITypeCombobox({
  nonPresetImpls,
  presetImpls,
  onDropdownSelect,
  selectedBaseImplId,
  isDisabled = false,
}: {
  nonPresetImpls: ComboboxItemArrayType<string>;
  presetImpls: ComboboxItemArrayType<string>;
  onDropdownSelect: OnSelectedItemChangeFnType<string>;
  selectedBaseImplId: string;
  isDisabled?: boolean;
}) {
  const allItems = [
    { group: "Base", items: nonPresetImpls },
    { group: "Preset", items: presetImpls },
  ];

  return (
    <IdNameCombobox
      allItems={allItems}
      value={selectedBaseImplId}
      onSelectedItemChange={onDropdownSelect}
      isDisabled={isDisabled}
    />
  );
}

export function ParamConfigUITypeCombobox({
  sectionId,
  paramInfoId,
  selectedBaseImplId,
  codeObjTypeFilterKey,
  onDropdownSelect,
}: {
  sectionId: string;
  paramInfoId: string;
  selectedBaseImplId: string;
  codeObjTypeFilterKey: CodeObjTypeFilterKey;
  onDropdownSelect: OnSelectedItemChangeFnType<string>;
}) {
  const presetCodeObjImpls = usePresetCodeObjImpls(codeObjTypeFilterKey);
  const allowedImplTypes = CODE_OBJ_TYPE_FILTER_LISTS[codeObjTypeFilterKey];
  const nonPresetImpls = useNonPresetImplsForParam(
    sectionId,
    paramInfoId,
    allowedImplTypes,
  );
  const { canEditStructure } = useShareCapabilities();
  return (
    <UITypeCombobox
      nonPresetImpls={nonPresetImpls}
      presetImpls={presetCodeObjImpls}
      selectedBaseImplId={selectedBaseImplId}
      onDropdownSelect={onDropdownSelect}
      isDisabled={!canEditStructure}
    />
  );
}

function usePresetCodeObjImpls(
  filterKey: CodeObjTypeFilterKey,
): ComboboxItemArrayType<string> {
  const typeSet = CODE_OBJ_TYPE_FILTERS[filterKey];
  const virtualDateTimePresets =
    getVirtualDateTimePresetItemsForFilter(filterKey);
  return useProjectState((x) => {
    const output: ComboboxItemArrayType<string> = [];
    for (const c of Object.values(x.codeObjImpls)) {
      if (!c.isPreset) {
        continue;
      }
      if (!typeSet.has(c.type)) {
        continue;
      }
      output.push({
        id: c.id,
        name: `${c.name} - (${c.type})`,
      });
    }
    if (virtualDateTimePresets.length > 0) {
      output.push(...virtualDateTimePresets);
    }
    return output;
  }, _.isEqual);
}

function useNonPresetImplsForParam(
  sectionId: string,
  paramInfoId: string,
  allowedImplTypes?: Array<CodeObjType>,
) {
  return useProjectState((x) => {
    const variant = getCurrCodeObjVariantIfPresent(x, sectionId, paramInfoId);
    if (!variant) {
      return [];
    }
    const prevImpls: Record<string, string> = {};
    for (const i of variant.nonPresetImpls ?? []) {
      const impl = getCodeObjImpl(x, i);
      prevImpls[impl.type] = impl.id;
    }

    const output: ComboboxItemArrayType<string> = [];
    const typeList = allowedImplTypes ?? ALL_PARAM_CODE_OBJ_TYPES;
    for (const c of typeList) {
      if (prevImpls[c]) {
        output.push({
          id: prevImpls[c],
          name: c,
        });
      } else {
        output.push({ id: c, name: c });
      }
    }
    return output;
  }, _.isEqual);
}
