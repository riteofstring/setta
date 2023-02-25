import { NULL_OBJ_ID } from "abcde-utils/src/constants";
import { useGroupedObjInfos } from "hooks/useImmutableInfo";
import { useGetAllCallables } from "hooks/useSectionContents";
import { useSetReactFlowActiveSectionOnClick } from "hooks/useSetReactFlowActiveSectionOnClick";
import { useEffect } from "react";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

export function SectionSearch({
  sectionId,
  onSelectedItemChange,
  initialSelection,
}) {
  const onClick = useSetReactFlowActiveSectionOnClick(sectionId);
  const searchableItems = useGetAllCallables(sectionId);
  const groupedItems = useGroupedObjInfos(searchableItems);
  const groupedItemsAsList = Object.keys(groupedItems).map((k) => ({
    group: k,
    items: groupedItems[k],
  }));
  const hasSearchableItems = groupedItemsAsList.length > 0;

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
        onClick={onClick}
      />
    )
  );
}
