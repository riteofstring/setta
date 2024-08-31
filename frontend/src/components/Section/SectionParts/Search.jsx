import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { useEffect, useState } from "react";
import { getKeywordPositionsAndEVRefs } from "requests/sections";
import { setSelectedItem } from "state/actions/sections/setters";
import { useCodeInfo, useTempKeywordPositions } from "state/definitions";
import { useTextFieldWaitingForLSPResult } from "state/hooks/lsp";
import { asyncDebounce } from "utils/utils";

export function SectionSearch({ sectionId, selectedItem }) {
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

  const codeInfoName = useCodeInfo((x) =>
    selectedItem ? x.x[selectedItem].name : "",
  );

  const [value, setValue] = useState(codeInfoName);

  useEffect(() => {
    setValue(codeInfoName);
  }, [codeInfoName]);

  function onEnter() {
    setSelectedItem(sectionId, value, true);
  }

  function onEscape(view) {
    view.contentDOM.blur();
  }

  function onBlur() {
    setValue(codeInfoName);
  }

  function onChange(value) {
    setValue(value);
    debouncedSetKeywordPositions(sectionId, value);
  }

  return (
    <>
      <TextInputCodeMirror
        sectionId={sectionId}
        paramInfoId={null}
        value={value}
        onChange={onChange}
        dummyCodeClassName="section-search rounded-2xl border border-solid border-setta-100 bg-white py-1 focus-visible:border-white focus-visible:ring-2 dark:border-setta-800 dark:bg-setta-950 dark:focus-visible:border-setta-900 nodrag cursor-text select-text break-words px-[.625rem] font-mono mx-[.125rem] text-xs [tab-size:4] [word-break:break-word]"
        realCodeClassName="nodrag [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:rounded-md [&_.cm-content]:!py-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px] section-search rounded-2xl border border-solid border-setta-100 bg-white mx-[.125rem] py-1 focus-visible:border-white focus-visible:ring-2 dark:border-setta-800 dark:bg-setta-900 dark:focus-visible:border-setta-900 [&_.cm-line]:px-[.625rem] [&_.cm-activeLine]:!bg-inherit"
        singleLine={true}
        onEnter={onEnter}
        onEscape={onEscape}
        onBlur={onBlur}
        language="python"
        sectionIdToBeActive={sectionId}
      />
      <LoadingSpinner sectionId={sectionId} />
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

function LoadingSpinner({ sectionId }) {
  const waitingForResult = useTextFieldWaitingForLSPResult({
    sectionId,
    paramInfoId: null,
  });
  return (
    waitingForResult && (
      <i className="section-search gg-spinner mr-2 self-center justify-self-end text-blue-500/70" />
    )
  );
}

const debouncedSetKeywordPositions = asyncDebounce(async (sectionId, value) => {
  const { keywordPositions } = await getKeywordPositionsAndEVRefs({
    sectionId,
    paramInfoId: null,
    fullText: value,
    messageIdSuffix: "-sectionSearch",
  });
  useTempKeywordPositions.setState({
    [`${sectionId}-${null}`]: keywordPositions,
  });
}, 500);
