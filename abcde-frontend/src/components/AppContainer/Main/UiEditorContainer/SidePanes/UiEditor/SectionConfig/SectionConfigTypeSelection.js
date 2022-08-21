import { usePaneComboboxWidth } from "hooks/usePaneComboboxWidth";
import {
  onlySectionTypes,
  useAvailablePresetUITypes,
} from "hooks/usePresetUIType";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export default function SectionConfigTypeSelection({
  onDropdownSelect,
  selectedId,
  sectionId,
  simpleSearch,
}) {
  const availableUITypes = useAvailablePresetUITypes({
    sectionId,
    filterFn: onlySectionTypes,
  });

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
