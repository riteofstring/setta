import { SectionConfigUITypeCombobox } from "utils/Combobox/UITypeCombobox";

export default function SectionConfigTypeSelection({
  onDropdownSelect,
  selectedId,
  sectionId,
}) {
  const comboboxProps = { simpleSearch: true };

  return (
    <SectionConfigUITypeCombobox
      sectionId={sectionId}
      onDropdownSelect={onDropdownSelect}
      selectedId={selectedId}
      comboboxProps={comboboxProps}
    />
  );
}
