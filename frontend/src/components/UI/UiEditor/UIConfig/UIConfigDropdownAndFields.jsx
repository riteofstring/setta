import { ParamUIConfig } from "components/Section/Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";
import { ParamConfigUITypeCombobox } from "utils/Combobox/UITypeCombobox";

export function UIConfigDropdownAndFields({
  onDropdownSelect,
  selectedId,
  selectedType,
  onConfigChange,
  sectionId,
  paramInfoId,
  config,
}) {
  return (
    <>
      <ParamConfigUITypeCombobox
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        onDropdownSelect={onDropdownSelect}
        selectedId={selectedId}
      />
      <ParamUIConfig
        name={selectedType}
        config={config}
        onChange={onConfigChange}
      />
    </>
  );
}
