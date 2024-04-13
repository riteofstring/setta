import { useCodeInfo } from "models/info/codeInfo";
import { useState } from "react";
import { setSelectedItem } from "thunks/sections/setters";
import { TextInputCodeMirror } from "utils/CodeMirror/TextInputCodeMirror";

export function SectionSearch({ sectionId, initialSelection }) {
  // const [completions, sendCompletionRequest] =
  //   useCodeCompletionWebsocketRoom(sectionId);
  // const _searchableItems = useGetAllCallables(sectionId);
  // const searchableItems = mergeCompletionsAndHistory(
  //   completions,
  //   _searchableItems,
  // );
  // const groupedItems = groupedObjInfo(searchableItems);
  // const groupedItemsAsList = Object.keys(groupedItems).map((k) => ({
  //   group: k,
  //   items: groupedItems[k],
  // }));
  // const hasSearchableItems = groupedItemsAsList.length > 0;

  // function onSelectedItemChange(value, changedByUser) {
  //   setSelectedItem(sectionId, value, changedByUser);
  // }

  // function onInputMouseDown() {
  //   dbTextFieldInitializeCode({ sectionId, paramInfoId: null });
  // }

  // // searchableItems becomes empty, then set the selected item to null
  // useEffect(() => {
  //   if (!hasSearchableItems && initialSelection) {
  //     onSelectedItemChange(null);
  //   }
  // }, [hasSearchableItems]);

  // const isSearchResult = useProjectSearch((x) =>
  //   x.codeInfo.includes(initialSelection),
  // );

  // return (
  //   <IdNameCombobox
  //     allItems={groupedItemsAsList}
  //     onSelectedItemChange={onSelectedItemChange}
  //     initialSelection={initialSelection}
  //     outerDivClasses={`${isSearchResult ? "outline outline-green-400" : ""}`}
  //     inputCallback={sendCompletionRequest}
  //     onInputMouseDown={onInputMouseDown}
  //     isStandardSearch={true}
  //   />
  // );

  const [value, setValue] = useState(
    initialSelection ? useCodeInfo.getState().x[initialSelection].name : "",
  );

  function onEnter() {
    setSelectedItem(sectionId, value, true);
  }

  // return (
  //   <TextInputCodeMirror
  //     sectionId={sectionId}
  //     paramInfoId={null}
  //     value={value}
  //     onChange={setValue}
  //     className={`nodrag card-search flex h-8 w-full flex-col items-stretch overflow-visible`}
  //     singleLine={true}
  //     onEnter={onEnter}
  //   />
  // );
}

function mergeCompletionsAndHistory(completions, history) {
  const existingNames = new Set(history.map((x) => x.name));
  const filteredCompletions = completions.filter(
    (x) => !existingNames.has(x.name),
  );
  return [...filteredCompletions, ...history];
}
