import {
  ParamConfigUITypeCombobox,
  type CodeObjTypeFilterKey,
} from "components/Panes/UiEditor/UIConfig/UITypeCombobox";
import { ParamUIConfig } from "components/Params/ParamUIs/ParamUI";
import { OnSelectedItemChangeFnType } from "components/Utils/Combobox/ComboboxStateReducer";

export function UIConfigDropdownAndFields({
  sectionId,
  paramInfoId,
  baseImplId,
  codeObjTypeFilterKey,
  onDropdownSelect,
}: {
  sectionId: string;
  paramInfoId: string;
  baseImplId: string;
  codeObjTypeFilterKey: CodeObjTypeFilterKey;
  onDropdownSelect: OnSelectedItemChangeFnType<string>;
}) {
  return (
    <>
      <ParamConfigUITypeCombobox
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        onDropdownSelect={onDropdownSelect}
        selectedBaseImplId={baseImplId}
        codeObjTypeFilterKey={codeObjTypeFilterKey}
      />
      <ParamUIConfig
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        baseImplId={baseImplId}
      />
    </>
  );
}
