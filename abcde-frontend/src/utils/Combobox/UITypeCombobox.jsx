import { usePaneComboboxWidth } from "hooks/usePaneComboboxWidth";
import { useAvailablePresetUITypes } from "hooks/usePresetUIType";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";
import { BASE, USER } from "utils/uiTypeConstants";

export default function UITypeCombobox({
  onDropdownSelect,
  selectedId,
  availableTypesProps,
  comboboxProps,
}) {
  const availableUITypes = useAvailablePresetUITypes(availableTypesProps);
  const comboboxWidth = usePaneComboboxWidth();

  function itemStyleGetter(item) {
    if (item.presetType === USER) {
      return "font-bold italic text-green-700";
    } else if (item.presetType === BASE) {
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
      {...comboboxProps}
    />
  );
}
