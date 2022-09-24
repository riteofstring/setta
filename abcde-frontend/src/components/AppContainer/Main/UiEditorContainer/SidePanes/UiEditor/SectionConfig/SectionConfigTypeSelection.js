import { usePaneComboboxWidth } from "hooks/usePaneComboboxWidth";
import { useAvailablePresetUITypes } from "hooks/usePresetUIType";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";
import { BASE, USER } from "utils/uiTypeConstants";

export default function SectionConfigTypeSelection({
  onDropdownSelect,
  selectedId,
  sectionId,
  simpleSearch,
}) {
  const availableUITypes = useAvailablePresetUITypes({
    sectionId,
    settingSectionConfig: true,
  });

  const comboboxWidth = usePaneComboboxWidth();

  function itemStyleGetter(item) {
    if (item.presetType === USER) {
      return {
        weight: "700",
        fontStyle: "italic",
        color: "green.700",
      };
    } else if (item.presetType === BASE) {
      return { weight: "700", color: "blue.500" };
    } else {
      return { color: "grey.500" };
    }
  }

  return (
    <IdNameCombobox
      allItems={availableUITypes}
      initialSelection={selectedId}
      onSelectedItemChange={onDropdownSelect}
      simpleSearch={simpleSearch}
      width={comboboxWidth}
      itemStyleGetter={itemStyleGetter}
    />
  );
}
