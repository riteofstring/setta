import { useFindAllCallables } from "hooks/useSectionContents";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export default function SectionSearch({
  sectionId,
  onSelectedItemChange,
  initialSelection,
}) {
  const searchableItems = useFindAllCallables(sectionId);
  return (
    searchableItems.length > 0 && (
      <IdNameCombobox
        allItems={searchableItems}
        onSelectedItemChange={onSelectedItemChange}
        initialSelection={initialSelection}
        width="424px"
      />
    )
  );
}
