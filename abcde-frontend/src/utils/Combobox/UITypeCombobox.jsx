import { isBasePreset, isUserPreset } from "abcde-utils/src/uiTypeConstants";
import { usePaneComboboxWidth } from "hooks/usePaneComboboxWidth";
import {
  useAvailableUITypesForSectionConfig,
  useAvailableUITypesForUIConfig,
} from "hooks/usePresetUIType";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

function UITypeCombobox({
  onDropdownSelect,
  selectedId,
  availableUITypes,
  comboboxProps,
}) {
  console.log("UIConfigUITypeCombobox")
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
      {...comboboxProps}
    />
  );
}

export function SectionConfigUITypeCombobox({
  sectionId,
  onDropdownSelect,
  selectedId,
  comboboxProps,
}) {
  // const availableUITypes = useAvailableUITypesForSectionConfig(sectionId);

  return (
    <UITypeCombobox
      availableUITypes={[]}
      onDropdownSelect={onDropdownSelect}
      selectedId={selectedId}
      comboboxProps={comboboxProps}
    />
  );
}

export function UIConfigUITypeCombobox({
  sectionId,
  paramInfoId,
  onDropdownSelect,
  selectedId,
  comboboxProps,
}) {
  console.log("UIConfigUITypeCombobox")
  const availableUITypes = useAvailableUITypesForUIConfig(
    sectionId,
    paramInfoId
  );

  return (
    <UITypeCombobox
      availableUITypes={availableUITypes}
      onDropdownSelect={onDropdownSelect}
      selectedId={selectedId}
      comboboxProps={comboboxProps}
    />
  );
}
