import { ParamConfigUITypeCombobox } from "components/Panes/UiEditor/UIConfig/UITypeCombobox";
import { ParamUIConfig } from "components/Params/ParamUIs/ParamUI";
import {
  ComboboxItemArrayType,
  OnSelectedItemChangeFnType,
} from "components/Utils/Combobox/ComboboxStateReducer";
import type { CodeObjType } from "utils/generatedTypes";

export function UIConfigDropdownAndFields({
  sectionId,
  paramInfoId,
  baseImplId,
  presetCodeObjImpls,
  allowedImplTypes,
  onDropdownSelect,
}: {
  sectionId: string;
  paramInfoId: string;
  baseImplId: string;
  presetCodeObjImpls: ComboboxItemArrayType<string>;
  allowedImplTypes?: Array<CodeObjType>;
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
        allowedImplTypes={allowedImplTypes}
      />
      <ParamUIConfig
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        baseImplId={baseImplId}
      />
    </>
  );
}
