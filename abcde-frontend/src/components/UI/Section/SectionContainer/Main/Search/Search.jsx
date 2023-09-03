import { NULL_OBJ_ID } from "abcde-utils/src/constants";
import { useGetAllCallables } from "hooks/useSectionContents";
import { useCodeCompletionWebsocketRoom } from "hooks/useWebsocket";
import _ from "lodash";
import { useEffect } from "react";
import { setSelectedItem } from "thunks/sections/setters";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";
import { groupedObjInfo } from "utils/getFullObjPath";

export function SectionSearch({ sectionId, initialSelection, inputClasses }) {
  const [completions, sendCompletionRequest] = useCodeCompletionWebsocketRoom();
  const _searchableItems = useGetAllCallables(sectionId);
  const searchableItems = [...completions, ..._searchableItems];
  const groupedItems = groupedObjInfo(searchableItems);
  const groupedItemsAsList = Object.keys(groupedItems).map((k) => ({
    group: k,
    items: groupedItems[k],
  }));
  const hasSearchableItems = groupedItemsAsList.length > 0;

  function onSelectedItemChange(value, changedByUser) {
    setSelectedItem(sectionId, value, changedByUser);
  }

  const inputCallback = _.debounce(
    (value) => sendCompletionRequest(value),
    100
  );

  // searchableItems becomes empty, then set the selected item to null
  useEffect(() => {
    if (!hasSearchableItems && initialSelection !== NULL_OBJ_ID) {
      onSelectedItemChange(NULL_OBJ_ID);
    }
  }, [hasSearchableItems]);

  return (
    <IdNameCombobox
      allItems={groupedItemsAsList}
      onSelectedItemChange={onSelectedItemChange}
      initialSelection={initialSelection}
      inputClasses={inputClasses}
      inputCallback={inputCallback}
    />
  );
}
