import { ParamUIConfig } from "components/UI/Section/SectionContainer/Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";
import { UIConfigUITypeCombobox } from "utils/Combobox/UITypeCombobox";

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
  const comboboxProps = { size: "small" };

  return (
    <>
      <UIConfigUITypeCombobox
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        onDropdownSelect={onDropdownSelect}
        selectedId={selectedId}
        comboboxProps={comboboxProps}
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
