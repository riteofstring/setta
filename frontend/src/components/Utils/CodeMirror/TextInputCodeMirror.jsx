import CodeMirror from "@uiw/react-codemirror";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import { useCallback, useMemo, useState } from "react";
import {
  dbTextFieldCompletion,
  dbTextFieldInitializeCode,
} from "requests/sections";
import { variableClick } from "state/actions/keyActivations";
import { setActiveSectionIdAndUpdateZIndex } from "state/actions/sections/activeSections";
import { DummyCodeMirror } from "./DummyCodeMirror";
import { getExtensions } from "./getExtensions";
import { getKeywordStylizer } from "./getKeywordStylizer";
import { getCompletionsFn, getOnCreateEditor } from "./getOnCreateEditor";

export function TextInputCodeMirror({
  dataSectionId,
  visualSectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  onBlur,
  dummyCodeClassName,
  realCodeClassName,
  singleLine,
  onEnter,
  onEscape,
  onTab,
  color,
  language,
  keywordPositions,
  setKeywordPositions,
  autocomplete = true,
  initializeGenCode = true,
  isKeyName = false,
  isDisabled = false,
}) {
  const [activationEvent, setActivationEvent] = useState(null);
  const [realIsInitialized, setRealIsInitialized] = useState(false);
  const theme = useCodeMirrorStyle(color);

  function localOnBlur() {
    // hack to prevent codemirror from
    // blocking other inputs on blur
    // https://github.com/uiwjs/react-codemirror/issues/677
    setTimeout(() => {
      setActivationEvent(null);
      setRealIsInitialized(false);
    }, 0);
    onBlur?.();
  }

  function localOnMouseDown(event) {
    if (isDisabled) {
      return;
    }
    // if (!variableClick(event)) {
    if (!variableClick(event) && event.button === 0) {
      setActivationEvent(event);
      setActiveSectionIdAndUpdateZIndex(visualSectionId);
    }
  }

  // focused via tab key
  function onFocus() {
    if (isDisabled) {
      return;
    }
    if (language === "python" && initializeGenCode) {
      dbTextFieldInitializeCode({ sectionId: dataSectionId, paramInfoId });
    }
    if (!activationEvent) {
      setActivationEvent("tab");
    }
  }

  return (
    <>
      {!realIsInitialized && (
        <DummyCodeMirror
          code={value}
          onMouseDown={localOnMouseDown}
          onFocus={onFocus}
          className={dummyCodeClassName}
          theme={theme}
          keywordPositions={keywordPositions}
          placeholder={defaultVal}
          language={language}
        />
      )}
      {activationEvent && (
        <CoreCodeMirror
          dataSectionId={dataSectionId}
          visualSectionId={visualSectionId}
          paramInfoId={paramInfoId}
          value={value}
          defaultVal={defaultVal}
          onChange={onChange}
          className={realCodeClassName}
          singleLine={singleLine}
          onEnter={onEnter}
          onEscape={onEscape}
          onTab={onTab}
          onBlur={localOnBlur}
          initialEvent={activationEvent}
          realIsInitialized={realIsInitialized}
          setRealIsInitialized={setRealIsInitialized}
          theme={theme}
          keywordPositions={keywordPositions}
          setKeywordPositions={setKeywordPositions}
          language={language}
          autocomplete={autocomplete}
          isKeyName={isKeyName}
        />
      )}
    </>
  );
}

function CoreCodeMirror({
  dataSectionId,
  visualSectionId,
  paramInfoId,
  value,
  defaultVal,
  onChange,
  className,
  singleLine,
  onEnter,
  onEscape,
  onBlur,
  onTab,
  initialEvent,
  realIsInitialized,
  setRealIsInitialized,
  theme,
  keywordPositions,
  setKeywordPositions,
  language,
  autocomplete,
  isKeyName,
}) {
  const divId = `CodeMirror-${visualSectionId}-${paramInfoId}${isKeyName ? "-keyName" : ""}`;

  const keywordStylizer = useMemo(
    () => getKeywordStylizer(keywordPositions),
    [JSON.stringify(keywordPositions)],
  );

  const completionsFn = useCallback(
    autocomplete
      ? getCompletionsFn(
          dataSectionId,
          paramInfoId,
          dbTextFieldCompletion,
          setKeywordPositions,
          language,
        )
      : () => null,
    [dataSectionId, paramInfoId, autocomplete, language],
  );

  const extensions = getExtensions({
    sectionId: visualSectionId,
    language,
    completionsFn,
    keywordStylizer,
    singleLine,
    tabToAutocomplete: true,
    onEnter,
    onTab,
    onEscape,
  });

  const onCreateEditor = getOnCreateEditor({
    keywordPositions,
    initialEvent,
    setRealIsInitialized,
    divId,
    value,
    defaultVal,
  });

  return (
    <CodeMirror
      id={divId}
      className={`${className} ${!realIsInitialized ? "opacity-0" : ""}`}
      value={value}
      placeholder={defaultVal}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
      }}
      onCreateEditor={onCreateEditor}
      theme={theme}
      extensions={extensions}
      onChange={onChange}
      onBlur={onBlur}
      indentWithTab={false} // I take care of this in getExtensions
      tabIndex="0" // need this for tabbingLogic to work
    />
  );
}
