import UITypeCombobox from "utils/Combobox/UITypeCombobox";

export default function SectionConfigTypeSelection({
  onDropdownSelect,
  selectedId,
  sectionId,
}) {
  const availableTypesProps = {
    sectionId,
    settingSectionConfig: true,
  };

  return (
    <UITypeCombobox
      onDropdownSelect={onDropdownSelect}
      selectedId={selectedId}
      availableTypesProps={availableTypesProps}
    />
  );
}
