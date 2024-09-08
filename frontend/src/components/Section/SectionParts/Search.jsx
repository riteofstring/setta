import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { useEffect, useState } from "react";
import { getKeywordPositionsAndEVRefs } from "requests/sections";
import { setSelectedItem } from "state/actions/sections/setters";
import { useCodeInfo } from "state/definitions";
import { useTextFieldWaitingForLSPResult } from "state/hooks/lsp";
import useDeepCompareEffect from "use-deep-compare-effect";
import { asyncDebounce } from "utils/utils";

export function SectionSearch({ sectionId, selectedItem }) {
  return (
    <SectionSearchCore
      sectionId={sectionId}
      selectedItem={selectedItem}
      setSelectedItem={setSelectedItem}
    />
  );
}

export function ParamSweepSectionSearch({ sectionId, selectedItem }) {
  // const sectionVariants = useGetSectionVariantNames(forSectionId).filter(
  //   (x) => !alreadySelected.includes(x.id),
  // );

  return (
    <SectionSearchCore sectionId={sectionId} selectedItem={selectedItem} />
  );
}

export function SectionSearchCore({
  sectionId,
  selectedItem,
  setSelectedItem,
}) {
  const { name: codeInfoName, keywordPositions } = useCodeInfo((x) => {
    if (selectedItem) {
      const { name, keywordPositions } = x.x[selectedItem];
      return { name, keywordPositions };
    }
    return { name: "", keywordPositions: [] };
  });

  const [value, setValue] = useState(codeInfoName);

  useEffect(() => {
    setValue(codeInfoName);
  }, [codeInfoName]);

  useDeepCompareEffect(() => {
    setLocalKeywordPositions(keywordPositions);
  }, [keywordPositions]);

  const [localKeywordPositions, setLocalKeywordPositions] =
    useState(keywordPositions);

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
    debouncedSetKeywordPositions(sectionId, value, setLocalKeywordPositions);
  }

  return (
    <>
      <TextInputCodeMirror
        dataSectionId={sectionId}
        visualSectionId={sectionId}
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
        keywordPositions={localKeywordPositions}
        setKeywordPositions={setLocalKeywordPositions}
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

const debouncedSetKeywordPositions = asyncDebounce(
  async (sectionId, value, setLocalKeywordPositions) => {
    const { keywordPositions } = await getKeywordPositionsAndEVRefs({
      sectionId,
      paramInfoId: null,
      fullText: value,
      messageIdSuffix: "-sectionSearch",
    });
    setLocalKeywordPositions(keywordPositions);
  },
  500,
);
