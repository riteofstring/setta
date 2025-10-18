import { ParamConfigUITypeCombobox } from "components/Panes/UiEditor/UIConfig/UITypeCombobox";
import { ParamUIConfig } from "components/Params/ParamUIs/ParamUI";
import {
  ComboboxOnSelectedItemChange,
  IdNameArrayForCombobox,
} from "components/Utils/Combobox/IdNameCombobox";

export function UIConfigDropdownAndFields({
  sectionId,
  paramInfoId,
  baseImplId,
  presetCodeObjImpls,
  onDropdownSelect,
}: {
  sectionId: string;
  paramInfoId: string;
  baseImplId: string;
  presetCodeObjImpls: IdNameArrayForCombobox;
  onDropdownSelect: ComboboxOnSelectedItemChange;
}) {
  return (
    <>
      <ParamConfigUITypeCombobox
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        onDropdownSelect={onDropdownSelect}
        presetCodeObjImpls={presetCodeObjImpls}
        selectedBaseImplId={baseImplId}
      />
      <ParamUIConfig
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        baseImplId={baseImplId}
      />
    </>
  );
}
