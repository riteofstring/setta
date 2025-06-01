import { TextInputCodeMirror } from "components/Utils/CodeMirror/TextInputCodeMirror";
import { getFloatingBoxHandlers } from "components/Utils/FloatingBox";
import _ from "lodash";
import { useCallback, useEffect, useRef, useState } from "react";
import { updateBackendProjectState } from "state/actions/project/generateCode";
import { getSectionVariant } from "state/actions/sectionInfos";
import { setSelectedItem } from "state/actions/sections/setSelectedItem";
import { useProjectState } from "state/definitions";
import { useTextFieldWaitingForLSPResult } from "state/hooks/lsp";
import { useSectionVariantIsFrozen } from "state/hooks/sectionVariants";
import { NO_PAN_CLASS_NAME } from "utils/constants";
import { focusOnSection } from "utils/tabbingLogic";

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
    setSelectedItem(sectionId, sectionId, value, callbackSetAttr);
  }

  function onShiftEnter(value) {
    setSelectedItem(sectionId, sectionId, value, callbackSetAttr, true);
  }

  return (
    <SectionSearchCore
      divId={`${sectionId}-search`}
      sectionId={sectionId}
      selectedItem={selectedItem}
      onEnter={onEnter}
      onShiftEnter={onShiftEnter}
      dummyCodeClassName={`${NO_PAN_CLASS_NAME} single-cell-child rounded-2xl border border-solid border-setta-100 bg-white py-1 dark:border-setta-800 dark:bg-setta-950 nodrag cursor-text select-text break-words px-[.625rem] font-mono mx-[.125rem] text-xs [tab-size:4] [word-break:break-word]`}
      realCodeClassName={`${NO_PAN_CLASS_NAME} single-cell-child nodrag [&_*]:!outline-0 cursor-text select-text [&_.cm-activeLine]:rounded-md [&_.cm-content]:!py-0 [&_.cm-content]:text-xs first:[&_.cm-line>*]:mt-[3px] rounded-2xl border border-solid border-blue-500 bg-white mx-[.125rem] py-1  dark:border-blue-400/50 dark:bg-setta-950 [&_.cm-line]:px-[.625rem] [&_.cm-activeLine]:!bg-inherit`}
      isDisabled={variantIsFrozen}
    />
  );
}

function SectionSearchCore({
  sectionId,
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
    description,
    configLanguage,
  } = useProjectState((x) => {
    const { configLanguage } = getSectionVariant(sectionId, x);
    if (selectedItem) {
      const { name, description } = x.codeInfo[selectedItem];
      return { name, description, configLanguage };
    }
    return { name: "", description: "", configLanguage };
  }, _.isEqual);

  const [value, setValue] = useState(codeInfoName);
  const [valueNameInconsistent, setValueNameInconsistent] = useState(false);
  const shouldResetValueOnBlur = useRef(false);

  const debouncedSetValueNameInconsistent = useCallback(
    _.debounce((x) => {
      setValueNameInconsistent(x);
    }, 1000),
    [setValueNameInconsistent],
  );

  function setValueAndCheckConsistency(value, cancelDebounced = false) {
    setValue(value);
    if (cancelDebounced) {
      debouncedSetValueNameInconsistent.cancel();
      setValueNameInconsistent(false);
    } else {
      debouncedSetValueNameInconsistent(value !== codeInfoName);
    }
  }

  useEffect(() => {
    setValueAndCheckConsistency(codeInfoName, true);
  }, [codeInfoName]);

  function onBlur() {
    if (shouldResetValueOnBlur.current) {
      setValueAndCheckConsistency(codeInfoName, true);
      // we have to explicitly call this here because the global state
      // won't have captured any intermediate updates
      updateBackendProjectState();
    }
    shouldResetValueOnBlur.current = false;
  }

  function onEscape(completionResult) {
    if (!completionResult) {
      shouldResetValueOnBlur.current = true;
      focusOnSection(null, sectionId, false);
    }
  }

  function onTab(completionResult) {
    if (!completionResult && value) {
      shouldResetValueOnBlur.current = false;
      onEnter(value);
    }
  }

  function onChange(value) {
    setValueAndCheckConsistency(value);
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

  // TODO: Shouldn't use important for this, but ok for now. FIX.
  const valueNameInconsistentStyle = valueNameInconsistent
    ? "!border-amber-500 dark:!border-amber-800"
    : "";

  return (
    <search
      className="section-search single-cell-container w-full"
      {...getFloatingBoxHandlers({ title: codeInfoName, content: description })}
    >
      <TextInputCodeMirror
        dummyDivId={divId}
        sectionId={sectionId}
        paramInfoId={null}
        value={value}
        onBlur={onBlur}
        onChange={onChange}
        dummyCodeClassName={`${dummyCodeClassName} ${valueNameInconsistentStyle}`}
        realCodeClassName={`${realCodeClassName} ${valueNameInconsistentStyle}`}
        singleLine={true}
        keyComboActions={keyComboActions}
        onTab={onTab}
        onEscape={onEscape}
        language={configLanguage}
        isDisabled={isDisabled}
      />
      <LoadingSpinner sectionId={sectionId} />
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
