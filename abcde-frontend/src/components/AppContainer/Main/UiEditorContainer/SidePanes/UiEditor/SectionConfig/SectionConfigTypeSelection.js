import { usePaneComboboxWidth } from "hooks/usePaneComboboxWidth";
import {
  onlySectionTypes,
  useAvailablePresetUITypes,
} from "hooks/usePresetUIType";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export default function SectionConfigTypeSelection({
  onDropdownSelect,
  selectedId,
  simpleSearch,
}) {
  const availableUITypes = useAvailablePresetUITypes(
    selectedId,
    onlySectionTypes
  );

  const comboboxWidth = usePaneComboboxWidth();

  return (
    <IdNameCombobox
      allItems={availableUITypes}
      initialSelection={selectedId}
      onSelectedItemChange={onDropdownSelect}
      simpleSearch={simpleSearch}
      width={comboboxWidth}
    />
  );
}
