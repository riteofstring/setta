import { useState } from "react";
import { setSelectedItem } from "state/actions/setters";
import { useCodeInfo } from "state/definitions/codeInfo";
import { useIdWaitingForLSPResult } from "state/hooks/lsp";
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
  //   />
  // );

  const [value, setValue] = useState(
    initialSelection ? useCodeInfo.getState().x[initialSelection].name : "",
  );

  function onEnter() {
    setSelectedItem(sectionId, value, true);
  }

  return (
    <>
      <TextInputCodeMirror
        sectionId={sectionId}
        paramInfoId={null}
        value={value}
        onChange={setValue}
        className="card-search rounded-2xl border border-solid border-setta-100 bg-white py-[.33rem] focus-visible:border-white focus-visible:ring-2 dark:border-setta-800 dark:bg-setta-900 dark:focus-visible:border-setta-900"
        variants="[&_.cm-line]:pl-3 [&_.cm-line]:pr-3 [&_.cm-activeLine]:!bg-inherit"
        classes="px-3"
        singleLine={true}
        onEnter={onEnter}
      />
      <LoadingSpinner sectionId={sectionId} paramInfoId={null} />
    </>
  );
}

function mergeCompletionsAndHistory(completions, history) {
  const existingNames = new Set(history.map((x) => x.name));
  const filteredCompletions = completions.filter(
    (x) => !existingNames.has(x.name),
  );
  return [...filteredCompletions, ...history];
}

function LoadingSpinner({ sectionId, paramInfoId }) {
  const waitingForResult = useIdWaitingForLSPResult({ sectionId, paramInfoId });
  return (
    waitingForResult && (
      <i className="card-search gg-spinner mr-2 self-center justify-self-end text-blue-500/70" />
    )
  );
}
