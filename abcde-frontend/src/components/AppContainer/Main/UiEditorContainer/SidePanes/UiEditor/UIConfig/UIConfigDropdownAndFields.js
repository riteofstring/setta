import { VStack } from "@chakra-ui/react";
import { ParamUIConfig } from "components/UI/Section/SectionContainer/Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";
import { useAvailablePresetUITypes } from "hooks/usePresetUIType";
import { StandardDropDown } from "utils/StandardDropdown/StandardDropdown";

export function UIConfigDropdownAndFields({
  onDropdownSelect,
  selectedId,
  selectedType,
  onConfigChange,
  paramInfoId,
  savedConfig,
  childIdFn,
  origin,
}) {
  const availableUITypes = useAvailablePresetUITypes(selectedId);

  function onSelect(e) {
    onDropdownSelect(e.target.value);
  }

  return (
    <VStack>
      <StandardDropDown
        placeholder="Select UI Type"
        onChange={onSelect}
        options={availableUITypes}
        curr={selectedId}
      />
      <ParamUIConfig
        name={selectedType}
        paramInfoId={paramInfoId}
        childIdFn={childIdFn}
        savedConfig={savedConfig}
        onChange={onConfigChange}
        origin={origin}
      />
    </VStack>
  );
}
