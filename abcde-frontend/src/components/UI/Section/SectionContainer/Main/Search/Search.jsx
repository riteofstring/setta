import { NULL_OBJ_ID } from "abcde-utils/src/constants";
import { useGetAllCallables } from "hooks/useSectionContents";
import { useEffect } from "react";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export default function SectionSearch({
  sectionId,
  onSelectedItemChange,
  initialSelection,
}) {
  const searchableItems = useGetAllCallables(sectionId);

  // searchableItems becomes empty, then set the selected item to null
  useEffect(() => {
    if (searchableItems.length === 0 && initialSelection) {
      onSelectedItemChange(NULL_OBJ_ID);
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
