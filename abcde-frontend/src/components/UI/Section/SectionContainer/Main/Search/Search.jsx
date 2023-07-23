import { NULL_OBJ_ID } from "abcde-utils/src/constants";
import { useGroupedObjInfos } from "hooks/useImmutableInfo";
import { useGetAllCallables } from "hooks/useSectionContents";
import { useEffect } from "react";
import { setSelectedItem } from "thunks/sections/sections";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export function SectionSearch({ sectionId, initialSelection, inputClasses }) {
  const searchableItems = useGetAllCallables(sectionId);
  const groupedItems = useGroupedObjInfos(searchableItems);
  const groupedItemsAsList = Object.keys(groupedItems).map((k) => ({
    group: k,
    items: groupedItems[k],
  }));
  const hasSearchableItems = groupedItemsAsList.length > 0;

  function onSelectedItemChange(value, changedByUser) {
    setSelectedItem(sectionId, value, changedByUser);
  }

  // searchableItems becomes empty, then set the selected item to null
  useEffect(() => {
    if (!hasSearchableItems && initialSelection !== NULL_OBJ_ID) {
      onSelectedItemChange(NULL_OBJ_ID);
    }
  }, [hasSearchableItems]);

  return (
    hasSearchableItems && (
      <IdNameCombobox
        allItems={groupedItemsAsList}
        onSelectedItemChange={onSelectedItemChange}
        initialSelection={initialSelection}
        inputClasses={inputClasses}
      />
    )
  );
}
