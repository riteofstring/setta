import { isBasePreset, isUserPreset } from "abcde-utils/src/uiTypeConstants";
import {
  useAvailableUITypesForNestedSection,
  useAvailableUITypesForTopLevelSection,
  useAvailableUITypesForUIConfig,
} from "hooks/usePresetUIType";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

function UITypeCombobox({ onDropdownSelect, selectedId, availableUITypes }) {
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
      itemStyleGetter={itemStyleGetter}
    />
  );
}

export function TopLevelSectionUITypeCombobox({
  sectionId,
  selectedId,
  ...props
}) {
  const availableUITypes = useAvailableUITypesForTopLevelSection(
    sectionId,
    selectedId
  );
  return (
    <UITypeCombobox
      availableUITypes={availableUITypes}
      selectedId={selectedId}
      {...props}
    />
  );
}

export function NestedSectionUITypeCombobox({
  sectionId,
  selectedId,
  ...props
}) {
  const availableUITypes = useAvailableUITypesForNestedSection(
    sectionId,
    selectedId
  );
  return (
    <UITypeCombobox
      availableUITypes={availableUITypes}
      selectedId={selectedId}
      {...props}
    />
  );
}

export function UIConfigUITypeCombobox({
  sectionId,
  paramInfoId,
  selectedId,
  ...props
}) {
  const availableUITypes = useAvailableUITypesForUIConfig(
    sectionId,
    paramInfoId,
    selectedId
  );
  return (
    <UITypeCombobox
      availableUITypes={availableUITypes}
      selectedId={selectedId}
      {...props}
    />
  );
}
