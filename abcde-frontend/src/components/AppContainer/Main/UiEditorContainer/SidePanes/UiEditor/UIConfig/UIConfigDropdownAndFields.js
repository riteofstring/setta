import { VStack } from "@chakra-ui/react";
import { ParamUIConfig } from "components/UI/Section/SectionContainer/Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";
import { useAvailablePresetUITypes } from "hooks/usePresetUIType";
import { ComboboxSearch } from "utils/Combobox/ComboboxSearch";

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
  const init = _.find(availableUITypes, { id: selectedId });
  const initialSelection = init ? init : {};
  const itemToString = (x) => (x ? x.name : "");

  const localOnSelectedItemChange = (
    currSelectedItem,
    newSelectedItem,
    setSelection
  ) => {
    if (newSelectedItem) {
      const sid = newSelectedItem.id;
      if (sid !== currSelectedItem?.id) {
        setSelection(newSelectedItem);
      }
      onDropdownSelect(sid);
    }
  };

  return (
    <VStack>
      <ComboboxSearch
        allItems={availableUITypes}
        initialSelection={initialSelection}
        itemToString={itemToString}
        onSelectedItemChange={localOnSelectedItemChange}
        matchSorterProps={{ keys: ["name"] }}
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
