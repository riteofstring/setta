import { ParamUIConfig } from "components/Params/ParamUIs/ParamUI";
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
