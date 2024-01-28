import { useGetAllCallables } from "hooks/useSectionContents";
import {
  textFieldInitializeCode,
  useCodeCompletionWebsocketRoom,
} from "hooks/useWebsocket";
import { useEffect } from "react";
import { setSelectedItem } from "thunks/sections/setters";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";
import { groupedObjInfo } from "utils/getFullObjPath";

export function SectionSearch({
  sectionId,
  initialSelection,
  outerDivClasses,
}) {
  const [completions, sendCompletionRequest] =
    useCodeCompletionWebsocketRoom(sectionId);
  const _searchableItems = useGetAllCallables(sectionId);
  const searchableItems = mergeCompletionsAndHistory(
    completions,
    _searchableItems
  );
  const groupedItems = groupedObjInfo(searchableItems);
  const groupedItemsAsList = Object.keys(groupedItems).map((k) => ({
    group: k,
    items: groupedItems[k],
  }));
  const hasSearchableItems = groupedItemsAsList.length > 0;

  function onSelectedItemChange(value, changedByUser) {
    setSelectedItem(sectionId, value, changedByUser);
  }

  function onInputMouseDown() {
    textFieldInitializeCode(sectionId, null);
  }

  // searchableItems becomes empty, then set the selected item to null
  useEffect(() => {
    if (!hasSearchableItems && initialSelection) {
      onSelectedItemChange(null);
    }
  }, [hasSearchableItems]);

  return (
    <IdNameCombobox
      allItems={groupedItemsAsList}
      onSelectedItemChange={onSelectedItemChange}
      initialSelection={initialSelection}
      outerDivClasses={outerDivClasses}
      inputCallback={sendCompletionRequest}
      onInputMouseDown={onInputMouseDown}
    />
  );
}

function mergeCompletionsAndHistory(completions, history) {
  const existingNames = new Set(history.map((x) => x.name));
  const filteredCompletions = completions.filter(
    (x) => !existingNames.has(x.name)
  );
  return [...filteredCompletions, ...history];
}
