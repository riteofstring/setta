import { ParamConfigUITypeCombobox } from "components/Panes/UiEditor/UIConfig/UITypeCombobox";
import { ParamUIConfig } from "components/Params/ParamUIs/ParamUI";
import {
  ComboboxItemArrayType,
  OnSelectedItemChangeFnType,
} from "components/Utils/Combobox/ComboboxStateReducer";

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
  presetCodeObjImpls: ComboboxItemArrayType<string>;
  onDropdownSelect: OnSelectedItemChangeFnType<string>;
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
