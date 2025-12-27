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
import type { CodeObjType } from "utils/generatedTypes";
import { BaseParamCodeObjImplTypeSet } from "utils/generatedTypes";
import { IdNameCombobox } from "../../../Utils/Combobox/IdNameCombobox";

function UITypeCombobox({
  nonPresetImpls,
  presetImpls,
  onDropdownSelect,
  selectedBaseImplId,
}: {
  nonPresetImpls: ComboboxItemArrayType<string>;
  presetImpls: ComboboxItemArrayType<string>;
  onDropdownSelect: OnSelectedItemChangeFnType<string>;
  selectedBaseImplId: string;
}) {
  const allItems = [
    { group: "Base", items: nonPresetImpls },
    { group: "Preset", items: presetImpls },
  ];
  console.log(allItems);

  return (
    <IdNameCombobox
      allItems={allItems}
      value={selectedBaseImplId}
      onSelectedItemChange={onDropdownSelect}
    />
  );
}

export function ParamConfigUITypeCombobox({
  sectionId,
  paramInfoId,
  selectedBaseImplId,
  presetCodeObjImpls,
  allowedImplTypes,
  onDropdownSelect,
}: {
  sectionId: string;
  paramInfoId: string;
  selectedBaseImplId: string;
  presetCodeObjImpls: ComboboxItemArrayType<string>;
  allowedImplTypes?: Array<CodeObjType>;
  onDropdownSelect: OnSelectedItemChangeFnType<string>;
}) {
  const nonPresetImpls = useNonPresetImplsForParam(
    sectionId,
    paramInfoId,
    allowedImplTypes,
  );
  return (
    <UITypeCombobox
      nonPresetImpls={nonPresetImpls}
      presetImpls={presetCodeObjImpls}
      selectedBaseImplId={selectedBaseImplId}
      onDropdownSelect={onDropdownSelect}
    />
  );
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
