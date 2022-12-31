import { ParamUIConfig } from "components/UI/Section/SectionContainer/Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";
import UITypeCombobox from "utils/Combobox/UITypeCombobox";

export function UIConfigDropdownAndFields({
  onDropdownSelect,
  selectedId,
  selectedType,
  onConfigChange,
  sectionId,
  paramInfoId,
  savedConfig,
  paramChildId,
}) {
  const availableTypesProps = {
    sectionId,
    paramInfoId,
    settingSectionConfig: false,
  };

  return (
    <>
      <UITypeCombobox
        onDropdownSelect={onDropdownSelect}
        selectedId={selectedId}
        availableTypesProps={availableTypesProps}
      />
      <ParamUIConfig
        name={selectedType}
        paramChildId={paramChildId}
        savedConfig={savedConfig}
        onChange={onConfigChange}
      />
    </>
  );
}
