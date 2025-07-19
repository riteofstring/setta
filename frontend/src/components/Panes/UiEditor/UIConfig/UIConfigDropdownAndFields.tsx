import { ParamUIConfig } from "components/Params/ParamUIs/ParamUI";
import { ParamConfigUITypeCombobox } from "components/Utils/Combobox/UITypeCombobox";

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
  presetCodeObjImpls: Array<{ id: string; name: string }>;
  onDropdownSelect: any;
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
