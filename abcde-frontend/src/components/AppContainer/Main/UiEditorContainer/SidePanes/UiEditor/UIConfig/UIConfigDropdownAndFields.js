import { VStack } from "@chakra-ui/react";
import { ParamUIConfig } from "components/UI/Section/SectionContainer/Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";
import { usePaneComboboxWidth } from "hooks/usePaneComboboxWidth";
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
  originInfoId,
}) {
  const availableUITypes = useAvailablePresetUITypes(originInfoId);
  const comboboxWidth = usePaneComboboxWidth();

  return (
    <VStack>
      <IdNameCombobox
        allItems={availableUITypes}
        initialSelection={selectedId}
        onSelectedItemChange={onDropdownSelect}
        // height="32px"
        size="small"
        width={comboboxWidth}
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
