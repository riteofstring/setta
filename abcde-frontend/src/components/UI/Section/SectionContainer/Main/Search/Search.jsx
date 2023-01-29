import { NULL_OBJ_ID } from "abcde-utils/src/constants";
import { useGetAllCallables } from "hooks/useSectionContents";
import { useEffect } from "react";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export function SectionSearch({
  sectionId,
  onSelectedItemChange,
  initialSelection,
}) {
  const searchableItems = useGetAllCallables(sectionId);
  const numSearchableItems = searchableItems.length;

  // searchableItems becomes empty, then set the selected item to null
  useEffect(() => {
    if (numSearchableItems === 0 && initialSelection !== NULL_OBJ_ID) {
      onSelectedItemChange(NULL_OBJ_ID);
    }
  }, [numSearchableItems]);

  return (
    numSearchableItems > 0 && (
      <IdNameCombobox
        allItems={searchableItems}
        onSelectedItemChange={onSelectedItemChange}
        initialSelection={initialSelection}
        width="424px"
      />
    )
  );
}
