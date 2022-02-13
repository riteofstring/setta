import { VStack } from "@chakra-ui/react";
import { ParamUIConfig } from "components/UI/Section/SectionContainer/Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";
import { useAvailablePresetUITypes } from "hooks/usePresetUIType";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

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
  return (
    <VStack>
      <IdNameCombobox
        allItems={availableUITypes}
        initialSelection={selectedId}
        onSelectedItemChange={onDropdownSelect}
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
