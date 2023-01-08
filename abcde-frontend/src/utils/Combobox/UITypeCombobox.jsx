import { isBasePreset, isUserPreset } from "abcde-utils/src/uiTypeConstants";
import { usePaneComboboxWidth } from "hooks/usePaneComboboxWidth";
import {
  useAvailableUITypesForNestedSection,
  useAvailableUITypesForTopLevelSection,
  useAvailableUITypesForUIConfig,
} from "hooks/usePresetUIType";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

function UITypeCombobox({ onDropdownSelect, selectedId, availableUITypes }) {
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

export function TopLevelSectionUITypeCombobox({ sectionId, ...props }) {
  const availableUITypes = useAvailableUITypesForTopLevelSection(sectionId);
  return <UITypeCombobox availableUITypes={availableUITypes} {...props} />;
}

export function NestedSectionUITypeCombobox({ sectionId, ...props }) {
  const availableUITypes = useAvailableUITypesForNestedSection(sectionId);
  return <UITypeCombobox availableUITypes={availableUITypes} {...props} />;
}

export function UIConfigUITypeCombobox({ sectionId, paramInfoId, ...props }) {
  const availableUITypes = useAvailableUITypesForUIConfig(
    sectionId,
    paramInfoId
  );
  return <UITypeCombobox availableUITypes={availableUITypes} {...props} />;
}
