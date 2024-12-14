import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { useEffect, useState } from "react";
import { getKeywordPositionsAndEVRefs } from "requests/sections";
import { getSectionVariant } from "state/actions/sectionInfos";
import { setSelectedItem } from "state/actions/sections/setSelectedItem";
import { useSectionInfos } from "state/definitions";
import { useTextFieldWaitingForLSPResult } from "state/hooks/lsp";
import { useSectionVariantIsFrozen } from "state/hooks/sectionVariants";
import useDeepCompareEffect from "use-deep-compare-effect";
import { focusOnSection } from "utils/tabbingLogic";
import { asyncDebounce } from "utils/utils";

export function SectionSearch({ sectionId, selectedItem }) {
  const variantIsFrozen = useSectionVariantIsFrozen(sectionId);

  function onEnter(value) {
    // gets called inside useSectionInfos.setState
    function callbackSetAttr(id, state) {
      // for this callback, an undefined id means that the selectedItem is already selected.
      if (id !== undefined) {
        getSectionVariant(sectionId, state).selectedItem = id;
      }
    }

    setSelectedItem(sectionId, sectionId, value, true, callbackSetAttr);
  }

  return (
    <SectionSearchCore
      divId={`${sectionId}-search`}
      dataSectionId={sectionId}
      visualSectionId={sectionId}
      selectedItem={selectedItem}
      onEnter={onEnter}
      dummyCodeClassName="single-cell-child rounded-2xl border border-solid border-setta-100 bg-white py-1 focus-visible:border-white focus-visible:ring-2 dark:border-setta-800 dark:bg-setta-950 dark:focus-visible:border-setta-900 nodrag cursor-text select-text break-words px-[.625rem] font-mono mx-[.125rem] text-xs [tab-size:4] [word-break:break-word]"
      realCodeClassName="single-cell-child nodrag [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:rounded-md [&_.cm-content]:!py-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px] rounded-2xl border border-solid border-setta-100 bg-white mx-[.125rem] py-1 focus-visible:border-white focus-visible:ring-2 dark:border-setta-800 dark:bg-setta-900 dark:focus-visible:border-setta-900 [&_.cm-line]:px-[.625rem] [&_.cm-activeLine]:!bg-inherit"
      isDisabled={variantIsFrozen}
    />
  );
}

export function ParamSweepSectionSearch({
  sectionId,
  forSectionId,
  selectedItem,
  variantId,
  selectedItemIdx,
  onPlusClick,
  onMinusClick,
  disablePlusButton,
  isDisabled,
}) {
  async function onEnter(value) {
    // gets called inside useSectionInfos.setState
    function callbackSetAttr(id, state) {
      let selectedItem = id;
      // for this callback, an undefined id means that the selectedItem is already selected in the forSectionId section
      if (id === undefined) {
        selectedItem =
          state.variants[state.x[forSectionId].variantId].selectedItem;
      }
      state.variants[variantId].sweep[selectedItemIdx].selectedItem =
        selectedItem;
    }

    setSelectedItem(forSectionId, sectionId, value, true, callbackSetAttr);
  }

  return (
    <div className="section-search flex items-center justify-between gap-0.5">
      <SectionSearchCore
        dataSectionId={forSectionId}
        visualSectionId={sectionId}
        selectedItem={selectedItem}
        onEnter={onEnter}
        isDisabled={isDisabled}
        dummyCodeClassName="single-cell-child rounded-2xl w-full border border-solid border-setta-100 bg-white py-1 focus-visible:border-white focus-visible:ring-2 dark:border-setta-800 dark:bg-setta-950 dark:focus-visible:border-setta-900 nodrag cursor-text select-text break-words px-[.625rem] font-mono text-xs [tab-size:4] [word-break:break-word]"
        realCodeClassName="single-cell-child nodrag w-full [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:rounded-md [&_.cm-content]:!py-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px] rounded-2xl border border-solid border-setta-100 bg-white py-1 focus-visible:border-white focus-visible:ring-2 dark:border-setta-800 dark:bg-setta-900 dark:focus-visible:border-setta-900 [&_.cm-line]:px-[.625rem] [&_.cm-activeLine]:!bg-inherit"
      />
      <div className="flex">
        <button
          className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-setta-300 
            hover:text-setta-600 dark:text-setta-700 dark:hover:text-setta-400 [&>*]:!absolute"
          onClick={onMinusClick}
          disabled={isDisabled}
        >
          <i className="gg-remove" />
        </button>
        <button
          className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-setta-300 
            hover:text-setta-600 dark:text-setta-700 dark:hover:text-setta-400 [&>*]:!absolute"
          onClick={onPlusClick}
          disabled={disablePlusButton || isDisabled}
        >
          <i className="gg-add" />
        </button>
      </div>
    </div>
  );
}

