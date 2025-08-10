import _ from "lodash";
import {
  getCodeObjImpl,
  getCurrCodeObjVariant,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { BaseParamCodeObjImplTypeSet } from "utils/generatedTypes";
import {
  ComboboxOnSelectedItemChange,
  IdNameArrayForCombobox,
  IdNameCombobox,
} from "../../../Utils/Combobox/IdNameCombobox";

function UITypeCombobox({
  nonPresetImpls,
  presetImpls,
  onDropdownSelect,
  selectedBaseImplId,
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
  onDropdownSelect,
}: {
  sectionId: string;
  paramInfoId: string;
  selectedBaseImplId: string;
  presetCodeObjImpls: IdNameArrayForCombobox;
  onDropdownSelect: ComboboxOnSelectedItemChange;
}) {
  const nonPresetImpls = useNonPresetImplsForParam(sectionId, paramInfoId);
  return (
    <UITypeCombobox
      nonPresetImpls={nonPresetImpls}
      presetImpls={presetCodeObjImpls}
      selectedBaseImplId={selectedBaseImplId}
      onDropdownSelect={onDropdownSelect}
    />
  );
}

function useNonPresetImplsForParam(sectionId: string, paramInfoId: string) {
  return useProjectState((x) => {
    const variant = getCurrCodeObjVariant(x, sectionId, paramInfoId);
    const prevImpls: Record<string, string> = {};
    for (const i of variant.nonPresetImpls) {
      const impl = getCodeObjImpl(x, i);
      prevImpls[impl.type] = impl.id;
    }

    const output: IdNameArrayForCombobox = [];
    for (const c of BaseParamCodeObjImplTypeSet) {
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
