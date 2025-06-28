import { ParamUIConfig } from "components/Params/ParamUIs/ParamUI";
import { ParamConfigUITypeCombobox } from "components/Utils/Combobox/UITypeCombobox";

export function UIConfigDropdownAndFields({
  sectionId,
  paramInfoId,
  implType,
  onDropdownSelect,
  selectedId,
  selectedType,
}) {
  return (
    <>
      {/* <ParamConfigUITypeCombobox
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        onDropdownSelect={onDropdownSelect}
        selectedId={selectedId}
      /> */}
      <ParamUIConfig
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        implType={implType}
      />
    </>
  );
}