function SectionSearchCore({
  dataSectionId,
  visualSectionId,
  selectedItem,
  onEnter,
  dummyCodeClassName,
  realCodeClassName,
  isDisabled,
  divId,
}) {
  const {
    name: codeInfoName,
    keywordPositions,
    description,
    configLanguage,
  } = useSectionInfos((x) => {
    const configLanguage = x.x[dataSectionId].configLanguage;
    if (selectedItem) {
      const { name, keywordPositions, description } = x.codeInfo[selectedItem];
      return { name, keywordPositions, description, configLanguage };
    }
    return { name: "", keywordPositions: [], description: "", configLanguage };
  }, _.isEqual);

  const [value, setValue] = useState(codeInfoName);

  useEffect(() => {
    setValue(codeInfoName);
  }, [codeInfoName]);

  useDeepCompareEffect(() => {
    setLocalKeywordPositions(keywordPositions);
  }, [keywordPositions]);

  const [localKeywordPositions, setLocalKeywordPositions] =
    useState(keywordPositions);

  function onEscape(expectingCompletions) {
    if (!expectingCompletions) {
      setValue(codeInfoName);
    }
    focusOnSection(null, visualSectionId, false);
  }

  function onTab(completionResult) {
    if (!completionResult && value) {
      onEnter(value);
    }
  }

  function onChange(value) {
    setValue(value);
    debouncedSetKeywordPositions(
      dataSectionId,
      value,
      setLocalKeywordPositions,
    );
  }

  function _onEnter() {
    onEnter(value);
  }

  return (
    <search
      className="section-search single-cell-container w-full"
      {...getFloatingBoxHandlers(description, codeInfoName)}
    >
      <TextInputCodeMirror
        dummyDivId={divId}
        dataSectionId={dataSectionId}
        visualSectionId={visualSectionId}
        paramInfoId={null}
        value={value}
        onChange={onChange}
        dummyCodeClassName={dummyCodeClassName}
        realCodeClassName={realCodeClassName}
        singleLine={true}
        onEnter={_onEnter}
        onTab={onTab}
        onEscape={onEscape}
        language={configLanguage}
        keywordPositions={localKeywordPositions}
        setKeywordPositions={setLocalKeywordPositions}
        isDisabled={isDisabled}
      />
      <LoadingSpinner sectionId={dataSectionId} />
    </search>
  );
}

function LoadingSpinner({ sectionId }) {
  const waitingForResult = useTextFieldWaitingForLSPResult({
    sectionId,
    paramInfoId: null,
  });
  // const waitingForResult = true;
  return (
    waitingForResult && (
      <i className="single-cell-child gg-spinner mr-2 self-center justify-self-end text-blue-500/70" />
    )
  );
}

const debouncedSetKeywordPositions = asyncDebounce(
  async (sectionId, value, setLocalKeywordPositions) => {
    const { keywordPositions } = await getKeywordPositionsAndEVRefs({
      sectionId,
      paramInfoId: null,
      fullText: value,
    });
    setLocalKeywordPositions(keywordPositions);
  },
  500,
);
