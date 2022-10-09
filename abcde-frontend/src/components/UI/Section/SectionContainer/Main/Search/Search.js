import { useFindAllCallables } from "hooks/useSectionContents";
import { useEffect } from "react";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export default function SectionSearch({
  sectionId,
  onSelectedItemChange,
  initialSelection,
}) {
  const searchableItems = useFindAllCallables(sectionId);

  // searchableItems becomes empty, then set the selected item to null
  useEffect(() => {
    if (searchableItems.length === 0 && initialSelection) {
      onSelectedItemChange(null);
    }
  }, [searchableItems.length]);

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
