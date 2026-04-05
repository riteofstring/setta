import {
  ComboboxItemArrayType,
  OnSelectedItemChangeFnType,
} from "components/Utils/Combobox/ComboboxStateReducer";
import _ from "lodash";
import {
  getCodeObjImpl,
  getCurrCodeObjVariant,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useShareCapabilities } from "state/hooks/share";
import type { CodeObjType } from "utils/generatedTypes";
import {
  BaseParamCodeObjImplTypeSet,
  CodeObjTypeEnum,
  ControlCodeObjTypeSet,
  SectionParamCodeObjTypeSet,
} from "utils/generatedTypes";
import { IdNameCombobox } from "../../../Utils/Combobox/IdNameCombobox";

const CODE_OBJ_TYPE_FILTERS = {
  control: ControlCodeObjTypeSet,
  sectionParam: SectionParamCodeObjTypeSet,
} as const;

export const CALENDAR_PRESET_ID = "__setta_text_param_calendar__";

export function getVirtualDateTimePresetItemsForFilter(
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

const CODE_OBJ_TYPE_ENUM_VALUES = Object.values(
  CodeObjTypeEnum,
) as Array<CodeObjType>;

const CODE_OBJ_TYPE_FILTER_LISTS: Record<
  CodeObjTypeFilterKey,
  Array<CodeObjType>
> = {
  control: CODE_OBJ_TYPE_ENUM_VALUES.filter((type) =>
    CODE_OBJ_TYPE_FILTERS.control.has(type),
  ),
  sectionParam: CODE_OBJ_TYPE_ENUM_VALUES.filter((type) =>
    CODE_OBJ_TYPE_FILTERS.sectionParam.has(type),
  ),
};

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
    const variant = getCurrCodeObjVariant(x, sectionId, paramInfoId);
    const prevImpls: Record<string, string> = {};
    for (const i of variant.nonPresetImpls) {
      const impl = getCodeObjImpl(x, i);
      prevImpls[impl.type] = impl.id;
    }

    const output: ComboboxItemArrayType<string> = [];
    const typeList =
      allowedImplTypes ?? Array.from(BaseParamCodeObjImplTypeSet);
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
