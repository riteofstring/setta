import { isBasePreset, isUserPreset } from "abcde-utils/src/uiTypeConstants";
import { usePaneComboboxWidth } from "hooks/usePaneComboboxWidth";
import { useAvailablePresetUITypes } from "hooks/usePresetUIType";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export default function UITypeCombobox({
  onDropdownSelect,
  selectedId,
  availableTypesProps,
}) {
  const availableUITypes = useAvailablePresetUITypes(availableTypesProps);
  const comboboxWidth = usePaneComboboxWidth();

  function itemStyleGetter(item) {
    if (isUserPreset(item)) {
      return "font-bold italic text-green-700";
    } else if (isBasePreset(item)) {
      return "font-bold text-blue-500";
    } else {
      return "text-gray-500";
    }
  }

  return (
    <IdNameCombobox
      allItems={availableUITypes}
      initialSelection={selectedId}
      onSelectedItemChange={onDropdownSelect}
      width={comboboxWidth}
      itemStyleGetter={itemStyleGetter}
    />
  );
}
