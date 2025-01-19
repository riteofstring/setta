import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import { getEVRefs } from "requests/sections";
import { openRenameSelectedItemCodeInfoModal } from "state/actions/modal";
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

  function callbackSetAttr(id, state) {
    // for this callback, an undefined id means that the selectedItem is already selected.
    if (id !== undefined) {
      getSectionVariant(sectionId, state).selectedItem = id;
    }
  }

  function onEnter(value) {
    // gets called inside useSectionInfos.setState
    setSelectedItem(sectionId, sectionId, value, true, callbackSetAttr);
  }

  function onShiftEnter(value) {
    setSelectedItem(sectionId, sectionId, value, true, callbackSetAttr, true);
  }

  return (
    <SectionSearchCore
      divId={`${sectionId}-search`}
      dataSectionId={sectionId}
      visualSectionId={sectionId}
      selectedItem={selectedItem}
      onEnter={onEnter}
      onShiftEnter={onShiftEnter}
      dummyCodeClassName="single-cell-child rounded-2xl border border-solid border-setta-100 bg-white py-1 dark:border-setta-800 dark:bg-setta-950 nodrag cursor-text select-text break-words px-[.625rem] font-mono mx-[.125rem] text-xs [tab-size:4] [word-break:break-word]"
      realCodeClassName="single-cell-child nodrag [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:rounded-md [&_.cm-content]:!py-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px] rounded-2xl border border-solid border-blue-500 bg-white mx-[.125rem] py-1  dark:border-blue-400/50 dark:bg-setta-950 [&_.cm-line]:px-[.625rem] [&_.cm-activeLine]:!bg-inherit"
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

  function onShiftEnter(value) {}

  return (
    <div className="section-search flex items-center justify-between gap-0.5">
      <SectionSearchCore
        dataSectionId={forSectionId}
        visualSectionId={sectionId}
        selectedItem={selectedItem}
        onEnter={onEnter}
        onShiftEnter={onShiftEnter}
        isDisabled={isDisabled}
        dummyCodeClassName="single-cell-child rounded-2xl border border-solid border-setta-100 bg-white py-1 dark:border-setta-800 dark:bg-setta-950 nodrag cursor-text select-text break-words px-[.625rem] font-mono mx-[.125rem] text-xs [tab-size:4] [word-break:break-word]"
        realCodeClassName="single-cell-child nodrag [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:rounded-md [&_.cm-content]:!py-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px] rounded-2xl border border-solid border-blue-500 bg-white mx-[.125rem] py-1  dark:border-blue-400/50 dark:bg-setta-950 [&_.cm-line]:px-[.625rem] [&_.cm-activeLine]:!bg-inherit"
      />
      <div className="flex">
        <button
          className="flex h-[22px] cursor-pointer rounded-full text-setta-300 
            hover:text-setta-600 dark:text-setta-700 dark:hover:text-setta-400 [&>i]:focus-visible:!border-blue-500"
          onClick={onMinusClick}
          disabled={isDisabled}
        >
          <i className="gg-remove" />
        </button>
        <button
          className="flex h-[22px] cursor-pointer rounded-full text-setta-300 
            hover:text-setta-600 dark:text-setta-700 dark:hover:text-setta-400 [&>i]:focus-visible:!border-blue-500"
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
  onShiftEnter,
  dummyCodeClassName,
  realCodeClassName,
  isDisabled,
  divId,
}) {
  const {
    name: codeInfoName,
    evRefs,
    description,
    configLanguage,
  } = useSectionInfos((x) => {
    const configLanguage = x.x[dataSectionId].configLanguage;
    if (selectedItem) {
      const { name, evRefs, description } = x.codeInfo[selectedItem];
      return { name, evRefs, description, configLanguage };
    }
    return { name: "", evRefs: [], description: "", configLanguage };
  }, _.isEqual);

  const [value, setValue] = useState(codeInfoName);
  const onBlurToDo = useRef("rename");

  useEffect(() => {
    setValue(codeInfoName);
  }, [codeInfoName]);

  useDeepCompareEffect(() => {
    setLocalEVRefs(evRefs);
  }, [evRefs]);

  const [localEVRefs, setLocalEVRefs] = useState(evRefs);

  function onBlur() {
    console.log("onBlur");
    if (onBlurToDo.current === "rename" && selectedItem) {
      openRenameSelectedItemCodeInfoModal(
        dataSectionId,
        selectedItem,
        codeInfoName,
        value,
      );
      // useSectionInfos.setState((state) => {
      //   state.codeInfo[selectedItem].name = value;
      // });
    } else if (onBlurToDo.current === "reset") {
      // to prevent onBlur from being triggered twice
      requestAnimationFrame(() => {
        setValue(codeInfoName);
      });
    }
    onBlurToDo.current = "rename";
  }

  function onEscape(completionResult) {
    if (!completionResult) {
      onBlurToDo.current = "reset";
      focusOnSection(null, visualSectionId, false);
    }
  }

  function onTab(completionResult) {
    if (!completionResult && value) {
      onBlurToDo.current = "rename";
      onEnter(value);
    }
  }

  function onChange(value) {
    setValue(value);
    debouncedSetEVRefs(dataSectionId, value, setLocalEVRefs);
  }

  function _onEnter() {
    onEnter(value);
  }

  function _onShiftEnter() {
    onShiftEnter(value);
  }

  const keyComboActions = {
    Enter: _onEnter,
    "Alt-Enter": _onShiftEnter,
  };

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
        onBlur={onBlur}
        onChange={onChange}
        dummyCodeClassName={dummyCodeClassName}
        realCodeClassName={realCodeClassName}
        singleLine={true}
        keyComboActions={keyComboActions}
        onTab={onTab}
        onEscape={onEscape}
        language={configLanguage}
        evRefs={localEVRefs}
        setEVRefs={setLocalEVRefs}
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

const debouncedSetEVRefs = asyncDebounce(
  async (sectionId, value, setLocalEVRefs) => {
    const evRefs = await getEVRefs({
      sectionId,
      paramInfoId: null,
      fullText: value,
    });
    setLocalEVRefs(evRefs);
  },
  500,
);
