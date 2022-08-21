import { usePaneComboboxWidth } from "hooks/usePaneComboboxWidth";
import { useAvailablePresetUITypes } from "hooks/usePresetUIType";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export default function SectionConfigTypeSelection({
  onDropdownSelect,
  selectedId,
  sectionId,
  paramInfoId,
  simpleSearch,
}) {
  const availableUITypes = useAvailablePresetUITypes({
    sectionId,
    paramInfoId,
    settingSectionConfig: true,
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
