import { onlySectionTypes } from "hooks/usePresetUIType";
import { StandardDropDown } from "utils/StandardDropdown/StandardDropdown";

export default function SectionConfigTypeSelection({
  onDropdownSelect,
  selectedId,
}) {
  const availableUITypes = useAvailablePresetUITypes(
    selectedId,
    onlySectionTypes
  );

  function onSelect(e) {
    onDropdownSelect(e.target.value);
  }

  return (
    <StandardDropDown
      placeholder="Select Section Type"
      onChange={onSelect}
      options={availableUITypes}
      curr={selectedId}
    />
  );
}
